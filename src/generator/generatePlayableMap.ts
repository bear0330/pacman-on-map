import type { GeoPoint, Pellet, PlayableMap, RoadData, RoadGraphEdge, RoadGraphNode, SourceMode, Viewport } from '../types'

interface GenerateOptions {
  pelletDensity?: number
}

const MIN_NODE_COUNT = 12
const MIN_EDGE_COUNT = 14
const CONNECTOR_LIMIT = 10
const PELLET_STEP_METERS = 6
const MIN_SPAWN_DISTANCE_METERS = 120
const MIN_POWER_DISTANCE_FROM_SPAWN_METERS = 90
const MIN_POWER_PELLET_SPACING_METERS = 80
const TARGET_POWER_PELLETS = 6
const BLOCKED_EDGE_PROGRESS = 0.35
const INTERSECTION_CLEARANCE_METERS = 18
const TURN_CLEARANCE_METERS = 5
const TERMINAL_CLEARANCE_METERS = 2
const QUADRANTS: Array<'nw' | 'ne' | 'sw' | 'se'> = ['nw', 'ne', 'sw', 'se']

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

function buildComponent(nodeMap: Map<string, RoadGraphNode>, startId: string): Set<string> {
  const visited = new Set<string>()
  const queue = [startId]

  while (queue.length > 0) {
    const currentId = queue.shift()
    if (!currentId || visited.has(currentId)) {
      continue
    }
    const node = nodeMap.get(currentId)
    if (!node) {
      continue
    }
    visited.add(currentId)
    for (const neighbor of node.neighbors) {
      if (!visited.has(neighbor) && nodeMap.has(neighbor)) {
        queue.push(neighbor)
      }
    }
  }

  return visited
}

function largestComponent(roadData: RoadData): RoadData {
  const nodeMap = new Map(roadData.nodes.map((node) => [node.id, { ...node, neighbors: [...node.neighbors] }]))
  let best = new Set<string>()

  for (const node of nodeMap.values()) {
    if (best.has(node.id)) {
      continue
    }
    const component = buildComponent(nodeMap, node.id)
    if (component.size > best.size) {
      best = component
    }
  }

  const nodes = [...nodeMap.values()].filter((node) => best.has(node.id))
  const allowed = new Set(nodes.map((node) => node.id))
  const edges = roadData.edges.filter((edge) => allowed.has(edge.from) && allowed.has(edge.to))
  for (const node of nodes) {
    node.neighbors = node.neighbors.filter((neighbor) => allowed.has(neighbor))
  }
  return { nodes, edges }
}

function chooseQuadrant(point: GeoPoint, center: GeoPoint): 'nw' | 'ne' | 'sw' | 'se' {
  if (point.lat >= center.lat && point.lng <= center.lng) {
    return 'nw'
  }
  if (point.lat >= center.lat && point.lng > center.lng) {
    return 'ne'
  }
  if (point.lat < center.lat && point.lng <= center.lng) {
    return 'sw'
  }
  return 'se'
}

function cloneRoadData(roadData: RoadData): RoadData {
  return {
    nodes: roadData.nodes.map((node) => ({ ...node, neighbors: [...node.neighbors] })),
    edges: roadData.edges.map((edge) => ({ ...edge })),
  }
}

function ensureNeighbor(nodeMap: Map<string, RoadGraphNode>, fromId: string, toId: string): void {
  const from = nodeMap.get(fromId)
  const to = nodeMap.get(toId)
  if (!from || !to) {
    return
  }
  if (!from.neighbors.includes(toId)) {
    from.neighbors.push(toId)
  }
  if (!to.neighbors.includes(fromId)) {
    to.neighbors.push(fromId)
  }
}

function connectDeadEnds(roadData: RoadData): { roadData: RoadData; added: number } {
  const cloned = cloneRoadData(roadData)
  const nodeMap = new Map(cloned.nodes.map((node) => [node.id, node]))
  const deadEnds = cloned.nodes.filter((node) => node.neighbors.length <= 1)
  let added = 0

  for (const node of deadEnds) {
    if (added >= CONNECTOR_LIMIT) {
      break
    }

    let bestCandidate: RoadGraphNode | null = null
    let bestDistance = Number.POSITIVE_INFINITY
    for (const candidate of cloned.nodes) {
      if (candidate.id === node.id || node.neighbors.includes(candidate.id) || candidate.neighbors.includes(node.id)) {
        continue
      }
      const gap = distanceMeters(node, candidate)
      if (gap < 35 || gap > 180 || gap >= bestDistance) {
        continue
      }
      bestDistance = gap
      bestCandidate = candidate
    }

    if (!bestCandidate) {
      continue
    }

    const edgeId = `synthetic:${node.id}:${bestCandidate.id}`
    if (cloned.edges.some((edge) => edge.id === edgeId || (edge.from === bestCandidate.id && edge.to === node.id))) {
      continue
    }

    cloned.edges.push({
      id: edgeId,
      from: node.id,
      to: bestCandidate.id,
      kind: 'connector',
      length: bestDistance,
      synthetic: true,
    })
    ensureNeighbor(nodeMap, node.id, bestCandidate.id)
    added += 1
  }

  return { roadData: cloned, added }
}

