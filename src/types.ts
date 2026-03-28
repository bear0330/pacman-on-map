export type SourceMode = 'road' | 'hybrid' | 'generated'
export type Direction = 'up' | 'down' | 'left' | 'right'
export type GameStatus = 'idle' | 'preview' | 'playing' | 'paused' | 'dying' | 'gameover' | 'win'
export type GhostMode = 'chase' | 'frightened' | 'eyes'
export type GameEventType = 'start' | 'pellet' | 'power' | 'fruit' | 'extra-life' | 'eat-ghost' | 'lose-life' | 'gameover' | 'win'

export interface Bounds {
  north: number
  south: number
  east: number
  west: number
}

export interface GeoPoint {
  lng: number
  lat: number
}

export interface ScreenPoint {
  x: number
  y: number
}

export interface Viewport {
  center: GeoPoint
  zoom: number
  bounds: Bounds
}

export interface RoadGraphNode extends GeoPoint {
  id: string
  neighbors: string[]
}

export interface RoadGraphEdge {
  id: string
  from: string
  to: string
  kind: string
  length: number
  synthetic?: boolean
}

export interface RoadData {
  nodes: RoadGraphNode[]
  edges: RoadGraphEdge[]
}

export interface Pellet extends GeoPoint {
  id: string
  edgeId: string
  progress: number
  power: boolean
}

export type BonusFruitType = 'cherry' | 'strawberry' | 'orange' | 'apple'

export interface BonusFruit extends GeoPoint {
  id: string
  kind: BonusFruitType
  score: number
  createdAt: number
  expiresAt: number
}

export interface PlayableMap {
  bounds: Bounds
  center: GeoPoint
  nodes: RoadGraphNode[]
  edges: RoadGraphEdge[]
  pellets: Pellet[]
  powerPellets: Pellet[]
  spawnNodeId: string
  ghostHomeNodeIds: string[]
  sourceMode: SourceMode
}

export interface EntityTravel {
  edgeId: string
  fromNodeId: string
  toNodeId: string
  progress: number
}

export interface EntityState {
  position: GeoPoint
  direction: Direction
  pendingDirection: Direction
  currentNodeId: string | null
  lastNodeId: string | null
  travel: EntityTravel | null
}

export interface GhostState {
  id: string
  position: GeoPoint
  direction: Direction
  mode: GhostMode
  color: string
  currentNodeId: string | null
  lastNodeId: string | null
  travel: EntityTravel | null
  homeNodeId: string
  recentNodeIds: string[]
}

export interface GameState {
  status: GameStatus
  score: number
  lives: number
  level: number
  pacman: EntityState
  ghosts: GhostState[]
  remainingPellets: number
  frightenedUntil: number
  floatingScores: FloatingScore[]
  visualEffects: VisualEffect[]
  bonusFruit: BonusFruit | null
}

export interface SearchResult {
  label: string
  lat: number
  lng: number
}

export interface AddressPreset {
  label: string
  query?: string
  lat?: number
  lng?: number
}

export interface FloatingScore extends GeoPoint {
  id: string
  text: string
  createdAt: number
  expiresAt: number
}

export interface VisualEffect extends GeoPoint {
  id: string
  type: 'death' | 'eat-ghost'
  createdAt: number
  expiresAt: number
}

export interface GameEvent {
  type: GameEventType
}
