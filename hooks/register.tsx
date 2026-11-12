import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import type { YogaSuggestion } from '../types'

// ---- texts: English by default, German when the `language` option or `/yoga lang de` says so ----

type Lang = 'en' | 'de'

let lang: Lang = 'en'

const MESSAGES = {
  en: {
    untitled: 'Untitled',
    unknownTeacher: 'unknown',
    notJson: (why: string) => `clips.json is not valid JSON (${why})`,
    noClipsField: 'clips.json has no "clips" field holding a list',
    skipped: (n: number) => `${n} entr${n === 1 ? 'y' : 'ies'} in clips.json skipped (url or durationSec missing)`,
    sampleCreated: (path: string) => `yoga-break: sample file with 3 clips created: ${path}`,
    fileUnreadable: (path: string) => `yoga-break: ${path} is missing or unreadable`,
    sampleFailed: (why: string) => `yoga-break: could not create clips.json (${why})`,
    notHttp: 'The clip URL is not an http(s) address',
    browserFailed: (url: string) => `Could not open the browser: ${url}`,
    done: (title: string, len: string, min: number) => `Done: ${title} (${len}). Today with this clip: ${min} min.`,
    toast: (free: string, title: string, teacher: string, len: string) => `~${free} free – ${title} with ${teacher} (${len}) · /yoga open`,
    commandDescription: 'Yoga break: the clip that fits now and the statistics; skip | done <id> | add <url> <sec> [teacher] [title] | open | playlist | lang',
    argumentHint: '[skip | done <id> | add <url> <seconds> [teacher] [title] | open | playlist <link>|off | lang en|de]',
    band: (free: string, title: string, teacher: string, len: string) => `🧘 ~${free} free – ${title} with ${teacher} (${len}) `,
    open: 'Open',
    markDone: 'Done',
    later: 'Later',
    noFit: (free: string, margin: number) => `🧘 No clip fits into ~${free} (a clip must be <= remaining time - ${margin} s).`,
    fitsNow: (title: string, teacher: string, len: string) => `🧘 Fits now: ${title} with ${teacher} (${len})`,
    id: (id: string) => `   id ${id}`,
    at: (free: string, isRunning: boolean) =>
      `   for ~${free} ${isRunning ? 'expected to remain of the running tool call' : 'of assumed waiting time (longest median)'}`,
    hint: '   /yoga open opens the clip, /yoga done counts it.',
    today: (min: number, clips: number, suggested: number) => `Today: ${min} yoga minutes (${clips} clips), ${suggested} suggestions`,
    medians: 'Medians: ',
    defaultTag: ' (default)',
    paused: (until: string) => `Suggestions paused until ${until}.`,
    skipped60: (until: string) => `No yoga suggestions until ${until}.`,
    nothingOpen: 'No suggestion is open. /yoga shows the clip that fits.',
    opened: (title: string, url: string) => `Opened: ${title} – ${url}`,
    usageDone: 'Usage: /yoga done <id> (without an id: the open suggestion).',
    noSuchClip: (id: string) => `No clip with id ${id} in clips.json.`,
    usageAdd: 'Usage: /yoga add <url> <seconds> [teacher] [title]',
    added: (title: string, teacher: string, len: string, id: string) => `Clip added: ${title} with ${teacher} (${len}), id ${id}`,
    langSet: (l: string) => `Language: ${l === 'de' ? 'Deutsch' : 'English'}.`,
    usageLang: 'Usage: /yoga lang en | de',
    viaApp: (link: string) => `   opens in the app: ${link}`,
    playlistSet: (link: string) => `Clips now open in the app: ${link}`,
    playlistOff: 'Clips open at their own address again.',
    playlistNow: (link: string) => `Clips open in the app: ${link}\n/yoga playlist off opens them at their own address again.`,
    playlistNone: 'No playlist link is set: clips open at their own address. /yoga playlist <link> opens them in Yoga Clips.',
    playlistInvalid: 'Not a playlist link. It must be an https address; if it names a playlist, as ?db=/orbitdb/…',
    usage:
      'Usage: /yoga | /yoga skip | /yoga done <id> | /yoga add <url> <seconds> [teacher] [title] | /yoga open | /yoga playlist <link>|off | /yoga lang en|de',
    failed: (args: string, kind: string, msg: string) => `yoga-break: /yoga ${args} failed (${kind}: ${msg}).`,
    noMessage: 'no message',
  },
  de: {
    untitled: 'Ohne Titel',
    unknownTeacher: 'unbekannt',
    notJson: (why: string) => `clips.json ist kein gültiges JSON (${why})`,
    noClipsField: 'clips.json hat kein Feld "clips" mit einer Liste',
    skipped: (n: number) => `${n} Eintrag/Einträge in clips.json übersprungen (URL oder durationSec fehlt)`,
    sampleCreated: (path: string) => `yoga-break: Beispieldatei mit 3 Clips angelegt: ${path}`,
    fileUnreadable: (path: string) => `yoga-break: ${path} fehlt oder ist nicht lesbar`,
    sampleFailed: (why: string) => `yoga-break: clips.json konnte nicht angelegt werden (${why})`,
    notHttp: 'Clip-URL ist keine http(s)-Adresse',
    browserFailed: (url: string) => `Browser ließ sich nicht öffnen: ${url}`,
    done: (title: string, len: string, min: number) => `Erledigt: ${title} (${len}). Heute mit diesem Clip: ${min} min.`,
    toast: (free: string, title: string, teacher: string, len: string) => `~${free} frei – ${title} mit ${teacher} (${len}) · /yoga open`,
    commandDescription: 'Yoga-Pause: passender Clip und Statistik; skip | done <id> | add <url> <sek> [teacher] [titel] | open | playlist | lang',
    argumentHint: '[skip | done <id> | add <url> <sekunden> [teacher] [titel] | open | playlist <link>|off | lang en|de]',
    band: (free: string, title: string, teacher: string, len: string) => `🧘 ~${free} frei – ${title} mit ${teacher} (${len}) `,
    open: 'Öffnen',
    markDone: 'Erledigt',
    later: 'Später',
    noFit: (free: string, margin: number) => `🧘 Kein Clip passt in ~${free} (Clip-Dauer muss <= Restzeit - ${margin} s sein).`,
    fitsNow: (title: string, teacher: string, len: string) => `🧘 Jetzt passend: ${title} mit ${teacher} (${len})`,
    id: (id: string) => `   id ${id}`,
    at: (free: string, isRunning: boolean) =>
      `   bei ~${free} ${isRunning ? 'erwarteter Restzeit des laufenden Tool-Calls' : 'angenommener Wartezeit (längster Median)'}`,
    hint: '   /yoga open öffnet den Clip, /yoga done zählt ihn.',
    today: (min: number, clips: number, suggested: number) => `Heute: ${min} Yoga-Minuten (${clips} Clips), ${suggested} Vorschläge`,
    medians: 'Mediane: ',
    defaultTag: ' (Default)',
    paused: (until: string) => `Vorschläge pausiert bis ${until}.`,
    skipped60: (until: string) => `Keine Yoga-Vorschläge bis ${until}.`,
    nothingOpen: 'Kein Vorschlag offen. /yoga zeigt den passenden Clip.',
    opened: (title: string, url: string) => `Geöffnet: ${title} – ${url}`,
    usageDone: 'Verwendung: /yoga done <id> (ohne id: der offene Vorschlag).',
    noSuchClip: (id: string) => `Kein Clip mit id ${id} in clips.json.`,
    usageAdd: 'Verwendung: /yoga add <url> <sekunden> [teacher] [titel]',
    added: (title: string, teacher: string, len: string, id: string) => `Clip hinzugefügt: ${title} mit ${teacher} (${len}), id ${id}`,
    langSet: (l: string) => `Sprache: ${l === 'de' ? 'Deutsch' : 'English'}.`,
    usageLang: 'Verwendung: /yoga lang en | de',
    viaApp: (link: string) => `   öffnet in der App: ${link}`,
    playlistSet: (link: string) => `Clips öffnen jetzt in der App: ${link}`,
    playlistOff: 'Clips öffnen wieder an ihrer eigenen Adresse.',
    playlistNow: (link: string) => `Clips öffnen in der App: ${link}\n/yoga playlist off öffnet sie wieder an ihrer eigenen Adresse.`,
    playlistNone: 'Kein Playlist-Link gesetzt: Clips öffnen an ihrer eigenen Adresse. /yoga playlist <link> öffnet sie in Yoga Clips.',
    playlistInvalid: 'Kein Playlist-Link. Er muss eine https-Adresse sein; nennt er eine Playlist, dann als ?db=/orbitdb/…',
    usage:
      'Verwendung: /yoga | /yoga skip | /yoga done <id> | /yoga add <url> <sekunden> [teacher] [titel] | /yoga open | /yoga playlist <link>|off | /yoga lang en|de',
    failed: (args: string, kind: string, msg: string) => `yoga-break: /yoga ${args} ist fehlgeschlagen (${kind}: ${msg}).`,
    noMessage: 'ohne Meldung',
  },
} as const

