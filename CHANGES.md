# Changes

This log summarizes **every requested change** from this session in the order it was asked, and the resulting state after each step.

## Sound + theory changes
- Biased the generator toward heavier/deeper/low notes and a D‑minor feel.
- Added an acid‑style 8‑bit synth voice and switched melodic channels to it (kept drums on drum synth).
- Lowered bass ranges and widened octave options; added min/max octave limits and key masks in generators.
- Kept modulation biased toward D‑minor.

## Settings panel (top‑right UI)
- Added a settings panel with key, range min/max, key mask, BPM, tempo, track toggles, Randomize, and Play/Pause.
- Added live updates (changes apply in flight) and auto‑regeneration of patterns.
- Added lock checkboxes for key/range/bpm/tempo/keys/tracks (locks prevent randomize and manual changes).
- Added an info popup (i) with the AutoTracker description.
- Added a history list (H) inside the panel (stores last 100 patterns).

## Fixes
- Fixed BPM/tempo not affecting playback and randomize not working.
- Fixed range min/max accidentally affecting tempo (separated slider updates).

## Repo actions
- Removed previous repo history and reinitialized a new repo named **8bit‑bandit**.
- Created a new root commit with the current state.

## Requested but rolled back (per your explicit revert request)
- An experimental UI overhaul (side lock bar, config editor popup, favorites popup, history popup, theme/layout config) was **reverted** when you asked to roll back the broken UI.

## Current state
- Acid synth + low‑range bias + D‑minor default are in place.
- Settings panel includes key/range/BPM/tempo/keys/track toggles, Randomize, Play/Pause.
- Locks, info popup, and history list are present and working.
