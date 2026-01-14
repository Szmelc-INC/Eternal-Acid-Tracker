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
const STORAGE_KEY = 'autotracker:v1';

function stripJsonComments(text: string) {
    // removes // and /* */ outside of strings; simple, not perfect but sufficient for controlled JSONC input
    const stringRegex = /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g;
    const placeholders: string[] = [];
    const withoutStrings = text.replace(stringRegex, (m) => {
        placeholders.push(m);
        return `__STR_PLACEHOLDER_${placeholders.length - 1}__`;
    });
    const withoutComments = withoutStrings
        .replace(/\/\*[^]*?\*\//g, '')
        .replace(/(^|[^:])\/\/.*$/gm, '$1');
    return withoutComments.replace(/__STR_PLACEHOLDER_(\d+)__/g, (_, i) => placeholders[parseInt(i, 10)]);
}

function parseJsonc<T>(text: string, fallback: T): T {
    try {
        const stripped = stripJsonComments(text);
        const parsed = JSON.parse(stripped);
        return parsed as T;
    } catch (e) {
        console.warn('JSONC parse failed, reverting to fallback', e);
        return fallback;
    }
}

function markdownToHtml(md: string): string {
    const lines = md.replace(/\r\n?/g, '\n').split('\n');
    let html = '';
    let inList = false;
    const flushList = () => {
        if (inList) {
            html += '</ul>';
            inList = false;
        }
    };
    lines.forEach((line) => {
        const heading = line.match(/^(#{1,3})\s+(.*)$/);
        if (heading) {
            flushList();
            const level = heading[1].length;
            html += `<h${level}>${heading[2]}</h${level}>`;
            return;
        }
        const listItem = line.match(/^\s*[-*]\s+(.*)$/);
        if (listItem) {
            if (!inList) {
                html += '<ul>';
                inList = true;
            }
            html += `<li>${listItem[1]}</li>`;
            return;
        }
        flushList();
        if (line.trim() === '') {
            html += '<p></p>';
            return;
        }
        const withLinks = line.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, text, url) => `<a href="${url}" target="_blank" rel="noopener noreferrer">${text}</a>`);
        html += `<p>${withLinks}</p>`;
    });
    flushList();
    return html;
}

type StoredState = {
    version: number;
    settings: any;
    advanced: any;
    history: string[];
    favorites: { code: SaveCode; settings: any; createdAt: number }[];
    seed?: string;
};

const defaultStoredState: StoredState = {
    version: 1,
    settings: {
        keyOverride: null,
        minOctave: -3,
        maxOctave: 7,
        noteMask: new Array(12).fill(false).map((_, i) => [0,2,3,5,7,8,10].includes(i)),
        tempo: 1,
        trackEnabled: [true, true, true, true, true],
        trackVolumes: [1,1,1,1,1],
        trackSynths: ["bass","acid8","square","triangle","drums"],
        locks: {
            key: false,
            rangeMin: false,
            rangeMax: false,
            bpm: false,
            tempo: false,
            keys: false,
            tracks: false
        }
    },
    advanced: {
        randomizeEveryLoops: 2,
        randomize: {
            key: true,
            bpm: true,
            tempo: true,
            range: true,
            keys: true,
            tracks: true,
            progression: true,
            instruments: false
        },
        bpm: { min: 70, max: 160 },
        tempo: { min: 0.75, max: 1.25 },
        rangeMinChoices: [-4, -3, -2, -1, 0, 1],
        rangeMaxChoices: [2, 3, 4, 5, 6, 7, 8],
        synth: {
            type: "acid8" as const,
            drive: 260,
            filterQ: 14,
            level: 0.22
        },
        theme: {
            accent: "darkorange",
            border: "#6699FF",
            highlight: "#339933"
        }
    },
    history: [],
    favorites: [],
    seed: undefined
};

function loadStored(): StoredState {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return JSON.parse(JSON.stringify(defaultStoredState));
        const parsed = JSON.parse(raw) as StoredState;
        return {
            ...JSON.parse(JSON.stringify(defaultStoredState)),
            ...parsed,
            settings: { ...defaultStoredState.settings, ...(parsed.settings || {}) },
            advanced: { ...defaultStoredState.advanced, ...(parsed.advanced || {}) },
            history: Array.isArray(parsed.history) ? parsed.history : [],
            favorites: Array.isArray(parsed.favorites) ? parsed.favorites : []
        };
    } catch (e) {
        console.warn('Failed to load stored state, using defaults', e);
        return JSON.parse(JSON.stringify(defaultStoredState));
    }
}

