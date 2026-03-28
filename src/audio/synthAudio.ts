import type { GameEvent } from '../types'

export class SynthAudio {
  private context: AudioContext | null = null
  private ambienceTimer: number | null = null
  private enabled = false

  private getContext(): AudioContext {
    if (!this.context) {
      this.context = new AudioContext()
    }
    return this.context
  }

  public async unlock(): Promise<void> {
    const context = this.getContext()
    if (context.state !== 'running') {
      await context.resume()
    }
    this.enabled = true
  }

  private playTone(frequency: number, duration: number, type: OscillatorType, gainValue: number, when = 0): void {
    if (!this.enabled) {
      return
    }
    const context = this.getContext()
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.type = type
    oscillator.frequency.setValueAtTime(frequency, context.currentTime + when)
    gain.gain.setValueAtTime(0.0001, context.currentTime + when)
    gain.gain.exponentialRampToValueAtTime(gainValue, context.currentTime + when + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + when + duration)
    oscillator.connect(gain)
    gain.connect(context.destination)
    oscillator.start(context.currentTime + when)
    oscillator.stop(context.currentTime + when + duration + 0.02)
  }

  public setAmbience(active: boolean): void {
    if (!this.enabled) {
      return
    }
    if (!active && this.ambienceTimer !== null) {
      window.clearInterval(this.ambienceTimer)
      this.ambienceTimer = null
      return
    }
    if (active && this.ambienceTimer === null) {
      this.ambienceTimer = window.setInterval(() => {
        this.playTone(220, 0.12, 'square', 0.018)
        this.playTone(330, 0.08, 'square', 0.012, 0.12)
      }, 320)
    }
  }

  public playEvent(event: GameEvent): void {
    switch (event.type) {
      case 'start':
        this.playTone(392, 0.08, 'square', 0.03)
        this.playTone(523, 0.14, 'square', 0.025, 0.08)
        break
      case 'pellet':
        this.playTone(660, 0.05, 'square', 0.015)
        break
      case 'power':
        this.playTone(330, 0.08, 'sawtooth', 0.025)
        this.playTone(523, 0.18, 'square', 0.02, 0.08)
        break
      case 'eat-ghost':
        this.playTone(880, 0.08, 'triangle', 0.03)
        this.playTone(1175, 0.1, 'triangle', 0.025, 0.08)
        break
      case 'lose-life':
        this.playTone(220, 0.12, 'sawtooth', 0.028)
        this.playTone(160, 0.24, 'sawtooth', 0.025, 0.12)
        break
      case 'gameover':
        this.playTone(220, 0.14, 'sawtooth', 0.03)
        this.playTone(165, 0.24, 'sawtooth', 0.024, 0.12)
        this.playTone(110, 0.36, 'triangle', 0.02, 0.32)
        break
      case 'win':
        this.playTone(523, 0.08, 'square', 0.03)
        this.playTone(659, 0.08, 'square', 0.03, 0.08)
        this.playTone(784, 0.16, 'square', 0.025, 0.16)
        break
    }
  }
}
