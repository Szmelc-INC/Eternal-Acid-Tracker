/*
  Copyright 2020 David Whiting
  This work is licensed under a Creative Commons Attribution 4.0 International License
  https://creativecommons.org/licenses/by/4.0/
*/
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import PatternDisplay from './display.js';
import { choose, rndInt, rnd, seedRNG } from './utils.js';
import Audio from "./audio.js";
import * as music from './theory.js';
import * as Generators from './generators.js';
const PatternSize = 64;
const STORAGE_KEY = 'autotracker:v1';
function stripJsonComments(text) {
    // removes // and /* */ outside of strings; simple, not perfect but sufficient for controlled JSONC input
    const stringRegex = /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g;
    const placeholders = [];
    const withoutStrings = text.replace(stringRegex, (m) => {
        placeholders.push(m);
        return `__STR_PLACEHOLDER_${placeholders.length - 1}__`;
    });
    const withoutComments = withoutStrings
        .replace(/\/\*[^]*?\*\//g, '')
        .replace(/(^|[^:])\/\/.*$/gm, '$1');
    return withoutComments.replace(/__STR_PLACEHOLDER_(\d+)__/g, (_, i) => placeholders[parseInt(i, 10)]);
}
function parseJsonc(text, fallback) {
    try {
        const stripped = stripJsonComments(text);
        const parsed = JSON.parse(stripped);
        return parsed;
    }
    catch (e) {
        console.warn('JSONC parse failed, reverting to fallback', e);
        return fallback;
    }
}
function markdownToHtml(md) {
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
const defaultStoredState = {
    version: 1,
    settings: {
        keyOverride: null,
        minOctave: -3,
        maxOctave: 7,
        noteMask: new Array(12).fill(false).map((_, i) => [0, 2, 3, 5, 7, 8, 10].includes(i)),
        tempo: 1,
        trackEnabled: [true, true, true, true, true],
        trackVolumes: [1, 1, 1, 1, 1],
        trackSynths: ["acid8", "acid8", "acid8", "acid8", "drums"],
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
            progression: true
        },
        bpm: { min: 70, max: 160 },
        tempo: { min: 0.75, max: 1.25 },
        rangeMinChoices: [-4, -3, -2, -1, 0, 1],
        rangeMaxChoices: [2, 3, 4, 5, 6, 7, 8],
        synth: {
            type: "acid8",
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
function loadStored() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw)
            return JSON.parse(JSON.stringify(defaultStoredState));
        const parsed = JSON.parse(raw);
        return Object.assign(Object.assign(Object.assign({}, JSON.parse(JSON.stringify(defaultStoredState))), parsed), { settings: Object.assign(Object.assign({}, defaultStoredState.settings), (parsed.settings || {})), advanced: Object.assign(Object.assign({}, defaultStoredState.advanced), (parsed.advanced || {})), history: Array.isArray(parsed.history) ? parsed.history : [], favorites: Array.isArray(parsed.favorites) ? parsed.favorites : [] });
    }
    catch (e) {
        console.warn('Failed to load stored state, using defaults', e);
        return JSON.parse(JSON.stringify(defaultStoredState));
    }
}
function persistStored(state) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }
    catch (e) {
        console.warn('Failed to persist state', e);
    }
}
const progressions = [
    [1, 1, 1, 1, 6, 6, 6, 6, 4, 4, 4, 4, 3, 3, 5, 5],
    [1, 1, 1, 1, 6, 6, 6, 6, 1, 1, 1, 1, 6, 6, 6, 6],
    [4, 4, 4, 4, 5, 5, 5, 5, 1, 1, 1, 1, 1, 1, 3, 3],
    [1, 1, 6, 6, 4, 4, 5, 5, 1, 1, 6, 6, 3, 3, 5, 5],
    [5, 5, 4, 4, 1, 1, 1, 1, 5, 5, 6, 6, 1, 1, 1, 1],
    [6, 6, 6, 6, 5, 5, 5, 5, 4, 4, 4, 4, 5, 5, 5, 5],
    [1, 1, 1, 1, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5],
    [6, 6, 6, 6, 4, 4, 4, 4, 1, 1, 1, 1, 1, 1, 5, 5],
    [1, 1, 1, 1, 1, 1, 1, 1, 4, 4, 4, 4, 4, 4, 4, 4]
];
function hex(v) { return Math.floor(v).toString(16).toUpperCase().padStart(2, '0'); }
function unhex(v) {
    return parseInt(v, 16);
}
function save(state) {
    const nonRandomElements = [state.key, state.scale == music.scales.major ? 0 : 1, progressions.indexOf(state.progression), state.bpm, state.songIndex % 256];
    const saveCode = "0x" + nonRandomElements.map(hex).join("") + state.seedCode;
    return saveCode;
}
function restore(code) {
    const codeString = code.slice(2);
    const key = unhex(codeString.slice(0, 2));
    const scale = unhex(codeString.slice(2, 4)) === 0 ? music.scales.major : music.scales.minor;
    const progression = progressions[unhex(codeString.slice(4, 6))];
    const bpm = unhex(codeString.slice(6, 8));
    const songIndex = unhex(codeString.slice(8, 10));
    const seedCode = codeString.slice(10);
    return {
        bpm,
        key,
        progression,
        scale,
        seedCode,
        songIndex
    };
}
function bpmClock() {
    let intervalHandle = {
        bpmClock: 0
    };
    let fN = 0;
    function set(bpm, frameFunction) {
        window.clearInterval(intervalHandle.bpmClock);
        intervalHandle.bpmClock = window.setInterval(() => frameFunction(fN++), (60000 / bpm) / 4);
    }
    return {
        set,
        stop: () => window.clearInterval(intervalHandle.bpmClock)
    };
}
function createInitialState(seedOrSave) {
    if (seedOrSave.startsWith("0x")) {
        return restore(seedOrSave);
    }
    else {
        seedRNG(seedOrSave && seedOrSave.length > 0 ? seedOrSave : "" + Math.random());
        return {
            key: 5,
            scale: music.scales.major,
            progression: progressions[0],
            bpm: 112,
            seedCode: createSeedCode(),
            songIndex: 0
        };
    }
}
function createSeedCode() {
    return hex(rndInt(255)) + hex(rndInt(255)) + hex(rndInt(255)) + hex(rndInt(255));
}
function mutateState(state) {
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
    state.seedCode = hex(rndInt(255)) + hex(rndInt(255)) + hex(rndInt(255)) + hex(rndInt(255));
    seedRNG(state.seedCode);
    //display.setPatterns(patterns, stateString);
}
function start() {
    var _a, _b, _c, _d, _e, _f, _g;
    const seedOrSave = document.getElementById("seed-text").value;
    const stored = loadStored();
    const state = createInitialState(seedOrSave || stored.seed || '');
    const settings = JSON.parse(JSON.stringify(Object.assign(Object.assign(Object.assign({}, defaultStoredState.settings), stored.settings), { trackVolumes: (_a = stored.settings.trackVolumes) !== null && _a !== void 0 ? _a : defaultStoredState.settings.trackVolumes, trackSynths: (_b = stored.settings.trackSynths) !== null && _b !== void 0 ? _b : defaultStoredState.settings.trackSynths })));
    const favorites = [...stored.favorites];
    const defaultAdvancedConfig = JSON.parse(JSON.stringify(Object.assign(Object.assign({}, defaultStoredState.advanced), { trackSynths: [
            { type: "acid8", detune: -0.25, drive: 260, filterQ: 14, level: 0.22 },
            { type: "acid8", detune: 0, drive: 230, filterQ: 12, level: 0.2 },
            { type: "acid8", detune: 0.25, drive: 260, filterQ: 14, level: 0.22 },
            { type: "acid8", detune: 0.5, drive: 260, filterQ: 14, level: 0.22 },
            { type: "drums", level: 0.3 }
        ], layout: {
            trackSpacingPx: 25,
            trackHeaderScale: 2,
            trackBorderColor: "rgba(102,153,255,0.4)",
            trackBackground: "rgba(0,0,0,0.25)"
        } })));
    let advancedConfig = JSON.parse(JSON.stringify(Object.assign(Object.assign({}, defaultAdvancedConfig), stored.advanced)));
    let patterns = [[], [], [], [], []];
    const display = PatternDisplay(document.getElementById("display"));
    const clock = bpmClock();
    // @ts-ignore
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const au = Audio(ctx);
    function buildSynth(type, pan, volRef, isDrum) {
        if (isDrum)
            return au.DrumSynth(volRef);
        switch (type) {
            case 'square': return au.SquareSynth(pan, volRef);
            case 'acid8':
            case 'acid':
            case 'bass': return au.AcidSynth(pan, volRef);
            case 'sine': return au.OscSynth('sine', pan, volRef);
            case 'triangle': return au.OscSynth('triangle', pan, volRef);
            case 'saw': return au.OscSynth('sawtooth', pan, volRef);
            case 'rev-saw': return au.OscSynth('sawtooth', pan, volRef, true);
            default: return au.SquareSynth(pan, volRef);
        }
    }
    let synths = [
        buildSynth(((_c = settings.trackSynths) === null || _c === void 0 ? void 0 : _c[0]) || 'acid8', 0, () => { var _a, _b; return (_b = (_a = settings.trackVolumes) === null || _a === void 0 ? void 0 : _a[0]) !== null && _b !== void 0 ? _b : 1; }, false),
        buildSynth(((_d = settings.trackSynths) === null || _d === void 0 ? void 0 : _d[1]) || 'acid8', -0.5, () => { var _a, _b; return (_b = (_a = settings.trackVolumes) === null || _a === void 0 ? void 0 : _a[1]) !== null && _b !== void 0 ? _b : 1; }, false),
        buildSynth(((_e = settings.trackSynths) === null || _e === void 0 ? void 0 : _e[2]) || 'acid8', 0, () => { var _a, _b; return (_b = (_a = settings.trackVolumes) === null || _a === void 0 ? void 0 : _a[2]) !== null && _b !== void 0 ? _b : 1; }, false),
        buildSynth(((_f = settings.trackSynths) === null || _f === void 0 ? void 0 : _f[3]) || 'acid8', 0.5, () => { var _a, _b; return (_b = (_a = settings.trackVolumes) === null || _a === void 0 ? void 0 : _a[3]) !== null && _b !== void 0 ? _b : 1; }, false),
        buildSynth('drums', 0, () => { var _a, _b; return (_b = (_a = settings.trackVolumes) === null || _a === void 0 ? void 0 : _a[4]) !== null && _b !== void 0 ? _b : 1; }, true)
    ];
    function currentContext() {
        var _a;
        return {
            progression: state.progression,
            key: (_a = settings.keyOverride) !== null && _a !== void 0 ? _a : state.key,
            scale: state.scale,
            minOctave: settings.minOctave,
            maxOctave: settings.maxOctave,
            noteMask: settings.noteMask
        };
    }
    function safeRange(range, fallback) {
        var _a, _b;
        const min = Number((_a = (range && range.min)) !== null && _a !== void 0 ? _a : NaN);
        const max = Number((_b = (range && range.max)) !== null && _b !== void 0 ? _b : NaN);
        if (!Number.isFinite(min) || !Number.isFinite(max))
            return Object.assign({}, fallback);
        if (min === max)
            return { min, max };
        if (min > max)
            return { min: max, max: min };
        return { min, max };
    }
    function clampToOptions(select, value) {
        const opts = Array.from(select.options)
            .map((o) => parseInt(o.value, 10))
            .filter((v) => Number.isFinite(v));
        if (!opts.length)
            return value;
        const min = Math.min(...opts);
        const max = Math.max(...opts);
        if (!Number.isFinite(value))
            return min;
        return Math.min(max, Math.max(min, value));
    }
    function ensureOctave(value, fallback) {
        const n = Number(value);
        if (!Number.isFinite(n))
            return fallback;
        return Math.max(-5, Math.min(10, Math.round(n)));
    }
    function newPatterns() {
        seedRNG(state.seedCode);
        const context = currentContext();
        patterns = [
            choose([Generators.bass, Generators.bass2, Generators.emptyNote])(context),
            rnd() < 0.7 ? Generators.arp(context) : Generators.emptyNote(),
            rnd() < 0.7 ? Generators.melody1(context) : Generators.emptyNote(),
            choose([Generators.emptyNote, Generators.arp, Generators.melody1])(context),
            rnd() < 0.8 ? Generators.drum() : Generators.emptyDrum(),
        ];
    }
    const history = [...stored.history];
    let selectedHistories = new Set();
    let selectedFavorites = new Set();
    const historyList = document.getElementById("history-list");
    const historyPopup = document.getElementById("history-popup");
    const historyPopupList = document.getElementById("history-popup-list");
    const historyPopupClose = document.getElementById("history-popup-close");
    function persistState() {
        const snapshot = {
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
        const renderList = (el) => {
            if (!el)
                return;
            el.innerHTML = history.map((entry) => `<li data-code="${entry}" class='${selectedHistories.has(entry) ? "selected" : ""}'>${entry}</li>`).join("");
        };
        renderList(historyList);
        renderList(historyPopupList);
    }
    function recordHistory(code) {
        if (history[0] !== code) {
            history.unshift(code);
            if (history.length > 100)
                history.length = 100;
        }
        renderHistory();
        persistState();
    }
    function updateDisplay() {
        const code = save(state);
        display.setPatterns(patterns, code, { enabled: settings.trackEnabled, volumes: settings.trackVolumes });
        recordHistory(code);
    }
    function afterDisplayUpdate() {
        const muteButtons = Array.from(document.querySelectorAll('.track-mute'));
        muteButtons.forEach((btn) => {
            const idx = parseInt(btn.dataset.track || '0', 10);
            btn.textContent = settings.trackEnabled[idx] ? 'Mute' : 'Unmute';
            btn.onclick = () => {
                settings.trackEnabled[idx] = !settings.trackEnabled[idx];
                if (trackToggles[idx])
                    trackToggles[idx].checked = settings.trackEnabled[idx];
                applySettings();
            };
        });
        const volSliders = Array.from(document.querySelectorAll('.track-volume'));
        volSliders.forEach((slider) => {
            var _a;
            const idx = parseInt(slider.dataset.track || '0', 10);
            const vol = Math.max(0, Math.min(1, (_a = settings.trackVolumes[idx]) !== null && _a !== void 0 ? _a : 1));
            slider.value = String(Math.round(vol * 100));
            slider.addEventListener('input', () => {
                const v = Math.max(0, Math.min(100, parseInt(slider.value, 10) || 0));
                settings.trackVolumes[idx] = v / 100;
                persistState();
            });
        });
        const synthSelects = Array.from(document.querySelectorAll('.track-synth'));
        synthSelects.forEach((sel) => {
            const idx = parseInt(sel.dataset.track || '0', 10);
            sel.value = settings.trackSynths[idx] || (idx === 4 ? 'drums' : 'acid8');
            sel.onchange = () => {
                var _a, _b, _c, _d;
                const val = sel.value;
                settings.trackSynths[idx] = val;
                // rebuild synths to apply new instrument immediately
                synths = [
                    buildSynth(((_a = settings.trackSynths) === null || _a === void 0 ? void 0 : _a[0]) || 'acid8', 0, () => { var _a, _b; return (_b = (_a = settings.trackVolumes) === null || _a === void 0 ? void 0 : _a[0]) !== null && _b !== void 0 ? _b : 1; }, false),
                    buildSynth(((_b = settings.trackSynths) === null || _b === void 0 ? void 0 : _b[1]) || 'acid8', -0.5, () => { var _a, _b; return (_b = (_a = settings.trackVolumes) === null || _a === void 0 ? void 0 : _a[1]) !== null && _b !== void 0 ? _b : 1; }, false),
                    buildSynth(((_c = settings.trackSynths) === null || _c === void 0 ? void 0 : _c[2]) || 'acid8', 0, () => { var _a, _b; return (_b = (_a = settings.trackVolumes) === null || _a === void 0 ? void 0 : _a[2]) !== null && _b !== void 0 ? _b : 1; }, false),
                    buildSynth(((_d = settings.trackSynths) === null || _d === void 0 ? void 0 : _d[3]) || 'acid8', 0.5, () => { var _a, _b; return (_b = (_a = settings.trackVolumes) === null || _a === void 0 ? void 0 : _a[3]) !== null && _b !== void 0 ? _b : 1; }, false),
                    buildSynth('drums', 0, () => { var _a, _b; return (_b = (_a = settings.trackVolumes) === null || _a === void 0 ? void 0 : _a[4]) !== null && _b !== void 0 ? _b : 1; }, true)
                ];
                stopTrack(idx);
                persistState();
            };
        });
    }
    // create initial patterns
    newPatterns();
    updateDisplay();
    afterDisplayUpdate();
    const silentNote = { note: '---' };
    const silentDrum = { drum: '---' };
    function stopTrack(idx) {
        var _a;
        const isDrum = idx === 4;
        (_a = synths[idx]) === null || _a === void 0 ? void 0 : _a.play(isDrum ? silentDrum : silentNote);
    }
    function effectiveBpm() {
        return Math.max(40, Math.round(state.bpm * settings.tempo));
    }
    function frame(f) {
        var _a;
        const positionInPattern = f % PatternSize;
        if (f % 128 === 0 && f !== 0) {
            const previousBpm = state.bpm;
            const previousKey = state.key;
            mutateState(state);
            if (settings.locks.bpm) {
                state.bpm = previousBpm;
            }
            if (settings.locks.key) {
                state.key = (_a = settings.keyOverride) !== null && _a !== void 0 ? _a : previousKey;
            }
            else if (settings.keyOverride !== null) {
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
    const keySelect = document.getElementById("key-select");
    const minOctaveSelect = document.getElementById("range-min");
    const maxOctaveSelect = document.getElementById("range-max");
    const bpmSlider = document.getElementById("bpm-slider");
    const tempoSlider = document.getElementById("tempo-slider");
    const bpmValue = document.getElementById("bpm-value");
    const tempoValue = document.getElementById("tempo-value");
    const noteGrid = document.getElementById("note-grid");
    const randomizeButton = document.getElementById("randomize");
    const playToggle = document.getElementById("play-toggle");
    const infoToggle = document.getElementById("info-toggle");
    const howtoToggle = document.getElementById("howto-toggle");
    const infoPopup = document.getElementById("info-popup");
    const infoClose = document.getElementById("info-close");
    const minimizeToggle = document.getElementById("minimize-toggle");
    const settingsPanel = document.getElementById("settings-panel");
    const historyToggle = document.getElementById("history-toggle");
    const historyPanel = document.getElementById("history-panel");
    const favoritesToggle = document.getElementById("favorites-toggle");
    const favoritesPanel = document.getElementById("favorites-panel");
    const favoritesClose = document.getElementById("favorites-close");
    const favoritesList = document.getElementById("favorites-list");
    const favoritesExport = document.getElementById("favorites-export");
    const favoritesImport = document.getElementById("favorites-import");
    const favoritesCopy = document.getElementById("favorites-copy");
    const favoritesRemove = document.getElementById("favorites-remove");
    const advancedExport = document.getElementById("advanced-export");
    const advancedImport = document.getElementById("advanced-import");
    const advancedImportFile = document.getElementById("advanced-import-file");
    const howtoPopup = document.getElementById("howto-popup");
    const howtoClose = document.getElementById("howto-close");
    const howtoBody = document.getElementById("howto-body");
    const historyExport = document.getElementById("history-export");
    const historyImport = document.getElementById("history-import");
    const historyCopy = document.getElementById("history-copy");
    const historyRemove = document.getElementById("history-remove");
    const advancedToggle = document.getElementById("advanced-toggle");
    const advancedPopup = document.getElementById("advanced-popup");
    const advancedText = document.getElementById("advanced-text");
    const advancedSave = document.getElementById("advanced-save");
    const advancedCancel = document.getElementById("advanced-cancel");
    const advancedReset = document.getElementById("advanced-reset");
    const lockKey = document.getElementById("lock-key");
    const lockRangeMin = document.getElementById("lock-range-min");
    const lockRangeMax = document.getElementById("lock-range-max");
    const lockBpm = document.getElementById("lock-bpm");
    const lockTempo = document.getElementById("lock-tempo");
    const lockKeys = document.getElementById("lock-keys");
    const lockTracks = document.getElementById("lock-tracks");
    const lockPane = document.getElementById("lock-pane");
    const lockPaneKey = document.getElementById("lock-pane-key");
    const lockPaneRangeMin = document.getElementById("lock-pane-range-min");
    const lockPaneRangeMax = document.getElementById("lock-pane-range-max");
    const lockPaneBpm = document.getElementById("lock-pane-bpm");
    const lockPaneTempo = document.getElementById("lock-pane-tempo");
    const lockPaneKeys = document.getElementById("lock-pane-keys");
    const lockPaneTracks = document.getElementById("lock-pane-tracks");
    const trackToggles = [
        document.getElementById("track-1"),
        document.getElementById("track-2"),
        document.getElementById("track-3"),
        document.getElementById("track-4"),
        document.getElementById("track-5")
    ];
    function syncLockPane() {
        if (!lockPane)
            return;
        lockPane.style.display = settingsPanel && !settingsPanel.classList.contains("minimized") ? "block" : "none";
        const map = [
            [lockPaneKey, lockKey, "key"],
            [lockPaneRangeMin, lockRangeMin, "rangeMin"],
            [lockPaneRangeMax, lockRangeMax, "rangeMax"],
            [lockPaneBpm, lockBpm, "bpm"],
            [lockPaneTempo, lockTempo, "tempo"],
            [lockPaneKeys, lockKeys, "keys"],
            [lockPaneTracks, lockTracks, "tracks"]
        ];
        map.forEach(([pane, main]) => {
            if (pane && main)
                pane.checked = main.checked;
        });
    }
    function applySettings(options = {}) {
        var _a;
        if (lockKey)
            settings.locks.key = lockKey.checked;
        if (lockRangeMin)
            settings.locks.rangeMin = lockRangeMin.checked;
        if (lockRangeMax)
            settings.locks.rangeMax = lockRangeMax.checked;
        if (lockBpm)
            settings.locks.bpm = lockBpm.checked;
        if (lockTempo)
            settings.locks.tempo = lockTempo.checked;
        if (lockKeys)
            settings.locks.keys = lockKeys.checked;
        if (lockTracks)
            settings.locks.tracks = lockTracks.checked;
        syncLockPane();
        if (minOctaveSelect && maxOctaveSelect) {
            if (!settings.locks.rangeMin)
                settings.minOctave = ensureOctave(minOctaveSelect.value, settings.minOctave);
            if (!settings.locks.rangeMax)
                settings.maxOctave = ensureOctave(maxOctaveSelect.value, settings.maxOctave);
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
                settings.keyOverride = selected;
                state.key = settings.keyOverride;
            }
            keySelect.value = String((_a = settings.keyOverride) !== null && _a !== void 0 ? _a : state.key);
        }
        if (options.bpm && bpmSlider && !settings.locks.bpm) {
            state.bpm = parseInt(bpmSlider.value, 10);
            if (bpmValue)
                bpmValue.textContent = String(state.bpm);
        }
        if (options.tempo && tempoSlider && !settings.locks.tempo) {
            settings.tempo = parseInt(tempoSlider.value, 10) / 100;
            if (tempoValue)
                tempoValue.textContent = `${Math.round(settings.tempo * 100)}%`;
        }
        if (bpmSlider)
            bpmSlider.value = String(state.bpm);
        if (tempoSlider)
            tempoSlider.value = String(Math.round(settings.tempo * 100));
        if (noteGrid) {
            const inputs = Array.from(noteGrid.querySelectorAll("input[type='checkbox']"));
            if (!settings.locks.keys) {
                settings.noteMask = inputs.map((input) => input.checked);
            }
            else {
                inputs.forEach((input, i) => {
                    var _a;
                    input.checked = (_a = settings.noteMask[i]) !== null && _a !== void 0 ? _a : true;
                });
            }
            inputs.forEach((input) => {
                input.disabled = settings.locks.keys;
            });
        }
        trackToggles.forEach((toggle, i) => {
            if (!toggle)
                return;
            if (!settings.locks.tracks) {
                settings.trackEnabled[i] = toggle.checked;
                if (!settings.trackEnabled[i])
                    stopTrack(i);
            }
            else {
                toggle.checked = settings.trackEnabled[i];
            }
            toggle.disabled = settings.locks.tracks;
        });
        if (keySelect)
            keySelect.disabled = settings.locks.key;
        if (minOctaveSelect)
            minOctaveSelect.disabled = settings.locks.rangeMin;
        if (maxOctaveSelect)
            maxOctaveSelect.disabled = settings.locks.rangeMax;
        if (bpmSlider)
            bpmSlider.disabled = settings.locks.bpm;
        if (tempoSlider)
            tempoSlider.disabled = settings.locks.tempo;
        newPatterns();
        updateDisplay();
        afterDisplayUpdate();
        if (playing) {
            clock.set(effectiveBpm(), frame);
        }
        persistState();
    }
    if (keySelect) {
        keySelect.value = String((_g = settings.keyOverride) !== null && _g !== void 0 ? _g : state.key);
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
        if (bpmValue)
            bpmValue.textContent = String(state.bpm);
        bpmSlider.addEventListener("input", () => applySettings({ bpm: true }));
    }
    if (tempoSlider) {
        tempoSlider.value = String(Math.round(settings.tempo * 100));
        if (tempoValue)
            tempoValue.textContent = `${Math.round(settings.tempo * 100)}%`;
        tempoSlider.addEventListener("input", () => applySettings({ tempo: true }));
    }
    if (noteGrid) {
        const inputs = Array.from(noteGrid.querySelectorAll("input[type='checkbox']"));
        inputs.forEach((input, i) => {
            var _a;
            input.checked = (_a = settings.noteMask[i]) !== null && _a !== void 0 ? _a : true;
            input.addEventListener("change", () => applySettings());
        });
    }
    trackToggles.forEach((toggle, i) => {
        if (!toggle)
            return;
        toggle.checked = settings.trackEnabled[i];
        toggle.addEventListener("change", () => applySettings());
    });
    [lockKey, lockRangeMin, lockRangeMax, lockBpm, lockTempo, lockKeys, lockTracks].forEach((lock) => {
        if (!lock)
            return;
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
        if (!pane || !main)
            return;
        pane.addEventListener("change", () => {
            main.checked = pane.checked;
            applySettings();
        });
    });
    if (randomizeButton) {
        randomizeButton.addEventListener("click", () => {
            var _a;
            // Prefer heavy/low defaults and minor-ish note masks (D minor by default key=5)
            if (advancedConfig.randomize.key && !settings.locks.key) {
                state.key = choose([5, 5, 5, 0, 10, 3]);
                settings.keyOverride = state.key;
            }
            if (advancedConfig.randomize.progression) {
                state.scale = music.scales.minor;
                state.progression = choose(progressions);
            }
            if (advancedConfig.randomize.bpm && !settings.locks.bpm) {
                const { min, max } = safeRange(advancedConfig.bpm, defaultAdvancedConfig.bpm);
                state.bpm = Math.floor(rnd() * (max - min + 1)) + min;
            }
            const rangeMinChoices = (advancedConfig.rangeMinChoices || defaultAdvancedConfig.rangeMinChoices).filter((v) => Number.isFinite(v));
            const rangeMaxChoices = (advancedConfig.rangeMaxChoices || defaultAdvancedConfig.rangeMaxChoices).filter((v) => Number.isFinite(v));
            if (advancedConfig.randomize.range && !settings.locks.rangeMin && rangeMinChoices.length)
                settings.minOctave = ensureOctave(choose(rangeMinChoices), settings.minOctave);
            if (advancedConfig.randomize.range && !settings.locks.rangeMax && rangeMaxChoices.length)
                settings.maxOctave = ensureOctave(choose(rangeMaxChoices), settings.maxOctave);
            if (settings.maxOctave < settings.minOctave) {
                const t = settings.maxOctave;
                settings.maxOctave = settings.minOctave;
                settings.minOctave = t;
            }
            if (advancedConfig.randomize.tempo && !settings.locks.tempo) {
                const { min, max } = safeRange(advancedConfig.tempo, defaultAdvancedConfig.tempo);
                settings.tempo = Math.round((min + rnd() * (max - min)) * 100) / 100;
            }
            if (advancedConfig.randomize.keys && !settings.locks.keys) {
                settings.noteMask = new Array(12).fill(false).map((_, i) => [0, 2, 3, 5, 7, 8, 10].includes(i) ? rnd() > 0.1 : rnd() > 0.75);
                if (!settings.noteMask.some(Boolean)) {
                    settings.noteMask[0] = true;
                    settings.noteMask[5] = true;
                }
            }
            if (advancedConfig.randomize.tracks && !settings.locks.tracks)
                settings.trackEnabled = settings.trackEnabled.map(() => rnd() > 0.1);
            settings.trackEnabled.forEach((enabled, idx) => { if (!enabled)
                stopTrack(idx); });
            if (keySelect)
                keySelect.value = String((_a = settings.keyOverride) !== null && _a !== void 0 ? _a : state.key);
            if (minOctaveSelect)
                minOctaveSelect.value = String(settings.minOctave);
            if (maxOctaveSelect)
                maxOctaveSelect.value = String(settings.maxOctave);
            if (bpmSlider)
                bpmSlider.value = String(state.bpm);
            if (bpmValue)
                bpmValue.textContent = String(state.bpm);
            if (tempoSlider)
                tempoSlider.value = String(Math.round(settings.tempo * 100));
            if (tempoValue)
                tempoValue.textContent = `${Math.round(settings.tempo * 100)}%`;
            if (noteGrid) {
                const inputs = Array.from(noteGrid.querySelectorAll("input[type='checkbox']"));
                inputs.forEach((input, i) => {
                    var _a;
                    input.checked = (_a = settings.noteMask[i]) !== null && _a !== void 0 ? _a : true;
                });
            }
            trackToggles.forEach((toggle, i) => {
                if (toggle)
                    toggle.checked = settings.trackEnabled[i];
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
            }
            else {
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
            if (e.target === infoPopup)
                infoPopup.style.display = "none";
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
            }
            else {
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
        if (!favoritesList)
            return;
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
        if (existing >= 0)
            favorites.splice(existing, 1);
        favorites.unshift({ code, settings: snapshot, createdAt: Date.now() });
        if (favorites.length > 100)
            favorites.length = 100;
        renderFavorites();
        persistState();
    }
    // favorite button exists inside the display header; ensure it's bound after each redraw
    afterDisplayUpdate();
    // delegate click for favorite button to survive rerenders
    const displayRoot = document.getElementById("display");
    if (displayRoot) {
        displayRoot.addEventListener('click', (e) => {
            const target = e.target;
            if (target && target.id === 'favorite-current') {
                addFavorite();
            }
        });
    }
    function selectHistory(code, multi) {
        if (!code) {
            selectedHistories.clear();
            renderHistory();
            return;
        }
        if (multi) {
            if (selectedHistories.has(code))
                selectedHistories.delete(code);
            else
                selectedHistories.add(code);
        }
        else {
            selectedHistories = new Set([code]);
        }
        renderHistory();
    }
    function selectFavorite(idx, multi) {
        if (idx === null || idx < 0) {
            selectedFavorites.clear();
            renderFavorites();
            return;
        }
        if (multi) {
            if (selectedFavorites.has(idx))
                selectedFavorites.delete(idx);
            else
                selectedFavorites.add(idx);
        }
        else {
            selectedFavorites = new Set([idx]);
        }
        renderFavorites();
    }
    if (historyList) {
        historyList.addEventListener('click', (e) => {
            const li = e.target.closest('li');
            if (!li)
                return;
            selectHistory(li.getAttribute('data-code'), e.ctrlKey || e.metaKey);
        });
    }
    if (historyPopupList) {
        historyPopupList.addEventListener('click', (e) => {
            const li = e.target.closest('li');
            if (!li)
                return;
            selectHistory(li.getAttribute('data-code'), e.ctrlKey || e.metaKey);
        });
    }
    if (favoritesList) {
        favoritesList.addEventListener('click', (e) => {
            const li = e.target.closest('li');
            if (!li)
                return;
            const idx = parseInt(li.getAttribute('data-index') || '-1', 10);
            if (idx >= 0)
                selectFavorite(idx, e.ctrlKey || e.metaKey);
        });
    }
    if (favoritesToggle && favoritesPanel) {
        favoritesToggle.addEventListener("click", () => {
            favoritesPanel.style.display = favoritesPanel.style.display === "block" ? "none" : "block";
            if (historyPopup && historyPopup.style.display === "block") {
                const historyRect = historyPopup.getBoundingClientRect();
                favoritesPanel.style.left = `${historyRect.right + 12}px`;
                favoritesPanel.style.right = "auto";
            }
            else {
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
    function blobDownload(name, data, type = 'application/json') {
        const blob = new Blob([data], { type });
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
            }
            else {
                const entries = history.filter((h) => selectedHistories.has(h));
                blobDownload('history-selected.json', JSON.stringify(entries, null, 2));
            }
        });
    }
    if (historyCopy) {
        historyCopy.addEventListener('click', () => __awaiter(this, void 0, void 0, function* () {
            const entries = selectedHistories.size ? history.filter((h) => selectedHistories.has(h)) : history;
            if (!entries.length) {
                alert('Nothing to copy');
                return;
            }
            try {
                yield navigator.clipboard.writeText(entries.join('\n'));
            }
            catch (_a) {
                alert('Copy failed');
            }
        }));
    }
    if (historyRemove) {
        historyRemove.addEventListener('click', () => {
            if (selectedHistories.size === 0)
                return;
            for (const h of Array.from(selectedHistories)) {
                const idx = history.indexOf(h);
                if (idx >= 0)
                    history.splice(idx, 1);
            }
            selectedHistories.clear();
            renderHistory();
            persistState();
        });
    }
    if (historyImport) {
        historyImport.addEventListener('click', () => {
            const text = prompt('Paste save code or JSON array for history');
            if (!text)
                return;
            try {
                let entries = [];
                try {
                    const parsed = JSON.parse(text);
                    if (Array.isArray(parsed))
                        entries = parsed.map(String);
                }
                catch (_a) {
                    entries = text.split(/\s+/).filter(Boolean);
                }
                entries.forEach((code) => {
                    if (history[0] !== code) {
                        history.unshift(code);
                    }
                });
                if (history.length > 100)
                    history.length = 100;
                renderHistory();
                persistState();
            }
            catch (err) {
                alert('Import failed');
            }
        });
    }
    if (favoritesExport) {
        favoritesExport.addEventListener('click', () => {
            const payload = selectedFavorites.size
                ? favorites.filter((_, idx) => selectedFavorites.has(idx))
                : favorites;
            if (!payload.length) {
                alert('Nothing selected to export');
                return;
            }
            blobDownload('favorites.json', JSON.stringify(payload, null, 2));
        });
    }
    if (favoritesCopy) {
        favoritesCopy.addEventListener('click', () => __awaiter(this, void 0, void 0, function* () {
            const payload = selectedFavorites.size ? favorites.filter((_, idx) => selectedFavorites.has(idx)) : favorites;
            if (!payload.length) {
                alert('Nothing to copy');
                return;
            }
            try {
                yield navigator.clipboard.writeText(payload.map((f) => f.code).join('\n'));
            }
            catch (_a) {
                alert('Copy failed');
            }
        }));
    }
    if (favoritesRemove) {
        favoritesRemove.addEventListener('click', () => {
            if (selectedFavorites.size === 0)
                return;
            const toRemove = new Set(selectedFavorites);
            for (let i = favorites.length - 1; i >= 0; i--) {
                if (toRemove.has(i))
                    favorites.splice(i, 1);
            }
            selectedFavorites.clear();
            renderFavorites();
            persistState();
        });
    }
    if (favoritesImport) {
        favoritesImport.addEventListener('click', () => {
            const text = prompt('Paste favorite JSON or save code');
            if (!text)
                return;
            try {
                let entries = [];
                try {
                    const parsed = JSON.parse(text);
                    if (Array.isArray(parsed))
                        entries = parsed;
                    else
                        entries = [parsed];
                }
                catch (_a) {
                    entries = [{ code: text }];
                }
                entries.forEach((fav) => {
                    if (!fav.code)
                        return;
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
                    if (existing >= 0)
                        favorites.splice(existing, 1);
                    favorites.unshift({ code: fav.code, settings: snapshot, createdAt: Date.now() });
                });
                if (favorites.length > 100)
                    favorites.length = 100;
                renderFavorites();
                persistState();
            }
            catch (err) {
                alert('Import failed');
            }
        });
    }
    if (advancedExport) {
        advancedExport.addEventListener("click", () => {
            const payload = {
                version: 1,
                settings,
                advanced: advancedConfig,
                history,
                favorites,
                seed: state.seedCode
            };
            const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
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
            var _a;
            const file = (_a = e.target.files) === null || _a === void 0 ? void 0 : _a[0];
            if (!file)
                return;
            const reader = new FileReader();
            reader.onload = () => {
                try {
                    const parsed = JSON.parse(String(reader.result));
                    if (!parsed || typeof parsed !== 'object')
                        throw new Error('Invalid file');
                    if (parsed.version !== 1)
                        throw new Error('Unsupported version');
                    Object.assign(settings, parsed.settings || {});
                    advancedConfig = Object.assign(Object.assign({}, defaultAdvancedConfig), (parsed.advanced || {}));
                    history.length = 0;
                    if (Array.isArray(parsed.history))
                        history.push(...parsed.history.slice(0, 100));
                    favorites.length = 0;
                    if (Array.isArray(parsed.favorites))
                        favorites.push(...parsed.favorites.slice(0, 100));
                    if (parsed.seed)
                        state.seedCode = parsed.seed;
                    // sync UI with new settings
                    applySettings({ bpm: true, tempo: true });
                    renderFavorites();
                    recordHistory(save(state));
                    persistState();
                    alert('Import successful.');
                }
                catch (err) {
                    console.error(err);
                    alert('Import failed: ' + err.message);
                }
            };
            reader.readAsText(file);
            // reset input for next time
            advancedImportFile.value = '';
        });
    }
    let howtoLoaded = false;
    function loadHowto() {
        return __awaiter(this, void 0, void 0, function* () {
            if (howtoLoaded || !howtoBody)
                return;
            try {
                const res = yield fetch('HOWTO.md');
                const text = yield res.text();
                howtoBody.innerHTML = markdownToHtml(text);
                howtoLoaded = true;
            }
            catch (err) {
                howtoBody.innerHTML = '<p>Failed to load HOWTO.</p>';
            }
        });
    }
    if (infoToggle && infoPopup) {
        infoToggle.addEventListener('click', () => {
            infoPopup.style.display = 'flex';
        });
    }
    if (howtoToggle && howtoPopup) {
        howtoToggle.addEventListener('click', () => __awaiter(this, void 0, void 0, function* () {
            yield loadHowto();
            howtoPopup.style.display = 'flex';
        }));
    }
    if (howtoClose && howtoPopup) {
        howtoClose.addEventListener('click', () => {
            howtoPopup.style.display = 'none';
        });
    }
    if (howtoPopup) {
        howtoPopup.addEventListener('click', (e) => {
            if (e.target === howtoPopup)
                howtoPopup.style.display = 'none';
        });
    }
    function advancedConfigToText(cfg) {
        const payload = {
            settings: {
                trackVolumes: settings.trackVolumes,
                trackEnabled: settings.trackEnabled
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
    function applyAdvancedConfig(next) {
        advancedConfig = Object.assign(Object.assign({}, defaultAdvancedConfig), ((next && next.advanced) || next || {}));
        if (next && next.settings) {
            if (Array.isArray(next.settings.trackVolumes)) {
                settings.trackVolumes = next.settings.trackVolumes.map((v) => Math.max(0, Math.min(1, Number(v) || 0)));
            }
            if (Array.isArray(next.settings.trackEnabled)) {
                settings.trackEnabled = next.settings.trackEnabled.map((v) => Boolean(v));
                trackToggles.forEach((t, i) => { var _a; if (t)
                    t.checked = (_a = settings.trackEnabled[i]) !== null && _a !== void 0 ? _a : true; });
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
                applySettings({ bpm: true, tempo: true });
                persistState();
            }
            catch (e) {
                advancedText.value = advancedConfigToText(advancedConfig);
                alert("Invalid JSON; reverted.");
            }
        });
    }
    // ensure lock pane matches on load
    syncLockPane();
}
window.onload = function () {
    var _a, _b;
    if (window.location.search.startsWith("?")) {
        document.getElementById("seed-text").value = window.location.search.slice(1);
    }
    let started = false;
    (_a = document.getElementById("start")) === null || _a === void 0 ? void 0 : _a.addEventListener("click", e => {
        if (!started) {
            start();
        }
        started = true;
    });
    (_b = document.getElementById("seed-entry")) === null || _b === void 0 ? void 0 : _b.addEventListener("keydown", e => {
        if (e.key === "Enter") {
            if (!started) {
                start();
            }
            started = true;
        }
    });
};
//# sourceMappingURL=tracker.js.map