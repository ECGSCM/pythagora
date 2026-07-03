// Barrel for the scene effect components.
//
// Every effect here is mounted in the live scene: Scene.tsx mounts
// CompletionCelebration, ComboDisplay, PerfectRunIndicator, CameraFlow,
// AuroraPulse and PostFX; Marble.tsx mounts ParticleTrail. This barrel exists
// purely for import ergonomics — one grouped import instead of seven.

export { ComboDisplay } from './ComboDisplay';
export { CompletionCelebration } from './CompletionCelebration';
export { PerfectRunIndicator } from './PerfectRunIndicator';
export { CameraFlow } from './CameraFlow';
export { ParticleTrail } from './ParticleTrail';
export { PostFX } from './PostFX';
export { AuroraPulse } from './AuroraPulse';
