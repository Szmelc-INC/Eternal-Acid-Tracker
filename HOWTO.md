# AutoTracker HOWTO

## Overview
- Generates endless algorithmic chiptune with five tracks (4 synth + drums).
- Everything saves in your browser (`localStorage`); exporting/importing shares setups.
- Works best in modern Chrome/Firefox with audio unlocked by pressing Start once.

## Quick Start
- Click **Start** → music begins.
- Use **Key**, **Range Min/Max**, **Tempo**, **BPM** sliders to shape the song.
- Toggle tracks 1–5 to mute/unmute parts.
- **Randomize** picks a fresh pattern using your advanced rules.

## Locks
- Each setting has a **lock** checkbox. Locked values never change during randomize or playback mutations.

## History & Favorites
- **H** shows last 100 pattern codes. Click any code to reload it.
- **★** saves the current pattern + settings to favorites; reopen from the Favorites panel.

## Advanced (JSONC)
- Open **S** (Advanced) to edit a commented JSON config.
- Supports `//` and `/* */` comments; `null` means “use default”.
- Key fields:
  - `randomizeEveryLoops`: how many 64-step loops before auto-randomize.
  - `randomize`: enable/disable randomization per aspect (key, bpm, tempo, range, keys, tracks, progression).
  - `bpm` / `tempo`: min/max ranges.
  - `rangeMinChoices` / `rangeMaxChoices`: octave choices for random range.
  - `synth`: default synth type & tone (per-track overrides planned via UI selector).
  - `theme`: accent/border/highlight colors (used in UI).

## Export / Import
- **⇩ Export** downloads a JSON snapshot of settings, advanced config, history, favorites, and last seed.
- **⇧ Import** loads a snapshot (version 1). Confirms on success; keeps up to 100 entries each.

## How-To Viewer
- **?** opens this HOWTO in-app. Links open in a new tab.

## Troubleshooting
- No sound: ensure you pressed **Start** after page load; check browser autoplay policy.
- Distortion: lower `synth.level` or BPM; or mute tracks.
- Stuck/NaN in settings: hit **Factory Reset** in Advanced or import a known-good export.
- Import fails: ensure the file is a version 1 export; check that it’s valid JSON/JSONC.

## Glossary
- **Pattern ID**: shareable code representing the current state.
- **JSONC**: JSON with comments allowed; comments stripped before apply.
- **LocalStorage**: browser-only storage; never writes to server.
