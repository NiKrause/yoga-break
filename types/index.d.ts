/** The clip the band above the prompt offers while a long tool call runs. */
export type YogaSuggestion = {
  clipId: string
  title: string
  teacher: string
  url: string
  /** The clip's length in seconds. */
  durationSec: number
  /** The waiting time expected when the suggestion was made, in seconds. */
  freeSec: number
  /** When the tool call that triggered it started, in epoch milliseconds. */
  startedAt: number
}

declare module 'claude-code' {
  interface PluginState {
    'yoga-break': { suggestion: Shaped<YogaSuggestion | null> }
  }
}
