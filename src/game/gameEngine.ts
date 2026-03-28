import type { Direction, EntityState, EntityTravel, FloatingScore, GameEvent, GameState, GeoPoint, GhostMode, GhostState, PlayableMap, RoadGraphEdge, RoadGraphNode, VisualEffect } from '../types'

const PACMAN_SPEED = 42
const GHOST_SPEED = 35
const FRIGHTENED_SPEED = 26
const EYES_SPEED = 58
const POWER_DURATION_MS = 8_000
const COLLISION_DISTANCE_METERS = 10
const PELLET_COLLISION_DISTANCE_METERS = 7
const SPAWN_PROTECTION_MS = 2_000
const GHOST_RELEASE_DELAY_MS = 1_200
const FLOATING_SCORE_DURATION_MS = 1_200
const EAT_GHOST_ANIMATION_MS = 450
const DEATH_ANIMATION_MS = 1_050
const GHOST_MEMORY_SIZE = 6
const GHOST_COLORS = ['#ff595e', '#00bbf9', '#ffca3a', '#90be6d']

const DIRECTION_VECTORS: Record<Direction, { x: number; y: number }> = {
  up: { x: 0, y: 1 },
  down: { x: 0, y: -1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
}

function distanceMeters(a: GeoPoint, b: GeoPoint): number {
  const latScale = 111_320
  const lngScale = Math.cos(((a.lat + b.lat) / 2) * Math.PI / 180) * latScale
  const dx = (a.lng - b.lng) * lngScale
  const dy = (a.lat - b.lat) * latScale
  return Math.hypot(dx, dy)
}

function interpolate(a: GeoPoint, b: GeoPoint, t: number): GeoPoint {
  return {
    lng: a.lng + (b.lng - a.lng) * t,
    lat: a.lat + (b.lat - a.lat) * t,
  }
}

function directionBetween(a: GeoPoint, b: GeoPoint): Direction {
  const dx = b.lng - a.lng
  const dy = b.lat - a.lat
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? 'right' : 'left'
  }
  return dy >= 0 ? 'up' : 'down'
}

function nearestNode(nodes: RoadGraphNode[], target: GeoPoint): RoadGraphNode {
  let best = nodes[0]
  let bestDistance = Number.POSITIVE_INFINITY
  for (const node of nodes) {
    const gap = distanceMeters(node, target)
    if (gap < bestDistance) {
      bestDistance = gap
      best = node
    }
  }
  return best
}

function chooseDirectionalNeighbor(node: RoadGraphNode, candidates: RoadGraphNode[], direction: Direction): RoadGraphNode | null {
  const desired = DIRECTION_VECTORS[direction]
  let best: RoadGraphNode | null = null
  let bestScore = 0.15
  for (const candidate of candidates) {
    const delta = {
      x: candidate.lng - node.lng,
      y: candidate.lat - node.lat,
    }
    const length = Math.hypot(delta.x, delta.y) || 1
    const score = (delta.x / length) * desired.x + (delta.y / length) * desired.y
    if (score > bestScore) {
      bestScore = score
      best = candidate
    }
  }
  return best
}

function cloneNodePosition(node: RoadGraphNode): GeoPoint {
  return {
    lng: node.lng,
    lat: node.lat,
  }
}

function clonePoint(point: GeoPoint): GeoPoint {
  return {
    lng: point.lng,
    lat: point.lat,
  }
}

function cloneTravel(travel: EntityTravel | null): EntityTravel | null {
  if (!travel) {
    return null
  }
  return { ...travel }
}

interface EntitySnapshot {
  position: GeoPoint
  currentNodeId: string | null
  travel: EntityTravel | null
}

function createEntity(node: RoadGraphNode, direction: Direction): EntityState {
  return {
    position: cloneNodePosition(node),
    direction,
    pendingDirection: direction,
    currentNodeId: node.id,
    lastNodeId: null,
    travel: null,
  }
}

