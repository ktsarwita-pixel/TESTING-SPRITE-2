"""Grounded, realistic procedural SFX recipes for Pierline Fishing.

Built on bianbianzhu/procedural-sfx (sfxkit.py).
Design philosophy (anti-cartoon):
  - ZERO pure cartoon sine sweeps ('bloop', 'boing', 'pew').
  - Every sound uses the 3-layer acoustic model:
      Attack (HP/BP filtered transient noise)
    + Body   (band-shaped noise turbulence, micro-impulses, or inharmonic modal partials)
    + Tail   (air/water decay or short acoustic reflections via echo())
  - Every repeated recipe draws fresh uniform()/noise() randomness so takes genuinely differ.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from sfxkit import *


def _impulses(d, count, t_lo, t_hi, lo_hz, hi_hz, tau_lo, tau_hi, amp_lo=0.35, amp_hi=1.0):
    """Scatter realistic micro-impulses (water droplets, grit, pebbles, spray) across duration d."""
    out = np.zeros(n_(d))
    for _ in range(count):
        t0 = uniform(t_lo, t_hi)
        dur = min(d - t0, max(0.025, tau_hi * 6.5))
        if dur <= 0.008:
            continue
        tau = uniform(tau_lo, tau_hi)
        f_lo = uniform(lo_hz * 0.8, lo_hz * 1.25)
        f_hi = max(f_lo * 1.35, uniform(hi_hz * 0.8, hi_hz * 1.2))
        grain = bp(noise(dur), f_lo, f_hi, o=2) * env_ad(dur, 0.0012, tau)
        # Subtle resonant cavity pop on a fraction of droplets (short tau, non-sweeping)
        if rand() < 0.45:
            tt = t_(dur)
            fp = uniform(f_lo * 1.1, min(f_hi * 0.9, 3200))
            grain = grain + np.sin(2 * np.pi * fp * tt + rand() * 6.28) * env_exp(dur, tau * 0.65) * 0.22
        s = n_(t0)
        m = min(len(out) - s, len(grain))
        if m > 0:
            out[s:s + m] += norm(grain[:m]) * uniform(amp_lo, amp_hi)
    return out


def _inharmonic(d, base_f, ratios, amps, taus, detune=0.0):
    """Sum of inharmonic modal partials with randomised phase (metals, wood, stone, bells)."""
    tt = t_(d)
    out = np.zeros(len(tt))
    for r, a, tau in zip(ratios, amps, taus):
        f = base_f * r * uniform(1.0 - detune, 1.0 + detune) if detune > 0 else base_f * r
        if f < SR * 0.46:
            out += a * np.sin(2 * np.pi * f * tt + rand() * 6.283) * env_exp(d, tau)
    return out


def _trim_fade(x, fade_ms=5.0):
    """Ensure zero click at end of clip."""
    x = np.asarray(x, dtype=float).copy()
    k = min(len(x), n_(fade_ms / 1000.0))
    if k > 1:
        x[-k:] *= np.linspace(1.0, 0.0, k)
    return x


# ==================== WATER & SPLASHES ====================

def splash_small(v=1.0):
    """Cork bobber & lead sinker plopping into open water: slap + cavity thump + scattered droplets."""
    d = 0.58
    p = uniform(0.86, 1.16)
    slap = bp(noise(d), 520 * p, 2400 * p) * env_ad(d, 0.002, uniform(0.014, 0.024))
    cavity = lp(noise(d), 340 * p) * env_ad(d, 0.004, uniform(0.042, 0.068))
    spray = bp(noise(d), 1400 * p, 5200 * p) * env_ad(d, 0.012, uniform(0.075, 0.125)) * 0.42
    drops = _impulses(d, int(uniform(8, 14)), 0.022, 0.34, 900 * p, 3600 * p, 0.004, 0.013, 0.2, 0.65)
    x = slap * 0.95 + cavity * 0.85 + spray + drops * 0.55
    x = echo(x, delay=uniform(0.028, 0.044), feedback=0.16, taps=2, damp=2200)[:n_(d)]
    return _trim_fade(norm(x) * v)


def splash_big(v=1.0):
    """Heavy fish breaching / slamming water surface: water wall slap + foaming surge + droplet rain."""
    d = 1.05
    p = uniform(0.85, 1.15)
    tt = t_(d)
    impact = lp(noise(d), 520 * p) * env_ad(d, 0.003, 0.075)
    sub = np.sin(2 * np.pi * uniform(58, 76) * tt * (1.0 - 0.22 * np.minimum(tt, 0.8))) * env_exp(d, 0.065) * 0.38
    churn_mod = 0.65 + 0.35 * np.abs(np.sin(2 * np.pi * uniform(7.5, 12.0) * tt + rand() * 3))
    foam = bp(noise(d), 380 * p, 4400 * p) * env_ad(d, 0.015, uniform(0.18, 0.27)) * churn_mod
    drops = _impulses(d, int(uniform(18, 28)), 0.04, 0.72, 750 * p, 4600 * p, 0.005, 0.018, 0.18, 0.6)
    x = sat(impact * 1.1 + sub + foam * 0.85, 1.55) + drops * 0.5
    x = echo(x, delay=0.055, feedback=0.22, taps=3, damp=1900)[:n_(d)]
    return _trim_fade(norm(x) * v)


def nibble(v=1.0):
    """Subtle cork bobber dip & water-film tug: soft muted water break + 2 micro-drips."""
    d = 0.28
    p = uniform(0.84, 1.18)
    dip = bp(noise(d), 480 * p, 1950 * p) * env_ad(d, 0.003, uniform(0.016, 0.026))
    tug = bp(noise(d), 1400 * p, 3800 * p) * env_ad(d, 0.001, 0.008) * 0.48
    body = lp(noise(d), 320 * p) * env_ad(d, 0.005, 0.032) * 0.52
    drops = _impulses(d, int(uniform(2, 5)), 0.028, 0.16, 850 * p, 2600 * p, 0.004, 0.011, 0.25, 0.55)
    return _trim_fade(norm(dip + tug + body + drops * 0.45) * v)


def water_bubble(v=1.0):
    """Tiny natural water bubble popping at surface: crisp film break + short damped cavity pop."""
    d = 0.14
    p = uniform(0.8, 1.25)
    film = bp(noise(d), 1100 * p, 3600 * p) * env_ad(d, 0.001, uniform(0.005, 0.009))
    cavity = bp(noise(d), 420 * p, 1200 * p) * env_ad(d, 0.002, uniform(0.012, 0.022)) * 0.65
    return _trim_fade(norm(film + cavity) * v)


def seabed_tap(v=1.0):
    """Lead sinker tapping submerged sand & pebbles: muffled underwater thump + grit scatter."""
    d = 0.26
    p = uniform(0.85, 1.15)
    thud = lp(noise(d), 260 * p) * env_ad(d, 0.004, 0.038)
    stone = bp(noise(d), 320 * p, 980 * p) * env_ad(d, 0.002, 0.016) * 0.65
    grit = _impulses(d, int(uniform(3, 6)), 0.012, 0.12, 420, 1450, 0.003, 0.009, 0.2, 0.5)
    return _trim_fade(norm(thud + stone + grit * 0.45) * v)


def fish_curious(v=1.0):
    """Subtle underwater fin displacement as a fish inspects the hook."""
    d = 0.30
    tt = t_(d)
    p = uniform(0.85, 1.15)
    swirl = bp(noise(d), 130 * p, 580 * p) * (np.sin(np.pi * tt / d) ** 1.6)
    return _trim_fade(norm(swirl) * v)


# ==================== ROD, LINE & REEL MECHANICS ====================

def cast(v=1.0):
    """Carbon-fiber fishing rod whip + monofilament spool zip."""
    d = 0.44
    tt = t_(d)
    p = uniform(0.88, 1.14)
    # Fast asymmetric air whip (peaks at 35% of duration)
    n = noise(d)
    whip = np.zeros_like(n)
    for i in range(0, len(n), 320):
        j = min(i + 320, len(n))
        u = i / len(n)
        shape = np.sin(np.pi * (u ** 0.72))
        fc = (420 + 2700 * shape) * p
        whip[i:j] = bp(n[max(0, i - 1600):j], fc * 0.65, fc * 1.45)[-(j - i):]
    whip_env = (np.sin(np.pi * (tt / d) ** 0.72) ** 1.8)
    flick = hp(noise(d), 3000) * env_ad(d, 0.001, 0.005)
    # Shift flick to peak of whip (~0.11s)
    flick_s = np.roll(flick, n_(0.10))
    flick_s[:n_(0.10)] = 0.0
    # Unspooling nylon line hiss trailing off
    spool = bp(noise(d), 2200 * p, 7200 * p) * env_ad(d, 0.09, 0.11) * (0.75 + 0.25 * np.sin(2 * np.pi * uniform(36, 52) * tt))
    x = whip * whip_env * 1.1 + flick_s * 0.42 + spool * 0.35
    return _trim_fade(norm(x) * v)


def reel_tick(v=1.0):
    """Single crisp spinning-reel metallic pawl ratchet click."""
    d = 0.055
    p = uniform(0.88, 1.14)
    tr = bp(noise(d), 2600, 8800) * env_exp(d, uniform(0.0011, 0.0018))
    gear = _inharmonic(d, 1950 * p, [1.0, 1.74, 2.83], [0.60, 0.42, 0.24], [0.007, 0.005, 0.0035], detune=0.03)
    housing = bp(noise(d), 420 * p, 1450 * p) * env_exp(d, 0.008) * 0.55
    return _trim_fade(norm(tr * 0.8 + gear * 0.8 + housing) * v)


def drag_out(v=1.0):
    """Spinning-reel drag clutch clicking rapidly under fish pull."""
    d = 0.36
    out = np.zeros(n_(d))
    t0 = 0.004
    rate = uniform(0.020, 0.028)
    while t0 < d - 0.05:
        c = reel_tick(uniform(0.65, 1.0))
        s = n_(t0)
        m = min(len(out) - s, len(c))
        if m > 0:
            out[s:s + m] += c[:m]
        t0 += rate * uniform(0.88, 1.14)
    hiss = bp(noise(d), 2400, 6800) * env_ad(d, 0.015, 0.14) * 0.22
    return _trim_fade(norm(out + hiss) * v)


def hook_set(v=1.0):
    """Sharp upward rod jerk + taut nylon snap + underwater water-rip."""
    d = 0.38
    p = uniform(0.9, 1.12)
    whip = bp(noise(d), 700 * p, 3400 * p) * env_ad(d, 0.008, 0.035)
    crack = hp(noise(d), 2600) * env_exp(d, 0.0025)
    rip = bp(noise(d), 280 * p, 1450 * p) * env_ad(d, 0.018, 0.065) * 0.75
    drops = _impulses(d, 5, 0.03, 0.22, 1000, 3800, 0.004, 0.010, 0.2, 0.5)
    x = sat(whip * 0.85 + crack * 0.9 + rip, 1.8) + drops * 0.35
    return _trim_fade(norm(x) * v)


def line_stop(v=1.0):
    """Spinning-reel bail arm clicking shut cleanly."""
    d = 0.09
    p = uniform(0.9, 1.12)
    latch = bp(noise(d), 2400, 8600) * env_exp(d, 0.0018)
    metal = _inharmonic(d, 1520 * p, [1.0, 1.89, 3.12], [0.62, 0.38, 0.22], [0.012, 0.008, 0.005], detune=0.02)
    body = lp(noise(d), 420 * p) * env_exp(d, 0.014) * 0.58
    return _trim_fade(norm(latch * 0.85 + metal * 0.72 + body) * v)


def jig(v=1.0):
    """Short rod-tip wrist twitch slicing taut monofilament through water."""
    d = 0.18
    p = uniform(0.88, 1.15)
    slice_w = bp(noise(d), 850 * p, 3200 * p) * env_ad(d, 0.006, 0.026)
    water = bp(noise(d), 320 * p, 1100 * p) * env_ad(d, 0.012, 0.04) * 0.55
    return _trim_fade(norm(slice_w + water) * v)


def retrieve_finish(v=1.0):
    """Wet bobber & rig lifting cleanly out of water with light shaking drips."""
    d = 0.34
    p = uniform(0.9, 1.12)
    lift = bp(noise(d), 600 * p, 2600 * p) * env_ad(d, 0.012, 0.042)
    drips = _impulses(d, int(uniform(4, 7)), 0.03, 0.24, 1100, 3800, 0.004, 0.010, 0.22, 0.6)
    return _trim_fade(norm(lift * 0.75 + drips * 0.65) * v)


def tension_warn(v=1.0):
    """Stretched fishing line straining + fiberglass rod creaking under heavy load."""
    d = 0.30
    tt = t_(d)
    p = uniform(0.9, 1.12)
    f0 = uniform(88, 118) * p
    saw = 2.0 * ((tt * f0 * (1.0 + 0.18 * np.sin(2 * np.pi * 11 * tt))) % 1.0) - 1.0
    rod_creak = bp(saw, 420, 2400) * (np.abs(np.sin(2 * np.pi * uniform(20, 29) * tt)) ** 2.5) * np.sin(np.pi * tt / d)
    wire = bp(noise(d), 1700 * p, 3900 * p) * env_ad(d, 0.02, 0.12) * 0.45
    return _trim_fade(norm(sat(rod_creak * 0.9 + wire, 1.7)) * v)


def line_snap(v=1.0):
    """Taut nylon line snapping like a whip crack + recoil hiss + quiet splash-back."""
    d = 0.45
    crack = hp(noise(d), 2800) * env_exp(d, 0.0018)
    whip = bp(noise(d), 900, 4200) * env_exp(d, 0.014)
    recoil = bp(noise(d), 1400, 5600) * env_ad(d, 0.008, 0.045) * 0.45
    splash_back = _impulses(d, 5, 0.08, 0.28, 650, 2400, 0.006, 0.015, 0.18, 0.4)
    x = sat(crack * 1.3 + whip * 0.95, 2.8) + recoil + splash_back * 0.35
    return _trim_fade(norm(x) * v)


def escape(v=1.0):
    """Hooked fish darting away underwater as line goes slack."""
    d = 0.56
    tt = t_(d)
    surge = lp(noise(d), 440) * env_ad(d, 0.018, 0.14)
    tail_wash = bp(noise(d), 280, 1600) * (np.sin(np.pi * tt / d) ** 1.4) * 0.65
    slack = bp(noise(d), 1100, 2800) * env_ad(d, 0.05, 0.08) * 0.22
    return _trim_fade(norm(surge + tail_wash + slack) * v)


# ==================== FISH BITES, FIGHT, PREDATORS & CATCH ====================

def _rod_bell(d, f_base, t0):
    """Small real brass rod-tip clip bell strike (inharmonic partials, short crisp ring)."""
    dur = max(0.06, d - t0)
    b = _inharmonic(dur, f_base, [1.0, 1.52, 2.07, 2.98, 4.16], [1.0, 0.52, 0.34, 0.22, 0.12],
                    [0.24, 0.16, 0.11, 0.07, 0.04], detune=0.015)
    clapper = hp(noise(dur), 3400) * env_exp(dur, 0.0014) * 0.55
    hit = norm(b + clapper)
    out = np.zeros(n_(d))
    s = n_(t0)
    m = min(len(out) - s, len(hit))
    if m > 0:
        out[s:s + m] = hit[:m]
    return out


def bite(v=1.0):
    """Sudden underwater fish strike splash + realistic brass rod-tip bell rattling twice."""
    d = 0.68
    p = uniform(0.92, 1.08)
    strike = bp(noise(d), 380 * p, 2400 * p) * env_ad(d, 0.003, 0.048)
    sub = lp(noise(d), 280) * env_ad(d, 0.004, 0.06) * 0.65
    bell1 = _rod_bell(d, 2180 * p, 0.03) * 0.72
    bell2 = _rod_bell(d, 2240 * p, uniform(0.14, 0.19)) * 0.58
    x = strike * 0.8 + sub + bell1 + bell2
    return _trim_fade(norm(x) * v)


def bite_big(v=1.0):
    """Heavy predator/rare fish strike slam + urgent 3-hit rod-tip brass bell + drag slip."""
    d = 0.85
    p = uniform(0.92, 1.08)
    slam = lp(noise(d), 480) * env_ad(d, 0.003, 0.085)
    spray = bp(noise(d), 600, 3800) * env_ad(d, 0.008, 0.12) * 0.75
    b1 = _rod_bell(d, 1980 * p, 0.025) * 0.75
    b2 = _rod_bell(d, 2050 * p, 0.13) * 0.68
    b3 = _rod_bell(d, 2010 * p, 0.24) * 0.60
    x = sat(slam * 1.1 + spray * 0.7, 1.65) + b1 + b2 + b3
    return _trim_fade(norm(x) * v)


def fish_warning(v=1.0):
    """Ominous underwater pressure surge & taut line pull right before a fish thrashes."""
    d = 0.42
    tt = t_(d)
    p = uniform(0.9, 1.1)
    surge = lp(brown(d), 320 * p) * (np.sin(np.pi * tt / d) ** 1.2)
    taut = bp(noise(d), 750 * p, 2200 * p) * env_ad(d, 0.04, 0.12) * 0.42
    return _trim_fade(norm(surge + taut) * v)


def fish_thrash(v=1.0):
    """Hooked fish thrashing furiously at surface: staggered wet tail slaps + whitewater churn."""
    d = 0.72
    p = uniform(0.86, 1.16)
    out = np.zeros(n_(d))
    slaps = int(uniform(3, 6))
    for k in range(slaps):
        t0 = 0.015 + k * uniform(0.085, 0.125)
        dur = min(d - t0, 0.24)
        if dur <= 0.03:
            continue
        slap = bp(noise(dur), 320 * p, 3400 * p) * env_ad(dur, 0.004, uniform(0.022, 0.042))
        low = lp(noise(dur), 360) * env_ad(dur, 0.004, 0.05) * 0.7
        s = n_(t0)
        out[s:s + len(slap)] += norm(slap + low) * uniform(0.65, 1.0)
    churn = bp(noise(d), 500, 4200) * env_ad(d, 0.03, 0.22) * 0.52
    drops = _impulses(d, 14, 0.04, 0.58, 900, 4600, 0.005, 0.015, 0.2, 0.55)
    return _trim_fade(norm(sat(out + churn, 1.45) + drops * 0.42) * v)


def fish_calm(v=1.0):
    """Surface turbulence settling as fish tires."""
    d = 0.36
    p = uniform(0.9, 1.1)
    wash = lp(noise(d), 680 * p) * env_ad(d, 0.02, 0.12)
    return _trim_fade(norm(wash) * v)


def landing_lift(v=1.0):
    """Wet fish lifted out of water + heavy wet thud onto weathered pier planks."""
    d = 0.72
    p = uniform(0.9, 1.12)
    spray = bp(noise(d), 650 * p, 4200 * p) * env_ad(d, 0.01, 0.085) * 0.75
    drips = _impulses(d, 10, 0.03, 0.36, 1000, 4200, 0.004, 0.013, 0.2, 0.55)
    # Wet flop onto wood pier at ~0.24s
    flop_d = 0.32
    tt = t_(flop_d)
    wood = bp(noise(flop_d), 260, 1800) * env_exp(flop_d, 0.018) + np.sin(2 * np.pi * uniform(135, 175) * tt) * env_exp(flop_d, 0.025) * 0.6
    wet_slap = lp(noise(flop_d), 620) * env_ad(flop_d, 0.003, 0.032) * 0.85
    flop = norm(wood + wet_slap)
    out = spray + drips * 0.45
    s = n_(0.24)
    out[s:s + len(flop)] += flop * 0.95
    return _trim_fade(norm(out) * v)


def ambush_alert(v=1.0):
    """Deep underwater sea predator surging swiftly: ominous low water cavitation + pressure rumble."""
    d = 0.78
    tt = t_(d)
    p = uniform(0.9, 1.1)
    rumble = lp(brown(d), 190 * p) * env_ad(d, 0.04, 0.26)
    cav = bp(noise(d), 140 * p, 680 * p) * (np.sin(np.pi * tt / d) ** 1.3) * 0.85
    bubbles = _impulses(d, 8, 0.06, 0.52, 420, 1600, 0.008, 0.020, 0.2, 0.45)
    return _trim_fade(norm(sat(rumble * 1.15 + cav, 1.6) + bubbles * 0.3) * v)


def predator_chomp(v=1.0):
    """Heavy underwater predator jaw snap + crunch + deep concussion splash."""
    d = 0.76
    tt = t_(d)
    p = uniform(0.88, 1.12)
    crunch = bp(noise(d), 750 * p, 4400 * p) * env_ad(d, 0.002, 0.032)
    snap_tr = bp(noise(d), 2200, 8200) * env_exp(d, 0.003)
    sub = np.sin(2 * np.pi * uniform(55, 68) * tt * (1.0 - 0.3 * np.minimum(tt, 0.7))) * env_exp(d, 0.08)
    water = bp(noise(d), 220, 1600) * env_ad(d, 0.01, 0.16) * 0.95
    x = sat(crunch * 1.45 + snap_tr * 1.1 + sub * 0.68 + water, 2.1)
    x = echo(x, delay=0.055, feedback=0.22, taps=2, damp=1600)[:n_(d)]
    return _trim_fade(norm(x) * v)


# ==================== GROUNDED ACOUSTIC CATCH CUES ====================

def catch_common(v=1.0):
    """Grounded catch confirmation: warm marimba/wood-block resonance + gentle brass tap."""
    d = 0.65
    p = uniform(0.96, 1.04)
    # Warm wooden dock knock + two organic wooden/brass resonances (no 8-bit chiptune)
    n1 = _inharmonic(d, 392 * p, [1.0, 2.96, 5.4], [0.9, 0.28, 0.1], [0.14, 0.06, 0.03])
    m1 = bp(noise(d), 600, 2400) * env_exp(d, 0.004) * 0.45
    d2 = 0.50
    n2 = _inharmonic(d2, 523 * p, [1.0, 2.98, 5.45], [0.95, 0.32, 0.12], [0.22, 0.08, 0.04])
    m2 = bp(noise(d2), 700, 2800) * env_exp(d2, 0.004) * 0.45
    out = n1 + m1
    s = n_(0.11)
    out[s:s + len(n2)] += (n2 + m2) * 0.95
    out = echo(out, delay=0.048, feedback=0.22, taps=3, damp=2200)[:n_(d)]
    return _trim_fade(norm(out) * v)


def catch_rare(v=1.0):
    """Warm bronze maritime bell pair with soft coastal reverb."""
    d = 1.15
    p = uniform(0.97, 1.03)
    b1 = _inharmonic(d, 440 * p, [1.0, 1.50, 2.02, 2.97, 4.11], [1.0, 0.42, 0.30, 0.18, 0.09],
                     [0.45, 0.30, 0.22, 0.14, 0.08], detune=0.008)
    s1 = hp(noise(d), 2600) * env_exp(d, 0.002) * 0.35
    d2 = 0.95
    b2 = _inharmonic(d2, 659 * p, [1.0, 1.51, 2.03, 2.99, 4.14], [1.0, 0.45, 0.30, 0.16, 0.08],
                     [0.52, 0.34, 0.24, 0.14, 0.08], detune=0.008)
    s2 = hp(noise(d2), 2800) * env_exp(d2, 0.002) * 0.35
    out = b1 + s1
    s = n_(0.14)
    out[s:s + len(b2)] += (b2 + s2) * 0.92
    out = echo(out, delay=0.062, feedback=0.28, taps=3, damp=2400)[:n_(d)]
    return _trim_fade(norm(out) * v)


def catch_legendary(v=1.0):
    """Deep ship's brass bell toll + bright harmonic bronze ring + sea-air tail."""
    d = 1.95
    p = uniform(0.98, 1.02)
    bell = _inharmonic(d, 293.7 * p, [1.0, 1.50, 2.01, 2.52, 3.04, 4.18],
                       [1.0, 0.55, 0.42, 0.26, 0.20, 0.11],
                       [0.52, 0.38, 0.30, 0.22, 0.16, 0.10], detune=0.01)
    mallet = lp(noise(d), 900) * env_exp(d, 0.008) * 0.45 + bp(noise(d), 2200, 7500) * env_exp(d, 0.002) * 0.35
    d2 = 1.60
    bell2 = _inharmonic(d2, 440.0 * p, [1.0, 1.51, 2.02, 3.01, 4.12],
                        [0.85, 0.44, 0.32, 0.18, 0.10],
                        [0.48, 0.34, 0.24, 0.16, 0.10], detune=0.01)
    out = bell + mallet
    s = n_(0.22)
    out[s:s + len(bell2)] += bell2 * 0.78
    out = echo(out, delay=0.072, feedback=0.28, taps=3, damp=2100)[:n_(d)]
    return _trim_fade(norm(sat(out, 1.25)) * v)


