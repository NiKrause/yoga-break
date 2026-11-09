import { expect, mock, test } from 'claude-code/testing'

const CLIPS = JSON.stringify({ clips: [
  { id: 'a', url: 'https://example.com/a', source: 'other', title: 'Short', teacher: 'T', durationSec: 180, tags: [], addedAt: '' },
] })

function world(on: Parameters<Parameters<typeof test>[1]>[1]) {
  mock.clock(on, { now: 1794199829273 }); mock.store(on); mock.env(on, { HOME: '/home/test' })
  on('command.register', () => ({ value: { command: 'yoga' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('fs.exists', () => ({ value: true })); on('fs.read', () => ({ value: CLIPS })); on('fs.write', () => ({ value: undefined }))
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
