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
      center: [121.4133805, 25.0233275],
      zoom: 16,
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
