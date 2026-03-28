import type { AddressPreset, Bounds, RoadData, RoadGraphEdge, RoadGraphNode, SearchResult } from '../types'

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter'
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search'
const ADDRESS_PRESETS_URL = '/addresses.txt'
const PLAYABLE_HIGHWAYS = new Set([
  'residential',
  'living_street',
  'tertiary',
  'tertiary_link',
  'secondary',
  'secondary_link',
  'primary',
  'primary_link',
  'service',
  'unclassified',
  'road',
  'pedestrian',
  'footway',
  'cycleway',
  'track',
])

interface OverpassNodeElement {
  type: 'node'
  id: number
  lat: number
  lon: number
}

interface OverpassWayElement {
  type: 'way'
  id: number
  nodes: number[]
  tags?: {
    highway?: string
  }
}

interface OverpassResponse {
  elements: Array<OverpassNodeElement | OverpassWayElement>
}

function isWithinBounds(bounds: Bounds, lat: number, lng: number): boolean {
  return lat >= bounds.south
    && lat <= bounds.north
    && lng >= bounds.west
    && lng <= bounds.east
}

function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const latScale = 111_320
  const lngScale = Math.cos(((a.lat + b.lat) / 2) * Math.PI / 180) * latScale
  const dx = (a.lng - b.lng) * lngScale
  const dy = (a.lat - b.lat) * latScale
  return Math.hypot(dx, dy)
}

export async function searchPlaces(query: string): Promise<SearchResult[]> {
  const url = new URL(NOMINATIM_URL)
  url.searchParams.set('q', query)
  url.searchParams.set('format', 'jsonv2')
  url.searchParams.set('limit', '5')

  const response = await fetch(url.toString(), {
    headers: {
      Accept: 'application/json',
    },
  })

  if (!response.ok) {
    throw new Error('Search request failed')
  }

  const results = await response.json() as Array<{ display_name: string; lat: string; lon: string }>

  return results.map((item) => ({
    label: item.display_name,
    lat: Number(item.lat),
    lng: Number(item.lon),
  }))
}

function parseAddressPreset(line: string): AddressPreset | null {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) {
    return null
  }

  const parts = trimmed.split('|').map((part) => part.trim()).filter(Boolean)
  if (parts.length === 1) {
    return {
      label: parts[0],
      query: parts[0],
    }
  }
  if (parts.length === 2) {
    return {
      label: parts[0],
      query: parts[1],
    }
  }
  if (parts.length >= 3) {
    const lat = Number(parts[1])
    const lng = Number(parts[2])
    if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
      return {
        label: parts[0],
        lat,
        lng,
      }
    }
  }
  return null
}

export async function loadAddressPresets(): Promise<AddressPreset[]> {
  try {
    const response = await fetch(ADDRESS_PRESETS_URL, { cache: 'no-cache' })
    if (!response.ok) {
      return []
    }
    const text = await response.text()
    return text
      .split(/\r?\n/)
      .map(parseAddressPreset)
      .filter((preset): preset is AddressPreset => Boolean(preset))
  } catch {
    return []
  }
}

export async function fetchRoadData(bounds: Bounds): Promise<RoadData> {
  const query = `
    [out:json][timeout:20];
    (
      way["highway"](${bounds.south},${bounds.west},${bounds.north},${bounds.east});
    );
    (._;>;);
    out body;
  `

  const response = await fetch(OVERPASS_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain;charset=UTF-8',
    },
    body: query,
  })

  if (!response.ok) {
    throw new Error('Road data request failed')
  }

  const payload = await response.json() as OverpassResponse
  const nodeLookup = new Map<number, OverpassNodeElement>()
  const graphNodes = new Map<string, RoadGraphNode>()
  const graphEdges: RoadGraphEdge[] = []

  for (const element of payload.elements) {
    if (element.type === 'node') {
      nodeLookup.set(element.id, element)
    }
  }

  for (const element of payload.elements) {
    if (element.type !== 'way') {
      continue
    }

    const highway = element.tags?.highway
    if (!highway || !PLAYABLE_HIGHWAYS.has(highway)) {
      continue
    }

    for (let index = 0; index < element.nodes.length - 1; index += 1) {
      const fromId = element.nodes[index]
      const toId = element.nodes[index + 1]
      const fromNode = nodeLookup.get(fromId)
      const toNode = nodeLookup.get(toId)

      if (!fromNode || !toNode) {
        continue
      }
      if (!isWithinBounds(bounds, fromNode.lat, fromNode.lon) || !isWithinBounds(bounds, toNode.lat, toNode.lon)) {
        continue
      }

      const fromKey = String(fromId)
      const toKey = String(toId)
      graphNodes.set(fromKey, graphNodes.get(fromKey) ?? {
        id: fromKey,
        lng: fromNode.lon,
        lat: fromNode.lat,
        neighbors: [],
      })
      graphNodes.set(toKey, graphNodes.get(toKey) ?? {
        id: toKey,
        lng: toNode.lon,
        lat: toNode.lat,
        neighbors: [],
      })

      const fromGraphNode = graphNodes.get(fromKey)
      const toGraphNode = graphNodes.get(toKey)
      if (!fromGraphNode || !toGraphNode) {
        continue
      }

      if (!fromGraphNode.neighbors.includes(toKey)) {
        fromGraphNode.neighbors.push(toKey)
      }
      if (!toGraphNode.neighbors.includes(fromKey)) {
        toGraphNode.neighbors.push(fromKey)
      }

      graphEdges.push({
        id: `${element.id}:${index}`,
        from: fromKey,
        to: toKey,
        kind: highway,
        length: distanceMeters(
          { lat: fromNode.lat, lng: fromNode.lon },
          { lat: toNode.lat, lng: toNode.lon },
        ),
      })
    }
  }

  return {
    nodes: [...graphNodes.values()],
    edges: graphEdges,
  }
}
