import { FISH_SPECIES, RARITY_META, UPGRADES } from './fishData.js';
import { buildSpriteCache, spriteToDataURL } from './sprites.js';
import { sound } from './audio.js';
import { renderGameWorld } from './renderer.js';

const SAVE_KEY = 'pierline_save_v1';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (lo, hi) => lo + Math.random() * (hi - lo);

class PierlineGame {
  constructor() {
    this.canvas = document.getElementById('game-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.sprites = buildSpriteCache();

    // Virtual pixel dimensions
    this.vw = 320;
    this.vh = 200;
    this.isPortrait = false;
    this.waterY = 80;
    this.pierEndX = 72;
    this.pierY = 68;
    this.anglerX = 52;
    this.anglerY = 47;

    // Persistent progress
    this.save = this.loadSave();
    sound.setMuted(this.save.muted);

    // Environment & FX
    this.time = 0;
    this.timeOfDay = 0.27;
    this.stars = [];
    this.clouds = [];
    this.birds = [];
    this.kelp = [];
    this.pebbles = [];
    this.bubbles = [];
    this.particles = [];
    this.ripples = [];
    this.floats = [];
    this.shakeTime = 0;
    this.shakeMag = 0;

    // State machine: IDLE | CHARGING | CASTING | WAITING | BITE | REELING | LANDING | CAUGHT
    this.state = 'IDLE';
    this.stateTimer = 0;
    this.pointerHeld = false;
    this.holdDuration = 0;
    this.activePointerId = null;

    // Cast & line state
    this.chargePower = 0.2;
    this.chargeDir = 1;
    this.castStartX = 0;
    this.castStartY = 0;
    this.castTargetX = 0;
    this.castFlightT = 0;
    this.castFlightDur = 0.45;
    this.bobberX = 0;
    this.bobberY = 0;
    this.bobberDip = 0;
    this.hookX = 0;
    this.hookY = 0;
    this.hookDepth = 0;
    this.targetHookDepth = 0;
    this.jigBoost = 0;
    this.rodBend = 0;

    // Fish & reeling state
    this.fishes = [];
    this.hookedFish = null;
    this.biteTimer = 0;
    this.reelProgress = 0.35;
    this.tension = 0.15;
    this.snapGrace = 0;
    this.fishThrashing = false;
    this.thrashTimer = 1.2;
    this.landStartX = 0;
    this.landStartY = 0;
    this.landT = 0;
    this.lastCatchInfo = null;

    // UI references
    this.ui = {
      coins: document.getElementById('hud-coins'),
      catches: document.getElementById('hud-catches'),
      depthBadge: document.getElementById('hud-depth'),
      actionBtn: document.getElementById('action-btn'),
      actionLabel: document.getElementById('action-label'),
      actionSub: document.getElementById('action-sub'),
      reelHud: document.getElementById('reel-hud'),
      reelStatus: document.getElementById('reel-status'),
      tensionFill: document.getElementById('tension-fill'),
      progressFill: document.getElementById('progress-fill'),
      progressIcon: document.getElementById('progress-icon'),
      btnShop: document.getElementById('btn-shop'),
      btnLog: document.getElementById('btn-log'),
      btnMute: document.getElementById('btn-mute'),
      shopModal: document.getElementById('shop-modal'),
      shopList: document.getElementById('shop-list'),
      shopCoins: document.getElementById('shop-coins'),
      logModal: document.getElementById('log-modal'),
      logGrid: document.getElementById('log-grid'),
      logSummary: document.getElementById('log-summary'),
      catchOverlay: document.getElementById('catch-overlay'),
      catchImg: document.getElementById('catch-img'),
      catchName: document.getElementById('catch-name'),
      catchRarity: document.getElementById('catch-rarity'),
      catchStamp: document.getElementById('catch-stamp'),
      catchWeight: document.getElementById('catch-weight'),
      catchValue: document.getElementById('catch-value'),
      catchDesc: document.getElementById('catch-desc'),
      catchContinue: document.getElementById('catch-continue'),
      hintBanner: document.getElementById('hint-banner'),
    };

    this.resize();
    this.initEnvironment();
    this.spawnInitialFishes();
    this.bindEvents();
    this.updateHUD();
    this.updateActionUI();

    this.lastTs = performance.now();
    requestAnimationFrame((ts) => this.loop(ts));
  }

  defaultSave() {
    return {
      coins: 0,
      totalCatches: 0,
      upgrades: { rod: 1, line: 1, lure: 1, charm: 1 },
      log: {},
      muted: false,
    };
  }

  loadSave() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return this.defaultSave();
      const parsed = JSON.parse(raw);
      return {
        ...this.defaultSave(),
        ...parsed,
        upgrades: { ...this.defaultSave().upgrades, ...(parsed.upgrades || {}) },
        log: parsed.log || {},
      };
    } catch (_) {
      return this.defaultSave();
    }
  }

  persist() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(this.save));
    } catch (_) {
      // Ignore storage errors
    }
  }

  getStats() {
    const u = this.save.upgrades;
    return {
      maxCastFrac: 0.56 + (u.rod - 1) * 0.095,
      reelPower: 0.34 + (u.rod - 1) * 0.065,
      maxSinkFrac: 0.44 + (u.line - 1) * 0.125,
      tensionResist: 1.0 - (u.line - 1) * 0.10,
      attractRadius: 28 + (u.lure - 1) * 7,
      luckBonus: (u.lure - 1) * 0.28,
      coinMult: 1 + (u.charm - 1) * 0.25,
      biteWindow: 1.38 + (u.charm - 1) * 0.14,
    };
  }

  resize() {
    const sw = window.innerWidth;
    const sh = window.innerHeight;
    const aspect = sw / Math.max(1, sh);
    this.isPortrait = aspect < 0.92;

    if (this.isPortrait) {
      this.vw = 192;
      this.vh = clamp(Math.round(this.vw / aspect), 256, 400);
    } else {
      this.vh = 216;
      this.vw = clamp(Math.round(this.vh * aspect), 264, 440);
    }

    this.canvas.width = this.vw;
    this.canvas.height = this.vh;
    this.ctx.imageSmoothingEnabled = false;

    this.waterY = Math.round(this.vh * (this.isPortrait ? 0.33 : 0.40));
    this.pierEndX = this.isPortrait ? 56 : Math.round(clamp(this.vw * 0.22, 66, 92));
    this.pierY = this.waterY - 12;
    this.anglerX = this.pierEndX - 18;
    this.anglerY = this.pierY - 21;

    this.rebuildSeabedDecor();
  }

  getSeabedY(x) {
    const waterSpan = Math.max(1, this.vw - this.pierEndX);
    const t = clamp((x - this.pierEndX + 10) / waterSpan, 0, 1);
    const shallowEdge = this.vh - (this.isPortrait ? 62 : 28);
    const deepFloor = this.vh - (this.isPortrait ? 44 : 14);
    const base = lerp(shallowEdge, deepFloor, Math.pow(t, 0.75));
    const wave = Math.sin(x * 0.065) * 2.5 + Math.cos(x * 0.14) * 1.4;
    return Math.round(clamp(base + wave, this.waterY + 34, this.vh - 10));
  }

  getWaterDepthAt(x) {
    return Math.max(30, this.getSeabedY(x) - this.waterY);
  }

  initEnvironment() {
    this.stars = [];
    for (let i = 0; i < 42; i++) {
      this.stars.push({
        x: Math.random(),
        y: Math.random() * 0.85,
        phase: Math.random() * Math.PI * 2,
        bright: Math.random() > 0.65,
      });
    }

    this.clouds = [
      { x: 24, y: 14, speed: 2.2, sprite: 'cloud0' },
      { x: 118, y: 24, speed: 1.5, sprite: 'cloud1' },
      { x: 225, y: 12, speed: 2.6, sprite: 'cloud0' },
      { x: 310, y: 28, speed: 1.8, sprite: 'cloud1' },
    ];

    this.birds = [
      { x: 70, y: 26, speed: 14, phase: 0 },
      { x: 185, y: 18, speed: 11, phase: 2.1 },
    ];

    this.rebuildSeabedDecor();
  }

  rebuildSeabedDecor() {
    this.kelp = [];
    const count = Math.floor(this.vw / 18);
    for (let i = 0; i < count; i++) {
      const x = Math.round(14 + i * 18 + (i % 3) * 4);
      if (x > this.vw - 8) continue;
      this.kelp.push({
        x,
        height: 10 + ((i * 7) % 16),
        phase: i * 1.3,
        color: i % 2 === 0 ? '#1b6b59' : '#248269',
      });
    }

    this.pebbles = [];
    for (let i = 0; i < Math.floor(this.vw / 9); i++) {
      const x = Math.round(6 + i * 9 + ((i * 13) % 5));
      this.pebbles.push({
        x,
        dy: (i % 3) + 2,
        w: 2 + (i % 3),
        color: i % 4 === 0 ? '#d99b66' : i % 3 === 0 ? '#5c6b7a' : '#857863',
      });
    }
  }

  pickSpeciesForDepth(normDepth) {
    const luck = this.getStats().luckBonus;
    const candidates = FISH_SPECIES.filter(
      (sp) => normDepth >= sp.minDepth - 0.06 && normDepth <= sp.maxDepth + 0.06
    );
    const pool = candidates.length ? candidates : FISH_SPECIES;
    let total = 0;
    const weights = pool.map((sp) => {
      const base = RARITY_META[sp.rarity].weight;
      const mult = sp.rarity === 'common' ? 1 : 1 + luck * (sp.rarity === 'legendary' ? 2.2 : 1.3);
      const w = base * mult;
      total += w;
      return w;
    });
    let r = Math.random() * total;
    for (let i = 0; i < pool.length; i++) {
      r -= weights[i];
      if (r <= 0) return pool[i];
    }
    return pool[pool.length - 1];
  }

  spawnFish(fromEdge = false) {
    const roll = Math.random();
    let normDepth;
    if (roll < 0.36) normDepth = rand(0.10, 0.36);
    else if (roll < 0.72) normDepth = rand(0.36, 0.68);
    else normDepth = rand(0.68, 0.90);

    const species = this.pickSpeciesForDepth(normDepth);
    const actualNormDepth = clamp(normDepth, species.minDepth, species.maxDepth);
    const dir = Math.random() < 0.5 ? 1 : -1;
    const minX = this.pierEndX + 10;
    const maxX = this.vw - 12;
    const x = fromEdge ? (dir === 1 ? minX - 18 : maxX + 18) : rand(minX, maxX);
    const depthSpan = Math.max(36, this.getWaterDepthAt(clamp(x, minX, maxX)) - 12);
    const y = this.waterY + 10 + actualNormDepth * depthSpan;

    return {
      species,
      x,
      y,
      baseY: y,
      normDepth: actualNormDepth,
      dir,
      speed: species.speed * rand(0.75, 1.25),
      phase: rand(0, Math.PI * 2),
      ai: 'SWIM',
      nibbleCount: 0,
      nibbleTimer: 0,
      cooldown: 0,
    };
  }

  spawnInitialFishes() {
    this.fishes = [];
    const targetCount = this.isPortrait ? 9 : 12;
    for (let i = 0; i < targetCount; i++) {
      this.fishes.push(this.spawnFish(false));
    }
  }

  isModalOpen() {
    return (
      !this.ui.shopModal.classList.contains('hidden') ||
      !this.ui.logModal.classList.contains('hidden')
    );
  }

  bindEvents() {
    window.addEventListener('resize', () => this.resize());

    const onPressStart = (e) => {
      if (this.isModalOpen()) return;
      sound.unlock();
      if (this.state === 'CAUGHT') {
        this.dismissCatch();
        return;
      }
      if (e.pointerId !== undefined && this.activePointerId !== null && this.activePointerId !== e.pointerId) {
        return;
      }
      if (e.pointerId !== undefined) this.activePointerId = e.pointerId;
      this.handlePrimaryDown();
    };

    const onPressEnd = (e) => {
      if (e.pointerId !== undefined && this.activePointerId !== null && this.activePointerId !== e.pointerId) {
        return;
      }
      this.activePointerId = null;
      this.handlePrimaryUp();
    };

    this.canvas.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      onPressStart(e);
    });
    window.addEventListener('pointerup', onPressEnd);
    window.addEventListener('pointercancel', onPressEnd);

    this.ui.actionBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      onPressStart(e);
    });
    this.ui.actionBtn.addEventListener('pointerup', (e) => {
      e.preventDefault();
      e.stopPropagation();
      onPressEnd(e);
    });

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      if (e.code === 'Escape') {
        this.closeModals();
        return;
      }
      if (this.isModalOpen()) return;
      if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW' || e.code === 'Enter') {
        e.preventDefault();
        sound.unlock();
        if (this.state === 'CAUGHT') {
          this.dismissCatch();
          return;
        }
        this.handlePrimaryDown();
      }
    });

    window.addEventListener('keyup', (e) => {
      if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW' || e.code === 'Enter') {
        this.handlePrimaryUp();
      }
    });

    this.ui.btnShop.addEventListener('click', (e) => {
      e.stopPropagation();
      sound.unlock();
      this.openShop();
    });
    this.ui.btnLog.addEventListener('click', (e) => {
      e.stopPropagation();
      sound.unlock();
      this.openLog();
    });
    this.ui.btnMute.addEventListener('click', (e) => {
      e.stopPropagation();
      this.save.muted = !this.save.muted;
      sound.setMuted(this.save.muted);
      if (!this.save.muted) sound.unlock();
      this.persist();
      this.updateHUD();
    });

    document.querySelectorAll('[data-close-modal]').forEach((btn) => {
      btn.addEventListener('click', () => this.closeModals());
    });
    [this.ui.shopModal, this.ui.logModal].forEach((modal) => {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) this.closeModals();
      });
    });

    this.ui.catchContinue.addEventListener('click', (e) => {
      e.stopPropagation();
      this.dismissCatch();
    });
    this.ui.catchOverlay.addEventListener('click', (e) => {
      if (e.target === this.ui.catchOverlay) this.dismissCatch();
    });
  }

  handlePrimaryDown() {
    this.pointerHeld = true;
    this.holdDuration = 0;

    if (this.ui.hintBanner && !this.ui.hintBanner.classList.contains('hidden')) {
      this.ui.hintBanner.classList.add('hidden');
    }

    if (this.state === 'IDLE') {
      this.state = 'CHARGING';
      this.stateTimer = 0;
      this.chargePower = 0.18;
      this.chargeDir = 1;
      this.updateActionUI();
    } else if (this.state === 'BITE') {
      this.setHook();
    }
  }

  handlePrimaryUp() {
    if (!this.pointerHeld) return;
    const heldFor = this.holdDuration;
    this.pointerHeld = false;
    this.holdDuration = 0;

    if (this.state === 'CHARGING') {
      this.launchCast();
    } else if (this.state === 'WAITING' && heldFor < 0.24) {
      this.performJig();
    }
  }

  getAnglerPose() {
    if (this.state === 'CHARGING') return 'windup';
    if (this.state === 'CASTING') return 'cast';
    if (this.state === 'REELING') {
      if (this.pointerHeld) return Math.floor(this.time * 10) % 2 === 0 ? 'reel0' : 'reel1';
      return 'reel0';
    }
    if (this.state === 'LANDING' || this.state === 'CAUGHT') return 'celebrate';
    return Math.floor(this.time * 2.1) % 2 === 0 ? 'idle0' : 'idle1';
  }

  getRodTipPos() {
    const pose = this.getAnglerPose();
    const spr = this.sprites.angler[pose];
    const handX = this.anglerX + spr.hand[0];
    const handY = this.anglerY + spr.hand[1];

    if (this.state === 'CHARGING') {
      const pull = this.chargePower * 7;
      return {
        handX, handY,
        tipX: handX - 10 - pull,
        tipY: handY - 14 - pull * 0.4,
        ctrlX: handX - 5 - pull * 0.5,
        ctrlY: handY - 9,
      };
    }

    if (this.state === 'LANDING' || this.state === 'CAUGHT') {
      return {
        handX, handY,
        tipX: handX - 6,
        tipY: handY - 16,
        ctrlX: handX - 3,
        ctrlY: handY - 9,
      };
    }

    const bend = this.rodBend;
    return {
      handX, handY,
      tipX: handX + 18 + bend * 5,
      tipY: handY - 14 + bend * 11,
      ctrlX: handX + 12 + bend * 2,
      ctrlY: handY - 13 + bend * 1.5,
    };
  }

  launchCast() {
    const stats = this.getStats();
    const rod = this.getRodTipPos();
    const minCastX = this.pierEndX + 22;
    const maxCastX = this.pierEndX + (this.vw - this.pierEndX - 18) * stats.maxCastFrac;
    this.castStartX = rod.tipX;
    this.castStartY = rod.tipY;
    this.castTargetX = clamp(lerp(minCastX, maxCastX, this.chargePower), minCastX, this.vw - 14);
    this.castFlightT = 0;
    this.castFlightDur = lerp(0.32, 0.56, this.chargePower);
    this.bobberX = this.castStartX;
    this.bobberY = this.castStartY;

    const waterDepth = this.getWaterDepthAt(this.castTargetX);
    const sinkRatio = clamp(lerp(0.22, stats.maxSinkFrac, this.chargePower), 0.16, 0.92);
    this.targetHookDepth = clamp(sinkRatio * (waterDepth - 10), 14, waterDepth - 8);
    this.hookDepth = 2;

    this.state = 'CASTING';
    this.stateTimer = 0;
    sound.playCast();
    this.updateActionUI();
  }

  performJig() {
    this.jigBoost = 1.0;
    this.hookDepth = Math.max(10, this.hookDepth - 7);
    this.bobberDip = -2.2;
    sound.playJig();
    this.addRipple(this.bobberX, this.waterY, 6);
    for (let i = 0; i < 3; i++) {
      this.bubbles.push({
        x: this.hookX + rand(-3, 3),
        y: this.hookY + rand(-2, 2),
        vy: rand(12, 20),
        life: rand(0.6, 1.2),
      });
    }
    const radius = this.getStats().attractRadius * 1.45;
    let best = null;
    let bestDist = radius;
    for (const f of this.fishes) {
      if (f.ai !== 'SWIM' || f.cooldown > 0) continue;
      const d = Math.hypot(f.x - this.hookX, f.y - this.hookY);
      if (d < bestDist) {
        bestDist = d;
        best = f;
      }
    }
    if (best) best.ai = 'APPROACH';
  }

  setHook() {
    if (!this.hookedFish) return;
    this.state = 'REELING';
    this.stateTimer = 0;
    this.reelProgress = 0.36;
    this.tension = 0.22;
    this.snapGrace = 0;
    this.fishThrashing = true;
    this.thrashTimer = rand(0.75, 1.35);
    this.hookedFish.ai = 'HOOKED';
    this.shake(0.18, 2);
    sound.playHookSet();
    this.spawnSplash(this.bobberX, this.waterY, 10);
    this.addFloat(this.bobberX, this.waterY - 12, 'HOOKED!', '#fde047');
    this.updateActionUI();
  }

  cancelToIdle(message, color = '#f87171') {
    if (message) {
      this.addFloat(this.bobberX || this.pierEndX + 26, this.waterY - 14, message, color);
    }
    if (this.hookedFish) {
      this.hookedFish.ai = 'FLEE';
      this.hookedFish.cooldown = 4;
      this.hookedFish = null;
    }
    for (const f of this.fishes) {
      if (f.ai === 'APPROACH' || f.ai === 'NIBBLE') {
        f.ai = 'SWIM';
        f.cooldown = 2.0;
      }
    }
    this.state = 'IDLE';
    this.stateTimer = 0;
    this.rodBend = 0;
    this.updateActionUI();
  }

  completeLanding() {
    const fish = this.hookedFish;
    if (!fish) {
      this.cancelToIdle();
      return;
    }
    const sp = fish.species;
    const stats = this.getStats();
    const weight = Number(rand(sp.minWeight, sp.maxWeight).toFixed(1));
    const sizeBonus = 0.85 + 0.35 * ((weight - sp.minWeight) / Math.max(0.01, sp.maxWeight - sp.minWeight));
    const coins = Math.max(5, Math.round(sp.value * sizeBonus * stats.coinMult));

    const prev = this.save.log[sp.id];
    const isNewSpecies = !prev;
    const isNewRecord = !prev || weight > prev.bestWeight;

    this.save.coins += coins;
    this.save.totalCatches += 1;
    this.save.log[sp.id] = {
      count: (prev ? prev.count : 0) + 1,
      bestWeight: prev ? Math.max(prev.bestWeight, weight) : weight,
    };
    this.persist();

    this.fishes = this.fishes.filter((f) => f !== fish);
    this.fishes.push(this.spawnFish(true));
    this.hookedFish = null;

    this.lastCatchInfo = { species: sp, weight, coins, isNewSpecies, isNewRecord };
    this.state = 'CAUGHT';
    this.stateTimer = 0;
    this.rodBend = 0;
    sound.playCatch(sp.rarity);
    this.spawnSparkles(this.anglerX + 12, this.anglerY + 2, 16);
    this.updateHUD();
    this.showCatchCard(this.lastCatchInfo);
    this.updateActionUI();
  }

  dismissCatch() {
    if (this.state !== 'CAUGHT') return;
    this.ui.catchOverlay.classList.add('hidden');
    this.state = 'IDLE';
    this.stateTimer = 0;
    this.lastCatchInfo = null;
    this.updateActionUI();
  }

  shake(dur, mag) {
    this.shakeTime = Math.max(this.shakeTime, dur);
    this.shakeMag = Math.max(this.shakeMag, mag);
  }

  addRipple(x, y, maxR = 14) {
    this.ripples.push({ x, y, r: 2, maxR, alpha: 0.9 });
  }

  spawnSplash(x, y, count = 8) {
    this.addRipple(x, y, 10 + count);
    for (let i = 0; i < count; i++) {
      this.particles.push({
        x: x + rand(-3, 3), y,
        vx: rand(-28, 28), vy: rand(-52, -18),
        gravity: 135,
        color: i % 2 === 0 ? '#e0f7ff' : '#7dd3fc',
        life: rand(0.32, 0.6), maxLife: 0.6, size: 1,
      });
    }
  }

  spawnSparkles(x, y, count = 12) {
    for (let i = 0; i < count; i++) {
      const ang = rand(0, Math.PI * 2);
      const spd = rand(12, 42);
      this.particles.push({
        x, y,
        vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd - 12,
        gravity: 36,
        color: i % 3 === 0 ? '#fef08a' : i % 3 === 1 ? '#fde047' : '#ffffff',
        life: rand(0.45, 0.85), maxLife: 0.85, size: 1,
      });
    }
  }

  addFloat(x, y, text, color = '#ffffff') {
    this.floats.push({ x, y, text, color, life: 1.15, maxLife: 1.15 });
  }

  getWaveY(x) {
    return this.waterY + Math.sin(x * 0.12 + this.time * 2.8) * 1.1;
  }

  loop(ts) {
    const dt = Math.min(0.05, Math.max(0.001, (ts - this.lastTs) / 1000));
    this.lastTs = ts;
    this.update(dt);
    renderGameWorld(this, this.ctx);
    requestAnimationFrame((next) => this.loop(next));
  }

  update(dt) {
    this.time += dt;
    this.stateTimer += dt;
    this.timeOfDay = (this.timeOfDay + dt * 0.0042) % 1;

    if (this.pointerHeld) this.holdDuration += dt;
    if (this.shakeTime > 0) this.shakeTime = Math.max(0, this.shakeTime - dt);

    for (const c of this.clouds) {
      c.x += c.speed * dt;
      if (c.x > this.vw + 24) c.x = -24;
    }
    for (const b of this.birds) {
      b.x += b.speed * dt;
      if (b.x > this.vw + 16) {
        b.x = -16;
        b.y = rand(12, Math.max(20, this.waterY - 26));
      }
    }

    if (Math.random() < dt * 2.2) {
      const bx = rand(this.pierEndX + 8, this.vw - 8);
      this.bubbles.push({
        x: bx, y: this.getSeabedY(bx) - 3,
        vy: rand(10, 18), life: rand(1.4, 3.2),
      });
    }
    for (let i = this.bubbles.length - 1; i >= 0; i--) {
      const b = this.bubbles[i];
      b.y -= b.vy * dt;
      b.x += Math.sin(this.time * 4 + i) * 3 * dt;
      b.life -= dt;
      if (b.life <= 0 || b.y <= this.waterY + 1) this.bubbles.splice(i, 1);
    }

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += p.gravity * dt;
      p.life -= dt;
      if (p.life <= 0) this.particles.splice(i, 1);
    }

    for (let i = this.ripples.length - 1; i >= 0; i--) {
      const r = this.ripples[i];
      r.r += 24 * dt;
      r.alpha = Math.max(0, 1 - r.r / r.maxR);
      if (r.r >= r.maxR) this.ripples.splice(i, 1);
    }

    for (let i = this.floats.length - 1; i >= 0; i--) {
      const f = this.floats[i];
      f.y -= 14 * dt;
      f.life -= dt;
      if (f.life <= 0) this.floats.splice(i, 1);
    }

    this.updateState(dt);
    this.updateFishes(dt);
  }

  updateState(dt) {
    const stats = this.getStats();

    if (this.state === 'CHARGING') {
      this.chargePower += this.chargeDir * dt * 1.15;
      if (this.chargePower >= 1) {
        this.chargePower = 1;
        this.chargeDir = -1;
      } else if (this.chargePower <= 0.14) {
        this.chargePower = 0.14;
        this.chargeDir = 1;
      }
      this.rodBend = lerp(this.rodBend, 0.2, dt * 8);
    } else if (this.state === 'CASTING') {
      this.castFlightT += dt / this.castFlightDur;
      const t = clamp(this.castFlightT, 0, 1);
      const arcH = lerp(18, 42, this.chargePower);
      this.bobberX = lerp(this.castStartX, this.castTargetX, t);
      this.bobberY = lerp(this.castStartY, this.waterY, t) - Math.sin(t * Math.PI) * arcH;
      this.hookX = this.bobberX;
      this.hookY = this.bobberY + 2;
      this.rodBend = lerp(this.rodBend, 0.15, dt * 10);

      if (t >= 1) {
        this.bobberY = this.waterY;
        this.state = 'WAITING';
        this.stateTimer = 0;
        sound.playSplash(false);
        this.spawnSplash(this.bobberX, this.waterY, 8);
        this.updateActionUI();
      }
    } else if (this.state === 'WAITING') {
      const waveY = this.getWaveY(this.bobberX);
      this.bobberDip = lerp(this.bobberDip, 0, dt * 7);
      this.bobberY = waveY + this.bobberDip;

      if (this.pointerHeld && this.holdDuration > 0.24) {
        this.bobberX -= 55 * dt;
        this.hookDepth = Math.max(4, this.hookDepth - 48 * dt);
        this.rodBend = lerp(this.rodBend, 0.22, dt * 8);
        sound.playReelTick(0.15);
        if (this.bobberX <= this.pierEndX + 12) {
          this.cancelToIdle();
          return;
        }
      } else {
        const maxHere = Math.max(12, this.getWaterDepthAt(this.bobberX) - 8);
        const goal = Math.min(this.targetHookDepth, maxHere);
        this.hookDepth = lerp(this.hookDepth, goal, dt * 1.4);
        this.rodBend = lerp(this.rodBend, 0.08, dt * 6);
      }

      this.jigBoost = Math.max(0, this.jigBoost - dt * 1.2);
      this.hookX = this.bobberX + Math.sin(this.time * 2.4) * 2;
      this.hookY = this.waterY + this.hookDepth;
      this.updateDepthBadge();
    } else if (this.state === 'BITE') {
      this.biteTimer -= dt;
      this.bobberDip = lerp(this.bobberDip, 5, dt * 14);
      this.bobberY = this.getWaveY(this.bobberX) + this.bobberDip;
      this.rodBend = lerp(this.rodBend, 0.45, dt * 12);

      if (this.hookedFish) {
        this.hookX = this.hookedFish.x;
        this.hookY = this.hookedFish.y;
      }

      if (this.biteTimer <= 0) {
        sound.playMiss();
        this.cancelToIdle('TOO SLOW!', '#fbbf24');
      }
    } else if (this.state === 'REELING') {
      const fish = this.hookedFish;
      if (!fish) {
        this.cancelToIdle();
        return;
      }
      const sp = fish.species;

      this.thrashTimer -= dt;
      if (this.thrashTimer <= 0) {
        this.fishThrashing = !this.fishThrashing;
        this.thrashTimer = this.fishThrashing
          ? rand(0.75, 1.45) * (0.85 + sp.thrashRate * 0.6)
          : rand(1.05, 1.85) * (1.25 - sp.thrashRate * 0.45);
        if (this.fishThrashing) {
          this.spawnSplash(fish.x, Math.min(fish.y, this.waterY + 4), 5);
        }
      }

      const diffScale = clamp(sp.strength / (0.88 + (this.save.upgrades.rod - 1) * 0.22), 0.55, 1.75);
      if (this.pointerHeld) {
        const pullSpeed = stats.reelPower / Math.sqrt(diffScale);
        const pullMult = this.fishThrashing ? 0.32 : 1.05;
        this.reelProgress += pullSpeed * pullMult * dt;

        const tensionGain = (this.fishThrashing ? 0.68 * diffScale : 0.16 * diffScale) * stats.tensionResist;
        this.tension += tensionGain * dt;
        sound.playReelTick(this.tension);
      } else {
        this.tension -= 0.62 * dt;
        const dragBack = this.fishThrashing ? 0.16 * diffScale : 0.04;
        this.reelProgress -= dragBack * dt;
      }

      this.tension = clamp(this.tension, 0, 1);
      this.reelProgress = clamp(this.reelProgress, 0, 1);

      if (this.tension > 0.78) sound.playTensionWarn();
      if (this.tension >= 0.99) {
        this.snapGrace += dt;
        if (this.snapGrace >= 0.30) {
          sound.playSnap();
          this.shake(0.28, 3);
          this.cancelToIdle('LINE SNAPPED!', '#f87171');
          return;
        }
      } else {
        this.snapGrace = Math.max(0, this.snapGrace - dt * 2);
      }

      if (this.reelProgress <= 0.005) {
        sound.playMiss();
        this.cancelToIdle('GOT AWAY!', '#fb923c');
        return;
      }

      if (this.reelProgress >= 0.995) {
        this.state = 'LANDING';
        this.stateTimer = 0;
        this.landStartX = fish.x;
        this.landStartY = fish.y;
        this.landT = 0;
        sound.playSplash(true);
        this.spawnSplash(fish.x, this.waterY, 12);
        this.updateActionUI();
        return;
      }

      const farX = Math.min(this.vw - 18, Math.max(this.castTargetX + 12, this.pierEndX + 70));
      const nearX = this.pierEndX + 14;
      const targetX = lerp(farX, nearX, this.reelProgress);
      const maxD = this.getWaterDepthAt(targetX) - 10;
      const targetY = this.waterY + lerp(clamp(sp.maxDepth * maxD, 18, maxD), 8, this.reelProgress);
      const thrashWiggleX = this.fishThrashing ? Math.sin(this.time * 28) * 5 : Math.sin(this.time * 7) * 1.5;
      const thrashWiggleY = this.fishThrashing ? Math.cos(this.time * 24) * 3 : 0;

      fish.x = lerp(fish.x, targetX + thrashWiggleX, dt * 6);
      fish.y = clamp(lerp(fish.y, targetY + thrashWiggleY, dt * 6), this.waterY + 4, this.getSeabedY(fish.x) - 6);
      fish.dir = this.fishThrashing ? 1 : -1;

      this.hookX = fish.x + (fish.dir === 1 ? 5 : -5);
      this.hookY = fish.y;
      this.bobberX = lerp(this.pierEndX + 10, this.hookX, 0.72);
      this.bobberY = this.getWaveY(this.bobberX) + 2;
      this.rodBend = lerp(this.rodBend, 0.35 + this.tension * 0.95, dt * 12);

      if (this.fishThrashing && Math.random() < dt * 8) {
        this.bubbles.push({
          x: fish.x + rand(-5, 5), y: fish.y + rand(-2, 2),
          vy: rand(14, 24), life: rand(0.4, 0.9),
        });
      }

      this.updateReelHUD();
    } else if (this.state === 'LANDING') {
      this.landT += dt / 0.45;
      const t = clamp(this.landT, 0, 1);
      const endX = this.anglerX + 12;
      const endY = this.anglerY + 2;
      if (this.hookedFish) {
        this.hookedFish.x = lerp(this.landStartX, endX, t);
        this.hookedFish.y = lerp(this.landStartY, endY, t) - Math.sin(t * Math.PI) * 34;
        this.hookX = this.hookedFish.x;
        this.hookY = this.hookedFish.y;
      }
      this.rodBend = lerp(this.rodBend, 0.1, dt * 8);
      if (t >= 1) this.completeLanding();
    } else {
      this.rodBend = lerp(this.rodBend, 0, dt * 6);
    }
  }

  updateFishes(dt) {
    const stats = this.getStats();
    const minX = this.pierEndX + 6;
    const maxX = this.vw - 8;

    const desired = this.isPortrait ? 9 : 12;
    while (this.fishes.length < desired) {
      this.fishes.push(this.spawnFish(true));
    }

    const anyoneApproaching = this.fishes.some((f) => f.ai === 'APPROACH' || f.ai === 'NIBBLE');

    for (let i = this.fishes.length - 1; i >= 0; i--) {
      const f = this.fishes[i];
      if (f.cooldown > 0) f.cooldown -= dt;
      if (f.ai === 'HOOKED') continue;

      if (f.ai === 'FLEE') {
        f.x += f.dir * f.speed * 2.8 * dt;
        if (f.x < -30 || f.x > this.vw + 30) this.fishes.splice(i, 1);
        continue;
      }

      if (f.ai === 'SWIM') {
        f.x += f.dir * f.speed * dt;
        const depthHere = Math.max(28, this.getWaterDepthAt(clamp(f.x, minX, maxX)) - 12);
        const goalY = this.waterY + 10 + f.normDepth * depthHere;
        f.baseY = lerp(f.baseY, goalY, dt * 1.5);
        f.y = clamp(
          f.baseY + Math.sin(this.time * 2.2 + f.phase) * 2.5,
          this.waterY + 8,
          this.getSeabedY(clamp(f.x, minX, maxX)) - 7
        );

        if (f.x < minX - 24 && f.dir === -1) {
          f.dir = 1;
        } else if (f.x > maxX + 26 && f.dir === 1) {
          this.fishes.splice(i, 1);
          continue;
        } else if (Math.random() < dt * 0.08 && f.x > minX + 10 && f.x < maxX - 10) {
          f.dir *= -1;
        }

        if (
          this.state === 'WAITING' &&
          !anyoneApproaching &&
          !(this.pointerHeld && this.holdDuration > 0.24) &&
          f.cooldown <= 0
        ) {
          const detectR = stats.attractRadius * (1 + this.jigBoost * 0.45);
          const dist = Math.hypot(f.x - this.hookX, f.y - this.hookY);
          if (dist < detectR && Math.random() < dt * (2.6 + this.save.upgrades.lure * 0.65)) {
            f.ai = 'APPROACH';
            f.nibbleCount = Math.random() < 0.55 ? 1 : 2;
            f.nibbleTimer = 0;
          }
        }
      } else if (f.ai === 'APPROACH') {
        if (this.state !== 'WAITING' || (this.pointerHeld && this.holdDuration > 0.24)) {
          f.ai = 'SWIM';
          continue;
        }
        const dx = this.hookX - f.x;
        const dy = this.hookY - f.y;
        const dist = Math.hypot(dx, dy);
        f.dir = dx >= 0 ? 1 : -1;
        if (dist > 6) {
          const spd = f.speed * 1.45;
          f.x += (dx / dist) * spd * dt;
          f.y += (dy / dist) * spd * dt;
        } else {
          f.ai = 'NIBBLE';
          f.nibbleTimer = rand(0.35, 0.7);
        }
      } else if (f.ai === 'NIBBLE') {
        if (this.state !== 'WAITING') {
          f.ai = 'SWIM';
          continue;
        }
        f.nibbleTimer -= dt;
        f.x = lerp(f.x, this.hookX - f.dir * 5, dt * 6);
        f.y = lerp(f.y, this.hookY, dt * 6);

        if (f.nibbleTimer <= 0) {
          if (f.nibbleCount > 0) {
            f.nibbleCount--;
            f.nibbleTimer = rand(0.45, 0.85);
            this.bobberDip = 2.6;
            sound.playNibble();
            this.addRipple(this.bobberX, this.waterY, 10);
          } else {
            this.hookedFish = f;
            f.ai = 'HOOKED';
            this.state = 'BITE';
            this.stateTimer = 0;
            this.biteTimer = stats.biteWindow;
            this.bobberDip = 5.5;
            sound.playBite();
            this.shake(0.16, 1.5);
            this.spawnSplash(this.bobberX, this.waterY, 9);
            this.updateActionUI();
          }
        }
      }

      if (f.species.id === 'goldenkoi' && Math.random() < dt * 4) {
        this.particles.push({
          x: f.x + rand(-6, 6), y: f.y + rand(-3, 3),
          vx: rand(-5, 5), vy: rand(-10, -3),
          gravity: 0, color: '#fef08a', life: 0.45, maxLife: 0.45, size: 1,
        });
      }
    }
  }

  updateHUD() {
    this.ui.coins.textContent = this.save.coins;
    this.ui.catches.textContent = `${Object.keys(this.save.log).length}/${FISH_SPECIES.length}`;
    this.ui.btnMute.textContent = this.save.muted ? 'SFX OFF' : 'SFX ON';
    this.ui.btnMute.classList.toggle('is-muted', this.save.muted);
  }

  updateDepthBadge() {
    if (this.state !== 'WAITING' && this.state !== 'BITE' && this.state !== 'REELING') {
      this.ui.depthBadge.classList.add('hidden');
      return;
    }
    const maxD = this.getWaterDepthAt(this.bobberX || this.pierEndX + 30);
    const ratio = clamp(this.hookDepth / Math.max(1, maxD), 0, 1);
    const zone = ratio < 0.36 ? 'SHALLOWS' : ratio < 0.68 ? 'MID-WATER' : 'DEEP FLOOR';
    const meters = (ratio * 24 + 1).toFixed(1);
    this.ui.depthBadge.textContent = `${zone} · ${meters}m`;
    this.ui.depthBadge.classList.remove('hidden');
  }

  updateReelHUD() {
    if (this.state !== 'REELING') return;
    this.ui.tensionFill.style.width = `${Math.round(this.tension * 100)}%`;
    this.ui.tensionFill.className =
      'bar-fill ' + (this.tension > 0.76 ? 'danger' : this.tension > 0.5 ? 'warn' : 'safe');

    const pct = Math.round(this.reelProgress * 100);
    this.ui.progressFill.style.width = `${pct}%`;
    this.ui.progressIcon.style.left = `${pct}%`;

    if (this.fishThrashing) {
      this.ui.reelStatus.textContent = this.tension > 0.65 ? 'EASE OFF! THRASHING!' : 'FISH THRASHING!';
      this.ui.reelStatus.className = 'reel-status thrashing';
    } else {
      this.ui.reelStatus.textContent = 'HOLD TO REEL IN!';
      this.ui.reelStatus.className = 'reel-status calm';
    }
  }

  updateActionUI() {
    const btn = this.ui.actionBtn;
    btn.classList.remove('state-bite', 'state-reel', 'state-charge');
    this.ui.reelHud.classList.toggle('hidden', this.state !== 'REELING');
    this.updateDepthBadge();

    switch (this.state) {
      case 'IDLE':
        this.ui.actionLabel.textContent = 'HOLD TO CAST';
        this.ui.actionSub.textContent = 'Hold anywhere or Space';
        break;
      case 'CHARGING':
        btn.classList.add('state-charge');
        this.ui.actionLabel.textContent = 'RELEASE TO CAST!';
        this.ui.actionSub.textContent = 'Farther cast sinks deeper';
        break;
      case 'CASTING':
        this.ui.actionLabel.textContent = 'CASTING...';
        this.ui.actionSub.textContent = 'Watch the bobber';
        break;
      case 'WAITING':
        this.ui.actionLabel.textContent = 'TAP: JIG · HOLD: REEL IN';
        this.ui.actionSub.textContent = 'Wait for a bite!';
        break;
      case 'BITE':
        btn.classList.add('state-bite');
        this.ui.actionLabel.textContent = 'HOOK IT NOW!';
        this.ui.actionSub.textContent = 'TAP QUICKLY!';
        break;
      case 'REELING':
        btn.classList.add('state-reel');
        this.ui.actionLabel.textContent = 'HOLD TO REEL';
        this.ui.actionSub.textContent = 'Release when fish thrashes';
        this.updateReelHUD();
        break;
      case 'LANDING':
        this.ui.actionLabel.textContent = 'LANDING CATCH!';
        this.ui.actionSub.textContent = 'Nice work!';
        break;
      case 'CAUGHT':
        this.ui.actionLabel.textContent = 'CONTINUE';
        this.ui.actionSub.textContent = 'Tap to fish again';
        break;
    }
  }

  showCatchCard(info) {
    const { species, weight, coins, isNewSpecies, isNewRecord } = info;
    const rarity = RARITY_META[species.rarity];
    const spriteCanvas = this.sprites.fish[species.id].right[0];

    this.ui.catchImg.src = spriteToDataURL(spriteCanvas, 5);
    this.ui.catchImg.alt = species.name;
    this.ui.catchName.textContent = species.name;
    this.ui.catchRarity.textContent = rarity.label;
    this.ui.catchRarity.style.color = rarity.color;
    this.ui.catchRarity.style.background = rarity.bg;
    this.ui.catchWeight.textContent = `${weight.toFixed(1)} lb`;
    this.ui.catchValue.textContent = `+${coins} G`;
    this.ui.catchDesc.textContent = species.desc;

    if (isNewSpecies) {
      this.ui.catchStamp.textContent = 'NEW SPECIES!';
      this.ui.catchStamp.classList.remove('hidden');
    } else if (isNewRecord) {
      this.ui.catchStamp.textContent = 'NEW RECORD!';
      this.ui.catchStamp.classList.remove('hidden');
    } else {
      this.ui.catchStamp.classList.add('hidden');
    }

    this.ui.catchOverlay.classList.remove('hidden');
  }

  openShop() {
    this.closeModals();
    this.renderShop();
    this.ui.shopModal.classList.remove('hidden');
  }

  renderShop() {
    this.ui.shopCoins.textContent = `${this.save.coins} G`;
    this.ui.shopList.innerHTML = '';

    for (const up of UPGRADES) {
      const lv = this.save.upgrades[up.id] || 1;
      const isMax = lv >= up.maxLevel;
      const nextCost = isMax ? 0 : up.costs[lv];
      const canAfford = !isMax && this.save.coins >= nextCost;

      const row = document.createElement('div');
      row.className = 'shop-item';
      row.innerHTML = `
        <div class="shop-info">
          <div class="shop-title">${up.name} <span class="shop-lv">LV ${lv}/${up.maxLevel}</span></div>
          <div class="shop-tier">${up.tiers[lv - 1]}${!isMax ? ` → ${up.tiers[lv]}` : ' (MAX)'}</div>
          <div class="shop-desc">${up.desc}</div>
        </div>
        <button class="pixel-btn shop-buy ${canAfford ? 'can-buy' : ''}" ${!canAfford ? 'disabled' : ''}>
          ${isMax ? 'MAXED' : `${nextCost} G`}
        </button>
      `;

      const buyBtn = row.querySelector('.shop-buy');
      buyBtn.addEventListener('click', () => {
        if (isMax || this.save.coins < nextCost) return;
        this.save.coins -= nextCost;
        this.save.upgrades[up.id] = lv + 1;
        this.persist();
        sound.playBuy();
        this.updateHUD();
        this.renderShop();
      });

      this.ui.shopList.appendChild(row);
    }
  }

  openLog() {
    this.closeModals();
    this.renderLog();
    this.ui.logModal.classList.remove('hidden');
  }

  renderLog() {
    const discovered = Object.keys(this.save.log).length;
    this.ui.logSummary.textContent = `${discovered} / ${FISH_SPECIES.length} Species · ${this.save.totalCatches} Caught`;
    this.ui.logGrid.innerHTML = '';

    for (const sp of FISH_SPECIES) {
      const entry = this.save.log[sp.id];
      const rarity = RARITY_META[sp.rarity];
      const spr = entry ? this.sprites.fish[sp.id].right[0] : this.sprites.fish[sp.id].logSil;

      const card = document.createElement('div');
      card.className = `log-card ${entry ? 'discovered' : 'locked'}`;
      card.innerHTML = `
        <div class="log-art"><img src="${spriteToDataURL(spr, 3)}" alt="${entry ? sp.name : 'Unknown'}" /></div>
        <div class="log-name">${entry ? sp.name : '???'}</div>
        <div class="log-rarity" style="color:${rarity.color}">${rarity.label}</div>
        <div class="log-meta">${entry ? `Best ${entry.bestWeight.toFixed(1)} lb · ×${entry.count}` : sp.zone}</div>
      `;
      this.ui.logGrid.appendChild(card);
    }
  }

  closeModals() {
    this.ui.shopModal.classList.add('hidden');
    this.ui.logModal.classList.add('hidden');
  }
}

const game = new PierlineGame();
window.__PIERLINE__ = game;
