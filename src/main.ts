import 'maplibre-gl/dist/maplibre-gl.css'
import './style.css'
import { SynthAudio } from './audio/synthAudio'
import { fetchRoadData, loadAddressPresets, searchPlaces } from './data/overpass'
import { GameEngine } from './game/gameEngine'
import { generatePlayableMap } from './generator/generatePlayableMap'
import { loadLocale, localeOptions, modeLabel, saveLocale, statusLabel, translate, type Locale } from './i18n'
import { MapController } from './map/mapController'
import { CanvasRenderer } from './render/canvasRenderer'
import type { AddressPreset, Direction, PlayableMap } from './types'

const RECOMMENDED_ZOOM_MIN = 17
const RECOMMENDED_ZOOM_MAX = 18
const RECOMMENDED_ZOOM_RANGE = '17-18'

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
      <div class="corner-control">
        <select id="locale-select"></select>
      </div>
      <div>
        <p class="eyebrow" id="eyebrow"></p>
        <h1 id="title"></h1>
        <p class="intro" id="intro"></p>
      </div>

      <div class="controls">
        <label id="preset-control" class="speed-control hidden">
          <span id="preset-label"></span>
          <div class="search-row">
            <select id="preset-select"></select>
          </div>
        </label>
        <label class="search">
          <span id="search-label"></span>
          <div class="search-row">
            <input id="search-input" type="text" />
            <button id="search-button" type="button"></button>
          </div>
        </label>
        <div id="search-results" class="search-results"></div>
        <div class="button-row">
          <button id="generate-button" type="button" class="primary"></button>
          <button id="play-button" type="button"></button>
          <button id="pause-button" type="button"></button>
          <button id="restart-button" type="button"></button>
        </div>
        <label class="inline-control">
          <span id="speed-label"></span>
          <input id="speed-input" type="range" min="0.8" max="2.4" step="0.1" value="1.0" />
          <strong id="speed-value">1.0x</strong>
        </label>
        <label class="inline-control">
          <span id="pellet-label"></span>
          <input id="pellet-input" type="range" min="1.0" max="5.0" step="0.5" value="2.0" />
          <strong id="pellet-value">2.0x</strong>
        </label>
      </div>

      <div class="stats">
        <div><span id="score-label"></span><strong id="score-value">0</strong></div>
        <div><span id="lives-label"></span><div id="lives-value" class="life-icons"></div></div>
        <div><span id="status-label"></span><strong id="status-value">Idle</strong></div>
      </div>

      <div class="tips">
        <p id="tip-controls"></p>
        <p id="tip-generate"></p>
      </div>
      <div class="debug-line">
        <span id="mode-label"></span>
        <strong id="mode-value">idle</strong>
      </div>
    </aside>

    <main class="stage">
      <div id="map"></div>
      <div class="overlay">
        <canvas id="game-canvas"></canvas>
        <div id="message" class="message"></div>
      </div>
    </main>
  </div>