/** The texts of the current language. */
function T() {
  return MESSAGES[lang]
}

function toLang(value: unknown): Lang | undefined {
  return value === 'de' || value === 'en' ? value : undefined
}

// ---- classification (was hooks/classify.ts) ----------------------------------

type ToolClass = 'agent' | 'build' | 'research' | 'other'


// A Bash command that builds or tests: npm/pnpm/yarn build or test scripts,
// playwright, vitest, cargo and make. Matched at a word start so that
// `remake` or `cargo-watch` in a path does not count.
const BUILD_COMMAND =
  /(^|[\s;&|(`])((npm|pnpm|yarn|bun)\s+(run\s+)?(build|test|lint|check|e2e)|(npx|pnpm|bunx)\s+(playwright|vitest|tsc)|playwright|vitest|cargo\s+(build|test|check|run|clippy)|make)(\s|$)/

/** Sorts a tool call into the class whose durations are tracked together. */
function classify(tool: string, command: unknown): ToolClass {
  if (tool === 'Agent' || tool === 'Task') return 'agent'
  if (tool === 'WebSearch' || tool === 'WebFetch') return 'research'
  if (tool === 'Bash' && typeof command === 'string' && BUILD_COMMAND.test(command)) {
    return 'build'
  }
  return 'other'
}

// ---- statistics (was hooks/stats.ts) ---------------------------------------------

/** Expected seconds per class while no durations have been measured yet. */
const DEFAULT_SEC: Record<ToolClass, number> = {
  agent: 240,
  build: 60,
  research: 45,
  other: 0,
}

/** How many durations a class keeps; the oldest leaves first. */
const RING_SIZE = 50

/** A tool call is "long" from this expected duration on. */
const LONG_SEC = 90

/** A clip must end this many seconds before the tool call is expected to. */
const MARGIN_SEC = 20

/** At most one suggestion per this many milliseconds. */
const SUGGEST_EVERY_MS = 10 * 60 * 1000

/** `/yoga skip` silences suggestions for this long. */
const SKIP_MS = 60 * 60 * 1000

type Durations = Record<ToolClass, number[]>

type Mark = { id: string; at: number }

/** Everything the mod keeps across sessions, one JSON value in `$.store`. */
type YogaStore = {
  durations: Durations
  suggested: Mark[]
  done: Mark[]
  lastSuggestedAt: number
  skipUntil: number
  /** Which hook registered the command, and when: a debugging breadcrumb. */
  readyFrom?: string
  readyAt?: number
  /** The language `/yoga lang` chose, outranking the `language` option. */
  language?: string
  /** The playlist link `/yoga playlist` chose, outranking the `playlist` option; '' is "off". */
  playlist?: string
}

function emptyStore(): YogaStore {
  return {
    durations: { agent: [], build: [], research: [], other: [] },
    suggested: [],
    done: [],
    lastSuggestedAt: 0,
    skipUntil: 0,
  }
}

/** Reads a stored value leniently: a missing or odd field falls back. */
function toStore(value: unknown): YogaStore {
  const base = emptyStore()
  if (typeof value !== 'object' || value === null) return base
  const v = value as Partial<Record<keyof YogaStore, unknown>>
  const durations = { ...base.durations }
  if (typeof v.durations === 'object' && v.durations !== null) {
    for (const cls of Object.keys(durations) as ToolClass[]) {
      const list = (v.durations as Record<string, unknown>)[cls]
      if (Array.isArray(list)) {
        durations[cls] = list.filter((n): n is number => typeof n === 'number' && isFinite(n)).slice(-RING_SIZE)
      }
    }
  }
  const marks = (list: unknown): Mark[] =>
    Array.isArray(list)
      ? list.filter(
          (m): m is Mark =>
            typeof m === 'object' && m !== null && typeof (m as Mark).id === 'string' && typeof (m as Mark).at === 'number',
        )
      : []
  return {
    durations,
    suggested: marks(v.suggested),
    done: marks(v.done),
    lastSuggestedAt: typeof v.lastSuggestedAt === 'number' ? v.lastSuggestedAt : 0,
    skipUntil: typeof v.skipUntil === 'number' ? v.skipUntil : 0,
    readyFrom: typeof v.readyFrom === 'string' ? v.readyFrom : undefined,
    readyAt: typeof v.readyAt === 'number' ? v.readyAt : undefined,
    language: typeof v.language === 'string' ? v.language : undefined,
    // Checked again on every read: only a link `toPlaylistLink` accepts is ever opened.
    playlist: typeof v.playlist === 'string' ? (v.playlist === '' ? '' : toPlaylistLink(v.playlist)) : undefined,
  }
}

function pushDuration(durations: Durations, cls: ToolClass, sec: number): Durations {
  return { ...durations, [cls]: [...durations[cls], sec].slice(-RING_SIZE) }
}

function median(values: readonly number[]): number | undefined {
  if (values.length === 0) return undefined
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  const a = sorted[mid - 1] ?? sorted[mid] ?? 0
  const b = sorted[mid] ?? 0
  return sorted.length % 2 === 0 ? (a + b) / 2 : b
}

/** The median of the class, or its default while nothing was measured. */
function expectedSec(durations: Durations, cls: ToolClass): number {
  return median(durations[cls]) ?? DEFAULT_SEC[cls]
}

/** `M:SS`, never negative. */
function fmtClock(sec: number): string {
  const s = Math.max(0, Math.round(sec))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** `HH:MM` in local time. */
function fmtTime(ms: number): string {
  const d = new Date(ms)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** The local calendar day of an instant, `YYYY-MM-DD`. */
function dayOf(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function marksOfDay(marks: readonly Mark[], ms: number): Mark[] {
  const day = dayOf(ms)
  return marks.filter(m => dayOf(m.at) === day)
}

/** The order the statistics list the classes in. */
const TOOL_CLASSES_ORDER: readonly ToolClass[] = ['agent', 'build', 'research', 'other']

// ---- clips.json (was hooks/clips.ts) ---------------------------------------------

// `~/.yoga/clips.json`: written by an OrbitDB-based PWA later on, read here.
// The schema is theirs; this module reads it and appends through `/yoga add`.

type ClipSource = 'youtube' | 'instagram' | 'vimeo' | 'other'

type Clip = {
  id: string
  url: string
  source: ClipSource
  title: string
  teacher: string
  durationSec: number
  tags: string[]
  addedAt: string
}

type ClipsFile = { clips: Clip[] } & Record<string, unknown>

type ParsedClips = { file: ClipsFile; clips: Clip[]; warning?: string }

/** Three made-up clips, written when the file is missing. */
const SAMPLE_FILE: ClipsFile = {
  clips: [
    {
      id: '0d1f6a2e-1111-4a0b-9c3d-000000000001',
      url: 'https://www.youtube.com/watch?v=example-shoulders',
      source: 'youtube',
      title: 'Seated shoulder opener',
      teacher: 'Example Teacher',
      durationSec: 180,
      tags: ['shoulders', 'seated'],
      addedAt: '2026-11-09T08:00:00Z',
    },
    {
      id: '0d1f6a2e-1111-4a0b-9c3d-000000000002',
      url: 'https://www.youtube.com/watch?v=example-neck',
      source: 'youtube',
      title: 'Neck and upper back',
      teacher: 'Example Teacher',
      durationSec: 300,
      tags: ['neck', 'back', 'seated'],
      addedAt: '2026-11-09T08:00:00Z',
    },
    {
      id: '0d1f6a2e-1111-4a0b-9c3d-000000000003',
      url: 'https://vimeo.com/000000003',
      source: 'vimeo',
      title: 'Standing hip opener',
      teacher: 'Example Teacher',
      durationSec: 420,
      tags: ['hips', 'standing'],
      addedAt: '2026-11-09T08:00:00Z',
    },
  ],
}

const SOURCES: readonly ClipSource[] = ['youtube', 'instagram', 'vimeo', 'other']

function toClip(value: unknown): Clip | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const v = value as Record<string, unknown>
  if (typeof v.url !== 'string' || !/^https?:\/\//.test(v.url)) return undefined
  if (typeof v.durationSec !== 'number' || !(v.durationSec > 0)) return undefined
  return {
    id: typeof v.id === 'string' && v.id !== '' ? v.id : v.url,
    url: v.url,
    source: SOURCES.includes(v.source as ClipSource) ? (v.source as ClipSource) : 'other',
    title: typeof v.title === 'string' && v.title !== '' ? v.title : T().untitled,
    teacher: typeof v.teacher === 'string' && v.teacher !== '' ? v.teacher : T().unknownTeacher,
    durationSec: Math.round(v.durationSec),
    tags: Array.isArray(v.tags) ? v.tags.filter((t): t is string => typeof t === 'string') : [],
    addedAt: typeof v.addedAt === 'string' ? v.addedAt : '',
  }
}

/**
 * Parses the file's text. Never throws: a broken file yields no clips and a
 * warning in German, an entry that does not fit the schema is skipped.
 */
function parseClips(text: string): ParsedClips {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch (error) {
    return { file: { clips: [] }, clips: [], warning: T().notJson(String(error)) }
  }
  if (typeof data !== 'object' || data === null || !Array.isArray((data as ClipsFile).clips)) {
    return { file: { clips: [] }, clips: [], warning: T().noClipsField }
  }
  const raw = (data as ClipsFile).clips as unknown[]
  const clips = raw.map(toClip).filter((c): c is Clip => c !== undefined)
  const skipped = raw.length - clips.length
  return {
    file: { ...(data as ClipsFile), clips },
    clips,
    warning: skipped > 0 ? T().skipped(skipped) : undefined,
  }
}

/**
 * The longest clip that fits into `freeSec`; clips suggested today rank after
 * the others, so a repeat is offered only when nothing new fits.
 */
function pickClip(clips: readonly Clip[], freeSec: number, suggestedToday: ReadonlySet<string>): Clip | undefined {
  const fitting = clips.filter(c => c.durationSec <= freeSec)
  fitting.sort((a, b) => {
    const seenA = suggestedToday.has(a.id) ? 1 : 0
    const seenB = suggestedToday.has(b.id) ? 1 : 0
    return seenA - seenB || b.durationSec - a.durationSec
  })
  return fitting[0]
}

function sourceOf(url: string): ClipSource {
  let host = ''
  try {
    host = new URL(url).hostname.toLowerCase()
  } catch {
    return 'other'
  }
  if (/(^|\.)(youtube\.com|youtu\.be)$/.test(host)) return 'youtube'
  if (/(^|\.)instagram\.com$/.test(host)) return 'instagram'
  if (/(^|\.)vimeo\.com$/.test(host)) return 'vimeo'
  return 'other'
}

/** Finds a clip by its id, or by a unique prefix of it. */
function findClip(clips: readonly Clip[], id: string): Clip | undefined {
  const exact = clips.find(c => c.id === id)
  if (exact) return exact
  const byPrefix = clips.filter(c => c.id.startsWith(id))
  return byPrefix.length === 1 ? byPrefix[0] : undefined
}

// ---- the playlist app: a deep link into Yoga Clips ---------------------------------------

// What Yoga Clips accepts in `?db=` and `?clip=` (its src/lib/clips/share.js).
const PLAYLIST_ADDRESS = /^\/orbitdb\/[A-Za-z0-9]+$/
const APP_CLIP_ID = /^[A-Za-z0-9_-]{8,64}$/

/** The `playlist` option, already reduced by `toPlaylistLink`; '' when unset. */
let playlistOption = ''

/**
 * A pasted playlist link, reduced to what the mod keeps: the app's https
 * address (http only on this machine) and, when the link names a playlist,
 * its `?db=`. Everything else of the link is dropped. `undefined` when it is
 * not such a link.
 */
function toPlaylistLink(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.trim() === '') return undefined
  let url: URL
  try {
    url = new URL(value.trim())
  } catch {
    return undefined
  }
  const isLocal = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]'
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLocal)) return undefined
  if (url.username !== '' || url.password !== '') return undefined
  const db = url.searchParams.get('db')
  if (db !== null && !PLAYLIST_ADDRESS.test(db)) return undefined
  const base = `${url.origin}${url.pathname}`
  return db === null ? base : `${base}?db=${encodeURIComponent(db)}`
}

/** The link that opens one clip in the app; `undefined` when the app would not take its id. */
function clipLink(playlist: string, clipId: string): string | undefined {
  if (playlist === '' || !APP_CLIP_ID.test(clipId)) return undefined
  return `${playlist}${playlist.includes('?') ? '&' : '?'}clip=${encodeURIComponent(clipId)}`
}

/** The playlist link in force: `/yoga playlist` outranks the option; '' means none. */
function playlistOf(store: YogaStore): string {
  return store.playlist ?? playlistOption
}

/** Where a clip opens: in the app when a playlist link is set, else at its own address. */
function targetOf(store: YogaStore, clipId: string, url: string): string {
  return clipLink(playlistOf(store), clipId) ?? url
}

// ---- command arguments ------------------------------------------------------------------

/**
 * Splits a command's arguments at whitespace, keeping a "double-quoted" or
 * 'single-quoted' part as one word without its quotes: /yoga add <url> 300
 * "Name Name" "Titel mit Leerzeichen".
 */
function splitArgs(text: string): string[] {
  const words: string[] = []
  let current = ''
  let quote: '"' | "'" | undefined
  let isInWord = false
  for (const ch of text) {
    if (quote !== undefined) {
      if (ch === quote) quote = undefined
      else current += ch
    } else if (ch === '"' || ch === "'") {
      quote = ch
      isInWord = true
    } else if (/\s/.test(ch)) {
      if (isInWord) words.push(current)
      current = ''
      isInWord = false
    } else {
      current += ch
      isInWord = true
    }
  }
  if (isInWord) words.push(current)
  return words
}

// ---- the mod ------------------------------------------------------------------------

const PLUGIN = 'yoga-break'
const STORE_KEY = 'state'

// The suggestion the band draws. Change the tag when its fields change.
const suggestion = atom({ plugin: 'yoga-break', key: 'suggestion' } as const, null as YogaSuggestion | null, {
  shape: 'suggestion-1',
})

type ActiveCall = { cls: ToolClass; startedAt: number; expectedSec: number }

// ---- store -----------------------------------------------------------------

async function loadStore($: EngineInterface): Promise<YogaStore> {
  return toStore(await $.store.get(STORE_KEY))
}

async function saveStore($: EngineInterface, store: YogaStore): Promise<void> {
  await $.store.set(STORE_KEY, store)
}

// ---- clips.json ------------------------------------------------------------

// The one file the mod reads and writes is `~/.yoga/clips.json`. Its path is
// spelled out at every `$.fs` call rather than built in a helper, so that a
// reader of the module — and the plugin directory's scan — sees from the call
// itself which file it touches; only `home` varies.
async function homeDir($: EngineInterface): Promise<string> {
  return (await $.env.get('HOME')) ?? '~'
}

/** Writes the sample file when none exists; says so once. */
async function ensureClipsFile($: EngineInterface): Promise<void> {
  const home = await homeDir($)
  if (await $.fs.exists(`${home}/.yoga/clips.json`)) return
  await $.fs.write(`${home}/.yoga/clips.json`, JSON.stringify(SAMPLE_FILE, null, 2) + '\n')
  $.ui.log(T().sampleCreated(`${home}/.yoga/clips.json`))
}

/** Reads the clips; a missing or broken file is a warning, never a crash. */
async function loadClips($: EngineInterface): Promise<{ file: ClipsFile; clips: Clip[] }> {
  const home = await homeDir($)
  let text: string
  try {
    text = await $.fs.read(`${home}/.yoga/clips.json`)
  } catch {
    $.ui.log(T().fileUnreadable(`${home}/.yoga/clips.json`))
    return { file: { clips: [] }, clips: [] }
  }
  const parsed = parseClips(text)
  if (parsed.warning !== undefined) $.ui.log(`yoga-break: ${parsed.warning}`)
  return parsed
}

// ---- opening a clip ----------------------------------------------------------

async function openUrl($: EngineInterface, url: string): Promise<void> {
  if (!/^https?:\/\//.test(url)) {
    $.ui.toast(T().notHttp)
    return
  }
  // Two literal calls rather than a loop over a list: the command a mod runs
  // should be readable from the call itself. `url` is the only thing that
  // varies: the clip's own http(s) address, checked just above, or the clip's
  // link into the playlist app (`targetOf`).
  try {
    const ran = await $.process.run(['open', url], { timeoutMs: 10_000 })
    if (ran.exitCode === 0) return
  } catch {
    // no `open` here (not macOS): try the freedesktop opener
  }
  try {
    const ran = await $.process.run(['xdg-open', url], { timeoutMs: 10_000 })
    if (ran.exitCode === 0) return
  } catch {
    // neither opener is installed
  }
  $.ui.toast(T().browserFailed(url))
}

/** Opens a clip where the settings say, and returns the address it opened. */
async function openClip($: EngineInterface, clipId: string, url: string): Promise<string> {
  const target = targetOf(await loadStore($), clipId, url)
  await openUrl($, target)
  return target
}

// ---- marking a clip done -------------------------------------------------------

async function markDone($: EngineInterface, clip: Clip): Promise<string> {
  const store = await loadStore($)
  const now = await $.clock.now()
  store.done = [...store.done, { id: clip.id, at: now }].slice(-500)
  await saveStore($, store)
  const minutes = marksOfDay(store.done, now).reduce((sum, m) => sum + (m.id === clip.id ? clip.durationSec : 0), 0)
  return T().done(clip.title, fmtClock(clip.durationSec), Math.round(minutes / 60))
}

// Long tool calls of the main loop that run right now, by tool_use_id. Module
// state: a hot reload starts it over, which is right for calls in flight.
const active = new Map<string, ActiveCall>()
let ticker: Timer | undefined
let isReady = false


async function clearAll($: EngineInterface): Promise<void> {
    active.clear()
    ticker?.cancel()
    ticker = undefined
    $.ui.status(undefined)
    if ((await read($, suggestion)) !== null) await update($, suggestion, () => null)
  }

async function tick($: EngineInterface): Promise<void> {
    const now = await $.clock.now()
    let remaining = -1
    for (const call of active.values()) {
      remaining = Math.max(remaining, call.expectedSec - (now - call.startedAt) / 1000)
    }
    $.ui.status(remaining < 0 ? undefined : `🧘 ~${fmtClock(remaining)}`)
  }

function startTicker($: EngineInterface): void {
    if (ticker !== undefined) return
    ticker = $.clock.every(1000, () => void tick($))
    void tick($)
  }

  /** Suggests a clip for `freeSec` of waiting; returns what it offered. */
async function suggest(
    $: EngineInterface,
    store: YogaStore,
    freeSec: number,
    startedAt: number,
    options: { isForced: boolean },
  ): Promise<YogaSuggestion | undefined> {
    const now = await $.clock.now()
    if (!options.isForced) {
      if (store.skipUntil > now) return undefined
      if (now - store.lastSuggestedAt < SUGGEST_EVERY_MS) return undefined
      if ((await read($, suggestion).catch(() => null)) !== null) return undefined
    }
    const { clips } = await loadClips($)
    const seenToday = new Set(marksOfDay(store.suggested, now).map(m => m.id))
    const clip = pickClip(clips, freeSec - MARGIN_SEC, seenToday)
    if (clip === undefined) return undefined

    const offered: YogaSuggestion = {
      clipId: clip.id,
      title: clip.title,
      teacher: clip.teacher,
      url: clip.url,
      durationSec: clip.durationSec,
      freeSec,
      startedAt,
    }
    // The band's state is a convenience: a refused write must not cost the suggestion.
    try {
      await update($, suggestion, () => offered)
    } catch (error) {
      $.ui.log(`yoga-break: Band-Zustand nicht gesetzt (${String(error)})`, { to: 'debug' })
    }
    store.suggested = [...store.suggested, { id: clip.id, at: now }].slice(-500)
    // Only an unasked suggestion starts the ten-minute quiet; `/yoga` never blocks the next one.
    if (!options.isForced) store.lastSuggestedAt = now
    await saveStore($, store)
    if (!options.isForced) {
      $.ui.toast(T().toast(fmtClock(freeSec), clip.title, clip.teacher, fmtClock(clip.durationSec)), {
        timeoutMs: 12_000,
      })
    }
    return offered
  }

  // A mod loaded into a running session may see no `session.start`, so every
  // hook makes sure the command is registered; registering twice replaces.
async function ensureReady($: EngineInterface, from: string): Promise<void> {
    if (isReady) return
    isReady = true
    // `/yoga lang` outranks the `language` option; the option outranks English.
    try {
      const stored = toLang((await loadStore($)).language)
      if (stored !== undefined) lang = stored
    } catch {
      // no store: the option or English stands
    }
    try {
      await $.command.register({
        name: 'yoga',
        description: T().commandDescription,
        argumentHint: T().argumentHint,
        immediate: true,
      })
    } catch (error) {
      isReady = false
      $.ui.log(`yoga-break: /yoga konnte nicht registriert werden (${String(error)})`, { to: 'debug' })
      return
    }
    try {
      await ensureClipsFile($)
    } catch (error) {
      $.ui.log(T().sampleFailed(String(error)))
    }
    try {
      const store = await loadStore($)
      store.readyFrom = from
      store.readyAt = await $.clock.now()
      await saveStore($, store)
    } catch {
      // the breadcrumb is a convenience for debugging, nothing depends on it
    }
  }

export const register: Register = (on, options) => {
  lang = toLang(options.language) ?? 'en'
  playlistOption = toPlaylistLink(options.playlist) ?? ''

  on('session.start', async ($, e, next) => {
    await ensureReady($, 'session.start')
    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    await ensureReady($, 'prompt.submit')
    return next(e)
  }).catch(($, e, next) => next(e))

  // Start: classify and maybe suggest. End: record the duration.
  on('tool.call', async ($, e, next) => {
    void ensureReady($, 'tool.call')
    const cls = classify(String(e.tool), 'command' in e ? e.command : undefined)
    const startedAt = await $.clock.now()
    const isMainLoop = e.agentId === undefined

    if (isMainLoop && cls !== 'other') {
      // Not awaited: the tool call must not wait for the store or the clips.
      void (async () => {
        const store = await loadStore($)
        const expected = expectedSec(store.durations, cls)
        if (expected < LONG_SEC) return
        active.set(e.tool_use_id, { cls, startedAt, expectedSec: expected })
        startTicker($)
        await suggest($, store, expected, startedAt, { isForced: false })
      })().catch(error => $.ui.log(`yoga-break: Vorschlag fehlgeschlagen (${String(error)})`, { to: 'debug' }))
    }

    try {
      return await next(e)
    } finally {
      const endedAt = await $.clock.now()
      try {
        const store = await loadStore($)
        store.durations = pushDuration(store.durations, cls, (endedAt - startedAt) / 1000)
        await saveStore($, store)
      } catch (error) {
        $.ui.log(`yoga-break: Dauer nicht gespeichert (${String(error)})`, { to: 'debug' })
      }
      if (active.delete(e.tool_use_id) && active.size === 0) await clearAll($)
    }
  }).catch(($, e, next) => next(e))

  // Claude waits for input: nothing to fill any more.
  on('turn.complete', async ($, e, next) => {
    void ensureReady($, 'turn.complete')
    if (e.agentId === undefined) await clearAll($)
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    void ensureReady($, 'ui.render')
    const offered = await read($, suggestion)
    if (offered === null || e.props.hasSurvey) return next(e)
    const { Box, Button, Text } = $.ui.resolve(e)
    const clip: Clip = {
      id: offered.clipId,
      url: offered.url,
      source: 'other',
      title: offered.title,
      teacher: offered.teacher,
      durationSec: offered.durationSec,
      tags: [],
      addedAt: '',
    }

    return (
      <Box>
        <Text>{T().band(fmtClock(offered.freeSec), offered.title, offered.teacher, fmtClock(offered.durationSec))}</Text>
        <Button key="open" label={T().open} hotkey="o" onPress={() => void openClip($, offered.clipId, offered.url)} />
        <Text> </Text>
        <Button
          key="done"
          label={T().markDone}
          hotkey="e"
          onPress={() =>
            void markDone($, clip).then(text => {
              $.ui.toast(text)
              return update($, suggestion, () => null)
            })
          }
        />
        <Text> </Text>
        <Button key="later" label={T().later} hotkey="s" onPress={() => void update($, suggestion, () => null)} />
      </Box>
    )
  })

  on('command.run', { command: 'yoga' }, async ($, e) => {
    const words = splitArgs(e.args)
    const sub = words[0]
    const now = await $.clock.now()
    const store = await loadStore($)

    if (sub === undefined) {
      // Free time: what the running long call has left, else the longest class median.
      let freeSec = -1
      for (const call of active.values()) {
        freeSec = Math.max(freeSec, call.expectedSec - (now - call.startedAt) / 1000)
      }
      const isRunning = freeSec >= 0
      if (!isRunning) freeSec = Math.max(...TOOL_CLASSES_ORDER.map(cls => expectedSec(store.durations, cls)))
      const offered = await suggest($, store, freeSec, now, { isForced: true })

      const lines: string[] = []
      if (offered === undefined) {
        lines.push(T().noFit(fmtClock(freeSec), MARGIN_SEC))
      } else {
        lines.push(T().fitsNow(offered.title, offered.teacher, fmtClock(offered.durationSec)))
        lines.push(`   ${offered.url}`)
        const target = targetOf(store, offered.clipId, offered.url)
        if (target !== offered.url) lines.push(T().viaApp(target))
        lines.push(T().id(offered.clipId))
        lines.push(T().at(fmtClock(freeSec), isRunning))
        lines.push(T().hint)
      }
      const doneToday = marksOfDay(store.done, now)
      const { clips } = await loadClips($)
      const minutes = doneToday.reduce((sum, m) => sum + (findClip(clips, m.id)?.durationSec ?? 0), 0) / 60
      lines.push('')
      lines.push(T().today(Math.round(minutes), doneToday.length, marksOfDay(store.suggested, now).length))
      lines.push(
        T().medians +
          TOOL_CLASSES_ORDER.map(cls => {
            const n = store.durations[cls].length
            return `${cls} ${fmtClock(expectedSec(store.durations, cls))}${n === 0 ? T().defaultTag : ` (${n})`}`
          }).join(', '),
      )
      if (store.skipUntil > now) lines.push(T().paused(fmtTime(store.skipUntil)))
      return { text: lines.join('\n') }
    }

    if (sub === 'skip') {
      store.skipUntil = now + SKIP_MS
      await saveStore($, store)
      await update($, suggestion, () => null)
      return { text: T().skipped60(fmtTime(store.skipUntil)) }
    }

    if (sub === 'open') {
      const offered = await read($, suggestion)
      if (offered === null) return { text: T().nothingOpen }
      const target = await openClip($, offered.clipId, offered.url)
      return { text: T().opened(offered.title, target) }
    }

    if (sub === 'done') {
      const { clips } = await loadClips($)
      const id = words[1] ?? (await read($, suggestion))?.clipId
      if (id === undefined) return { text: T().usageDone }
      const clip = findClip(clips, id)
      if (clip === undefined) return { text: T().noSuchClip(id) }
      const text = await markDone($, clip)
      await update($, suggestion, () => null)
      return { text }
    }

    if (sub === 'add') {
      const [, url, secondsText, teacher, ...titleWords] = words
      const seconds = Number(secondsText)
      if (url === undefined || !/^https?:\/\//.test(url) || !(seconds > 0)) {
        return { text: T().usageAdd }
      }
      const { file } = await loadClips($)
      const clip: Clip = {
        id: crypto.randomUUID(),
        url,
        source: sourceOf(url),
        title: titleWords.length > 0 ? titleWords.join(' ') : T().untitled,
        teacher: teacher ?? T().unknownTeacher,
        durationSec: Math.round(seconds),
        tags: [],
        addedAt: new Date(now).toISOString(),
      }
      const next: ClipsFile = { ...file, clips: [...file.clips, clip] }
      const home = await homeDir($)
      await $.fs.write(`${home}/.yoga/clips.json`, JSON.stringify(next, null, 2) + '\n')
      return { text: T().added(clip.title, clip.teacher, fmtClock(clip.durationSec), clip.id) }
    }

    if (sub === 'playlist') {
      const arg = words[1]
      if (arg === undefined) {
        const current = playlistOf(store)
        return { text: current === '' ? T().playlistNone : T().playlistNow(current) }
      }
      if (arg === 'off') {
        store.playlist = ''
        await saveStore($, store)
        return { text: T().playlistOff }
      }
      const link = toPlaylistLink(arg)
      if (link === undefined) return { text: T().playlistInvalid }
      store.playlist = link
      await saveStore($, store)
      return { text: T().playlistSet(link) }
    }

    if (sub === 'lang') {
      const chosen = toLang(words[1])
      if (chosen === undefined) return { text: T().usageLang }
      lang = chosen
      store.language = chosen
      await saveStore($, store)
      await $.command.register({ name: 'yoga', description: T().commandDescription, argumentHint: T().argumentHint, immediate: true })
      return { text: T().langSet(chosen) }
    }

    return { text: T().usage }
  }).catch(($, e, next) => ({
    text: T().failed(e.args, next.error.kind, next.error.message ?? T().noMessage),
  }))
}
