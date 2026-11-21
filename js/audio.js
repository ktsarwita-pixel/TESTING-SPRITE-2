// Zero-dependency Web Audio retro pixel-art SFX engine.

class SoundEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.lastReelTick = 0;
    this.lastWarnTick = 0;
  }

  unlock() {
    if (this.muted) return;
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) this.ctx = new AC();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  setMuted(flag) {
    this.muted = !!flag;
  }

  tone(freqStart, freqEnd, dur, type = 'square', vol = 0.08, delay = 0) {
    if (this.muted || !this.ctx) return;
    try {
      const now = this.ctx.currentTime + delay;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freqStart, now);
      if (freqEnd !== freqStart) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), now + dur);
      }
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(vol, now + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + dur + 0.02);
    } catch (_) {
      // Ignore audio errors on restricted devices
    }
  }

  noise(dur = 0.14, vol = 0.08, filterFreq = 900, delay = 0) {
    if (this.muted || !this.ctx) return;
    try {
      const now = this.ctx.currentTime + delay;
      const sampleCount = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
      const buffer = this.ctx.createBuffer(1, sampleCount, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < sampleCount; i++) {
        data[i] = (Math.random() * 2 - 1) * (1 - i / sampleCount);
      }
      const src = this.ctx.createBufferSource();
      src.buffer = buffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(filterFreq, now);
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(vol, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
      src.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);
      src.start(now);
      src.stop(now + dur + 0.02);
    } catch (_) {
      // Ignore audio errors
    }
  }

  playCast() {
    this.tone(240, 620, 0.12, 'triangle', 0.09);
    this.noise(0.11, 0.06, 1500, 0.02);
  }

  playSplash(big = false) {
    this.noise(big ? 0.24 : 0.15, big ? 0.12 : 0.08, big ? 750 : 1100);
    this.tone(big ? 160 : 280, big ? 65 : 110, big ? 0.18 : 0.11, 'sine', big ? 0.11 : 0.07);
  }

  playJig() {
    this.tone(420, 560, 0.06, 'sine', 0.06);
  }

  playNibble() {
    this.tone(330, 220, 0.07, 'sine', 0.08);
    this.tone(440, 310, 0.06, 'sine', 0.05, 0.06);
  }

  playBite() {
    this.tone(660, 660, 0.07, 'square', 0.09, 0);
    this.tone(990, 990, 0.14, 'square', 0.10, 0.07);
    this.playSplash(true);
  }

  playHookSet() {
    this.tone(340, 740, 0.11, 'square', 0.08);
  }

  playReelTick(tension) {
    const now = performance.now();
    if (now - this.lastReelTick < 75) return;
    this.lastReelTick = now;
    const pitch = 240 + tension * 340;
    this.tone(pitch, pitch * 1.08, 0.03, 'square', 0.04);
  }

  playTensionWarn() {
    const now = performance.now();
    if (now - this.lastWarnTick < 180) return;
    this.lastWarnTick = now;
    this.tone(760, 680, 0.06, 'sawtooth', 0.055);
  }

  playSnap() {
    this.tone(520, 110, 0.22, 'sawtooth', 0.11);
    this.noise(0.14, 0.08, 1800);
  }

  playCatch(rarity = 'common') {
    const fanfare =
      rarity === 'mythic' || rarity === 'legendary' || rarity === 'rare'
        ? [523, 659, 784, 1046, 1318]
        : [523, 659, 784, 1046];
    fanfare.forEach((f, idx) => {
      this.tone(f, f, idx === fanfare.length - 1 ? 0.28 : 0.10, 'square', 0.075, idx * 0.085);
    });
  }

  playBuy() {
    this.tone(587, 587, 0.07, 'square', 0.07, 0);
    this.tone(880, 880, 0.14, 'square', 0.08, 0.075);
  }

  playMiss() {
    this.tone(280, 160, 0.16, 'triangle', 0.08);
  }
}

export const sound = new SoundEngine();
