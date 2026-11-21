// Realistic physical-modeling Foley, multi-variant round-robin SFX,
// stereo spatial panning, and living biome ambient soundscapes.
// Supports optional external sample packs (single file or round-robin arrays)
// in assets/sfx/manifest.json (compatible with Mirli/Soundbox & Agent Audio).

class SoundEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.dryBus = null;
    this.wetBus = null;
    this.ambBus = null;
    this.convolver = null;
    this.noiseBuf = null;
    this.pinkBuf = null;
    this.muted = false;

    // Active biome environment state (shapes UI material, splash flavor & ambience)
    this.env = {
      mapId: 'harbor',
      dockStyle: 'wood',
      night: 0,
    };

    // Continuous procedural ocean/biome ambience nodes
    this.ambActive = false;
    this.ambNodes = null;
    this.ambEventTimer = 0;

    // Anti-repetition round-robin memory (key -> last index)
    this.lastVariant = new Map();

    // Optional external audio sample buffers (key -> AudioBuffer[])
    this.samples = new Map();
    this.manifestChecked = false;

    // Smart per-effect throttles
    this.lastReelTick = 0;
    this.lastWarnTick = 0;
    this.lastChargeTick = 0;
    this.lastSliderTick = 0;
    this.lastDragTick = 0;
    this.lastSweetTick = 0;
    this.lastStarChime = 0;
    this.lastCuriousBlip = 0;
    this.lastBubblePop = 0;
    this.lastPierCreak = 0;
    this.lastHoverTick = 0;
    this.lastSeabedTap = 0;
  }

  unlock() {
    if (this.muted) return;
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this._initGraph();
      this._startAmbienceBed();
      this._loadSampleManifest();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  setMuted(flag) {
    this.muted = !!flag;
    if (this.master && this.ctx) {
      try {
        this.master.gain.setTargetAtTime(this.muted ? 0.0001 : 0.92, this.ctx.currentTime, 0.02);
      } catch (_) {}
    }
  }

  setEnvironment(mapId = 'harbor', dockStyle = 'wood', night = 0) {
    this.env.mapId = mapId;
    this.env.dockStyle = dockStyle;
    this.env.night = Math.max(0, Math.min(1, night));
    this._updateAmbienceTone();
  }

  // Called gently from game update loop (~60Hz) to modulate waves & occasional biome wildlife Foley
  tickAmbience(dt, mapId, dockStyle, night, isModalOpen = false) {
    const changed = this.env.mapId !== mapId || Math.abs(this.env.night - night) > 0.04;
    this.env.mapId = mapId;
    this.env.dockStyle = dockStyle;
    this.env.night = night;

    if (!this._ready()) return;
    if (changed) this._updateAmbienceTone();

    if (isModalOpen) return;
    this.ambEventTimer -= dt;
    if (this.ambEventTimer <= 0) {
      this.ambEventTimer = 4.2 + Math.random() * 6.5;
      this._playBiomeAmbientOneShot();
    }
  }

  // Round-robin variant picker (guarantees never repeating the exact same variation twice in a row)
  _pickVariant(key, count) {
    if (count <= 1) return 0;
    const prev = this.lastVariant.get(key);
    let idx = Math.floor(Math.random() * count);
    if (idx === prev) idx = (idx + 1 + Math.floor(Math.random() * (count - 1))) % count;
    this.lastVariant.set(key, idx);
    return idx;
  }

  _initGraph() {
    const ctx = this.ctx;
    if (!ctx) return;

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

    this.wetBus = ctx.createGain();
    this.wetBus.gain.setValueAtTime(0.25, ctx.currentTime);

    this.ambBus = ctx.createGain();
    this.ambBus.gain.setValueAtTime(0.26, ctx.currentTime);

    if (typeof ctx.createConvolver === 'function') {
      this.convolver = ctx.createConvolver();
      this.convolver.buffer = this._createCoastalImpulse(1.05, 3.1);
      this.wetBus.connect(this.convolver);
      this.convolver.connect(comp);
    } else {
      this.wetBus.connect(comp);
    }

    this.dryBus.connect(comp);
    this.ambBus.connect(comp);
    comp.connect(this.master);
    this.master.connect(ctx.destination);

    this.noiseBuf = this._createNoiseBuffer(3.0, false);
    this.pinkBuf = this._createNoiseBuffer(3.0, true);
  }

  _startAmbienceBed() {
    if (this.ambActive || !this.ctx || !this.pinkBuf || !this.ambBus) return;
    try {
      const ctx = this.ctx;
      // Layer 1: Gentle rolling coastal surf / wind wash modulated by slow LFO
      const waveSrc = ctx.createBufferSource();
      waveSrc.buffer = this.pinkBuf;
      waveSrc.loop = true;

      const waveFilter = ctx.createBiquadFilter();
      waveFilter.type = 'lowpass';
      waveFilter.frequency.setValueAtTime(340, ctx.currentTime);
      waveFilter.Q.setValueAtTime(0.9, ctx.currentTime);

      const waveGain = ctx.createGain();
      waveGain.gain.setValueAtTime(0.055, ctx.currentTime);

      // Slow ocean swell LFO (0.11 Hz -> gentle 9-second tide breathing)
      const swellLfo = ctx.createOscillator();
      swellLfo.type = 'sine';
      swellLfo.frequency.setValueAtTime(0.11, ctx.currentTime);
      const swellDepth = ctx.createGain();
      swellDepth.gain.setValueAtTime(140, ctx.currentTime);
      swellLfo.connect(swellDepth);
      swellDepth.connect(waveFilter.frequency);

      const swellAmp = ctx.createGain();
      swellAmp.gain.setValueAtTime(0.022, ctx.currentTime);
      swellLfo.connect(swellAmp);
      swellAmp.connect(waveGain.gain);

      waveSrc.connect(waveFilter);
      waveFilter.connect(waveGain);
      waveGain.connect(this.ambBus);

      // Layer 2: Soft high-altitude wind / caldera / astral shimmer bed
      const airSrc = ctx.createBufferSource();
      airSrc.buffer = this.pinkBuf;
      airSrc.loop = true;

      const airFilter = ctx.createBiquadFilter();
      airFilter.type = 'bandpass';
      airFilter.frequency.setValueAtTime(920, ctx.currentTime);
      airFilter.Q.setValueAtTime(2.2, ctx.currentTime);

      const airGain = ctx.createGain();
      airGain.gain.setValueAtTime(0.015, ctx.currentTime);

      airSrc.connect(airFilter);
      airFilter.connect(airGain);
      airGain.connect(this.ambBus);

      waveSrc.start();
      airSrc.start();
      swellLfo.start();

      this.ambNodes = { waveFilter, waveGain, airFilter, airGain, swellLfo };
      this.ambActive = true;
      this._updateAmbienceTone();
    } catch (_) {}
  }

  _updateAmbienceTone() {
    if (!this.ambNodes || !this.ctx) return;
    const t = this.ctx.currentTime;
    const { mapId, night } = this.env;
    const { waveFilter, waveGain, airFilter, airGain, swellLfo } = this.ambNodes;

    // Shape ambient surf & wind uniquely per biome and time of day!
    let wf = 340, wg = 0.055, af = 920, ag = 0.014, rate = 0.11;
    if (mapId === 'lagoon') {
      wf = 420; wg = 0.052; af = 1280; ag = 0.015; rate = 0.14;
    } else if (mapId === 'fjord') {
      wf = 270; wg = 0.048; af = 1480; ag = 0.026; rate = 0.085;
    } else if (mapId === 'abyss') {
      wf = 175; wg = 0.072; af = 480; ag = 0.024; rate = 0.07;
    } else if (mapId === 'sanctuary') {
      wf = 310; wg = 0.044; af = 1720; ag = 0.020; rate = 0.095;
    }
    // Night calms waves slightly and deepens air resonance
    wf *= (1 - night * 0.20);
    wg *= (1 - night * 0.14);
    try {
      waveFilter.frequency.setTargetAtTime(wf, t, 0.4);
      waveGain.gain.setTargetAtTime(wg, t, 0.4);
      airFilter.frequency.setTargetAtTime(af, t, 0.4);
      airGain.gain.setTargetAtTime(ag, t, 0.4);
      swellLfo.frequency.setTargetAtTime(rate, t, 0.5);
    } catch (_) {}
  }

  _playBiomeAmbientOneShot() {
    const { mapId, night } = this.env;
    const pan = (Math.random() * 1.4 - 0.7);
    if (mapId === 'harbor') {
      if (night > 0.52) this.playCricket(pan);
      else this.playSeagull(pan);
    } else if (mapId === 'lagoon') {
      if (night > 0.52) this.playCricket(pan);
      else this.playTropicalBird(pan);
    } else if (mapId === 'fjord') {
      if (Math.random() < 0.55) this.playIceCrack(pan);
      else if (night > 0.45) this.playAuroraShimmer(pan);
    } else if (mapId === 'abyss') {
      this.playLavaPop(pan);
    } else if (mapId === 'sanctuary') {
      this.playCrystalHum(pan);
    }
  }

  _createNoiseBuffer(seconds, pink = false) {
    const ctx = this.ctx;
    const len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    if (!pink) {
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } else {
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

  _createCoastalImpulse(dur = 1.05, decay = 3.1) {
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
        lp = lp * 0.72 + w * 0.28;
        d[i] = lp;
      }
    }
    return buf;
  }

  async _loadSampleManifest() {
    if (this.manifestChecked || typeof fetch !== 'function') return;
    this.manifestChecked = true;
    try {
      const res = await fetch('assets/sfx/manifest.json', { cache: 'no-cache' });
      if (!res.ok) return;
      const manifest = await res.json();
      if (!manifest || !manifest.files) return;
      const entries = Object.entries(manifest.files);
      await Promise.all(entries.map(async ([key, rel]) => {
        const list = Array.isArray(rel) ? rel : [rel];
        const bufs = [];
        for (const relPath of list) {
          try {
            const r = await fetch(`assets/sfx/${relPath}`);
            if (!r.ok) continue;
            const arr = await r.arrayBuffer();
            const decoded = await this.ctx.decodeAudioData(arr);
            bufs.push(decoded);
          } catch (_) {}
        }
        if (bufs.length) this.samples.set(key, bufs);
      }));
    } catch (_) {
      // Physical-modeling Foley synth handles all audio seamlessly
    }
  }

  _playSample(key, vol = 0.85, rateJitter = 0.05, rateBase = 1.0, wet = 0.18, pan = 0) {
    if (this.muted || !this.ctx || !this.samples.has(key)) return false;
    try {
      const list = this.samples.get(key);
      const idx = this._pickVariant(`smp_${key}`, list.length);
      const src = this.ctx.createBufferSource();
      src.buffer = list[idx];
      src.playbackRate.value = Math.max(0.5, rateBase + (Math.random() * 2 - 1) * rateJitter);
      const g = this.ctx.createGain();
      g.gain.value = vol;
      src.connect(g);
      this._connectOut(g, 1.0, wet, pan);
      src.start();
      return true;
    } catch (_) {
      return false;
    }
  }

  _ready() {
    return !this.muted && this.ctx && this.dryBus;
  }

  _connectOut(node, dryVol = 1.0, wetVol = 0.18, pan = 0) {
    let source = node;
    if (pan !== 0 && typeof this.ctx.createStereoPanner === 'function') {
      const p = this.ctx.createStereoPanner();
      p.pan.value = Math.max(-0.88, Math.min(0.88, pan));
      node.connect(p);
      source = p;
    }
    if (dryVol > 0) {
      const dg = this.ctx.createGain();
      dg.gain.value = dryVol;
      source.connect(dg);
      dg.connect(this.dryBus);
    }
    if (wetVol > 0 && this.wetBus) {
      const wg = this.ctx.createGain();
      wg.gain.value = wetVol;
      source.connect(wg);
      wg.connect(this.wetBus);
    }
  }

  // ── Core Physical-Modeling Primitives ─────────────────────────────────────
  _osc(f0, f1, dur, type = 'sine', vol = 0.12, delay = 0, wet = 0.22, attack = 0.006, pan = 0) {
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
      this._connectOut(gain, 1.0, wet, pan);
      osc.start(now);
      osc.stop(now + dur + 0.03);
    } catch (_) {}
  }

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
    pan = 0,
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
      this._connectOut(gain, 1.0, wet, pan);
      src.start(now, offset, dur + 0.03);
    } catch (_) {}
  }

  _bubble(baseFreq = 420, dur = 0.055, vol = 0.065, delay = 0, pan = 0) {
    if (!this._ready()) return;
    const f0 = baseFreq * (0.88 + Math.random() * 0.24);
    const f1 = f0 * (1.38 + Math.random() * 0.42);
    this._osc(f0, f1, dur, 'sine', vol, delay, 0.34, 0.004, pan);
  }

  // Biome-material surface knock (wood / bamboo / frost-ice / basalt / marble!)
  _materialTap(pitch = 520, vol = 0.095, delay = 0, style = null, pan = 0) {
    if (!this._ready()) return;
    const mat = style || this.env.dockStyle || 'wood';
    const p = pitch * (0.94 + Math.random() * 0.12);
    if (mat === 'bamboo') {
      // Hollow resonant bamboo knock
      this._osc(p * 1.25, p * 1.05, 0.058, 'sine', vol * 1.05, delay, 0.22, 0.002, pan);
      this._osc(p * 2.15, p * 2.02, 0.032, 'sine', vol * 0.42, delay, 0.18, 0.002, pan);
    } else if (mat === 'frost') {
      // Crisp crystalline ice tap
      this._osc(p * 1.9, p * 1.85, 0.055, 'sine', vol * 0.72, delay, 0.30, 0.0015, pan);
      this._osc(p * 3.8, p * 3.7, 0.030, 'sine', vol * 0.35, delay, 0.28, 0.001, pan);
    } else if (mat === 'basalt') {
      // Heavy dense volcanic stone clack
      this._osc(p * 0.78, p * 0.62, 0.038, 'triangle', vol * 1.1, delay, 0.12, 0.0015, pan);
      this._filteredNoise({
        dur: 0.022, vol: vol * 0.85, delay, pink: false,
        filterType: 'bandpass', freqStart: p * 2.2, freqEnd: p * 1.1, q: 3.0, attack: 0.001, wet: 0.10, pan,
      });
    } else if (mat === 'marble') {
      // Clean temple marble clink
      this._osc(p * 1.5, p * 1.48, 0.068, 'sine', vol * 0.82, delay, 0.34, 0.0015, pan);
      this._osc(p * 2.95, p * 2.9, 0.042, 'sine', vol * 0.34, delay, 0.30, 0.0015, pan);
    } else {
      // Warm coastal pier timber knock
      this._osc(p * 1.14, p * 0.84, 0.046, 'sine', vol, delay, 0.15, 0.002, pan);
      this._osc(p * 2.65, p * 2.10, 0.022, 'triangle', vol * 0.36, delay, 0.10, 0.0015, pan);
    }
    this._filteredNoise({
      dur: 0.014, vol: vol * 0.48, delay, pink: false,
      filterType: 'bandpass', freqStart: p * 3.0, freqEnd: p * 1.7, q: 2.5, attack: 0.001, wet: 0.08, pan,
    });
  }

  _metalClick(pitch = 2600, vol = 0.075, delay = 0, dur = 0.016, pan = 0) {
    if (!this._ready()) return;
    const p = pitch * (0.93 + Math.random() * 0.14);
    this._filteredNoise({
      dur: dur * 0.85, vol: vol * 1.1, delay, pink: false,
      filterType: 'bandpass', freqStart: p, freqEnd: p * 0.72, q: 4.2, attack: 0.001, wet: 0.10, pan,
    });
    this._osc(p * 0.92, p * 0.86, dur * 1.4, 'sine', vol * 0.42, delay, 0.08, 0.001, pan);
    this._osc(p * 1.78, p * 1.68, dur, 'sine', vol * 0.25, delay, 0.08, 0.001, pan);
  }

  _coinClink(base = 2420, vol = 0.07, delay = 0, pan = 0) {
    if (!this._ready()) return;
    const ratios = [1.0, 1.52, 2.18, 2.87];
    const amps = [1.0, 0.65, 0.42, 0.22];
    const durs = [0.22, 0.17, 0.12, 0.08];
    const jitter = 0.94 + Math.random() * 0.12;
    ratios.forEach((r, i) => {
      this._osc(base * r * jitter, base * r * jitter * 0.996, durs[i], 'sine', vol * amps[i], delay, 0.28, 0.002, pan);
    });
    this._filteredNoise({
      dur: 0.012, vol: vol * 0.6, delay, pink: false,
      filterType: 'highpass', freqStart: 4200, freqEnd: 5200, q: 1.5, attack: 0.001, wet: 0.12, pan,
    });
  }

  _acousticNote(freq, dur = 0.32, vol = 0.095, delay = 0, timbre = 'harp', pan = 0) {
    if (!this._ready()) return;
    if (timbre === 'marimba') {
      this._osc(freq, freq * 0.998, dur, 'sine', vol, delay, 0.28, 0.003, pan);
      this._osc(freq * 4.0, freq * 3.96, dur * 0.28, 'sine', vol * 0.28, delay, 0.18, 0.002, pan);
      this._materialTap(freq * 1.4, vol * 0.20, delay, 'bamboo', pan);
    } else if (timbre === 'bell') {
      this._osc(freq, freq, dur * 1.2, 'sine', vol * 0.85, delay, 0.46, 0.003, pan);
      this._osc(freq * 2.0, freq * 2.0, dur * 0.72, 'sine', vol * 0.36, delay, 0.42, 0.002, pan);
      this._osc(freq * 2.99, freq * 2.99, dur * 0.42, 'sine', vol * 0.20, delay, 0.38, 0.002, pan);
      this._osc(freq * 4.21, freq * 4.21, dur * 0.22, 'sine', vol * 0.10, delay, 0.30, 0.002, pan);
    } else if (timbre === 'brass') {
      this._osc(freq, freq * 1.002, dur, 'triangle', vol * 0.92, delay, 0.36, 0.014, pan);
      this._osc(freq * 2.0, freq * 2.0, dur * 0.85, 'sine', vol * 0.38, delay, 0.34, 0.018, pan);
      this._osc(freq * 3.0, freq * 3.0, dur * 0.55, 'sine', vol * 0.14, delay, 0.28, 0.020, pan);
    } else {
      this._osc(freq, freq * 0.999, dur, 'triangle', vol * 0.88, delay, 0.38, 0.004, pan);
      this._osc(freq * 2.0, freq * 1.998, dur * 0.52, 'sine', vol * 0.34, delay, 0.34, 0.003, pan);
      this._osc(freq * 3.0, freq * 2.995, dur * 0.26, 'sine', vol * 0.12, delay, 0.26, 0.002, pan);
    }
  }

  // ── Biome Ambient Wildlife & Atmospheric One-Shots ────────────────────────
  playSeagull(pan = 0) {
    if (this._playSample('amb_seagull', 0.35, 0.08, 1.0, 0.45, pan)) return;
    const v = this._pickVariant('gull', 3);
    const base = 1380 + v * 140 + Math.random() * 110;
    // Two distant curving seagull cries fading over open bay
    this._osc(base, base * 1.32, 0.14, 'sine', 0.020, 0, 0.65, 0.025, pan);
    this._osc(base * 1.32, base * 0.86, 0.22, 'sine', 0.018, 0.13, 0.68, 0.015, pan);
    if (v !== 1) {
      this._osc(base * 0.95, base * 1.18, 0.12, 'sine', 0.014, 0.42, 0.65, 0.02, pan);
      this._osc(base * 1.18, base * 0.82, 0.18, 'sine', 0.012, 0.53, 0.68, 0.015, pan);
    }
  }

  playTropicalBird(pan = 0) {
    if (this._playSample('amb_tropical', 0.32, 0.08, 1.0, 0.45, pan)) return;
    const v = this._pickVariant('tropbird', 3);
    const f = 1850 + v * 210;
    this._osc(f, f * 1.38, 0.075, 'sine', 0.018, 0, 0.55, 0.01, pan);
    this._osc(f * 1.25, f * 0.92, 0.09, 'sine', 0.015, 0.095, 0.58, 0.01, pan);
    if (v === 2) this._osc(f * 1.4, f * 1.65, 0.08, 'sine', 0.013, 0.21, 0.60, 0.01, pan);
  }

  playCricket(pan = 0) {
    if (this._playSample('amb_cricket', 0.28, 0.06, 1.0, 0.35, pan)) return;
    const pulses = 3 + Math.floor(Math.random() * 2);
    const f = 4150 + Math.random() * 280;
    for (let i = 0; i < pulses; i++) {
      this._osc(f, f * 1.01, 0.028, 'sine', 0.012, i * 0.048, 0.35, 0.004, pan);
    }
  }

  playIceCrack(pan = 0) {
    if (this._playSample('amb_ice', 0.4, 0.08, 1.0, 0.5, pan)) return;
    const v = this._pickVariant('ice', 3);
    // Distant glacial creak + sharp brittle crystalline snap
    this._osc(180 + v * 45, 78, 0.26, 'sine', 0.032, 0, 0.55, 0.015, pan);
    this._filteredNoise({
      dur: 0.06, vol: 0.045, delay: 0.04, pink: false,
      filterType: 'bandpass', freqStart: 2400 + v * 650, freqEnd: 1100, q: 4.5, attack: 0.002, wet: 0.52, pan,
    });
    this._osc(1950 + v * 320, 1420, 0.09, 'sine', 0.016, 0.05, 0.55, 0.003, pan);
  }

  playAuroraShimmer(pan = 0) {
    const notes = [880, 1108.7, 1318.5, 1760];
    const f = notes[this._pickVariant('aurora', notes.length)];
    this._acousticNote(f, 0.85, 0.014, 0, 'bell', pan);
  }

  playLavaPop(pan = 0) {
    if (this._playSample('amb_lava', 0.42, 0.09, 1.0, 0.4, pan)) return;
    // Deep magma bubble bloop + brief steam vent hiss
    this._bubble(155 + Math.random() * 90, 0.095, 0.045, 0, pan);
    this._filteredNoise({
      dur: 0.22, vol: 0.038, delay: 0.05, pink: true,
      filterType: 'bandpass', freqStart: 1850, freqEnd: 920, q: 1.8, attack: 0.02, wet: 0.35, pan,
    });
  }

  playCrystalHum(pan = 0) {
    if (this._playSample('amb_crystal', 0.35, 0.05, 1.0, 0.6, pan)) return;
    const scale = [523.3, 659.3, 784.0, 987.8, 1318.5];
    const f = scale[this._pickVariant('cryst', scale.length)];
    this._acousticNote(f, 0.9, 0.016, 0, 'bell', pan);
  }

  playWaterBubble(pan = 0) {
    const now = performance.now();
    if (now - this.lastBubblePop < 950) return;
    this.lastBubblePop = now;
    this._bubble(520 + Math.random() * 480, 0.036, 0.018, 0, pan);
  }

  playPierCreak() {
    const now = performance.now();
    if (now - this.lastPierCreak < 1100) return;
    this.lastPierCreak = now;
    if (this._playSample('pier_creak', 0.55, 0.08, 1.0, 0.16, -0.55)) return;
    const v = this._pickVariant('creak', 3);
    if (this.env.dockStyle === 'wood' || this.env.dockStyle === 'bamboo') {
      // Soft timber groan under angler's boots
      const f = 145 + v * 32;
      this._osc(f, f * 0.86, 0.14, 'triangle', 0.038, 0, 0.18, 0.025, -0.55);
      this._filteredNoise({
        dur: 0.11, vol: 0.04, pink: true,
        filterType: 'bandpass', freqStart: 420 + v * 90, freqEnd: 290, q: 5.0, attack: 0.02, wet: 0.14, pan: -0.55,
      });
    } else {
      this._materialTap(340 + v * 45, 0.045, 0, null, -0.55);
    }
  }

  playSeabedTap(pan = 0) {
    const now = performance.now();
    if (now - this.lastSeabedTap < 1400) return;
    this.lastSeabedTap = now;
    if (this._playSample('seabed_tap', 0.5, 0.07, 1.0, 0.3, pan)) return;
    const m = this.env.mapId;
    if (m === 'fjord') {
      this._materialTap(680, 0.042, 0, 'frost', pan);
    } else if (m === 'abyss') {
      this._materialTap(240, 0.055, 0, 'basalt', pan);
      this._bubble(260, 0.05, 0.028, 0.03, pan);
    } else if (m === 'sanctuary') {
      this._materialTap(540, 0.048, 0, 'marble', pan);
      this._acousticNote(1046.5, 0.18, 0.018, 0.02, 'bell', pan);
    } else {
      // Soft muffled sandy seabed thud + tiny sediment bubble
      this._osc(118, 68, 0.07, 'sine', 0.048, 0, 0.26, 0.005, pan);
      this._bubble(380, 0.045, 0.026, 0.025, pan);
    }
  }

  // ── UI & Menu Foley (4 Biome-Matched Variations!) ─────────────────────────
  playUiHover() {
    const now = performance.now();
    if (now - this.lastHoverTick < 70) return;
    this.lastHoverTick = now;
    this._materialTap(780, 0.024);
  }

  playUiClick() {
    if (this._playSample('ui_click', 0.65, 0.07)) return;
    const pitches = [620, 685, 580, 720];
    this._materialTap(pitches[this._pickVariant('uiclick', 4)], 0.082);
  }

  playUiTab() {
    if (this._playSample('ui_tab', 0.65, 0.06)) return;
    const v = this._pickVariant('uitab', 3);
    this._materialTap(540 + v * 55, 0.072, 0);
    this._metalClick(3050 + v * 280, 0.030, 0.018, 0.012);
  }

  playUiOpen() {
    if (this._playSample('ui_open', 0.72, 0.04)) return;
    this._materialTap(460, 0.078, 0);
    this._acousticNote(523.3, 0.16, 0.048, 0.02, 'marimba');
    this._acousticNote(659.3, 0.20, 0.048, 0.06, 'marimba');
  }

  playUiClose() {
    if (this._playSample('ui_close', 0.68, 0.04)) return;
    this._materialTap(420, 0.072, 0);
    this._acousticNote(493.9, 0.13, 0.040, 0.015, 'marimba');
    this._acousticNote(392.0, 0.16, 0.036, 0.055, 'marimba');
  }

  playUiError() {
    if (this._playSample('ui_error', 0.72)) return;
    this._materialTap(210, 0.105, 0, 'wood');
    this._materialTap(165, 0.105, 0.09, 'wood');
  }

  playToggle(on = true) {
    if (this._playSample(on ? 'toggle_on' : 'toggle_off', 0.7)) return;
    if (on) {
      this._metalClick(2450, 0.055, 0, 0.014);
      this._materialTap(740, 0.068, 0.018);
    } else {
      this._metalClick(1820, 0.05, 0, 0.014);
      this._materialTap(465, 0.068, 0.018);
    }
  }

  playSliderTick(frac = 0.5) {
    const now = performance.now();
    if (now - this.lastSliderTick < 52) return;
    this.lastSliderTick = now;
    this._materialTap(420 + frac * 440, 0.042);
  }

  // ── Multi-Variant Casting, Lure & Water Foley ─────────────────────────────
  playCastStart() {
    if (this._playSample('cast_start', 0.7, 0.06, 1.0, 0.15, -0.5)) return;
    const v = this._pickVariant('caststart', 3);
    this._metalClick(3250 + v * 280, 0.074, 0, 0.016, -0.52);
    this._materialTap(310 + v * 28, 0.062, 0.012, null, -0.52);
  }

  playCastCharge(power = 0.5) {
    const now = performance.now();
    if (now - this.lastChargeTick < 105) return;
    this.lastChargeTick = now;
    const v = this._pickVariant('charge', 3);
    this._filteredNoise({
      dur: 0.045, vol: 0.042 + power * 0.032, pink: true,
      filterType: 'bandpass', freqStart: 300 + power * 520 + v * 45, freqEnd: 460 + power * 640, q: 4.5, attack: 0.008, wet: 0.08, pan: -0.5,
    });
  }

  playCast(power = 0.6, pan = -0.35) {
    if (this._playSample('cast', 0.85, 0.06, 0.90 + power * 0.20, 0.2, pan)) return;
    const p = Math.max(0.12, Math.min(1, power));
    const v = this._pickVariant('cast', 4);
    const freqShift = [0.92, 1.0, 1.11, 1.04][v];

    // Bail release click
    this._metalClick(3850 * freqShift, 0.055, 0, 0.012, pan);
    // Carbon rod whip (4 distinct wind shapes!)
    const whipDur = (0.14 + p * 0.09) * (v === 2 ? 0.88 : 1.0);
    this._filteredNoise({
      dur: whipDur, vol: 0.19 + p * 0.12, delay: 0.005, pink: true,
      filterType: 'bandpass', freqStart: 320 * freqShift, freqEnd: (1820 + p * 1260) * freqShift, q: 2.3 + v * 0.25, attack: 0.022, wet: 0.22, pan,
    });
    this._filteredNoise({
      dur: whipDur * 0.84, vol: 0.12 + p * 0.07, delay: whipDur * 0.44, pink: false,
      filterType: 'bandpass', freqStart: (1860 + p * 820) * freqShift, freqEnd: 440 * freqShift, q: 1.9, attack: 0.01, wet: 0.20, pan: pan * 0.5,
    });
    // Monofilament spool zip
    const ticks = Math.round(3 + p * 4);
    for (let i = 0; i < ticks; i++) {
      this._metalClick((4300 - i * 250) * freqShift, 0.022 * (1 - i / (ticks + 1)), 0.058 + i * 0.023, 0.009, pan);
    }
    if (p > 0.72) this.playPierCreak();
  }

  playSplash(big = false, pan = 0.2) {
    if (this._playSample(big ? 'splash_big' : 'splash_small', big ? 0.92 : 0.78, 0.07, 1.0, 0.28, pan)) return;
    const v = this._pickVariant(big ? 'splashB' : 'splashS', 5);
    const toneScale = [0.88, 0.96, 1.04, 1.12, 1.0][v];

    // 1) Hydrodynamic plunge impact
    this._osc((big ? 132 : 210) * toneScale, (big ? 42 : 76) * toneScale, big ? 0.17 : 0.095, 'sine', big ? 0.20 : 0.12, 0, 0.25, 0.004, pan);
    // 2) Dual turbulent water spray bands
    this._filteredNoise({
      dur: big ? 0.42 : 0.22, vol: big ? 0.27 : 0.18, delay: 0.005, pink: true,
      filterType: 'lowpass', freqStart: (big ? 1600 : 2050) * toneScale, freqEnd: (big ? 310 : 470) * toneScale, q: 1.0 + v * 0.12, attack: 0.012, wet: 0.35, pan,
    });
    this._filteredNoise({
      dur: big ? 0.30 : 0.16, vol: big ? 0.16 : 0.10, delay: 0.018, pink: false,
      filterType: 'bandpass', freqStart: (2150 + v * 160), freqEnd: (740 + v * 60), q: 0.9, attack: 0.014, wet: 0.32, pan,
    });
    // 3) Stochastic Minnaert bubble cluster
    const bubbleCount = (big ? 8 : 4) + (v % 3);
    for (let i = 0; i < bubbleCount; i++) {
      const d = (big ? 0.032 : 0.022) + Math.random() * (big ? 0.29 : 0.15);
      const f = ((big ? 270 : 420) + Math.random() * 680) * toneScale;
      this._bubble(f, 0.034 + Math.random() * 0.036, (big ? 0.055 : 0.042) * (0.65 + Math.random() * 0.5), d, pan);
    }
    // 4) Subtle biome splash signature!
    if (this.env.mapId === 'abyss') {
      // Brief hot volcanic steam hiss
      this._filteredNoise({
        dur: 0.18, vol: 0.075, delay: 0.02, pink: false,
        filterType: 'highpass', freqStart: 3200, freqEnd: 2200, q: 1.2, attack: 0.015, wet: 0.22, pan,
      });
    } else if (this.env.mapId === 'fjord') {
      // Subtle icy slush tinkle
      this._osc(2600 + v * 210, 2100, 0.045, 'sine', 0.020, 0.03, 0.35, 0.002, pan);
    } else if (this.env.mapId === 'sanctuary') {
      // Faint astral shimmer drop
      this._acousticNote(1568 * toneScale, 0.24, 0.016, 0.03, 'bell', pan);
    }
  }

  playRetrieveStart() {
    if (this._playSample('retrieve_start', 0.7, 0.05, 1.0, 0.12, -0.45)) return;
    this._metalClick(2900, 0.074, 0, 0.016, -0.45);
    this._metalClick(1920, 0.050, 0.016, 0.012, -0.45);
  }

  playLineStop() {
    if (this._playSample('line_stop', 0.5, 0.06, 1.0, 0.1, -0.45)) return;
    this._metalClick(2250, 0.042, 0, 0.011, -0.45);
  }

  playRetrieveFinish(pan = -0.3) {
    if (this._playSample('retrieve_finish', 0.75, 0.06, 1.0, 0.2, pan)) return;
    this._bubble(480, 0.05, 0.07, 0, pan);
    this._bubble(760, 0.04, 0.05, 0.035, pan);
    this._filteredNoise({
      dur: 0.11, vol: 0.11, delay: 0.01, pink: true,
      filterType: 'bandpass', freqStart: 1600, freqEnd: 700, q: 1.4, attack: 0.008, wet: 0.26, pan,
    });
  }

  playJig(pan = 0.2) {
    if (this._playSample('jig', 0.7, 0.07, 1.0, 0.22, pan)) return;
    this._bubble(520, 0.048, 0.055, 0, pan);
    this._filteredNoise({
      dur: 0.08, vol: 0.07, delay: 0.005, pink: true,
      filterType: 'bandpass', freqStart: 1100, freqEnd: 520, q: 1.8, attack: 0.008, wet: 0.25, pan,
    });
  }

  // ── Multi-Variant Fish AI, Bite & Reeling Foley ───────────────────────────
  playFishCurious(pan = 0.2) {
    const now = performance.now();
    if (now - this.lastCuriousBlip < 750) return;
    this.lastCuriousBlip = now;
    if (this._playSample('fish_curious', 0.55, 0.08, 1.0, 0.28, pan)) return;
    const v = this._pickVariant('curious', 3);
    this._filteredNoise({
      dur: 0.10, vol: 0.055, pink: true,
      filterType: 'lowpass', freqStart: 390 + v * 65, freqEnd: 170, q: 1.2, attack: 0.025, wet: 0.30, pan,
    });
    this._bubble(520 + v * 95, 0.042, 0.036, 0.045, pan);
  }

  playNibble(pan = 0.2) {
    if (this._playSample('nibble', 0.8, 0.07, 1.0, 0.25, pan)) return;
    const v = this._pickVariant('nibble', 4);
    // 4 distinct nibble styles: single knock, double bob, deep tug, quick triple micro-pecks
    if (v === 0) {
      this._osc(265, 145, 0.065, 'sine', 0.10, 0, 0.24, 0.004, pan);
      this._bubble(380, 0.05, 0.075, 0.015, pan);
      this._bubble(590, 0.04, 0.052, 0.07, pan);
    } else if (v === 1) {
      this._osc(290, 170, 0.05, 'sine', 0.09, 0, 0.22, 0.003, pan);
      this._osc(240, 130, 0.06, 'sine', 0.095, 0.08, 0.22, 0.003, pan);
      this._bubble(460, 0.045, 0.068, 0.02, pan);
      this._bubble(640, 0.04, 0.055, 0.10, pan);
    } else if (v === 2) {
      this._osc(195, 108, 0.085, 'sine', 0.11, 0, 0.26, 0.005, pan);
      this._bubble(310, 0.06, 0.072, 0.02, pan);
      this._bubble(490, 0.045, 0.048, 0.085, pan);
    } else {
      for (let i = 0; i < 3; i++) {
        this._bubble(480 + i * 130, 0.036, 0.055, i * 0.045, pan);
      }
    }
    this._filteredNoise({
      dur: 0.09, vol: 0.075, delay: 0.01, pink: true,
      filterType: 'bandpass', freqStart: 950, freqEnd: 460, q: 1.5, attack: 0.008, wet: 0.25, pan,
    });
  }

  playBite(rarity = 'common', pan = 0.2) {
    const isRare = rarity === 'rare' || rarity === 'epic';
    const isTop = rarity === 'legendary' || rarity === 'myth';
    if (this._playSample(isTop ? 'bite_big' : 'bite', 0.92, 0.05, 1.0, 0.25, pan)) return;
    const v = this._pickVariant('bite', 3);
    const shift = [0.97, 1.0, 1.04][v];

    this.playSplash(true, pan);
    this._osc(190 * shift, 88 * shift, 0.11, 'sine', 0.14, 0, 0.20, 0.003, pan);
    // Authentic pier rod-tip brass strike bell!
    this._acousticNote(1174.7 * shift, 0.24, 0.095, 0.01, 'bell', -0.3);
    this._acousticNote(1568.0 * shift, 0.28, 0.085, 0.075, 'bell', -0.3);
    if (isRare || isTop) {
      this._acousticNote(2093.0 * shift, 0.34, 0.075, 0.13, 'bell', -0.2);
    }
    if (isTop) {
      this._acousticNote(2637.0 * shift, 0.45, 0.068, 0.18, 'bell', 0);
      this._osc(98, 65, 0.28, 'sine', 0.14, 0.02, 0.36, 0.01, pan);
    }
  }

  playHookSet(pan = -0.2) {
    if (this._playSample('hook_set', 0.88, 0.05, 1.0, 0.2, pan)) return;
    const v = this._pickVariant('hookset', 3);
    this._filteredNoise({
      dur: 0.13, vol: 0.22, pink: true,
      filterType: 'bandpass', freqStart: 460 + v * 60, freqEnd: 2150 + v * 180, q: 2.2, attack: 0.012, wet: 0.22, pan,
    });
    this._osc(215 + v * 20, 520 + v * 35, 0.085, 'triangle', 0.09, 0.01, 0.18, 0.004, pan);
    this._metalClick(3050 + v * 220, 0.085, 0.02, 0.018, -0.45);
    this._bubble(420 + v * 65, 0.05, 0.06, 0.04, pan * -1);
    this.playPierCreak();
  }

  playSweetSpotEnter() {
    if (this._playSample('sweet_enter', 0.55)) return;
    // Crisp gentle confirmation pulse when tension locks smoothly inside the Sweet Spot
    this._acousticNote(784.0, 0.15, 0.036, 0, 'harp', 0);
    this._acousticNote(1046.5, 0.18, 0.032, 0.04, 'bell', 0);
  }

  playFishWarning(pan = 0.2) {
    if (this._playSample('fish_warning', 0.8, 0.05, 1.0, 0.22, pan)) return;
    const v = this._pickVariant('warn', 3);
    this._filteredNoise({
      dur: 0.16, vol: 0.12, pink: true,
      filterType: 'lowpass', freqStart: 520 + v * 60, freqEnd: 250, q: 1.8, attack: 0.02, wet: 0.28, pan,
    });
    this._metalClick(3350 + v * 190, 0.08, 0.01, 0.016, -0.4);
    this._metalClick(3850 + v * 190, 0.085, 0.075, 0.016, -0.4);
  }

  playFishThrash(pan = 0.2, strength = 1.0) {
    if (this._playSample('fish_thrash', 0.9, 0.07, 1.0, 0.3, pan)) return;
    const v = this._pickVariant('thrash', 4);
    const heavy = Math.max(0.7, Math.min(1.45, 0.75 + strength * 0.28));

    // 4 distinct fight bursts (tail slap, surface boil, deep lunge, rolling splash)
    if (v === 2) {
      // Deep powerful lunge underwater
      this._osc(115, 44, 0.22, 'sine', 0.22 * heavy, 0, 0.30, 0.004, pan);
      this._filteredNoise({
        dur: 0.30, vol: 0.22, delay: 0.01, pink: true,
        filterType: 'lowpass', freqStart: 880, freqEnd: 240, q: 1.5, attack: 0.012, wet: 0.34, pan,
      });
    } else {
      // Heavy surface tail-slap & foaming splash
      this._osc(145 - v * 10, 52, 0.14, 'sine', 0.18 * heavy, 0, 0.24, 0.003, pan);
      this._filteredNoise({
        dur: 0.34, vol: 0.26, delay: 0.008, pink: true,
        filterType: 'bandpass', freqStart: 1300 + v * 140, freqEnd: 460, q: 1.0, attack: 0.01, wet: 0.34, pan,
      });
      this._filteredNoise({
        dur: 0.22, vol: 0.17, delay: 0.085, pink: false,
        filterType: 'bandpass', freqStart: 2200 + v * 180, freqEnd: 880, q: 1.2, attack: 0.012, wet: 0.30, pan,
      });
    }
    const bubbles = 5 + (v % 3);
    for (let i = 0; i < bubbles; i++) {
      this._bubble(300 + Math.random() * 580, 0.04, 0.052, 0.025 + i * 0.036, pan);
    }
    if (heavy > 1.05) this.playPierCreak();
  }

  playFishCalm(pan = 0.2) {
    if (this._playSample('fish_calm', 0.65, 0.06, 1.0, 0.26, pan)) return;
    this._filteredNoise({
      dur: 0.16, vol: 0.07, pink: true,
      filterType: 'lowpass', freqStart: 620, freqEnd: 240, q: 1.0, attack: 0.02, wet: 0.30, pan,
    });
    this._bubble(460, 0.045, 0.038, 0.03, pan);
  }

  playReelTick(tension = 0.3, inSweetSpot = false) {
    const now = performance.now();
    const minGap = inSweetSpot ? 62 : 76;
    if (now - this.lastReelTick < minGap) return;
    this.lastReelTick = now;
    if (this._playSample('reel_tick', 0.45, 0.06, 0.92 + tension * 0.32, 0.08, -0.45)) return;

    // 4 alternating mechanical gear-tooth pawl variations (organic real reel cadence!)
    const v = this._pickVariant('reel', 4);
    const toothJitter = [0.95, 1.02, 0.98, 1.06][v];
    const pawlPitch = (2120 + tension * 1350) * toothJitter;
    this._metalClick(pawlPitch, 0.060 + tension * 0.022, 0, 0.013, -0.45);
    this._materialTap((380 + tension * 175) * toothJitter, 0.028, 0.002, 'wood', -0.45);

    if (inSweetSpot && now - this.lastSweetTick > 210) {
      this.lastSweetTick = now;
      this._osc(784 + tension * 140, 880 + tension * 140, 0.08, 'sine', 0.024, 0.008, 0.34, 0.005, -0.2);
    }
  }

  playDragOut(tension = 0.4) {
    const now = performance.now();
    if (now - this.lastDragTick < 102) return;
    this.lastDragTick = now;
    if (this._playSample('drag_out', 0.55, 0.05, 0.95 + tension * 0.25, 0.1, -0.42)) return;
    const v = this._pickVariant('drag', 3);
    const base = (3250 + tension * 1150) * [0.96, 1.0, 1.05][v];
    this._metalClick(base, 0.052, 0, 0.011, -0.42);
    this._metalClick(base * 1.06, 0.046, 0.034, 0.011, -0.42);
  }

  playTensionWarn() {
    const now = performance.now();
    if (now - this.lastWarnTick < 180) return;
    this.lastWarnTick = now;
    if (this._playSample('tension_warn', 0.72, 0.05, 1.0, 0.12, -0.35)) return;
    const v = this._pickVariant('twarn', 3);
    const f = 600 + v * 55;
    this._osc(f, f * 1.12, 0.09, 'triangle', 0.055, 0, 0.14, 0.01, -0.35);
    this._filteredNoise({
      dur: 0.085, vol: 0.075, pink: true,
      filterType: 'bandpass', freqStart: 1220 + v * 140, freqEnd: 1680 + v * 120, q: 5.5, attack: 0.008, wet: 0.10, pan: -0.35,
    });
  }

  playSnap(pan = 0) {
    if (this._playSample('line_snap', 0.92, 0.05, 1.0, 0.22, pan)) return;
    this._filteredNoise({
      dur: 0.045, vol: 0.34, pink: false,
      filterType: 'highpass', freqStart: 2800, freqEnd: 1400, q: 1.5, attack: 0.001, wet: 0.24, pan,
    });
    this._osc(880, 175, 0.16, 'triangle', 0.14, 0.005, 0.22, 0.002, pan);
    this._osc(420, 92, 0.24, 'sine', 0.12, 0.02, 0.24, 0.004, pan);
    this.playSplash(false, pan);
  }

  playEscape(pan = 0.2) {
    if (this._playSample('fish_escape', 0.85, 0.05, 1.0, 0.26, pan)) return;
    this.playSplash(false, pan);
    this._osc(180, 82, 0.18, 'sine', 0.11, 0.04, 0.28, 0.008, pan);
    this._bubble(440, 0.05, 0.05, 0.08, pan);
    this._bubble(320, 0.06, 0.045, 0.15, pan);
  }

  playLandingLift(pan = -0.25) {
    if (this._playSample('landing_lift', 0.9, 0.05, 1.0, 0.26, pan)) return;
    this.playSplash(true, pan);
    this._filteredNoise({
      dur: 0.24, vol: 0.18, delay: 0.04, pink: true,
      filterType: 'bandpass', freqStart: 900, freqEnd: 2400, q: 1.6, attack: 0.02, wet: 0.30, pan,
    });
    this._materialTap(240, 0.11, 0.22, null, -0.45);
    this._acousticNote(523.3, 0.22, 0.065, 0.09, 'harp', -0.2);
    this._acousticNote(784.0, 0.26, 0.065, 0.17, 'harp', -0.2);
  }

  // ── Predator Ambush & World Events ────────────────────────────────────────
  playAmbushAlert(pan = 0.25) {
    if (this._playSample('ambush_alert', 0.9, 0.05, 1.0, 0.32, pan)) return;
    this._osc(78, 52, 0.26, 'sine', 0.19, 0, 0.34, 0.018, pan);
    this._osc(116.5, 98, 0.22, 'triangle', 0.11, 0.02, 0.30, 0.015, pan);
    this._filteredNoise({
      dur: 0.28, vol: 0.17, pink: true,
      filterType: 'lowpass', freqStart: 620, freqEnd: 190, q: 1.8, attack: 0.025, wet: 0.32, pan,
    });
    this._bubble(260, 0.06, 0.065, 0.05, pan);
    this._bubble(340, 0.05, 0.055, 0.12, pan);
  }

  playChomp(chain = 1, pan = 0.25) {
    if (this._playSample('predator_chomp', 0.95, 0.05, 1.0, 0.28, pan)) return;
    const pitchBoost = 1 + Math.min(2, Math.max(0, chain - 1)) * 0.12;
    this._osc(96, 34, 0.24, 'sine', 0.26, 0, 0.30, 0.003, pan);
    this._filteredNoise({
      dur: 0.11, vol: 0.32, pink: false,
      filterType: 'bandpass', freqStart: 1450, freqEnd: 420, q: 2.0, attack: 0.002, wet: 0.22, pan,
    });
    this._materialTap(185, 0.18, 0.005, 'basalt', pan);
    this.playSplash(true, pan);
    this._acousticNote(329.6 * pitchBoost, 0.28, 0.08, 0.09, 'brass', pan);
    this._acousticNote(493.9 * pitchBoost, 0.36, 0.085, 0.16, 'brass', pan);
    if (chain >= 2) {
      this._acousticNote(659.3 * pitchBoost, 0.42, 0.075, 0.23, 'bell', pan);
    }
  }

  playMythSpawn(pan = 0.3) {
    if (this._playSample('myth_spawn', 0.95, 0.03, 1.0, 0.48, pan)) return;
    this._osc(65.4, 58.3, 0.95, 'sine', 0.18, 0, 0.55, 0.08, pan);
    this._osc(130.8, 123.5, 0.78, 'triangle', 0.09, 0.05, 0.50, 0.07, pan);
    this._filteredNoise({
      dur: 0.65, vol: 0.12, delay: 0.04, pink: true,
      filterType: 'lowpass', freqStart: 380, freqEnd: 140, q: 2.2, attack: 0.10, wet: 0.45, pan,
    });
    [523.3, 784.0, 987.8, 1568.0].forEach((f, i) => {
      this._acousticNote(f, 0.58, 0.055, 0.12 + i * 0.09, 'bell', pan);
    });
  }

  playShootingStar(pan = 0.2) {
    const now = performance.now();
    if (now - this.lastStarChime < 3200) return;
    this.lastStarChime = now;
    if (this._playSample('shooting_star', 0.42, 0.06, 1.0, 0.48, pan)) return;
    const v = this._pickVariant('star', 3);
    const notes = [[1568, 2093], [1760, 2349], [1318.5, 1975.5]][v];
    this._acousticNote(notes[0], 0.34, 0.022, 0, 'bell', pan);
    this._acousticNote(notes[1], 0.40, 0.018, 0.07, 'bell', pan - 0.15);
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
    const v = this._pickVariant('catch_std', 2);
    const notes = (rarity === 'epic' || rarity === 'rare')
      ? [440.0, 554.4, 659.3, 880.0, 1108.7]
      : (v === 0 ? [392.0, 493.9, 587.3, 784.0] : [440.0, 523.3, 659.3, 880.0]);
    notes.forEach((f, i) => {
      this._acousticNote(f, i === notes.length - 1 ? 0.54 : 0.24, 0.082, i * 0.072, 'harp');
    });
  }

  playNewSpecies() {
    if (this._playSample('new_species', 0.8)) return;
    this._materialTap(360, 0.09, 0.34, 'wood');
    [880.0, 1174.7, 1396.9, 1760.0].forEach((f, i) => {
      this._acousticNote(f, 0.32, 0.048, 0.38 + i * 0.068, 'bell');
    });
  }

  playNewRecord() {
    if (this._playSample('new_record', 0.8)) return;
    this._materialTap(420, 0.08, 0.34, 'wood');
    this._acousticNote(987.8, 0.24, 0.055, 0.38, 'bell');
    this._acousticNote(1318.5, 0.36, 0.06, 0.46, 'bell');
  }

  playCoinJingle(big = false) {
    if (this._playSample(big ? 'coins_big' : 'coins', 0.8, 0.05)) return;
    const v = this._pickVariant('coin', 3);
    const shift = [0.96, 1.0, 1.06][v];
    this._coinClink(2420 * shift, 0.07, 0);
    this._coinClink(2860 * shift, 0.065, 0.058 + v * 0.008);
    if (big) {
      this._coinClink(3240 * shift, 0.06, 0.118);
      this._coinClink(2680 * shift, 0.055, 0.175);
      this._coinClink(3520 * shift, 0.05, 0.225);
    }
  }

  playBuy() {
    if (this._playSample('shop_buy', 0.82, 0.05)) return;
    this._coinClink(2480, 0.075, 0);
    this._coinClink(3120, 0.07, 0.068);
    this._materialTap(580, 0.07, 0.02);
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
    this._filteredNoise({
      dur: 0.48, vol: 0.12, pink: true,
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
    this._materialTap(420, 0.10, 0, 'wood');
    this._osc(310, 110, 0.28, 'triangle', 0.09, 0.04, 0.26, 0.01);
  }

  playMiss() {
    if (this._playSample('miss', 0.75)) return;
    this._materialTap(280, 0.09, 0, 'wood');
    this._osc(240, 140, 0.16, 'sine', 0.075, 0.02, 0.22, 0.008);
  }
}

export const sound = new SoundEngine();