function persistStored(state: StoredState) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
        console.warn('Failed to persist state', e);
    }
}

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
    const stored = loadStored();
    const state: State = createInitialState(seedOrSave || stored.seed || '');
    const settings = JSON.parse(JSON.stringify({
        ...defaultStoredState.settings,
        ...stored.settings,
        trackVolumes: stored.settings.trackVolumes ?? defaultStoredState.settings.trackVolumes,
        trackSynths: stored.settings.trackSynths ?? defaultStoredState.settings.trackSynths
    }));

    function normalizeTrackSynths() {
        const defaults = defaultStoredState.settings.trackSynths;
        if (!Array.isArray(settings.trackSynths)) {
            settings.trackSynths = [...defaults];
            return;
        }
        settings.trackSynths = settings.trackSynths.map((v: any, idx: number) => {
            const fallback = defaults[idx] || (idx === 4 ? 'drums' : 'acid8');
            if (idx === 4) return 'drums';
            const val = String(v || fallback);
            return val;
        });
        if (settings.trackSynths.length < defaults.length) {
            settings.trackSynths = settings.trackSynths.concat(defaults.slice(settings.trackSynths.length));
        }
        settings.trackSynths = settings.trackSynths.slice(0, defaults.length);
    }

    normalizeTrackSynths();

    const favorites: { code: SaveCode; settings: any; createdAt: number }[] = [...stored.favorites];

    const defaultAdvancedConfig = JSON.parse(JSON.stringify({
        ...defaultStoredState.advanced,
        trackSynths: [
            { type: "bass", detune: -0.25, drive: 260, filterQ: 14, level: 0.22 },
            { type: "acid8", detune: 0, drive: 230, filterQ: 12, level: 0.2 },
            { type: "square", detune: 0.1, drive: 200, filterQ: 10, level: 0.18 },
            { type: "triangle", detune: 0.2, drive: 180, filterQ: 8, level: 0.16 },
            { type: "drums", level: 0.3 }
        ],
        layout: {
            trackSpacingPx: 25,
            trackHeaderScale: 2,
            trackBorderColor: "rgba(102,153,255,0.4)",
            trackBackground: "rgba(0,0,0,0.25)"
        }
    }));
    let advancedConfig = JSON.parse(JSON.stringify({
        ...defaultAdvancedConfig,
        ...stored.advanced
    }));

    let patterns = [[],[],[],[],[]] as PatternsType<FourChannelsPlusDrums>;

    const display = PatternDisplay(document.getElementById("display") as HTMLElement);
    const clock = bpmClock();

    // @ts-ignore
    const ctx: AudioContext = new (window.AudioContext || window.webkitAudioContext)() as AudioContext;
    const au = Audio(ctx);

    function buildSynth(type: string, pan: number, volRef: () => number, isDrum: boolean) {
        if (isDrum) return au.DrumSynth(volRef);
        switch (type) {
            case 'square': return au.SquareSynth(pan, volRef);
            case 'acid8':
            case 'acid':
            case 'bass': return au.AcidSynth(pan, volRef);
            case 'sine': return (au as any).OscSynth('sine', pan, volRef);
            case 'triangle': return (au as any).OscSynth('triangle', pan, volRef);
            case 'saw': return (au as any).OscSynth('sawtooth', pan, volRef);
            case 'rev-saw': return (au as any).OscSynth('sawtooth', pan, volRef, true);
            default: return au.SquareSynth(pan, volRef);
        }
    }

    function rebuildSynths() {
        normalizeTrackSynths();
        synths = [
            buildSynth(settings.trackSynths?.[0] || 'bass', 0, () => settings.trackVolumes?.[0] ?? 1, false) as any,
            buildSynth(settings.trackSynths?.[1] || 'acid8', -0.5, () => settings.trackVolumes?.[1] ?? 1, false) as any,
            buildSynth(settings.trackSynths?.[2] || 'square', 0, () => settings.trackVolumes?.[2] ?? 1, false) as any,
            buildSynth(settings.trackSynths?.[3] || 'triangle', 0.5, () => settings.trackVolumes?.[3] ?? 1, false) as any,
            buildSynth('drums', 0, () => settings.trackVolumes?.[4] ?? 1, true) as any
        ];
    }

    let synths: SynthsType<FourChannelsPlusDrums> = [] as any;
    rebuildSynths();

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

    function safeRange(range: {min?: number|null, max?: number|null}|undefined, fallback: {min: number, max: number}) {
        const min = Number((range && range.min) ?? NaN);
        const max = Number((range && range.max) ?? NaN);
        if (!Number.isFinite(min) || !Number.isFinite(max)) return {...fallback};
        if (min === max) return {min, max};
        if (min > max) return {min: max, max: min};
        return {min, max};
    }

    function clampToOptions(select: HTMLSelectElement, value: number) {
        const opts = Array.from(select.options)
            .map((o) => parseInt(o.value, 10))
            .filter((v) => Number.isFinite(v));
        if (!opts.length) return value;
        const min = Math.min(...opts);
        const max = Math.max(...opts);
        if (!Number.isFinite(value)) return min;
        return Math.min(max, Math.max(min, value));
    }

    function ensureOctave(value: any, fallback: number) {
        const n = Number(value);
        if (!Number.isFinite(n)) return fallback;
        return Math.max(-5, Math.min(10, Math.round(n)));
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

    const history: string[] = [...stored.history];
    let selectedHistories = new Set<string>();
    let selectedFavorites = new Set<number>();
    const historyList = document.getElementById("history-list");
    const historyPopup = document.getElementById("history-popup");
    const historyPopupList = document.getElementById("history-popup-list");
    const historyPopupClose = document.getElementById("history-popup-close") as HTMLButtonElement | null;

    function persistState() {
        const snapshot: StoredState = {
            version: 1,
            settings,
            advanced: advancedConfig,
            history,
            favorites,
            seed: state.seedCode
        };
        persistStored(snapshot);
    }
    function renderHistory() {
        const renderList = (el: HTMLElement | null) => {
            if (!el) return;
            el.innerHTML = history.map((entry) => `<li data-code="${entry}" class='${selectedHistories.has(entry) ? "selected" : ""}'>${entry}</li>`).join("");
        };
        renderList(historyList);
        renderList(historyPopupList);
    }

    function recordHistory(code: SaveCode) {
        if (history[0] !== code) {
            history.unshift(code);
            if (history.length > 100) history.length = 100;
        }
        renderHistory();
        persistState();
    }

    function updateDisplay() {
        const code = save(state);
        display.setPatterns(patterns, code, {enabled: settings.trackEnabled, volumes: settings.trackVolumes, synths: settings.trackSynths});
        recordHistory(code);
    }

    function afterDisplayUpdate() {
        const muteButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('.track-mute'));
        muteButtons.forEach((btn) => {
            const idx = parseInt(btn.dataset.track || '0', 10);
            btn.textContent = settings.trackEnabled[idx] ? 'Mute' : 'Unmute';
            btn.onclick = () => {
                settings.trackEnabled[idx] = !settings.trackEnabled[idx];
                if (trackToggles[idx]) trackToggles[idx]!.checked = settings.trackEnabled[idx];
                applySettings();
            };
        });
        const volSliders = Array.from(document.querySelectorAll<HTMLInputElement>('.track-volume'));
        volSliders.forEach((slider) => {
            const idx = parseInt(slider.dataset.track || '0', 10);
            const vol = Math.max(0, Math.min(1, settings.trackVolumes[idx] ?? 1));
            slider.value = String(Math.round(vol * 100));
            slider.addEventListener('input', () => {
                const v = Math.max(0, Math.min(100, parseInt(slider.value, 10) || 0));
                settings.trackVolumes[idx] = v / 100;
                persistState();
            });
        });
        const synthSelects = Array.from(document.querySelectorAll<HTMLSelectElement>('.track-synth'));
        synthSelects.forEach((sel) => {
            const idx = parseInt(sel.dataset.track || '0', 10);
            sel.value = settings.trackSynths[idx] || (idx === 4 ? 'drums' : 'acid8');
            sel.onchange = () => {
                const val = sel.value;
                stopTrack(idx);
                settings.trackSynths[idx] = val;
                const prev = synths as any[];
                rebuildSynthsPreserve(prev);
                stopTrack(idx);
                persistState();
            };
        });
    }

    // create initial patterns
    newPatterns();
    updateDisplay();
    afterDisplayUpdate();

    const silentNote = {note: '---'} as Note;
    const silentDrum = {drum: '---'} as Drum;

    function stopTrack(idx: number) {
        const synth: any = synths[idx];
        if (synth?.stop) {
            synth.stop();
            return;
        }
        const isDrum = idx === 4;
        synth?.play(isDrum ? silentDrum : silentNote as any);
    }

    function disposeTrack(idx: number) {
        const synth: any = synths[idx];
        if (synth?.dispose) {
            synth.dispose();
        }
    }

    function rebuildSynthsPreserve(prev?: any[]) {
        if (prev) {
            prev.forEach((s) => { try { s?.stop?.(); s?.dispose?.(); } catch {} });
        }
        rebuildSynths();
    }

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
    const randomizeSettingsButton = document.getElementById("randomize-settings") as HTMLButtonElement | null;
    const randomizePatternsButton = document.getElementById("randomize-patterns") as HTMLButtonElement | null;
    const randomizeKeysButton = document.getElementById("randomize-keys") as HTMLButtonElement | null;
    const playToggle = document.getElementById("play-toggle") as HTMLButtonElement | null;
    const infoToggle = document.getElementById("info-toggle") as HTMLButtonElement | null;
    const howtoToggle = document.getElementById("howto-toggle") as HTMLButtonElement | null;
    const infoPopup = document.getElementById("info-popup");
    const infoClose = document.getElementById("info-close") as HTMLButtonElement | null;
    const minimizeToggle = document.getElementById("minimize-toggle") as HTMLButtonElement | null;
    const settingsPanel = document.getElementById("settings-panel");
    const historyToggle = document.getElementById("history-toggle") as HTMLButtonElement | null;
    const historyPanel = document.getElementById("history-panel");
    const favoritesToggle = document.getElementById("favorites-toggle") as HTMLButtonElement | null;
    const favoritesPanel = document.getElementById("favorites-panel");
    const favoritesClose = document.getElementById("favorites-close") as HTMLButtonElement | null;
    const favoritesList = document.getElementById("favorites-list");
    const favoritesExport = document.getElementById("favorites-export") as HTMLButtonElement | null;
    const favoritesImport = document.getElementById("favorites-import") as HTMLButtonElement | null;
    const favoritesCopy = document.getElementById("favorites-copy") as HTMLButtonElement | null;
    const favoritesRemove = document.getElementById("favorites-remove") as HTMLButtonElement | null;
    const advancedExport = document.getElementById("advanced-export") as HTMLButtonElement | null;
    const advancedImport = document.getElementById("advanced-import") as HTMLButtonElement | null;
    const advancedImportFile = document.getElementById("advanced-import-file") as HTMLInputElement | null;
    const howtoPopup = document.getElementById("howto-popup");
    const howtoClose = document.getElementById("howto-close") as HTMLButtonElement | null;
    const howtoBody = document.getElementById("howto-body");
    const historyExport = document.getElementById("history-export") as HTMLButtonElement | null;
    const historyImport = document.getElementById("history-import") as HTMLButtonElement | null;
    const historyCopy = document.getElementById("history-copy") as HTMLButtonElement | null;
    const historyRemove = document.getElementById("history-remove") as HTMLButtonElement | null;
    const advancedToggle = document.getElementById("advanced-toggle") as HTMLButtonElement | null;
    const advancedPopup = document.getElementById("advanced-popup");
    const advancedText = document.getElementById("advanced-text") as HTMLTextAreaElement | null;
    const advancedSave = document.getElementById("advanced-save") as HTMLButtonElement | null;
    const advancedCancel = document.getElementById("advanced-cancel") as HTMLButtonElement | null;
    const advancedReset = document.getElementById("advanced-reset") as HTMLButtonElement | null;
    const lockKey = document.getElementById("lock-key") as HTMLInputElement | null;
    const lockRangeMin = document.getElementById("lock-range-min") as HTMLInputElement | null;
    const lockRangeMax = document.getElementById("lock-range-max") as HTMLInputElement | null;
    const lockBpm = document.getElementById("lock-bpm") as HTMLInputElement | null;
    const lockTempo = document.getElementById("lock-tempo") as HTMLInputElement | null;
    const lockKeys = document.getElementById("lock-keys") as HTMLInputElement | null;
    const lockTracks = document.getElementById("lock-tracks") as HTMLInputElement | null;
    const lockPane = document.getElementById("lock-pane");
    const lockPaneKey = document.getElementById("lock-pane-key") as HTMLInputElement | null;
    const lockPaneRangeMin = document.getElementById("lock-pane-range-min") as HTMLInputElement | null;
    const lockPaneRangeMax = document.getElementById("lock-pane-range-max") as HTMLInputElement | null;
    const lockPaneBpm = document.getElementById("lock-pane-bpm") as HTMLInputElement | null;
    const lockPaneTempo = document.getElementById("lock-pane-tempo") as HTMLInputElement | null;
    const lockPaneKeys = document.getElementById("lock-pane-keys") as HTMLInputElement | null;
    const lockPaneTracks = document.getElementById("lock-pane-tracks") as HTMLInputElement | null;
    const trackToggles = [
        document.getElementById("track-1") as HTMLInputElement | null,
        document.getElementById("track-2") as HTMLInputElement | null,
        document.getElementById("track-3") as HTMLInputElement | null,
        document.getElementById("track-4") as HTMLInputElement | null,
        document.getElementById("track-5") as HTMLInputElement | null
    ];

    function syncLockPane() {
        if (!lockPane) return;
        lockPane.style.display = settingsPanel && !settingsPanel.classList.contains("minimized") ? "block" : "none";
        const map = [
            [lockPaneKey, lockKey, "key"],
            [lockPaneRangeMin, lockRangeMin, "rangeMin"],
            [lockPaneRangeMax, lockRangeMax, "rangeMax"],
            [lockPaneBpm, lockBpm, "bpm"],
            [lockPaneTempo, lockTempo, "tempo"],
            [lockPaneKeys, lockKeys, "keys"],
            [lockPaneTracks, lockTracks, "tracks"]
        ] as const;
        map.forEach(([pane, main]) => {
            if (pane && main) pane.checked = main.checked;
        });
    }

    function applySettings(options: { bpm?: boolean; tempo?: boolean } = {}) {
        if (lockKey) settings.locks.key = lockKey.checked;
        if (lockRangeMin) settings.locks.rangeMin = lockRangeMin.checked;
        if (lockRangeMax) settings.locks.rangeMax = lockRangeMax.checked;
        if (lockBpm) settings.locks.bpm = lockBpm.checked;
        if (lockTempo) settings.locks.tempo = lockTempo.checked;
        if (lockKeys) settings.locks.keys = lockKeys.checked;
        if (lockTracks) settings.locks.tracks = lockTracks.checked;

        syncLockPane();

        if (minOctaveSelect && maxOctaveSelect) {
            if (!settings.locks.rangeMin) settings.minOctave = ensureOctave(minOctaveSelect.value, settings.minOctave);
            if (!settings.locks.rangeMax) settings.maxOctave = ensureOctave(maxOctaveSelect.value, settings.maxOctave);
            settings.minOctave = clampToOptions(minOctaveSelect, settings.minOctave);
            settings.maxOctave = clampToOptions(maxOctaveSelect, settings.maxOctave);
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
                if (!settings.trackEnabled[i]) stopTrack(i);
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
        afterDisplayUpdate();
        if (playing) {
            clock.set(effectiveBpm(), frame);
        }
        persistState();
    }

    if (keySelect) {
        keySelect.value = String(settings.keyOverride ?? state.key);
        keySelect.addEventListener("change", () => applySettings());
    }
    if (minOctaveSelect) {
        minOctaveSelect.value = String(settings.minOctave);
        minOctaveSelect.addEventListener("change", () => applySettings());
    }
    if (maxOctaveSelect) {
        maxOctaveSelect.value = String(settings.maxOctave);
        maxOctaveSelect.addEventListener("change", () => applySettings());
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
            input.addEventListener("change", () => applySettings());
        });
    }
    trackToggles.forEach((toggle, i) => {
        if (!toggle) return;
        toggle.checked = settings.trackEnabled[i];
        toggle.addEventListener("change", () => applySettings());
    });
    [lockKey, lockRangeMin, lockRangeMax, lockBpm, lockTempo, lockKeys, lockTracks].forEach((lock) => {
        if (!lock) return;
        lock.addEventListener("change", () => applySettings());
    });

    [
        [lockPaneKey, lockKey],
        [lockPaneRangeMin, lockRangeMin],
        [lockPaneRangeMax, lockRangeMax],
        [lockPaneBpm, lockBpm],
        [lockPaneTempo, lockTempo],
        [lockPaneKeys, lockKeys],
        [lockPaneTracks, lockTracks]
    ].forEach(([pane, main]) => {
        if (!pane || !main) return;
        pane.addEventListener("change", () => {
            main.checked = pane.checked;
            applySettings();
        });
    });
    const synthChoices = ['acid8','acid','bass','square','saw','rev-saw','triangle','sine'];

    if (randomizeSettingsButton) {
        randomizeSettingsButton.addEventListener("click", () => {
            if (advancedConfig.randomize.bpm && !settings.locks.bpm) {
                const {min, max} = safeRange(advancedConfig.bpm, defaultAdvancedConfig.bpm);
                state.bpm = Math.floor(rnd() * (max - min + 1)) + min;
            }
            const rangeMinChoices = (advancedConfig.rangeMinChoices || defaultAdvancedConfig.rangeMinChoices).filter((v: any) => Number.isFinite(v));
            const rangeMaxChoices = (advancedConfig.rangeMaxChoices || defaultAdvancedConfig.rangeMaxChoices).filter((v: any) => Number.isFinite(v));
            if (advancedConfig.randomize.range && !settings.locks.rangeMin && rangeMinChoices.length) settings.minOctave = ensureOctave(choose(rangeMinChoices), settings.minOctave);
            if (advancedConfig.randomize.range && !settings.locks.rangeMax && rangeMaxChoices.length) settings.maxOctave = ensureOctave(choose(rangeMaxChoices), settings.maxOctave);
            if (settings.maxOctave < settings.minOctave) {
                const t = settings.maxOctave;
                settings.maxOctave = settings.minOctave;
                settings.minOctave = t;
            }
            if (advancedConfig.randomize.tempo && !settings.locks.tempo) {
                const {min, max} = safeRange(advancedConfig.tempo, defaultAdvancedConfig.tempo);
                settings.tempo = Math.round((min + rnd() * (max - min)) * 100) / 100;
            }
            if (advancedConfig.randomize.tracks && !settings.locks.tracks) settings.trackEnabled = settings.trackEnabled.map(() => rnd() > 0.1);
            settings.trackEnabled.forEach((enabled: boolean, idx: number) => { if (!enabled) stopTrack(idx); });

            if (advancedConfig.randomize.instruments) {
                settings.trackSynths = settings.trackSynths.map((_unused: string, idx: number) => idx === 4 ? 'drums' : choose(synthChoices));
                normalizeTrackSynths();
                rebuildSynthsPreserve(synths as any[]);
            }

            if (minOctaveSelect) minOctaveSelect.value = String(settings.minOctave);
            if (maxOctaveSelect) maxOctaveSelect.value = String(settings.maxOctave);
            if (bpmSlider) bpmSlider.value = String(state.bpm);
            if (bpmValue) bpmValue.textContent = String(state.bpm);
            if (tempoSlider) tempoSlider.value = String(Math.round(settings.tempo * 100));
            if (tempoValue) tempoValue.textContent = `${Math.round(settings.tempo * 100)}%`;
            trackToggles.forEach((toggle, i) => {
                if (toggle) toggle.checked = settings.trackEnabled[i];
            });

            applySettings();
        });
    }

    if (randomizeKeysButton) {
        randomizeKeysButton.addEventListener("click", () => {
            if (advancedConfig.randomize.key && !settings.locks.key) {
                state.key = choose([5, 5, 5, 0, 10, 3]) as Key;
                settings.keyOverride = state.key;
            }
            if (advancedConfig.randomize.progression) {
                state.scale = music.scales.minor;
                state.progression = choose(progressions);
            }
            if (advancedConfig.randomize.keys && !settings.locks.keys) {
                settings.noteMask = new Array(12).fill(false).map((_, i) => [0,2,3,5,7,8,10].includes(i) ? rnd() > 0.1 : rnd() > 0.75);
                if (!settings.noteMask.some(Boolean)) {
                    settings.noteMask[0] = true;
                    settings.noteMask[5] = true;
                }
            }
            if (keySelect) keySelect.value = String(settings.keyOverride ?? state.key);
            if (noteGrid) {
                const inputs = Array.from(noteGrid.querySelectorAll("input[type='checkbox']")) as HTMLInputElement[];
                inputs.forEach((input, i) => {
                    input.checked = settings.noteMask[i] ?? true;
                });
            }
            applySettings();
        });
    }

    if (randomizePatternsButton) {
        randomizePatternsButton.addEventListener("click", () => {
            // new seed to change Pattern ID while staying in playback
            state.seedCode = hex(rndInt(255)) +hex(rndInt(255)) + hex(rndInt(255)) + hex(rndInt(255));
            seedRNG(state.seedCode);
            newPatterns();
            if (!settings.locks.tracks) {
                settings.trackEnabled = settings.trackEnabled.map(() => rnd() > 0.2);
                settings.trackEnabled.forEach((enabled: boolean, idx: number) => { if (!enabled) stopTrack(idx); });
                trackToggles.forEach((toggle, i) => { if (toggle) toggle.checked = settings.trackEnabled[i]; });
            }
            updateDisplay();
            afterDisplayUpdate();
            persistState();
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
                // fully dispose and rebuild to clear any stuck voices
                rebuildSynthsPreserve(synths as any[]);
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
            syncLockPane();
        });
    }
    if (historyToggle && historyPanel) {
        historyToggle.addEventListener("click", () => {
            if (historyPopup) {
                historyPopup.style.display = historyPopup.style.display === "block" ? "none" : "block";
            } else {
                historyPanel.style.display = historyPanel.style.display === "block" ? "none" : "block";
            }
            renderHistory();
        });
    }

    if (historyPopupClose && historyPopup) {
        historyPopupClose.addEventListener("click", () => {
            historyPopup.style.display = "none";
        });
    }

    function renderFavorites() {
        if (!favoritesList) return;
        favoritesList.innerHTML = favorites
            .slice(0, 100)
            .map((f, idx) => `<li data-index="${idx}" class='${selectedFavorites.has(idx) ? "selected" : ""}'><a href='?${f.code}' class='save-string'>${f.code}</a></li>`)
            .join("");
    }

    function addFavorite() {
        const code = save(state);
        const snapshot = {
            keyOverride: settings.keyOverride,
            minOctave: settings.minOctave,
            maxOctave: settings.maxOctave,
            noteMask: settings.noteMask,
            tempo: settings.tempo,
            trackEnabled: settings.trackEnabled,
            trackVolumes: settings.trackVolumes,
            locks: settings.locks
        };
        const existing = favorites.findIndex((f) => f.code === code);
        if (existing >= 0) favorites.splice(existing, 1);
        favorites.unshift({code, settings: snapshot, createdAt: Date.now()});
        if (favorites.length > 100) favorites.length = 100;
        renderFavorites();
        persistState();
    }

    // favorite button exists inside the display header; ensure it's bound after each redraw
    afterDisplayUpdate();

    // delegate click for favorite button to survive rerenders
    const displayRoot = document.getElementById("display");
    if (displayRoot) {
        displayRoot.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;
            if (target && target.id === 'favorite-current') {
                addFavorite();
            }
        });
    }

    function selectHistory(code: string | null, multi: boolean) {
        if (!code) { selectedHistories.clear(); renderHistory(); return; }
        if (multi) {
            if (selectedHistories.has(code)) selectedHistories.delete(code); else selectedHistories.add(code);
        } else {
            selectedHistories = new Set([code]);
        }
        renderHistory();
    }
    function selectFavorite(idx: number | null, multi: boolean) {
        if (idx === null || idx < 0) { selectedFavorites.clear(); renderFavorites(); return; }
        if (multi) {
            if (selectedFavorites.has(idx)) selectedFavorites.delete(idx); else selectedFavorites.add(idx);
        } else {
            selectedFavorites = new Set([idx]);
        }
        renderFavorites();
    }

    if (historyList) {
        historyList.addEventListener('click', (e) => {
            const li = (e.target as HTMLElement).closest('li');
            if (!li) return;
            selectHistory(li.getAttribute('data-code'), (e as MouseEvent).ctrlKey || (e as MouseEvent).metaKey);
        });
    }
    if (historyPopupList) {
        historyPopupList.addEventListener('click', (e) => {
            const li = (e.target as HTMLElement).closest('li');
            if (!li) return;
            selectHistory(li.getAttribute('data-code'), (e as MouseEvent).ctrlKey || (e as MouseEvent).metaKey);
        });
    }
    if (favoritesList) {
        favoritesList.addEventListener('click', (e) => {
            const li = (e.target as HTMLElement).closest('li');
            if (!li) return;
            const idx = parseInt(li.getAttribute('data-index') || '-1', 10);
            if (idx >= 0) selectFavorite(idx, (e as MouseEvent).ctrlKey || (e as MouseEvent).metaKey);
        });
    }

    if (favoritesToggle && favoritesPanel) {
        favoritesToggle.addEventListener("click", () => {
            favoritesPanel.style.display = favoritesPanel.style.display === "block" ? "none" : "block";
            if (historyPopup && historyPopup.style.display === "block") {
                const historyRect = historyPopup.getBoundingClientRect();
                favoritesPanel.style.left = `${historyRect.right + 12}px`;
                favoritesPanel.style.right = "auto";
            } else {
                favoritesPanel.style.left = "auto";
                favoritesPanel.style.right = "268px";
            }
            renderFavorites();
        });
    }
    if (favoritesClose && favoritesPanel) {
        favoritesClose.addEventListener("click", () => {
            favoritesPanel.style.display = "none";
        });
    }

    function blobDownload(name: string, data: string, type = 'application/json') {
        const blob = new Blob([data], {type});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = name;
        a.click();
        URL.revokeObjectURL(url);
    }

    if (historyExport) {
        historyExport.addEventListener('click', () => {
            if (selectedHistories.size === 0) {
                blobDownload('history-all.json', JSON.stringify(history, null, 2));
            } else {
                const entries = history.filter((h) => selectedHistories.has(h));
                blobDownload('history-selected.json', JSON.stringify(entries, null, 2));
            }
        });
    }
    if (historyCopy) {
        historyCopy.addEventListener('click', async () => {
            const entries = selectedHistories.size ? history.filter((h) => selectedHistories.has(h)) : history;
            if (!entries.length) { alert('Nothing to copy'); return; }
            try { await navigator.clipboard.writeText(entries.join('\n')); } catch { alert('Copy failed'); }
        });
    }
    if (historyRemove) {
        historyRemove.addEventListener('click', () => {
            if (selectedHistories.size === 0) return;
            for (const h of Array.from(selectedHistories)) {
                const idx = history.indexOf(h);
                if (idx >= 0) history.splice(idx,1);
            }
            selectedHistories.clear();
            renderHistory();
            persistState();
        });
    }
    if (historyImport) {
        historyImport.addEventListener('click', () => {
            const text = prompt('Paste save code or JSON array for history');
            if (!text) return;
            try {
                let entries: string[] = [];
                try {
                    const parsed = JSON.parse(text);
                    if (Array.isArray(parsed)) entries = parsed.map(String);
                } catch {
                    entries = text.split(/\s+/).filter(Boolean);
                }
                entries.forEach((code) => {
                    if (history[0] !== code) {
                        history.unshift(code);
                    }
                });
                if (history.length > 100) history.length = 100;
                renderHistory();
                persistState();
            } catch (err) {
                alert('Import failed');
            }
        });
    }

    if (favoritesExport) {
        favoritesExport.addEventListener('click', () => {
            const payload = selectedFavorites.size
                ? favorites.filter((_, idx) => selectedFavorites.has(idx))
                : favorites;
            if (!payload.length) { alert('Nothing selected to export'); return; }
            blobDownload('favorites.json', JSON.stringify(payload, null, 2));
        });
    }
    if (favoritesCopy) {
        favoritesCopy.addEventListener('click', async () => {
            const payload = selectedFavorites.size ? favorites.filter((_, idx) => selectedFavorites.has(idx)) : favorites;
            if (!payload.length) { alert('Nothing to copy'); return; }
            try { await navigator.clipboard.writeText(payload.map((f) => f.code).join('\n')); } catch { alert('Copy failed'); }
        });
    }
    if (favoritesRemove) {
        favoritesRemove.addEventListener('click', () => {
            if (selectedFavorites.size === 0) return;
            const toRemove = new Set(selectedFavorites);
            for (let i = favorites.length -1; i >=0; i--) {
                if (toRemove.has(i)) favorites.splice(i,1);
            }
            selectedFavorites.clear();
            renderFavorites();
            persistState();
        });
    }
    if (favoritesImport) {
        favoritesImport.addEventListener('click', () => {
            const text = prompt('Paste favorite JSON or save code');
            if (!text) return;
            try {
                let entries: any[] = [];
                try {
                    const parsed = JSON.parse(text);
                    if (Array.isArray(parsed)) entries = parsed; else entries = [parsed];
                } catch {
                    entries = [{code: text}];
                }
                entries.forEach((fav) => {
                    if (!fav.code) return;
                    const snapshot = fav.settings || {
                        keyOverride: settings.keyOverride,
                        minOctave: settings.minOctave,
                        maxOctave: settings.maxOctave,
                        noteMask: settings.noteMask,
                        tempo: settings.tempo,
                        trackEnabled: settings.trackEnabled,
                        trackVolumes: settings.trackVolumes,
                        locks: settings.locks
                    };
                    const existing = favorites.findIndex((f) => f.code === fav.code);
                    if (existing >= 0) favorites.splice(existing,1);
                    favorites.unshift({code: fav.code, settings: snapshot, createdAt: Date.now()});
                });
                if (favorites.length > 100) favorites.length = 100;
                renderFavorites();
                persistState();
            } catch (err) {
                alert('Import failed');
            }
        });
    }

    if (advancedExport) {
        advancedExport.addEventListener("click", () => {
            const payload: StoredState = {
                version: 1,
                settings,
                advanced: advancedConfig,
                history,
                favorites,
                seed: state.seedCode
            };
            const blob = new Blob([JSON.stringify(payload, null, 2)], {type: "application/json"});
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'autotracker-backup.json';
            a.click();
            URL.revokeObjectURL(url);
        });
    }

    if (advancedImport && advancedImportFile) {
        advancedImport.addEventListener("click", () => advancedImportFile.click());
        advancedImportFile.addEventListener("change", (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => {
                try {
                    const parsed = JSON.parse(String(reader.result)) as StoredState;
                    if (!parsed || typeof parsed !== 'object') throw new Error('Invalid file');
                    if (parsed.version !== 1) throw new Error('Unsupported version');
                    Object.assign(settings, parsed.settings || {});
                    advancedConfig = {
                        ...defaultAdvancedConfig,
                        ...(parsed.advanced || {})
                    };
                    history.length = 0;
                    if (Array.isArray(parsed.history)) history.push(...parsed.history.slice(0,100));
                    favorites.length = 0;
                    if (Array.isArray(parsed.favorites)) favorites.push(...parsed.favorites.slice(0,100));
                    if (parsed.seed) state.seedCode = parsed.seed;
                    // sync UI with new settings
                    applySettings({bpm: true, tempo: true});
                    renderFavorites();
                    recordHistory(save(state));
                    persistState();
                    alert('Import successful.');
                } catch (err) {
                    console.error(err);
                    alert('Import failed: ' + (err as Error).message);
                }
            };
            reader.readAsText(file);
            // reset input for next time
            advancedImportFile.value = '';
        });
    }

    let howtoLoaded = false;
    async function loadHowto() {
        if (howtoLoaded || !howtoBody) return;
        try {
            const res = await fetch('HOWTO.md');
            const text = await res.text();
            howtoBody.innerHTML = markdownToHtml(text);
            howtoLoaded = true;
        } catch (err) {
            howtoBody.innerHTML = '<p>Failed to load HOWTO.</p>';
        }
    }

    if (infoToggle && infoPopup) {
        infoToggle.addEventListener('click', () => {
            infoPopup.style.display = 'flex';
        });
    }
    if (howtoToggle && howtoPopup) {
        howtoToggle.addEventListener('click', async () => {
            await loadHowto();
            howtoPopup.style.display = 'flex';
        });
    }
    if (howtoClose && howtoPopup) {
        howtoClose.addEventListener('click', () => {
            howtoPopup.style.display = 'none';
        });
    }
    if (howtoPopup) {
        howtoPopup.addEventListener('click', (e) => {
            if (e.target === howtoPopup) howtoPopup.style.display = 'none';
        });
    }

    function advancedConfigToText(cfg: any) {
        const payload = {
            settings: {
                trackVolumes: settings.trackVolumes,
                trackEnabled: settings.trackEnabled,
                trackSynths: settings.trackSynths
            },
            advanced: {
                version: 1,
                randomizeEveryLoops: cfg.randomizeEveryLoops,
                randomize: cfg.randomize,
                bpm: cfg.bpm,
                tempo: cfg.tempo,
                rangeMinChoices: cfg.rangeMinChoices,
                rangeMaxChoices: cfg.rangeMaxChoices,
                synth: cfg.synth,
                trackSynths: cfg.trackSynths,
                theme: cfg.theme,
                layout: cfg.layout
            }
        };
        return `// Advanced settings (JSONC)\n// null = use default values\n// Edit settings.trackVolumes/trackEnabled and advanced.*.\n${JSON.stringify(payload, null, 2)}`;
    }
    function applyAdvancedConfig(next: any) {
        advancedConfig = {
            ...defaultAdvancedConfig,
            ...((next && next.advanced) || next || {})
        };
        if (next && next.settings) {
            if (Array.isArray(next.settings.trackVolumes)) {
                settings.trackVolumes = next.settings.trackVolumes.map((v: any) => Math.max(0, Math.min(1, Number(v) || 0))) as number[];
            }
            if (Array.isArray(next.settings.trackEnabled)) {
                settings.trackEnabled = next.settings.trackEnabled.map((v: any) => Boolean(v));
                trackToggles.forEach((t, i) => { if (t) t.checked = settings.trackEnabled[i] ?? true; });
            }
            if (Array.isArray(next.settings.trackSynths)) {
                settings.trackSynths = next.settings.trackSynths.map((v: any, idx: number) => idx === 4 ? 'drums' : String(v || 'acid8'));
                normalizeTrackSynths();
                rebuildSynthsPreserve(synths as any[]);
            }
        }
    }

    if (advancedToggle && advancedPopup && advancedText) {
        advancedToggle.addEventListener("click", () => {
            advancedText.value = advancedConfigToText(advancedConfig);
            advancedPopup.style.display = "flex";
        });
    }
    if (advancedCancel && advancedPopup) {
        advancedCancel.addEventListener("click", () => {
            advancedPopup.style.display = "none";
        });
    }
    if (advancedReset && advancedText) {
        advancedReset.addEventListener("click", () => {
            advancedConfig = JSON.parse(JSON.stringify(defaultAdvancedConfig));
            settings.trackVolumes = [...defaultStoredState.settings.trackVolumes];
            settings.trackEnabled = [...defaultStoredState.settings.trackEnabled];
            advancedText.value = advancedConfigToText(advancedConfig);
            applySettings();
            persistState();
        });
    }
    if (advancedSave && advancedPopup && advancedText) {
        advancedSave.addEventListener("click", () => {
            try {
                const parsed = parseJsonc(advancedText.value, advancedConfig);
                applyAdvancedConfig(parsed);
                advancedPopup.style.display = "none";
                applySettings({bpm: true, tempo: true});
                persistState();
            } catch (e) {
                advancedText.value = advancedConfigToText(advancedConfig);
                alert("Invalid JSON; reverted.");
            }
        });
    }

    // ensure lock pane matches on load
    syncLockPane();
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
