const MUTE_KEY = 'getting-there-muted-v1';
// 主音量與背景音樂的參數。音樂由各章 ambience.scale 的五聲音階即時生成。
const MASTER_LEVEL = 0.42;
const MUSIC = {
  bpm: 72,
  level: 1.7,
  lookahead: 0.6,
  // 和弦根音在五聲音階上的位置，每兩小節換一個。
  progression: [0, 3, 1, 2],
  padLevel: 0.045,
  bassLevel: 0.11,
  melodyLevel: 0.075,
  melodyChance: 0.42,
  echoSeconds: 0.42,
  echoFeedback: 0.32,
  echoMix: 0.28,
};

// 可重現的亂數，讓同一章每次聽到的旋律走向相同。
function seeded(seed) {
  let value = seed * 9301 + 49297;
  return () => {
    value = (value * 9301 + 49297) % 233280;
    return value / 233280;
  };
}
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
        this.master.gain.value = this.muted ? 0 : MASTER_LEVEL;
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
    if (this.master && this.context) ramp(this.master, this.muted ? 0 : MASTER_LEVEL, this.context, 0.18);
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
    ramp(gain, 0.35, this.context, 0.8);

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
    droneGain.gain.value = 0.05;
    drone.connect(droneGain);
    droneGain.connect(gain);
    drone.start();
    const current = { gain, filter, noise, drone, droneGain, chapterId: chapter.id, version: ++this.version };
    this.startMusic(chapter);
    this.ambient = current;
    this.chapter = chapter;

    if (old) {
      ramp(old.gain, 0, this.context, 0.8);
      window.setTimeout(() => this.stopAmbientGroup(old), 850);
    }
  }

  // 背景音樂：慢板的和弦墊底、低音、偶發的撥弦旋律加回聲，換章時交叉淡入淡出。
  startMusic(chapter) {
    const context = this.context;
    const old = this.music;
    const bus = context.createGain();
    bus.gain.value = 0;
    bus.connect(this.master);
    ramp(bus, MUSIC.level, context, 2.5);
    const echo = context.createDelay(2);
    echo.delayTime.value = MUSIC.echoSeconds;
    const feedback = context.createGain();
    feedback.gain.value = MUSIC.echoFeedback;
    const wet = context.createGain();
    wet.gain.value = MUSIC.echoMix;
    echo.connect(feedback);
    feedback.connect(echo);
    echo.connect(wet);
    wet.connect(bus);
    const tone = context.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 1600;
    tone.connect(bus);
    const music = {
      bus, echo, feedback, wet, tone, chapterId: chapter.id,
      scale: chapter.ambience.scale,
      random: seeded(chapter.id * 17 + 3),
      beat: 60 / MUSIC.bpm,
      nextTime: context.currentTime + 0.3,
      step: 0,
      melodyIndex: 2,
    };
    music.timer = window.setInterval(() => this.scheduleMusic(music), 150);
    this.music = music;
    this.scheduleMusic(music);
    if (old) {
      ramp(old.bus, 0, context, 1.5);
      window.clearInterval(old.timer);
      window.setTimeout(() => this.stopMusic(old), 3000);
    }
  }

  stopMusic(music) {
    window.clearInterval(music.timer);
    for (const node of [music.tone, music.echo, music.feedback, music.wet, music.bus]) node.disconnect();
    if (this.music === music) this.music = null;
  }

  // 一次排定未來 lookahead 秒內的音符；每格是半拍，一小節八格。
  scheduleMusic(music) {
    const context = this.context;
    if (!context || context.state !== 'running' || this.music !== music) return;
    const half = music.beat / 2;
    if (music.nextTime < context.currentTime) music.nextTime = context.currentTime + 0.05;
    while (music.nextTime < context.currentTime + MUSIC.lookahead) {
      const time = music.nextTime;
      const bar = Math.floor(music.step / 8);
      const slot = music.step % 8;
      const scale = music.scale;
      const root = MUSIC.progression[Math.floor(bar / 2) % MUSIC.progression.length];
      if (slot === 0 && bar % 2 === 0) {
        const chord = [root, root + 2, root + 4].map((degree) => scale[degree % scale.length] / 2);
        for (const frequency of chord) this.musicVoice(music, frequency, time, music.beat * 8, 'pad');
      }
      if (slot === 0 || slot === 4) this.musicVoice(music, scale[root] / 4, time, music.beat * 1.6, 'bass');
      if ((slot % 2 === 0 || music.random() < 0.3) && music.random() < MUSIC.melodyChance) {
        const move = [-2, -1, -1, 1, 1, 2][Math.floor(music.random() * 6)];
        music.melodyIndex = Math.max(0, Math.min(scale.length * 2 - 1, music.melodyIndex + move));
        const octave = music.melodyIndex >= scale.length ? 2 : 1;
        this.musicVoice(music, scale[music.melodyIndex % scale.length] * octave, time, music.beat * 1.8, 'pluck');
      }
      music.nextTime += half;
      music.step += 1;
    }
  }

  musicVoice(music, frequency, time, length, kind) {
    const context = this.context;
    const gain = context.createGain();
    const oscillators = kind === 'pad'
      ? [['triangle', -6], ['triangle', 6]]
      : kind === 'bass' ? [['sine', 0]] : [['sine', 0], ['triangle', 1200]];
    const level = kind === 'pad' ? MUSIC.padLevel : kind === 'bass' ? MUSIC.bassLevel : MUSIC.melodyLevel;
    gain.gain.setValueAtTime(0.0001, time);
    if (kind === 'pad') {
      gain.gain.linearRampToValueAtTime(level, time + 1.6);
      gain.gain.setValueAtTime(level, time + length - 1.8);
      gain.gain.linearRampToValueAtTime(0.0001, time + length + 0.4);
    } else {
      gain.gain.linearRampToValueAtTime(level, time + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + length);
    }
    gain.connect(music.tone);
    if (kind === 'pluck') gain.connect(music.echo);
    for (const [type, detune] of oscillators) {
      const oscillator = context.createOscillator();
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, time);
      // 1200 音分代表高八度的泛音，音量壓低。
      const overtone = detune === 1200;
      oscillator.detune.setValueAtTime(detune, time);
      const voiceGain = overtone ? context.createGain() : null;
      if (voiceGain) {
        voiceGain.gain.value = 0.25;
        oscillator.connect(voiceGain);
        voiceGain.connect(gain);
      } else oscillator.connect(gain);
      oscillator.start(time);
      oscillator.stop(time + length + 0.5);
      oscillator.onended = () => {
        oscillator.disconnect();
        voiceGain?.disconnect();
      };
    }
    window.setTimeout(() => gain.disconnect(), (time - context.currentTime + length + 1) * 1000);
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
    if (this.music) this.stopMusic(this.music);
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
