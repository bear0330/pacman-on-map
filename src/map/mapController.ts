import maplibregl, { type Map, type StyleSpecification } from 'maplibre-gl'
import type { GeoPoint, ScreenPoint, Viewport } from '../types'

const TILE_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '&copy; OpenStreetMap contributors',
    },
  },
  layers: [
    {
      id: 'osm',
      type: 'raster',
      source: 'osm',
    },
  ],
} as const

export class MapController {
  private readonly map: Map

  public constructor(container: HTMLElement) {
    this.map = new maplibregl.Map({
      container,
      style: TILE_STYLE,
      center: [-73.9855, 40.758],
      zoom: 15,
    })

    this.map.addControl(new maplibregl.NavigationControl({ visualizePitch: false }), 'top-right')
    this.map.addControl(new maplibregl.AttributionControl({ compact: true }))
  }

  public async ready(): Promise<void> {
    if (this.map.loaded()) {
      return
    }
    await new Promise<void>((resolve) => {
      this.map.on('load', () => resolve())
    })
  }

  public getViewport(): Viewport {
    const bounds = this.map.getBounds()
    const center = this.map.getCenter()
    return {
      center: {
        lng: center.lng,
        lat: center.lat,
      },
      zoom: this.map.getZoom(),
      bounds: {
        north: bounds.getNorth(),
        south: bounds.getSouth(),
        east: bounds.getEast(),
        west: bounds.getWest(),
      },
    }
  }

  public flyTo(lng: number, lat: number): void {
    this.map.flyTo({
      center: [lng, lat],
      zoom: 15,
      speed: 0.8,
    })
  }

  public fitToPoints(points: GeoPoint[]): void {
    if (points.length === 0) {
      return
    }

    const canvas = this.map.getCanvas()
    const width = canvas.clientWidth
    const height = canvas.clientHeight
    if (width <= 0 || height <= 0) {
      return
    }

    const margin = 34
    let minX = Number.POSITIVE_INFINITY
    let maxX = Number.NEGATIVE_INFINITY
    let minY = Number.POSITIVE_INFINITY
    let maxY = Number.NEGATIVE_INFINITY

    for (const point of points) {
      const projected = this.map.project([point.lng, point.lat])
      minX = Math.min(minX, projected.x)
      maxX = Math.max(maxX, projected.x)
      minY = Math.min(minY, projected.y)
      maxY = Math.max(maxY, projected.y)
    }

    const fitsCurrentView = minX >= margin
      && maxX <= width - margin
      && minY >= margin
      && maxY <= height - margin

    if (fitsCurrentView) {
      return
    }

    const availableWidth = Math.max(1, width - margin * 2)
    const availableHeight = Math.max(1, height - margin * 2)
    const bboxWidth = Math.max(1, maxX - minX)
    const bboxHeight = Math.max(1, maxY - minY)
    const scale = Math.max(bboxWidth / availableWidth, bboxHeight / availableHeight)
    const bboxCenter = {
      x: (minX + maxX) / 2,
      y: (minY + maxY) / 2,
    }
    const targetCenter = this.map.unproject([bboxCenter.x, bboxCenter.y])

    if (scale <= 1) {
      this.map.easeTo({
        center: [targetCenter.lng, targetCenter.lat],
        duration: 180,
      })
      return
    }

    const zoomDelta = Math.log2(scale) + 0.06
    this.map.easeTo({
      center: [targetCenter.lng, targetCenter.lat],
      zoom: this.map.getZoom() - zoomDelta,
      duration: 200,
    })
  }

  public project(point: GeoPoint): ScreenPoint {
    const projected = this.map.project([point.lng, point.lat])
    return {
      x: projected.x,
      y: projected.y,
    }
  }

  public onViewChange(listener: () => void): void {
    this.map.on('move', listener)
    this.map.on('zoom', listener)
    this.map.on('resize', listener)
  }

  public setInteractive(enabled: boolean): void {
    const methods = [
      this.map.boxZoom,
      this.map.dragPan,
      this.map.dragRotate,
      this.map.doubleClickZoom,
      this.map.keyboard,
      this.map.scrollZoom,
      this.map.touchPitch,
      this.map.touchZoomRotate,
    ]
    for (const method of methods) {
      if (enabled) {
        method.enable()
      } else {
        method.disable()
      }
    }
  }
}