export class GameEngine {
  public readonly map: PlayableMap
  public state: GameState

  private readonly nodeMap = new Map<string, RoadGraphNode>()
  private readonly edgeMap = new Map<string, RoadGraphEdge>()
  private readonly edgeByNodes = new Map<string, RoadGraphEdge>()
  private readonly pellets = new Map<string, { id: string; edgeId: string; lng: number; lat: number; power: boolean }>()
  private readonly recentEvents: GameEvent[] = []
  private readonly scatterTargetIds: string[]
  private lastTimestamp = 0
  private spawnProtectedUntil = 0
  private ghostsReleasedAt = 0
  private speedMultiplier = 1
  private frightenedGhostChain = 0
  private deathResolveAt = 0
  private pendingRespawn = false
  private pendingGameover = false

  public constructor(map: PlayableMap) {
    this.map = map
    for (const node of map.nodes) {
      this.nodeMap.set(node.id, node)
    }
    for (const edge of map.edges) {
      this.edgeMap.set(edge.id, edge)
      this.edgeByNodes.set(`${edge.from}:${edge.to}`, edge)
      this.edgeByNodes.set(`${edge.to}:${edge.from}`, edge)
    }
    this.scatterTargetIds = this.buildScatterTargets()
    this.seedPellets()
    this.state = this.createInitialState()
  }

  private seedPellets(): void {
    this.pellets.clear()
    for (const pellet of [...this.map.pellets, ...this.map.powerPellets]) {
      this.pellets.set(pellet.id, pellet)
    }
  }

  private createInitialState(): GameState {
    const spawnNode = this.requireNode(this.map.spawnNodeId)
    return {
      status: 'preview',
      score: 0,
      lives: 3,
      level: 1,
      pacman: createEntity(spawnNode, 'right'),
      ghosts: this.buildGhosts(),
      remainingPellets: this.map.pellets.length + this.map.powerPellets.length,
      frightenedUntil: 0,
      floatingScores: [],
      visualEffects: [],
    }
  }

  private buildGhosts(): GhostState[] {
    return this.map.ghostHomeNodeIds.map((nodeId, index) => {
      const node = this.requireNode(nodeId)
      return {
        id: `ghost-${index}`,
        position: cloneNodePosition(node),
        direction: 'left',
        mode: 'chase' as GhostMode,
        color: GHOST_COLORS[index % GHOST_COLORS.length],
        currentNodeId: node.id,
        lastNodeId: null,
        travel: null,
        homeNodeId: node.id,
        recentNodeIds: [node.id],
      }
    })
  }

  private requireNode(nodeId: string): RoadGraphNode {
    const node = this.nodeMap.get(nodeId)
    if (!node) {
      throw new Error(`Unknown node ${nodeId}`)
    }
    return node
  }

  private findEdge(fromId: string, toId: string): RoadGraphEdge | null {
    return this.edgeByNodes.get(`${fromId}:${toId}`) ?? null
  }

  private buildScatterTargets(): string[] {
    const traversableNodes = [...this.nodeMap.values()].filter((node) => node.neighbors.length > 0)
    const chooseFor = (target: GeoPoint): string =>
      nearestNode(traversableNodes, target).id

    return [
      chooseFor({ lng: this.map.bounds.west, lat: this.map.bounds.north }),
      chooseFor({ lng: this.map.bounds.east, lat: this.map.bounds.north }),
      chooseFor({ lng: this.map.bounds.west, lat: this.map.bounds.south }),
      chooseFor({ lng: this.map.bounds.east, lat: this.map.bounds.south }),
    ]
  }

  private directionalTarget(startNodeId: string, direction: Direction, steps: number): string {
    let current = this.requireNode(startNodeId)
    let previousId: string | null = null

    for (let step = 0; step < steps; step += 1) {
      const candidates = this.availableNeighbors(current.id)
        .filter((candidate) => candidate.id !== previousId)
      const next = chooseDirectionalNeighbor(current, candidates, direction)
        ?? candidates[0]
      if (!next) {
        break
      }
      previousId = current.id
      current = next
    }

    return current.id
  }

