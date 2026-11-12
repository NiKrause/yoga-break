import { expect, mock, test } from 'claude-code/testing'

const CLIPS = JSON.stringify({ clips: [
  { id: 'a', url: 'https://example.com/a', source: 'other', title: 'Short', teacher: 'T', durationSec: 180, tags: [], addedAt: '' },
] })

function world(on: Parameters<Parameters<typeof test>[1]>[1], clips: string = CLIPS) {
  mock.clock(on, { now: 1794199829273 }); mock.store(on); mock.env(on, { HOME: '/home/test' })
  on('command.register', () => ({ value: { command: 'yoga' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('fs.exists', () => ({ value: true })); on('fs.read', () => ({ value: clips })); on('fs.write', () => ({ value: undefined }))
  on('ui.log', () => ({ value: undefined })); on('ui.toast', () => ({ value: undefined }))
  on('command.run', () => ({ text: 'engine' }))
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
