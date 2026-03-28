import 'maplibre-gl/dist/maplibre-gl.css'
import './style.css'
import { SynthAudio } from './audio/synthAudio'
import { fetchRoadData, searchPlaces } from './data/overpass'
import { GameEngine } from './game/gameEngine'
import { generatePlayableMap } from './generator/generatePlayableMap'
import { MapController } from './map/mapController'
import { CanvasRenderer } from './render/canvasRenderer'
import type { Direction, PlayableMap } from './types'

function requireElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector)
  if (!element) {
    throw new Error(`Missing element: ${selector}`)
  }
  return element
}

const app = document.querySelector<HTMLDivElement>('#app')

if (!app) {
  throw new Error('App root was not found')
}

app.innerHTML = `
  <div class="shell">
    <aside class="panel">
      <div>
        <p class="eyebrow">Map Pac-Man</p>
        <h1>讓 Pac-Man 真正貼著地圖道路玩</h1>
        <p class="intro">把地圖道路變成可玩的 Pac-Man 關卡。</p>
      </div>

      <div class="controls">
        <label class="search">
          <span>地點搜尋</span>
          <div class="search-row">
            <input id="search-input" type="text" placeholder="例如: Shibuya Crossing, Taipei 101, Manhattan" />
            <button id="search-button" type="button">Search</button>
          </div>
        </label>
        <div id="search-results" class="search-results"></div>
        <div class="button-row">
          <button id="generate-button" type="button" class="primary">Generate Road Maze</button>
          <button id="play-button" type="button">Play</button>
          <button id="pause-button" type="button">Pause</button>
          <button id="restart-button" type="button">Restart</button>
        </div>
        <label class="speed-control">
          <span>Speed</span>
          <div class="speed-row">
            <input id="speed-input" type="range" min="0.8" max="2.4" step="0.1" value="1.0" />
            <strong id="speed-value">1.0x</strong>
          </div>
        </label>
        <label class="speed-control">
          <span>Pellets</span>
          <div class="speed-row">
            <input id="pellet-input" type="range" min="1.0" max="5.0" step="0.5" value="3.0" />
            <strong id="pellet-value">3.0x</strong>
          </div>
        </label>
      </div>

      <div class="stats">
        <div><span>Mode</span><strong id="mode-value">idle</strong></div>
        <div><span>Score</span><strong id="score-value">0</strong></div>
        <div><span>Lives</span><strong id="lives-value">3</strong></div>
        <div><span>Status</span><strong id="status-value">Idle</strong></div>
      </div>

      <div class="tips">
        <p>Controls: Arrow keys / WASD</p>
        <p>先把地圖移到想玩的區域，再按 <code>Generate Road Maze</code>。</p>
      </div>
    </aside>

    <main class="stage">
      <div id="map"></div>
      <div class="overlay">
        <canvas id="game-canvas"></canvas>
        <div id="message" class="message">Move to a city block and generate a road-based maze.</div>
      </div>
    </main>
  </div>
`

const searchInput = requireElement<HTMLInputElement>('#search-input')
const searchButton = requireElement<HTMLButtonElement>('#search-button')
const searchResults = requireElement<HTMLDivElement>('#search-results')
const generateButton = requireElement<HTMLButtonElement>('#generate-button')
const playButton = requireElement<HTMLButtonElement>('#play-button')
const pauseButton = requireElement<HTMLButtonElement>('#pause-button')
const restartButton = requireElement<HTMLButtonElement>('#restart-button')
const speedInput = requireElement<HTMLInputElement>('#speed-input')
const speedValue = requireElement<HTMLElement>('#speed-value')
const pelletInput = requireElement<HTMLInputElement>('#pellet-input')
const pelletValue = requireElement<HTMLElement>('#pellet-value')
const scoreValue = requireElement<HTMLElement>('#score-value')
const livesValue = requireElement<HTMLElement>('#lives-value')
const statusValue = requireElement<HTMLElement>('#status-value')
const modeValue = requireElement<HTMLElement>('#mode-value')
const message = requireElement<HTMLDivElement>('#message')
const mapRoot = requireElement<HTMLDivElement>('#map')
const canvas = requireElement<HTMLCanvasElement>('#game-canvas')

const mapController = new MapController(mapRoot)
const renderer = new CanvasRenderer(canvas)
const audio = new SynthAudio()

let playableMap: PlayableMap | null = null
let engine: GameEngine | null = null
let animationFrame = 0

function setText(node: HTMLElement, text: string): void {
  if (node.textContent !== text) {
    node.textContent = text
  }
}

function setMessage(text: string): void {
  setText(message, text)
}

function applySpeed(): void {
  const value = Number(speedInput.value)
  speedValue.textContent = `${value.toFixed(1)}x`
  engine?.setSpeedMultiplier(value)
}

function applyPelletDensity(): void {
  const value = Number(pelletInput.value)
  pelletValue.textContent = `${value.toFixed(1)}x`
}