  private ghostCandidateScore(candidate: RoadGraphNode, targetId: string, recentNodeIds: string[]): number {
    const target = this.requireNode(targetId)
    const recentPenalty = recentNodeIds.includes(candidate.id) ? 250 : 0
    return distanceMeters(candidate, target) + recentPenalty
  }

  private snapshotEntity(entity: EntityState | GhostState): EntitySnapshot {
    return {
      position: clonePoint(entity.position),
      currentNodeId: entity.currentNodeId,
      travel: cloneTravel(entity.travel),
    }
  }

  public start(): void {
    this.state.status = 'playing'
    const now = performance.now()
    this.lastTimestamp = now
    this.spawnProtectedUntil = now + SPAWN_PROTECTION_MS
    this.ghostsReleasedAt = now + GHOST_RELEASE_DELAY_MS
    this.pushEvent('start')
  }

  public pause(): void {
    this.state.status = this.state.status === 'paused' ? 'playing' : 'paused'
    this.lastTimestamp = performance.now()
  }

  public restart(): void {
    this.seedPellets()
    this.state = this.createInitialState()
    this.lastTimestamp = 0
    this.spawnProtectedUntil = 0
    this.ghostsReleasedAt = 0
    this.frightenedGhostChain = 0
    this.deathResolveAt = 0
    this.pendingRespawn = false
    this.pendingGameover = false
  }

  public setDirection(direction: Direction): void {
    if (this.state.status === 'dying' || this.state.status === 'gameover' || this.state.status === 'win') {
      return
    }
    this.state.pacman.pendingDirection = direction
    if (this.state.status === 'preview') {
      this.start()
    }
  }

  public setSpeedMultiplier(multiplier: number): void {
    this.speedMultiplier = Math.min(3, Math.max(0.6, multiplier))
  }

  public getSpeedMultiplier(): number {
    return this.speedMultiplier
  }

  private pushEvent(type: GameEvent['type']): void {
    this.recentEvents.push({ type })
  }

  public drainEvents(): GameEvent[] {
    return this.recentEvents.splice(0, this.recentEvents.length)
  }

  private availableNeighbors(nodeId: string): RoadGraphNode[] {
    const node = this.requireNode(nodeId)
    return node.neighbors
      .map((neighborId) => this.nodeMap.get(neighborId))
      .filter((neighbor): neighbor is RoadGraphNode => Boolean(neighbor))
  }

  private findPathNextHop(fromId: string, targetId: string, avoidId: string | null): string | null {
    const queue = [fromId]
    const visited = new Set([fromId])
    const parent = new Map<string, string | null>([[fromId, null]])

    while (queue.length > 0) {
      const currentId = queue.shift()
      if (!currentId) {
        continue
      }
      if (currentId === targetId) {
        break
      }

      const current = this.requireNode(currentId)
      for (const neighborId of current.neighbors) {
        if (currentId === fromId && avoidId && neighborId === avoidId && current.neighbors.length > 1) {
          continue
        }
        if (!visited.has(neighborId)) {
          visited.add(neighborId)
          parent.set(neighborId, currentId)
          queue.push(neighborId)
        }
      }
    }

    if (!parent.has(targetId)) {
      return null
    }

    let cursor = targetId
    while (parent.get(cursor) && parent.get(cursor) !== fromId) {
      cursor = parent.get(cursor) as string
    }
    return cursor === fromId ? null : cursor
  }

