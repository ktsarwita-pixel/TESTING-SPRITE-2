// PIERLINE — 2D Pixel-Art Side-POV Fishing Game (Mobile + Desktop, Multi-Map)
import { FISH_SPECIES, RARITY_META, UPGRADES, getUpgradeCost } from './fishData.js';
import { MAPS, getMapById } from './maps.js';
import { buildSpriteCache, spriteToDataURL } from './sprites.js';
import { renderGameWorld } from './renderer.js';
import { sound } from './audio.js';

const SAVE_KEY = 'pierline_pixel_fishing_v1';
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (lo, hi) => lo + Math.random() * (hi - lo);

function defaultSave() {
  return {
    coins: 0,
    totalCaught: 0,
    upgrades: { rod: 1, line: 1, lure: 1, charm: 1 },
    log: {},
    currentMap: 'harbor',
    unlockedMaps: ['harbor'],
    sound: true,
  };
}

function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return defaultSave();
    const parsed = JSON.parse(raw);
    const unlocked = Array.isArray(parsed.unlockedMaps) && parsed.unlockedMaps.length
      ? Array.from(new Set(['harbor', ...parsed.unlockedMaps]))
      : ['harbor'];
    const currentMap = unlocked.includes(parsed.currentMap) ? parsed.currentMap : 'harbor';
    return {
      ...defaultSave(),
      ...parsed,
      currentMap,
      unlockedMaps: unlocked,
      upgrades: { ...defaultSave().upgrades, ...(parsed.upgrades || {}) },
      log: parsed.log || {},
    };
  } catch {
    return defaultSave();
  }
}

class PierlineGame {
  constructor() {
    this.canvas = document.getElementById('game-canvas');
    this.ctx = this.canvas.getContext('2d', { alpha: false });
    this.sprites = buildSpriteCache();
    this.spriteUrls = {};
    for (const sp of FISH_SPECIES) {
      this.spriteUrls[sp.id] = spriteToDataURL(this.sprites.fish[sp.id].right[0], 4);
    }

    this.save = loadSave();
    sound.setMuted(this.save.sound === false);

    // Virtual pixel resolution (recomputed on resize/orientation change)
    this.vw = 320;
    this.vh = 180;
    this.isPortrait = false;
    this.waterY = 66;
    this.pierY = 50;
    this.pierEndX = 76;
    this.anglerX = 48;
    this.anglerY = 26;

    // Gameplay state machine: IDLE | CHARGING | CASTING | WAITING | BITE | REELING | LANDING | CAUGHT
    this.state = 'IDLE';
    this.time = 0;
    this.timeOfDay = 0.27;
    this.lastFrame = performance.now();

    // Casting / bobber / hook
    this.chargePower = 0;
    this.chargeDir = 1;
    this.castStartX = 0;
    this.castStartY = 0;
    this.castTargetX = 160;
    this.castT = 0;
    this.bobberX = 160;
    this.bobberY = 66;
    this.hookX = 160;
    this.hookY = 92;
    this.targetDepthY = 92;
    this.rodFlex = 0;
    this.castFollowThrough = 0;

    // Bite & reeling state
    this.activeFish = null;
    this.biteTimer = 0;
    this.tension = 0;
    this.progress = 0;
    this.fishThrashing = false;
    this.fishFightTimer = 0;
    this.reelHold = false;
    this.chargeHold = false;
    this.reelTickAccum = 0;
    this.landingT = 0;
    this.landingStartX = 0;
    this.landingStartY = 0;
    this.lastCatchInfo = null;

    // Ambient world entities
    this.fishes = [];
    this.clouds = [];
    this.birds = [];
    this.stars = [];
    this.kelp = [];
    this.pebbles = [];
    this.corals = [];
    this.fireflies = [];
    this.weatherParticles = [];
    this.bubbles = [];
    this.ripples = [];
    this.particles = [];
    this.floats = [];
    this.shakeTime = 0;
    this.shakeMag = 0;

    this.activeModal = null;
    this.initDOM();
    this.resize();
    this.initWorldScenery();
    this.populateFish();
    this.bindEvents();
    this.updateHUD();
    this.updateControlsUI();

    window.__PIERLINE__ = this;
    requestAnimationFrame((t) => this.loop(t));
  }

  getCurrentMap() {
    return getMapById(this.save.currentMap);
  }

  getMapSpecies(mapId = this.save.currentMap) {
    return FISH_SPECIES.filter((sp) => !sp.maps || sp.maps.includes(mapId));
  }

  initDOM() {
    this.el = {
      coins: document.getElementById('hud-coins'),
      caught: document.getElementById('hud-caught'),
      time: document.getElementById('hud-time'),
      depthBadge: document.getElementById('depth-badge'),
      hint: document.getElementById('hint-banner'),
      reelPanel: document.getElementById('reel-panel'),
      tensionFill: document.getElementById('tension-fill'),
      progressFill: document.getElementById('progress-fill'),
      actionBtn: document.getElementById('action-btn'),
      btnMaps: document.getElementById('btn-maps'),
      btnShop: document.getElementById('btn-shop'),
      btnLog: document.getElementById('btn-log'),
      btnSound: document.getElementById('btn-sound'),
      catchOverlay: document.getElementById('catch-overlay'),
      catchRarity: document.getElementById('catch-rarity'),
      catchTitle: document.getElementById('catch-title'),
      catchSprite: document.getElementById('catch-sprite'),
      catchWeight: document.getElementById('catch-weight'),
      catchValue: document.getElementById('catch-value'),
      catchRecord: document.getElementById('catch-record'),
      catchDesc: document.getElementById('catch-desc'),
      btnCatchOk: document.getElementById('btn-catch-ok'),
      mapsModal: document.getElementById('maps-modal'),
      mapsCoins: document.getElementById('maps-coins'),
      mapsList: document.getElementById('maps-list'),
      btnMapsClose: document.getElementById('btn-maps-close'),
      shopModal: document.getElementById('shop-modal'),
      shopCoins: document.getElementById('shop-coins'),
      shopList: document.getElementById('shop-list'),
      btnShopClose: document.getElementById('btn-shop-close'),
      logModal: document.getElementById('log-modal'),
      logCount: document.getElementById('log-count'),
      logGrid: document.getElementById('log-grid'),
      btnLogClose: document.getElementById('btn-log-close'),
    };
  }

