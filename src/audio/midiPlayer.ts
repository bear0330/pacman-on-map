interface TempoPoint {
  tick: number
  microsecondsPerQuarter: number
}

interface NoteEvent {
  note: number
  velocity: number
  startTick: number
  endTick: number
  channel: number
  program: number
}

interface ParsedMidi {
  notes: NoteEvent[]
  tempos: TempoPoint[]
  ticksPerQuarter: number
  durationSeconds: number
}

interface ScheduledNode {
  stop: () => void
}

function readVariableLength(data: Uint8Array, start: number): { value: number; nextOffset: number } {
  let value = 0
  let offset = start
  while (offset < data.length) {
    const byte = data[offset]
    value = (value << 7) | (byte & 0x7f)
    offset += 1
    if ((byte & 0x80) === 0) {
      break
    }
  }
  return { value, nextOffset: offset }
}

function midiToFrequency(note: number): number {
  return 440 * (2 ** ((note - 69) / 12))
}

function createNoiseBuffer(context: AudioContext): AudioBuffer {
  const buffer = context.createBuffer(1, Math.max(1, context.sampleRate * 0.18), context.sampleRate)
  const channel = buffer.getChannelData(0)
  for (let index = 0; index < channel.length; index += 1) {
    channel[index] = (Math.random() * 2) - 1
  }
  return buffer
}