function syncHud(): void {
  if (!engine) {
    setText(scoreValue, '0')
    setText(livesValue, '3')
    setText(statusValue, playableMap ? 'Preview' : 'Idle')
    setText(modeValue, playableMap?.sourceMode ?? 'idle')
    return
  }

  setText(scoreValue, String(engine.state.score))
  setText(livesValue, String(engine.state.lives))
  setText(statusValue, engine.state.status)
  setText(modeValue, engine.map.sourceMode)

  if (engine.state.status === 'win') {
    setMessage('Cleared. Generate another district or restart this run.')
  } else if (engine.state.status === 'gameover') {
    setMessage('Game over. Restart to replay this road layout.')
  } else if (engine.state.status === 'dying') {
    setMessage('Ouch. Respawning...')
  } else if (engine.state.status === 'paused') {
    setMessage('Paused.')
  } else if (engine.state.status === 'preview') {
    setMessage('Road maze ready. Press Play or use direction keys.')
  } else {
    setMessage('Now the pellets, ghosts and movement are following the road graph itself.')
  }
}

function stopLoop(): void {
  cancelAnimationFrame(animationFrame)
}

function drawCurrentFrame(): void {
  if (!engine && playableMap) {
    renderer.renderPreview(playableMap, (point) => mapController.project(point))
    return
  }
  if (engine) {
    renderer.renderGame(engine, (point) => mapController.project(point))
  }
}

function processEngineEvents(): void {
  if (!engine) {
    return
  }
  for (const event of engine.drainEvents()) {
    audio.playEvent(event)
    if (event.type === 'gameover' || event.type === 'win' || event.type === 'lose-life') {
      audio.setAmbience(false)
    }
  }
}

function loop(timestamp: number): void {
  if (!engine) {
    return
  }
  engine.tick(timestamp)
  processEngineEvents()
  drawCurrentFrame()
  syncHud()
  animationFrame = requestAnimationFrame(loop)
}

function startLoop(): void {
  stopLoop()
  animationFrame = requestAnimationFrame(loop)
}

async function handleSearch(): Promise<void> {
  const query = searchInput.value.trim()
  if (!query) {
    setMessage('Enter a place name first.')
    return
  }

  setMessage('Searching places...')
  searchResults.innerHTML = ''
  try {
    const results = await searchPlaces(query)
    if (results.length === 0) {
      setMessage('No results found.')
      return
    }

    for (const result of results) {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'result'
      button.textContent = result.label
      button.addEventListener('click', () => {
        mapController.flyTo(result.lng, result.lat)
        setMessage(`Moved to ${result.label}. Generate a road maze when ready.`)
      })
      searchResults.append(button)
    }
  } catch {
    setMessage('Search failed. Try another place or drag the map manually.')
  }
}

async function generateMaze(): Promise<void> {
  setMessage('Loading road network and rebuilding the maze on top of it...')
  stopLoop()
  audio.setAmbience(false)
  try {
    const viewport = mapController.getViewport()
    const roadData = await fetchRoadData(viewport.bounds)
    playableMap = generatePlayableMap(viewport, roadData, {
      pelletDensity: Number(pelletInput.value),
    })
    engine = new GameEngine(playableMap)
    applySpeed()
    drawCurrentFrame()
    syncHud()
    setMessage(`Generated a ${playableMap.sourceMode} road maze. Press Play.`)
  } catch {
    setMessage('Maze generation failed. Try another area or zoom level.')
  }
}

async function play(): Promise<void> {
  if (!engine) {
    setMessage('Generate a maze first.')
    return
  }
  await audio.unlock()
  engine.start()
  audio.setAmbience(true)
  startLoop()
  processEngineEvents()
  syncHud()
}

function pause(): void {
  if (!engine) {
    return
  }
  engine.pause()
  audio.setAmbience(engine.state.status === 'playing')
  syncHud()
}

function restart(): void {
  if (!engine) {
    return
  }
  engine.restart()
  audio.setAmbience(false)
  drawCurrentFrame()
  syncHud()
}

async function handleDirection(direction: Direction): Promise<void> {
  if (!engine) {
    return
  }
  await audio.unlock()
  engine.setDirection(direction)
  if (engine.state.status === 'playing') {
    audio.setAmbience(true)
  }
  startLoop()
  processEngineEvents()
  syncHud()
}

searchButton.addEventListener('click', () => {
  void handleSearch()
})

searchInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    void handleSearch()
  }
})

generateButton.addEventListener('click', () => {
  void generateMaze()
})
playButton.addEventListener('click', () => {
  void play()
})
pauseButton.addEventListener('click', pause)
restartButton.addEventListener('click', restart)
speedInput.addEventListener('input', applySpeed)
pelletInput.addEventListener('input', applyPelletDensity)

window.addEventListener('keydown', (event) => {
  const mapKey: Record<string, Direction> = {
    ArrowUp: 'up',
    ArrowDown: 'down',
    ArrowLeft: 'left',
    ArrowRight: 'right',
    w: 'up',
    W: 'up',
    s: 'down',
    S: 'down',
    a: 'left',
    A: 'left',
    d: 'right',
    D: 'right',
  }

  const direction = mapKey[event.key]
  if (!direction) {
    return
  }

  event.preventDefault()
  void handleDirection(direction)
})

window.addEventListener('resize', () => {
  drawCurrentFrame()
})

await mapController.ready()
applySpeed()
applyPelletDensity()
mapController.onViewChange(() => {
  drawCurrentFrame()
})
setMessage('Map ready. Zoom to an area with roads, then generate a road-based maze.')
syncHud()