def catch_myth(v=1.0):
    """Cavernous bronze temple gong + deep ocean swell + long coastal reverb."""
    d = 2.60
    tt = t_(d)
    p = uniform(0.98, 1.02)
    gong = _inharmonic(d, 146.8 * p, [1.0, 1.47, 2.03, 2.68, 3.31, 4.42, 5.79],
                       [1.0, 0.65, 0.48, 0.36, 0.26, 0.18, 0.10],
                       [0.72, 0.58, 0.46, 0.38, 0.28, 0.20, 0.14], detune=0.014)
    # Slow shimmer bloom characteristic of a real struck gong
    bloom = 1.0 + 0.22 * np.sin(2 * np.pi * 3.2 * tt) * np.exp(-tt / 1.1)
    mallet = lp(noise(d), 380) * env_ad(d, 0.005, 0.055) * 0.9
    swell = lp(brown(d), 160) * env_ad(d, 0.08, 0.55) * 0.55
    x = sat(gong * bloom + mallet + swell, 1.55)
    x = echo(x, delay=0.085, feedback=0.30, taps=3, damp=1800)[:n_(d)]
    return _trim_fade(norm(x) * v)


def sweet_spot(v=1.0):
    """Subtle crisp mechanical reel-detent click (grounded tactile cue, zero cartoon chime)."""
    d = 0.085
    p = uniform(0.93, 1.07)
    tr = hp(noise(d), 3400) * env_exp(d, 0.0014)
    detent = _inharmonic(d, 2280 * p, [1.0, 1.68, 2.74], [0.5, 0.35, 0.18], [0.022, 0.014, 0.009])
    return _trim_fade(norm(tr * 0.8 + detent * 0.7) * v)


