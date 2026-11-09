import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import type { YogaSuggestion } from '../types'

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
      url: 'https://www.youtube.com/watch?v=beispiel-schultern',
      source: 'youtube',
      title: 'Schulteröffner im Sitzen',
      teacher: 'Beispiel-Lehrerin',
      durationSec: 180,
      tags: ['schultern', 'sitzen'],
      addedAt: '2026-11-09T08:00:00Z',
    },
    {
      id: '0d1f6a2e-1111-4a0b-9c3d-000000000002',
      url: 'https://www.youtube.com/watch?v=beispiel-nacken',
      source: 'youtube',
      title: 'Nacken und oberer Rücken',
      teacher: 'Beispiel-Lehrer',
      durationSec: 300,
      tags: ['nacken', 'ruecken', 'sitzen'],
      addedAt: '2026-11-09T08:00:00Z',
    },
    {
      id: '0d1f6a2e-1111-4a0b-9c3d-000000000003',
      url: 'https://vimeo.com/000000003',
      source: 'vimeo',
      title: 'Hüftöffner im Stehen',
      teacher: 'Beispiel-Lehrerin',
      durationSec: 420,
      tags: ['huefte', 'stehen'],
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
    title: typeof v.title === 'string' && v.title !== '' ? v.title : 'Ohne Titel',
    teacher: typeof v.teacher === 'string' && v.teacher !== '' ? v.teacher : 'unbekannt',
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
    return { file: { clips: [] }, clips: [], warning: `clips.json ist kein gültiges JSON (${String(error)})` }
  }
  if (typeof data !== 'object' || data === null || !Array.isArray((data as ClipsFile).clips)) {
    return { file: { clips: [] }, clips: [], warning: 'clips.json hat kein Feld "clips" mit einer Liste' }
  }
  const raw = (data as ClipsFile).clips as unknown[]
  const clips = raw.map(toClip).filter((c): c is Clip => c !== undefined)
  const skipped = raw.length - clips.length
  return {
    file: { ...(data as ClipsFile), clips },
    clips,
    warning: skipped > 0 ? `${skipped} Eintrag/Einträge in clips.json übersprungen (URL oder durationSec fehlt)` : undefined,
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

// ---- /yoga debug: which nouns of `$` work here -------------------------------------------

type ProbeResult = { name: string; ok: boolean; detail: string }

async function tryProbe(name: string, run: () => Promise<string>): Promise<ProbeResult> {
  try {
    return { name, ok: true, detail: await run() }
  } catch (error) {
    return { name, ok: false, detail: error instanceof Error ? `${error.name}: ${error.message}` : String(error) }
  }
}

/** Tries every host noun the mod relies on and reports each outcome, in German. */
async function probe($: EngineInterface, isReady: boolean): Promise<string> {
  const root = $.plugin.root
  const results: ProbeResult[] = []
  results.push(await tryProbe('clock.now', async () => new Date(await $.clock.now()).toISOString()))
  results.push(await tryProbe('env.get HOME', async () => String(await $.env.get('HOME'))))
  results.push(await tryProbe('fs.exists <root>', async () => String(await $.fs.exists(root))))
  results.push(await tryProbe('fs.exists ~/.yoga/clips.json', async () => `${await clipsPath($)} -> ${await $.fs.exists(await clipsPath($))}`))
  results.push(await tryProbe('fs.write ~/.yoga/debug-probe.txt', async () => {
    await $.fs.write((await clipsPath($)).replace(/clips\.json$/, 'debug-probe.txt'), 'fs.write ok\n')
    return 'geschrieben'
  }))
  results.push(await tryProbe('store.get', async () => JSON.stringify(await $.store.get(STORE_KEY))?.slice(0, 120) ?? 'undefined'))
  results.push(await tryProbe('store.set probe', async () => {
    await $.store.set('probe', { at: await $.clock.now() })
    return 'gesetzt'
  }))
  results.push(await tryProbe('state.get suggestion', async () => JSON.stringify(await read($, suggestion))))
  results.push(await tryProbe('process.run true', async () => {
    const ran = await $.process.run(['true'], { timeoutMs: 5000 })
    return `exit ${ran.exitCode}`
  }))
  const lines = [
    `yoga-break Diagnose · Mod-Ordner ${root} · /yoga registriert: ${isReady ? 'ja' : 'nein'}`,
    ...results.map(r => `${r.ok ? 'OK  ' : 'FEHL'} ${r.name}: ${r.detail}`),
  ]
  const report = lines.join('\n')
  // The report also goes to a file next to clips.json (never into the mod folder,
  // which a session under development watches and reloads on every write).
  const reportPath = (await clipsPath($)).replace(/clips\.json$/, 'debug-report.txt')
  await tryProbe('fs.write report', async () => {
    await $.fs.write(reportPath, report + '\n')
    return ''
  })
  return report + `\n(Bericht auch in ${reportPath})`
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

async function clipsPath($: EngineInterface): Promise<string> {
  const home = (await $.env.get('HOME')) ?? '~'
  return `${home}/.yoga/clips.json`
}

/** Writes the sample file when none exists; says so once. */
async function ensureClipsFile($: EngineInterface): Promise<void> {
  const path = await clipsPath($)
  if (await $.fs.exists(path)) return
  await $.fs.write(path, JSON.stringify(SAMPLE_FILE, null, 2) + '\n')
  $.ui.log(`yoga-break: Beispieldatei mit 3 Clips angelegt: ${path}`)
}

/** Reads the clips; a missing or broken file is a warning, never a crash. */
async function loadClips($: EngineInterface): Promise<{ file: ClipsFile; clips: Clip[] }> {
  const path = await clipsPath($)
  let text: string
  try {
    text = await $.fs.read(path)
  } catch {
    $.ui.log(`yoga-break: ${path} fehlt oder ist nicht lesbar`)
    return { file: { clips: [] }, clips: [] }
  }
  const parsed = parseClips(text)
  if (parsed.warning !== undefined) $.ui.log(`yoga-break: ${parsed.warning}`)
  return parsed
}

// ---- opening a clip ----------------------------------------------------------

async function openUrl($: EngineInterface, url: string): Promise<void> {
  if (!/^https?:\/\//.test(url)) {
    $.ui.toast('Clip-URL ist keine http(s)-Adresse')
    return
  }
  for (const argv of [['open', url], ['xdg-open', url]]) {
    try {
      const ran = await $.process.run(argv, { timeoutMs: 10_000 })
      if (ran.exitCode === 0) return
    } catch {
      // the opener is not installed on this platform: try the next one
    }
  }
  $.ui.toast(`Browser ließ sich nicht öffnen: ${url}`)
}

// ---- marking a clip done -------------------------------------------------------

async function markDone($: EngineInterface, clip: Clip): Promise<string> {
  const store = await loadStore($)
  const now = await $.clock.now()
  store.done = [...store.done, { id: clip.id, at: now }].slice(-500)
  await saveStore($, store)
  const minutes = marksOfDay(store.done, now).reduce((sum, m) => sum + (m.id === clip.id ? clip.durationSec : 0), 0)
  return `Erledigt: ${clip.title} (${fmtClock(clip.durationSec)}). Heute mit diesem Clip: ${Math.round(minutes / 60)} min.`
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
      $.ui.toast(`~${fmtClock(freeSec)} frei – ${clip.title} mit ${clip.teacher} (${fmtClock(clip.durationSec)}) · /yoga open`, {
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
    try {
      await $.command.register({
        name: 'yoga',
        description: 'Yoga-Pause: passender Clip und Statistik; skip | done <id> | add <url> <sek> [teacher] [titel] | open',
        argumentHint: '[skip | done <id> | add <url> <sekunden> [teacher] [titel] | open]',
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
      $.ui.log(`yoga-break: clips.json konnte nicht angelegt werden (${String(error)})`)
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

export const register: Register = on => {
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
        <Text>
          🧘 ~{fmtClock(offered.freeSec)} frei – {offered.title} mit {offered.teacher} ({fmtClock(offered.durationSec)}){' '}
        </Text>
        <Button key="open" label="Öffnen" hotkey="o" onPress={() => void openUrl($, offered.url)} />
        <Text> </Text>
        <Button
          key="done"
          label="Erledigt"
          hotkey="e"
          onPress={() =>
            void markDone($, clip).then(text => {
              $.ui.toast(text)
              return update($, suggestion, () => null)
            })
          }
        />
        <Text> </Text>
        <Button key="later" label="Später" hotkey="s" onPress={() => void update($, suggestion, () => null)} />
      </Box>
    )
  })

  on('command.run', { command: 'yoga' }, async ($, e) => {
    const words = splitArgs(e.args)
    const sub = words[0]
    if (sub === 'debug') return { text: await probe($, isReady) }

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
        lines.push(`🧘 Kein Clip passt in ~${fmtClock(freeSec)} (Clip-Dauer muss <= Restzeit - ${MARGIN_SEC} s sein).`)
      } else {
        lines.push(`🧘 Jetzt passend: ${offered.title} mit ${offered.teacher} (${fmtClock(offered.durationSec)})`)
        lines.push(`   ${offered.url}`)
        lines.push(`   id ${offered.clipId}`)
        lines.push(
          `   bei ~${fmtClock(freeSec)} ${isRunning ? 'erwarteter Restzeit des laufenden Tool-Calls' : 'angenommener Wartezeit (längster Median)'}`,
        )
        lines.push('   /yoga open öffnet den Clip, /yoga done zählt ihn.')
      }
      const doneToday = marksOfDay(store.done, now)
      const { clips } = await loadClips($)
      const minutes = doneToday.reduce((sum, m) => sum + (findClip(clips, m.id)?.durationSec ?? 0), 0) / 60
      lines.push('')
      lines.push(`Heute: ${Math.round(minutes)} Yoga-Minuten (${doneToday.length} Clips), ${marksOfDay(store.suggested, now).length} Vorschläge`)
      lines.push(
        'Mediane: ' +
          TOOL_CLASSES_ORDER.map(cls => {
            const n = store.durations[cls].length
            return `${cls} ${fmtClock(expectedSec(store.durations, cls))}${n === 0 ? ' (Default)' : ` (${n})`}`
          }).join(', '),
      )
      if (store.skipUntil > now) lines.push(`Vorschläge pausiert bis ${fmtTime(store.skipUntil)}.`)
      return { text: lines.join('\n') }
    }

    if (sub === 'skip') {
      store.skipUntil = now + SKIP_MS
      await saveStore($, store)
      await update($, suggestion, () => null)
      return { text: `Keine Yoga-Vorschläge bis ${fmtTime(store.skipUntil)}.` }
    }

    if (sub === 'open') {
      const offered = await read($, suggestion)
      if (offered === null) return { text: 'Kein Vorschlag offen. /yoga zeigt den passenden Clip.' }
      await openUrl($, offered.url)
      return { text: `Geöffnet: ${offered.title} – ${offered.url}` }
    }

    if (sub === 'done') {
      const { clips } = await loadClips($)
      const id = words[1] ?? (await read($, suggestion))?.clipId
      if (id === undefined) return { text: 'Verwendung: /yoga done <id> (ohne id: der offene Vorschlag).' }
      const clip = findClip(clips, id)
      if (clip === undefined) return { text: `Kein Clip mit id ${id} in clips.json.` }
      const text = await markDone($, clip)
      await update($, suggestion, () => null)
      return { text }
    }

    if (sub === 'add') {
      const [, url, secondsText, teacher, ...titleWords] = words
      const seconds = Number(secondsText)
      if (url === undefined || !/^https?:\/\//.test(url) || !(seconds > 0)) {
        return { text: 'Verwendung: /yoga add <url> <sekunden> [teacher] [titel]' }
      }
      const { file } = await loadClips($)
      const clip: Clip = {
        id: crypto.randomUUID(),
        url,
        source: sourceOf(url),
        title: titleWords.length > 0 ? titleWords.join(' ') : 'Ohne Titel',
        teacher: teacher ?? 'unbekannt',
        durationSec: Math.round(seconds),
        tags: [],
        addedAt: new Date(now).toISOString(),
      }
      const next: ClipsFile = { ...file, clips: [...file.clips, clip] }
      await $.fs.write(await clipsPath($), JSON.stringify(next, null, 2) + '\n')
      return { text: `Clip hinzugefügt: ${clip.title} mit ${clip.teacher} (${fmtClock(clip.durationSec)}), id ${clip.id}` }
    }

    return { text: 'Verwendung: /yoga | /yoga skip | /yoga done <id> | /yoga add <url> <sekunden> [teacher] [titel] | /yoga open' }
  }).catch(($, e, next) => ({
    text: `yoga-break: /yoga ${e.args} ist fehlgeschlagen (${next.error.kind}: ${next.error.message ?? 'ohne Meldung'}).`,
  }))
}
