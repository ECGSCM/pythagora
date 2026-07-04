// Mobile audio unlock helpers (iOS Safari in particular).
//
// Two distinct iOS behaviours conspire to mute Web Audio apps:
//
// 1. AudioContext.resume() only succeeds when called synchronously inside a
//    real user-gesture handler (pointerdown/touchend/keydown). Desktop Chrome
//    tolerates late resumes after any prior page gesture; mobile Safari does
//    not.
//
// 2. THE SILENT SWITCH: by default Web Audio plays on the *ringer* channel,
//    so with the hardware mute switch on, a running AudioContext is fully
//    silent. Playing an HTMLMediaElement flips the app's audio session to the
//    *media playback* category, which ignores the silent switch — the same
//    channel Spotify/YouTube use. We loop a tiny in-memory silent WAV through
//    an <audio> element to hold that category for the whole session.
//
// Additionally, iOS suspends (or marks 'interrupted') the context when the
// tab is backgrounded or a call comes in; a visibilitychange hook re-resumes
// on return.

/** Build a 0.1s silent mono WAV entirely in memory (no asset, ~1.6KB). */
function buildSilentWavUrl(): string {
  const sampleRate = 8000;
  const samples = 800;
  const buf = new ArrayBuffer(44 + samples * 2);
  const v = new DataView(buf);
  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(offset + i, s.charCodeAt(i));
  };
  writeStr(0, 'RIFF');
  v.setUint32(4, 36 + samples * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  v.setUint32(16, 16, true); // fmt chunk size
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true); // byte rate
  v.setUint16(32, 2, true); // block align
  v.setUint16(34, 16, true); // bits per sample
  writeStr(36, 'data');
  v.setUint32(40, samples * 2, true);
  // sample data is already all zeroes (silence)
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
}

/**
 * Looping silent media element that pins the iOS audio session to the media
 * playback category (silent-switch immune). play() must be called from inside
 * a user gesture at least once; we retry on later gestures/visibility returns
 * until it sticks.
 */
export class MediaSessionPin {
  private element: HTMLAudioElement | null = null;
  private url: string | null = null;
  private pinned = false;

  /** Call from inside a user-gesture handler. Safe to call repeatedly. */
  ensure(): void {
    if (this.pinned || typeof document === 'undefined') return;
    if (!this.element) {
      this.url = buildSilentWavUrl();
      const el = document.createElement('audio');
      el.src = this.url;
      el.loop = true;
      el.setAttribute('playsinline', '');
      el.preload = 'auto';
      // Attached (hidden) to the document: keeps playback eligible across
      // browsers and makes the pin observable/debuggable.
      el.style.display = 'none';
      document.body.appendChild(el);
      this.element = el;
    }
    const p = this.element.play();
    if (p) {
      p.then(() => {
        this.pinned = true;
      }).catch(() => {
        // Not inside a valid gesture yet — a later gesture will retry.
      });
    }
  }

  /** Re-kick playback after backgrounding (iOS pauses media elements). */
  refresh(): void {
    if (this.element && this.element.paused && this.pinned) {
      this.element.play().catch(() => {
        this.pinned = false; // will re-pin on the next gesture
      });
    }
  }

  dispose(): void {
    if (this.element) {
      this.element.pause();
      this.element.removeAttribute('src');
      this.element.remove();
      this.element = null;
    }
    if (this.url) {
      URL.revokeObjectURL(this.url);
      this.url = null;
    }
    this.pinned = false;
  }
}