# ==================== MATERIAL UI & ECONOMY ====================

def ui_click_wood(v=1.0):
    """Dry weathered harbor pier wood tap."""
    d = 0.065
    p = uniform(0.88, 1.14)
    tt = t_(d)
    x = bp(noise(d), 350 * p, 2400 * p) * env_exp(d, 0.007) + np.sin(2 * np.pi * 240 * p * tt) * env_exp(d, 0.012) * 0.55
    return _trim_fade(norm(x) * v)


def ui_click_bamboo(v=1.0):
    """Hollow dry bamboo knock."""
    d = 0.075
    p = uniform(0.88, 1.14)
    tap = bp(noise(d), 600 * p, 2800 * p) * env_exp(d, 0.005) * 0.75
    hollow = _inharmonic(d, 540 * p, [1.0, 2.34], [0.8, 0.35], [0.016, 0.009])
    return _trim_fade(norm(tap + hollow) * v)


def ui_click_frost(v=1.0):
    """Crisp icy slate click."""
    d = 0.065
    p = uniform(0.9, 1.12)
    tr = bp(noise(d), 2800, 8800) * env_exp(d, 0.0018)
    ice = _inharmonic(d, 2400 * p, [1.0, 1.84, 2.93], [0.65, 0.36, 0.20], [0.012, 0.008, 0.005])
    return _trim_fade(norm(tr * 0.75 + ice * 0.78) * v)


