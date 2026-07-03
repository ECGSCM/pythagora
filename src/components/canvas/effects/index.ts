// Barrel for the scene effect components.
//
// CompletionCelebration is mounted by Scene today. The rest (ComboDisplay,
// PerfectRunIndicator, CameraFlow, ParticleTrail) are finished assets that
// aren't mounted yet — Phase 5 wires them in. Re-exporting them here keeps
// them referenced (so noUnusedLocals stays happy) and makes Phase 5 a
// one-line import.

export { ComboDisplay } from './ComboDisplay';
export { CompletionCelebration } from './CompletionCelebration';
export { PerfectRunIndicator } from './PerfectRunIndicator';
export { CameraFlow } from './CameraFlow';
export { ParticleTrail } from './ParticleTrail';
export { PostFX } from './PostFX';
export { AuroraPulse } from './AuroraPulse';
