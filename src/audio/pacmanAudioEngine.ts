type AudioHandle = {
  stop: () => void
}

type TrackBuilder = (engine: PacManAudioEngine) => AudioHandle[]

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export class PacManAudioEngine {
  private context: AudioContext | null = null
  private masterGain: GainNode | null = null
  private channels: Array<AudioHandle[] | null> = [null, null, null, null, null]
  private ambientHandles: AudioHandle[] | null = null
  private wsgWave: PeriodicWave | null = null
  private readonly tracks: Record<string, TrackBuilder>
  private readonly ambientTracks: Record<string, TrackBuilder>

  public constructor() {
    this.tracks = {
      'eating-dot-1': (engine) => engine.playSweep(246, 286, 0.065, 0.048, 'square'),
      'eating-dot-2': (engine) => engine.playSweep(286, 246, 0.065, 0.048, 'square'),
      'eating-dot-double': (engine) => engine.playSweep(305, 348, 0.075, 0.045, 'square'),
      'eating-ghost': (engine) => engine.playSweep(190, 1480, 0.34, 0.08, 'wsg', true),
      fruit: (engine) => [
        ...engine.playSweep(540, 1180, 0.11, 0.065, 'wsg', true),
        ...engine.playSweep(760, 1440, 0.14, 0.05, 'triangle', true, 0.11),
      ],
      death: (engine) => engine.playDeath(1),
      'death-double': (engine) => engine.playDeath(2),
      'extra-life': (engine) => engine.playSequence([
        { frequency: 660, duration: 0.06, gain: 0.055, type: 'triangle' },
        { frequency: 990, duration: 0.06, gain: 0.05, type: 'triangle' },
        { frequency: 1320, duration: 0.16, gain: 0.045, type: 'triangle' },
      ]),
      'start-music': (engine) => engine.playSequence([
        { frequency: 494, duration: 0.1, gain: 0.05, type: 'wsg' },
        { frequency: 740, duration: 0.1, gain: 0.05, type: 'wsg' },
        { frequency: 988, duration: 0.16, gain: 0.045, type: 'wsg' },
        { frequency: 659, duration: 0.1, gain: 0.05, type: 'wsg' },
        { frequency: 880, duration: 0.12, gain: 0.045, type: 'wsg' },
        { frequency: 1175, duration: 0.2, gain: 0.04, type: 'wsg' },
      ]),
      'start-music-double': (engine) => [
        ...engine.playSequence([
          { frequency: 494, duration: 0.1, gain: 0.045, type: 'wsg' },
          { frequency: 740, duration: 0.1, gain: 0.045, type: 'wsg' },
          { frequency: 988, duration: 0.16, gain: 0.04, type: 'wsg' },
          { frequency: 659, duration: 0.1, gain: 0.045, type: 'wsg' },
          { frequency: 880, duration: 0.12, gain: 0.04, type: 'wsg' },
          { frequency: 1175, duration: 0.2, gain: 0.038, type: 'wsg' },
        ]),
        ...engine.playSequence([
          { frequency: 740, duration: 0.1, gain: 0.03, type: 'triangle' },
          { frequency: 988, duration: 0.1, gain: 0.03, type: 'triangle' },
          { frequency: 1480, duration: 0.16, gain: 0.028, type: 'triangle' },
          { frequency: 880, duration: 0.1, gain: 0.03, type: 'triangle' },
          { frequency: 1175, duration: 0.12, gain: 0.028, type: 'triangle' },
          { frequency: 1760, duration: 0.2, gain: 0.026, type: 'triangle' },
        ]),
      ],
      'map-theme': (engine) => engine.playSequence([
        { frequency: 392, duration: 0.22, gain: 0.032, type: 'wsg' },
        { frequency: 494, duration: 0.22, gain: 0.03, type: 'wsg' },
        { frequency: 587, duration: 0.22, gain: 0.028, type: 'wsg' },
        { frequency: 784, duration: 0.32, gain: 0.026, type: 'wsg' },
        { frequency: 659, duration: 0.2, gain: 0.028, type: 'triangle' },
        { frequency: 587, duration: 0.2, gain: 0.026, type: 'triangle' },
        { frequency: 494, duration: 0.2, gain: 0.024, type: 'triangle' },
        { frequency: 523, duration: 0.3, gain: 0.024, type: 'wsg' },
        { frequency: 392, duration: 0.22, gain: 0.03, type: 'wsg' },
        { frequency: 494, duration: 0.22, gain: 0.028, type: 'wsg' },
        { frequency: 659, duration: 0.22, gain: 0.026, type: 'wsg' },
        { frequency: 587, duration: 0.36, gain: 0.024, type: 'wsg' },
      ]),
    }

    this.ambientTracks = {
      'ambient-1': (engine) => engine.makeSiren(280, 0.8, 40, 0.028),
      'ambient-2': (engine) => engine.makeSiren(315, 1.0, 48, 0.03),
      'ambient-3': (engine) => engine.makeSiren(350, 1.25, 56, 0.032),
      'ambient-4': (engine) => engine.makeSiren(390, 1.55, 66, 0.034),
      'ambient-fright': (engine) => engine.makeFright(),
      'ambient-eyes': (engine) => engine.makeEyes(),
      cutscene: (engine) => engine.makeCutscene(),
    }
  }

  public async resume(): Promise<void> {
    const context = this.ensureContext()
    if (!context) {
      return
    }
    if (context.state !== 'running') {
      await context.resume()
    }
  }

  public playTrack(name: string, channel = 0): void {
    const context = this.ensureContext()
    if (!context) {
      return
    }
    if (channel >= 0 && channel < this.channels.length) {
      this.stopChannel(channel)
    }
    const builder = this.tracks[name]
    if (!builder) {
      return
    }
    const handles = builder(this)
    if (channel >= 0 && channel < this.channels.length) {
      this.channels[channel] = handles
    }
  }

  public stopChannel(channel: number): void {
    if (channel < 0 || channel >= this.channels.length) {
      return
    }
    const handles = this.channels[channel]
    if (!handles) {
      return
    }
    handles.forEach((handle) => handle.stop())
    this.channels[channel] = null
  }

  public playAmbientTrack(name: string): void {
    this.stopAmbientTrack()
    const context = this.ensureContext()
    if (!context) {
      return
    }
    const builder = this.ambientTracks[name]
    if (!builder) {
      return
    }
    this.ambientHandles = builder(this)
  }

  public stopAmbientTrack(): void {
    if (!this.ambientHandles) {
      return
    }
    this.ambientHandles.forEach((handle) => handle.stop())
    this.ambientHandles = null
  }

  public close(): void {
    this.channels.forEach((_, index) => this.stopChannel(index))
    this.stopAmbientTrack()
    if (this.context) {
      void this.context.close()
      this.context = null
      this.masterGain = null
      this.wsgWave = null
    }
  }

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') {
      return null
    }
    const AudioContextCtor = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioContextCtor) {
      return null
    }
    if (!this.context) {
      this.context = new AudioContextCtor()
      this.masterGain = this.context.createGain()
      this.masterGain.gain.value = 0.75
      this.masterGain.connect(this.context.destination)
    }
    return this.context
  }

  private getOutputNode(): AudioNode | null {
    this.ensureContext()
    return this.masterGain
  }

  private getWsgWave(): PeriodicWave | null {
    const context = this.ensureContext()
    if (!context) {
      return null
    }
    if (!this.wsgWave) {
      const real = new Float32Array(8)
      const imag = new Float32Array(8)
      imag[1] = 1
      imag[3] = 0.18
      imag[5] = 0.07
      imag[7] = 0.03
      this.wsgWave = context.createPeriodicWave(real, imag)
    }
    return this.wsgWave
  }

  private makeOscillator(type: OscillatorType | 'wsg'): OscillatorNode | null {
    const context = this.ensureContext()
    if (!context) {
      return null
    }
    const oscillator = context.createOscillator()
    if (type === 'wsg') {
      const wave = this.getWsgWave()
      if (wave) {
        oscillator.setPeriodicWave(wave)
      } else {
        oscillator.type = 'triangle'
      }
    } else {
      oscillator.type = type
    }
    return oscillator
  }

  private createHandle(nodes: AudioNode[], stopAt?: number): AudioHandle {
    const context = this.context
    return {
      stop: () => {
        for (const node of nodes) {
          if ('stop' in node) {
            try {
              (node as OscillatorNode).stop(stopAt ?? context?.currentTime ?? 0)
            } catch {
              // node already stopped
            }
          }
          try {
            node.disconnect()
          } catch {
            // already disconnected
          }
        }
      },
    }
  }

  private playSweep(
    from: number,
    to: number,
    duration: number,
    gainValue: number,
    type: OscillatorType | 'wsg',
    exponential = false,
    when = 0,
  ): AudioHandle[] {
    const context = this.ensureContext()
    const output = this.getOutputNode()
    const oscillator = this.makeOscillator(type)
    if (!context || !output || !oscillator) {
      return []
    }
    const gain = context.createGain()
    const startTime = context.currentTime + when
    oscillator.connect(gain)
    gain.connect(output)
    oscillator.frequency.setValueAtTime(from, startTime)
    if (exponential) {
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, to), startTime + duration)
    } else {
      oscillator.frequency.linearRampToValueAtTime(to, startTime + duration)
    }
    gain.gain.setValueAtTime(0.0001, startTime)
    gain.gain.exponentialRampToValueAtTime(gainValue, startTime + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration)
    oscillator.start(startTime)
    oscillator.stop(startTime + duration + 0.03)
    return [this.createHandle([oscillator, gain], startTime + duration + 0.03)]
  }

  private playSequence(notes: Array<{ frequency: number; duration: number; gain: number; type: OscillatorType | 'wsg' }>): AudioHandle[] {
    const handles: AudioHandle[] = []
    let offset = 0
    for (const note of notes) {
      handles.push(...this.playSweep(note.frequency, note.frequency, note.duration, note.gain, note.type, false, offset))
      offset += note.duration
    }
    return handles
  }

  private playDeath(voices: number): AudioHandle[] {
    const context = this.ensureContext()
    const output = this.getOutputNode()
    if (!context || !output) {
      return []
    }
    const handles: AudioHandle[] = []

    for (let index = 0; index < voices; index += 1) {
      const oscillator = this.makeOscillator(index === 0 ? 'wsg' : 'triangle')
      if (!oscillator) {
        continue
      }
      const gain = context.createGain()
      const vibrato = context.createOscillator()
      const vibratoGain = context.createGain()
      const startTime = context.currentTime

      oscillator.detune.value = index * 10
      oscillator.connect(gain)
      gain.connect(output)
      vibrato.connect(vibratoGain)
      vibratoGain.connect(oscillator.frequency)

      oscillator.frequency.setValueAtTime(820, startTime)
      oscillator.frequency.exponentialRampToValueAtTime(430, startTime + 0.5)
      oscillator.frequency.exponentialRampToValueAtTime(180, startTime + 1.05)
      oscillator.frequency.exponentialRampToValueAtTime(52, startTime + 1.62)

      vibrato.type = 'sine'
      vibrato.frequency.setValueAtTime(7.5, startTime)
      vibrato.frequency.linearRampToValueAtTime(5.5, startTime + 1.62)
      vibratoGain.gain.setValueAtTime(12, startTime)
      vibratoGain.gain.linearRampToValueAtTime(30, startTime + 1.62)

      gain.gain.setValueAtTime(0.0001, startTime)
      gain.gain.exponentialRampToValueAtTime(0.08 - index * 0.015, startTime + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 1.62)

      oscillator.start(startTime)
      vibrato.start(startTime)
      oscillator.stop(startTime + 1.68)
      vibrato.stop(startTime + 1.68)

      handles.push(this.createHandle([oscillator, gain, vibrato, vibratoGain], startTime + 1.68))
    }

    return handles
  }

  private makeSiren(center: number, rate: number, depth: number, gainValue: number): AudioHandle[] {
    const context = this.ensureContext()
    const output = this.getOutputNode()
    if (!context || !output) {
      return []
    }
    const oscillator = context.createOscillator()
    const lfo = context.createOscillator()
    const lfoGain = context.createGain()
    const gain = context.createGain()

    oscillator.type = 'triangle'
    oscillator.frequency.value = center
    lfo.type = 'triangle'
    lfo.frequency.value = rate
    lfoGain.gain.value = depth
    gain.gain.value = gainValue

    lfo.connect(lfoGain)
    lfoGain.connect(oscillator.frequency)
    oscillator.connect(gain)
    gain.connect(output)

    oscillator.start()
    lfo.start()

    return [this.createHandle([oscillator, lfo, lfoGain, gain])]
  }

  private makeFright(): AudioHandle[] {
    const context = this.ensureContext()
    const output = this.getOutputNode()
    if (!context || !output) {
      return []
    }
    const oscillator = context.createOscillator()
    const lfo = context.createOscillator()
    const lfoGain = context.createGain()
    const gain = context.createGain()

    oscillator.type = 'sawtooth'
    oscillator.frequency.value = 122
    lfo.type = 'sine'
    lfo.frequency.value = 7.2
    lfoGain.gain.value = 18
    gain.gain.value = 0.03

    lfo.connect(lfoGain)
    lfoGain.connect(oscillator.frequency)
    oscillator.connect(gain)
    gain.connect(output)

    oscillator.start()
    lfo.start()

    return [this.createHandle([oscillator, lfo, lfoGain, gain])]
  }

  private makeEyes(): AudioHandle[] {
    const context = this.ensureContext()
    const output = this.getOutputNode()
    if (!context || !output) {
      return []
    }
    const oscillator = context.createOscillator()
    const lfo = context.createOscillator()
    const lfoGain = context.createGain()
    const gain = context.createGain()

    oscillator.type = 'square'
    oscillator.frequency.value = 560
    lfo.type = 'square'
    lfo.frequency.value = 16
    lfoGain.gain.value = 0.04
    gain.gain.value = 0.01

    lfo.connect(lfoGain)
    lfoGain.connect(gain.gain)
    oscillator.connect(gain)
    gain.connect(output)

    oscillator.start()
    lfo.start()

    return [this.createHandle([oscillator, lfo, lfoGain, gain])]
  }

  private makeCutscene(): AudioHandle[] {
    const context = this.ensureContext()
    const output = this.getOutputNode()
    const oscillator = this.makeOscillator('wsg')
    if (!context || !output || !oscillator) {
      return []
    }
    const gain = context.createGain()
    const lfo = context.createOscillator()
    const lfoGain = context.createGain()
    const notes = [440, 523, 659, 784]
    let noteIndex = 0

    oscillator.frequency.value = notes[0]
    gain.gain.value = 0.024
    lfo.type = 'sine'
    lfo.frequency.value = 4
    lfoGain.gain.value = 18

    lfo.connect(lfoGain)
    lfoGain.connect(oscillator.frequency)
    oscillator.connect(gain)
    gain.connect(output)

    oscillator.start()
    lfo.start()

    const timer = window.setInterval(() => {
      noteIndex = (noteIndex + 1) % notes.length
      oscillator.frequency.setTargetAtTime(notes[noteIndex], context.currentTime, 0.03)
      gain.gain.value = clamp(gain.gain.value + 0.0015, 0.02, 0.03)
    }, 220)

    return [{
      stop: () => {
        window.clearInterval(timer)
        try {
          oscillator.stop()
        } catch {
          // ignore
        }
        try {
          lfo.stop()
        } catch {
          // ignore
        }
        ;[oscillator, lfo, lfoGain, gain].forEach((node) => {
          try {
            node.disconnect()
          } catch {
            // ignore
          }
        })
      },
    }]
  }
}