def ui_click_basalt(v=1.0):
    """Dry volcanic basalt stone click."""
    d = 0.07
    p = uniform(0.88, 1.14)
    grit = hp(noise(d), 2000) * env_exp(d, 0.0025) * 0.75
    stone = bp(noise(d), 260 * p, 1250 * p) * env_exp(d, 0.012) + _inharmonic(d, 380 * p, [1.0, 2.18], [0.6, 0.28], [0.011, 0.006])
    return _trim_fade(norm(grit + stone) * v)


def ui_click_marble(v=1.0):
    """Carved temple marble stone tap with tiny dry reflection."""
    d = 0.085
    p = uniform(0.9, 1.12)
    tr = hp(noise(d), 2800) * env_exp(d, 0.002) * 0.7
    stone = _inharmonic(d, 1180 * p, [1.0, 1.94, 3.12], [0.65, 0.38, 0.18], [0.016, 0.010, 0.006])
    x = echo(tr + stone, delay=0.018, feedback=0.18, taps=2, damp=2600)[:n_(d)]
    return _trim_fade(norm(x) * v)


def ui_hover(v=1.0):
    """Ultra-subtle dry wooden/tactile brush micro-tick."""
    d = 0.032
    p = uniform(0.9, 1.12)
    x = bp(noise(d), 900 * p, 3200 * p) * env_ad(d, 0.001, 0.004)
    return _trim_fade(norm(x) * v)