export class MidiPlayer {
  private context: AudioContext | null = null
  private output: GainNode | null = null
  private readonly scheduled = new Set<ScheduledNode>()
  private readonly cache = new Map<string, ParsedMidi>()
  private noiseBuffer: AudioBuffer | null = null

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
      this.output = this.context.createGain()
      this.output.gain.value = 0.72
      this.output.connect(this.context.destination)
    }
    return this.context
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

  public async preload(url: string): Promise<void> {
    await this.load(url)
  }

  public async play(url: string): Promise<void> {
    const context = this.ensureContext()
    if (!context || !this.output) {
      return
    }
    const midi = await this.load(url)
    this.stop()
    const startTime = context.currentTime + 0.02

    for (const note of midi.notes) {
      const noteStart = startTime + this.tickToSeconds(note.startTick, midi.tempos, midi.ticksPerQuarter)
      const noteEnd = startTime + this.tickToSeconds(note.endTick, midi.tempos, midi.ticksPerQuarter)
      const duration = Math.max(0.03, noteEnd - noteStart)
      const handle = note.channel === 9
        ? this.schedulePercussion(noteStart, duration, note.note, note.velocity)
        : this.scheduleTone(noteStart, duration, note.note, note.velocity, note.program, note.channel)
      if (handle) {
        this.scheduled.add(handle)
      }
    }

    window.setTimeout(() => {
      this.stop()
    }, Math.ceil((midi.durationSeconds + 0.2) * 1000))
  }

  public stop(): void {
    for (const handle of this.scheduled) {
      handle.stop()
    }
    this.scheduled.clear()
  }

  public close(): void {
    this.stop()
    if (this.context) {
      void this.context.close()
      this.context = null
      this.output = null
      this.noiseBuffer = null
    }
  }

  private async load(url: string): Promise<ParsedMidi> {
    const cached = this.cache.get(url)
    if (cached) {
      return cached
    }
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`Failed to load MIDI: ${url}`)
    }
    const midi = this.parse(await response.arrayBuffer())
    this.cache.set(url, midi)
    return midi
  }

  private parse(buffer: ArrayBuffer): ParsedMidi {
    const bytes = new Uint8Array(buffer)
    const view = new DataView(buffer)
    const readString = (offset: number, length: number): string =>
      String.fromCharCode(...bytes.slice(offset, offset + length))

    if (readString(0, 4) !== 'MThd') {
      throw new Error('Invalid MIDI header')
    }
    const headerLength = view.getUint32(4)
    const tracks = view.getUint16(10)
    const ticksPerQuarter = view.getUint16(12)
    let offset = 8 + headerLength

    const tempos: TempoPoint[] = [{ tick: 0, microsecondsPerQuarter: 500_000 }]
    const notes: NoteEvent[] = []

    for (let trackIndex = 0; trackIndex < tracks; trackIndex += 1) {
      if (readString(offset, 4) !== 'MTrk') {
        throw new Error('Invalid MIDI track header')
      }
      const trackLength = view.getUint32(offset + 4)
      const trackEnd = offset + 8 + trackLength
      let pointer = offset + 8
      let tick = 0
      let runningStatus = 0
      const active = new Map<string, { startTick: number; velocity: number; program: number }>()
      const programs = new Array<number>(16).fill(0)

      while (pointer < trackEnd) {
        const delta = readVariableLength(bytes, pointer)
        tick += delta.value
        pointer = delta.nextOffset

        let status = bytes[pointer]
        if (status < 0x80) {
          status = runningStatus
        } else {
          pointer += 1
          runningStatus = status
        }

        if (status === 0xff) {
          const metaType = bytes[pointer]
          pointer += 1
          const metaLength = readVariableLength(bytes, pointer)
          pointer = metaLength.nextOffset
          if (metaType === 0x51 && metaLength.value === 3) {
            tempos.push({
              tick,
              microsecondsPerQuarter: (bytes[pointer] << 16) | (bytes[pointer + 1] << 8) | bytes[pointer + 2],
            })
          }
          pointer += metaLength.value
          continue
        }

        if (status === 0xf0 || status === 0xf7) {
          const sysExLength = readVariableLength(bytes, pointer)
          pointer = sysExLength.nextOffset + sysExLength.value
          continue
        }

        const eventType = status >> 4
        const channel = status & 0x0f

        if (eventType === 0x8 || eventType === 0x9) {
          const note = bytes[pointer]
          const velocity = bytes[pointer + 1]
          pointer += 2
          const key = `${trackIndex}:${channel}:${note}`
          if (eventType === 0x9 && velocity > 0) {
            active.set(key, { startTick: tick, velocity, program: programs[channel] })
          } else {
            const started = active.get(key)
            if (started) {
              notes.push({
                note,
                velocity: started.velocity,
                startTick: started.startTick,
                endTick: tick,
                channel,
                program: started.program,
              })
              active.delete(key)
            }
          }
          continue
        }

        if (eventType === 0xc) {
          programs[channel] = bytes[pointer]
          pointer += 1
          continue
        }

        pointer += eventType === 0xd ? 1 : 2
      }

      offset = trackEnd
    }

    tempos.sort((a, b) => a.tick - b.tick)
    const durationTicks = notes.reduce((max, note) => Math.max(max, note.endTick), 0)
    return {
      notes,
      tempos,
      ticksPerQuarter,
      durationSeconds: this.tickToSeconds(durationTicks, tempos, ticksPerQuarter),
    }
  }

  private tickToSeconds(tick: number, tempos: TempoPoint[], ticksPerQuarter: number): number {
    let seconds = 0
    let previousTick = tempos[0]?.tick ?? 0
    let tempo = tempos[0]?.microsecondsPerQuarter ?? 500_000

    for (let index = 1; index < tempos.length; index += 1) {
      const point = tempos[index]
      if (point.tick >= tick) {
        break
      }
      seconds += ((point.tick - previousTick) * tempo) / ticksPerQuarter / 1_000_000
      previousTick = point.tick
      tempo = point.microsecondsPerQuarter
    }

    seconds += ((tick - previousTick) * tempo) / ticksPerQuarter / 1_000_000
    return seconds
  }

  private scheduleTone(
    when: number,
    duration: number,
    noteNumber: number,
    velocity: number,
    program: number,
    channel: number,
  ): ScheduledNode | null {
    const context = this.ensureContext()
    if (!context || !this.output) {
      return null
    }
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    const vibrato = context.createOscillator()
    const vibratoGain = context.createGain()

    const frequency = midiToFrequency(noteNumber)
    const normalizedVelocity = Math.max(0.12, velocity / 127)
    const family = program % 8

    if (channel === 1 || family === 4) {
      oscillator.type = 'triangle'
    } else if (family === 6 || family === 7) {
      oscillator.type = 'sawtooth'
    } else {
      oscillator.type = 'square'
    }

    oscillator.frequency.setValueAtTime(frequency, when)
    oscillator.detune.setValueAtTime(channel === 1 ? 4 : 0, when)
    vibrato.type = 'sine'
    vibrato.frequency.value = 5.2
    vibratoGain.gain.value = family === 4 ? 8 : 3.5
    vibrato.connect(vibratoGain)
    vibratoGain.connect(oscillator.frequency)

    const attack = 0.01
    const release = Math.min(0.08, duration * 0.35)
    const peak = 0.032 * normalizedVelocity
    gain.gain.setValueAtTime(0.0001, when)
    gain.gain.exponentialRampToValueAtTime(peak, when + attack)
    gain.gain.setValueAtTime(peak, when + Math.max(attack, duration - release))
    gain.gain.exponentialRampToValueAtTime(0.0001, when + duration)

    oscillator.connect(gain)
    gain.connect(this.output)
    oscillator.start(when)
    vibrato.start(when)
    oscillator.stop(when + duration + 0.03)
    vibrato.stop(when + duration + 0.03)

    return {
      stop: () => {
        try {
          oscillator.stop()
        } catch {}
        try {
          vibrato.stop()
        } catch {}
        ;[oscillator, gain, vibrato, vibratoGain].forEach((node) => {
          try {
            node.disconnect()
          } catch {}
        })
      },
    }
  }

  private schedulePercussion(when: number, duration: number, noteNumber: number, velocity: number): ScheduledNode | null {
    const context = this.ensureContext()
    if (!context || !this.output) {
      return null
    }
    if (!this.noiseBuffer) {
      this.noiseBuffer = createNoiseBuffer(context)
    }
    const source = context.createBufferSource()
    source.buffer = this.noiseBuffer
    const filter = context.createBiquadFilter()
    const gain = context.createGain()

    filter.type = noteNumber < 40 ? 'lowpass' : 'bandpass'
    filter.frequency.value = noteNumber < 40 ? 260 : 1600
    gain.gain.setValueAtTime(0.02 + (velocity / 127) * 0.025, when)
    gain.gain.exponentialRampToValueAtTime(0.0001, when + Math.max(0.04, duration))

    source.connect(filter)
    filter.connect(gain)
    gain.connect(this.output)
    source.start(when)
    source.stop(when + Math.max(0.05, duration))

    return {
      stop: () => {
        try {
          source.stop()
        } catch {}
        ;[source, filter, gain].forEach((node) => {
          try {
            node.disconnect()
          } catch {}
        })
      },
    }
  }
}