`

const eyebrow = requireElement<HTMLElement>('#eyebrow')
const title = requireElement<HTMLElement>('#title')
const intro = requireElement<HTMLElement>('#intro')
const localeSelect = requireElement<HTMLSelectElement>('#locale-select')
const presetControl = requireElement<HTMLElement>('#preset-control')
const presetLabel = requireElement<HTMLElement>('#preset-label')
const presetSelect = requireElement<HTMLSelectElement>('#preset-select')
const searchInput = requireElement<HTMLInputElement>('#search-input')
const searchLabel = requireElement<HTMLElement>('#search-label')
const searchButton = requireElement<HTMLButtonElement>('#search-button')
const searchResults = requireElement<HTMLDivElement>('#search-results')
const generateButton = requireElement<HTMLButtonElement>('#generate-button')
const playButton = requireElement<HTMLButtonElement>('#play-button')
const pauseButton = requireElement<HTMLButtonElement>('#pause-button')
const restartButton = requireElement<HTMLButtonElement>('#restart-button')
const speedInput = requireElement<HTMLInputElement>('#speed-input')
const speedLabel = requireElement<HTMLElement>('#speed-label')
const speedValue = requireElement<HTMLElement>('#speed-value')
const pelletInput = requireElement<HTMLInputElement>('#pellet-input')
const pelletLabel = requireElement<HTMLElement>('#pellet-label')
const pelletValue = requireElement<HTMLElement>('#pellet-value')
const modeLabelNode = requireElement<HTMLElement>('#mode-label')
const scoreValue = requireElement<HTMLElement>('#score-value')
const scoreLabelNode = requireElement<HTMLElement>('#score-label')
const livesValue = requireElement<HTMLElement>('#lives-value')
const livesLabelNode = requireElement<HTMLElement>('#lives-label')
const statusValue = requireElement<HTMLElement>('#status-value')
const statusLabelNode = requireElement<HTMLElement>('#status-label')
const modeValue = requireElement<HTMLElement>('#mode-value')
const tipControls = requireElement<HTMLElement>('#tip-controls')
const tipGenerate = requireElement<HTMLElement>('#tip-generate')
const message = requireElement<HTMLDivElement>('#message')
const mapRoot = requireElement<HTMLDivElement>('#map')
const canvas = requireElement<HTMLCanvasElement>('#game-canvas')

const mapController = new MapController(mapRoot)
const renderer = new CanvasRenderer(canvas)
const audio = new SynthAudio()

let playableMap: PlayableMap | null = null
let engine: GameEngine | null = null
let animationFrame = 0
let currentLocale: Locale = loadLocale()
let currentMessage: { key: string; params?: Record<string, string | number> } = { key: 'message.initial' }
let addressPresets: AddressPreset[] = []
let movedMessageTimer: number | null = null

function setText(node: HTMLElement, text: string): void {
  if (node.textContent !== text) {
    node.textContent = text
  }
}

function setHtml(node: HTMLElement, html: string): void {
  if (node.innerHTML !== html) {
    node.innerHTML = html
  }
}

function t(key: string, params?: Record<string, string | number>): string {
  return translate(currentLocale, key, params)
}

function setMessageKey(key: string, params?: Record<string, string | number>): void {
  currentMessage = { key, params }
  setText(message, t(key, params))
}

function setMovedMessage(label: string, zoom: number): void {
  setMessageKey('message.moved', {
    label,
    zoom: zoom.toFixed(1),
    range: RECOMMENDED_ZOOM_RANGE,
  })
}

function setViewportGuidanceMessage(): void {
  const zoom = mapController.getViewport().zoom
  const params = {
    zoom: zoom.toFixed(1),
    range: RECOMMENDED_ZOOM_RANGE,
  }

  if (zoom < RECOMMENDED_ZOOM_MIN) {
    setMessageKey('message.viewportWide', params)
    return
  }

  if (zoom > RECOMMENDED_ZOOM_MAX) {
    setMessageKey('message.viewportTight', params)
    return
  }

  setMessageKey('message.viewportGood', params)
}

function refreshViewportMessage(): void {
  if (currentMessage.key === 'message.moved' && typeof currentMessage.params?.label === 'string') {
    setMovedMessage(currentMessage.params.label, mapController.getViewport().zoom)
    return
  }

  if (currentMessage.key === 'message.initial' || currentMessage.key.startsWith('message.viewport')) {
    setViewportGuidanceMessage()
  }
}

function scheduleMovedMessage(label: string): void {
  if (movedMessageTimer !== null) {
    window.clearTimeout(movedMessageTimer)
  }
  movedMessageTimer = window.setTimeout(() => {
    setMovedMessage(label, mapController.getViewport().zoom)
    movedMessageTimer = null
  }, 650)
}

function updateGenerateButtonHint(): void {
  const zoom = mapController.getViewport().zoom
  const zoomText = zoom.toFixed(1)

  if (zoom < RECOMMENDED_ZOOM_MIN) {
    setText(generateButton, `⚠️ ${t('buttons.generate')}`)
    generateButton.title = t('buttons.generateWideHint', { zoom: zoomText })
    return
  }

  if (zoom > RECOMMENDED_ZOOM_MAX) {
    setText(generateButton, `🔎 ${t('buttons.generate')}`)
    generateButton.title = t('buttons.generateTightHint', { zoom: zoomText })
    return
  }

  setText(generateButton, t('buttons.generate'))
  generateButton.title = t('buttons.generateGoodHint', { zoom: zoomText })
}

function renderLocale(): void {
  document.documentElement.lang = currentLocale
  localeSelect.innerHTML = ''
  for (const option of localeOptions) {
    const element = document.createElement('option')
    element.value = option.value
    element.textContent = option.label
    localeSelect.append(element)
  }
  localeSelect.value = currentLocale

  setText(eyebrow, t('app.eyebrow'))
  setText(title, t('app.title'))
  setText(intro, t('app.intro'))
  localeSelect.title = t('controls.language')
  setText(presetLabel, t('controls.presets'))
  setText(searchLabel, t('controls.search'))
  searchInput.placeholder = t('search.placeholder')
  setText(searchButton, t('buttons.search'))
  setText(playButton, t('buttons.play'))
  setText(pauseButton, t('buttons.pause'))
  setText(restartButton, t('buttons.restart'))
  setText(speedLabel, t('controls.speed'))
  setText(pelletLabel, t('controls.pellets'))
  setText(modeLabelNode, t('stats.mode'))
  setText(scoreLabelNode, t('stats.score'))
  setText(livesLabelNode, t('stats.lives'))
  setText(statusLabelNode, t('stats.status'))
  setText(tipControls, t('tips.controls'))
  setHtml(tipGenerate, t('tips.generate'))
  updateGenerateButtonHint()
  if (currentMessage.key === 'message.initial' || currentMessage.key.startsWith('message.viewport') || currentMessage.key === 'message.moved') {
    refreshViewportMessage()
  } else {
    setText(message, t(currentMessage.key, currentMessage.params))
  }
  renderPresetOptions()
  syncHud()
}

function renderPresetOptions(): void {
  if (addressPresets.length === 0) {
    presetControl.classList.add('hidden')
    return
  }

  presetControl.classList.remove('hidden')
  presetSelect.innerHTML = ''
  const placeholder = document.createElement('option')
  placeholder.value = ''
  placeholder.textContent = t('presets.placeholder')
  presetSelect.append(placeholder)

  addressPresets.forEach((preset, index) => {
    const option = document.createElement('option')
    option.value = String(index)
    option.textContent = preset.label
    presetSelect.append(option)
  })
  presetSelect.value = ''
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

function renderLives(count: number): void {
  const icons = Array.from({ length: Math.max(0, count) }, (_, index) =>
    `<span class="life-icon" aria-hidden="true" style="animation-delay:${index * 0.06}s"></span>`)
  setHtml(livesValue, icons.join(''))
}

function syncHud(): void {
  if (!engine) {
    setText(scoreValue, '0')
    renderLives(3)
    setText(statusValue, playableMap ? statusLabel(currentLocale, 'preview') : statusLabel(currentLocale, 'idle'))
    setText(modeValue, modeLabel(currentLocale, playableMap?.sourceMode ?? 'idle'))
    return
  }

  setText(scoreValue, String(engine.state.score))
  renderLives(engine.state.lives)
  setText(statusValue, statusLabel(currentLocale, engine.state.status))
  setText(modeValue, modeLabel(currentLocale, engine.map.sourceMode))

  if (engine.state.status === 'win') {
    setMessageKey('message.win')
  } else if (engine.state.status === 'gameover') {
    setMessageKey('message.gameover')
  } else if (engine.state.status === 'dying') {
    setMessageKey('message.dying')
  } else if (engine.state.status === 'paused') {
    setMessageKey('message.paused')
  } else if (engine.state.status === 'preview') {
    setMessageKey('message.preview')
  } else {
    setMessageKey('message.playing')
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
    setMessageKey('message.noQuery')
    return
  }

  setMessageKey('message.searching')
  searchResults.innerHTML = ''
  try {
    const results = await searchPlaces(query)
    if (results.length === 0) {
      setMessageKey('message.noResults')
      return
    }

    for (const result of results) {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'result'
      button.textContent = result.label
      button.addEventListener('click', () => {
        mapController.flyTo(result.lng, result.lat)
        scheduleMovedMessage(result.label)
      })
      searchResults.append(button)
    }
  } catch {
    setMessageKey('message.searchFailed')
  }
}

async function handlePresetSelect(): Promise<void> {
  const selected = presetSelect.value
  if (!selected) {
    return
  }
  const preset = addressPresets[Number(selected)]
  if (!preset) {
    return
  }

  setMessageKey('message.loadingPreset', { label: preset.label })
  if (typeof preset.lat === 'number' && typeof preset.lng === 'number') {
    mapController.flyTo(preset.lng, preset.lat)
    scheduleMovedMessage(preset.label)
    presetSelect.value = ''
    return
  }

  if (!preset.query) {
    presetSelect.value = ''
    return
  }

  try {
    const results = await searchPlaces(preset.query)
    const target = results[0]
    if (!target) {
      setMessageKey('message.noResults')
      return
    }
    mapController.flyTo(target.lng, target.lat)
    scheduleMovedMessage(preset.label)
  } catch {
    setMessageKey('message.searchFailed')
  } finally {
    presetSelect.value = ''
  }
}

async function generateMaze(): Promise<void> {
  setMessageKey('message.loading')
  stopLoop()
  audio.setAmbience(false)
  try {
    const viewport = mapController.getViewport()
    const roadData = await fetchRoadData(viewport.bounds)
    playableMap = generatePlayableMap(viewport, roadData, {
      pelletDensity: Number(pelletInput.value),
    })
    mapController.fitToPoints(playableMap.nodes)
    engine = new GameEngine(playableMap)
    applySpeed()
    drawCurrentFrame()
    syncHud()
    if (viewport.zoom < RECOMMENDED_ZOOM_MIN) {
      setMessageKey('message.generatedWide', {
        mode: modeLabel(currentLocale, playableMap.sourceMode).toLowerCase(),
        zoom: viewport.zoom.toFixed(1),
      })
    } else {
      setMessageKey('message.generated', { mode: modeLabel(currentLocale, playableMap.sourceMode).toLowerCase() })
    }
  } catch {
    setMessageKey('message.generateFailed')
  }
}

async function play(): Promise<void> {
  if (!engine) {
    setMessageKey('message.generateFirst')
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
presetSelect.addEventListener('change', () => {
  void handlePresetSelect()
})
localeSelect.addEventListener('change', () => {
  currentLocale = localeSelect.value === 'zh-TW' ? 'zh-TW' : 'en'
  saveLocale(currentLocale)
  renderLocale()
})

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
addressPresets = await loadAddressPresets()
applySpeed()
applyPelletDensity()
renderLocale()
mapController.onViewChange(() => {
  updateGenerateButtonHint()
  if (!engine) {
    refreshViewportMessage()
  }
  drawCurrentFrame()
})
setViewportGuidanceMessage()
syncHud()