  private chooseGhostTarget(ghost: GhostState): string {
    const pacmanTargetNodeId = this.state.pacman.currentNodeId
      ?? this.state.pacman.travel?.toNodeId
      ?? this.map.spawnNodeId
    const aheadTargetId = this.directionalTarget(pacmanTargetNodeId, this.state.pacman.pendingDirection, 3)
    const currentNodeId = ghost.currentNodeId ?? ghost.homeNodeId

    const ghostIndex = Number(ghost.id.replace('ghost-', '')) % 4
    if (ghost.mode === 'eyes') {
      return ghost.homeNodeId
    }
    if (ghost.mode === 'frightened') {
      const candidates = this.availableNeighbors(ghost.currentNodeId ?? ghost.homeNodeId)
      return candidates[Math.floor(Math.random() * candidates.length)]?.id ?? ghost.homeNodeId
    }

    if (ghostIndex === 0) {
      return pacmanTargetNodeId
    }
    if (ghostIndex === 1) {
      return aheadTargetId
    }
    if (ghostIndex === 2) {
      return this.scatterTargetIds[2] ?? pacmanTargetNodeId
    }
    return distanceMeters(this.requireNode(currentNodeId), this.requireNode(pacmanTargetNodeId)) < 120
      ? pacmanTargetNodeId
      : (this.scatterTargetIds[1] ?? pacmanTargetNodeId)
  }

  private startTravel(entity: EntityState | GhostState, nextNodeId: string): boolean {
    if (!entity.currentNodeId) {
      return false
    }
    const edge = this.findEdge(entity.currentNodeId, nextNodeId)
    if (!edge) {
      return false
    }
    entity.travel = {
      edgeId: edge.id,
      fromNodeId: entity.currentNodeId,
      toNodeId: nextNodeId,
      progress: 0,
    }
    entity.lastNodeId = entity.currentNodeId
    entity.currentNodeId = null
    const from = this.requireNode(edge.from)
    const to = this.requireNode(edge.to)
    entity.direction = directionBetween(from, to)
    return true
  }

  private choosePacmanEdge(): void {
    const pacman = this.state.pacman
    if (!pacman.currentNodeId) {
      return
    }

    const node = this.requireNode(pacman.currentNodeId)
    const candidates = this.availableNeighbors(node.id)

    if (candidates.length === 0) {
      return
    }

    const preferred = chooseDirectionalNeighbor(node, candidates, pacman.pendingDirection)
    if (preferred && this.startTravel(pacman, preferred.id)) {
      pacman.direction = pacman.pendingDirection
      return
    }

    const continuing = chooseDirectionalNeighbor(node, candidates, pacman.direction)
    if (continuing) {
      this.startTravel(pacman, continuing.id)
    }
  }

  private chooseGhostEdge(ghost: GhostState): void {
    if (!ghost.currentNodeId) {
      return
    }

    const node = this.requireNode(ghost.currentNodeId)
    const candidates = this.availableNeighbors(node.id)
    if (candidates.length === 0) {
      return
    }

    let nextNodeId: string | null = null
    if (ghost.mode === 'frightened') {
      const pool = candidates
        .filter((candidate) =>
          !(ghost.lastNodeId && candidate.id === ghost.lastNodeId && candidates.length > 1)
          && !ghost.recentNodeIds.includes(candidate.id))
      nextNodeId = (pool[Math.floor(Math.random() * pool.length)] ?? candidates[0]).id
    } else {
      const targetNodeId = this.chooseGhostTarget(ghost)
      const bestHop = this.findPathNextHop(node.id, targetNodeId, ghost.lastNodeId)
      if (bestHop && !ghost.recentNodeIds.includes(bestHop)) {
        nextNodeId = bestHop
      } else {
        nextNodeId = [...candidates]
          .filter((candidate) => candidate.id !== ghost.lastNodeId || candidates.length === 1)
          .sort((a, b) =>
            this.ghostCandidateScore(a, targetNodeId, ghost.recentNodeIds)
            - this.ghostCandidateScore(b, targetNodeId, ghost.recentNodeIds))[0]?.id
          ?? candidates[0].id
      }
    }

    this.startTravel(ghost, nextNodeId)
  }