def ui_open(v=1.0):
    """Tackle-box wood/leather slide + quiet brass latch click."""
    d = 0.16
    slide = bp(noise(d), 450, 2200) * env_ad(d, 0.012, 0.032) * 0.6
    latch_d = 0.055
    latch = hp(noise(latch_d), 3000) * env_exp(latch_d, 0.0016) + _inharmonic(latch_d, 1850, [1.0, 1.88], [0.45, 0.25], [0.009, 0.006])
    out = slide
    s = n_(0.045)
    out[s:s + len(latch)] += norm(latch) * 0.72
    return _trim_fade(norm(out) * v)


def ui_close(v=1.0):
    """Tackle-box lid settling shut: muted wooden thud + gentle click."""
    d = 0.14
    thud = bp(noise(d), 180, 1100) * env_exp(d, 0.018) * 0.9
    click_d = 0.04
    cl = hp(noise(click_d), 2600) * env_exp(click_d, 0.0015) * 0.55
    out = thud
    s = n_(0.028)
    out[s:s + len(cl)] += cl
    return _trim_fade(norm(out) * v)


def ui_denied(v=1.0):
    """Muted wooden double-knock (grounded refusal, zero arcade buzzer)."""
    d = 0.22
    out = np.zeros(n_(d))
    for t0, f in [(0.005, 195), (0.088, 165)]:
        kd = 0.085
        tt = t_(kd)
        k = bp(noise(kd), 160, 720) * env_exp(kd, 0.015) + np.sin(2 * np.pi * f * tt) * env_exp(kd, 0.018) * 0.65
        s = n_(t0)
        out[s:s + len(k)] += norm(k)
    return _trim_fade(norm(out) * v)


