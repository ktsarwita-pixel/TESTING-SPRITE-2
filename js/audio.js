// Zero-dependency Web Audio retro 16-bit pixel-art SFX engine.

class SoundEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.lastReelTick = 0;
    this.lastWarnTick = 0;
    this.lastChargeTick = 0;
    this.lastSliderTick = 0;
    this.lastDragTick = 0;
    this.lastSweetTick = 0;
    this.lastStarChime = 0;
    this.lastCuriousBlip = 0;
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
      osc.frequency.setValueAtTime(Math.max(20, freqStart), now);
      if (freqEnd !== freqStart) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), now + dur);
      }
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(vol, now + Math.min(0.008, dur * 0.25));
      gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + dur + 0.02);
    } catch (_) {
      // Ignore audio errors on restricted devices
    }
  }

  noise(dur = 0.14, vol = 0.08, filterFreq = 900, delay = 0, filterType = 'bandpass') {
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
      filter.type = filterType;
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

  // ── UI & Menu SFX ─────────────────────────────────────────────────────────
  playUiClick() {
    this.tone(540, 680, 0.036, 'triangle', 0.055);
  }

  playUiTab() {
    this.tone(480, 620, 0.04, 'square', 0.04, 0);
    this.tone(720, 780, 0.035, 'triangle', 0.045, 0.028);
  }

  playUiOpen() {
    this.tone(392, 440, 0.055, 'triangle', 0.06, 0);
    this.tone(587, 659, 0.08, 'triangle', 0.065, 0.048);
  }

  playUiClose() {
    this.tone(523, 440, 0.05, 'triangle', 0.055, 0);
    this.tone(349, 294, 0.07, 'triangle', 0.05, 0.042);
  }

  playUiError() {
    this.tone(185, 165, 0.075, 'sawtooth', 0.06, 0);
    this.tone(145, 120, 0.10, 'sawtooth', 0.065, 0.08);
  }

  playToggle(on = true) {
    if (on) {
      this.tone(440, 660, 0.055, 'square', 0.05, 0);
      this.tone(660, 880, 0.065, 'triangle', 0.055, 0.045);
    } else {
      this.tone(620, 440, 0.055, 'square', 0.048, 0);
      this.tone(420, 310, 0.065, 'triangle', 0.045, 0.045);
    }
  }

  playSliderTick(frac = 0.5) {
    const now = performance.now();
    if (now - this.lastSliderTick < 55) return;
    this.lastSliderTick = now;
    const f = 320 + frac * 420;
    this.tone(f, f * 1.04, 0.025, 'sine', 0.035);
  }

  // ── Casting, Lure & Water SFX ─────────────────────────────────────────────
  playCastStart() {
    this.tone(210, 290, 0.055, 'triangle', 0.055);
  }

  playCastCharge(power = 0.5) {
    const now = performance.now();
    if (now - this.lastChargeTick < 95) return;
    this.lastChargeTick = now;
    const f = 220 + power * 420;
    this.tone(f, f * 1.08, 0.038, 'triangle', 0.04);
  }

  playCast(power = 0.6) {
    const p = Math.max(0.1, Math.min(1, power));
    this.tone(220 + p * 80, 560 + p * 260, 0.11 + p * 0.05, 'triangle', 0.085);
    this.noise(0.10 + p * 0.06, 0.065, 1300 + p * 900, 0.015, 'highpass');
    // Line zipping off the spool
    this.tone(920, 480, 0.09, 'sine', 0.035, 0.05);
  }

  playSplash(big = false) {
    this.noise(big ? 0.25 : 0.15, big ? 0.12 : 0.08, big ? 720 : 1120);
    this.tone(big ? 165 : 290, big ? 62 : 115, big ? 0.19 : 0.11, 'sine', big ? 0.105 : 0.07);
    // Tiny bubble droplet pop right after splash
    this.tone(big ? 460 : 620, big ? 740 : 940, 0.055, 'sine', 0.042, big ? 0.10 : 0.065);
  }

  playRetrieveStart() {
    this.tone(310, 420, 0.05, 'square', 0.045);
  }

  playRetrieveFinish() {
    this.noise(0.08, 0.055, 1450);
    this.tone(360, 540, 0.075, 'triangle', 0.06);
  }

  playJig() {
    this.tone(420, 590, 0.055, 'sine', 0.058, 0);
    this.tone(680, 820, 0.038, 'sine', 0.032, 0.042);
  }

  // ── Fish AI, Bite & Reeling SFX ───────────────────────────────────────────
  playFishCurious() {
    const now = performance.now();
    if (now - this.lastCuriousBlip < 700) return;
    this.lastCuriousBlip = now;
    this.tone(520, 660, 0.055, 'sine', 0.035, 0);
    this.tone(660, 740, 0.04, 'sine', 0.025, 0.045);
  }

  playNibble() {
    this.tone(340, 230, 0.068, 'sine', 0.08, 0);
    this.tone(470, 320, 0.06, 'sine', 0.05, 0.058);
  }

  playBite(rarity = 'common') {
    const isRare = rarity === 'rare' || rarity === 'epic';
    const isTop = rarity === 'legendary' || rarity === 'myth';
    this.tone(660, 660, 0.068, 'square', 0.09, 0);
    this.tone(990, 990, 0.14, 'square', 0.10, 0.068);
    if (isRare || isTop) {
      this.tone(1320, 1480, 0.14, 'triangle', 0.08, 0.13);
    }
    if (isTop) {
      this.tone(1760, 1980, 0.16, 'sine', 0.075, 0.18);
    }
    this.playSplash(true);
  }

  playHookSet() {
    this.tone(290, 760, 0.10, 'square', 0.085, 0);
    this.tone(580, 920, 0.08, 'triangle', 0.06, 0.05);
    this.noise(0.08, 0.055, 1600, 0.02);
  }

  playFishWarning() {
    // Crisp dual telegraph alert right before fish thrashes
    this.tone(580, 680, 0.055, 'triangle', 0.07, 0);
    this.tone(720, 860, 0.065, 'square', 0.055, 0.065);
  }

  playFishThrash() {
    // Turbulent splash + low struggle burst
    this.noise(0.20, 0.105, 860, 0);
    this.tone(175, 92, 0.14, 'sawtooth', 0.075, 0);
    this.tone(240, 130, 0.10, 'triangle', 0.055, 0.06);
  }

  playFishCalm() {
    // Subtle breath-of-relief chime when fish stops thrashing
    this.tone(440, 523, 0.065, 'sine', 0.042);
  }

  playReelTick(tension = 0.3, inSweetSpot = false) {
    const now = performance.now();
    const minGap = inSweetSpot ? 68 : 82;
    if (now - this.lastReelTick < minGap) return;
    this.lastReelTick = now;
    const pitch = 240 + tension * 340;
    this.tone(pitch, pitch * 1.09, 0.028, 'square', 0.038);
    if (inSweetSpot && now - this.lastSweetTick > 190) {
      this.lastSweetTick = now;
      this.tone(880 + tension * 220, 1046 + tension * 220, 0.045, 'sine', 0.032, 0.012);
    }
  }

  playDragOut(tension = 0.4) {
    // Soft drag spool clicks when fish pulls line out while player eases off
    const now = performance.now();
    if (now - this.lastDragTick < 130) return;
    this.lastDragTick = now;
    const pitch = 340 + tension * 180;
    this.tone(pitch, pitch * 0.88, 0.022, 'triangle', 0.03);
  }

  playTensionWarn() {
    const now = performance.now();
    if (now - this.lastWarnTick < 175) return;
    this.lastWarnTick = now;
    this.tone(780, 690, 0.058, 'sawtooth', 0.055);
  }

  playSnap() {
    // High taut-string snap + splash + descending drop
    this.tone(920, 210, 0.14, 'sawtooth', 0.11, 0);
    this.tone(480, 105, 0.24, 'sawtooth', 0.10, 0.04);
    this.noise(0.16, 0.09, 2000, 0);
  }

  playEscape() {
    this.tone(360, 260, 0.10, 'triangle', 0.075, 0);
    this.tone(250, 150, 0.16, 'triangle', 0.07, 0.09);
    this.noise(0.12, 0.06, 950, 0.04);
  }

  playLandingLift() {
    this.playSplash(true);
    this.tone(280, 740, 0.18, 'triangle', 0.08, 0.04);
    this.tone(440, 980, 0.16, 'sine', 0.055, 0.10);
  }

  // ── Predator Ambush & World Events ────────────────────────────────────────
  playAmbushAlert() {
    this.tone(175, 320, 0.09, 'sawtooth', 0.07, 0);
    this.tone(390, 560, 0.095, 'square', 0.065, 0.075);
    this.tone(240, 180, 0.08, 'triangle', 0.055, 0.15);
  }

  playChomp() {
    this.noise(0.19, 0.135, 620, 0);
    this.tone(185, 64, 0.16, 'sawtooth', 0.115, 0);
    this.tone(330, 520, 0.10, 'square', 0.085, 0.075);
    this.tone(660, 880, 0.17, 'square', 0.09, 0.14);
  }

  playMythSpawn() {
    // Deep majestic Atlantean chord shimmer when Abyssal Kraken appears!
    this.tone(130.8, 130.8, 0.42, 'triangle', 0.085, 0);
    this.tone(196, 196, 0.36, 'sine', 0.065, 0.06);
    this.tone(392, 523.3, 0.28, 'sine', 0.055, 0.12);
    this.tone(784, 1046.5, 0.32, 'triangle', 0.05, 0.19);
  }

  playShootingStar() {
    const now = performance.now();
    if (now - this.lastStarChime < 2800) return;
    this.lastStarChime = now;
    // Ultra-delicate starry shimmer
    this.tone(1318, 1760, 0.14, 'sine', 0.022, 0);
    this.tone(1976, 1568, 0.18, 'sine', 0.018, 0.07);
  }

  // ── Catch, Coins, Upgrades, Maps & Time ───────────────────────────────────
  playCatch(rarity = 'common') {
    if (rarity === 'myth' || rarity === 'mythic') {
      const notes = [523.3, 659.3, 784, 1046.5, 1318.5, 1568, 2093];
      notes.forEach((f, idx) => {
        this.tone(f, f, idx === notes.length - 1 ? 0.44 : 0.11, 'square', 0.075, idx * 0.078);
        this.tone(f * 0.5, f * 0.5, idx === notes.length - 1 ? 0.42 : 0.10, 'triangle', 0.05, idx * 0.078);
      });
      return;
    }
    const fanfare =
      rarity === 'legendary'
        ? [523.3, 659.3, 784, 1046.5, 1318.5, 1568]
        : rarity === 'epic' || rarity === 'rare'
          ? [523.3, 659.3, 784, 1046.5, 1318.5]
          : [523.3, 659.3, 784, 1046.5];
    fanfare.forEach((f, idx) => {
      this.tone(f, f, idx === fanfare.length - 1 ? 0.34 : 0.10, 'square', 0.076, idx * 0.08);
    });
  }

  playNewSpecies() {
    // Bright discovery sparkle slightly after catch fanfare
    const notes = [880, 1174.7, 1396.9, 1760];
    notes.forEach((f, i) => {
      this.tone(f, f * 1.01, 0.11, 'triangle', 0.055, 0.36 + i * 0.065);
    });
  }

  playNewRecord() {
    this.tone(988, 1175, 0.08, 'triangle', 0.055, 0.38);
    this.tone(1319, 1568, 0.14, 'triangle', 0.06, 0.46);
  }

  playCoinJingle(big = false) {
    this.tone(987.8, 987.8, 0.06, 'square', 0.06, 0);
    this.tone(1318.5, 1318.5, 0.13, 'square', 0.065, 0.055);
    if (big) {
      this.tone(1568, 1568, 0.15, 'triangle', 0.06, 0.11);
    }
  }

  playBuy() {
    this.tone(587.3, 587.3, 0.065, 'square', 0.068, 0);
    this.tone(880, 880, 0.13, 'square', 0.075, 0.07);
  }

  playMaxUpgrade() {
    const chord = [523.3, 659.3, 784, 1046.5, 1318.5];
    chord.forEach((f, i) => {
      this.tone(f, f, i === chord.length - 1 ? 0.28 : 0.08, 'square', 0.068, i * 0.058);
    });
  }

  playMapUnlock() {
    const notes = [392, 493.9, 587.3, 784, 987.8];
    notes.forEach((f, i) => {
      this.tone(f, f, i === notes.length - 1 ? 0.32 : 0.09, 'triangle', 0.08, i * 0.07);
      this.tone(f, f, i === notes.length - 1 ? 0.26 : 0.07, 'square', 0.04, i * 0.07);
    });
  }

  playMapTravel(mapId = 'harbor') {
    if (mapId === 'lagoon') {
      // Warm tropical marimba-like triad
      [523, 659, 784].forEach((f, i) => this.tone(f, f * 0.99, 0.12, 'sine', 0.065, i * 0.06));
    } else if (mapId === 'fjord') {
      // Crystalline icy bell notes
      [880, 1175, 1319].forEach((f, i) => this.tone(f, f, 0.18, 'triangle', 0.055, i * 0.065));
    } else if (mapId === 'abyss') {
      // Deep volcanic rumble + ember chime
      this.tone(146.8, 110, 0.22, 'sawtooth', 0.065, 0);
      this.tone(293.7, 349.2, 0.18, 'triangle', 0.06, 0.08);
    } else if (mapId === 'sanctuary') {
      // Ethereal cosmic astral harp
      [523.3, 784, 987.8, 1318.5].forEach((f, i) => this.tone(f, f * 1.01, 0.20, 'sine', 0.052, i * 0.055));
    } else {
      // Sunlit Harbor coastal chime
      [440, 554.4, 659.3].forEach((f, i) => this.tone(f, f, 0.14, 'triangle', 0.06, i * 0.06));
    }
  }

  playTimeShift(phase = 'DAY') {
    if (phase === 'NIGHT') {
      this.tone(659, 523, 0.12, 'sine', 0.05, 0);
      this.tone(392, 330, 0.16, 'sine', 0.045, 0.07);
    } else if (phase === 'DAWN') {
      this.tone(440, 587, 0.10, 'triangle', 0.055, 0);
      this.tone(659, 880, 0.14, 'sine', 0.05, 0.065);
    } else if (phase === 'SUNSET') {
      this.tone(587, 494, 0.11, 'triangle', 0.055, 0);
      this.tone(440, 392, 0.15, 'triangle', 0.05, 0.07);
    } else {
      this.tone(523, 659, 0.10, 'triangle', 0.055, 0);
      this.tone(784, 784, 0.12, 'triangle', 0.05, 0.06);
    }
  }

  playReset() {
    this.tone(440, 220, 0.12, 'sawtooth', 0.07, 0);
    this.tone(220, 95, 0.22, 'sawtooth', 0.07, 0.10);
  }

  playMiss() {
    this.tone(280, 160, 0.16, 'triangle', 0.08);
  }
}

export const sound = new SoundEngine();