  private moveTraveler(entity: EntityState | GhostState, distance: number): void {
    let remaining = distance

    while (remaining > 0) {
      if (!entity.travel) {
        if ('id' in entity) {
          this.chooseGhostEdge(entity)
        } else {
          this.choosePacmanEdge()
        }
        if (!entity.travel) {
          break
        }
      }

      const edge = this.edgeMap.get(entity.travel.edgeId)
      if (!edge) {
        entity.travel = null
        break
      }

      const from = this.requireNode(entity.travel.fromNodeId)
      const to = this.requireNode(entity.travel.toNodeId)
      const distanceLeftOnEdge = (1 - entity.travel.progress) * edge.length
      if (remaining < distanceLeftOnEdge) {
        entity.travel.progress += remaining / edge.length
        entity.position = interpolate(from, to, entity.travel.progress)
        break
      }

      remaining -= distanceLeftOnEdge
      entity.position = cloneNodePosition(to)
      entity.currentNodeId = to.id
      entity.travel = null
      if ('id' in entity) {
        entity.recentNodeIds = [...entity.recentNodeIds, to.id].slice(-GHOST_MEMORY_SIZE)
      }
    }
  }

  private sharesCollisionLane(ghost: GhostState): boolean {
    const pacman = this.state.pacman
    if (pacman.currentNodeId && ghost.currentNodeId && pacman.currentNodeId === ghost.currentNodeId) {
      return true
    }
    if (pacman.travel && ghost.travel && pacman.travel.edgeId === ghost.travel.edgeId) {
      return true
    }
    if (pacman.currentNodeId && ghost.travel) {
      return ghost.travel.fromNodeId === pacman.currentNodeId || ghost.travel.toNodeId === pacman.currentNodeId
    }
    if (ghost.currentNodeId && pacman.travel) {
      return pacman.travel.fromNodeId === ghost.currentNodeId || pacman.travel.toNodeId === ghost.currentNodeId
    }
    return false
  }

  private normalizedProgress(snapshot: EntitySnapshot, edgeId: string): number | null {
    const edge = this.edgeMap.get(edgeId)
    if (!edge) {
      return null
    }
    if (snapshot.travel?.edgeId === edgeId) {
      if (snapshot.travel.fromNodeId === edge.from && snapshot.travel.toNodeId === edge.to) {
        return snapshot.travel.progress
      }
      if (snapshot.travel.fromNodeId === edge.to && snapshot.travel.toNodeId === edge.from) {
        return 1 - snapshot.travel.progress
      }
      return null
    }
    if (snapshot.currentNodeId === edge.from) {
      return 0
    }
    if (snapshot.currentNodeId === edge.to) {
      return 1
    }
    return null
  }

  private crossedOnSameEdge(
    pacmanBefore: EntitySnapshot,
    pacmanAfter: EntitySnapshot,
    ghostBefore: EntitySnapshot,
    ghostAfter: EntitySnapshot,
  ): boolean {
    const edgeId = pacmanBefore.travel?.edgeId
      ?? pacmanAfter.travel?.edgeId
      ?? ghostBefore.travel?.edgeId
      ?? ghostAfter.travel?.edgeId
    if (!edgeId) {
      return false
    }

    const beforePac = this.normalizedProgress(pacmanBefore, edgeId)
    const afterPac = this.normalizedProgress(pacmanAfter, edgeId)
    const beforeGhost = this.normalizedProgress(ghostBefore, edgeId)
    const afterGhost = this.normalizedProgress(ghostAfter, edgeId)
    if ([beforePac, afterPac, beforeGhost, afterGhost].some((value) => value === null)) {
      return false
    }

    const startGap = (beforePac as number) - (beforeGhost as number)
    const endGap = (afterPac as number) - (afterGhost as number)
    return startGap === 0 || endGap === 0 || startGap * endGap < 0
  }

