/*
  Copyright 2020 David Whiting
  This work is licensed under a Creative Commons Attribution 4.0 International License
  https://creativecommons.org/licenses/by/4.0/
*/

import PatternDisplay from './display.js'
import {choose, fill, rndInt, rnd, seedRNG} from './utils.js'

import Audio from "./audio.js";
import * as music from './theory.js'
import * as Generators from './generators.js'

const PatternSize = 64;

const progressions = [
    [1,1,1,1,6,6,6,6,4,4,4,4,3,3,5,5],
    [1,1,1,1,6,6,6,6,1,1,1,1,6,6,6,6],
    [4,4,4,4,5,5,5,5,1,1,1,1,1,1,3,3],
    [1,1,6,6,4,4,5,5,1,1,6,6,3,3,5,5],
    [5,5,4,4,1,1,1,1,5,5,6,6,1,1,1,1],
    [6,6,6,6,5,5,5,5,4,4,4,4,5,5,5,5],
    [1,1,1,1,3,3,3,3,4,4,4,4,5,5,5,5],
    [6,6,6,6,4,4,4,4,1,1,1,1,1,1,5,5],
    [1,1,1,1,1,1,1,1,4,4,4,4,4,4,4,4]
];

type Synth<T> = { play: (note: T) => void}
type FourChannelsPlusDrums = [Note, Note, Note, Note, Drum]
type PatternsType<T> = { [K in keyof T]: Pattern<T[K]> };
type SynthsType<T> = { [K in keyof T]: Synth<T[K]> }



interface State {
    key: Key,
    scale: Scale,
    progression: Progression,
    bpm: number,
    songIndex: number,
    seedCode: string
}

type SaveCode = string & {typeTag: "__SaveCode"}

function hex(v: number) { return Math.floor(v).toString(16).toUpperCase().padStart(2,'0'); }
function unhex(v: string): number {
    return parseInt(v, 16)
}

function save(state: State): SaveCode {
    const nonRandomElements = [state.key, state.scale == music.scales.major ? 0 : 1, progressions.indexOf(state.progression), state.bpm, state.songIndex % 256];
    const saveCode = "0x" + nonRandomElements.map(hex).join("") + state.seedCode;
    return saveCode as SaveCode;
}

function restore(code: SaveCode): State {
    const codeString = code.slice(2);
    const key = unhex(codeString.slice(0,2)) as Key;
    const scale = unhex(codeString.slice(2,4)) === 0 ? music.scales.major : music.scales.minor;
    const progression = progressions[unhex(codeString.slice(4,6))];
    const bpm = unhex(codeString.slice(6,8));
    const songIndex = unhex(codeString.slice(8,10));
    const seedCode = codeString.slice(10);
    return {
        bpm,
        key,
        progression,
        scale,
        seedCode,
        songIndex
    }
}

function bpmClock() {
    let intervalHandle = {
        bpmClock: 0
    };
    let fN = 0;
    function set(bpm: number, frameFunction: (f: number) => void) {
        window.clearInterval(intervalHandle.bpmClock);
        intervalHandle.bpmClock = window.setInterval(() => frameFunction(fN++), (60000 / bpm) / 4);
    }
    return {
        set,
        stop: () => window.clearInterval(intervalHandle.bpmClock)
    }
}

function createInitialState(seedOrSave: string): State {
    if (seedOrSave.startsWith("0x")) {
        return restore(seedOrSave as SaveCode);
    } else {
        seedRNG(seedOrSave && seedOrSave.length > 0 ? seedOrSave : "" + Math.random());
        return {
            key: 5 as Key,
            scale: music.scales.major,
            progression: progressions[0],
            bpm: 112,
            seedCode: createSeedCode(),
            songIndex: 0
        };
    }
}

function createSeedCode() {
    return hex(rndInt(255)) +hex(rndInt(255)) + hex(rndInt(255)) + hex(rndInt(255));
}

