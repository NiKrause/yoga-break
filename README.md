# yoga-break

A mod for Claude Code: while Claude is busy with something long (an agent run,
a build, a test suite, a web search), it offers a short yoga clip that fits into
the waiting time. Its texts are English by default and German on request.

## What it does

- Every tool call is classified: `agent` (Agent/Task), `build` (Bash running
  npm/pnpm/yarn build or test, playwright, vitest, cargo, make), `research`
  (WebSearch/WebFetch), `other`.
- Per class the last 50 durations are kept (a ring buffer) and their median is
  the expected duration of the next call. Without history: agent 240 s,
  build 60 s, research 45 s, other 0.
- A call expected to take 90 s or more is "long": the status line under the
  prompt shows `🧘 ~M:SS` counting down, and, at most once per 10 minutes, a
  clip is suggested: a toast plus a band above the prompt with
  `[Öffnen] [Erledigt] [Später]`. `Öffnen` (hotkey `o` while the band has
  the focus) opens the clip in the browser with `open` or `xdg-open`.
- The clip is the longest one whose length is at most the expected remaining
  time minus 20 s; clips already suggested today rank after the others.
- When the tool call ends, or when Claude waits for input, status and band go.

### Slash commands

| Command | Effect |
| --- | --- |
| `/yoga` | the clip that fits now, and the statistics: yoga minutes today, suggestions today, median per class |
| `/yoga skip` | no suggestions for 60 minutes |
| `/yoga done <id>` | marks a clip as done (counts into the statistics); without an id, the open suggestion |
| `/yoga add <url> <seconds> [teacher] [title]` | appends a clip to `clips.json` |
| `/yoga open` | opens the clip of the open suggestion |
| `/yoga lang en\|de` | switches the mod's language |
| `/yoga debug` | checks every host function the mod relies on and writes a report to `~/.yoga/debug-report.txt` |

### Language

English is the default. Two ways to switch to German, in order of precedence:

- `/yoga lang de` (back with `/yoga lang en`); the choice is kept in the mod's store.
- The `language` option in Claude Code's config menu (`/config`, row *Language* under yoga-break), or `pluginConfigs` in settings.

Code, comments and this README stay English.

### Where the data lives

- Clips: `~/.yoga/clips.json` (schema below). The mod writes a sample file
  with three made-up entries if it is missing, and appends on `/yoga add`.
- Durations, suggestions, completed clips and the skip timer: the mod's own
  store (`$.store`), a JSON file Claude Code keeps per plugin under
  `~/.claude`.

The mod makes no network requests (stage 1) and has no dependencies beyond
the mod API.

## What the mod runs, reads and writes

The directory's security scan and anyone installing the mod should find every
behaviour listed here; there is nothing else.

- **No network access.** The mod makes no HTTP request and opens no socket.
- **Host commands:** `open <url>` (macOS) or `xdg-open <url>` (Linux) when you
  press `Öffnen` or run `/yoga open`, with the clip's own `http(s)` URL and
  nothing else; `true` once from `/yoga debug`, to check that host commands
  work at all.
- **Files:** reads and writes `~/.yoga/clips.json` (your clips) and, from
  `/yoga debug` only, `~/.yoga/debug-probe.txt` and `~/.yoga/debug-report.txt`.
- **Claude Code's own stores:** the plugin's key-value store for durations,
  suggestions, completed clips and the skip timer; the session state for the
  open suggestion; the `HOME` environment variable to find `~/.yoga`.
- **Interface:** a toast, the band above the prompt, the status line, and
  transcript log lines; the slash command `/yoga`.
- **Nothing is sent anywhere**, no telemetry, no model calls, no data leaves
  the machine.

## Installation

At the prompt of a terminal session running Claude Code:

```
/plugin install yoga-break --marketplace NiKrause/yoga-break
```

Answer `y` to add the marketplace, then choose a scope (user scope installs it
for every session). From a shell:

```bash
claude plugin install yoga-break --marketplace NiKrause/yoga-break
```

In the desktop app, where `/plugin` does not run: click + next to the prompt
box, then Plugins, Add marketplace with `NiKrause/yoga-break`, then Add plugin.

While developing, the mod loads from its folder instead:

```bash
claude --plugin-dir /path/to/yoga-break
```

or, for sessions started by the desktop app, with the folder named in
`CLAUDE_CODE_PLUGIN_DIRS` in the `env` block of `~/.claude/settings.json`.

## Schema of `~/.yoga/clips.json`

The file is exported by an OrbitDB-based PWA later on. The mod reads it and
only appends entries of the same shape; it never changes the schema.

```json
{
  "clips": [
    {
      "id": "uuid",
      "url": "https://www.youtube.com/watch?v=...",
      "source": "youtube",
      "title": "Shoulder Opener",
      "teacher": "Name",
      "durationSec": 300,
      "tags": ["schultern", "sitzen"],
      "addedAt": "2026-11-09T08:00:00Z"
    }
  ]
}
```

`source` is one of `youtube`, `instagram`, `vimeo`, `other`. An entry without
a valid `url` or a positive `durationSec` is skipped with a warning; a file
that is not JSON yields a warning and no clips, never a crash.

## Files

```
.claude-plugin/plugin.json   manifest
hooks/hooks.json             names the hooks module
hooks/register.tsx           the whole module, in sections: classification,
                             statistics (ring buffer, median), clips.json,
                             hooks, band, slash command, status line
types/index.d.ts             the $.state contract (the open suggestion)
tests/yoga.test.ts           `claude plugin test`: /yoga in English and German
```

The module is one file, and every helper that takes `$` is a top-level
function: the hooks loader follows `$` only into functions declared at the top
of the file (or imported from the mod's own files), never into a closure
inside `register`. `claude plugin validate <folder>` (Claude Code 2.1.317 or
newer) reports exactly that before a session loads the mod.

## Planned: stage 2

- Publish busy/idle events (tool class, expected duration, start and end) into
  a libp2p pubsub topic, so other devices and the yoga PWA see when a break
  is possible.
- Read the clips from the local relay (the OrbitDB database the PWA syncs)
  instead of `~/.yoga/clips.json`, with the file as the offline fallback.
- Both go through the mod API's host (`$.http` / a local bridge), never
  through the module's own network, and are off until switched on.
