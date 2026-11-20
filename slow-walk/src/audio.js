const MUTE_KEY = 'getting-there-muted-v1';
const STEP_PROFILES = {
  pavement: { wave: 'triangle', degree: 0, peak: 0.042, length: 0.15 },
  gravel: { wave: 'sine', degree: 1, peak: 0.027, length: 0.19 },
  metal: { wave: 'triangle', degree: 2, peak: 0.034, length: 0.22 },
  stone: { wave: 'sine', degree: 0, peak: 0.03, length: 0.18 },
  wood: { wave: 'triangle', degree: 1, peak: 0.039, length: 0.13 },
  soil: { wave: 'sine', degree: 0, peak: 0.022, length: 0.2 },
  rubber: { wave: 'sine', degree: 2, peak: 0.02, length: 0.12 },
  dirt: { wave: 'triangle', degree: 1, peak: 0.024, length: 0.17 },
};

function safeReadMuted(fallback = false) {
  try {
    const value = localStorage.getItem(MUTE_KEY);
    return value === null ? fallback : value === 'true';
  } catch {
    return fallback;
  }
}

function safeWriteMuted(muted) {
  try {
    localStorage.setItem(MUTE_KEY, String(muted));
  } catch {
    // Sound remains usable for this session when browser storage is blocked.
  }
}

function ramp(gain, value, context, seconds = 0.12) {
  const now = context.currentTime;
  gain.gain.cancelScheduledValues(now);
  gain.gain.setValueAtTime(gain.gain.value, now);
  gain.gain.linearRampToValueAtTime(value, now + seconds);
}

export class AudioManager {
  constructor(initialMuted = false) {
    this.muted = safeReadMuted(initialMuted);
    this.context = null;
    this.master = null;
    this.noiseBuffer = null;
    this.ambient = null;
    this.voices = [];
    this.version = 0;
    this.chapter = null;
  }

  async unlock() {
    if (this.context?.state === 'closed') this.context = null;
    if (!this.context) {
      const AudioContextType = window.AudioContext ?? window.webkitAudioContext;
      if (!AudioContextType) return false;
      try {
        this.context = new AudioContextType();
        this.master = this.context.createGain();
        this.master.gain.value = this.muted ? 0 : 0.24;
        this.master.connect(this.context.destination);
      } catch {
        this.context = null;
        this.master = null;
        return false;
      }
    }

    const version = this.version;
    try {
      if (this.context.state !== 'running') await this.context.resume();
      if (version !== this.version) return false;
      return this.context.state === 'running';
    } catch {
      return false;
    }
  }

  setMuted(muted) {
    this.muted = Boolean(muted);
    safeWriteMuted(this.muted);
    if (this.master && this.context) ramp(this.master.gain, this.muted ? 0 : 0.24, this.context, 0.18);
    return this.muted;
  }

  toggleMuted() {
    return this.setMuted(!this.muted);
  }

  makeNoiseBuffer() {
    if (this.noiseBuffer || !this.context) return this.noiseBuffer;
    const frameCount = this.context.sampleRate * 2;
    this.noiseBuffer = this.context.createBuffer(1, frameCount, this.context.sampleRate);
    const samples = this.noiseBuffer.getChannelData(0);
    for (let index = 0; index < frameCount; index += 1) {
      const white = Math.random() * 2 - 1;
      samples[index] = white * 0.18;
    }
    return this.noiseBuffer;
  }

  startAmbient(chapter) {
    if (!this.context || !this.master || !chapter?.ambience) return;
    if (this.ambient?.chapterId === chapter.id) return;
    const old = this.ambient;
    const gain = this.context.createGain();
    gain.gain.value = 0;
    gain.connect(this.master);
    ramp(gain, 0.62, this.context, 0.8);

    const filter = this.context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(chapter.ambience.filterHz, this.context.currentTime);
    const noise = this.context.createBufferSource();
    noise.buffer = this.makeNoiseBuffer();
    noise.loop = true;
    noise.connect(filter);
    filter.connect(gain);
    noise.start();

    const drone = this.context.createOscillator();
    const droneGain = this.context.createGain();
    drone.type = 'sine';
    drone.frequency.setValueAtTime(chapter.ambience.rootHz, this.context.currentTime);
    droneGain.gain.value = 0.12;
    drone.connect(droneGain);
    droneGain.connect(gain);
    drone.start();
    const current = { gain, filter, noise, drone, droneGain, chapterId: chapter.id, version: ++this.version };
    this.ambient = current;
    this.chapter = chapter;

    if (old) {
      ramp(old.gain, 0, this.context, 0.8);
      window.setTimeout(() => this.stopAmbientGroup(old), 850);
    }
  }

  stopAmbientGroup(group) {
    for (const source of [group.noise, group.drone]) {
      try { source.stop(); } catch { /* Already stopped. */ }
      source.disconnect();
    }
    group.filter.disconnect();
    group.droneGain.disconnect();
    group.gain.disconnect();
    if (this.ambient === group) this.ambient = null;
  }

  async setChapter(chapter) {
    this.chapter = chapter;
    this.version += 1;
    if (await this.unlock()) this.startAmbient(chapter);
  }

  playNote(kind = 'interact') {
    if (!this.context || !this.master || !this.chapter) return;
    if (this.context.state !== 'running') return;
    const scale = this.chapter.ambience.scale;
    const index = kind === 'step' ? 0 : kind === 'kindness' ? 2 : kind === 'reveal' ? 4 : 1;
    const stepProfile = kind === 'step'
      ? STEP_PROFILES[this.chapter.ambience.stepSurface] ?? STEP_PROFILES.pavement
      : null;
    const frequency = scale[(stepProfile?.degree ?? index) % scale.length];
    const now = this.context.currentTime;
    if (this.voices.length >= 8) {
      const oldest = this.voices.shift();
      try { oldest.oscillator.stop(now); } catch { /* Voice already ended. */ }
      oldest.oscillator.disconnect();
      oldest.gain.disconnect();
    }

    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = stepProfile?.wave ?? 'sine';
    oscillator.frequency.setValueAtTime(frequency, now);
    gain.gain.setValueAtTime(0, now);
    const length = stepProfile?.length ?? 0.34;
    gain.gain.linearRampToValueAtTime(stepProfile?.peak ?? 0.09, now + 0.035);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + length);
    oscillator.connect(gain);
    gain.connect(this.master);
    const voice = { oscillator, gain };
    this.voices.push(voice);
    oscillator.onended = () => {
      this.voices = this.voices.filter((entry) => entry !== voice);
      oscillator.disconnect();
      gain.disconnect();
    };
    oscillator.start(now);
    oscillator.stop(now + length + 0.02);
  }

  pause() {
    if (this.context?.state === 'running') this.context.suspend().catch(() => {});
  }

  async resume() {
    if (!this.context || this.context.state === 'closed') return false;
    const version = this.version;
    try {
      await this.context.resume();
      if (version !== this.version) return false;
      return this.context.state === 'running';
    } catch {
      return false;
    }
  }

  dispose() {
    this.version += 1;
    if (this.ambient) this.stopAmbientGroup(this.ambient);
    for (const voice of this.voices.splice(0)) {
      try { voice.oscillator.stop(); } catch { /* Voice already ended. */ }
      voice.oscillator.disconnect();
      voice.gain.disconnect();
    }
    if (this.master && this.context) this.master.disconnect();
    const context = this.context;
    this.context = null;
    this.master = null;
    if (context && context.state !== 'closed') context.close().catch(() => {});
  }
}
