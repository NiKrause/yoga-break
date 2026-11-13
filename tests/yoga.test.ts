import { expect, mock, test } from 'claude-code/testing'

const CLIPS = JSON.stringify({ clips: [
  { id: 'a', url: 'https://example.com/a', source: 'other', title: 'Short', teacher: 'T', durationSec: 180, tags: [], addedAt: '' },
] })

function world(on: Parameters<Parameters<typeof test>[1]>[1], clips: string = CLIPS, stored?: Record<string, unknown>) {
  const clock = mock.clock(on, { now: 1794199829273 }); mock.store(on, stored); mock.env(on, { HOME: '/home/test' })
  on('command.register', () => ({ value: { command: 'yoga' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('fs.exists', () => ({ value: true })); on('fs.read', () => ({ value: clips })); on('fs.write', () => ({ value: undefined }))
  const toasts: string[] = []
  const statuses: (string | undefined)[] = []
  on('ui.log', () => ({ value: undefined }))
  on('ui.toast', (_, e) => { toasts.push(e.text); return { value: undefined } })
  on('ui.status', (_, e) => { statuses.push(e.text); return { value: undefined } })
  on('command.run', () => ({ text: 'engine' }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  return { clock, toasts, statuses }
}

function turnEnd(turnId: string, reason: 'answer' | 'aborted' = 'answer') {
  return { turnId, reason, answer: 'done', durationMs: 0, isAborted: reason === 'aborted' } as const
}

test('English by default', async ($, on) => {
  world(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ran = await $.command.run({ command: 'yoga', args: '' })
  expect(ran.text).toContain('Fits now: Short with T (3:00)')
  expect(ran.text).toContain('Medians: agent 4:00 (default)')
})

test('German through the language option', { options: { language: 'de' } }, async ($, on) => {
  world(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ran = await $.command.run({ command: 'yoga', args: '' })
  expect(ran.text).toContain('Jetzt passend: Short mit T (3:00)')
})

test('/yoga lang de switches and sticks in the store', async ($, on) => {
  world(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  expect((await $.command.run({ command: 'yoga', args: 'lang de' })).text).toBe('Sprache: Deutsch.')
  expect((await $.command.run({ command: 'yoga', args: 'skip' })).text).toContain('Keine Yoga-Vorschläge bis')
  expect((await $.command.run({ command: 'yoga', args: 'lang xx' })).text).toBe('Verwendung: /yoga lang en | de')
})

// A clip whose id Yoga Clips takes in `?clip=` (8 to 64 url-safe characters), and one it would not.
const APP_CLIPS = JSON.stringify({ clips: [
  { id: 'clip-0001', url: 'https://example.com/long', source: 'other', title: 'Long', teacher: 'T', durationSec: 200, tags: [], addedAt: '' },
  { id: 'a', url: 'https://example.com/a', source: 'other', title: 'Short', teacher: 'T', durationSec: 100, tags: [], addedAt: '' },
] })

function appWorld(on: Parameters<Parameters<typeof test>[1]>[1], clips: string): string[][] {
  world(on, clips)
  const ran: string[][] = []
  on('process.run', (_, e) => {
    ran.push([...e.argv])
    return { value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  return ran
}

test('without a playlist link a clip opens at its own address', async ($, on) => {
  const ran = appWorld(on, APP_CLIPS)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  expect((await $.command.run({ command: 'yoga', args: 'playlist' })).text).toContain('No playlist link is set')
  expect((await $.command.run({ command: 'yoga', args: '' })).text).not.toContain('opens in the app')
  await $.command.run({ command: 'yoga', args: 'open' })
  expect(ran).toEqual([['open', 'https://example.com/long']])
})

test('/yoga playlist keeps the app address and ?db= only, and a clip opens there', async ($, on) => {
  const ran = appWorld(on, APP_CLIPS)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const set = await $.command.run({ command: 'yoga', args: 'playlist https://clips.example.com/?db=/orbitdb/zdpuExample123&x=1#frag' })
  expect(set.text).toBe('Clips now open in the app: https://clips.example.com/?db=%2Forbitdb%2FzdpuExample123')
  const shown = await $.command.run({ command: 'yoga', args: '' })
  expect(shown.text).toContain('opens in the app: https://clips.example.com/?db=%2Forbitdb%2FzdpuExample123&clip=clip-0001')
  const opened = await $.command.run({ command: 'yoga', args: 'open' })
  expect(opened.text).toContain('https://clips.example.com/?db=%2Forbitdb%2FzdpuExample123&clip=clip-0001')
  expect(ran).toEqual([['open', 'https://clips.example.com/?db=%2Forbitdb%2FzdpuExample123&clip=clip-0001']])

  expect((await $.command.run({ command: 'yoga', args: 'playlist off' })).text).toBe('Clips open at their own address again.')
  await $.command.run({ command: 'yoga', args: 'open' })
  expect(ran[1]).toEqual(['open', 'https://example.com/long'])
})

test('a clip whose id the app would not take opens at its own address', async ($, on) => {
  const ran = appWorld(on, CLIPS)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run({ command: 'yoga', args: 'playlist https://clips.example.com/' })
  await $.command.run({ command: 'yoga', args: '' })
  await $.command.run({ command: 'yoga', args: 'open' })
  expect(ran).toEqual([['open', 'https://example.com/a']])
})

test('the playlist option works, and /yoga playlist off outranks it', { options: { playlist: 'https://clips.example.com/app/' } }, async ($, on) => {
  const ran = appWorld(on, APP_CLIPS)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run({ command: 'yoga', args: '' })
  await $.command.run({ command: 'yoga', args: 'open' })
  expect(ran).toEqual([['open', 'https://clips.example.com/app/?clip=clip-0001']])
  await $.command.run({ command: 'yoga', args: 'playlist off' })
  await $.command.run({ command: 'yoga', args: 'open' })
  expect(ran[1]).toEqual(['open', 'https://example.com/long'])
})

test('a link that is not a playlist link is refused', async ($, on) => {
  appWorld(on, APP_CLIPS)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  for (const link of [
    'http://clips.example.com/',
    'ftp://clips.example.com/',
    'https://user:secret@clips.example.com/',
    'https://clips.example.com/?db=../../etc',
    'not-a-link',
  ]) {
    expect((await $.command.run({ command: 'yoga', args: `playlist ${link}` })).text).toContain('Not a playlist link')
  }
  expect((await $.command.run({ command: 'yoga', args: 'playlist http://localhost:4273/' })).text).toBe(
    'Clips now open in the app: http://localhost:4273/',
  )
})

// ---- turns: the time from the person's message until Claude waits for them again ----

test('a turn that runs past its first minute gets a suggestion and a countdown, and its length is kept', async ($, on) => {
  const { clock, toasts, statuses } = world(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.turn.start({ text: 'build it', turnId: 't1' })
  await clock.advance(59_000)
  expect(toasts).toEqual([])
  await clock.advance(1_000)
  // No turn measured yet: a long turn is assumed to come to 5:00, so 4:00 are left.
  expect(toasts).toEqual(['~4:00 free – Short with T (3:00) · /yoga open'])
  expect(statuses.at(-1)).toBe('🧘 ~4:00')
  await clock.advance(10_000)
  expect(statuses.at(-1)).toBe('🧘 ~3:50')
  await clock.advance(110_000)
  await $.turn.complete(turnEnd('t1'))
  expect(statuses.at(-1)).toBe(undefined)
  // One suggestion for the whole turn: the later checks found it open.
  expect(toasts.length).toBe(1)
  expect((await $.command.run({ command: 'yoga', args: '' })).text).toContain('Long turns (1 min or more): 1 measured, assuming 5:00 until there are 3')
})

test('a short turn gets no suggestion and is not kept', async ($, on) => {
  const { clock, toasts, statuses } = world(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.turn.start({ text: 'hi', turnId: 't1' })
  await clock.advance(30_000)
  await $.turn.complete(turnEnd('t1'))
  await clock.advance(120_000)
  expect(toasts).toEqual([])
  expect(statuses.filter(s => s !== undefined)).toEqual([])
  expect((await $.command.run({ command: 'yoga', args: '' })).text).toContain('0 measured')
})

test('measured turns replace the assumption: short long-turns mean no suggestion, an interrupted turn is not kept', async ($, on) => {
  // Three kept turns of 1:40, 1:50 and 2:00: at the first check 0:50 are left, less than 1:30.
  const { clock, toasts } = world(on, CLIPS, { state: { turns: [100, 110, 120] } })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.turn.start({ text: 'x', turnId: 't1' })
  await clock.advance(100_000)
  await $.turn.complete(turnEnd('t1', 'aborted'))
  expect(toasts).toEqual([])
  expect((await $.command.run({ command: 'yoga', args: '' })).text).toContain('Long turns (1 min or more): median 1:50 (3)')
})

test('the estimate is the median of the kept turns that ran at least as long', async ($, on) => {
  const { clock, toasts } = world(on, CLIPS, { state: { turns: [70, 80, 600, 600, 600] } })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.turn.start({ text: 'x', turnId: 't1' })
  await clock.advance(60_000)
  // At 1:00 the median of all five is 10:00, so 9:00 are left.
  expect(toasts).toEqual(['~9:00 free – Short with T (3:00) · /yoga open'])
  await $.turn.complete(turnEnd('t1'))
})

test('time spent answering a question is not waiting time and not part of the turn', async ($, on) => {
  const { clock, toasts } = world(on)
  // The question stays open for 1:30.
  on('tool.call', async () => { await clock.advance(90_000); return { result: {} } })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.turn.start({ text: 'x', turnId: 't1' })
  await $.tool.call({ tool: 'AskUserQuestion', questions: [] })
  // The check at 1:00 fell into the question; at 2:00 the turn has run 0:30 by its own count.
  await clock.advance(30_000)
  expect(toasts).toEqual([])
  // At 3:00 it has run 1:30: 3:30 of the assumed 5:00 are left.
  await clock.advance(60_000)
  expect(toasts).toEqual(['~3:30 free – Short with T (3:00) · /yoga open'])
  await $.turn.complete(turnEnd('t1'))
})