def coins(v=1.0):
    """Handful of real heavy brass coins clinking together on wood."""
    d = 0.52
    out = np.zeros(n_(d))
    count = int(uniform(6, 9))
    for k in range(count):
        t0 = k * uniform(0.022, 0.042) + uniform(0.0, 0.012)
        dur = min(d - t0, 0.22)
        if dur <= 0.03:
            continue
        f_base = uniform(2550, 3900)
        c = _inharmonic(dur, f_base, [1.0, 1.48, 2.09, 2.86], [0.9, 0.55, 0.34, 0.18],
                        [0.055, 0.038, 0.024, 0.015], detune=0.02)
        tr = hp(noise(dur), 3800) * env_exp(dur, 0.0012) * 0.5
        s = n_(t0)
        out[s:s + len(c)] += norm(c + tr) * uniform(0.45, 0.95)
    out = echo(out, delay=0.024, feedback=0.16, taps=2, damp=3500)[:n_(d)]
    return _trim_fade(norm(out) * v)


def upgrade_buy(v=1.0):
    """Mechanical tackle wrench click + brass coin clink + wooden workbench thump."""
    d = 0.56
    c = coins(0.8)
    wrench_d = 0.09
    wrench = hp(noise(wrench_d), 3000) * env_exp(wrench_d, 0.002) + _inharmonic(wrench_d, 1620, [1.0, 1.79, 2.91], [0.6, 0.4, 0.22], [0.015, 0.010, 0.006])
    bench_d = 0.14
    bench = lp(noise(bench_d), 380) * env_exp(bench_d, 0.028)
    out = np.zeros(n_(d))
    out[:len(wrench)] += norm(wrench) * 0.85
    s1 = n_(0.055)
    out[s1:s1 + min(len(out) - s1, len(c))] += c[:min(len(out) - s1, len(c))] * 0.82
    s2 = n_(0.16)
    out[s2:s2 + len(bench)] += norm(bench) * 0.75
    return _trim_fade(norm(out) * v)


