// Patch graph types for Pythagora Synth.
// Rescued from the deleted `db.types.ts` (Phase 1 demolition) — only the
// PatchNode type is live code; User/Patch/Course/Module/Lesson/
// HealthFrequencyPreset were backend-only types with no reachable callers.

export type PatchNode = {
  id: string
  type: 'marble' | 'ramp' | 'bumper' | 'chime' | 'spinner' | 'funnel' | 'seesaw' | 'bell' | 'gear' | 'osc' | 'filter' | 'lfo' | 'reverb' | 'delay' | 'bitcrusher' | 'chorus'
  position: { x: number, y: number }
  size?: { width: number, height: number }
  // Per-module params are read all over audio.ts and Physics3DCanvas.tsx as
  // `params.someField || default` for numbers, strings, and string[]. Typing
  // this as `unknown` would require narrowing/casts at ~20 call sites for no
  // behavioral gain — that data-modeling work is Phase 3/4's job (see
  // REFACTORING_PLAN.md "音色定義をデータ化"). Deliberate, scoped exception.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  params: Record<string, any>    // Tone.js or physics params
  connections?: string[]  // connected node IDs
}
