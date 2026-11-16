const SOUND_FILES = ['click', 'correct', 'wrong', 'flip'];

function readMuted() {
  try {
    return localStorage.getItem('decision-ten-years-muted') === 'true';
  } catch {
    return false;
  }
}

function writeMuted(value) {
  try {
    localStorage.setItem('decision-ten-years-muted', String(value));
  } catch {
    // Storage can be unavailable in private or restricted browsing contexts.
  }
}

export class AudioManager {
  constructor(toggleButton) {
    this.toggleButton = toggleButton;
    this.muted = readMuted();
    this.started = false;
    this.sounds = new Map();
    this.music = null;
    this.updateButton();
    this.toggleButton.addEventListener('click', () => {
      this.muted = !this.muted;
      writeMuted(this.muted);
      this.updateButton();
      if (this.music) {
        if (this.muted) this.music.pause();
        else if (this.started && !document.hidden) this.music.play().catch(() => {});
      }
    });
  }

  makeAudio(name, loop = false) {
    const audio = new Audio(new URL(`${import.meta.env.BASE_URL}audio/${name}.mp3`, window.location.href));
    audio.preload = 'none';
    audio.loop = loop;
    return audio;
  }

  start() {
    if (this.started) return;
    this.started = true;
    for (const name of SOUND_FILES) this.sounds.set(name, this.makeAudio(name));
    this.music = this.makeAudio('bgm', true);
    this.music.volume = 0.12;
    if (!this.muted) this.music.play().catch(() => {});
  }

  play(name) {
    if (!this.started || this.muted) return;
    const audio = this.sounds.get(name);
    if (!audio) return;
    audio.currentTime = 0;
    audio.volume = 0.58;
    audio.play().catch(() => {});
  }

  visibilityChanged() {
    if (!this.music || !this.started) return;
    if (document.hidden || this.muted) this.music.pause();
    else this.music.play().catch(() => {});
  }

  updateButton() {
    this.toggleButton.textContent = this.muted ? '音效關' : '音效開';
    this.toggleButton.setAttribute('aria-pressed', String(this.muted));
    this.toggleButton.setAttribute('aria-label', this.muted ? '開啟音效' : '關閉音效');
  }
}