function fallbackGrid(viewport: Viewport): RoadData {
  const cols = 5
  const rows = 6
  const nodes: RoadGraphNode[] = []
  const edges: RoadGraphEdge[] = []
  const nodeMap = new Map<string, RoadGraphNode>()

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const lng = viewport.bounds.west + ((col + 0.5) / cols) * (viewport.bounds.east - viewport.bounds.west)
      const lat = viewport.bounds.north - ((row + 0.5) / rows) * (viewport.bounds.north - viewport.bounds.south)
      const node: RoadGraphNode = {
        id: `grid-${col}-${row}`,
        lng,
        lat,
        neighbors: [],
      }
      nodes.push(node)
      nodeMap.set(node.id, node)
    }
  }

  const connect = (fromCol: number, fromRow: number, toCol: number, toRow: number): void => {
    const fromId = `grid-${fromCol}-${fromRow}`
    const toId = `grid-${toCol}-${toRow}`
    const from = nodeMap.get(fromId)
    const to = nodeMap.get(toId)
    if (!from || !to) {
      return
    }
    ensureNeighbor(nodeMap, fromId, toId)
    edges.push({
      id: `grid-edge:${fromId}:${toId}`,
      from: fromId,
      to: toId,
      kind: 'generated',
      length: distanceMeters(from, to),
      synthetic: true,
    })
  }

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      if (col < cols - 1) {
        connect(col, row, col + 1, row)
      }
      if (row < rows - 1) {
        connect(col, row, col, row + 1)
      }
    }
  }

  return { nodes, edges }
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

function chooseGhostHomes(nodes: RoadGraphNode[], center: GeoPoint): string[] {
  const byDistance = [...nodes]
    .filter((node) => node.neighbors.length > 0)
    .sort((a, b) => distanceMeters(a, center) - distanceMeters(b, center))
  return byDistance.slice(0, 4).map((node) => node.id)
}

function chooseSpawnNode(nodes: RoadGraphNode[], center: GeoPoint, ghostHomeIds: string[]): RoadGraphNode {
  const ghostHomes = nodes.filter((node) => ghostHomeIds.includes(node.id))
  const candidates = [...nodes]
    .filter((node) => !ghostHomeIds.includes(node.id) && node.neighbors.length > 0)
    .map((node) => {
      const minGhostDistance = ghostHomes.length === 0
        ? Number.POSITIVE_INFINITY
        : Math.min(...ghostHomes.map((ghost) => distanceMeters(node, ghost)))
      const centerDistance = distanceMeters(node, center)
      return {
        node,
        minGhostDistance,
        centerDistance,
      }
    })
    .sort((a, b) => {
      const aSafe = a.minGhostDistance >= MIN_SPAWN_DISTANCE_METERS
      const bSafe = b.minGhostDistance >= MIN_SPAWN_DISTANCE_METERS
      if (aSafe !== bSafe) {
        return aSafe ? -1 : 1
      }
      if (aSafe && bSafe) {
        return a.centerDistance - b.centerDistance
      }
      if (b.minGhostDistance !== a.minGhostDistance) {
        return b.minGhostDistance - a.minGhostDistance
      }
      return a.centerDistance - b.centerDistance
    })

  return candidates[0]?.node ?? nearestNode(nodes, center)
}

function normalizeVector(from: GeoPoint, to: GeoPoint): { x: number; y: number } {
  const dx = to.lng - from.lng
  const dy = to.lat - from.lat
  const length = Math.hypot(dx, dy) || 1
  return { x: dx / length, y: dy / length }
}

function pelletClearanceForEdgeEnd(
  node: RoadGraphNode,
  oppositeNode: RoadGraphNode,
  nodeMap: Map<string, RoadGraphNode>,
): number {
  const degree = node.neighbors.length
  if (degree >= 3) {
    return INTERSECTION_CLEARANCE_METERS
  }
  if (degree <= 1) {
    return TERMINAL_CLEARANCE_METERS
  }

  const otherNeighborId = node.neighbors.find((neighborId) => neighborId !== oppositeNode.id)
  if (!otherNeighborId) {
    return TERMINAL_CLEARANCE_METERS
  }
  const otherNeighbor = nodeMap.get(otherNeighborId)
  if (!otherNeighbor) {
    return TURN_CLEARANCE_METERS
  }

  const toOpposite = normalizeVector(node, oppositeNode)
  const toOther = normalizeVector(node, otherNeighbor)
  const dot = toOpposite.x * toOther.x + toOpposite.y * toOther.y

  if (dot <= -0.92) {
    return 0
  }
  return TURN_CLEARANCE_METERS
}