function mutateState(state: State): void {
    state.songIndex++;
    if (state.songIndex % 8 === 0) {
        state.bpm = Math.floor(rnd() * 80) + 100;
        //clock.set(state.bpm, frame);
    }
    if (state.songIndex % 4 === 0) {
        [state.key, state.scale] = music.modulate(state.key, state.scale);
    }
    if (state.songIndex % 2 === 0) {
        state.progression = choose(progressions);
    }
    state.seedCode = hex(rndInt(255)) +hex(rndInt(255)) + hex(rndInt(255)) + hex(rndInt(255));
    seedRNG(state.seedCode);

    //display.setPatterns(patterns, stateString);
}


function start() {
    const seedOrSave = (document.getElementById("seed-text") as HTMLInputElement).value;
    const state: State = createInitialState(seedOrSave);
    const settings = {
        keyOverride: null as Key | null,
        minOctave: -2,
        maxOctave: 6,
        noteMask: new Array(12).fill(true),
        tempo: 1,
        trackEnabled: [true, true, true, true, true],
        locks: {
            key: false,
            rangeMin: false,
            rangeMax: false,
            bpm: false,
            tempo: false,
            keys: false,
            tracks: false
        }
    };

    let patterns = [[],[],[],[],[]] as PatternsType<FourChannelsPlusDrums>;

    const display = PatternDisplay(document.getElementById("display") as HTMLElement);
    const clock = bpmClock();

    // @ts-ignore
    const ctx: AudioContext = new (window.AudioContext || window.webkitAudioContext)() as AudioContext;
    const au = Audio(ctx);

    const synths: SynthsType<FourChannelsPlusDrums> = [
        au.AcidSynth(),
        au.AcidSynth(-0.5),
        au.AcidSynth(),
        au.AcidSynth(0.5),
        au.DrumSynth()
    ];

    function currentContext(): { progression: Progression, key: Key, scale: Scale, minOctave: number, maxOctave: number, noteMask: boolean[] } {
        return {
            progression: state.progression,
            key: settings.keyOverride ?? state.key,
            scale: state.scale,
            minOctave: settings.minOctave,
            maxOctave: settings.maxOctave,
            noteMask: settings.noteMask
        };
    }

    function newPatterns() {
        seedRNG(state.seedCode);
        const context = currentContext();
        patterns =[
            choose([Generators.bass, Generators.bass2, Generators.emptyNote])(context),
            rnd() < 0.7 ? Generators.arp(context) : Generators.emptyNote(),
            rnd() < 0.7 ? Generators.melody1(context) : Generators.emptyNote(),
            choose([Generators.emptyNote, Generators.arp, Generators.melody1])(context),
            rnd() < 0.8 ? Generators.drum() : Generators.emptyDrum(),
        ];
    }

    const history: string[] = [];
    const historyList = document.getElementById("history-list");
    function recordHistory(code: SaveCode) {
        if (history[0] !== code) {
            history.unshift(code);
            if (history.length > 100) history.length = 100;
        }
        if (historyList) {
            historyList.innerHTML = history.map((entry) => `<li>${entry}</li>`).join("");
        }
    }

    function updateDisplay() {
        const code = save(state);
        display.setPatterns(patterns, code);
        recordHistory(code);
    }

    // create initial patterns
    newPatterns();
    updateDisplay();

    const silentNote = {note: '---'} as Note;
    const silentDrum = {drum: '---'} as Drum;

    function effectiveBpm() {
        return Math.max(40, Math.round(state.bpm * settings.tempo));
    }

    function frame(f: number) {
        const positionInPattern = f % PatternSize;
        if (f % 128 === 0 && f!== 0) {
            const previousBpm = state.bpm;
            const previousKey = state.key;
            mutateState(state);
            if (settings.locks.bpm) {
                state.bpm = previousBpm;
            }
            if (settings.locks.key) {
                state.key = settings.keyOverride ?? previousKey;
            } else if (settings.keyOverride !== null) {
                state.key = settings.keyOverride;
            }
            newPatterns();
            clock.set(effectiveBpm(), frame);
            updateDisplay();
        }

        display.highlightRow(positionInPattern);

        // Not a loop because these tuple parts have different types depending on melody vs drum
        synths[0].play(settings.trackEnabled[0] ? patterns[0][positionInPattern] : silentNote);
        synths[1].play(settings.trackEnabled[1] ? patterns[1][positionInPattern] : silentNote);
        synths[2].play(settings.trackEnabled[2] ? patterns[2][positionInPattern] : silentNote);
        synths[3].play(settings.trackEnabled[3] ? patterns[3][positionInPattern] : silentNote);
        synths[4].play(settings.trackEnabled[4] ? patterns[4][positionInPattern] : silentDrum);
    }

    clock.set(effectiveBpm(), frame);
    let playing = true;

    const keySelect = document.getElementById("key-select") as HTMLSelectElement | null;
    const minOctaveSelect = document.getElementById("range-min") as HTMLSelectElement | null;
    const maxOctaveSelect = document.getElementById("range-max") as HTMLSelectElement | null;
    const bpmSlider = document.getElementById("bpm-slider") as HTMLInputElement | null;
    const tempoSlider = document.getElementById("tempo-slider") as HTMLInputElement | null;
    const bpmValue = document.getElementById("bpm-value");
    const tempoValue = document.getElementById("tempo-value");
    const noteGrid = document.getElementById("note-grid");
    const randomizeButton = document.getElementById("randomize") as HTMLButtonElement | null;
    const playToggle = document.getElementById("play-toggle") as HTMLButtonElement | null;
    const infoToggle = document.getElementById("info-toggle") as HTMLButtonElement | null;
    const infoPopup = document.getElementById("info-popup");
    const infoClose = document.getElementById("info-close") as HTMLButtonElement | null;
    const minimizeToggle = document.getElementById("minimize-toggle") as HTMLButtonElement | null;
    const settingsPanel = document.getElementById("settings-panel");
    const historyToggle = document.getElementById("history-toggle") as HTMLButtonElement | null;
    const historyPanel = document.getElementById("history-panel");
    const lockKey = document.getElementById("lock-key") as HTMLInputElement | null;
    const lockRangeMin = document.getElementById("lock-range-min") as HTMLInputElement | null;
    const lockRangeMax = document.getElementById("lock-range-max") as HTMLInputElement | null;
    const lockBpm = document.getElementById("lock-bpm") as HTMLInputElement | null;
    const lockTempo = document.getElementById("lock-tempo") as HTMLInputElement | null;
    const lockKeys = document.getElementById("lock-keys") as HTMLInputElement | null;
    const lockTracks = document.getElementById("lock-tracks") as HTMLInputElement | null;
    const trackToggles = [
        document.getElementById("track-1") as HTMLInputElement | null,
        document.getElementById("track-2") as HTMLInputElement | null,
        document.getElementById("track-3") as HTMLInputElement | null,
        document.getElementById("track-4") as HTMLInputElement | null,
        document.getElementById("track-5") as HTMLInputElement | null
    ];

    function applySettings(options: { bpm?: boolean; tempo?: boolean } = {}) {
        if (lockKey) settings.locks.key = lockKey.checked;
        if (lockRangeMin) settings.locks.rangeMin = lockRangeMin.checked;
        if (lockRangeMax) settings.locks.rangeMax = lockRangeMax.checked;
        if (lockBpm) settings.locks.bpm = lockBpm.checked;
        if (lockTempo) settings.locks.tempo = lockTempo.checked;
        if (lockKeys) settings.locks.keys = lockKeys.checked;
        if (lockTracks) settings.locks.tracks = lockTracks.checked;

        if (minOctaveSelect && maxOctaveSelect) {
            if (!settings.locks.rangeMin) settings.minOctave = parseInt(minOctaveSelect.value, 10);
            if (!settings.locks.rangeMax) settings.maxOctave = parseInt(maxOctaveSelect.value, 10);
            if (settings.maxOctave < settings.minOctave) {
                const t = settings.maxOctave;
                settings.maxOctave = settings.minOctave;
                settings.minOctave = t;
            }
            minOctaveSelect.value = String(settings.minOctave);
            maxOctaveSelect.value = String(settings.maxOctave);
        }
        if (keySelect) {
            const selected = parseInt(keySelect.value, 10);
            if (!Number.isNaN(selected) && !settings.locks.key) {
                settings.keyOverride = selected as Key;
                state.key = settings.keyOverride;
            }
            keySelect.value = String(settings.keyOverride ?? state.key);
        }
        if (options.bpm && bpmSlider && !settings.locks.bpm) {
            state.bpm = parseInt(bpmSlider.value, 10);
            if (bpmValue) bpmValue.textContent = String(state.bpm);
        }
        if (options.tempo && tempoSlider && !settings.locks.tempo) {
            settings.tempo = parseInt(tempoSlider.value, 10) / 100;
            if (tempoValue) tempoValue.textContent = `${Math.round(settings.tempo * 100)}%`;
        }
        if (bpmSlider) bpmSlider.value = String(state.bpm);
        if (tempoSlider) tempoSlider.value = String(Math.round(settings.tempo * 100));
        if (noteGrid) {
            const inputs = Array.from(noteGrid.querySelectorAll("input[type='checkbox']")) as HTMLInputElement[];
            if (!settings.locks.keys) {
                settings.noteMask = inputs.map((input) => input.checked);
            } else {
                inputs.forEach((input, i) => {
                    input.checked = settings.noteMask[i] ?? true;
                });
            }
            inputs.forEach((input) => {
                input.disabled = settings.locks.keys;
            });
        }
        trackToggles.forEach((toggle, i) => {
            if (!toggle) return;
            if (!settings.locks.tracks) {
                settings.trackEnabled[i] = toggle.checked;
            } else {
                toggle.checked = settings.trackEnabled[i];
            }
            toggle.disabled = settings.locks.tracks;
        });
        if (keySelect) keySelect.disabled = settings.locks.key;
        if (minOctaveSelect) minOctaveSelect.disabled = settings.locks.rangeMin;
        if (maxOctaveSelect) maxOctaveSelect.disabled = settings.locks.rangeMax;
        if (bpmSlider) bpmSlider.disabled = settings.locks.bpm;
        if (tempoSlider) tempoSlider.disabled = settings.locks.tempo;
        newPatterns();
        updateDisplay();
        if (playing) {
            clock.set(effectiveBpm(), frame);
        }
    }

    if (keySelect) {
        keySelect.value = String(settings.keyOverride ?? state.key);
        keySelect.addEventListener("change", applySettings);
    }
    if (minOctaveSelect) {
        minOctaveSelect.value = String(settings.minOctave);
        minOctaveSelect.addEventListener("change", applySettings);
    }
    if (maxOctaveSelect) {
        maxOctaveSelect.value = String(settings.maxOctave);
        maxOctaveSelect.addEventListener("change", applySettings);
    }
    if (bpmSlider) {
        bpmSlider.value = String(state.bpm);
        if (bpmValue) bpmValue.textContent = String(state.bpm);
        bpmSlider.addEventListener("input", () => applySettings({bpm: true}));
    }
    if (tempoSlider) {
        tempoSlider.value = String(Math.round(settings.tempo * 100));
        if (tempoValue) tempoValue.textContent = `${Math.round(settings.tempo * 100)}%`;
        tempoSlider.addEventListener("input", () => applySettings({tempo: true}));
    }
    if (noteGrid) {
        const inputs = Array.from(noteGrid.querySelectorAll("input[type='checkbox']")) as HTMLInputElement[];
        inputs.forEach((input, i) => {
            input.checked = settings.noteMask[i] ?? true;
            input.addEventListener("change", applySettings);
        });
    }
    trackToggles.forEach((toggle, i) => {
        if (!toggle) return;
        toggle.checked = settings.trackEnabled[i];
        toggle.addEventListener("change", applySettings);
    });
    [lockKey, lockRangeMin, lockRangeMax, lockBpm, lockTempo, lockKeys, lockTracks].forEach((lock) => {
        if (!lock) return;
        lock.addEventListener("change", applySettings);
    });
    if (randomizeButton) {
        randomizeButton.addEventListener("click", () => {
            if (!settings.locks.key) {
                state.key = rndInt(12) as Key;
                settings.keyOverride = state.key;
            }
            state.scale = music.scales.major;
            state.progression = choose(progressions);
            if (!settings.locks.bpm) {
                state.bpm = Math.floor(rnd() * 90) + 80;
            }
            if (!settings.locks.rangeMin) settings.minOctave = choose([-2,-1,0,1]) as number;
            if (!settings.locks.rangeMax) settings.maxOctave = choose([2,3,4,5,6]) as number;
            if (settings.maxOctave < settings.minOctave) {
                const t = settings.maxOctave;
                settings.maxOctave = settings.minOctave;
                settings.minOctave = t;
            }
            if (!settings.locks.tempo) settings.tempo = (Math.floor(rnd() * 51) + 75) / 100;
            if (!settings.locks.keys) {
                settings.noteMask = new Array(12).fill(false).map(() => rnd() > 0.25);
                if (!settings.noteMask.some(Boolean)) {
                    settings.noteMask[0] = true;
                    settings.noteMask[5] = true;
                }
            }
            if (!settings.locks.tracks) settings.trackEnabled = settings.trackEnabled.map(() => rnd() > 0.1);

            if (keySelect) keySelect.value = String(settings.keyOverride ?? state.key);
            if (minOctaveSelect) minOctaveSelect.value = String(settings.minOctave);
            if (maxOctaveSelect) maxOctaveSelect.value = String(settings.maxOctave);
            if (bpmSlider) bpmSlider.value = String(state.bpm);
            if (bpmValue) bpmValue.textContent = String(state.bpm);
            if (tempoSlider) tempoSlider.value = String(Math.round(settings.tempo * 100));
            if (tempoValue) tempoValue.textContent = `${Math.round(settings.tempo * 100)}%`;
            if (noteGrid) {
                const inputs = Array.from(noteGrid.querySelectorAll("input[type='checkbox']")) as HTMLInputElement[];
                inputs.forEach((input, i) => {
                    input.checked = settings.noteMask[i] ?? true;
                });
            }
            trackToggles.forEach((toggle, i) => {
                if (toggle) toggle.checked = settings.trackEnabled[i];
            });

            applySettings();
        });
    }
    if (playToggle) {
        playToggle.textContent = "Pause";
        playToggle.addEventListener("click", () => {
            if (playing) {
                playing = false;
                playToggle.textContent = "Play";
                clock.stop();
                synths[0].play(silentNote);
                synths[1].play(silentNote);
                synths[2].play(silentNote);
                synths[3].play(silentNote);
                synths[4].play(silentDrum);
            } else {
                playing = true;
                playToggle.textContent = "Pause";
                clock.set(effectiveBpm(), frame);
            }
        });
    }
    if (infoToggle && infoPopup) {
        infoToggle.addEventListener("click", () => {
            infoPopup.style.display = "flex";
        });
    }
    if (infoClose && infoPopup) {
        infoClose.addEventListener("click", () => {
            infoPopup.style.display = "none";
        });
    }
    if (infoPopup) {
        infoPopup.addEventListener("click", (e) => {
            if (e.target === infoPopup) infoPopup.style.display = "none";
        });
    }
    if (minimizeToggle && settingsPanel) {
        minimizeToggle.addEventListener("click", () => {
            settingsPanel.classList.toggle("minimized");
        });
    }
    if (historyToggle && historyPanel) {
        historyToggle.addEventListener("click", () => {
            historyPanel.style.display = historyPanel.style.display === "block" ? "none" : "block";
        });
    }
}

window.onload = function() {

    if (window.location.search.startsWith("?")) {
        (document.getElementById("seed-text") as HTMLInputElement).value = window.location.search.slice(1);
    }

    let started = false;
    document.getElementById("start")?.addEventListener("click", e => {
        if (!started) {
            start();
        }
        started = true;
    });

    document.getElementById("seed-entry")?.addEventListener("keydown", e => {
        if (e.key === "Enter") {
            if (!started) {
                start();
            }
            started = true;
        }
    });
}
