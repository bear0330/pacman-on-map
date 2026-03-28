import type { GameEngine } from '../game/gameEngine'
import type { BonusFruit, Direction, GeoPoint, PlayableMap, ScreenPoint, VisualEffect } from '../types'

const PACMAN_GLOW_RADIUS = 30
const PACMAN_BODY_RADIUS = 20
const GHOST_HEAD_RADIUS = 16
const GHOST_BODY_HEIGHT = 18

interface LayerCache {
  canvas: HTMLCanvasElement
  context: CanvasRenderingContext2D
  key: string
}

function directionAngle(direction: Direction): number {
  switch (direction) {
    case 'right':
      return 0
    case 'down':
      return Math.PI / 2
    case 'left':
      return Math.PI
    case 'up':
      return -Math.PI / 2
  }
}

function createLayerCanvas(): LayerCache {
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('2D context is not available')
  }
  return { canvas, context, key: '' }
}

export class CanvasRenderer {
  private readonly canvas: HTMLCanvasElement
  private readonly context: CanvasRenderingContext2D
  private readonly roadLayer = createLayerCanvas()
  private readonly pelletLayer = createLayerCanvas()

  public constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    const context = canvas.getContext('2d')
    if (!context) {
      throw new Error('2D context is not available')
    }
    this.context = context
  }

  private resize(): { ratio: number; width: number; height: number } {
    const ratio = window.devicePixelRatio || 1
    const width = this.canvas.clientWidth
    const height = this.canvas.clientHeight
    if (this.canvas.width !== Math.round(width * ratio) || this.canvas.height !== Math.round(height * ratio)) {
      this.canvas.width = Math.round(width * ratio)
      this.canvas.height = Math.round(height * ratio)
    }
    this.context.setTransform(ratio, 0, 0, ratio, 0, 0)
    return { ratio, width, height }
  }

  private prepareLayer(layer: LayerCache, ratio: number, width: number, height: number): void {
    const targetWidth = Math.round(width * ratio)
    const targetHeight = Math.round(height * ratio)
    if (layer.canvas.width !== targetWidth || layer.canvas.height !== targetHeight) {
      layer.canvas.width = targetWidth
      layer.canvas.height = targetHeight
    }
    layer.context.setTransform(ratio, 0, 0, ratio, 0, 0)
    layer.context.clearRect(0, 0, width, height)
  }

  private projectionKey(map: PlayableMap, project: (point: GeoPoint) => ScreenPoint, width: number, height: number): string {
    const center = project(map.center)
    const northwest = project({ lng: map.bounds.west, lat: map.bounds.north })
    const southeast = project({ lng: map.bounds.east, lat: map.bounds.south })
    return [
      map.center.lng.toFixed(6),
      map.center.lat.toFixed(6),
      map.bounds.west.toFixed(6),
      map.bounds.east.toFixed(6),
      map.bounds.south.toFixed(6),
      map.bounds.north.toFixed(6),
      width,
      height,
      center.x.toFixed(2),
      center.y.toFixed(2),
      northwest.x.toFixed(2),
      northwest.y.toFixed(2),
      southeast.x.toFixed(2),
      southeast.y.toFixed(2),
    ].join(':')
  }

  private ensureRoadLayer(
    map: PlayableMap,
    project: (point: GeoPoint) => ScreenPoint,
    ratio: number,
    width: number,
    height: number,
  ): void {
    const key = `roads:${map.nodes.length}:${map.edges.length}:${this.projectionKey(map, project, width, height)}`
    if (this.roadLayer.key === key) {
      return
    }
    this.roadLayer.key = key
    this.prepareLayer(this.roadLayer, ratio, width, height)
    this.drawRoads(this.roadLayer.context, map, project, width, height)
  }

  private ensurePelletLayer(
    map: PlayableMap,
    pellets: GeoPoint[],
    project: (point: GeoPoint) => ScreenPoint,
    ratio: number,
    width: number,
    height: number,
  ): void {
    const key = `pellets:${pellets.length}:${this.projectionKey(map, project, width, height)}`
    if (this.pelletLayer.key === key) {
      return
    }
    this.pelletLayer.key = key
    this.prepareLayer(this.pelletLayer, ratio, width, height)
    this.drawPellets(this.pelletLayer.context, pellets, project, '#ffe66d', 3)
  }

  public renderPreview(map: PlayableMap, project: (point: GeoPoint) => ScreenPoint): void {
    const { ratio, width, height } = this.resize()
    this.ensureRoadLayer(map, project, ratio, width, height)
    this.ensurePelletLayer(map, map.pellets, project, ratio, width, height)
    this.context.clearRect(0, 0, width, height)
    this.context.drawImage(this.roadLayer.canvas, 0, 0, width, height)
    this.context.drawImage(this.pelletLayer.canvas, 0, 0, width, height)
    this.drawPowerPellets(map.powerPellets, project)
    this.drawSpawn(map, project)
  }

  public renderGame(engine: GameEngine, project: (point: GeoPoint) => ScreenPoint): void {
    const { ratio, width, height } = this.resize()
    const pellets = engine.getPellets()
    this.ensureRoadLayer(engine.map, project, ratio, width, height)
    this.ensurePelletLayer(engine.map, pellets.pellets, project, ratio, width, height)
    this.context.clearRect(0, 0, width, height)
    this.context.drawImage(this.roadLayer.canvas, 0, 0, width, height)
    this.context.drawImage(this.pelletLayer.canvas, 0, 0, width, height)
    this.drawPowerPellets(pellets.powerPellets, project)
    this.drawBonusFruit(engine.getBonusFruit(), project)
    if (engine.state.status !== 'dying') {
      this.drawPacman(engine.state.pacman.position, engine.state.pacman.pendingDirection, project)
    }
    for (const ghost of engine.state.ghosts) {
      this.drawGhost(
        ghost.position,
        ghost.direction,
        ghost.mode === 'frightened' ? '#6a4c93' : ghost.color,
        ghost.mode,
        project,
      )
    }
    this.drawVisualEffects(engine.state.visualEffects, project)
    this.drawFloatingScores(engine.state.floatingScores, project)
  }

  private drawRoads(
    context: CanvasRenderingContext2D,
    map: PlayableMap,
    project: (point: GeoPoint) => ScreenPoint,
    width: number,
    height: number,
  ): void {
    context.fillStyle = 'rgba(6, 15, 39, 0.12)'
    context.fillRect(0, 0, width, height)

    context.lineCap = 'round'
    context.lineJoin = 'round'
    const nodeMap = new Map(map.nodes.map((node) => [node.id, node]))

    for (const edge of map.edges) {
      if (edge.kind === 'portal') {
        continue
      }
      const from = nodeMap.get(edge.from)
      const to = nodeMap.get(edge.to)
      if (!from || !to) {
        continue
      }
      const start = project(from)
      const end = project(to)

      context.strokeStyle = edge.synthetic ? 'rgba(72, 202, 228, 0.55)' : 'rgba(7, 12, 20, 0.35)'
      context.lineWidth = edge.synthetic ? 13 : 16
      context.beginPath()
      context.moveTo(start.x, start.y)
      context.lineTo(end.x, end.y)
      context.stroke()

      context.strokeStyle = edge.synthetic ? 'rgba(144, 224, 239, 0.95)' : 'rgba(67, 97, 238, 0.98)'
      context.lineWidth = edge.synthetic ? 7 : 9
      context.beginPath()
      context.moveTo(start.x, start.y)
      context.lineTo(end.x, end.y)
      context.stroke()
    }
  }

  private drawPellets(
    context: CanvasRenderingContext2D,
    points: GeoPoint[],
    project: (point: GeoPoint) => ScreenPoint,
    color: string,
    radius: number,
  ): void {
    context.fillStyle = color
    context.shadowColor = color
    context.shadowBlur = radius * 2.5
    for (const point of points) {
      const screen = project(point)
      context.beginPath()
      context.arc(screen.x, screen.y, radius, 0, Math.PI * 2)
      context.fill()
    }
    context.shadowBlur = 0
  }

  private drawSpawn(map: PlayableMap, project: (point: GeoPoint) => ScreenPoint): void {
    const spawn = map.nodes.find((node) => node.id === map.spawnNodeId)
    if (!spawn) {
      return
    }
    this.drawPacman(spawn, 'right', project)
  }

  private drawPacman(point: GeoPoint, direction: Direction, project: (point: GeoPoint) => ScreenPoint): void {
    const screen = project(point)
    const angle = directionAngle(direction)
    const mouth = 0.16 + ((Math.sin(performance.now() * 0.018) + 1) * 0.18)
    this.context.fillStyle = 'rgba(255, 214, 10, 0.22)'
    this.context.beginPath()
    this.context.arc(screen.x, screen.y, PACMAN_GLOW_RADIUS, 0, Math.PI * 2)
    this.context.fill()

    this.context.strokeStyle = 'rgba(255, 255, 255, 0.65)'
    this.context.lineWidth = 2
    this.context.fillStyle = '#ffd60a'
    this.context.shadowColor = '#ffd60a'
    this.context.shadowBlur = 28
    this.context.beginPath()
    this.context.moveTo(screen.x, screen.y)
    this.context.arc(screen.x, screen.y, PACMAN_BODY_RADIUS, angle + mouth, angle - mouth + Math.PI * 2)
    this.context.closePath()
    this.context.fill()
    this.context.stroke()
    this.context.shadowBlur = 0
  }

  private drawPowerPellets(points: GeoPoint[], project: (point: GeoPoint) => ScreenPoint): void {
    const pulse = 0.82 + ((Math.sin(performance.now() * 0.01) + 1) * 0.18)
    for (const point of points) {
      const screen = project(point)
      this.context.save()
      this.context.fillStyle = 'rgba(255, 255, 255, 0.24)'
      this.context.beginPath()
      this.context.arc(screen.x, screen.y, 16 * pulse, 0, Math.PI * 2)
      this.context.fill()
      this.context.fillStyle = '#ffe66d'
      this.context.shadowColor = '#fff3b0'
      this.context.shadowBlur = 24
      this.context.beginPath()
      this.context.arc(screen.x, screen.y, 8 * pulse, 0, Math.PI * 2)
      this.context.fill()
      this.context.fillStyle = '#ffffff'
      this.context.beginPath()
      this.context.arc(screen.x, screen.y, 4 * pulse, 0, Math.PI * 2)
      this.context.fill()
      this.context.restore()
    }
  }

  private drawBonusFruit(fruit: BonusFruit | null, project: (point: GeoPoint) => ScreenPoint): void {
    if (!fruit) {
      return
    }
    const screen = project(fruit)
    const bob = Math.sin(performance.now() * 0.008) * 3
    const y = screen.y + bob

    this.context.save()
    this.context.shadowColor = 'rgba(255, 255, 255, 0.4)'
    this.context.shadowBlur = 14

    if (fruit.kind === 'cherry') {
      this.context.strokeStyle = '#2d6a4f'
      this.context.lineWidth = 2
      this.context.beginPath()
      this.context.moveTo(screen.x, y - 10)
      this.context.quadraticCurveTo(screen.x - 6, y - 18, screen.x - 9, y - 7)
      this.context.moveTo(screen.x, y - 10)
      this.context.quadraticCurveTo(screen.x + 6, y - 18, screen.x + 9, y - 7)
      this.context.stroke()
      this.context.fillStyle = '#e63946'
      this.context.beginPath()
      this.context.arc(screen.x - 7, y, 7, 0, Math.PI * 2)
      this.context.arc(screen.x + 7, y, 7, 0, Math.PI * 2)
      this.context.fill()
    } else if (fruit.kind === 'strawberry') {
      this.context.fillStyle = '#ef476f'
      this.context.beginPath()
      this.context.moveTo(screen.x, y - 12)
      this.context.quadraticCurveTo(screen.x + 10, y - 5, screen.x + 7, y + 10)
      this.context.quadraticCurveTo(screen.x, y + 16, screen.x - 7, y + 10)
      this.context.quadraticCurveTo(screen.x - 10, y - 5, screen.x, y - 12)
      this.context.fill()
      this.context.fillStyle = '#90be6d'
      this.context.beginPath()
      this.context.moveTo(screen.x, y - 14)
      this.context.lineTo(screen.x + 8, y - 9)
      this.context.lineTo(screen.x, y - 6)
      this.context.lineTo(screen.x - 8, y - 9)
      this.context.closePath()
      this.context.fill()
    } else if (fruit.kind === 'orange') {
      this.context.fillStyle = '#ff9f1c'
      this.context.beginPath()
      this.context.arc(screen.x, y, 10, 0, Math.PI * 2)
      this.context.fill()
      this.context.fillStyle = '#2d6a4f'
      this.context.beginPath()
      this.context.ellipse(screen.x + 5, y - 10, 5, 3, -0.4, 0, Math.PI * 2)
      this.context.fill()
    } else {
      this.context.fillStyle = '#f94144'
      this.context.beginPath()
      this.context.arc(screen.x, y, 10, 0, Math.PI * 2)
      this.context.fill()
      this.context.fillStyle = '#90be6d'
      this.context.beginPath()
      this.context.moveTo(screen.x - 2, y - 10)
      this.context.quadraticCurveTo(screen.x, y - 16, screen.x + 2, y - 10)
      this.context.quadraticCurveTo(screen.x, y - 6, screen.x - 2, y - 10)
      this.context.fill()
    }

    this.context.restore()
  }

  private drawGhost(
    point: GeoPoint,
    direction: Direction,
    color: string,
    mode: 'chase' | 'frightened' | 'eyes',
    project: (point: GeoPoint) => ScreenPoint,
  ): void {
    const screen = project(point)
    const eyeOffset = direction === 'right' ? 2 : direction === 'left' ? -2 : 0

    if (mode === 'eyes') {
      this.context.save()
      const trailDirectionX = direction === 'right' ? -1 : direction === 'left' ? 1 : 0
      const trailDirectionY = direction === 'down' ? -1 : direction === 'up' ? 1 : 0
      this.context.shadowColor = 'rgba(140, 220, 255, 0.5)'
      this.context.shadowBlur = 12
      for (let index = 0; index < 3; index += 1) {
        const alpha = 0.16 - index * 0.04
        const offset = 8 + index * 6
        this.context.fillStyle = `rgba(126, 200, 255, ${alpha})`
        this.context.beginPath()
        this.context.arc(screen.x + trailDirectionX * offset, screen.y + trailDirectionY * offset, 6 - index, 0, Math.PI * 2)
        this.context.fill()
      }

      this.context.fillStyle = '#ffffff'
      this.context.beginPath()
      this.context.arc(screen.x - 5, screen.y - 1, 4.8, 0, Math.PI * 2)
      this.context.arc(screen.x + 5, screen.y - 1, 4.8, 0, Math.PI * 2)
      this.context.fill()

      this.context.fillStyle = '#4cc9f0'
      this.context.beginPath()
      this.context.arc(screen.x - 5 + eyeOffset * 1.6, screen.y - 1, 2.5, 0, Math.PI * 2)
      this.context.arc(screen.x + 5 + eyeOffset * 1.6, screen.y - 1, 2.5, 0, Math.PI * 2)
      this.context.fill()
      this.context.restore()
      return
    }

    this.context.shadowColor = color
    this.context.shadowBlur = 16
    this.context.fillStyle = color
    this.context.beginPath()
    this.context.arc(screen.x, screen.y - 3, GHOST_HEAD_RADIUS, Math.PI, 0)
    this.context.lineTo(screen.x + GHOST_HEAD_RADIUS, screen.y + GHOST_BODY_HEIGHT)
    this.context.lineTo(screen.x + 8, screen.y + 10)
    this.context.lineTo(screen.x, screen.y + GHOST_BODY_HEIGHT)
    this.context.lineTo(screen.x - 8, screen.y + 10)
    this.context.lineTo(screen.x - GHOST_HEAD_RADIUS, screen.y + GHOST_BODY_HEIGHT)
    this.context.closePath()
    this.context.fill()
    this.context.shadowBlur = 0

    this.context.fillStyle = '#ffffff'
    this.context.beginPath()
    this.context.arc(screen.x - 6, screen.y - 4, 4.1, 0, Math.PI * 2)
    this.context.arc(screen.x + 6, screen.y - 4, 4.1, 0, Math.PI * 2)
    this.context.fill()

    this.context.fillStyle = '#111827'
    this.context.beginPath()
    this.context.arc(screen.x - 6 + eyeOffset * 1.4, screen.y - 4, 2.1, 0, Math.PI * 2)
    this.context.arc(screen.x + 6 + eyeOffset * 1.4, screen.y - 4, 2.1, 0, Math.PI * 2)
    this.context.fill()
  }

  private drawFloatingScores(
    scores: Array<{ lng: number; lat: number; text: string; createdAt: number; expiresAt: number }>,
    project: (point: GeoPoint) => ScreenPoint,
  ): void {
    const now = performance.now()
    for (const score of scores) {
      const life = Math.max(0, Math.min(1, (score.expiresAt - now) / Math.max(1, score.expiresAt - score.createdAt)))
      const rise = (1 - life) * 24
      const screen = project(score)
      this.context.save()
      this.context.globalAlpha = life
      this.context.font = 'bold 24px "Trebuchet MS", "Verdana", sans-serif'
      this.context.textAlign = 'center'
      this.context.strokeStyle = 'rgba(7, 12, 20, 0.9)'
      this.context.lineWidth = 5
      this.context.fillStyle = '#ffe66d'
      this.context.strokeText(score.text, screen.x, screen.y - 26 - rise)
      this.context.fillText(score.text, screen.x, screen.y - 26 - rise)
      this.context.restore()
    }
  }

  private drawVisualEffects(effects: VisualEffect[], project: (point: GeoPoint) => ScreenPoint): void {
    const now = performance.now()
    for (const effect of effects) {
      const duration = Math.max(1, effect.expiresAt - effect.createdAt)
      const progress = Math.max(0, Math.min(1, (now - effect.createdAt) / duration))
      if (effect.type === 'eat-ghost') {
        this.drawEatGhostEffect(effect, progress, project)
      } else if (effect.type === 'death') {
        this.drawDeathEffect(effect, progress, project)
      }
    }
  }

  private drawEatGhostEffect(effect: VisualEffect, progress: number, project: (point: GeoPoint) => ScreenPoint): void {
    const screen = project(effect)
    this.context.save()
    this.context.globalAlpha = 1 - progress
    this.context.strokeStyle = '#f8f9fa'
    this.context.lineWidth = 6 - progress * 3
    this.context.shadowColor = '#ffffff'
    this.context.shadowBlur = 16
    this.context.beginPath()
    this.context.arc(screen.x, screen.y, 16 + progress * 24, 0, Math.PI * 2)
    this.context.stroke()
    this.context.beginPath()
    this.context.moveTo(screen.x - 10 - progress * 6, screen.y)
    this.context.lineTo(screen.x + 10 + progress * 6, screen.y)
    this.context.moveTo(screen.x, screen.y - 10 - progress * 6)
    this.context.lineTo(screen.x, screen.y + 10 + progress * 6)
    this.context.stroke()
    this.context.restore()
  }

  private drawDeathEffect(effect: VisualEffect, progress: number, project: (point: GeoPoint) => ScreenPoint): void {
    const screen = project(effect)
    const mouth = 0.25 + progress * (Math.PI - 0.25)
    const radius = Math.max(0, PACMAN_BODY_RADIUS - progress * 6)
    const burstRadius = PACMAN_BODY_RADIUS + 8 + progress * 22

    this.context.save()
    this.context.globalAlpha = Math.max(0, 1 - progress)
    this.context.fillStyle = '#ffd60a'
    this.context.strokeStyle = 'rgba(255,255,255,0.7)'
    this.context.lineWidth = 2
    this.context.shadowColor = '#ffd60a'
    this.context.shadowBlur = 18
    this.context.beginPath()
    this.context.moveTo(screen.x, screen.y)
    this.context.arc(screen.x, screen.y, radius, mouth, Math.PI * 2 - mouth)
    this.context.closePath()
    this.context.fill()
    this.context.stroke()

    this.context.shadowBlur = 0
    this.context.strokeStyle = `rgba(255, 214, 10, ${0.75 - progress * 0.55})`
    this.context.lineWidth = 4
    this.context.beginPath()
    this.context.arc(screen.x, screen.y, burstRadius, 0, Math.PI * 2)
    this.context.stroke()
    this.context.restore()
  }
}