  private collidesWithGhost(
    ghost: GhostState,
    pacmanBefore: EntitySnapshot,
    ghostBefore: EntitySnapshot,
  ): boolean {
    const pacmanAfter = this.snapshotEntity(this.state.pacman)
    const ghostAfter = this.snapshotEntity(ghost)
    const distance = distanceMeters(this.state.pacman.position, ghost.position)

    if (distance <= COLLISION_DISTANCE_METERS) {
      if (this.sharesCollisionLane(ghost) || distance <= COLLISION_DISTANCE_METERS * 0.55) {
        return true
      }
    }

    return this.crossedOnSameEdge(pacmanBefore, pacmanAfter, ghostBefore, ghostAfter)
  }

  private consumePellets(): void {
    const pacman = this.state.pacman.position
    const consumed: string[] = []
    for (const pellet of this.pellets.values()) {
      if (distanceMeters(pacman, pellet) > PELLET_COLLISION_DISTANCE_METERS) {
        continue
      }
      consumed.push(pellet.id)
      this.state.score += pellet.power ? 50 : 10
      this.state.remainingPellets -= 1
      this.pushEvent(pellet.power ? 'power' : 'pellet')
      if (pellet.power) {
        this.state.frightenedUntil = performance.now() + POWER_DURATION_MS
        this.frightenedGhostChain = 0
        for (const ghost of this.state.ghosts) {
          if (ghost.mode !== 'eyes') {
            ghost.mode = 'frightened'
          }
        }
      }
    }

    for (const pelletId of consumed) {
      this.pellets.delete(pelletId)
    }

    if (this.state.remainingPellets <= 0 && this.state.status === 'playing') {
      this.state.status = 'win'
      this.pushEvent('win')
    }
  }

  private addFloatingScore(amount: number, position: GeoPoint, timestamp: number): void {
    const floatingScore: FloatingScore = {
      id: `score:${timestamp}:${amount}:${Math.random().toString(36).slice(2, 7)}`,
      text: String(amount),
      lng: position.lng,
      lat: position.lat,
      createdAt: timestamp,
      expiresAt: timestamp + FLOATING_SCORE_DURATION_MS,
    }
    this.state.floatingScores.push(floatingScore)
  }

  private addVisualEffect(type: VisualEffect['type'], position: GeoPoint, timestamp: number, duration: number): void {
    this.state.visualEffects.push({
      id: `fx:${type}:${timestamp}:${Math.random().toString(36).slice(2, 7)}`,
      type,
      lng: position.lng,
      lat: position.lat,
      createdAt: timestamp,
      expiresAt: timestamp + duration,
    })
  }

  private updateFloatingScores(timestamp: number): void {
    this.state.floatingScores = this.state.floatingScores.filter((item) => item.expiresAt > timestamp)
  }

  private updateVisualEffects(timestamp: number): void {
    this.state.visualEffects = this.state.visualEffects.filter((item) => item.expiresAt > timestamp)
  }

  private beginDeathSequence(timestamp: number, gameover: boolean): void {
    this.state.status = 'dying'
    this.deathResolveAt = timestamp + DEATH_ANIMATION_MS
    this.pendingRespawn = !gameover
    this.pendingGameover = gameover
  }

  private finishDeathSequence(): void {
    if (this.pendingGameover) {
      this.state.status = 'gameover'
      this.pendingGameover = false
      this.pendingRespawn = false
      return
    }

    if (!this.pendingRespawn) {
      return
    }

    const spawn = this.requireNode(this.map.spawnNodeId)
    this.state.pacman = createEntity(spawn, 'right')
    this.state.ghosts = this.buildGhosts()
    this.state.status = 'preview'
    this.state.floatingScores = []
    this.pendingRespawn = false
    this.deathResolveAt = 0
    this.spawnProtectedUntil = 0
    this.ghostsReleasedAt = 0
    this.frightenedGhostChain = 0
  }

