import { describe, expect, it } from 'vitest'
import { generatePlayableMap } from './generatePlayableMap'
import type { RoadData, Viewport } from '../types'

const viewport: Viewport = {
  center: { lng: 121.5, lat: 25.04 },
  zoom: 14,
  bounds: {
    north: 25.06,
    south: 25.02,
    east: 121.54,
    west: 121.48,
  },
}

describe('generatePlayableMap', () => {
  it('falls back to generated mode when there is no road data', () => {
    const map = generatePlayableMap(viewport, { nodes: [], edges: [] })
    expect(map.sourceMode).toBe('generated')
    expect(map.nodes.length).toBeGreaterThan(20)
    expect(map.pellets.length + map.powerPellets.length).toBeGreaterThan(30)
  })

  it('keeps real road geometry when a decent graph exists', () => {
    const roadData: RoadData = {
      nodes: [
        { id: '1', lng: 121.49, lat: 25.05, neighbors: ['2', '4'] },
        { id: '2', lng: 121.50, lat: 25.05, neighbors: ['1', '3', '5'] },
        { id: '3', lng: 121.51, lat: 25.05, neighbors: ['2', '6'] },
        { id: '4', lng: 121.49, lat: 25.04, neighbors: ['1', '5', '7'] },
        { id: '5', lng: 121.50, lat: 25.04, neighbors: ['2', '4', '6', '8'] },
        { id: '6', lng: 121.51, lat: 25.04, neighbors: ['3', '5', '9'] },
        { id: '7', lng: 121.49, lat: 25.03, neighbors: ['4', '8'] },
        { id: '8', lng: 121.50, lat: 25.03, neighbors: ['5', '7', '9'] },
        { id: '9', lng: 121.51, lat: 25.03, neighbors: ['6', '8', '10'] },
        { id: '10', lng: 121.52, lat: 25.03, neighbors: ['9', '11'] },
        { id: '11', lng: 121.52, lat: 25.04, neighbors: ['10', '12'] },
        { id: '12', lng: 121.52, lat: 25.05, neighbors: ['11'] },
      ],
      edges: [
        { id: 'e1', from: '1', to: '2', kind: 'residential', length: 100 },
        { id: 'e2', from: '2', to: '3', kind: 'residential', length: 100 },
        { id: 'e3', from: '1', to: '4', kind: 'residential', length: 100 },
        { id: 'e4', from: '2', to: '5', kind: 'residential', length: 100 },
        { id: 'e5', from: '3', to: '6', kind: 'residential', length: 100 },
        { id: 'e6', from: '4', to: '5', kind: 'residential', length: 100 },
        { id: 'e7', from: '5', to: '6', kind: 'residential', length: 100 },
        { id: 'e8', from: '4', to: '7', kind: 'residential', length: 100 },
        { id: 'e9', from: '5', to: '8', kind: 'residential', length: 100 },
        { id: 'e10', from: '6', to: '9', kind: 'residential', length: 100 },
        { id: 'e11', from: '7', to: '8', kind: 'residential', length: 100 },
        { id: 'e12', from: '8', to: '9', kind: 'residential', length: 100 },
        { id: 'e13', from: '9', to: '10', kind: 'residential', length: 100 },
        { id: 'e14', from: '10', to: '11', kind: 'residential', length: 100 },
        { id: 'e15', from: '11', to: '12', kind: 'residential', length: 100 },
      ],
    }

    const map = generatePlayableMap(viewport, roadData)
    expect(['road', 'hybrid']).toContain(map.sourceMode)
    expect(map.edges.length).toBeGreaterThanOrEqual(roadData.edges.length)
    expect(map.pellets.length).toBeGreaterThan(28)
  })

  it('assigns four ghost home nodes when enough nodes exist', () => {
    const map = generatePlayableMap(viewport, { nodes: [], edges: [] })
    expect(map.ghostHomeNodeIds.length).toBe(4)
    expect(new Set(map.ghostHomeNodeIds).size).toBe(4)
  })

  it('keeps spawn away from ghost home nodes', () => {
    const map = generatePlayableMap(viewport, { nodes: [], edges: [] })
    const nodeById = new Map(map.nodes.map((node) => [node.id, node]))
    const spawn = nodeById.get(map.spawnNodeId)
    const homes = map.ghostHomeNodeIds.map((id) => nodeById.get(id)).filter(Boolean)

    expect(map.ghostHomeNodeIds).not.toContain(map.spawnNodeId)
    expect(spawn).toBeDefined()
    expect(homes.length).toBe(4)

    const minDistance = Math.min(
      ...homes.map((home) => {
        const dx = (spawn!.lng - home!.lng) * 111_320
        const dy = (spawn!.lat - home!.lat) * 111_320
        return Math.hypot(dx, dy)
      }),
    )
    expect(minDistance).toBeGreaterThan(100)
  })

  it('adds portal edges so boundary travel can wrap', () => {
    const map = generatePlayableMap(viewport, { nodes: [], edges: [] })
    const portalEdges = map.edges.filter((edge) => edge.kind === 'portal')
    expect(portalEdges.length).toBeGreaterThanOrEqual(4)
  })

  it('avoids placing pellets right on complex intersections', () => {
    const roadData: RoadData = {
      nodes: [
        { id: 'n', lng: 121.5, lat: 25.055, neighbors: ['c'] },
        { id: 's', lng: 121.5, lat: 25.025, neighbors: ['c'] },
        { id: 'w', lng: 121.485, lat: 25.04, neighbors: ['c'] },
        { id: 'e', lng: 121.515, lat: 25.04, neighbors: ['c'] },
        { id: 'c', lng: 121.5, lat: 25.04, neighbors: ['n', 's', 'w', 'e'] },
        { id: 'x', lng: 121.525, lat: 25.04, neighbors: ['e'] },
        { id: 'y', lng: 121.535, lat: 25.04, neighbors: ['x'] },
        { id: 'u', lng: 121.48, lat: 25.03, neighbors: ['v'] },
        { id: 'v', lng: 121.49, lat: 25.03, neighbors: ['u', 'w2'] },
        { id: 'w2', lng: 121.5, lat: 25.03, neighbors: ['v', 'z'] },
        { id: 'z', lng: 121.51, lat: 25.03, neighbors: ['w2', 'q'] },
        { id: 'q', lng: 121.52, lat: 25.03, neighbors: ['z'] },
      ],
      edges: [
        { id: 'n-c', from: 'n', to: 'c', kind: 'road', length: 80 },
        { id: 's-c', from: 's', to: 'c', kind: 'road', length: 80 },
        { id: 'w-c', from: 'w', to: 'c', kind: 'road', length: 80 },
        { id: 'e-c', from: 'e', to: 'c', kind: 'road', length: 80 },
        { id: 'e-x', from: 'e', to: 'x', kind: 'road', length: 80 },
        { id: 'x-y', from: 'x', to: 'y', kind: 'road', length: 80 },
        { id: 'u-v', from: 'u', to: 'v', kind: 'road', length: 80 },
        { id: 'v-w2', from: 'v', to: 'w2', kind: 'road', length: 80 },
        { id: 'w2-z', from: 'w2', to: 'z', kind: 'road', length: 80 },
        { id: 'z-q', from: 'z', to: 'q', kind: 'road', length: 80 },
      ],
    }

    const map = generatePlayableMap(viewport, roadData)
    const intersection = { lng: 121.5, lat: 25.04 }
    const nearIntersection = [...map.pellets, ...map.powerPellets].filter((pellet) => {
      const dx = (pellet.lng - intersection.lng) * 111_320
      const dy = (pellet.lat - intersection.lat) * 111_320
      return Math.hypot(dx, dy) < 25
    })

    expect(nearIntersection.length).toBe(0)
  })

  it('distributes pellets across chained road segments instead of only the middle gap', () => {
    const roadData: RoadData = {
      nodes: [
        { id: 'a', lng: 121.48, lat: 25.04, neighbors: ['b'] },
        { id: 'b', lng: 121.485, lat: 25.04, neighbors: ['a', 'c', 'i'] },
        { id: 'c', lng: 121.49, lat: 25.04, neighbors: ['b', 'd'] },
        { id: 'd', lng: 121.495, lat: 25.04, neighbors: ['c', 'e', 'j'] },
        { id: 'e', lng: 121.50, lat: 25.04, neighbors: ['d', 'f'] },
        { id: 'f', lng: 121.505, lat: 25.04, neighbors: ['e', 'g', 'k'] },
        { id: 'g', lng: 121.51, lat: 25.04, neighbors: ['f', 'h', 'l'] },
        { id: 'h', lng: 121.515, lat: 25.04, neighbors: ['g'] },
        { id: 'i', lng: 121.485, lat: 25.045, neighbors: ['b', 'j'] },
        { id: 'j', lng: 121.495, lat: 25.045, neighbors: ['i', 'd', 'k'] },
        { id: 'k', lng: 121.505, lat: 25.045, neighbors: ['j', 'f', 'l'] },
        { id: 'l', lng: 121.51, lat: 25.045, neighbors: ['k', 'g'] },
      ],
      edges: [
        { id: 'a-b', from: 'a', to: 'b', kind: 'road', length: 50 },
        { id: 'b-c', from: 'b', to: 'c', kind: 'road', length: 50 },
        { id: 'c-d', from: 'c', to: 'd', kind: 'road', length: 50 },
        { id: 'd-e', from: 'd', to: 'e', kind: 'road', length: 50 },
        { id: 'e-f', from: 'e', to: 'f', kind: 'road', length: 50 },
        { id: 'f-g', from: 'f', to: 'g', kind: 'road', length: 50 },
        { id: 'g-h', from: 'g', to: 'h', kind: 'road', length: 50 },
        { id: 'b-i', from: 'b', to: 'i', kind: 'road', length: 50 },
        { id: 'i-j', from: 'i', to: 'j', kind: 'road', length: 50 },
        { id: 'd-j', from: 'd', to: 'j', kind: 'road', length: 50 },
        { id: 'j-k', from: 'j', to: 'k', kind: 'road', length: 50 },
        { id: 'f-k', from: 'f', to: 'k', kind: 'road', length: 50 },
        { id: 'k-l', from: 'k', to: 'l', kind: 'road', length: 50 },
        { id: 'g-l', from: 'g', to: 'l', kind: 'road', length: 50 },
      ],
    }

    const map = generatePlayableMap(viewport, roadData, { pelletDensity: 3 })
    const pelletCountsByEdge = new Map<string, number>()
    for (const pellet of map.pellets) {
      pelletCountsByEdge.set(pellet.edgeId, (pelletCountsByEdge.get(pellet.edgeId) ?? 0) + 1)
    }

    const coveredEdges = ['a-b', 'b-c', 'c-d', 'd-e', 'e-f', 'f-g', 'g-h']
      .filter((edgeId) => (pelletCountsByEdge.get(edgeId) ?? 0) >= 2)

    expect(coveredEdges.length).toBeGreaterThanOrEqual(3)
    expect(map.pellets.length).toBeGreaterThan(8)
  })
})
