import type { GameEvent } from '../types'
import { PacManAudioEngine } from './pacmanAudioEngine'

export class SynthAudio {
  private readonly engine = new PacManAudioEngine()
  private enabled = false
  private pelletToggle = false
  private musicLoopTimer: number | null = null

  public async unlock(): Promise<void> {
    await this.engine.resume()
    this.enabled = true
  }

  public close(): void {
    this.stopMusicLoop()
    this.engine.close()
    this.enabled = false
  }

  public setAmbience(active: boolean): void {
    if (!this.enabled) {
      return
    }
    if (!active) {
      this.stopMusicLoop()
      this.engine.stopAmbientTrack()
      this.engine.stopChannel(4)
      return
    }
    this.engine.playAmbientTrack('ambient-1')
    this.startMusicLoop()
  }

  public playEvent(event: GameEvent): void {
    if (!this.enabled) {
      return
    }
    switch (event.type) {
      case 'start':
        this.engine.playTrack('start-music', 0)
        break
      case 'pellet':
        this.engine.playTrack(this.pelletToggle ? 'eating-dot-2' : 'eating-dot-1', 0)
        this.pelletToggle = !this.pelletToggle
        break
      case 'power':
        this.engine.playTrack('fruit', 1)
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

  private startMusicLoop(): void {
    if (this.musicLoopTimer !== null) {
      return
    }
    this.engine.playTrack('map-theme', 4)
    this.musicLoopTimer = window.setInterval(() => {
      this.engine.playTrack('map-theme', 4)
    }, 3400)
  }

  private stopMusicLoop(): void {
    if (this.musicLoopTimer !== null) {
      window.clearInterval(this.musicLoopTimer)
      this.musicLoopTimer = null
    }
  }
}