function buildPellets(
  nodes: RoadGraphNode[],
  edges: RoadGraphEdge[],
  spawnId: string,
  homeIds: string[],
  center: GeoPoint,
  pelletDensity = 1,
): { pellets: Pellet[]; powerPellets: Pellet[] } {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]))
  const blockedNodes = new Set([spawnId, ...homeIds])
  const spawnNode = nodeMap.get(spawnId)
  const pellets: Pellet[] = []
  const pelletStep = PELLET_STEP_METERS / Math.max(0.5, pelletDensity)

  for (const edge of edges) {
    const from = nodeMap.get(edge.from)
    const to = nodeMap.get(edge.to)
    if (!from || !to) {
      continue
    }
    const fromClearance = pelletClearanceForEdgeEnd(from, to, nodeMap)
    const toClearance = pelletClearanceForEdgeEnd(to, from, nodeMap)
    if (edge.length <= fromClearance + toClearance) {
      continue
    }

    const minProgress = Math.max(
      blockedNodes.has(from.id) ? BLOCKED_EDGE_PROGRESS : 0,
      fromClearance / edge.length,
    )
    const maxProgress = Math.min(
      blockedNodes.has(to.id) ? 1 - BLOCKED_EDGE_PROGRESS : 1,
      1 - toClearance / edge.length,
    )
    if (maxProgress <= minProgress) {
      continue
    }

    const playableLength = edge.length * (maxProgress - minProgress)
    const sampleCount = Math.max(1, Math.floor(playableLength / pelletStep))
    for (let step = 1; step <= sampleCount; step += 1) {
      const progress = minProgress + ((maxProgress - minProgress) * step) / (sampleCount + 1)
      const point = interpolate(from, to, progress)
      pellets.push({
        id: `${edge.id}:${step}`,
        edgeId: edge.id,
        progress,
        lng: point.lng,
        lat: point.lat,
        power: false,
      })
    }
  }

  const powerPellets: Pellet[] = []
  const usedPellets = new Set<string>()
  for (const quadrant of QUADRANTS) {
    const candidate = [...pellets]
      .filter((pellet) =>
        !usedPellets.has(pellet.id)
        && chooseQuadrant(pellet, center) === quadrant
        && (!spawnNode || distanceMeters(pellet, spawnNode) >= MIN_POWER_DISTANCE_FROM_SPAWN_METERS))
      .sort((a, b) => distanceMeters(b, center) - distanceMeters(a, center))[0]

    if (candidate) {
      usedPellets.add(candidate.id)
      powerPellets.push({
        ...candidate,
        id: `power:${candidate.id}`,
        power: true,
      })
    }
  }

  const extraCandidates = [...pellets]
    .filter((pellet) =>
      !usedPellets.has(pellet.id)
      && (!spawnNode || distanceMeters(pellet, spawnNode) >= MIN_POWER_DISTANCE_FROM_SPAWN_METERS))
    .sort((a, b) => distanceMeters(b, center) - distanceMeters(a, center))

  for (const candidate of extraCandidates) {
    if (powerPellets.length >= TARGET_POWER_PELLETS) {
      break
    }
    const farEnough = powerPellets.every((existing) => distanceMeters(existing, candidate) >= MIN_POWER_PELLET_SPACING_METERS)
    if (!farEnough) {
      continue
    }
    usedPellets.add(candidate.id)
    powerPellets.push({
      ...candidate,
      id: `power:${candidate.id}`,
      power: true,
    })
  }

  const remainingPellets = pellets.filter((pellet) => !usedPellets.has(pellet.id))

  return {
    pellets: remainingPellets,
    powerPellets,
  }
}

function prepareRoadNetwork(viewport: Viewport, roadData: RoadData): { roadData: RoadData; sourceMode: SourceMode } {
  const component = largestComponent(roadData)
  if (component.nodes.length < MIN_NODE_COUNT || component.edges.length < MIN_EDGE_COUNT) {
    if (component.nodes.length >= 4) {
      const hybrid = connectDeadEnds(component)
      if (hybrid.roadData.nodes.length >= 4 && hybrid.roadData.edges.length >= 6) {
        return { roadData: hybrid.roadData, sourceMode: 'hybrid' }
      }
    }
    return { roadData: fallbackGrid(viewport), sourceMode: 'generated' }
  }

  const hybrid = connectDeadEnds(component)
  return {
    roadData: hybrid.roadData,
    sourceMode: hybrid.added > 0 ? 'hybrid' : 'road',
  }
}

export function generatePlayableMap(viewport: Viewport, roadData: RoadData, options: GenerateOptions = {}): PlayableMap {
  const prepared = prepareRoadNetwork(viewport, roadData)
  const nodes = prepared.roadData.nodes
  const center = viewport.center
  const ghostHomeNodeIds = chooseGhostHomes(nodes, center)
  const spawnNode = chooseSpawnNode(nodes, center, ghostHomeNodeIds)
  const { pellets, powerPellets } = buildPellets(
    nodes,
    prepared.roadData.edges,
    spawnNode.id,
    ghostHomeNodeIds,
    center,
    options.pelletDensity ?? 1,
  )

  return {
    bounds: viewport.bounds,
    center,
    nodes,
    edges: prepared.roadData.edges,
    pellets,
    powerPellets,
    spawnNodeId: spawnNode.id,
    ghostHomeNodeIds,
    sourceMode: prepared.sourceMode,
  }
}
