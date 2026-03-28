import type { GameStatus, SourceMode } from './types'

export type Locale = 'en' | 'zh-TW'

type Params = Record<string, string | number>
type Entry = string | ((params: Params) => string)

const LOCALE_STORAGE_KEY = 'map-pacman-locale'

const translations: Record<Locale, Record<string, Entry>> = {
  en: {
    'app.eyebrow': 'Map Pac-Man',
    'app.title': 'Pac-Man on Map',
    'app.intro': 'Turn map roads into a playable Pac-Man layout.',
    'controls.language': 'Language',
    'controls.presets': 'Preset Places',
    'controls.search': 'Search',
    'controls.speed': 'Speed',
    'controls.pellets': 'Pellets',
    'buttons.search': 'Search',
    'buttons.generate': 'Generate Road Maze',
    'buttons.generateGoodHint': ({ zoom }) => `Current zoom ${zoom}. This is in the sweet spot for a playable maze.`,
    'buttons.generateWideHint': ({ zoom }) => `Current zoom ${zoom}. This area is pretty wide, so the maze may be harder to clear. Zoom in a bit if you want tighter gameplay.`,
    'buttons.generateTightHint': ({ zoom }) => `Current zoom ${zoom}. This is already quite close in. You can still play, or zoom out a little for a larger area.`,
    'buttons.play': 'Play',
    'buttons.pause': 'Pause',
    'buttons.restart': 'Restart',
    'stats.mode': 'Mode',
    'stats.score': 'Score',
    'stats.lives': 'Lives',
    'stats.status': 'Status',
    'tips.controls': 'Controls: Arrow keys / WASD',
    'tips.generate': 'Move the map to the area you want, then press <code>Generate Road Maze</code>.',
    'presets.placeholder': 'Select a preset place',
    'search.placeholder': 'For example: Shibuya Crossing, Taipei 101, Manhattan',
    'message.initial': 'Move to a city block and generate a road-based maze.',
    'message.viewportGood': ({ zoom, range }) => `Current zoom is ${zoom}. Around ${range} is a good range for generating a playable maze.`,
    'message.viewportWide': ({ zoom, range }) => `Current zoom is ${zoom}. This area is a bit wide; around ${range} usually feels better for gameplay.`,
    'message.viewportTight': ({ zoom, range }) => `Current zoom is ${zoom}. This is already pretty close in; around ${range} is the usual sweet spot.`,
    'message.noQuery': 'Enter a place name first.',
    'message.searching': 'Searching places...',
    'message.loadingPreset': ({ label }) => `Loading preset: ${label}...`,
    'message.noResults': 'No results found.',
    'message.moved': ({ label, zoom, range }) => `Moved to ${label}. Current zoom is ${zoom}; around ${range} usually plays better.`,
    'message.searchFailed': 'Search failed. Try another place or drag the map manually.',
    'message.loading': 'Loading road network and rebuilding the maze on top of it...',
    'message.generated': ({ mode }) => `Generated a ${mode} road maze. Press Play.`,
    'message.generatedWide': ({ mode, zoom }) => `Generated a ${mode} road maze. Current zoom is ${zoom}, so this one may feel a bit wide.`,
    'message.generateFailed': 'Maze generation failed. Try another area or zoom level.',
    'message.generateFirst': 'Generate a maze first.',
    'message.win': 'Cleared. Generate another district or restart this run.',
    'message.gameover': 'Game over. Restart to replay this road layout.',
    'message.dying': 'Ouch. Respawning...',
    'message.paused': 'Paused.',
    'message.preview': 'Road maze ready. Press Play or use direction keys.',
    'message.playing': 'Pellets, ghosts, and movement are following the road graph itself.',
    'mode.idle': 'Idle',
    'mode.road': 'Road',
    'mode.hybrid': 'Hybrid',
    'mode.generated': 'Generated',
    'status.idle': 'Idle',
    'status.preview': 'Preview',
    'status.playing': 'Playing',
    'status.paused': 'Paused',
    'status.dying': 'Dying',
    'status.gameover': 'Game Over',
    'status.win': 'Win',
  },
  'zh-TW': {
    'app.eyebrow': '地圖小精靈',
    'app.title': 'Pac-Man on Map',
    'app.intro': '把地圖道路轉成可玩的 Pac-Man 關卡。',
    'controls.language': '語言',
    'controls.presets': '預設地點',
    'controls.search': '地點搜尋',
    'controls.speed': '速度',
    'controls.pellets': '豆子',
    'buttons.search': '搜尋',
    'buttons.generate': '產生地圖迷宮',
    'buttons.generateGoodHint': ({ zoom }) => `目前縮放是 ${zoom}。這個範圍通常剛好，遊玩感會比較好。`,
    'buttons.generateWideHint': ({ zoom }) => `目前縮放是 ${zoom}。範圍有點大，迷宮仍可玩，但通常會比較難清完。想更順手可以再放大一點地圖。`,
    'buttons.generateTightHint': ({ zoom }) => `目前縮放是 ${zoom}。現在已經算蠻近了，想要更多街道的話可以再縮小一點。`,
    'buttons.play': '開始',
    'buttons.pause': '暫停',
    'buttons.restart': '重來',
    'stats.mode': '模式',
    'stats.score': '分數',
    'stats.lives': '生命',
    'stats.status': '狀態',
    'tips.controls': '操作：方向鍵 / WASD',
    'tips.generate': '先把地圖移到想玩的區域，再按 <code>產生地圖迷宮</code>。',
    'presets.placeholder': '選擇預設地點',
    'search.placeholder': '例如：澀谷十字路口、台北 101、曼哈頓',
    'message.initial': '先移動到想玩的街區，再產生道路迷宮。',
    'message.viewportGood': ({ zoom, range }) => `目前縮放是 ${zoom}。通常在 ${range} 之間產生迷宮會比較剛好。`,
    'message.viewportWide': ({ zoom, range }) => `目前縮放是 ${zoom}。範圍有點大，通常在 ${range} 之間遊玩會更順手。`,
    'message.viewportTight': ({ zoom, range }) => `目前縮放是 ${zoom}。現在已經蠻近了，通常 ${range} 會是比較剛好的範圍。`,
    'message.noQuery': '請先輸入地點名稱。',
    'message.searching': '正在搜尋地點...',
    'message.loadingPreset': ({ label }) => `正在載入預設地點：${label}...`,
    'message.noResults': '找不到結果。',
    'message.moved': ({ label, zoom, range }) => `已移動到 ${label}。目前縮放是 ${zoom}，通常在 ${range} 之間會比較好玩。`,
    'message.searchFailed': '搜尋失敗，請換個地點或直接拖曳地圖。',
    'message.loading': '正在載入路網並重建可玩的道路迷宮...',
    'message.generated': ({ mode }) => `已產生 ${mode} 迷宮，按開始遊玩。`,
    'message.generatedWide': ({ mode, zoom }) => `已產生 ${mode} 迷宮，目前縮放是 ${zoom}，所以這張可能會顯得有點大。`,
    'message.generateFailed': '迷宮產生失敗，請換個區域或縮放層級。',
    'message.generateFirst': '請先產生迷宮。',
    'message.win': '過關了。可以重新產生別的區域，或重玩這張圖。',
    'message.gameover': '遊戲結束。按重來可再次挑戰。',
    'message.dying': '被抓到了，準備重生...',
    'message.paused': '已暫停。',
    'message.preview': '道路迷宮已準備好，按開始或直接用方向鍵。',
    'message.playing': '豆子、鬼和移動都會沿著道路圖進行。',
    'mode.idle': '待機',
    'mode.road': '道路',
    'mode.hybrid': '混合',
    'mode.generated': '生成',
    'status.idle': '待機',
    'status.preview': '預覽',
    'status.playing': '遊玩中',
    'status.paused': '已暫停',
    'status.dying': '死亡中',
    'status.gameover': '遊戲結束',
    'status.win': '過關',
  },
}

export const localeOptions: Array<{ value: Locale; label: string }> = [
  { value: 'en', label: 'English' },
  { value: 'zh-TW', label: '繁體中文' },
]

export function translate(locale: Locale, key: string, params: Params = {}): string {
  const entry = translations[locale][key] ?? translations.en[key] ?? key
  if (typeof entry === 'function') {
    return entry(params)
  }
  return entry.replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? ''))
}

export function modeLabel(locale: Locale, mode: SourceMode | 'idle'): string {
  return translate(locale, `mode.${mode}`)
}

export function statusLabel(locale: Locale, status: GameStatus): string {
  return translate(locale, `status.${status}`)
}

export function loadLocale(): Locale {
  const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY)
  return stored === 'zh-TW' ? 'zh-TW' : 'en'
}

export function saveLocale(locale: Locale): void {
  window.localStorage.setItem(LOCALE_STORAGE_KEY, locale)
}