  private resolveCollisions(timestamp: number, pacmanBefore: EntitySnapshot, ghostSnapshotsBefore: EntitySnapshot[]): void {
    if (timestamp < this.spawnProtectedUntil) {
      return
    }

    for (const [index, ghost] of this.state.ghosts.entries()) {
      const ghostBefore = ghostSnapshotsBefore[index]
      if (!ghostBefore || !this.collidesWithGhost(ghost, pacmanBefore, ghostBefore)) {
        continue
      }

      if (ghost.mode === 'frightened') {
        const home = this.requireNode(ghost.homeNodeId)
        const ghostPosition = {
          lng: ghost.position.lng,
          lat: ghost.position.lat,
        }
        ghost.mode = 'eyes'
        ghost.currentNodeId = home.id
        ghost.travel = null
        ghost.position = cloneNodePosition(home)
        const comboScore = 200 * (2 ** this.frightenedGhostChain)
        this.frightenedGhostChain = Math.min(3, this.frightenedGhostChain + 1)
        this.state.score += comboScore
        this.addFloatingScore(comboScore, ghostPosition, timestamp)
        this.addVisualEffect('eat-ghost', ghostPosition, timestamp, EAT_GHOST_ANIMATION_MS)
        this.pushEvent('eat-ghost')
        continue
      }

      if (ghost.mode !== 'eyes') {
        const deathPosition = {
          lng: this.state.pacman.position.lng,
          lat: this.state.pacman.position.lat,
        }
        this.state.lives -= 1
        this.addVisualEffect('death', deathPosition, timestamp, DEATH_ANIMATION_MS)
        this.pushEvent(this.state.lives <= 0 ? 'gameover' : 'lose-life')
        this.beginDeathSequence(timestamp, this.state.lives <= 0)
        return
      }
    }
  }

  public tick(timestamp: number): void {
    this.updateFloatingScores(timestamp)
    this.updateVisualEffects(timestamp)

    if (this.state.status === 'dying') {
      if (timestamp >= this.deathResolveAt) {
        this.finishDeathSequence()
      }
      this.lastTimestamp = timestamp
      return
    }

    if (this.state.status !== 'playing') {
      this.lastTimestamp = timestamp
      return
    }

    const pacmanBefore = this.snapshotEntity(this.state.pacman)
    const ghostsBefore = this.state.ghosts.map((ghost) => this.snapshotEntity(ghost))
    const delta = Math.min(80, timestamp - this.lastTimestamp)
    this.lastTimestamp = timestamp
    const frightened = timestamp < this.state.frightenedUntil
    if (!frightened) {
      this.frightenedGhostChain = 0
    }
    const pacmanDistance = PACMAN_SPEED * this.speedMultiplier * (delta / 1000)
    this.moveTraveler(this.state.pacman, pacmanDistance)
    this.consumePellets()

    if (timestamp >= this.ghostsReleasedAt) {
      for (const ghost of this.state.ghosts) {
        if (ghost.mode !== 'eyes') {
          ghost.mode = frightened ? 'frightened' : 'chase'
        }
        const ghostSpeed = ghost.mode === 'eyes'
          ? EYES_SPEED
          : (ghost.mode === 'frightened' ? FRIGHTENED_SPEED : GHOST_SPEED)
        this.moveTraveler(ghost, ghostSpeed * this.speedMultiplier * (delta / 1000))
      }
    }

    this.resolveCollisions(timestamp, pacmanBefore, ghostsBefore)
  }

  public getPellets(): { pellets: GeoPoint[]; powerPellets: GeoPoint[] } {
    const pellets: GeoPoint[] = []
    const powerPellets: GeoPoint[] = []

    for (const pellet of this.pellets.values()) {
      if (pellet.power) {
        powerPellets.push({ lng: pellet.lng, lat: pellet.lat })
      } else {
        pellets.push({ lng: pellet.lng, lat: pellet.lat })
      }
    }

    return { pellets, powerPellets }
  }
}
