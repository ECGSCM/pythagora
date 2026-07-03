// Session summary snapshot (EXPERIENCE_DESIGN.md §4.2): captured once, on
// ESC/exit, from gameStore.sessionStats + the audio engine's current harmony
// key. Rendered as a single quiet line on the Landing page.
export interface SessionSummary {
  collisions: number;
  maxCombo: number;
  keyName: string;
}