def map_travel(v=1.0):
    """Wooden skiff creak + soft coastal wake wash."""
    d = 0.85
    tt = t_(d)
    wake = bp(noise(d), 220, 1800) * (np.sin(np.pi * tt / d) ** 1.5) * 0.85
    hull = lp(brown(d), 220) * (np.sin(np.pi * tt / d) ** 1.2) * 0.65
    cr = creak_timber(0.55)
    out = wake + hull
    s = n_(0.08)
    out[s:s + min(len(out) - s, len(cr))] += cr[:min(len(out) - s, len(cr))] * 0.48
    return _trim_fade(norm(out) * v)


def map_unlock(v=1.0):
    """Heavy iron harbor padlock unlatching + resonant ship's brass bell."""
    d = 1.25
    lock_d = 0.12
    lock = hp(noise(lock_d), 2600) * env_exp(lock_d, 0.002) + _inharmonic(lock_d, 1180, [1.0, 1.83, 2.95], [0.7, 0.45, 0.25], [0.024, 0.015, 0.009])
    bell_d = 1.05
    bell = _inharmonic(bell_d, 523.25, [1.0, 1.51, 2.02, 2.98], [1.0, 0.48, 0.30, 0.16], [0.55, 0.38, 0.25, 0.14], detune=0.008)
    out = np.zeros(n_(d))
    out[:len(lock)] += norm(lock) * 0.85
    s = n_(0.14)
    out[s:s + len(bell)] += norm(bell) * 0.9
    out = echo(out, delay=0.068, feedback=0.28, taps=3, damp=2200)[:n_(d)]
    return _trim_fade(norm(out) * v)


def new_discovery(v=1.0):
    """Crisp field-journal parchment page turn + warm brass pen/clasp tap."""
    d = 0.56
    tt = t_(d)
    page = bp(noise(d), 1100, 5200) * (np.sin(np.pi * np.minimum(tt / 0.26, 1.0)) ** 1.6) * (tt < 0.26)
    clasp_d = 0.32
    clasp = _inharmonic(clasp_d, 1380, [1.0, 1.53, 2.11], [0.75, 0.38, 0.18], [0.14, 0.09, 0.05])
    out = page * 0.85
    s = n_(0.18)
    out[s:s + len(clasp)] += norm(clasp) * 0.72
    return _trim_fade(norm(out) * v)


def myth_spawn(v=1.0):
    """Distant deep-ocean leviathan pressure rumble & muffled abyssal horn swell."""
    d = 1.95
    tt = t_(d)
    swell = lp(brown(d), 145) * (np.sin(np.pi * tt / d) ** 1.35)
    horn = _inharmonic(d, uniform(68, 78), [1.0, 1.49, 2.04], [0.75, 0.36, 0.18], [0.95, 0.7, 0.45]) * env_ad(d, 0.38, 0.65)
    wash = bp(noise(d), 120, 480) * (np.sin(np.pi * tt / d) ** 1.6) * 0.38
    x = sat(swell * 1.1 + horn * 0.55 + wash, 1.45)
    x = echo(x, delay=0.12, feedback=0.35, taps=3, damp=900)[:n_(d)]
    return _trim_fade(norm(x) * v)


def shooting_star(v=1.0):
    """Delicate high-altitude airy wind glisten (no sci-fi laser)."""
    d = 0.75
    tt = t_(d)
    air = bp(noise(d), 1800, 6200) * (np.sin(np.pi * tt / d) ** 2.0) * 0.55
    glisten = _inharmonic(d, uniform(2400, 3100), [1.0, 1.52, 2.38], [0.45, 0.25, 0.12], [0.22, 0.15, 0.09]) * env_ad(d, 0.08, 0.24)
    x = echo(air + glisten * 0.55, delay=0.065, feedback=0.28, taps=3, damp=3200)[:n_(d)]
    return _trim_fade(norm(x) * v)


def admin_action(v=1.0):
    """Crisp precision brass toggle switch snap."""
    d = 0.07
    tr = bp(noise(d), 2600, 8600) * env_exp(d, 0.0015)
    snap = _inharmonic(d, 2100 * uniform(0.94, 1.06), [1.0, 1.76, 2.84], [0.62, 0.38, 0.22], [0.011, 0.007, 0.004])
    return _trim_fade(norm(tr * 0.8 + snap * 0.75) * v)


# ==================== BIOME AMBIENT ONE-SHOTS ====================

def creak_timber(v=1.0):
    """Weathered wooden pier plank creaking softly under ocean swell."""
    d = 0.42
    tt = t_(d)
    f0 = uniform(62, 88)
    saw = 2.0 * ((tt * f0 * (1.0 + 0.24 * np.sin(2 * np.pi * uniform(5.5, 8.5) * tt))) % 1.0) - 1.0
    stutter = (np.abs(np.sin(2 * np.pi * uniform(14, 21) * tt)) ** 2.6) * (np.sin(np.pi * tt / d) ** 1.3)
    wood = bp(saw, 280, 1650) * stutter
    x = echo(wood, delay=0.04, feedback=0.18, taps=2, damp=1200)[:n_(d)]
    return _trim_fade(norm(x) * v)


