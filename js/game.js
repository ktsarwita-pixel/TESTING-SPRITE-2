// PIERLINE — 2D Pixel-Art Side-POV Fishing Game (Mobile + Desktop, Multi-Map, Realistic Reeling + Admin Panel)
import { FISH_SPECIES, RARITY_META, UPGRADES, getUpgradeCost, getSpeciesById, canPredatorEat } from './fishData.js';
import { MAPS, getMapById } from './maps.js';
import { buildSpriteCache, spriteToDataURL } from './sprites.js';
import { renderGameWorld } from './renderer.js';
import { computeAnglerRig } from './anglerRenderer.js';
import { sound } from './audio.js';

const SAVE_KEY = 'pierline_pixel_fishing_v1';
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (lo, hi) => lo + Math.random() * (hi - lo);
const smoothstep = (t) => t * t * (3 - 2 * t);

function defaultUpgrades() {
  const out = {};
  for (const u of UPGRADES) out[u.id] = 1;
  return out;
}

function defaultSave() {
  return {
    coins: 0,
    totalCaught: 0,
    upgrades: defaultUpgrades(),
    log: {},
    currentMap: 'harbor',
    unlockedMaps: ['harbor'],
    sound: true,
  };
}

function sanitizeSave(rawObj) {
  const base = defaultSave();
  if (!rawObj || typeof rawObj !== 'object') return base;
  const unlocked = Array.isArray(rawObj.unlockedMaps) && rawObj.unlockedMaps.length
    ? Array.from(new Set(['harbor', ...rawObj.unlockedMaps.filter((id) => MAPS.some((m) => m.id === id))]))
    : ['harbor'];
  const currentMap = unlocked.includes(rawObj.currentMap) ? rawObj.currentMap : 'harbor';

  const cleanLog = {};
  if (rawObj.log && typeof rawObj.log === 'object') {
    for (const [id, entry] of Object.entries(rawObj.log)) {
      if (!entry || typeof entry !== 'object') continue;
      const sp = FISH_SPECIES.find((s) => s.id === id);
      if (!sp) continue;
      const count = Number.isFinite(entry.count) && entry.count > 0 ? Math.round(entry.count) : 1;
      const fallbackKg = Number(((sp.minWeight + sp.maxWeight) * 0.5).toFixed(2));
      const bestKg = Number.isFinite(entry.bestKg) && entry.bestKg > 0 ? Number(entry.bestKg) : fallbackKg;
      cleanLog[id] = { count, bestKg };
    }
  }

  const u = rawObj.upgrades && typeof rawObj.upgrades === 'object' ? rawObj.upgrades : {};
  const cleanUpgrade = (k, maxLv = 5) => {
    const v = Number(u[k]);
    return Number.isFinite(v) ? clamp(Math.round(v), 1, maxLv) : 1;
  };
  const upgrades = {};
  for (const upg of UPGRADES) {
    upgrades[upg.id] = cleanUpgrade(upg.id, upg.maxLevel || 5);
  }

  return {
    coins: Number.isFinite(Number(rawObj.coins)) && Number(rawObj.coins) >= 0 ? Math.round(Number(rawObj.coins)) : 0,
    totalCaught: Number.isFinite(Number(rawObj.totalCaught)) && Number(rawObj.totalCaught) >= 0 ? Math.round(Number(rawObj.totalCaught)) : 0,
    upgrades,
    log: cleanLog,
    currentMap,
    unlockedMaps: unlocked,
    sound: rawObj.sound !== false,
  };
}