  persist() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(this.save));
    } catch {
      // Ignore storage quota errors
    }
  }

  getStats() {
    const u = this.save.upgrades;
    return {
      maxCastFrac: 0.56 + (u.rod - 1) * 0.10,
      maxDepthFrac: 0.48 + (u.line - 1) * 0.125,
      reelSpeed: 0.25 + (u.rod - 1) * 0.055,
      tensionDecay: 0.44 + (u.line - 1) * 0.06,
      lineStrength: 1 + (u.line - 1) * 0.26,
      lureLuck: 1 + (u.lure - 1) * 0.38,
      attractRadius: 34 + (u.lure - 1) * 10,
      coinMult: 1 + ((u.charm || 1) - 1) * 0.25,
      biteBonus: ((u.charm || 1) - 1) * 0.14,
    };
  }

  resize() {
    const w = Math.max(240, window.innerWidth);
    const h = Math.max(240, window.innerHeight);
    this.isPortrait = h > w * 1.05;

    const targetPixelSize = this.isPortrait ? Math.max(2, Math.floor(w / 185)) : Math.max(3, Math.floor(w / 320));
    this.vw = clamp(Math.round(w / targetPixelSize), 170, 360);
    this.vh = clamp(Math.round(h / targetPixelSize), 156, 360);

    this.canvas.width = this.vw;
    this.canvas.height = this.vh;
    this.ctx.imageSmoothingEnabled = false;

    this.waterY = Math.round(this.vh * (this.isPortrait ? 0.34 : 0.38));
    this.pierY = this.waterY - 14;
    this.pierEndX = clamp(Math.round(this.vw * (this.isPortrait ? 0.33 : 0.24)), 54, 86);
    this.anglerX = this.pierEndX - 21;
    this.anglerY = this.pierY - this.sprites.angler.idle0.h + 1;

    this.initSceneryPositions();
  }

  initWorldScenery() {
    this.stars = Array.from({ length: 42 }, () => ({
      x: Math.random(),
      y: Math.random() * 0.78,
      phase: Math.random() * Math.PI * 2,
      bright: Math.random() > 0.65,
    }));

    this.clouds = Array.from({ length: 5 }, (_, i) => ({
      x: i * 74 + rand(0, 26),
      y: rand(8, Math.max(18, this.waterY - 26)),
      speed: rand(2.2, 5.0),
      sprite: i % 2 === 0 ? 'cloud0' : 'cloud1',
    }));

    this.birds = Array.from({ length: 3 }, (_, i) => ({
      x: rand(30, this.vw),
      y: rand(12, Math.max(20, this.waterY - 22)),
      speed: rand(10, 17),
      phase: i * 2.1,
    }));

    this.initSceneryPositions();
    this.initWeatherParticles();
  }

  initWeatherParticles() {
    const map = this.getCurrentMap();
    this.weatherParticles = [];
    if (map.weather === 'snow') {
      for (let i = 0; i < 28; i++) {
        this.weatherParticles.push({
          x: rand(0, this.vw),
          y: rand(0, this.waterY + 4),
          vx: rand(-8, -3),
          vy: rand(10, 20),
          size: Math.random() > 0.7 ? 2 : 1,
          color: Math.random() > 0.35 ? '#eef7ff' : '#bae6fd',
        });
      }
    } else if (map.weather === 'embers') {
      for (let i = 0; i < 22; i++) {
        this.weatherParticles.push({
          x: rand(0, this.vw),
          y: rand(6, this.waterY),
          vx: rand(-5, 6),
          vy: rand(-14, -6),
          size: 1,
          color: Math.random() > 0.4 ? '#fb923c' : '#fef08a',
        });
      }
    }
  }

  initSceneryPositions() {
    this.kelp = [];
    for (let i = 0; i < 12; i++) {
      this.kelp.push({
        x: Math.round(this.pierEndX + 10 + (i / 11) * Math.max(40, this.vw - this.pierEndX - 18)),
        height: Math.round(rand(14, 30)),
        phase: rand(0, Math.PI * 2),
        idx: i,
      });
    }
    this.pebbles = Array.from({ length: 24 }, () => ({
      x: Math.round(rand(4, this.vw - 4)),
      dy: Math.round(rand(2, 9)),
      w: Math.random() > 0.5 ? 2 : 1,
      color: Math.random() > 0.5 ? '#59422e' : '#b89463',
    }));
    this.corals = [
      { x: Math.round(this.pierEndX + (this.vw - this.pierEndX) * 0.16), sprite: 'coral0' },
      { x: Math.round(this.pierEndX + (this.vw - this.pierEndX) * 0.52), sprite: 'coral1' },
      { x: Math.round(this.pierEndX + (this.vw - this.pierEndX) * 0.86), sprite: 'coral0' },
    ];
    this.fireflies = Array.from({ length: 7 }, (_, i) => ({
      x: Math.round(rand(6, this.pierEndX + 26)),
      y: Math.round(rand(Math.max(8, this.pierY - 26), this.pierY - 3)),
      phase: i * 1.3 + rand(0, 1.5),
    }));
  }

  getSeabedY(x) {
    const base = this.vh - 14;
    const slope = x < this.pierEndX + 20 ? -Math.max(0, (this.pierEndX + 20 - x) * 0.12) : 0;
    return Math.round(base + slope + Math.sin(x * 0.055) * 3 + Math.cos(x * 0.13) * 1.5);
  }

  getDepthBand(y) {
    const ratio = clamp((y - this.waterY) / Math.max(1, this.vh - 14 - this.waterY), 0, 1);
    if (ratio < 0.36) return { idx: 0, name: 'SHALLOW' };
    if (ratio < 0.70) return { idx: 1, name: 'MIDWATER' };
    return { idx: 2, name: 'DEEP' };
  }

  selectMap(mapId) {
    const target = getMapById(mapId);
    if (!target) return;
    if (!this.save.unlockedMaps.includes(target.id)) {
      if (this.save.coins < target.cost) return;
      this.save.coins -= target.cost;
      this.save.unlockedMaps.push(target.id);
      sound.playBuy();
    } else {
      sound.playJig();
    }

    this.save.currentMap = target.id;
    this.persist();

    // Reset active cast cleanly and refresh biome
    this.state = 'IDLE';
    this.activeFish = null;
    this.chargeHold = false;
    this.reelHold = false;
    this.tension = 0;
    this.progress = 0;
    this.bubbles = [];
    this.ripples = [];
    this.particles = [];
    this.initWeatherParticles();
    this.populateFish();
    this.closeModals();
    this.updateHUD();
    this.updateControlsUI();
    this.spawnFloat(this.vw * 0.5, this.waterY - 12, target.name.toUpperCase(), target.accent);
  }

  pickSpeciesForDepth(depthFrac) {
    const stats = this.getStats();
    const mapSpecies = this.getMapSpecies();
    const pool = mapSpecies.filter((sp) => depthFrac >= sp.minDepth - 0.08 && depthFrac <= sp.maxDepth + 0.08);
    const list = pool.length ? pool : mapSpecies;

    let total = 0;
    const weights = list.map((sp) => {
      const rarityBoost =
        sp.rarity === 'mythic' ? Math.pow(stats.lureLuck, 1.8) :
        sp.rarity === 'legendary' ? Math.pow(stats.lureLuck, 1.55) :
        sp.rarity === 'rare' ? Math.pow(stats.lureLuck, 1.25) :
        sp.rarity === 'uncommon' ? Math.pow(stats.lureLuck, 1.05) :
        1;
      const w = sp.spawnWeight * rarityBoost;
      total += w;
      return w;
    });

    let roll = Math.random() * total;
    for (let i = 0; i < list.length; i++) {
      roll -= weights[i];
      if (roll <= 0) return list[i];
    }
    return list[0];
  }

  spawnFish(fromEdge = false) {
    const waterH = Math.max(40, this.vh - 18 - this.waterY);
    const depthFrac = clamp(Math.pow(Math.random(), 0.92), 0.08, 0.95);
    const species = this.pickSpeciesForDepth(depthFrac);
    const clampedFrac = clamp(depthFrac, species.minDepth, species.maxDepth);
    const y = this.waterY + 8 + clampedFrac * (waterH - 12);
    const dir = Math.random() > 0.5 ? 1 : -1;
    const minX = this.pierEndX + 12;
    const maxX = this.vw - 10;
    const x = fromEdge ? (dir > 0 ? minX - 12 : maxX + 14) : rand(minX, maxX);

    return {
      species,
      x,
      y,
      homeY: y,
      dir,
      speed: species.speed * rand(0.85, 1.18),
      phase: rand(0, Math.PI * 2),
      ai: 'CRUISE',
      fleeTimer: 0,
      turnTimer: rand(2.5, 7),
    };
  }

  populateFish() {
    this.fishes = [];
    const targetCount = this.isPortrait ? 9 : 13;
    for (let i = 0; i < targetCount; i++) {
      this.fishes.push(this.spawnFish(false));
    }
  }

  bindEvents() {
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 120));

    const startPrimary = (e) => {
      if (this.activeModal) return;
      if (e) e.preventDefault();
      sound.unlock();
      this.onPrimaryDown();
    };
    const endPrimary = (e) => {
      if (e) e.preventDefault();
      this.onPrimaryUp();
    };

    this.canvas.addEventListener('pointerdown', startPrimary, { passive: false });
    this.el.actionBtn.addEventListener('pointerdown', startPrimary, { passive: false });
    window.addEventListener('pointerup', endPrimary, { passive: false });
    window.addEventListener('pointercancel', endPrimary, { passive: false });

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      if (e.code === 'Space' || e.code === 'Enter') {
        if (this.state === 'CAUGHT') {
          e.preventDefault();
          this.dismissCatch();
          return;
        }
        if (this.activeModal) return;
        e.preventDefault();
        sound.unlock();
        this.onPrimaryDown();
      } else if (e.code === 'Escape') {
        this.closeModals();
      } else if (e.code === 'KeyM') {
        this.activeModal === 'maps' ? this.closeModals() : this.openModal('maps');
      }
    });

    window.addEventListener('keyup', (e) => {
      if (e.code === 'Space' || e.code === 'Enter') {
        this.onPrimaryUp();
      }
    });

    this.el.btnMaps.addEventListener('click', () => {
      sound.unlock(); sound.playJig(); this.openModal('maps');
    });
    this.el.btnShop.addEventListener('click', () => {
      sound.unlock(); sound.playJig(); this.openModal('shop');
    });
    this.el.btnLog.addEventListener('click', () => {
      sound.unlock(); sound.playJig(); this.openModal('log');
    });
    this.el.btnSound.addEventListener('click', () => {
      sound.unlock();
      this.save.sound = !this.save.sound;
      sound.setMuted(!this.save.sound);
      if (this.save.sound) sound.playJig();
      this.persist();
      this.updateHUD();
    });

    this.el.btnCatchOk.addEventListener('click', () => { sound.playJig(); this.dismissCatch(); });
    this.el.btnMapsClose.addEventListener('click', () => { sound.playJig(); this.closeModals(); });
    this.el.btnShopClose.addEventListener('click', () => { sound.playJig(); this.closeModals(); });
    this.el.btnLogClose.addEventListener('click', () => { sound.playJig(); this.closeModals(); });

    for (const backdrop of [this.el.mapsModal, this.el.shopModal, this.el.logModal]) {
      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) { sound.playJig(); this.closeModals(); }
      });
    }
  }

  onPrimaryDown() {
    if (this.state === 'IDLE') {
      this.state = 'CHARGING';
      this.chargeHold = true;
      this.chargePower = 0.08;
      this.chargeDir = 1;
      this.updateControlsUI();
    } else if (this.state === 'WAITING') {
      this.spawnSplash(this.bobberX, this.waterY, 4);
      this.resetToIdle('LINE RETRIEVED');
    } else if (this.state === 'BITE') {
      this.hookFish();
    } else if (this.state === 'REELING') {
      this.reelHold = true;
    }
  }

  onPrimaryUp() {
    if (this.state === 'CHARGING' && this.chargeHold) {
      this.chargeHold = false;
      this.launchCast();
    }
    this.reelHold = false;
  }

  launchCast() {
    const stats = this.getStats();
    const minCastX = this.pierEndX + 22;
    const maxCastX = this.pierEndX + (this.vw - this.pierEndX - 18) * stats.maxCastFrac;
    this.castTargetX = clamp(lerp(minCastX, maxCastX, this.chargePower), minCastX, this.vw - 14);

    const waterH = Math.max(36, this.vh - 20 - this.waterY);
    const depthFrac = clamp(0.14 + this.chargePower * stats.maxDepthFrac, 0.14, 0.92);
    this.targetDepthY = this.waterY + 10 + depthFrac * (waterH - 12);

    const rod = this.getRodTipPos();
    this.castStartX = rod.tipX;
    this.castStartY = rod.tipY;
    this.bobberX = rod.tipX;
    this.bobberY = rod.tipY;
    this.castT = 0;
    this.castFollowThrough = 0.24;
    this.state = 'CASTING';
    sound.playCast();
    this.updateControlsUI();
  }

  hookFish() {
    if (!this.activeFish) return;
    this.state = 'REELING';
    this.activeFish.ai = 'HOOKED';
    this.tension = 0.28;
    this.progress = 0.14;
    this.reelHold = true;
    this.fishThrashing = false;
    this.fishFightTimer = rand(0.55, 1.15);
    this.shakeTime = 0.18;
    this.shakeMag = 2;
    sound.playHookSet();
    this.spawnSplash(this.bobberX, this.waterY, 10);
    this.spawnRipple(this.bobberX, this.waterY);
    this.spawnFloat(this.bobberX, this.waterY - 12, 'HOOKED!', '#fef08a');
    this.updateControlsUI();
  }

  resetToIdle(toastText) {
    if (this.activeFish) {
      this.activeFish.ai = 'FLEE';
      this.activeFish.fleeTimer = 2.0;
      this.activeFish.dir = 1;
      this.activeFish = null;
    }
    this.state = 'IDLE';
    this.reelHold = false;
    this.chargeHold = false;
    this.tension = 0;
    this.progress = 0;
    this.rodFlex = 0;
    if (toastText) {
      this.spawnFloat(this.bobberX, this.waterY - 10, toastText, '#f87171');
    }
    this.updateControlsUI();
  }

  startLanding() {
    this.state = 'LANDING';
    this.reelHold = false;
    this.landingT = 0;
    this.landingStartX = this.activeFish.x;
    this.landingStartY = this.activeFish.y;
    this.spawnSplash(this.activeFish.x, this.waterY, 12);
    this.spawnRipple(this.activeFish.x, this.waterY);
    sound.playSplash();
    this.updateControlsUI();
  }

  completeCatch() {
    const sp = this.activeFish.species;
    const weight = Number(lerp(sp.minKg, sp.maxKg, Math.pow(Math.random(), 0.72)).toFixed(2));
    const sizeBonus = 0.85 + ((weight - sp.minKg) / Math.max(0.01, sp.maxKg - sp.minKg)) * 0.45;
    const value = Math.max(5, Math.round(sp.value * sizeBonus * this.getStats().coinMult));

    const prev = this.save.log[sp.id];
    const isNew = !prev;
    const isRecord = !prev || weight > prev.bestKg;

    this.save.log[sp.id] = {
      count: (prev ? prev.count : 0) + 1,
      bestKg: isRecord ? weight : prev.bestKg,
    };
    this.save.coins += value;
    this.save.totalCaught += 1;
    this.persist();

    this.fishes = this.fishes.filter((f) => f !== this.activeFish);
    this.activeFish = null;
    this.fishes.push(this.spawnFish(true));

    this.lastCatchInfo = { species: sp, weight, value, isNew, isRecord };
    this.state = 'CAUGHT';
    this.activeModal = 'catch';
    sound.playCatch(sp.rarity);

    const rMeta = RARITY_META[sp.rarity];
    this.el.catchRarity.textContent = rMeta.label;
    this.el.catchRarity.style.background = rMeta.bg;
    this.el.catchRarity.style.color = rMeta.color;
    this.el.catchTitle.textContent = sp.name.toUpperCase();
    this.el.catchSprite.src = this.spriteUrls[sp.id];
    this.el.catchWeight.textContent = `${weight.toFixed(2)} kg`;
    this.el.catchValue.textContent = `+${value} G`;
    this.el.catchRecord.textContent = isNew ? 'NEW!' : isRecord ? 'BEST!' : `${this.save.log[sp.id].count}x`;
    this.el.catchDesc.textContent = sp.desc;
    this.el.catchOverlay.classList.remove('hidden');

    this.updateHUD();
    this.updateControlsUI();
  }

  dismissCatch() {
    this.el.catchOverlay.classList.add('hidden');
    this.activeModal = null;
    this.lastCatchInfo = null;
    this.state = 'IDLE';
    this.updateControlsUI();
  }

  openModal(which) {
    this.closeModals();
    this.activeModal = which;
    if (which === 'maps') {
      this.renderMaps();
      this.el.mapsModal.classList.remove('hidden');
    } else if (which === 'shop') {
      this.renderShop();
      this.el.shopModal.classList.remove('hidden');
    } else if (which === 'log') {
      this.renderLog();
      this.el.logModal.classList.remove('hidden');
    }
  }

  closeModals() {
    this.el.mapsModal.classList.add('hidden');
    this.el.shopModal.classList.add('hidden');
    this.el.logModal.classList.add('hidden');
    if (this.activeModal !== 'catch') this.activeModal = null;
  }

  renderMaps() {
    this.el.mapsCoins.textContent = this.save.coins;
    this.el.mapsList.innerHTML = '';

    for (const m of MAPS) {
      const unlocked = this.save.unlockedMaps.includes(m.id);
      const isCurrent = this.save.currentMap === m.id;
      const nativeSpecies = this.getMapSpecies(m.id);
      const caughtHere = nativeSpecies.filter((sp) => this.save.log[sp.id]).length;
      const canBuy = !unlocked && this.save.coins >= m.cost;

      const card = document.createElement('div');
      card.className = `map-card${isCurrent ? ' active-map' : ''}`;

      const fishStripHtml = nativeSpecies
        .slice(0, 6)
        .map((sp) => `<img src="${this.spriteUrls[sp.id]}" class="${this.save.log[sp.id] ? '' : 'sil'}" alt="${this.save.log[sp.id] ? sp.name : 'Unknown fish'}" />`)
        .join('');

      let btnLabel = isCurrent ? 'HERE' : unlocked ? 'TRAVEL' : `UNLOCK ${m.cost} G`;
      let btnClass = isCurrent ? 'pixel-btn' : unlocked ? 'pixel-btn accent-cyan' : 'pixel-btn accent-gold';

      card.innerHTML = `
        <div class="map-top">
          <div class="map-title-wrap">
            <span class="map-swatch" style="background:${m.accent}"></span>
            <span class="map-name">${m.name.toUpperCase()}</span>
          </div>
          <span class="map-tag">${caughtHere}/${nativeSpecies.length} FISH</span>
        </div>
        <div class="map-desc">${m.desc}</div>
        <div class="map-bottom">
          <div class="map-fish-strip">${fishStripHtml}</div>
          <button class="${btnClass}" type="button" ${isCurrent || (!unlocked && !canBuy) ? 'disabled' : ''}>${btnLabel}</button>
        </div>
      `;

      const btn = card.querySelector('button');
      if (!isCurrent && (unlocked || canBuy)) {
        btn.addEventListener('click', () => this.selectMap(m.id));
      }
      this.el.mapsList.appendChild(card);
    }
  }

  renderShop() {
    this.el.shopCoins.textContent = this.save.coins;
    this.el.shopList.innerHTML = '';
    for (const u of UPGRADES) {
      const lv = this.save.upgrades[u.id] || 1;
      const maxed = lv >= u.maxLevel;
      const cost = getUpgradeCost(u, lv);
      const canBuy = !maxed && this.save.coins >= cost;

      const row = document.createElement('div');
      row.className = 'shop-item';
      row.innerHTML = `
        <div class="shop-info">
          <div class="shop-title">${u.name} <span class="lv-tag">LV ${lv}/${u.maxLevel}</span></div>
          <div class="shop-desc">${u.desc}</div>
          <div class="shop-perk">GEAR: ${u.tiers[lv - 1]}${maxed ? ' (MAX)' : ' → ' + u.tiers[lv]}</div>
        </div>
        <button class="pixel-btn ${canBuy ? 'accent-gold' : ''}" type="button" ${canBuy ? '' : 'disabled'}>
          ${maxed ? 'MAX' : `${cost} G`}
        </button>
      `;
      const btn = row.querySelector('button');
      if (canBuy) {
        btn.addEventListener('click', () => {
          this.save.coins -= cost;
          this.save.upgrades[u.id] = lv + 1;
          this.persist();
          sound.playBuy();
          this.updateHUD();
          this.renderShop();
        });
      }
      this.el.shopList.appendChild(row);
    }
  }

  renderLog() {
    const discovered = Object.keys(this.save.log).length;
    this.el.logCount.textContent = `${discovered} / ${FISH_SPECIES.length}`;
    this.el.logGrid.innerHTML = '';
    for (const sp of FISH_SPECIES) {
      const entry = this.save.log[sp.id];
      const rMeta = RARITY_META[sp.rarity];
      const mapCodes = (sp.maps || ['harbor'])
        .map((id) => getMapById(id).shortTag)
        .join(' · ');
      const card = document.createElement('div');
      card.className = `log-card ${entry ? 'discovered' : 'locked'}`;
      card.innerHTML = `
        <div class="log-rarity" style="color:${entry ? rMeta.color : '#64748b'}">${rMeta.label}</div>
        <div class="log-img-wrap">
          <img src="${this.spriteUrls[sp.id]}" alt="${entry ? sp.name : 'Undiscovered fish'}" />
        </div>
        <div class="log-name">${entry ? sp.name : '???'}</div>
        <div class="log-stats">${entry ? `${entry.count}x &bull; ${entry.bestKg.toFixed(2)}kg` : sp.zone.toUpperCase()}</div>
        <div class="log-maps">${mapCodes}</div>
      `;
      this.el.logGrid.appendChild(card);
    }
  }

  updateHUD() {
    this.el.coins.textContent = this.save.coins;
    this.el.caught.textContent = this.save.totalCaught;
    this.el.btnSound.textContent = this.save.sound ? 'SFX' : 'MUTE';
    this.el.btnSound.classList.toggle('muted', !this.save.sound);

    const t = this.timeOfDay;
    const label = t < 0.14 || t >= 0.86 ? 'NIGHT' : t < 0.25 ? 'DAWN' : t < 0.68 ? 'DAY' : 'SUNSET';
    this.el.time.textContent = label;
  }

  updateControlsUI() {
    const btn = this.el.actionBtn;
    const hint = this.el.hint;
    btn.classList.remove('is-bite', 'is-reel', 'is-warn');
    this.el.reelPanel.classList.toggle('hidden', this.state !== 'REELING');

    if (this.state === 'IDLE') {
      btn.textContent = 'HOLD TO CAST';
      hint.textContent = 'HOLD BUTTON OR SCREEN TO CAST';
    } else if (this.state === 'CHARGING') {
      btn.textContent = 'RELEASE TO CAST!';
      hint.textContent = 'HIGHER POWER = DEEPER WATER';
    } else if (this.state === 'CASTING') {
      btn.textContent = 'CASTING...';
      hint.textContent = 'WATCH THE BOBBER!';
    } else if (this.state === 'WAITING') {
      btn.textContent = 'PULL BACK';
      hint.textContent = 'WAIT FOR A FISH TO BITE...';
    } else if (this.state === 'BITE') {
      btn.textContent = 'HOOK IT NOW!';
      btn.classList.add('is-bite');
      hint.textContent = 'BITE! TAP FAST!';
    } else if (this.state === 'REELING') {
      btn.textContent = this.fishThrashing ? 'EASE UP!' : 'HOLD TO REEL!';
      btn.classList.add(this.fishThrashing ? 'is-warn' : 'is-reel');
      hint.textContent = this.fishThrashing ? 'FISH FIGHTING — RELEASE TO COOL LINE!' : 'HOLD TO REEL IN!';
    } else if (this.state === 'LANDING') {
      btn.textContent = 'LANDING!';
      hint.textContent = 'NICE CATCH!';
    } else if (this.state === 'CAUGHT') {
      btn.textContent = 'CAUGHT!';
      hint.textContent = 'FISH ADDED TO LOG';
    }
  }

  getAnglerPose() {
    if (this.state === 'CHARGING') {
      return this.chargePower > 0.55 ? 'charge1' : 'charge0';
    }
    if (this.state === 'CASTING') {
      return this.castFollowThrough > 0 ? 'cast0' : 'cast1';
    }
    if (this.state === 'WAITING') {
      return Math.floor(this.time * 1.6) % 2 === 0 ? 'wait0' : 'wait1';
    }
    if (this.state === 'BITE') {
      return Math.floor(this.time * 12) % 2 === 0 ? 'bite0' : 'bite1';
    }
    if (this.state === 'REELING') {
      if (this.fishThrashing && this.tension > 0.65) return 'reelHard';
      if (this.reelHold) return Math.floor(this.time * 9) % 2 === 0 ? 'reel0' : 'reel1';
      return 'reel0';
    }
    if (this.state === 'LANDING' || this.state === 'CAUGHT') {
      return Math.floor(this.time * 5) % 2 === 0 ? 'celebrate0' : 'celebrate1';
    }
    const tick = Math.floor(this.time * 2.2) % 10;
    if (tick === 7) return 'idleBlink';
    return tick % 2 === 0 ? 'idle0' : 'idle1';
  }

  getRodTipPos() {
    const pose = this.getAnglerPose();
    const spr = this.sprites.angler[pose] || this.sprites.angler.idle0;
    const drawY = this.pierY - spr.h + 1;
    const handX = this.anglerX + spr.hand[0];
    const handY = drawY + spr.hand[1];
    const rodLen = 27 + (this.save.upgrades.rod - 1) * 2.2;

    let angle = -0.62;
    if (this.state === 'CHARGING') {
      angle = lerp(-0.85, -2.42, this.chargePower);
    } else if (this.state === 'CASTING') {
      angle = lerp(-2.2, -0.35, Math.min(1, this.castT * 2.2));
    } else if (this.state === 'BITE') {
      angle = -0.32 + Math.sin(this.time * 28) * 0.08;
    } else if (this.state === 'REELING') {
      angle = this.reelHold ? -0.96 : -0.58;
    } else if (this.state === 'LANDING' || this.state === 'CAUGHT') {
      angle = -1.28;
    }

    const tipBaseX = handX + Math.cos(angle) * rodLen;
    const tipBaseY = handY + Math.sin(angle) * rodLen;
    const bend = this.rodFlex * 13;
    const tipX = tipBaseX + bend * 0.28;
    const tipY = tipBaseY + bend;
    const ctrlX = lerp(handX, tipX, 0.56);
    const ctrlY = lerp(handY, tipY, 0.56) - 4 + bend * 0.22;
    return { handX, handY, ctrlX, ctrlY, tipX, tipY };
  }

  spawnSplash(x, y, count = 8) {
    const map = this.getCurrentMap();
    const pColor = map.id === 'abyss' ? '#fdba74' : '#e0f7ff';
    for (let i = 0; i < count; i++) {
      this.particles.push({
        x: x + rand(-3, 3),
        y: y + rand(-1, 1),
        vx: rand(-26, 26),
        vy: rand(-52, -18),
        g: 120,
        life: rand(0.28, 0.55),
        size: Math.random() > 0.65 ? 2 : 1,
        color: Math.random() > 0.35 ? pColor : '#7dd3fc',
      });
    }
  }

  spawnRipple(x, y) {
    this.ripples.push({ x, y, r: 2, maxR: rand(12, 20), alpha: 0.9 });
  }

  spawnFloat(x, y, text, color = '#ffffff') {
    this.floats.push({ x, y, vy: -14, life: 1.05, maxLife: 1.05, text, color });
  }

  update(dt) {
    this.time += dt;
    this.timeOfDay = (this.timeOfDay + dt / 240) % 1;
    if (this.castFollowThrough > 0) this.castFollowThrough = Math.max(0, this.castFollowThrough - dt);
    if (this.shakeTime > 0) this.shakeTime = Math.max(0, this.shakeTime - dt);

    const map = this.getCurrentMap();

    // Update clouds
    for (const c of this.clouds) {
      c.x += c.speed * dt;
      if (c.x > this.vw + 24) c.x = -36;
    }

    // Update birds
    for (const b of this.birds) {
      b.x -= b.speed * dt;
      if (b.x < -14) {
        b.x = this.vw + rand(12, 50);
        b.y = rand(10, Math.max(18, this.waterY - 20));
      }
    }

    // Update biome weather particles
    for (const wp of this.weatherParticles) {
      wp.x += wp.vx * dt;
      wp.y += wp.vy * dt;
      if (map.weather === 'snow') {
        wp.x += Math.sin(this.time * 2 + wp.y * 0.1) * 4 * dt;
        if (wp.y > this.waterY + 2 || wp.x < -4) {
          wp.x = rand(0, this.vw + 20);
          wp.y = rand(-8, 0);
        }
      } else if (map.weather === 'embers') {
        wp.x += Math.sin(this.time * 3 + wp.y * 0.12) * 5 * dt;
        if (wp.y < -4) {
          wp.x = rand(0, this.vw);
          wp.y = this.waterY + rand(-2, 4);
        }
      }
    }

    // Ambient underwater bubbles (hot vents in Ember Caldera)
    if (Math.random() < dt * (map.id === 'abyss' ? 5.2 : 3.2)) {
      const isHot = map.id === 'abyss' && Math.random() < 0.6;
      const leftVentX = this.pierEndX + (this.vw - this.pierEndX) * 0.28 + 6;
      const rightVentX = this.pierEndX + (this.vw - this.pierEndX) * 0.74 + 6;
      const bx = isHot ? (Math.random() > 0.5 && this.vw > 210 ? rightVentX : leftVentX) + rand(-3, 3) : rand(this.pierEndX + 8, this.vw - 8);
      this.bubbles.push({
        x: bx,
        y: this.getSeabedY(bx) - (isHot ? 10 : 4),
        vy: rand(12, 22),
        wobble: rand(0, Math.PI * 2),
        hot: isHot,
      });
    }
    for (let i = this.bubbles.length - 1; i >= 0; i--) {
      const b = this.bubbles[i];
      b.y -= b.vy * dt;
      b.x += Math.sin(this.time * 4 + b.wobble) * 5 * dt;
      if (b.y <= this.waterY + 2) this.bubbles.splice(i, 1);
    }

    for (let i = this.ripples.length - 1; i >= 0; i--) {
      const r = this.ripples[i];
      r.r += 16 * dt;
      r.alpha = 1 - r.r / r.maxR;
      if (r.r >= r.maxR) this.ripples.splice(i, 1);
    }

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.vy += p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      if (p.life <= 0) this.particles.splice(i, 1);
    }

    for (let i = this.floats.length - 1; i >= 0; i--) {
      const f = this.floats[i];
      f.y += f.vy * dt;
      f.life -= dt;
      if (f.life <= 0) this.floats.splice(i, 1);
    }

    // Fishing state machine
    if (this.state === 'CHARGING') {
      this.chargePower += this.chargeDir * dt * 1.12;
      if (this.chargePower >= 1) { this.chargePower = 1; this.chargeDir = -1; }
      if (this.chargePower <= 0.08) { this.chargePower = 0.08; this.chargeDir = 1; }
      this.rodFlex = lerp(this.rodFlex, 0.14 * this.chargePower, dt * 8);
    } else if (this.state === 'CASTING') {
      this.castT += dt * 1.65;
      const t = clamp(this.castT, 0, 1);
      const arc = Math.sin(t * Math.PI) * (24 + this.chargePower * 22);
      this.bobberX = lerp(this.castStartX, this.castTargetX, t);
      this.bobberY = lerp(this.castStartY, this.waterY, t) - arc;
      this.hookX = this.bobberX;
      this.hookY = this.bobberY + 2;
      this.rodFlex = lerp(this.rodFlex, 0.06, dt * 8);

      if (t >= 1) {
        this.state = 'WAITING';
        this.bobberY = this.waterY;
        this.hookX = this.bobberX;
        this.hookY = this.waterY + 4;
        sound.playSplash();
        this.spawnSplash(this.bobberX, this.waterY, 10);
        this.spawnRipple(this.bobberX, this.waterY);
        this.updateControlsUI();
      }
    } else if (this.state === 'WAITING') {
      this.bobberY = this.waterY + Math.sin(this.time * 4.2) * 1.1;
      this.hookX = lerp(this.hookX, this.bobberX + Math.sin(this.time * 2.1) * 1.5, dt * 4);
      this.hookY = lerp(this.hookY, Math.min(this.targetDepthY, this.getSeabedY(this.hookX) - 6), dt * 1.85);
      this.rodFlex = lerp(this.rodFlex, 0.04, dt * 6);
    } else if (this.state === 'BITE') {
      this.biteTimer -= dt;
      this.bobberY = this.waterY + 2.5 + Math.sin(this.time * 32) * 1.6;
      this.rodFlex = lerp(this.rodFlex, 0.52, dt * 14);
      if (this.activeFish) {
        this.hookX = this.activeFish.x + this.activeFish.dir * 4;
        this.hookY = this.activeFish.y;
      }
      if (Math.random() < dt * 9) this.spawnRipple(this.bobberX, this.waterY);
      if (this.biteTimer <= 0) {
        sound.playSnap();
        this.resetToIdle('GOT AWAY!');
      }
    } else if (this.state === 'REELING') {
      this.updateReeling(dt);
    } else if (this.state === 'LANDING') {
      this.landingT += dt * 1.8;
      const t = clamp(this.landingT, 0, 1);
      const destX = this.anglerX + 10;
      const destY = this.pierY - 12;
      const arc = Math.sin(t * Math.PI) * 32;
      this.hookX = lerp(this.landingStartX, destX, t);
      this.hookY = lerp(this.landingStartY, destY, t) - arc;
      if (this.activeFish) {
        this.activeFish.x = this.hookX;
        this.activeFish.y = this.hookY;
      }
      this.rodFlex = lerp(this.rodFlex, 0.25 * (1 - t), dt * 10);
      if (t >= 1) this.completeCatch();
    } else {
      this.rodFlex = lerp(this.rodFlex, 0, dt * 6);
    }

    this.updateFishAI(dt);

    // Update map + zone badge
    const mapLabel = map.name.toUpperCase();
    const showDepth = this.state === 'WAITING' || this.state === 'BITE' || this.state === 'REELING';
    const band = showDepth ? this.getDepthBand(this.hookY).name : 'PIER';
    this.el.depthBadge.textContent = `${mapLabel} \u2022 ${band}`;

    if (Math.floor(this.time * 2) !== Math.floor((this.time - dt) * 2)) {
      this.updateHUD();
    }
  }

  updateReeling(dt) {
    const fish = this.activeFish;
    if (!fish) return this.resetToIdle();

    const stats = this.getStats();
    this.fishFightTimer -= dt;
    if (this.fishFightTimer <= 0) {
      this.fishThrashing = !this.fishThrashing;
      const strength = fish.species.strength;
      this.fishFightTimer = this.fishThrashing
        ? rand(0.5, 0.8 + strength * 0.22)
        : rand(0.75, 1.45 - Math.min(0.45, strength * 0.14));
      this.updateControlsUI();
    }

    const strength = fish.species.strength;
    if (this.reelHold) {
      const gain = (stats.reelSpeed / (0.68 + strength * 0.28)) * (this.fishThrashing ? 0.55 : 1.0);
      this.progress += gain * dt;
      const strain = ((this.fishThrashing ? 0.62 : 0.18) * (0.65 + strength * 0.36)) / stats.lineStrength;
      this.tension += strain * dt;

      this.reelTickAccum += dt;
      if (this.reelTickAccum > 0.12) {
        this.reelTickAccum = 0;
        sound.playReelTick(this.tension);
      }
    } else {
      const slip = (this.fishThrashing ? 0.08 : 0.025) * strength;
      this.progress = Math.max(0.02, this.progress - slip * dt);
      const cool = stats.tensionDecay * (this.fishThrashing ? 0.72 : 1.15);
      this.tension = Math.max(0, this.tension - cool * dt);
    }

    const targetX = lerp(this.castTargetX, this.pierEndX + 12, clamp(this.progress, 0, 1));
    const targetY = lerp(this.targetDepthY, this.waterY + 8, clamp(this.progress, 0, 1));
    const thrashX = this.fishThrashing ? Math.sin(this.time * 24) * 5 : Math.sin(this.time * 8) * 1.5;
    const thrashY = this.fishThrashing ? Math.cos(this.time * 20) * 3.5 : 0;
    fish.x = clamp(lerp(fish.x, targetX + thrashX, dt * 4.2), this.pierEndX + 6, this.vw - 8);
    fish.y = clamp(lerp(fish.y, targetY + thrashY, dt * 4.2), this.waterY + 6, this.getSeabedY(fish.x) - 6);
    fish.dir = this.fishThrashing ? 1 : -1;

    this.hookX = fish.x;
    this.hookY = fish.y;
    this.bobberX = lerp(this.bobberX, fish.x, dt * 5);
    this.bobberY = this.waterY + 1 + (this.fishThrashing ? Math.sin(this.time * 28) * 2 : 0);
    this.rodFlex = lerp(this.rodFlex, 0.35 + this.tension * 0.75, dt * 10);

    if (this.fishThrashing && Math.random() < dt * 8) {
      this.spawnSplash(this.bobberX, this.waterY, 3);
      this.spawnRipple(this.bobberX, this.waterY);
    }

    this.el.tensionFill.style.width = `${Math.round(clamp(this.tension, 0, 1) * 100)}%`;
    this.el.progressFill.style.width = `${Math.round(clamp(this.progress, 0, 1) * 100)}%`;
    this.el.tensionFill.classList.toggle('danger', this.tension > 0.78);

    if (this.tension >= 1) {
      sound.playSnap();
      this.shakeTime = 0.25;
      this.shakeMag = 3;
      this.resetToIdle('LINE SNAPPED!');
    } else if (this.progress >= 1) {
      this.startLanding();
    }
  }

  updateFishAI(dt) {
    const stats = this.getStats();
    let approachingCount = this.fishes.filter((f) => f.ai === 'APPROACH').length;

    for (const f of this.fishes) {
      if (f.ai === 'HOOKED') continue;

      if (f.ai === 'FLEE') {
        f.fleeTimer -= dt;
        f.x += f.dir * f.speed * 2.4 * dt;
        if (f.fleeTimer <= 0) f.ai = 'CRUISE';
      } else if (f.ai === 'APPROACH') {
        if (this.state !== 'WAITING') {
          f.ai = 'CRUISE';
          continue;
        }
        const dx = this.hookX - f.x;
        const dy = this.hookY - f.y;
        const dist = Math.hypot(dx, dy);
        f.dir = dx >= 0 ? 1 : -1;
        if (dist > 4) {
          f.x += (dx / dist) * f.speed * 1.45 * dt;
          f.y += (dy / dist) * f.speed * 1.45 * dt;
        } else {
          this.activeFish = f;
          this.state = 'BITE';
          this.biteTimer = clamp(1.45 - f.species.strength * 0.08 + stats.biteBonus, 0.9, 2.0);
          sound.playBite();
          this.spawnSplash(this.bobberX, this.waterY, 8);
          this.spawnRipple(this.bobberX, this.waterY);
          this.updateControlsUI();
          continue;
        }
      } else {
        f.turnTimer -= dt;
        f.x += f.dir * f.speed * dt;
        f.y = f.homeY + Math.sin(this.time * 2.2 + f.phase) * 2.4;

        const minX = this.pierEndX + 10;
        const maxX = this.vw - 10;
        if (f.x < minX) { f.x = minX; f.dir = 1; }
        if (f.x > maxX) { f.x = maxX; f.dir = -1; }
        if (f.turnTimer <= 0) {
          f.turnTimer = rand(3, 8);
          if (Math.random() < 0.35) f.dir *= -1;
        }

        if (this.state === 'WAITING' && approachingCount === 0 && Math.abs(this.hookY - this.waterY) > 7) {
          const dist = Math.hypot(this.hookX - f.x, this.hookY - f.y);
          if (dist < stats.attractRadius && Math.random() < dt * 1.45 * stats.lureLuck) {
            f.ai = 'APPROACH';
            approachingCount = 1;
          }
        }
      }

      const maxY = this.getSeabedY(f.x) - 6;
      f.y = clamp(f.y, this.waterY + 7, Math.max(this.waterY + 8, maxY));
    }
  }

  render() {
    renderGameWorld(this, this.ctx);
  }

  loop(now) {
    const dt = Math.min(0.05, Math.max(0.001, (now - this.lastFrame) / 1000));
    this.lastFrame = now;
    this.update(dt);
    this.render();
    requestAnimationFrame((t) => this.loop(t));
  }
}

new PierlineGame();
