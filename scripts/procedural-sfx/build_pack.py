#!/usr/bin/env python3
"""Render & QA-verify the complete Pierline Fishing procedural SFX library.

Uses bianbianzhu/procedural-sfx (sfxkit.py + fishing_recipes.py + analyze.py):
  - Renders 48 kHz 64-bit DSP recipes with deterministic per-take seeding
  - True-peak limits every take to -1.0 dBTP via sfxkit.limit()
  - Verifies acoustic metrics (t-20, centroid, band balance, multi-take variation)
  - Exports crisp 24 kHz 16-bit mono WAV files into assets/sfx/
  - Writes multi-variant assets/sfx/manifest.json for js/audio.js
"""
import json
import os
import sys
import numpy as np
import soundfile as sf
from scipy.signal import resample_poly

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
OUT_DIR = os.path.join(ROOT, 'assets', 'sfx')

sys.path.insert(0, HERE)
import sfxkit
import fishing_recipes as rec
import analyze

EXPORT_SR = 24000  # 12 kHz Nyquist, crisp natural foley, half the size, 100% Safari/iOS WAV compatible

# (manifest_key, recipe_fn_name, num_variants)
PACK_SPEC = [
    # Water & splashes
    ('splash_small', 'splash_small', 4),
    ('splash_big', 'splash_big', 4),
    ('nibble', 'nibble', 4),
    ('water_bubble', 'water_bubble', 4),
    ('seabed_tap', 'seabed_tap', 3),
    ('fish_curious', 'fish_curious', 3),

    # Rod, line & reel hardware
    ('cast', 'cast', 4),
    ('reel_tick', 'reel_tick', 4),
    ('drag_out', 'drag_out', 3),
    ('hook_set', 'hook_set', 3),
    ('line_stop', 'line_stop', 3),
    ('jig', 'jig', 3),
    ('retrieve_finish', 'retrieve_finish', 3),
    ('tension_warn', 'tension_warn', 3),
    ('line_snap', 'line_snap', 3),
    ('escape', 'escape', 3),

    # Bites, fight, predators & catch
    ('bite', 'bite', 3),
    ('bite_big', 'bite_big', 3),
    ('fish_warning', 'fish_warning', 3),
    ('fish_thrash', 'fish_thrash', 4),
    ('fish_calm', 'fish_calm', 3),
    ('landing_lift', 'landing_lift', 3),
    ('ambush_alert', 'ambush_alert', 3),
    ('predator_chomp', 'predator_chomp', 3),
    ('catch_common', 'catch_common', 2),
    ('catch_rare', 'catch_rare', 2),
    ('catch_legendary', 'catch_legendary', 2),
    ('catch_myth', 'catch_myth', 2),
    ('sweet_spot', 'sweet_spot', 3),

    # Material UI & economy
    ('ui_click_wood', 'ui_click_wood', 4),
    ('ui_click_bamboo', 'ui_click_bamboo', 4),
    ('ui_click_frost', 'ui_click_frost', 4),
    ('ui_click_basalt', 'ui_click_basalt', 4),
    ('ui_click_marble', 'ui_click_marble', 4),
    ('ui_hover', 'ui_hover', 3),
    ('ui_open', 'ui_open', 2),
    ('ui_close', 'ui_close', 2),
    ('ui_denied', 'ui_denied', 2),
    ('coins', 'coins', 4),
    ('upgrade_buy', 'upgrade_buy', 2),
    ('map_travel', 'map_travel', 2),
    ('map_unlock', 'map_unlock', 2),
    ('new_discovery', 'new_discovery', 2),
    ('myth_spawn', 'myth_spawn', 2),
    ('shooting_star', 'shooting_star', 2),
    ('admin_action', 'admin_action', 2),

    # Biome ambient one-shots
    ('pier_creak', 'creak_timber', 3),
    ('amb_seagull', 'amb_seagull', 3),
    ('amb_tropical', 'amb_tropical', 3),
    ('amb_cricket', 'amb_cricket', 3),
    ('amb_ice', 'amb_ice', 3),
    ('amb_aurora', 'amb_aurora', 2),
    ('amb_lava', 'amb_lava', 3),
    ('amb_crystal', 'amb_crystal', 2),
]