def amb_seagull(v=1.0):
    """Distant coastal seagull call: raspy formant-filtered noise + breathy vocal friction, distance-damped."""
    d = 1.15
    tt = t_(d)
    out = np.zeros(len(tt))
    for idx, (t0, dur, f_hi, f_lo) in enumerate([
        (0.04, uniform(0.28, 0.36), uniform(1450, 1750), uniform(920, 1120)),
        (uniform(0.46, 0.56), uniform(0.24, 0.32), uniform(1320, 1600), uniform(840, 1020)),
    ]):
        n = noise(dur)
        t_c = t_(dur)
        # Vocal-cord raspy excitation (band-shaped pulse noise, NOT pure sine!)
        f_inst = f_hi + (f_lo - f_hi) * (t_c / dur) ** 1.25
        phase = 2 * np.pi * np.cumsum(f_inst) / SR
        pulse = np.tanh(np.sin(phase) * 2.2) * 0.5 + bp(n, 700, 3200) * 0.5
        call = bp(pulse, f_lo * 0.85, f_hi * 1.45, o=3) * (np.sin(np.pi * t_c / dur) ** 1.2)
        s = n_(t0)
        m = min(len(out) - s, len(call))
        if m > 0:
            out[s:s + m] += norm(call[:m]) * (0.9 if idx == 0 else 0.72)
    # Distance damping + open harbor coastal air echo
    out = lp(out, 2600)
    out = echo(out, delay=0.11, feedback=0.28, taps=3, damp=1500)[:n_(d)]
    return _trim_fade(norm(out) * v)


def amb_tropical(v=1.0):
    """Distant muffled canopy bird call + subtle palm leaf rustle."""
    d = 0.90
    tt = t_(d)
    rustle = bp(noise(d), 900, 3800) * (np.sin(np.pi * tt / d) ** 1.8) * 0.32
    out = rustle.copy()
    for t0, f0 in [(0.10, uniform(1180, 1480)), (0.32, uniform(980, 1250))]:
        cd = 0.16
        tc = t_(cd)
        call = bp(noise(cd) * 0.45 + np.sin(2 * np.pi * f0 * tc) * 0.55, f0 * 0.75, f0 * 1.35) * (np.sin(np.pi * tc / cd) ** 1.5)
        s = n_(t0)
        out[s:s + len(call)] += norm(call) * 0.65
    out = echo(lp(out, 2800), delay=0.085, feedback=0.25, taps=3, damp=1700)[:n_(d)]
    return _trim_fade(norm(out) * v)


def amb_cricket(v=1.0):
    """Authentic distant night field cricket stridulation bursts."""
    d = 0.68
    tt = t_(d)
    f_car = uniform(4150, 4750)
    bursts = np.zeros(len(tt))
    for k in range(int(uniform(3, 5))):
        t0 = 0.03 + k * uniform(0.11, 0.145)
        bd = 0.075
        tb = t_(bd)
        pulses = (np.sin(2 * np.pi * uniform(46, 56) * tb) > 0).astype(float)
        grain = bp(noise(bd) * 0.45 + np.sin(2 * np.pi * f_car * tb) * 0.55, f_car * 0.85, f_car * 1.15)
        seg = grain * pulses * (np.sin(np.pi * tb / bd) ** 1.2)
        s = n_(t0)
        m = min(len(bursts) - s, len(seg))
        if m > 0:
            bursts[s:s + m] += norm(seg[:m])
    return _trim_fade(norm(bursts) * v)


def amb_ice(v=1.0):
    """Distant arctic fjord glacier ice fracture & deep cold groan."""
    d = 1.25
    crack = hp(noise(d), 1900) * env_exp(d, 0.004)
    splinters = _impulses(d, int(uniform(6, 11)), 0.01, 0.42, 1600, 6200, 0.002, 0.008, 0.3, 0.85)
    groan = lp(brown(d), 195) * env_ad(d, 0.04, 0.36) * 0.85
    x = sat(crack * 1.0 + splinters * 0.75 + groan, 1.5)
    x = echo(x, delay=0.105, feedback=0.34, taps=4, damp=1800)[:n_(d)]
    return _trim_fade(norm(x) * v)


def amb_aurora(v=1.0):
    """Soft high-altitude arctic wind & subtle harmonic shimmer."""
    d = 1.60
    tt = t_(d)
    wind = bp(noise(d), 420, 1900) * (np.sin(np.pi * tt / d) ** 1.8) * 0.55
    shimmer = _inharmonic(d, uniform(880, 1120), [1.0, 1.50, 2.25], [0.4, 0.25, 0.12], [0.65, 0.48, 0.32]) * (np.sin(np.pi * tt / d) ** 1.6)
    return _trim_fade(norm(wind + shimmer * 0.45) * v)


def amb_lava(v=1.0):
    """Volcanic caldera bubble pop + pressurized steam vent hiss."""
    d = 0.85
    pop_low = lp(noise(d), 300) * env_ad(d, 0.005, 0.055)
    hiss = bp(noise(d), 1800, 6400) * env_ad(d, 0.045, 0.18) * 0.65
    crackle = _impulses(d, 7, 0.06, 0.52, 2200, 6800, 0.002, 0.006, 0.15, 0.4)
    return _trim_fade(norm(pop_low * 0.9 + hiss + crackle * 0.35) * v)


def amb_crystal(v=1.0):
    """Hollow ancient stone/crystal temple wind resonance."""
    d = 1.50
    tt = t_(d)
    wind = bp(noise(d), 320, 1200) * (np.sin(np.pi * tt / d) ** 1.6) * 0.48
    hum = _inharmonic(d, uniform(340, 440), [1.0, 1.50, 2.41], [0.65, 0.35, 0.18], [0.75, 0.55, 0.38]) * (np.sin(np.pi * tt / d) ** 1.6)
    x = echo(wind + hum * 0.65, delay=0.095, feedback=0.32, taps=3, damp=1900)[:n_(d)]
    return _trim_fade(norm(x) * v)
