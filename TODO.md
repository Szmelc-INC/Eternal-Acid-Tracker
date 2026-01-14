Implement these changes in the AutoTracker app codebase (music tracker with UI in index.html). Analyze the existing code, make updates step by step, focus on sound preferences, UI panels, randomization, and bug fixes. Use JS/HTML/CSS, assuming the base is a chiptune-like synth, change to 8bit heavy acid synth.**

1. **Sound defaults and preferences:**  
   Change default note/sound ranges to prefer heavy, deep, low sounds and keys like D minor. Change chiptune to 8bit heavy acid synth. Widen sound/key range. Add selector panel (key, range, note) in top right corner of UI in index.html for on-the-fly changes.

2. **Add to settings UI panel:**  
   - Sliders for BPM / Tempo.  
   - [Randomize] button that randomizes everything.  
   - [Toggle X] buttons (X=1-5) to toggle tracks on/off.

3. **Fix bugs:**  
   Fix so BPM/Tempo actually change the tempo, randomize button works properly. Remove bug where changing range min/max/oct affects tempo instead of notes.

4. **Minimize/maximize settings panel:**  
   Add [^] button in top right corner of settings UI to hide/unhide the panel.

5. **Lock/unlock checkboxes:**  
   Add lock/unlock checkbox next to each setting (key, range min/max, bpm, tempo, keys, tracks) to prevent randomization until unlocked.

6. **Info popup instead of top part:**  
   Replace top part (from "AutoTracker, an endless..." up to source code) with a popup that shows when clicking [i] (info) button inside settings panel.

7. **Play/Pause button:**  
   Add [Play/Pause] button below [Randomize] in settings.

8. **History button and window:**  
   Add [H] (history) button in top right of settings next to [i] and [^]. On click, show 100 most recent patterns in a separate popup in left top corner (similar to settings but for history).

9. **Locks on separate pane:**  
   Move lock checkboxes to a slim left pane next to settings (at the same height as settings). Make bar slimmer: 3px margin on sides, 5px top/bottom. Replace text "Locks" with unicode padlock symbol.

10. **Square buttons:**  
   Make buttons [i], [h], [S], [^] square (5px width and height).

11. **Advanced settings [S] button:**  
   Add [S] button next to top right actions in settings. On click, open centered popup with editable text config file (e.g., randomization every X loops, what to randomize in what ranges, wave gen type per track, color theme of app, general layout: vertical/horizontal tracker, default margin between tracks, and as many configs as possible). Add [Save], [Cancel], [Factory Reset] buttons in the popup. Changes apply on [Save].

12. **Favorites system:**  
   - Add [<star>] button next to current pattern ID to add pattern + current settings to favorites.  
   - Add [<star>] button in settings next to i,h,s,^, which opens a popup with favorites (similar to history, stick to left viewport border; if history or other UI is shown, stick to that from right side).

Implement all this in the code, test it, ensure UI is responsive and sound works as expected. If needed, add new functions/classes in JS.
