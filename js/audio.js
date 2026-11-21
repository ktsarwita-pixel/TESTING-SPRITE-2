// Realistic physical-modeling Foley & acoustic Web Audio engine
// with automatic Mirli / Soundbox (assets/sfx/manifest.json) sample-pack support.

class SoundEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.dryBus = null;
    this.wetBus = null;
    this.convolver = null;
    this.noiseBuf = null;
    this.pinkBuf = null;
    this.muted = false;

    // Optional Mirli / Soundbox rendered audio buffers (key -> AudioBuffer)
    this.samples = new Map();
    this.manifestChecked = false;

    // Smart per-effect throttles so continuous Foley stays organic & crisp
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
      if (!AC) return;
      this.ctx = new AC();
      this._initGraph();
      this._loadMirliManifest();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  setMuted(flag) {
    this.muted = !!flag;
    if (this.master && this.ctx) {
      try {
        this.master.gain.setTargetAtTime(this.muted ? 0.0001 : 0.92, this.ctx.currentTime, 0.015);
      } catch (_) {}
    }
  }

  _initGraph() {
    const ctx = this.ctx;
    if (!ctx) return;

    // Master dynamics compressor prevents harsh clipping when layers stack
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.setValueAtTime(-12, ctx.currentTime);
    comp.knee.setValueAtTime(18, ctx.currentTime);
    comp.ratio.setValueAtTime(4, ctx.currentTime);
    comp.attack.setValueAtTime(0.004, ctx.currentTime);
    comp.release.setValueAtTime(0.16, ctx.currentTime);

    this.master = ctx.createGain();
    this.master.gain.setValueAtTime(this.muted ? 0.0001 : 0.92, ctx.currentTime);

    this.dryBus = ctx.createGain();
    this.dryBus.gain.setValueAtTime(1.0, ctx.currentTime);

    // Subtle open-water coastal ambience reverb (stereo procedural impulse response)
    this.wetBus = ctx.createGain();
    this.wetBus.gain.setValueAtTime(0.24, ctx.currentTime);

    if (typeof ctx.createConvolver === 'function') {
      this.convolver = ctx.createConvolver();
      this.convolver.buffer = this._createCoastalImpulse(0.95, 3.2);
      this.wetBus.connect(this.convolver);
      this.convolver.connect(comp);
    } else {
      this.wetBus.connect(comp);
    }

    this.dryBus.connect(comp);
    comp.connect(this.master);
    this.master.connect(ctx.destination);

    // Pre-generate 2-second white & pink noise buffers for zero-GC realistic Foley
    this.noiseBuf = this._createNoiseBuffer(2.0, false);
    this.pinkBuf = this._createNoiseBuffer(2.0, true);
  }

  _createNoiseBuffer(seconds, pink = false) {
    const ctx = this.ctx;
    const len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    if (!pink) {
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } else {
      // Paul Kellet refined pink noise filter for natural water/wind/wood texture
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + w * 0.0555179;
        b1 = 0.99332 * b1 + w * 0.0750759;
        b2 = 0.96900 * b2 + w * 0.1538520;
        b3 = 0.86650 * b3 + w * 0.3104856;
        b4 = 0.55000 * b4 + w * 0.5329522;
        b5 = -0.7616 * b5 - w * 0.0168980;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
        b6 = w * 0.115926;
      }
    }
    return buf;
  }

  _createCoastalImpulse(dur = 0.95, decay = 3.2) {
    const ctx = this.ctx;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const t = i / len;
        const env = Math.pow(1 - t, decay);
        const w = (Math.random() * 2 - 1) * env;
        // Soft low-pass air absorption over distance
        lp = lp * 0.72 + w * 0.28;
        d[i] = lp;
      }
    }
    return buf;
  }

  async _loadMirliManifest() {
    if (this.manifestChecked || typeof fetch !== 'function') return;
    this.manifestChecked = true;
    try {
      const res = await fetch('assets/sfx/manifest.json', { cache: 'no-cache' });
      if (!res.ok) return;
      const manifest = await res.json();
      if (!manifest || !manifest.files) return;
      const entries = Object.entries(manifest.files);
      await Promise.all(entries.map(async ([key, relPath]) => {
        try {
          const r = await fetch(`assets/sfx/${relPath}`);
          if (!r.ok) return;
          const arr = await r.arrayBuffer();
          const decoded = await this.ctx.decodeAudioData(arr);
          this.samples.set(key, decoded);
        } catch (_) {}
      }));
    } catch (_) {
      // No external Mirli sample pack installed yet — physical Foley synth handles everything seamlessly
    }
  }

  _playSample(key, vol = 0.85, rateJitter = 0.04, rateBase = 1.0, wet = 0.18) {
    if (this.muted || !this.ctx || !this.samples.has(key)) return false;
    try {
      const src = this.ctx.createBufferSource();
      src.buffer = this.samples.get(key);
      src.playbackRate.value = Math.max(0.5, rateBase + (Math.random() * 2 - 1) * rateJitter);
      const g = this.ctx.createGain();
      g.gain.value = vol;
      src.connect(g);
      g.connect(this.dryBus);
      if (wet > 0) {
        const wg = this.ctx.createGain();
        wg.gain.value = vol * wet;
        src.connect(wg);
        wg.connect(this.wetBus);
      }
      src.start();
      return true;
    } catch (_) {
      return false;
    }
  }

  _ready() {
    return !this.muted && this.ctx && this.dryBus;
  }

  _connectOut(node, dryVol = 1.0, wetVol = 0.18) {
    if (dryVol > 0) {
      const dg = this.ctx.createGain();
      dg.gain.value = dryVol;
      node.connect(dg);
      dg.connect(this.dryBus);
    }
    if (wetVol > 0 && this.wetBus) {
      const wg = this.ctx.createGain();
      wg.gain.value = wetVol;
      node.connect(wg);
      wg.connect(this.wetBus);
    }
  }

  // ── Core Physical-Modeling Primitives ─────────────────────────────────────

  // Smooth exponential oscillator with natural attack/decay & stereo reverb send
  _osc(f0, f1, dur, type = 'sine', vol = 0.12, delay = 0, wet = 0.22, attack = 0.006) {
    if (!this._ready()) return;
    try {
      const now = this.ctx.currentTime + delay;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(Math.max(20, f0), now);
      if (f1 !== f0) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), now + dur);
      }
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(vol, now + Math.min(attack, dur * 0.35));
      gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
      osc.connect(gain);
      this._connectOut(gain, 1.0, wet);
      osc.start(now);
      osc.stop(now + dur + 0.03);
    } catch (_) {}
  }

  // Shaped pink/white noise burst with sweeping resonant filter (water, air, wood, jaws!)
  _filteredNoise({
    dur = 0.18,
    vol = 0.15,
    delay = 0,
    pink = true,
    filterType = 'bandpass',
    freqStart = 900,
    freqEnd = 900,
    q = 1.2,
    attack = 0.008,
    wet = 0.25,
  } = {}) {
    if (!this._ready()) return;
    try {
      const now = this.ctx.currentTime + delay;
      const src = this.ctx.createBufferSource();
      src.buffer = pink ? this.pinkBuf : this.noiseBuf;
      const maxOffset = Math.max(0.01, (src.buffer ? src.buffer.duration : 1) - dur - 0.05);
      const offset = Math.random() * maxOffset;

      const filter = this.ctx.createBiquadFilter();
      filter.type = filterType;
      filter.Q.setValueAtTime(q, now);
      filter.frequency.setValueAtTime(Math.max(30, freqStart), now);
      if (freqEnd !== freqStart) {
        filter.frequency.exponentialRampToValueAtTime(Math.max(30, freqEnd), now + dur);
      }

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(vol, now + Math.min(attack, dur * 0.4));
      gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);

      src.connect(filter);
      filter.connect(gain);
      this._connectOut(gain, 1.0, wet);
      src.start(now, offset, dur + 0.03);
    } catch (_) {}
  }

  // Minnaert acoustic water bubble physics: rising-pitch resonant sine pop!
  _bubble(baseFreq = 420, dur = 0.055, vol = 0.065, delay = 0) {
    if (!this._ready()) return;
    const f0 = baseFreq * (0.9 + Math.random() * 0.22);
    const f1 = f0 * (1.42 + Math.random() * 0.35);
    this._osc(f0, f1, dur, 'sine', vol, delay, 0.32, 0.004);
  }

  // Tactile wooden knock (pier planks / tackle box / UI)
  _woodKnock(pitch = 520, vol = 0.10, delay = 0) {
    if (!this._ready()) return;
    const p = pitch * (0.96 + Math.random() * 0.08);
    // Warm hollow woody fundamental + damped 2.75x wood-bar overtone + micro click
    this._osc(p * 1.15, p * 0.85, 0.045, 'sine', vol, delay, 0.14, 0.002);
    this._osc(p * 2.65, p * 2.1, 0.022, 'triangle', vol * 0.38, delay, 0.10, 0.0015);
    this._filteredNoise({
      dur: 0.014, vol: vol * 0.55, delay, pink: false,
      filterType: 'bandpass', freqStart: p * 3.1, freqEnd: p * 1.8, q: 2.5, attack: 0.001, wet: 0.08,
    });
  }

  // Real metallic click/pawl (spinning-reel ratchet, bail arm, drag clutch)
  _metalClick(pitch = 2600, vol = 0.075, delay = 0, dur = 0.016) {
    if (!this._ready()) return;
    const p = pitch * (0.95 + Math.random() * 0.10);
    this._filteredNoise({
      dur: dur * 0.85, vol: vol * 1.1, delay, pink: false,
      filterType: 'bandpass', freqStart: p, freqEnd: p * 0.72, q: 4.2, attack: 0.001, wet: 0.10,
    });
    this._osc(p * 0.92, p * 0.86, dur * 1.4, 'sine', vol * 0.42, delay, 0.08, 0.001);
    this._osc(p * 1.78, p * 1.68, dur, 'sine', vol * 0.25, delay, 0.08, 0.001);
  }

  // Real metallic coin clink (inharmonic brass/gold modal partials)
  _coinClink(base = 2420, vol = 0.07, delay = 0) {
    if (!this._ready()) return;
    const ratios = [1.0, 1.52, 2.18, 2.87];
    const amps = [1.0, 0.65, 0.42, 0.22];
    const durs = [0.22, 0.17, 0.12, 0.08];
    const jitter = 0.97 + Math.random() * 0.06;
    ratios.forEach((r, i) => {
      this._osc(base * r * jitter, base * r * jitter * 0.996, durs[i], 'sine', vol * amps[i], delay, 0.28, 0.002);
    });
    this._filteredNoise({
      dur: 0.012, vol: vol * 0.6, delay, pink: false,
      filterType: 'highpass', freqStart: 4200, freqEnd: 5200, q: 1.5, attack: 0.001, wet: 0.12,
    });
  }

  // Natural acoustic plucked/bell tone (harmonic overtones + gentle shimmer, ZERO harsh square buzz!)
  _acousticNote(freq, dur = 0.32, vol = 0.095, delay = 0, timbre = 'harp') {
    if (!this._ready()) return;
    if (timbre === 'marimba') {
      this._osc(freq, freq * 0.998, dur, 'sine', vol, delay, 0.28, 0.003);
      this._osc(freq * 4.0, freq * 3.96, dur * 0.28, 'sine', vol * 0.28, delay, 0.18, 0.002);
      this._woodKnock(freq * 1.5, vol * 0.22, delay);
    } else if (timbre === 'bell') {
      this._osc(freq, freq, dur * 1.2, 'sine', vol * 0.85, delay, 0.45, 0.003);
      this._osc(freq * 2.0, freq * 2.0, dur * 0.72, 'sine', vol * 0.36, delay, 0.42, 0.002);
      this._osc(freq * 2.99, freq * 2.99, dur * 0.42, 'sine', vol * 0.20, delay, 0.38, 0.002);
      this._osc(freq * 4.21, freq * 4.21, dur * 0.22, 'sine', vol * 0.10, delay, 0.30, 0.002);
    } else if (timbre === 'brass') {
      // Warm acoustic horn/fanfare tone filtered gently
      this._osc(freq, freq * 1.002, dur, 'triangle', vol * 0.92, delay, 0.36, 0.014);
      this._osc(freq * 2.0, freq * 2.0, dur * 0.85, 'sine', vol * 0.38, delay, 0.34, 0.018);
      this._osc(freq * 3.0, freq * 3.0, dur * 0.55, 'sine', vol * 0.14, delay, 0.28, 0.020);
    } else {
      // Warm acoustic harp / nylon pluck
      this._osc(freq, freq * 0.999, dur, 'triangle', vol * 0.88, delay, 0.38, 0.004);
      this._osc(freq * 2.0, freq * 1.998, dur * 0.52, 'sine', vol * 0.34, delay, 0.34, 0.003);
      this._osc(freq * 3.0, freq * 2.995, dur * 0.26, 'sine', vol * 0.12, delay, 0.26, 0.002);
    }
  }

  // ── UI & Menu Foley ───────────────────────────────────────────────────────
  playUiClick() {
    if (this._playSample('ui_click', 0.65)) return;
    this._woodKnock(660, 0.085);
  }

  playUiTab() {
    if (this._playSample('ui_tab', 0.65)) return;
    this._woodKnock(560, 0.075, 0);
    this._metalClick(3200, 0.032, 0.018, 0.012);
  }

  playUiOpen() {
    if (this._playSample('ui_open', 0.72)) return;
    this._woodKnock(460, 0.08, 0);
    this._acousticNote(523.3, 0.16, 0.05, 0.02, 'marimba');
    this._acousticNote(659.3, 0.20, 0.05, 0.06, 'marimba');
  }

  playUiClose() {
    if (this._playSample('ui_close', 0.68)) return;
    this._woodKnock(420, 0.075, 0);
    this._acousticNote(493.9, 0.13, 0.042, 0.015, 'marimba');
    this._acousticNote(392.0, 0.16, 0.038, 0.055, 'marimba');
  }

  playUiError() {
    if (this._playSample('ui_error', 0.72)) return;
    this._woodKnock(210, 0.11, 0);
    this._woodKnock(168, 0.11, 0.09);
  }

  playToggle(on = true) {
    if (this._playSample(on ? 'toggle_on' : 'toggle_off', 0.7)) return;
    if (on) {
      this._metalClick(2400, 0.055, 0, 0.014);
      this._woodKnock(740, 0.07, 0.018);
    } else {
      this._metalClick(1850, 0.05, 0, 0.014);
      this._woodKnock(470, 0.07, 0.018);
    }
  }

  playSliderTick(frac = 0.5) {
    const now = performance.now();
    if (now - this.lastSliderTick < 55) return;
    this.lastSliderTick = now;
    this._woodKnock(440 + frac * 420, 0.042);
  }

  // ── Realistic Casting, Lure & Water Foley ─────────────────────────────────
  playCastStart() {
    if (this._playSample('cast_start', 0.7)) return;
    // Opening the spinning-reel bail arm + wooden rod handle grip
    this._metalClick(3400, 0.075, 0, 0.016);
    this._woodKnock(320, 0.065, 0.01);
  }

  playCastCharge(power = 0.5) {
    const now = performance.now();
    if (now - this.lastChargeTick < 110) return;
    this.lastChargeTick = now;
    // Subtle flexing graphite rod tension creak
    this._filteredNoise({
      dur: 0.045, vol: 0.045 + power * 0.03, pink: true,
      filterType: 'bandpass', freqStart: 320 + power * 520, freqEnd: 460 + power * 640, q: 4.5, attack: 0.008, wet: 0.08,
    });
  }

  playCast(power = 0.6) {
    if (this._playSample('cast', 0.85, 0.05, 0.92 + power * 0.18)) return;
    const p = Math.max(0.12, Math.min(1, power));
    // 1) Crisp bail-release click
    this._metalClick(3900, 0.055, 0, 0.012);
    // 2) Authentic carbon-fiber fishing rod air-whip whoosh (rising then falling Doppler peak!)
    const whipDur = 0.14 + p * 0.09;
    this._filteredNoise({
      dur: whipDur, vol: 0.19 + p * 0.12, delay: 0.005, pink: true,
      filterType: 'bandpass', freqStart: 340, freqEnd: 1850 + p * 1250, q: 2.6, attack: 0.025, wet: 0.22,
    });
    this._filteredNoise({
      dur: whipDur * 0.85, vol: 0.12 + p * 0.07, delay: whipDur * 0.45, pink: false,
      filterType: 'bandpass', freqStart: 1900 + p * 850, freqEnd: 460, q: 1.9, attack: 0.01, wet: 0.20,
    });
    // 3) Monofilament line peeling rapidly off spool
    const ticks = Math.round(3 + p * 4);
    for (let i = 0; i < ticks; i++) {
      this._metalClick(4400 - i * 260, 0.022 * (1 - i / (ticks + 1)), 0.06 + i * 0.024, 0.009);
    }
  }

  playSplash(big = false) {
    if (this._playSample(big ? 'splash_big' : 'splash_small', big ? 0.92 : 0.78, 0.07)) return;
    // 1) Water cavity impact thump (low hydrodynamic plunge)
    this._osc(big ? 132 : 210, big ? 44 : 78, big ? 0.17 : 0.095, 'sine', big ? 0.20 : 0.12, 0, 0.25, 0.004);
    // 2) Wide turbulent splash body + bright spray mist
    this._filteredNoise({
      dur: big ? 0.42 : 0.22, vol: big ? 0.28 : 0.18, delay: 0.005, pink: true,
      filterType: 'lowpass', freqStart: big ? 1650 : 2100, freqEnd: big ? 320 : 480, q: 1.1, attack: 0.012, wet: 0.35,
    });
    this._filteredNoise({
      dur: big ? 0.30 : 0.16, vol: big ? 0.16 : 0.10, delay: 0.018, pink: false,
      filterType: 'bandpass', freqStart: big ? 2200 : 2900, freqEnd: big ? 760 : 1050, q: 0.9, attack: 0.014, wet: 0.32,
    });
    // 3) Stochastic Minnaert bubble pops (what makes water sound unmistakably real!)
    const bubbleCount = big ? 9 : 5;
    for (let i = 0; i < bubbleCount; i++) {
      const d = (big ? 0.035 : 0.025) + Math.random() * (big ? 0.28 : 0.14);
      const f = (big ? 280 : 440) + Math.random() * (big ? 620 : 680);
      this._bubble(f, 0.035 + Math.random() * 0.035, (big ? 0.055 : 0.042) * (0.65 + Math.random() * 0.5), d);
    }
  }

  playRetrieveStart() {
    if (this._playSample('retrieve_start', 0.7)) return;
    // Bail arm clicking shut before cranking line in
    this._metalClick(2900, 0.075, 0, 0.016);
    this._metalClick(1900, 0.05, 0.016, 0.012);
  }

  playRetrieveFinish() {
    if (this._playSample('retrieve_finish', 0.75)) return;
    // Lure popping cleanly out of surface water
    this._bubble(480, 0.05, 0.07, 0);
    this._bubble(760, 0.04, 0.05, 0.035);
    this._filteredNoise({
      dur: 0.11, vol: 0.11, delay: 0.01, pink: true,
      filterType: 'bandpass', freqStart: 1600, freqEnd: 700, q: 1.4, attack: 0.008, wet: 0.26,
    });
  }

  playJig() {
    if (this._playSample('jig', 0.7)) return;
    this._bubble(520, 0.048, 0.055, 0);
    this._filteredNoise({
      dur: 0.08, vol: 0.07, delay: 0.005, pink: true,
      filterType: 'bandpass', freqStart: 1100, freqEnd: 520, q: 1.8, attack: 0.008, wet: 0.25,
    });
  }

  // ── Realistic Fish AI, Bite & Reeling Foley ───────────────────────────────
  playFishCurious() {
    const now = performance.now();
    if (now - this.lastCuriousBlip < 750) return;
    this.lastCuriousBlip = now;
    if (this._playSample('fish_curious', 0.55)) return;
    // Subtle underwater fin swish + single tiny rising bubble
    this._filteredNoise({
      dur: 0.10, vol: 0.055, pink: true,
      filterType: 'lowpass', freqStart: 420, freqEnd: 180, q: 1.2, attack: 0.025, wet: 0.30,
    });
    this._bubble(560, 0.042, 0.035, 0.045);
  }

  playNibble() {
    if (this._playSample('nibble', 0.8, 0.06)) return;
    // Cork/plastic bobber getting dunked lightly + 3 realistic underwater bloop bubbles!
    this._osc(260, 145, 0.065, 'sine', 0.10, 0, 0.24, 0.004);
    this._bubble(360, 0.05, 0.075, 0.015);
    this._bubble(540, 0.042, 0.055, 0.065);
    this._bubble(720, 0.036, 0.038, 0.11);
    this._filteredNoise({
      dur: 0.09, vol: 0.075, delay: 0.01, pink: true,
      filterType: 'bandpass', freqStart: 950, freqEnd: 460, q: 1.5, attack: 0.008, wet: 0.25,
    });
  }

  playBite(rarity = 'common') {
    const isRare = rarity === 'rare' || rarity === 'epic';
    const isTop = rarity === 'legendary' || rarity === 'myth';
    if (this._playSample(isTop ? 'bite_big' : 'bite', 0.92, 0.04)) return;
    // Urgent splashy bobber yank + crisp rod-tip brass strike bell!
    this.playSplash(true);
    this._osc(190, 88, 0.11, 'sine', 0.14, 0, 0.20, 0.003);
    // Authentic pier rod-tip bite bell ring!
    this._acousticNote(1174.7, 0.24, 0.095, 0.01, 'bell');
    this._acousticNote(1568.0, 0.28, 0.085, 0.075, 'bell');
    if (isRare || isTop) {
      this._acousticNote(2093.0, 0.34, 0.075, 0.13, 'bell');
    }
    if (isTop) {
      this._acousticNote(2637.0, 0.42, 0.065, 0.18, 'bell');
    }
  }

  playHookSet() {
    if (this._playSample('hook_set', 0.88)) return;
    // Snappy upward rod whip + taut monofilament tug + solid splash
    this._filteredNoise({
      dur: 0.13, vol: 0.22, pink: true,
      filterType: 'bandpass', freqStart: 480, freqEnd: 2200, q: 2.2, attack: 0.012, wet: 0.22,
    });
    this._osc(220, 520, 0.085, 'triangle', 0.09, 0.01, 0.18, 0.004);
    this._metalClick(3100, 0.085, 0.02, 0.018);
    this._bubble(420, 0.05, 0.06, 0.04);
  }

  playFishWarning() {
    if (this._playSample('fish_warning', 0.8)) return;
    // Underwater surge + quick double reel-drag twitch warning player to brace!
    this._filteredNoise({
      dur: 0.16, vol: 0.12, pink: true,
      filterType: 'lowpass', freqStart: 540, freqEnd: 260, q: 1.8, attack: 0.02, wet: 0.28,
    });
    this._metalClick(3400, 0.08, 0.01, 0.016);
    this._metalClick(3900, 0.085, 0.075, 0.016);
  }

  playFishThrash() {
    if (this._playSample('fish_thrash', 0.9, 0.06)) return;
    // Heavy surface tail-slap + churning whitewater boil + frantic bubbles!
    this._osc(140, 52, 0.14, 'sine', 0.18, 0, 0.24, 0.003);
    this._filteredNoise({
      dur: 0.34, vol: 0.26, delay: 0.008, pink: true,
      filterType: 'bandpass', freqStart: 1350, freqEnd: 460, q: 1.0, attack: 0.01, wet: 0.34,
    });
    this._filteredNoise({
      dur: 0.22, vol: 0.17, delay: 0.09, pink: false,
      filterType: 'bandpass', freqStart: 2200, freqEnd: 880, q: 1.2, attack: 0.012, wet: 0.30,
    });
    for (let i = 0; i < 6; i++) {
      this._bubble(320 + Math.random() * 540, 0.04, 0.052, 0.03 + i * 0.038);
    }
  }

  playFishCalm() {
    if (this._playSample('fish_calm', 0.65)) return;
    // Soft settling water ripple
    this._filteredNoise({
      dur: 0.16, vol: 0.07, pink: true,
      filterType: 'lowpass', freqStart: 620, freqEnd: 240, q: 1.0, attack: 0.02, wet: 0.30,
    });
    this._bubble(460, 0.045, 0.038, 0.03);
  }

  playReelTick(tension = 0.3, inSweetSpot = false) {
    const now = performance.now();
    const minGap = inSweetSpot ? 62 : 76;
    if (now - this.lastReelTick < minGap) return;
    this.lastReelTick = now;
    if (this._playSample('reel_tick', 0.45, 0.06, 0.92 + tension * 0.32, 0.08)) return;

    // Authentic mechanical fishing reel pawl click (metallic ratchet tooth!)
    const pawlPitch = 2150 + tension * 1350;
    this._metalClick(pawlPitch, 0.062 + tension * 0.022, 0, 0.013);
    // Subtle reel gear body resonance
    this._woodKnock(390 + tension * 180, 0.032, 0.002);

    // Subtle acoustic harmonic shimmer when pulling smoothly in the Sweet Spot!
    if (inSweetSpot && now - this.lastSweetTick > 210) {
      this.lastSweetTick = now;
      this._osc(784 + tension * 140, 880 + tension * 140, 0.08, 'sine', 0.024, 0.008, 0.34, 0.005);
    }
  }

  playDragOut(tension = 0.4) {
    const now = performance.now();
    if (now - this.lastDragTick < 105) return;
    this.lastDragTick = now;
    if (this._playSample('drag_out', 0.55, 0.05, 0.95 + tension * 0.25, 0.1)) return;
    // Rapid screaming spinning-reel drag clutch ("zzt-zzt") as fish strips line!
    const base = 3300 + tension * 1100;
    this._metalClick(base, 0.052, 0, 0.011);
    this._metalClick(base * 1.05, 0.045, 0.036, 0.011);
  }

  playTensionWarn() {
    const now = performance.now();
    if (now - this.lastWarnTick < 185) return;
    this.lastWarnTick = now;
    if (this._playSample('tension_warn', 0.72)) return;
    // Taut creaking fishing rod & stretched singing monofilament wire!
    this._osc(620, 690, 0.09, 'triangle', 0.055, 0, 0.14, 0.01);
    this._filteredNoise({
      dur: 0.08, vol: 0.075, pink: true,
      filterType: 'bandpass', freqStart: 1250, freqEnd: 1650, q: 5.5, attack: 0.008, wet: 0.10,
    });
  }

  playSnap() {
    if (this._playSample('line_snap', 0.92)) return;
    // Sharp whipping monofilament snap crack + elastic twang recoil + splash!
    this._filteredNoise({
      dur: 0.045, vol: 0.34, pink: false,
      filterType: 'highpass', freqStart: 2800, freqEnd: 1400, q: 1.5, attack: 0.001, wet: 0.24,
    });
    this._osc(880, 175, 0.16, 'triangle', 0.14, 0.005, 0.22, 0.002);
    this._osc(420, 92, 0.24, 'sine', 0.12, 0.02, 0.24, 0.004);
    this.playSplash(false);
  }

  playEscape() {
    if (this._playSample('fish_escape', 0.85)) return;
    // Quick departing splash + retreating underwater tail thump
    this.playSplash(false);
    this._osc(180, 82, 0.18, 'sine', 0.11, 0.04, 0.28, 0.008);
    this._bubble(440, 0.05, 0.05, 0.08);
    this._bubble(320, 0.06, 0.045, 0.15);
  }

  playLandingLift() {
    if (this._playSample('landing_lift', 0.9)) return;
    // Heavy water-break breach + showering droplets + wet flop onto timber pier!
    this.playSplash(true);
    this._filteredNoise({
      dur: 0.24, vol: 0.18, delay: 0.04, pink: true,
      filterType: 'bandpass', freqStart: 900, freqEnd: 2400, q: 1.6, attack: 0.02, wet: 0.30,
    });
    this._woodKnock(240, 0.11, 0.22);
    this._acousticNote(523.3, 0.22, 0.065, 0.09, 'harp');
    this._acousticNote(784.0, 0.26, 0.065, 0.17, 'harp');
  }

  // ── Predator Ambush & World Events ────────────────────────────────────────
  playAmbushAlert() {
    if (this._playSample('ambush_alert', 0.9)) return;
    // Deep ominous underwater predator surge + tense low double bass swell!
    this._osc(78, 52, 0.26, 'sine', 0.19, 0, 0.34, 0.018);
    this._osc(116.5, 98, 0.22, 'triangle', 0.11, 0.02, 0.30, 0.015);
    this._filteredNoise({
      dur: 0.28, vol: 0.17, pink: true,
      filterType: 'lowpass', freqStart: 620, freqEnd: 190, q: 1.8, attack: 0.025, wet: 0.32,
    });
    this._bubble(260, 0.06, 0.065, 0.05);
    this._bubble(340, 0.05, 0.055, 0.12);
  }

  playChomp() {
    if (this._playSample('predator_chomp', 0.95)) return;
    // Heavy jaw snap crunch + sub-bass water shockwave + boiling splash!
    this._osc(96, 34, 0.24, 'sine', 0.26, 0, 0.30, 0.003);
    this._filteredNoise({
      dur: 0.11, vol: 0.32, pink: false,
      filterType: 'bandpass', freqStart: 1450, freqEnd: 420, q: 2.0, attack: 0.002, wet: 0.22,
    });
    this._woodKnock(185, 0.18, 0.005);
    this.playSplash(true);
    this._acousticNote(329.6, 0.28, 0.08, 0.09, 'brass');
    this._acousticNote(493.9, 0.36, 0.085, 0.16, 'brass');
  }

  playMythSpawn() {
    if (this._playSample('myth_spawn', 0.95)) return;
    // Awe-inspiring deep abyssal Leviathan/Kraken resonant whale-like hum + astral chimes
    this._osc(65.4, 58.3, 0.95, 'sine', 0.18, 0, 0.55, 0.08);
    this._osc(130.8, 123.5, 0.78, 'triangle', 0.09, 0.05, 0.50, 0.07);
    this._filteredNoise({
      dur: 0.65, vol: 0.12, delay: 0.04, pink: true,
      filterType: 'lowpass', freqStart: 380, freqEnd: 140, q: 2.2, attack: 0.10, wet: 0.45,
    });
    [523.3, 784.0, 987.8, 1568.0].forEach((f, i) => {
      this._acousticNote(f, 0.58, 0.055, 0.12 + i * 0.09, 'bell');
    });
  }

  playShootingStar() {
    const now = performance.now();
    if (now - this.lastStarChime < 3200) return;
    this.lastStarChime = now;
    if (this._playSample('shooting_star', 0.42)) return;
    // Whisper-soft crystalline night chime
    this._acousticNote(1568.0, 0.34, 0.022, 0, 'bell');
    this._acousticNote(2093.0, 0.40, 0.018, 0.07, 'bell');
  }

  // ── Acoustic Musical Fanfares, Coins, Maps & Time ─────────────────────────
  playCatch(rarity = 'common') {
    const key = (rarity === 'myth' || rarity === 'mythic') ? 'catch_myth'
      : rarity === 'legendary' ? 'catch_legendary' : 'catch';
    if (this._playSample(key, 0.88)) return;

    if (rarity === 'myth' || rarity === 'mythic') {
      const notes = [392.0, 523.3, 659.3, 784.0, 987.8, 1318.5, 1568.0];
      notes.forEach((f, i) => {
        this._acousticNote(f, i === notes.length - 1 ? 0.85 : 0.34, 0.088, i * 0.078, 'harp');
        if (i >= 3) this._acousticNote(f * 2, 0.45, 0.032, i * 0.078 + 0.02, 'bell');
      });
      this._osc(130.8, 130.8, 0.75, 'sine', 0.10, 0.04, 0.45, 0.04);
      return;
    }
    if (rarity === 'legendary') {
      const notes = [440.0, 554.4, 659.3, 880.0, 1108.7, 1318.5];
      notes.forEach((f, i) => {
        this._acousticNote(f, i === notes.length - 1 ? 0.72 : 0.28, 0.085, i * 0.075, 'brass');
        if (i === notes.length - 1) this._acousticNote(f * 2, 0.50, 0.035, i * 0.075 + 0.02, 'bell');
      });
      return;
    }
    const notes = (rarity === 'epic' || rarity === 'rare')
      ? [440.0, 554.4, 659.3, 880.0, 1108.7]
      : [392.0, 493.9, 587.3, 784.0];
    notes.forEach((f, i) => {
      this._acousticNote(f, i === notes.length - 1 ? 0.54 : 0.24, 0.082, i * 0.072, 'harp');
    });
  }

  playNewSpecies() {
    if (this._playSample('new_species', 0.8)) return;
    [880.0, 1174.7, 1396.9, 1760.0].forEach((f, i) => {
      this._acousticNote(f, 0.32, 0.048, 0.38 + i * 0.068, 'bell');
    });
  }

  playNewRecord() {
    if (this._playSample('new_record', 0.8)) return;
    this._acousticNote(987.8, 0.24, 0.055, 0.38, 'bell');
    this._acousticNote(1318.5, 0.36, 0.06, 0.46, 'bell');
  }

  playCoinJingle(big = false) {
    if (this._playSample(big ? 'coins_big' : 'coins', 0.8, 0.04)) return;
    this._coinClink(2420, 0.07, 0);
    this._coinClink(2860, 0.065, 0.062);
    if (big) {
      this._coinClink(3240, 0.06, 0.12);
      this._coinClink(2680, 0.055, 0.175);
    }
  }

  playBuy() {
    if (this._playSample('shop_buy', 0.82)) return;
    this._coinClink(2480, 0.075, 0);
    this._coinClink(3120, 0.07, 0.068);
    this._woodKnock(580, 0.07, 0.02);
  }

  playMaxUpgrade() {
    if (this._playSample('max_upgrade', 0.88)) return;
    this._coinClink(2640, 0.07, 0);
    [523.3, 659.3, 784.0, 1046.5, 1318.5].forEach((f, i) => {
      this._acousticNote(f, i === 4 ? 0.55 : 0.22, 0.072, 0.04 + i * 0.06, 'bell');
    });
  }

  playMapUnlock() {
    if (this._playSample('map_unlock', 0.9)) return;
    [392.0, 493.9, 587.3, 784.0, 987.8].forEach((f, i) => {
      this._acousticNote(f, i === 4 ? 0.68 : 0.28, 0.082, i * 0.075, 'harp');
    });
  }

  playMapTravel(mapId = 'harbor') {
    if (this._playSample(`travel_${mapId}`, 0.85)) return;
    // Gentle ocean wave wash + signature biome acoustic motif!
    this._filteredNoise({
      dur: 0.45, vol: 0.12, pink: true,
      filterType: 'lowpass', freqStart: 780, freqEnd: 260, q: 0.9, attack: 0.08, wet: 0.36,
    });
    if (mapId === 'lagoon') {
      [523.3, 659.3, 784.0].forEach((f, i) => this._acousticNote(f, 0.26, 0.075, i * 0.07, 'marimba'));
    } else if (mapId === 'fjord') {
      [880.0, 1174.7, 1318.5].forEach((f, i) => this._acousticNote(f, 0.42, 0.055, i * 0.075, 'bell'));
    } else if (mapId === 'abyss') {
      this._osc(98, 73.4, 0.42, 'sine', 0.15, 0, 0.40, 0.03);
      this._acousticNote(293.7, 0.34, 0.07, 0.08, 'brass');
      this._acousticNote(349.2, 0.40, 0.065, 0.16, 'brass');
    } else if (mapId === 'sanctuary') {
      [523.3, 784.0, 987.8, 1318.5].forEach((f, i) => this._acousticNote(f, 0.48, 0.058, i * 0.068, 'harp'));
    } else {
      [440.0, 554.4, 659.3].forEach((f, i) => this._acousticNote(f, 0.32, 0.068, i * 0.07, 'harp'));
    }
  }

  playTimeShift(phase = 'DAY') {
    if (this._playSample('time_shift', 0.72)) return;
    if (phase === 'NIGHT') {
      this._acousticNote(659.3, 0.32, 0.05, 0, 'bell');
      this._acousticNote(392.0, 0.42, 0.05, 0.08, 'bell');
    } else if (phase === 'DAWN') {
      this._acousticNote(440.0, 0.24, 0.055, 0, 'harp');
      this._acousticNote(659.3, 0.34, 0.055, 0.075, 'harp');
    } else if (phase === 'SUNSET') {
      this._acousticNote(587.3, 0.28, 0.055, 0, 'harp');
      this._acousticNote(440.0, 0.36, 0.055, 0.08, 'harp');
    } else {
      this._acousticNote(523.3, 0.24, 0.055, 0, 'marimba');
      this._acousticNote(784.0, 0.30, 0.055, 0.07, 'marimba');
    }
  }

  playReset() {
    if (this._playSample('reset', 0.8)) return;
    this._woodKnock(420, 0.10, 0);
    this._osc(310, 110, 0.28, 'triangle', 0.09, 0.04, 0.26, 0.01);
  }

  playMiss() {
    if (this._playSample('miss', 0.75)) return;
    this._woodKnock(280, 0.09, 0);
    this._osc(240, 140, 0.16, 'sine', 0.075, 0.02, 0.22, 0.008);
  }
}

export const sound = new SoundEngine();
