import type { GameEvent } from '../types'
import { PacManAudioEngine } from './pacmanAudioEngine'
import { MidiPlayer } from './midiPlayer'

const LEVEL_INTRO_MIDI_URL = `${import.meta.env.BASE_URL}level-intro.mid`

export class SynthAudio {
  private readonly engine = new PacManAudioEngine()
  private readonly midiPlayer = new MidiPlayer()
  private enabled = false
  private pelletToggle = false

  public async unlock(): Promise<void> {
    await this.engine.resume()
    await this.midiPlayer.resume()
    void this.midiPlayer.preload(LEVEL_INTRO_MIDI_URL)
    this.enabled = true
  }

  public close(): void {
    this.engine.close()
    this.midiPlayer.close()
    this.enabled = false
  }

  public setAmbience(active: boolean): void {
    if (!this.enabled) {
      return
    }
    if (!active) {
      this.midiPlayer.stop()
      this.engine.stopAmbientTrack()
      this.engine.stopChannel(4)
      return
    }
    this.engine.playAmbientTrack('ambient-1')
  }

  public playEvent(event: GameEvent): void {
    if (!this.enabled) {
      return
    }
    switch (event.type) {
      case 'start':
        void this.midiPlayer.play(LEVEL_INTRO_MIDI_URL).catch(() => {
          this.engine.playTrack('start-music-double', 0)
        })
        break
      case 'pellet':
        this.engine.playTrack(this.pelletToggle ? 'eating-dot-2' : 'eating-dot-1', 0)
        this.pelletToggle = !this.pelletToggle
        break
      case 'power':
        this.engine.playTrack('extra-life', 1)
        break
      case 'fruit':
        this.engine.playTrack('fruit', 1)
        break
      case 'extra-life':
        this.engine.playTrack('extra-life', 1)
        break
      case 'eat-ghost':
        this.engine.playTrack('eating-ghost', 2)
        break
      case 'lose-life':
        this.engine.playTrack('death', 3)
        break
      case 'gameover':
        this.engine.playTrack('death-double', 3)
        break
      case 'win':
        this.engine.playTrack('start-music-double', 4)
        break
    }
  }
}