function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return defaultSave();
    return sanitizeSave(JSON.parse(raw));
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
    this.persist();
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

    // Casting / bobber / hook / smooth rod physics
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
    this.rodAngle = -0.62;
    this.smoothHandX = null;
    this.smoothHandY = null;
    this.castFollowThrough = 0;

    // Realistic bite, reeling & landing state
    this.activeFish = null;
    this.biteTimer = 0;
    this.tension = 0;
    this.progress = 0;
    this.fishThrashing = false;
    this.fishFightState = 'CALM';
    this.inSweetSpot = false;
    this.reelTotalDist = 60;
    this.fishThrashing = false;
    this.fishFightState = 'CALM'; // CALM | WARNING | THRASH
    this.fishFightTimer = 0;
    this.fishStamina = 1.0;
    this.inSweetSpot = false;
    this.bobDipImpulse = 0;
    this.activePointerId = null;
    this.retrieving = false;
    this.mouthDirSmooth = -1;
    // Articulated 60fps angler kinematics
    this.animLean = 0;
    this.animSquat = 0;
    this.animStance = 0.1;
    this.crankAngle = 0;
    this.reelHold = false;
    this.chargeHold = false;
    this.retrieving = false;
    this.reelTickAccum = 0;
    this.landingT = 0;
    this.landingStartX = 0;
    this.landingStartY = 0;
    this.landingStartDir = -1;
    this.lastCatchInfo = null;
    this.catchTime = 0;

    // Live-bait predator swallow tracking (bigger fish eating hooked smaller fish!)
    this.eatenPrey = [];
    this.swallowCount = 0;
    this.ambushCooldown = 0;
    this.swallowBannerTimer = 0;
    this.swallowBannerText = '';

    // Admin / Dev test options
    this.devClockFrozen = false;
    this.devNoSnap = false;
    this.devAutoLand = false;

    // Ambient world entities
    this.fishes = [];
    this.clouds = [];
    this.birds = [];
    this.stars = [];
    this.kelp = [];
    this.pebbles = [];
    this.corals = [];
    this.fireflies = [];
    this.shootingStars = [];
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
    this.initAdminUI();
    this.updateReelSweetZoneUI();
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
      reelStatusTag: document.getElementById('reel-status-tag'),
      tensionSweetZone: document.getElementById('tension-sweet-zone'),
      tensionFill: document.getElementById('tension-fill'),
      tensionNeedle: document.getElementById('tension-needle'),
      progressFill: document.getElementById('progress-fill'),
      progressPct: document.getElementById('progress-pct'),
      actionBtn: document.getElementById('action-btn'),
      btnMaps: document.getElementById('btn-maps'),
      btnShop: document.getElementById('btn-shop'),
      btnLog: document.getElementById('btn-log'),
      btnAdmin: document.getElementById('btn-admin'),
      btnSound: document.getElementById('btn-sound'),
      catchOverlay: document.getElementById('catch-overlay'),
      catchRarity: document.getElementById('catch-rarity'),
      catchTitle: document.getElementById('catch-title'),
      catchSwallowBanner: document.getElementById('catch-swallow-banner'),
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
      adminModal: document.getElementById('admin-modal'),
      adminStatus: document.getElementById('admin-status'),
      btnAdminClose: document.getElementById('btn-admin-close'),
      admTelSwatch: document.getElementById('adm-tel-swatch'),
      admTelMap: document.getElementById('adm-tel-map'),
      admTelState: document.getElementById('adm-tel-state'),
      admTelTime: document.getElementById('adm-tel-time'),
      admTelGold: document.getElementById('adm-tel-gold'),
      admTelFish: document.getElementById('adm-tel-fish'),
      admGold100: document.getElementById('adm-gold-100'),
      admGold1000: document.getElementById('adm-gold-1000'),
      admGold10000: document.getElementById('adm-gold-10000'),
      admUnlockMaps: document.getElementById('adm-unlock-maps'),
      admMaxGear: document.getElementById('adm-max-gear'),
      admFillLog: document.getElementById('adm-fill-log'),
      admReset: document.getElementById('adm-reset'),
      admMapRow: document.getElementById('adm-map-row'),
      admTodReadout: document.getElementById('adm-tod-readout'),
      admTodSlider: document.getElementById('adm-tod-slider'),
      admTodDawn: document.getElementById('adm-tod-dawn'),
      admTodDay: document.getElementById('adm-tod-day'),
      admTodSunset: document.getElementById('adm-tod-sunset'),
      admTodNight: document.getElementById('adm-tod-night'),
      admTodFreeze: document.getElementById('adm-tod-freeze'),
      admFishSelect: document.getElementById('adm-fish-select'),
      admFishImg: document.getElementById('adm-fish-img'),
      admFishName: document.getElementById('adm-fish-name'),
      admFishRarity: document.getElementById('adm-fish-rarity'),
      admFishStats: document.getElementById('adm-fish-stats'),
      admFishMaps: document.getElementById('adm-fish-maps'),
      admSpawnFish: document.getElementById('adm-spawn-fish'),
      admForceBite: document.getElementById('adm-force-bite'),
      admSpawnMyth: document.getElementById('adm-spawn-myth'),
      admNoSnap: document.getElementById('adm-nosnap'),
      admAutoLand: document.getElementById('adm-autoland'),
      admForceAmbush: document.getElementById('adm-force-ambush'),
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
    const rod = u.rod || 1;
    const line = u.line || 1;
    const lure = u.lure || 1;
    const charm = u.charm || 1;
    const reel = u.reel || 1;
    const sinker = u.sinker || 1;
    const chum = u.chum || 1;
    const net = u.net || 1;

    return {
      maxCastFrac: 0.56 + (rod - 1) * 0.10,
      maxDepthFrac: Math.min(1.0, 0.72 + (line - 1) * 0.08 + (sinker - 1) * 0.06),
      reelSpeed: 0.28 + (rod - 1) * 0.06,
      tensionDecay: 0.46 + (line - 1) * 0.06,
      lineStrength: 1 + (line - 1) * 0.28,
      lureLuck: 1 + (lure - 1) * 0.38,
      attractRadius: 34 + (lure - 1) * 10,
      coinMult: 1 + (charm - 1) * 0.25,
      biteBonus: (charm - 1) * 0.14,
      // Precision Reel stats
      sweetMin: Math.max(0.20, 0.30 - (reel - 1) * 0.02),
      sweetMax: Math.min(0.83, 0.75 + (reel - 1) * 0.0175),
      sweetMult: 1.35 + (reel - 1) * 0.075,
      retrieveBonus: (reel - 1) * 7,
      // Deep Sinker stats
      sinkRate: 3.6 + (sinker - 1) * 1.0,
      chargeRate: 1.12 + (sinker - 1) * 0.08,
      // Predator Bait (Chum) stats
      ambushRadius: 76 + (chum - 1) * 12,
      ambushRate: 1.45 + (chum - 1) * 0.45,
      maxSwallows: chum >= 3 ? 3 : 2,
      swallowBonusFrac: 0.40 + (chum - 1) * 0.15,
      // Trophy Creel (Net) stats
      weightExp: Math.max(0.36, 0.72 - (net - 1) * 0.09),
      staminaDrain: 0.16 + (net - 1) * 0.03,
    };
  }

  updateReelSweetZoneUI() {
    if (!this.el.tensionSweetZone) return;
    const stats = this.getStats();
    const leftPct = Math.round(stats.sweetMin * 100);
    const widthPct = Math.round((stats.sweetMax - stats.sweetMin) * 100);
    this.el.tensionSweetZone.style.left = `${leftPct}%`;
    this.el.tensionSweetZone.style.width = `${widthPct}%`;
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
    this.anglerX = this.pierEndX - 24;
    this.anglerY = this.pierY - this.sprites.angler.idle0.h + 1;

    this.initSceneryPositions();
  }

  initWorldScenery() {
    const starTints = ['#fef9c3', '#e0f2fe', '#f8fafc', '#f5d0fe', '#bae6fd'];
    this.stars = Array.from({ length: 64 }, (_, i) => ({
      x: Math.random(),
      y: Math.random() * 0.80,
      phase: Math.random() * Math.PI * 2,
      bright: i % 3 === 0 || Math.random() > 0.72,
      tint: starTints[i % starTints.length],
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
    } else if (map.weather === 'starlight') {
      const cols = ['#f9a8d4', '#5eead4', '#fef08a', '#e9d5ff'];
      for (let i = 0; i < 26; i++) {
        this.weatherParticles.push({
          x: rand(0, this.vw),
          y: rand(4, this.waterY),
          vx: rand(-3, 3),
          vy: rand(-6, -2),
          size: 1,
          color: cols[i % cols.length],
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
    this.fireflies = Array.from({ length: 12 }, (_, i) => ({
      x: Math.round(rand(4, i < 8 ? this.pierEndX + 28 : this.vw - 16)),
      y: Math.round(rand(Math.max(8, this.pierY - 26), this.waterY - 4)),
      phase: i * 1.15 + rand(0, 1.5),
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

  getCelebrateHandPos() {
    const rig = computeAnglerRig(this);
    return {
      x: rig.shoulderX + 9.5,
      y: rig.headY - 4.5,
    };
  }

  getFishMouthPos(fish) {
    const spr = this.sprites.fish[fish.species.id];
    const halfW = spr ? spr.w * 0.38 : 6;
    return {
      x: fish.x + fish.dir * halfW,
      y: fish.y,
    };
  }

  selectMap(mapId, forceUnlock = false) {
    const target = getMapById(mapId);
    if (!target) return;
    if (!this.save.unlockedMaps.includes(target.id)) {
      if (!forceUnlock) {
        if (this.save.coins < target.cost) return;
        this.save.coins -= target.cost;
      }
      this.save.unlockedMaps.push(target.id);
      sound.playBuy();
    } else {
      sound.playJig();
    }

    this.save.currentMap = target.id;
    this.persist();

    this.state = 'IDLE';
    this.activeFish = null;
    this.chargeHold = false;
    this.reelHold = false;
    this.devAutoLand = false;
    this.tension = 0;
    this.progress = 0;
    this.fishThrashing = false;
    this.fishFightState = 'CALM';
    this.inSweetSpot = false;
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
      const baseWeight = (RARITY_META[sp.rarity] && RARITY_META[sp.rarity].weight) || 0.5;
      const rarityBoost =
        sp.rarity === 'myth' ? Math.pow(stats.lureLuck, 2.0) :
        sp.rarity === 'legendary' ? Math.pow(stats.lureLuck, 1.7) :
        sp.rarity === 'epic' ? Math.pow(stats.lureLuck, 1.45) :
        sp.rarity === 'rare' ? Math.pow(stats.lureLuck, 1.25) :
        sp.rarity === 'uncommon' ? Math.pow(stats.lureLuck, 1.05) :
        1;
      const w = baseWeight * rarityBoost;
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

  spawnFish(fromEdge = false, forcedSpecies = null) {
    const waterH = Math.max(40, this.vh - 18 - this.waterY);
    const depthFrac = clamp(Math.pow(Math.random(), 0.92), 0.08, 0.95);
    const species = forcedSpecies || this.pickSpeciesForDepth(depthFrac);
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
      vx: 0,
      vy: 0,
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

  // ── Admin / Dev Console ───────────────────────────────────────────────────
  initAdminUI() {
    this.admActiveTab = 'world';
    this.admFishFilter = 'all';
    this.admMapButtons = {};

    // Tab switching
    if (this.el.adminModal && typeof this.el.adminModal.querySelectorAll === 'function') {
      const tabs = this.el.adminModal.querySelectorAll('[data-adm-tab]');
      const panes = this.el.adminModal.querySelectorAll('[data-adm-pane]');
      tabs.forEach((tab) => {
        tab.addEventListener('click', () => {
          sound.unlock();
          sound.playJig();
          const target = tab.dataset.admTab;
          this.admActiveTab = target;
          tabs.forEach((t) => {
            const on = t.dataset.admTab === target;
            t.classList.toggle('is-active', on);
            t.setAttribute('aria-selected', on ? 'true' : 'false');
          });
          panes.forEach((p) => {
            p.classList.toggle('hidden', p.dataset.admPane !== target);
          });
          this.refreshAdminLabels();
        });
      });

      // Fish species filter pills
      const filters = this.el.adminModal.querySelectorAll('[data-adm-filter]');
      filters.forEach((btn) => {
        btn.addEventListener('click', () => {
          sound.unlock();
          sound.playJig();
          this.admFishFilter = btn.dataset.admFilter;
          filters.forEach((f) => f.classList.toggle('is-active', f === btn));
          this.populateAdminFishSelect();
        });
      });
    }

    // Biome warp mini-cards with color swatches
    if (this.el.admMapRow) {
      this.el.admMapRow.innerHTML = '';
      for (const m of MAPS) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'pixel-btn adm-map-btn';
        b.title = `Warp to ${m.name}`;
        const dot = document.createElement('span');
        dot.className = 'adm-map-dot';
        dot.style.background = m.accent || '#38bdf8';
        const lbl = document.createElement('span');
        lbl.className = 'adm-map-name';
        lbl.textContent = m.name.toUpperCase();
        b.appendChild(dot);
        b.appendChild(lbl);
        b.addEventListener('click', () => {
          sound.unlock();
          this.selectMap(m.id, true);
          this.populateAdminFishSelect();
          this.refreshAdminLabels();
        });
        this.el.admMapRow.appendChild(b);
        this.admMapButtons[m.id] = b;
      }
    }

    if (this.el.admFishSelect) {
      this.el.admFishSelect.addEventListener('change', () => this.updateAdminFishPreview());
    }
    this.populateAdminFishSelect();

    // Live Time-of-Day Scrubber Slider
    if (this.el.admTodSlider) {
      this.el.admTodSlider.addEventListener('input', () => {
        const val = Number(this.el.admTodSlider.value) / 100;
        this.timeOfDay = clamp(val, 0, 0.999);
        this.refreshAdminLabels();
      });
    }

    const bind = (el, fn) => {
      if (el) el.addEventListener('click', () => { sound.unlock(); fn(); this.refreshAdminLabels(); });
    };

    bind(this.el.admGold100, () => this.adminAddGold(100));
    bind(this.el.admGold1000, () => this.adminAddGold(1000));
    bind(this.el.admGold10000, () => this.adminAddGold(10000));
    bind(this.el.admUnlockMaps, () => this.adminUnlockAllMaps());
    bind(this.el.admMaxGear, () => this.adminMaxGear());
    bind(this.el.admFillLog, () => this.adminFillLog());
    bind(this.el.admReset, () => this.adminResetSave());

    bind(this.el.admTodDawn, () => this.adminSetTime(0.18));
    bind(this.el.admTodDay, () => this.adminSetTime(0.38));
    bind(this.el.admTodSunset, () => this.adminSetTime(0.75));
    bind(this.el.admTodNight, () => this.adminSetTime(0.02));
    bind(this.el.admTodFreeze, () => {
      this.devClockFrozen = !this.devClockFrozen;
      this.setAdminStatus(this.devClockFrozen ? 'CLOCK PAUSED' : 'CLOCK RUNNING');
      sound.playJig();
    });

    bind(this.el.admSpawnFish, () => {
      const id = this.el.admFishSelect ? this.el.admFishSelect.value : FISH_SPECIES[0].id;
      this.adminSpawnSpecies(id);
    });
    bind(this.el.admForceBite, () => {
      const id = this.el.admFishSelect ? this.el.admFishSelect.value : FISH_SPECIES[0].id;
      this.adminTriggerBite(id);
    });
    bind(this.el.admSpawnMyth, () => {
      this.adminSpawnSpecies('krakentitan');
    });
    bind(this.el.admNoSnap, () => {
      this.devNoSnap = !this.devNoSnap;
      this.setAdminStatus(this.devNoSnap ? 'NO SNAP ENABLED' : 'NO SNAP OFF');
      sound.playJig();
    });
    bind(this.el.admAutoLand, () => {
      if (this.state === 'REELING') {
        this.devAutoLand = true;
        this.closeModals();
        this.spawnFloat(this.vw * 0.5, this.waterY - 12, 'AUTO-REEL ON', '#38bdf8');
      } else {
        this.setAdminStatus('HOOK A FISH FIRST', true);
      }
    });
    bind(this.el.admForceAmbush, () => this.adminForceAmbush());
    this.refreshAdminLabels();
  }

  populateAdminFishSelect() {
    if (!this.el.admFishSelect) return;
    const prev = this.el.admFishSelect.value;
    const mapId = this.save.currentMap;
    let list = FISH_SPECIES;
    if (this.admFishFilter === 'map') {
      list = FISH_SPECIES.filter((sp) => !sp.maps || sp.maps.includes(mapId));
    } else if (this.admFishFilter === 'high') {
      list = FISH_SPECIES.filter((sp) => sp.rarity === 'myth' || sp.rarity === 'legendary');
    }
    this.el.admFishSelect.innerHTML = list.map(
      (sp) => `<option value="${sp.id}">${sp.name} · ${RARITY_META[sp.rarity].label} (${sp.value}G)</option>`
    ).join('');
    if (list.some((sp) => sp.id === prev)) {
      this.el.admFishSelect.value = prev;
    } else if (list.length) {
      this.el.admFishSelect.value = list[0].id;
    }
    this.updateAdminFishPreview();
  }

  updateAdminFishPreview() {
    const id = this.el.admFishSelect ? this.el.admFishSelect.value : FISH_SPECIES[0].id;
    const sp = FISH_SPECIES.find((s) => s.id === id) || FISH_SPECIES[0];
    if (!sp) return;
    const meta = RARITY_META[sp.rarity] || RARITY_META.common;
    if (this.el.admFishImg) {
      this.el.admFishImg.src = this.sprites.fish[sp.id]?.previewUrl || '';
      this.el.admFishImg.alt = sp.name;
    }
    if (this.el.admFishName) this.el.admFishName.textContent = sp.name.toUpperCase();
    if (this.el.admFishRarity) {
      this.el.admFishRarity.textContent = meta.label;
      this.el.admFishRarity.style.color = meta.color;
    }
    if (this.el.admFishStats) {
      this.el.admFishStats.textContent = `${sp.value} G · ${sp.minWeight}-${sp.maxWeight} lb · ${sp.zone}`;
    }
    if (this.el.admFishMaps) {
      const mNames = (sp.maps || ['harbor']).map((mid) => getMapById(mid).name).join(', ');
      this.el.admFishMaps.textContent = `Maps: ${mNames}`;
    }
  }

  setAdminStatus(msg, isWarn = false) {
    if (!this.el.adminStatus) return;
    this.el.adminStatus.textContent = msg;
    this.el.adminStatus.classList.toggle('is-warn', Boolean(isWarn));
  }

  getTimePhaseLabel(t) {
    if (t >= 0.14 && t < 0.24) return 'DAWN';
    if (t >= 0.24 && t < 0.68) return 'DAY';
    if (t >= 0.68 && t < 0.82) return 'SUNSET';
    return 'NIGHT';
  }

  refreshAdminLabels() {
    const map = this.getCurrentMap();
    const phase = this.getTimePhaseLabel(this.timeOfDay);
    const totalMin = Math.floor(this.timeOfDay * 24 * 60);
    const hh = String(Math.floor(totalMin / 60) % 24).padStart(2, '0');
    const mm = String(totalMin % 60).padStart(2, '0');

    if (this.el.admTelSwatch) this.el.admTelSwatch.style.background = map.accent || '#38bdf8';
    if (this.el.admTelMap) this.el.admTelMap.textContent = map.name.toUpperCase();
    if (this.el.admTelState) this.el.admTelState.textContent = this.state;
    if (this.el.admTelTime) this.el.admTelTime.textContent = `${hh}:${mm} ${phase}`;
    if (this.el.admTelGold) this.el.admTelGold.textContent = String(this.save.coins);
    if (this.el.admTelFish) this.el.admTelFish.textContent = String(this.fishes.length);

    if (this.el.admTodReadout) {
      this.el.admTodReadout.textContent = `${hh}:${mm} · ${phase}`;
    }
    if (this.el.admTodSlider) {
      this.el.admTodSlider.value = String(Math.round(this.timeOfDay * 100));
    }

    if (this.admMapButtons) {
      for (const [mid, btn] of Object.entries(this.admMapButtons)) {
        btn.classList.toggle('is-current', mid === map.id);
      }
    }

    if (this.el.admTodFreeze) {
      this.el.admTodFreeze.textContent = this.devClockFrozen ? 'CLOCK: PAUSED' : 'CLOCK: RUN';
      this.el.admTodFreeze.classList.toggle('is-on', this.devClockFrozen);
    }
    if (this.el.admNoSnap) {
      this.el.admNoSnap.textContent = this.devNoSnap ? 'NO SNAP: ON' : 'NO SNAP: OFF';
      this.el.admNoSnap.classList.toggle('is-on', this.devNoSnap);
    }
    this.updateAdminFishPreview();
  }

  adminAddGold(amount) {
    this.save.coins += amount;
    this.persist();
    this.updateHUD();
    sound.playBuy();
    this.setAdminStatus(`+${amount} G`);
  }

  adminUnlockAllMaps() {
    this.save.unlockedMaps = MAPS.map((m) => m.id);
    this.persist();
    sound.playBuy();
    this.setAdminStatus('ALL 5 MAPS UNLOCKED');
  }

  adminMaxGear() {
    const maxed = {};
    for (const u of UPGRADES) maxed[u.id] = u.maxLevel || 5;
    this.save.upgrades = maxed;
    this.persist();
    this.updateReelSweetZoneUI();
    sound.playBuy();
    this.setAdminStatus(`ALL ${UPGRADES.length} GEAR LV 5`);
  }

  adminForceAmbush() {
    if (this.state !== 'REELING' || !this.activeFish) {
      this.setAdminStatus('HOOK A SMALL FISH FIRST');
      return null;
    }
    const prey = this.activeFish;
    // Prefer an existing eligible predator in the water, else spawn a bigger native species!
    let pred = this.fishes.find((f) => f !== prey && this.canFishEat(f, prey));
    if (!pred) {
      const candidates = this.getMapSpecies().filter((sp) => canPredatorEat(sp, prey.species));
      const chosen = candidates.length
        ? candidates[Math.floor(Math.random() * candidates.length)]
        : FISH_SPECIES.find((sp) => canPredatorEat(sp, prey.species));
      if (!chosen) {
        this.setAdminStatus('ALREADY APEX FISH!');
        return null;
      }
      pred = this.spawnFish(false, chosen);
      const offsetDir = prey.x < this.vw * 0.65 ? 1 : -1;
      pred.x = clamp(prey.x + offsetDir * 44, this.pierEndX + 18, this.vw - 12);
      pred.y = clamp(prey.y + rand(-10, 12), this.waterY + 10, this.getSeabedY(pred.x) - 8);
      pred.homeY = pred.y;
      pred.dir = prey.x >= pred.x ? 1 : -1;
      this.fishes.push(pred);
    }
    this.ambushCooldown = 0;
    this.startPredatorAmbush(pred);
    this.closeModals();
    return pred;
  }

  adminFillLog() {
    for (const sp of FISH_SPECIES) {
      if (!this.save.log[sp.id]) {
        this.save.log[sp.id] = { count: 1, bestKg: Number(sp.maxWeight.toFixed(2)) };
      }
    }
    this.persist();
    sound.playBuy();
    this.setAdminStatus(`LOG ${FISH_SPECIES.length}/${FISH_SPECIES.length}`);
  }

  adminResetSave() {
    this.save = defaultSave();
    this.persist();
    this.devAutoLand = false;
    this.selectMap('harbor', true);
    this.setAdminStatus('SAVE RESET');
  }

  adminSetTime(tod) {
    this.timeOfDay = tod;
    this.updateHUD();
    sound.playJig();
    this.setAdminStatus(`TIME ${this.el.time.textContent}`);
  }

  adminSpawnSpecies(speciesId) {
    const sp = getSpeciesById(speciesId);
    const f = this.spawnFish(false, sp);
    f.x = clamp(this.pierEndX + (this.vw - this.pierEndX) * 0.55, this.pierEndX + 24, this.vw - 18);
    this.fishes.push(f);
    sound.playJig();
    this.closeModals();
    this.spawnFloat(f.x, this.waterY - 10, `SPAWNED ${sp.name.toUpperCase()}`, '#c084fc');
    return f;
  }

  adminTriggerBite(speciesId) {
    const sp = getSpeciesById(speciesId);
    const f = this.spawnFish(false, sp);
    const targetX = clamp(this.pierEndX + (this.vw - this.pierEndX) * 0.62, this.pierEndX + 36, this.vw - 20);
    const waterH = Math.max(40, this.vh - 18 - this.waterY);
    const targetY = clamp(this.waterY + 12 + ((sp.minDepth + sp.maxDepth) * 0.5) * (waterH - 16), this.waterY + 12, this.getSeabedY(targetX) - 8);
    f.x = targetX;
    f.y = targetY;
    f.homeY = targetY;
    f.dir = -1;
    f.ai = 'BITE';
    this.fishes.push(f);

    this.bobberX = targetX;
    this.bobberY = this.waterY;
    const mouth = this.getFishMouthPos(f);
    this.hookX = mouth.x;
    this.hookY = mouth.y;
    this.castTargetX = targetX;
    this.targetDepthY = targetY;
    this.activeFish = f;
    this.state = 'BITE';
    this.biteTimer = 2.6;
    this.closeModals();
    sound.playBite();
    this.spawnSplash(this.bobberX, this.waterY, 8);
    this.spawnRipple(this.bobberX, this.waterY);
    this.updateControlsUI();
    return f;
  }

  bindEvents() {
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 120));

    const startPrimary = (e) => {
      if (this.activeModal) return;
      if (e) {
        if (e.button !== undefined && e.button !== 0 && e.pointerType === 'mouse') return;
        e.preventDefault();
        if (this.activePointerId !== null && this.activePointerId !== e.pointerId) return;
        this.activePointerId = e.pointerId ?? 'mouse';
        if (e.currentTarget && e.currentTarget.setPointerCapture && e.pointerId !== undefined) {
          try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
        }
      }
      this.el.actionBtn.classList.add('is-pressed');
      sound.unlock();
      this.onPrimaryDown();
    };
    const endPrimary = (e) => {
      if (e && e.pointerId !== undefined && this.activePointerId !== null && e.pointerId !== this.activePointerId) return;
      this.activePointerId = null;
      this.el.actionBtn.classList.remove('is-pressed');
      this.onPrimaryUp();
    };

    this.canvas.addEventListener('pointerdown', startPrimary, { passive: false });
    this.el.actionBtn.addEventListener('pointerdown', startPrimary, { passive: false });
    this.canvas.addEventListener('lostpointercapture', endPrimary);
    this.el.actionBtn.addEventListener('lostpointercapture', endPrimary);
    window.addEventListener('pointerup', endPrimary);
    window.addEventListener('pointercancel', endPrimary);
    window.addEventListener('blur', endPrimary);

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
      } else if (e.code === 'Backquote' || e.code === 'F9') {
        e.preventDefault();
        this.activeModal === 'admin' ? this.closeModals() : this.openModal('admin');
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
    this.el.btnAdmin.addEventListener('click', () => {
      sound.unlock(); sound.playJig(); this.openModal('admin');
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
    this.el.btnAdminClose.addEventListener('click', () => { sound.playJig(); this.closeModals(); });

    for (const backdrop of [this.el.mapsModal, this.el.shopModal, this.el.logModal, this.el.adminModal]) {
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
      this.retrieving = true;
      this.updateControlsUI();
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
    if (this.retrieving) {
      this.retrieving = false;
      if (this.state === 'WAITING') {
        this.targetDepthY = clamp(this.hookY, this.waterY + 8, this.getSeabedY(this.hookX) - 6);
        this.updateControlsUI();
      }
    }
    this.reelHold = false;
  }

  launchCast() {
    const stats = this.getStats();
    const minCastX = this.pierEndX + 24;
    const maxCastX = this.pierEndX + (this.vw - this.pierEndX - 18) * stats.maxCastFrac;
    this.castTargetX = clamp(lerp(minCastX, maxCastX, this.chargePower), minCastX, this.vw - 14);

    const bedY = this.getSeabedY(this.castTargetX) - 6;
    const availH = Math.max(36, bedY - (this.waterY + 8));
    const depthFrac = clamp(0.16 + Math.pow(this.chargePower, 0.80) * stats.maxDepthFrac, 0.16, 0.98);
    this.targetDepthY = clamp(this.waterY + 8 + depthFrac * availH, this.waterY + 10, bedY);

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

  canFishEat(predator, prey) {
    if (!predator || !prey || predator === prey) return false;
    if (!canPredatorEat(predator.species, prey.species)) return false;
    const pSpr = this.sprites.fish[predator.species.id];
    const qSpr = this.sprites.fish[prey.species.id];
    const visuallyBigger = !pSpr || !qSpr || pSpr.w >= qSpr.w + 2 || predator.species.maxWeight >= prey.species.maxWeight * 3.0;
    return visuallyBigger;
  }

  startPredatorAmbush(predator) {
    if (!predator || !this.activeFish || predator === this.activeFish) return;
    predator.ai = 'AMBUSH';
    predator.ambushTimer = 3.6;
    predator.dir = this.activeFish.x >= predator.x ? 1 : -1;
    sound.playAmbushAlert();
    this.spawnFloat(predator.x, Math.max(this.waterY + 10, predator.y - 10), 'AMBUSH!', '#fb7185');
  }

  triggerFishSwallow(predator, prey) {
    if (!predator || !prey || predator === prey) return;
    const preySp = prey.species;
    const predSp = predator.species;

    // Record eaten prey for bonus value & catch card callout!
    this.eatenPrey.push({
      id: preySp.id,
      name: preySp.name,
      value: Number.isFinite(preySp.value) ? preySp.value : 15,
    });
    this.swallowCount += 1;
    this.ambushCooldown = 1.05;

    // Juicy chomp VFX right at the swallow location!
    const cx = prey.x;
    const cy = prey.y;
    for (let i = 0; i < 14; i++) {
      this.particles.push({
        x: cx + rand(-4, 4),
        y: cy + rand(-3, 3),
        vx: rand(-34, 34),
        vy: rand(-32, 18),
        g: 42,
        life: rand(0.28, 0.55),
        size: Math.random() > 0.45 ? 2 : 1,
        color: i % 3 === 0 ? '#fb7185' : i % 3 === 1 ? '#fde047' : '#e0f7ff',
      });
    }
    for (let i = 0; i < 6; i++) {
      this.bubbles.push({
        x: cx + rand(-5, 5),
        y: cy + rand(-3, 3),
        vy: rand(16, 28),
        wobble: rand(0, Math.PI * 2),
        hot: false,
      });
    }
    this.spawnSplash(this.bobberX, this.waterY, 10);
    this.spawnRipple(this.bobberX, this.waterY);
    this.shakeTime = 0.24;
    this.shakeMag = 2.6;
    sound.playChomp();

    // Remove the eaten smaller fish & replace ambient ecosystem from edge
    this.fishes = this.fishes.filter((f) => f !== prey);
    this.fishes.push(this.spawnFish(true));

    // Seamlessly transfer the hook onto the bigger predator at its exact current position!
    predator.ai = 'HOOKED';
    predator.vx = 0;
    predator.vy = 0;
    this.activeFish = predator;
    this.mouthDirSmooth = predator.dir;
    const landX = this.pierEndX + 10;
    const landY = this.waterY + 6;
    const newDist = Math.hypot(predator.x - landX, predator.y - landY);
    this.reelTotalDist = Math.max(28, newDist * 1.15);
    // Keep tension safe & give player a fair calm window right after the swallow!
    this.tension = Math.min(this.tension, 0.34);
    this.fishFightState = 'CALM';
    this.fishThrashing = false;
    this.fishStamina = clamp(predSp.stamina || 1.0, 0.7, 2.0);
    this.fishFightTimer = rand(0.95, 1.35);

    this.swallowBannerTimer = 2.4;
    this.swallowBannerText = `${predSp.name.toUpperCase()} ATE ${preySp.name.toUpperCase()}! REEL IT IN!`;
    this.spawnFloat(cx, Math.max(this.waterY - 8, cy - 12), `CHOMP! ${predSp.name.toUpperCase()}!`, '#fde047');
    this.updateControlsUI();
  }

  hookFish() {
    if (!this.activeFish) return;
    const fish = this.activeFish;
    this.state = 'REELING';
    fish.ai = 'HOOKED';
    // Zero-jump initialization from the fish's exact current coordinates!
    fish.vx = 0;
    fish.vy = 0;
    const landX = this.pierEndX + 10;
    const landY = this.waterY + 6;
    this.reelTotalDist = Math.max(24, Math.hypot(fish.x - landX, fish.y - landY));
    this.tension = 0.22;
    this.progress = 0;
    this.reelHold = true;
    this.retrieving = false;
    this.devAutoLand = false;
    this.eatenPrey = [];
    this.swallowCount = 0;
    this.ambushCooldown = 0.45;
    this.swallowBannerTimer = 0;
    this.swallowBannerText = '';
    this.mouthDirSmooth = fish.dir;
    this.fishThrashing = false;
    this.fishFightState = 'CALM';
    this.fishStamina = clamp(fish.species.stamina || 1.0, 0.7, 2.0);
    this.inSweetSpot = false;
    this.fishFightTimer = rand(0.85, 1.35);
    this.shakeTime = 0.14;
    this.shakeMag = 1.6;
    this.updateReelSweetZoneUI();
    sound.playHookSet();
    this.spawnSplash(this.bobberX, this.waterY, 8);
    this.spawnRipple(this.bobberX, this.waterY);
    this.spawnFloat(this.bobberX, this.waterY - 12, 'HOOKED!', '#fef08a');
    this.updateControlsUI();
  }

  resetToIdle(toastText) {
    if (this.activeFish) {
      this.activeFish.ai = 'FLEE';
      this.activeFish.fleeTimer = 2.0;
      this.activeFish.dir = 1;
      this.activeFish.vx = 0;
      this.activeFish.vy = 0;
      this.activeFish = null;
    }
    for (const f of this.fishes) {
      if (f.ai === 'AMBUSH') {
        f.ai = 'CRUISE';
        f.homeY = clamp(f.y, this.waterY + 8, this.getSeabedY(f.x) - 8);
      }
    }
    this.state = 'IDLE';
    this.reelHold = false;
    this.chargeHold = false;
    this.retrieving = false;
    this.devAutoLand = false;
    this.eatenPrey = [];
    this.swallowCount = 0;
    this.ambushCooldown = 0;
    this.swallowBannerTimer = 0;
    this.swallowBannerText = '';
    this.tension = 0;
    this.progress = 0;
    this.fishThrashing = false;
    this.fishFightState = 'CALM';
    this.inSweetSpot = false;
    if (toastText) {
      this.spawnFloat(this.bobberX, this.waterY - 10, toastText, '#f87171');
    }
    this.updateControlsUI();
  }

  startLanding() {
    this.state = 'LANDING';
    this.reelHold = false;
    this.devAutoLand = false;
    this.landingT = 0;
    this.landingStartX = this.activeFish.x;
    this.landingStartY = this.activeFish.y;
    this.landingStartDir = this.activeFish.dir;
    for (const f of this.fishes) {
      if (f.ai === 'AMBUSH') {
        f.ai = 'CRUISE';
        f.homeY = clamp(f.y, this.waterY + 8, this.getSeabedY(f.x) - 8);
      }
    }
    this.spawnSplash(this.activeFish.x, this.waterY, 12);
    this.spawnRipple(this.activeFish.x, this.waterY);
    sound.playSplash(true);
    this.updateControlsUI();
  }

  completeCatch() {
    const stats = this.getStats();
    const sp = this.activeFish.species;
    const eaten = this.eatenPrey.slice();
    const minW = Number.isFinite(sp.minWeight) ? sp.minWeight : 0.2;
    const maxW = Number.isFinite(sp.maxWeight) ? sp.maxWeight : Math.max(minW + 0.5, 1.0);
    // Trophy Creel biases weight higher, and eating smaller fish makes the predator even heavier!
    const rawWeight = lerp(minW, maxW, Math.pow(Math.random(), stats.weightExp));
    const bellyMult = 1 + eaten.length * 0.06;
    const weight = Number(Math.min(maxW * 1.15, rawWeight * bellyMult).toFixed(2));
    const sizeRatio = clamp((weight - minW) / Math.max(0.01, maxW - minW), 0, 1);
    const sizeBonus = 0.85 + sizeRatio * 0.45;
    const baseVal = Number.isFinite(sp.value) ? sp.value : 15;
    const swallowBonus = eaten.reduce(
      (sum, p) => sum + Math.max(4, Math.round(p.value * stats.swallowBonusFrac * stats.coinMult)),
      0
    );
    const value = Math.max(5, Math.round(baseVal * sizeBonus * stats.coinMult)) + swallowBonus;

    const prev = this.save.log[sp.id];
    const isNew = !prev;
    const prevBest = prev && Number.isFinite(prev.bestKg) ? prev.bestKg : 0;
    const isRecord = !prev || weight > prevBest;

    this.save.log[sp.id] = {
      count: (prev && Number.isFinite(prev.count) ? prev.count : 0) + 1,
      bestKg: isRecord ? weight : prevBest,
    };
    this.save.coins = (Number.isFinite(this.save.coins) ? this.save.coins : 0) + value;
    this.save.totalCaught = (Number.isFinite(this.save.totalCaught) ? this.save.totalCaught : 0) + 1;
    this.persist();

    this.fishes = this.fishes.filter((f) => f !== this.activeFish);
    this.activeFish = null;
    this.fishes.push(this.spawnFish(true));
    this.eatenPrey = [];
    this.swallowCount = 0;
    this.swallowBannerTimer = 0;

    this.lastCatchInfo = { species: sp, weight, value, isNew, isRecord, eaten, swallowBonus };
    this.catchTime = 0;
    this.state = 'CAUGHT';
    this.activeModal = 'catch';
    sound.playCatch(sp.rarity);

    const rMeta = RARITY_META[sp.rarity] || RARITY_META.common;
    this.el.catchRarity.textContent = rMeta.label;
    this.el.catchRarity.style.background = rMeta.bg;
    this.el.catchRarity.style.color = rMeta.color;
    this.el.catchTitle.textContent = sp.name.toUpperCase();
    if (this.el.catchSwallowBanner) {
      if (eaten.length > 0) {
        const preyChain = eaten.map((p) => p.name.toUpperCase()).join(' \u2192 ');
        this.el.catchSwallowBanner.textContent = `SWALLOWED ${preyChain} (+${swallowBonus} G BONUS!)`;
        this.el.catchSwallowBanner.classList.remove('hidden');
      } else {
        this.el.catchSwallowBanner.classList.add('hidden');
      }
    }
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
    this.catchTime = 0;
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
    } else if (which === 'admin') {
      this.refreshAdminLabels();
      this.el.adminModal.classList.remove('hidden');
    }
  }

  closeModals() {
    this.el.mapsModal.classList.add('hidden');
    this.el.shopModal.classList.add('hidden');
    this.el.logModal.classList.add('hidden');
    this.el.adminModal.classList.add('hidden');
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

      const btnLabel = isCurrent ? 'HERE' : unlocked ? 'TRAVEL' : `UNLOCK ${m.cost} G`;
      const btnClass = isCurrent ? 'pixel-btn' : unlocked ? 'pixel-btn accent-cyan' : 'pixel-btn accent-gold';

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
          <div class="shop-title"><span class="shop-swatch" style="background:${u.color || '#38bdf8'}"></span>${u.name} <span class="lv-tag">LV ${lv}/${u.maxLevel}</span></div>
          <div class="shop-desc">${u.desc}</div>
          <div class="shop-perk">GEAR: ${u.tiers[lv - 1]}${maxed ? ' (MAX)' : ' \u2192 ' + u.tiers[lv]}</div>
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
          this.updateReelSweetZoneUI();
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
      const rMeta = RARITY_META[sp.rarity] || RARITY_META.common;
      const mapCodes = (sp.maps || ['harbor']).map((id) => getMapById(id).shortTag).join(' \u00b7 ');
      const bestKg = entry && Number.isFinite(entry.bestKg) ? entry.bestKg : sp.minWeight;
      const card = document.createElement('div');
      card.className = `log-card ${entry ? 'discovered' : 'locked'}`;
      card.innerHTML = `
        <div class="log-rarity" style="color:${entry ? rMeta.color : '#64748b'}">${rMeta.label}</div>
        <div class="log-img-wrap">
          <img src="${this.spriteUrls[sp.id]}" alt="${entry ? sp.name : 'Undiscovered fish'}" />
        </div>
        <div class="log-name">${entry ? sp.name : '???'}</div>
        <div class="log-stats">${entry ? `${entry.count}x &bull; ${bestKg.toFixed(2)}kg` : sp.zone.toUpperCase()}</div>
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
    btn.classList.remove('is-bite', 'is-reel', 'is-sweet', 'is-brace', 'is-warn');
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
      btn.textContent = this.retrieving ? 'REELING LURE IN...' : 'HOLD TO REEL IN';
      if (this.retrieving) btn.classList.add('is-reel');
      hint.textContent = this.retrieving ? 'RELEASE TO PAUSE LURE AT THIS DEPTH' : 'WAIT FOR BITE — OR HOLD TO REEL UP MANUALLY';
    } else if (this.state === 'BITE') {
      btn.textContent = 'HOOK IT NOW!';
      btn.classList.add('is-bite');
      hint.textContent = 'BITE! TAP FAST!';
    } else if (this.state === 'REELING') {
      const stats = this.getStats();
      const multStr = stats.sweetMult.toFixed(2).replace(/0$/, '');
      if (this.fishFightState === 'THRASH') {
        btn.textContent = 'EASE OFF! (FIGHTING)';
        btn.classList.add('is-warn');
        hint.textContent = 'RELEASE OR TAP LIGHTLY WHILE THRASHING';
      } else if (this.fishFightState === 'WARNING') {
        btn.textContent = 'BRACE! ABOUT TO FIGHT';
        btn.classList.add('is-brace');
        hint.textContent = 'FISH FLARING — GET READY TO EASE OFF!';
      } else if (this.inSweetSpot) {
        btn.textContent = `SWEET SPOT! REELING x${multStr}`;
        btn.classList.add('is-sweet');
        hint.textContent = 'KEEP LINE IN THE GREEN ZONE FOR FAST PULL!';
      } else {
        btn.textContent = 'HOLD TO REEL IN!';
        btn.classList.add('is-reel');
        hint.textContent = 'HOLD TO BUILD GREEN SWEET-SPOT PULL';
      }
      if (this.swallowBannerTimer > 0 && this.swallowBannerText) {
        hint.textContent = this.swallowBannerText;
      }
    } else if (this.state === 'LANDING') {
      btn.textContent = 'LANDING!';
      hint.textContent = 'NICE CATCH!';
    } else if (this.state === 'CAUGHT') {
      btn.textContent = 'CAUGHT!';
      hint.textContent = 'FISH ADDED TO LOG';
    }
  }

  getAnglerPose() {
    if (this.state === 'CHARGING') return this.chargePower > 0.55 ? 'charge1' : 'charge0';
    if (this.state === 'CASTING') return this.castFollowThrough > 0 ? 'cast0' : 'cast1';
    if (this.state === 'WAITING') return Math.floor(this.time * 1.6) % 2 === 0 ? 'wait0' : 'wait1';
    if (this.state === 'BITE') return Math.floor(this.time * 12) % 2 === 0 ? 'bite0' : 'bite1';
    if (this.state === 'REELING') {
      if ((this.fishThrashing && this.tension > 0.50) || this.tension > 0.78) return 'reelHard';
      if (this.reelHold || this.devAutoLand) {
        const crankHz = this.inSweetSpot ? 13 : 9.5;
        const frames = ['reel0', 'reel1', 'reel2', 'reel3'];
        return frames[Math.floor(this.time * crankHz) % 4];
      }
      return this.fishFightState === 'WARNING' ? 'bite0' : 'wait0';
    }
    if (this.state === 'LANDING') return this.landingT > 0.6 ? 'celebrate0' : 'reelHard';
    if (this.state === 'CAUGHT') return Math.floor(this.time * 5) % 2 === 0 ? 'celebrate0' : 'celebrate1';
    const tick = Math.floor(this.time * 2.2) % 10;
    if (tick === 7) return 'idleBlink';
    return tick % 2 === 0 ? 'idle0' : 'idle1';
  }

  getTargetRodAngle() {
    if (this.state === 'CHARGING') return lerp(-0.85, -2.42, this.chargePower);
    if (this.state === 'CASTING') return lerp(-2.2, -0.35, Math.min(1, this.castT * 2.2));
    if (this.state === 'WAITING' && this.retrieving) return -0.84;
    if (this.state === 'BITE') return -0.34 + Math.sin(this.time * 24) * 0.06;
    if (this.state === 'REELING') return (this.reelHold || this.devAutoLand) ? -1.04 : -0.60;
    if (this.state === 'LANDING') return lerp(-1.04, -1.92, smoothstep(clamp(this.landingT, 0, 1)));
    if (this.state === 'CAUGHT') return -1.92;
    return -0.62;
  }

  getRodTipPos() {
    const rig = computeAnglerRig(this);
    return {
      handX: rig.rodHandX,
      handY: rig.rodHandY,
      ctrlX: rig.ctrlX,
      ctrlY: rig.ctrlY,
      tipX: rig.tipX,
      tipY: rig.tipY,
    };
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
    if (!this.devClockFrozen) {
      this.timeOfDay = (this.timeOfDay + dt / 240) % 1;
    }
    if (this.castFollowThrough > 0) this.castFollowThrough = Math.max(0, this.castFollowThrough - dt);
    if (this.shakeTime > 0) this.shakeTime = Math.max(0, this.shakeTime - dt);

    // Smooth rod angle interpolation (no abrupt snaps across states!)
    this.rodAngle = lerp(this.rodAngle, this.getTargetRodAngle(), 1 - Math.exp(-11 * dt));

    // Smooth 60fps articulated human body kinematics (zero jumping!)
    let targetLean = 0;
    let targetSquat = 0;
    let targetStance = 0.12;
    if (this.state === 'CHARGING') {
      targetLean = -this.chargePower * 3.8;
      targetSquat = this.chargePower * 1.1;
      targetStance = 0.55;
    } else if (this.state === 'CASTING') {
      targetLean = 2.6;
      targetSquat = 0.7;
      targetStance = 0.6;
    } else if (this.state === 'WAITING') {
      targetLean = this.retrieving ? 0.5 : 1.4;
      targetSquat = this.retrieving ? 0.85 : 0.45;
      targetStance = this.retrieving ? 0.65 : 0.45;
      if (this.retrieving) this.crankAngle += 13.5 * dt;
    } else if (this.state === 'BITE') {
      targetLean = -1.2;
      targetSquat = 1.4;
      targetStance = 0.85;
    } else if (this.state === 'REELING') {
      targetStance = 1.0;
      if (this.fishThrashing || this.tension > 0.74) {
        targetLean = -3.4 - this.tension * 1.5;
        targetSquat = 2.0;
      } else {
        targetLean = -0.7 - this.tension * 2.1;
        targetSquat = 1.25;
        if (this.reelHold || this.devAutoLand) {
          this.crankAngle += (this.inSweetSpot ? 17.5 : 12.5) * dt;
        }
      }
    } else if (this.state === 'LANDING' || this.state === 'CAUGHT') {
      targetLean = 0.5;
      targetSquat = 0;
      targetStance = 0.3;
    }
    const kinEase = 1 - Math.exp(-10 * dt);
    this.animLean = lerp(this.animLean, targetLean, kinEase);
    this.animSquat = lerp(this.animSquat, targetSquat, kinEase);
    this.animStance = lerp(this.animStance, targetStance, kinEase);

    const map = this.getCurrentMap();

    for (const c of this.clouds) {
      c.x += c.speed * dt;
      if (c.x > this.vw + 24) c.x = -36;
    }

    for (const b of this.birds) {
      b.x -= b.speed * dt;
      if (b.x < -14) {
        b.x = this.vw + rand(12, 50);
        b.y = rand(10, Math.max(18, this.waterY - 20));
      }
    }

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
      } else if (map.weather === 'starlight') {
        wp.x += Math.sin(this.time * 2.2 + wp.y * 0.15) * 4 * dt;
        if (wp.y < -4) {
          wp.x = rand(0, this.vw);
          wp.y = this.waterY - rand(1, 5);
        }
      }
    }

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

    // Animated nocturnal shooting stars / astral meteors
    const isNightish = this.timeOfDay < 0.22 || this.timeOfDay > 0.76;
    const meteorRate = map.id === 'sanctuary' ? 0.52 : map.id === 'fjord' ? 0.24 : 0.28;
    if (isNightish && this.shootingStars.length < 3 && Math.random() < dt * meteorRate) {
      const meteorColors =
        map.id === 'sanctuary' ? ['#f9a8d4', '#5eead4', '#fef08a'] :
        map.id === 'abyss' ? ['#fdba74', '#fef08a'] :
        map.id === 'fjord' ? ['#a7f3d0', '#bae6fd'] :
        ['#fef9c3', '#e0f2fe'];
      this.shootingStars.push({
        x: rand(this.vw * 0.22, this.vw * 0.94),
        y: rand(4, Math.max(10, this.waterY * 0.42)),
        vx: -rand(58, 92),
        vy: rand(18, 34),
        life: rand(0.45, 0.78),
        maxLife: 0.78,
        color: meteorColors[Math.floor(Math.random() * meteorColors.length)],
      });
    }
    for (let i = this.shootingStars.length - 1; i >= 0; i--) {
      const st = this.shootingStars[i];
      st.x += st.vx * dt;
      st.y += st.vy * dt;
      st.life -= dt;
      if (st.life <= 0 || st.y >= this.waterY - 4 || st.x < -16) {
        this.shootingStars.splice(i, 1);
      }
    }

    // Fishing state machine
    const statsNow = this.getStats();
    if (this.ambushCooldown > 0) this.ambushCooldown = Math.max(0, this.ambushCooldown - dt);
    if (this.swallowBannerTimer > 0) {
      this.swallowBannerTimer = Math.max(0, this.swallowBannerTimer - dt);
      if (this.swallowBannerTimer === 0 && this.state === 'REELING') this.updateControlsUI();
    }

    if (this.state === 'CHARGING') {
      this.chargePower += this.chargeDir * dt * statsNow.chargeRate;
      if (this.chargePower >= 1) { this.chargePower = 1; this.chargeDir = -1; }
      if (this.chargePower <= 0.08) { this.chargePower = 0.08; this.chargeDir = 1; }
      this.rodFlex = lerp(this.rodFlex, 0.14 * this.chargePower, 1 - Math.exp(-8 * dt));
    } else if (this.state === 'CASTING') {
      this.castT += dt * 1.65;
      const t = clamp(this.castT, 0, 1);
      const arc = Math.sin(t * Math.PI) * (24 + this.chargePower * 22);
      this.bobberX = lerp(this.castStartX, this.castTargetX, t);
      this.bobberY = lerp(this.castStartY, this.waterY, t) - arc;
      this.hookX = this.bobberX;
      this.hookY = this.bobberY + 2;
      this.rodFlex = lerp(this.rodFlex, 0.06, 1 - Math.exp(-8 * dt));

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
      this.bobDipImpulse *= Math.exp(-9 * dt);
      if (this.retrieving) {
        // Player manually cranks the lure upward & back toward the pier (ZERO instant teleport!)
        const retrieveSpd = 42 + (this.save.upgrades.rod - 1) * 8 + statsNow.retrieveBonus;
        const pierEdgeX = this.pierEndX + 10;
        const dxPier = pierEdgeX - this.bobberX;
        const stepX = Math.sign(dxPier) * Math.min(Math.abs(dxPier), retrieveSpd * 0.92 * dt);
        this.bobberX += stepX;
        this.bobberY = this.waterY + 1.2 + Math.sin(this.time * 12) * 0.6 + this.bobDipImpulse;

        // Hook rises smoothly up through the water while trailing slightly behind the bobber
        const targetRiseY = this.waterY + 3;
        const dyUp = targetRiseY - this.hookY;
        const stepY = Math.sign(dyUp) * Math.min(Math.abs(dyUp), retrieveSpd * 0.85 * dt);
        this.hookY += stepY;
        this.hookX = lerp(this.hookX, this.bobberX + 3, 1 - Math.exp(-6 * dt));
        this.targetDepthY = Math.max(this.waterY + 6, this.hookY);
        this.rodFlex = lerp(this.rodFlex, 0.14, 1 - Math.exp(-8 * dt));

        this.reelTickAccum += dt;
        if (this.reelTickAccum > 0.14) {
          this.reelTickAccum = 0;
          sound.playReelTick(0.18);
        }
        if (Math.random() < dt * 7) this.spawnRipple(this.bobberX, this.waterY);

        // Only finish retrieving once the player actually reels the lure all the way back to the pier surface!
        if (Math.abs(this.bobberX - pierEdgeX) <= 3 && this.hookY <= this.waterY + 5.5) {
          this.retrieving = false;
          this.spawnSplash(this.bobberX, this.waterY, 5);
          sound.playSplash(false);
          this.resetToIdle('LURE REELED IN');
        }
      } else {
        this.bobberY = this.waterY + Math.sin(this.time * 4.2) * 1.1 + this.bobDipImpulse;
        this.hookX = lerp(this.hookX, this.bobberX + Math.sin(this.time * 2.1) * 1.5, 1 - Math.exp(-4 * dt));
        this.hookY = lerp(this.hookY, Math.min(this.targetDepthY, this.getSeabedY(this.hookX) - 6), 1 - Math.exp(-statsNow.sinkRate * dt));
        this.rodFlex = lerp(this.rodFlex, 0.04, 1 - Math.exp(-6 * dt));
      }
    } else if (this.state === 'BITE') {
      this.biteTimer -= dt;
      this.bobberY = lerp(this.bobberY, this.waterY + 2.4 + Math.sin(this.time * 26) * 1.4, 1 - Math.exp(-14 * dt));
      this.rodFlex = lerp(this.rodFlex, 0.45, 1 - Math.exp(-10 * dt));
      if (this.activeFish) {
        // Gentle tug right on the hook without drifting or snapping!
        this.activeFish.x += Math.sin(this.time * 22) * 6 * dt;
        this.activeFish.y = clamp(this.activeFish.y + Math.cos(this.time * 18) * 4 * dt, this.waterY + 6, this.getSeabedY(this.activeFish.x) - 6);
        const mouth = this.getFishMouthPos(this.activeFish);
        this.hookX = lerp(this.hookX, mouth.x, 1 - Math.exp(-18 * dt));
        this.hookY = lerp(this.hookY, mouth.y, 1 - Math.exp(-18 * dt));
      }
      if (Math.random() < dt * 8) this.spawnRipple(this.bobberX, this.waterY);
      if (this.biteTimer <= 0) {
        sound.playSnap();
        this.resetToIdle('GOT AWAY!');
      }
    } else if (this.state === 'REELING') {
      this.updateReeling(dt);
    } else if (this.state === 'LANDING') {
      this.landingT += dt * 1.05; // smooth ~0.95s physical heave & hand-catch (never snaps!)
      const t = clamp(this.landingT, 0, 1);
      const rig = computeAnglerRig(this);
      let fx, fy;
      if (t < 0.55) {
        // Stage 1: Smooth arc straight out of water into the angler's waiting hand!
        const p = smoothstep(t / 0.55);
        const liftArc = Math.sin(p * Math.PI) * 14;
        fx = lerp(this.landingStartX, rig.gripX, p);
        fy = lerp(this.landingStartY, rig.gripY, p) - liftArc;
      } else {
        // Stage 2: Fish is gripped directly in the angler's hand as they lift it proudly overhead (0.00px jump into CAUGHT!)
        fx = rig.gripX;
        fy = rig.gripY;
      }
      if (this.activeFish) {
        this.activeFish.x = fx;
        this.activeFish.y = fy;
        this.activeFish.dir = t > 0.52 ? 1 : this.landingStartDir;
      }
      this.hookX = fx;
      this.hookY = fy;
      this.rodFlex = lerp(this.rodFlex, 0.24 * (1 - t), 1 - Math.exp(-9 * dt));

      // Trailing water droplets off the lifted fish
      if (t < 0.65 && Math.random() < dt * 22) {
        this.particles.push({
          x: fx + rand(-3, 3),
          y: fy + rand(0, 3),
          vx: rand(-10, 10),
          vy: rand(4, 18),
          g: 110,
          life: rand(0.2, 0.38),
          size: 1,
          color: '#bae6fd',
        });
      }
      if (t >= 1) this.completeCatch();
    } else if (this.state === 'CAUGHT') {
      this.catchTime += dt;
      this.rodFlex = lerp(this.rodFlex, 0, 1 - Math.exp(-6 * dt));
    } else {
      this.rodFlex = lerp(this.rodFlex, 0, 1 - Math.exp(-6 * dt));
    }

    this.updateFishAI(dt);

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
    const strength = fish.species.strength;
    const pulling = this.reelHold || this.devAutoLand;

    // 3-Stage Fair Telegraphed Fish Fight Cycle: CALM -> WARNING (0.45s) -> THRASH
    this.fishFightTimer -= dt;
    if (this.fishFightTimer <= 0) {
      if (this.devAutoLand) {
        this.fishFightState = 'CALM';
        this.fishThrashing = false;
        this.fishFightTimer = 2.0;
      } else if (this.fishFightState === 'CALM') {
        this.fishFightState = 'WARNING';
        this.fishThrashing = false;
        this.fishFightTimer = 0.45;
        sound.playNibble();
        this.updateControlsUI();
      } else if (this.fishFightState === 'WARNING') {
        this.fishFightState = 'THRASH';
        this.fishThrashing = true;
        // Fish tires progressively over the fight as stamina drains!
        const tireFactor = clamp(this.fishStamina, 0.45, 1.35);
        this.fishFightTimer = rand(0.55, 0.78 + strength * 0.22) * tireFactor;
        this.spawnSplash(this.bobberX, this.waterY, 6);
        this.updateControlsUI();
      } else {
        this.fishFightState = 'CALM';
        this.fishThrashing = false;
        this.fishStamina = Math.max(0.42, this.fishStamina - stats.staminaDrain);
        this.fishFightTimer = rand(0.95, 1.55 - Math.min(0.4, strength * 0.12));
        this.updateControlsUI();
      }
    }

    // Sweet-spot zone (widened by Precision Reel!) gives upgraded sweetMult reel power!
    const wasSweet = this.inSweetSpot;
    this.inSweetSpot = pulling && !this.fishThrashing && this.tension >= stats.sweetMin && this.tension <= stats.sweetMax;
    if (wasSweet !== this.inSweetSpot) this.updateControlsUI();

    const landX = this.pierEndX + 10;
    const landY = this.waterY + 6;
    const toX = landX - fish.x;
    const toY = landY - fish.y;
    const dist = Math.max(0.001, Math.hypot(toX, toY));
    const nx = toX / dist;
    const ny = toY / dist;

    let ax = 0;
    let ay = 0;

    if (pulling) {
      const sweetBoost = this.inSweetSpot ? stats.sweetMult : 1.0;
      const pullBase = ((165 + (this.save.upgrades.rod - 1) * 32) * sweetBoost) / (0.64 + strength * 0.26);
      const pullScale = this.devAutoLand ? 2.4 : (this.fishThrashing ? 0.30 : 1.0);
      ax += nx * pullBase * pullScale;
      ay += ny * pullBase * pullScale * (dist < 50 ? 1.25 : 0.92);

      // Gentle tension build when calm (hovers nicely inside Sweet Spot!), sharp rise when thrashing!
      const strain = this.fishThrashing
        ? (0.58 * (0.68 + strength * 0.32)) / stats.lineStrength
        : (0.20 * (0.72 + strength * 0.22)) / stats.lineStrength;
      if (this.devNoSnap || this.devAutoLand) {
        this.tension = clamp(lerp(this.tension, 0.54, 1 - Math.exp(-3 * dt)), 0, 0.72);
      } else {
        this.tension += strain * dt;
      }

      if (this.tension > 0.82) sound.playTensionWarn();
      this.reelTickAccum += dt;
      const tickGap = this.inSweetSpot ? 0.095 : 0.13;
      if (this.reelTickAccum > tickGap) {
        this.reelTickAccum = 0;
        sound.playReelTick(this.tension);
      }
    } else {
      // Responsive tension cooling when player eases up
      const cool = stats.tensionDecay * (this.fishThrashing ? 0.95 : 1.35);
      this.tension = Math.max(0, this.tension - cool * dt);
    }

    // Organic fish fight / swimming resistance
    if (this.fishThrashing) {
      const tireScale = clamp(this.fishStamina, 0.55, 1.2);
      const fightForce = (18 + strength * 13) * tireScale * (pulling ? 0.75 : 0.92);
      ax += fightForce;
      ay += Math.sin(this.time * 16 + fish.phase) * 30 + 5;
    } else if (this.fishFightState === 'WARNING') {
      // Brief fin flare & slight resistance right before dashing
      ay += Math.sin(this.time * 22 + fish.phase) * 16;
    } else if (!pulling) {
      ax += 2.5 + strength * 2.0;
      ay += Math.sin(this.time * 5 + fish.phase) * 9;
    } else {
      ay += Math.sin(this.time * 10 + fish.phase) * 12;
    }

    const drag = Math.exp(-4.4 * dt);
    fish.vx = (fish.vx + ax * dt) * drag;
    fish.vy = (fish.vy + ay * dt) * drag;

    const maxSpd = this.devAutoLand ? 95 : 62;
    const spd = Math.hypot(fish.vx, fish.vy);
    if (spd > maxSpd) {
      fish.vx = (fish.vx / spd) * maxSpd;
      fish.vy = (fish.vy / spd) * maxSpd;
    }

    fish.x = clamp(fish.x + fish.vx * dt, this.pierEndX + 7, this.vw - 10);
    const minY = this.waterY + 5;
    const maxY = Math.max(minY + 4, this.getSeabedY(fish.x) - 6);
    fish.y = clamp(fish.y + fish.vy * dt, minY, maxY);

    // Wide-hysteresis facing direction + smoothly interpolated hook mouth offset (ZERO snap on turn!)
    if (fish.vx > 12) fish.dir = 1;
    else if (fish.vx < -6) fish.dir = -1;
    this.mouthDirSmooth = lerp(this.mouthDirSmooth, fish.dir, 1 - Math.exp(-10 * dt));
    const fSpr = this.sprites.fish[fish.species.id];
    const halfW = fSpr ? fSpr.w * 0.36 : 6;
    this.hookX = fish.x + this.mouthDirSmooth * halfW;
    this.hookY = fish.y;
    const rod = this.getRodTipPos();
    const bobTargetX = clamp(lerp(rod.tipX, this.hookX, 0.76), this.pierEndX + 6, this.vw - 8);
    this.bobberX = lerp(this.bobberX, bobTargetX, 1 - Math.exp(-7 * dt));
    const bobDip = this.tension * 3.2 + (this.fishThrashing ? Math.sin(this.time * 24) * 1.2 : 0);
    this.bobberY = lerp(this.bobberY, this.waterY + bobDip, 1 - Math.exp(-12 * dt));

    const targetFlex = (pulling ? 0.32 : 0.12) + this.tension * 0.75;
    this.rodFlex = lerp(this.rodFlex, targetFlex, 1 - Math.exp(-9 * dt));

    if (spd > 14 && Math.random() < dt * 10) {
      this.bubbles.push({
        x: fish.x - fish.dir * 5 + rand(-2, 2),
        y: fish.y + rand(-2, 2),
        vy: rand(14, 24),
        wobble: rand(0, Math.PI * 2),
        hot: false,
      });
    }
    if (this.fishThrashing && Math.random() < dt * (fish.y < this.waterY + 20 ? 11 : 5)) {
      this.spawnSplash(this.bobberX, this.waterY, 3);
      this.spawnRipple(this.bobberX, this.waterY);
    }

    const newDist = Math.hypot(landX - fish.x, landY - fish.y);
    this.reelTotalDist = Math.max(this.reelTotalDist, newDist);
    this.progress = clamp(1 - (newDist - 9) / Math.max(14, this.reelTotalDist - 9), 0, 1);

    // Zero-lag meter & status tag updates
    const tensPct = Math.round(clamp(this.tension, 0, 1) * 100);
    const progPct = Math.round(clamp(this.progress, 0, 1) * 100);
    this.el.tensionFill.style.width = `${tensPct}%`;
    if (this.el.tensionNeedle) this.el.tensionNeedle.style.left = `${tensPct}%`;
    this.el.progressFill.style.width = `${progPct}%`;
    if (this.el.progressPct) this.el.progressPct.textContent = `${progPct}%`;
    this.el.tensionFill.classList.toggle('danger', this.tension > 0.80);
    this.el.tensionFill.classList.toggle('sweet', this.inSweetSpot);

    if (this.el.reelStatusTag) {
      const tag = this.el.reelStatusTag;
      tag.classList.remove('status-calm', 'status-sweet', 'status-warn', 'status-thrash');
      if (this.fishFightState === 'THRASH') {
        tag.textContent = 'THRASHING — EASE OFF!';
        tag.classList.add('status-thrash');
      } else if (this.fishFightState === 'WARNING') {
        tag.textContent = 'BRACE! FISH FLARING!';
        tag.classList.add('status-warn');
      } else if (this.inSweetSpot) {
        const multStr = stats.sweetMult.toFixed(2).replace(/0$/, '');
        tag.textContent = `SWEET SPOT! x${multStr} PULL`;
        tag.classList.add('status-sweet');
      } else {
        tag.textContent = 'CALM — HOLD TO REEL!';
        tag.classList.add('status-calm');
      }
    }

    if (!this.devNoSnap && this.tension >= 1) {
      sound.playSnap();
      this.shakeTime = 0.25;
      this.shakeMag = 3;
      this.resetToIdle('LINE SNAPPED!');
    } else if (newDist <= 10.5) {
      this.startLanding();
    }
  }

  updateFishAI(dt) {
    const stats = this.getStats();
    let engagedCount = this.fishes.filter((f) => f.ai === 'CURIOUS' || f.ai === 'NIBBLE' || f.ai === 'APPROACH').length;
    let ambusherCount = this.fishes.filter((f) => f.ai === 'AMBUSH').length;

    // Iterate over a shallow copy because a predator swallow removes the eaten smaller fish from this.fishes!
    const snapshot = this.fishes.slice();
    for (const f of snapshot) {
      if (!this.fishes.includes(f)) continue;
      if (f.ai === 'HOOKED' || f.ai === 'BITE') continue;

      if (f.ai === 'AMBUSH') {
        const prey = this.activeFish;
        if (this.state !== 'REELING' || !prey || prey === f || !this.canFishEat(f, prey)) {
          f.ai = 'CRUISE';
          f.homeY = clamp(f.y, this.waterY + 8, this.getSeabedY(f.x) - 8);
          continue;
        }
        f.ambushTimer = (f.ambushTimer ?? 3.2) - dt;
        const predMouth = this.getFishMouthPos(f);
        const dx = prey.x - predMouth.x;
        const dy = prey.y - predMouth.y;
        const dist = Math.hypot(dx, dy);
        if (Math.abs(prey.x - f.x) > 2) f.dir = prey.x >= f.x ? 1 : -1;

        const chaseSpd = Math.max(54, f.speed * 2.45);
        if (dist > 1) {
          f.x += (dx / dist) * chaseSpd * dt;
          f.y += (dy / dist) * chaseSpd * dt;
        }
        if (Math.random() < dt * 10) {
          this.bubbles.push({
            x: f.x - f.dir * 6 + rand(-2, 2),
            y: f.y + rand(-2, 2),
            vy: rand(14, 24),
            wobble: rand(0, Math.PI * 2),
            hot: false,
          });
        }

        const preySpr = this.sprites.fish[prey.species.id];
        const eatDist = Math.max(8, preySpr ? preySpr.w * 0.45 : 8);
        if (dist <= eatDist) {
          this.triggerFishSwallow(f, prey);
          ambusherCount = 0;
          continue;
        }
        if (f.ambushTimer <= 0 || dist > stats.ambushRadius * 1.9) {
          f.ai = 'CRUISE';
          f.homeY = clamp(f.y, this.waterY + 8, this.getSeabedY(f.x) - 8);
          ambusherCount = Math.max(0, ambusherCount - 1);
          continue;
        }
      } else if (f.ai === 'FLEE') {
        f.fleeTimer -= dt;
        f.x += f.dir * f.speed * 2.3 * dt;
        if (f.fleeTimer <= 0) f.ai = 'CRUISE';
      } else if (f.ai === 'CURIOUS') {
        if (this.state !== 'WAITING') { f.ai = 'CRUISE'; f.homeY = clamp(f.y, this.waterY + 8, this.getSeabedY(f.x) - 8); continue; }
        // Keep fish cleanly on one side of the lure while inspecting (NEVER crosses dx=0 -> zero flicker!)
        const side = f.inspectSide || (f.x <= this.hookX ? -1 : 1);
        f.inspectSide = side;
        f.dir = -side; // always looks straight AT the lure!
        const spr = this.sprites.fish[f.species.id];
        const standOff = (spr ? spr.w * 0.5 : 8) + 8;
        const goalX = clamp(this.hookX + side * standOff, this.pierEndX + 10, this.vw - 10);
        const goalY = clamp(this.hookY + Math.sin(this.time * 3.5 + f.phase) * 1.8, this.waterY + 8, this.getSeabedY(goalX) - 7);
        const dx = goalX - f.x;
        const dy = goalY - f.y;
        const dist = Math.hypot(dx, dy);
        // Smooth ease-in glide that slows down naturally as the fish eyes the lure
        const moveSpd = Math.min(f.speed * 1.25, dist * 3.2 + 4);
        if (dist > 1.5) {
          f.x += (dx / dist) * moveSpd * dt;
          f.y += (dy / dist) * moveSpd * dt;
        }
        f.inspectTimer = (f.inspectTimer ?? 0.55) - dt;
        if (dist < 4 && f.inspectTimer <= 0) {
          f.ai = 'NIBBLE';
          f.nibblesLeft = Math.random() < 0.55 ? 1 : 2;
          f.nibblePhase = 'PECK';
          f.nibbleTimer = 0.24;
        }
      } else if (f.ai === 'NIBBLE') {
        if (this.state !== 'WAITING') { f.ai = 'CRUISE'; f.homeY = clamp(f.y, this.waterY + 8, this.getSeabedY(f.x) - 8); continue; }
        const side = f.inspectSide || -1;
        f.dir = -side;
        const spr = this.sprites.fish[f.species.id];
        const mouthOffset = spr ? spr.w * 0.38 : 6;
        if (f.nibblePhase === 'PECK') {
          const targetX = this.hookX + side * (mouthOffset + 1.2);
          f.x = lerp(f.x, targetX, 1 - Math.exp(-12 * dt));
          f.y = lerp(f.y, this.hookY, 1 - Math.exp(-12 * dt));
          f.nibbleTimer -= dt;
          if (f.nibbleTimer <= 0) {
            // Soft realistic peck: bobber dips slightly, tiny ripple & nibble sound!
            this.bobDipImpulse = 2.6;
            this.spawnRipple(this.bobberX, this.waterY);
            sound.playNibble();
            f.nibblesLeft -= 1;
            if (f.nibblesLeft <= 0) {
              f.ai = 'APPROACH'; // Commit to full strike!
            } else {
              f.nibblePhase = 'BACKOFF';
              f.nibbleTimer = rand(0.32, 0.52);
            }
          }
        } else {
          // Natural pause & slight back-off between nibbles
          const backX = clamp(this.hookX + side * (mouthOffset + 9), this.pierEndX + 10, this.vw - 10);
          f.x = lerp(f.x, backX, 1 - Math.exp(-6 * dt));
          f.y = lerp(f.y, this.hookY + Math.sin(this.time * 4 + f.phase) * 1.5, 1 - Math.exp(-6 * dt));
          f.nibbleTimer -= dt;
          if (f.nibbleTimer <= 0) {
            f.nibblePhase = 'PECK';
            f.nibbleTimer = 0.22;
          }
        }
      } else if (f.ai === 'APPROACH') {
        if (this.state !== 'WAITING') { f.ai = 'CRUISE'; f.homeY = clamp(f.y, this.waterY + 8, this.getSeabedY(f.x) - 8); continue; }
        const mouth = this.getFishMouthPos(f);
        const dx = this.hookX - mouth.x;
        const dy = this.hookY - mouth.y;
        const dist = Math.hypot(dx, dy);
        if (Math.abs(dx) > 2) f.dir = dx >= 0 ? 1 : -1;
        if (dist > 2.8) {
          f.x += (dx / dist) * f.speed * 1.65 * dt;
          f.y += (dy / dist) * f.speed * 1.65 * dt;
        } else {
          f.ai = 'BITE';
          f.homeY = f.y;
          this.activeFish = f;
          this.state = 'BITE';
          this.biteTimer = clamp(1.55 - f.species.strength * 0.08 + stats.biteBonus, 1.0, 2.1);
          sound.playBite();
          this.spawnSplash(this.bobberX, this.waterY, 8);
          this.spawnRipple(this.bobberX, this.waterY);
          this.updateControlsUI();
          continue;
        }
      } else {
        f.turnTimer -= dt;
        f.x += f.dir * f.speed * dt;
        const cruiseTargetY = clamp(f.homeY + Math.sin(this.time * 2.2 + f.phase) * 2.4, this.waterY + 8, this.getSeabedY(f.x) - 8);
        f.y = lerp(f.y, cruiseTargetY, 1 - Math.exp(-2.8 * dt));

        const minX = this.pierEndX + 10;
        const maxX = this.vw - 10;
        if (f.x < minX) { f.x = minX; f.dir = 1; }
        if (f.x > maxX) { f.x = maxX; f.dir = -1; }
        if (f.turnTimer <= 0) {
          f.turnTimer = rand(3, 8);
          if (Math.random() < 0.35) f.dir *= -1;
        }

        if (this.state === 'WAITING' && engagedCount === 0 && Math.abs(this.hookY - this.waterY) > 7) {
          const dist = Math.hypot(this.hookX - f.x, this.hookY - f.y);
          if (dist < stats.attractRadius && Math.random() < dt * 1.55 * stats.lureLuck) {
            f.ai = 'CURIOUS';
            f.inspectSide = f.x <= this.hookX ? -1 : 1;
            f.inspectTimer = rand(0.35, 0.65);
            engagedCount = 1;
          }
        } else if (
          this.state === 'REELING' &&
          this.activeFish &&
          ambusherCount === 0 &&
          this.ambushCooldown <= 0 &&
          this.swallowCount < stats.maxSwallows &&
          this.canFishEat(f, this.activeFish)
        ) {
          const prey = this.activeFish;
          const distToLand = Math.hypot(prey.x - (this.pierEndX + 10), prey.y - (this.waterY + 6));
          const distToPrey = Math.hypot(prey.x - f.x, prey.y - f.y);
          if (distToLand > 18 && distToPrey < stats.ambushRadius && Math.random() < dt * stats.ambushRate) {
            this.startPredatorAmbush(f);
            ambusherCount = 1;
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