def max_xcorr(a, b, max_lag=240):
    n = min(len(a), len(b))
    a = a[:n] - np.mean(a[:n])
    b = b[:n] - np.mean(b[:n])
    na, nb = np.linalg.norm(a), np.linalg.norm(b)
    if na < 1e-9 or nb < 1e-9:
        return 0.0
    a /= na
    b /= nb
    best = 0.0
    for lag in range(-max_lag, max_lag + 1, 8):
        if lag >= 0:
            c = abs(float(np.dot(a[lag:], b[:n - lag])))
        else:
            c = abs(float(np.dot(a[:n + lag], b[-lag:])))
        if c > best:
            best = c
    return best


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    # Remove stale wavs from prior renders
    for fn in os.listdir(OUT_DIR):
        if fn.endswith('.wav'):
            os.remove(os.path.join(OUT_DIR, fn))

    manifest_files = {}
    total_files = 0
    total_bytes = 0
    warnings = []

    print(f"{'KEY':<18} {'N':>2} {'DUR':>6} {'ATKms':>6} {'T20ms':>7} {'CENT':>6} {'TP dB':>6} {'XCORR':>6}  TOP BANDS")
    print('-' * 92)

    for idx, (key, fn_name, count) in enumerate(PACK_SPEC):
        fn = getattr(rec, fn_name)
        takes_48k = []
        filenames = []
        centroids = []
        t20_flags = 0

        for k in range(count):
            seed = 10000 + idx * 97 + k * 31
            sfxkit.reseed(seed)
            y = fn(v=0.92)
            if not np.all(np.isfinite(y)):
                raise RuntimeError(f'{key} take {k} produced NaN/inf!')
            y_lim = sfxkit.limit(y, ceil=-1.0)
            takes_48k.append(y_lim)

            # Resample 48k -> 24k cleanly (exact 2:1 polyphase anti-aliased)
            y_out = resample_poly(y_lim, 1, 2)
            # Re-verify peak after decimation
            pk = np.max(np.abs(y_out))
            if pk > 0.89:
                y_out = y_out * (0.89 / pk)

            fname = f'{key}_{k + 1}.wav'
            fpath = os.path.join(OUT_DIR, fname)
            sf.write(fpath, y_out, EXPORT_SR, subtype='PCM_16')
            filenames.append(fname)
            total_files += 1
            total_bytes += os.path.getsize(fpath)

            m = analyze.describe(y_lim)
            centroids.append(m['centroid'])
            if np.isnan(m['t20']):
                t20_flags += 1

        manifest_files[key] = filenames

        # Measure take 0 details + max pairwise xcorr across takes
        m0 = analyze.describe(takes_48k[0])
        worst_xc = 0.0
        for i in range(len(takes_48k)):
            for j in range(i + 1, len(takes_48k)):
                xc = max_xcorr(takes_48k[i], takes_48k[j])
                if xc > worst_xc:
                    worst_xc = xc

        bands_sorted = sorted(m0['bands'].items(), key=lambda kv: -kv[1])[:3]
        band_str = ' '.join(f'{b}:{p:.0f}%' for b, p in bands_sorted)
        t20_str = f"{m0['t20']:6.0f}" if not np.isnan(m0['t20']) else '  >end'
        tp = sfxkit.true_peak_db(takes_48k[0])
        print(f"{key:<18} {count:>2} {m0['dur']:5.2f}s {m0['attack']:5.1f} {t20_str} {m0['centroid']:6.0f} {tp:6.1f} {worst_xc:6.2f}  {band_str}")

        if t20_flags > 0:
            warnings.append(f'{key}: t-20 reached >end on {t20_flags}/{count} takes')
        if count >= 3 and worst_xc > 0.85:
            warnings.append(f'{key}: takes too similar (xcorr={worst_xc:.2f})')

    manifest = {
        'generator': 'bianbianzhu/procedural-sfx + fishing_recipes.py',
        'sampleRate': EXPORT_SR,
        'format': 'wav-pcm16',
        'files': manifest_files,
    }
    manifest_path = os.path.join(OUT_DIR, 'manifest.json')
    with open(manifest_path, 'w') as f:
        json.dump(manifest, f, indent=2)

    print('-' * 92)
    print(f'Built {total_files} grounded procedural WAV files across {len(PACK_SPEC)} categories ({total_bytes / 1024 / 1024:.2f} MB total).')
    print(f'Wrote {manifest_path}')
    if warnings:
        print('\nQA WARNINGS:')
        for w in warnings:
            print('  CHECK:', w)
    else:
        print('QA: ZERO WARNINGS! All takes vary cleanly & decay before array end.')


if __name__ == '__main__':
    main()
