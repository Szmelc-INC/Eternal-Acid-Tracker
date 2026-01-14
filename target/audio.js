/*
  Copyright 2020 David Whiting
  This work is licensed under a Creative Commons Attribution 4.0 International License
  https://creativecommons.org/licenses/by/4.0/
*/
import { fill, rnd } from './utils.js';
const A3Frequency = 440;
const A0Frequency = A3Frequency / 8;
function Audio(ctx) {
    function oscillatorNode(type, freq = 440) {
        const node = ctx.createOscillator();
        node.type = type;
        node.frequency.value = freq;
        return node;
    }
    function waveShaperNode(curve) {
        const node = ctx.createWaveShaper();
        node.curve = new Float32Array(curve);
        return node;
    }
    function gainNode(gainAmount = 0) {
        const node = ctx.createGain();
        node.gain.value = gainAmount;
        return node;
    }
    function stereoPannerNode(pan) {
        if (ctx.createStereoPanner) {
            const node = ctx.createStereoPanner();
            node.pan.value = pan;
            return node;
        }
        else {
            const node = ctx.createPanner();
            node.panningModel = "equalpower";
            node.setPosition(pan, 0, 0.5);
            // @ts-ignore
            node.pan = node.positionX;
            return node;
        }
    }
    function SquareSynth(pan = 0, volumeRef = () => 1) {
        const set = (a, v) => { a.cancelScheduledValues(ctx.currentTime); a.setValueAtTime(v, ctx.currentTime); };
        const towards = (a, v, t) => { a.setTargetAtTime(t, ctx.currentTime, t); };
        const slide = (a, v, t) => { a.cancelScheduledValues(ctx.currentTime); a.setTargetAtTime(v, ctx.currentTime, t); };
        const wavetableTrigger = oscillatorNode("sawtooth"), pulseWavetable = waveShaperNode(new Float32Array(256).fill(-1, 0, 128).fill(1, 128, 256)), alwaysOneWavetable = waveShaperNode(new Float32Array(2).fill(1, 0, 2)), wavetableOffsetGain = gainNode(), pulseOutputGain = gainNode(), outputPanner = stereoPannerNode(pan);
        wavetableTrigger.start();
        wavetableTrigger.connect(pulseWavetable);
        wavetableTrigger.connect(alwaysOneWavetable);
        alwaysOneWavetable.connect(wavetableOffsetGain);
        wavetableOffsetGain.connect(pulseWavetable);
        pulseWavetable.connect(pulseOutputGain);
        pulseOutputGain.connect(outputPanner);
        outputPanner.connect(ctx.destination);
        const freq = wavetableTrigger.frequency, width = wavetableOffsetGain.gain, gain = pulseOutputGain.gain;
        const decay = 0.04, sustain = 0.7, release = 0.01, level = 0.1;
        function noteOn(note, glide = 0) {
            const glideTime = glide / 10;
            slide(freq, A0Frequency * Math.pow(2, (note / 12)), glideTime);
            const vol = Math.max(0, volumeRef());
            set(gain, level * vol);
            towards(gain, level * sustain * vol, decay);
        }
        function noteOff() {
            set(gain, 0);
        }
        function play(note) {
            var _a, _b, _c;
            if (note.note === "---") {
                noteOff();
            }
            else if (note.note === 'cont') {
                // do nothing
            }
            else {
                noteOn(note.note, (_a = note.fx) === null || _a === void 0 ? void 0 : _a.glide);
            }
            set(width, (_c = (_b = note.fx) === null || _b === void 0 ? void 0 : _b.pulseWidth) !== null && _c !== void 0 ? _c : 0.0);
        }
        function stop() {
            set(gain, 0);
        }
        function dispose() {
            try {
                wavetableTrigger.stop();
            }
            catch (_a) { }
            try {
                outputPanner.disconnect();
            }
            catch (_b) { }
            try {
                pulseOutputGain.disconnect();
            }
            catch (_c) { }
            try {
                wavetableOffsetGain.disconnect();
            }
            catch (_d) { }
            try {
                pulseWavetable.disconnect();
            }
            catch (_e) { }
            try {
                alwaysOneWavetable.disconnect();
            }
            catch (_f) { }
        }
        return { play, stop, dispose };
    }
    function distortionCurve(amount) {
        const k = Math.max(1, amount);
        const n = 256;
        const curve = new Float32Array(n);
        for (let i = 0; i < n; i++) {
            const x = (i * 2) / (n - 1) - 1;
            curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
        }
        return curve;
    }
    function AcidSynth(pan = 0, volumeRef = () => 1) {
        const set = (a, v) => { a.cancelScheduledValues(ctx.currentTime); a.setValueAtTime(v, ctx.currentTime); };
        const towards = (a, v, t) => { a.setTargetAtTime(v, ctx.currentTime, t); };
        const slide = (a, v, t) => { a.cancelScheduledValues(ctx.currentTime); a.setTargetAtTime(v, ctx.currentTime, t); };
        const osc = oscillatorNode("sawtooth"), sub = oscillatorNode("square"), oscGain = gainNode(0.7), subGain = gainNode(0.35), filter = ctx.createBiquadFilter(), drive = waveShaperNode(distortionCurve(220)), outputGain = gainNode(), outputPanner = stereoPannerNode(pan);
        filter.type = "lowpass";
        filter.Q.value = 10;
        filter.frequency.value = 400;
        osc.start();
        sub.start();
        osc.connect(oscGain);
        sub.connect(subGain);
        oscGain.connect(filter);
        subGain.connect(filter);
        filter.connect(drive);
        drive.connect(outputGain);
        outputGain.connect(outputPanner);
        outputPanner.connect(ctx.destination);
        const freq = osc.frequency, subFreq = sub.frequency, gain = outputGain.gain, cutoff = filter.frequency, resonance = filter.Q;
        const decay = 0.07, sustain = 0.45, release = 0.05, level = 0.18;
        function noteOn(note, glide, bite) {
            const glideTime = glide / 8;
            const noteFreq = A0Frequency * Math.pow(2, (note / 12));
            slide(freq, noteFreq, glideTime);
            slide(subFreq, noteFreq / 2, glideTime);
            const baseCutoff = Math.min(6000, Math.max(110, noteFreq * 2.2));
            const envAmount = 1200 + 2200 * bite;
            set(resonance, 10 + 12 * bite);
            set(cutoff, baseCutoff + envAmount);
            towards(cutoff, baseCutoff + envAmount * 0.2, decay);
            const vol = Math.max(0, volumeRef());
            set(gain, level * vol);
            towards(gain, level * sustain * vol, decay);
        }
        function noteOff() {
            set(gain, 0);
        }
        function play(note) {
            var _a, _b, _c, _d;
            if (note.note === "---") {
                noteOff();
            }
            else if (note.note === 'cont') {
                // do nothing
            }
            else {
                const bite = (_b = (_a = note.fx) === null || _a === void 0 ? void 0 : _a.pulseWidth) !== null && _b !== void 0 ? _b : 0;
                noteOn(note.note, (_d = (_c = note.fx) === null || _c === void 0 ? void 0 : _c.glide) !== null && _d !== void 0 ? _d : 0, bite);
            }
        }
        function stop() {
            set(gain, 0);
        }
        function dispose() {
            try {
                osc.stop();
            }
            catch (_a) { }
            try {
                sub.stop();
            }
            catch (_b) { }
            try {
                outputPanner.disconnect();
            }
            catch (_c) { }
            try {
                outputGain.disconnect();
            }
            catch (_d) { }
            try {
                drive.disconnect();
            }
            catch (_e) { }
            try {
                filter.disconnect();
            }
            catch (_f) { }
            try {
                oscGain.disconnect();
            }
            catch (_g) { }
            try {
                subGain.disconnect();
            }
            catch (_h) { }
        }
        return { play, stop, dispose };
    }
    function OscSynth(kind, pan = 0, volumeRef = () => 1, invert = false) {
        const osc = oscillatorNode(kind);
        const gain = gainNode(0);
        const panner = stereoPannerNode(pan);
        if (invert)
            gain.gain.value = -gain.gain.value;
        osc.start();
        osc.connect(gain);
        gain.connect(panner);
        panner.connect(ctx.destination);
        const set = (a, v) => { a.cancelScheduledValues(ctx.currentTime); a.setValueAtTime(v, ctx.currentTime); };
        const slide = (a, v, t) => { a.cancelScheduledValues(ctx.currentTime); a.setTargetAtTime(v, ctx.currentTime, t); };
        const decay = 0.05, sustain = 0.65, release = 0.04, level = 0.14;
        function noteOn(note) {
            slide(osc.frequency, A0Frequency * Math.pow(2, (note / 12)), 0.01);
            const vol = Math.max(0, volumeRef());
            set(gain.gain, level * vol * (invert ? -1 : 1));
            gain.gain.setTargetAtTime(level * sustain * vol * (invert ? -1 : 1), ctx.currentTime, decay);
        }
        function noteOff() {
            gain.gain.setValueAtTime(0, ctx.currentTime);
        }
        function play(note) {
            if (note.note === "---") {
                noteOff();
            }
            else if (note.note !== 'cont') {
                noteOn(note.note);
            }
        }
        function stop() {
            gain.gain.setValueAtTime(0, ctx.currentTime);
        }
        function dispose() {
            try {
                osc.stop();
            }
            catch (_a) { }
            try {
                panner.disconnect();
            }
            catch (_b) { }
            try {
                gain.disconnect();
            }
            catch (_c) { }
        }
        return { play, stop, dispose };
    }
    function DrumSynth(volumeRef = () => 1) {
        const toneOscillator = oscillatorNode("square", 55), toneGain = gainNode(), noiseWavetableTrigger = oscillatorNode("sawtooth", 20), noiseWavetable = waveShaperNode(fill(1024, x => rnd() * 2 - 1)), noiseGain = gainNode(), noisePan = stereoPannerNode(0);
        toneOscillator.start();
        noiseWavetableTrigger.start();
        toneOscillator.connect(toneGain);
        toneGain.connect(ctx.destination);
        noiseWavetableTrigger.connect(noiseWavetable);
        noiseWavetable.connect(noiseGain);
        noiseGain.connect(noisePan);
        noisePan.connect(ctx.destination);
        function play(slot) {
            const vel = (slot.vel ? slot.vel : 1) * Math.max(0, volumeRef());
            if (slot.drum === 'KCK') {
                toneOscillator.detune.cancelScheduledValues(ctx.currentTime);
                toneOscillator.detune.setValueAtTime(3000, ctx.currentTime);
                toneOscillator.detune.setTargetAtTime(0, ctx.currentTime, 0.07);
                toneGain.gain.cancelScheduledValues(ctx.currentTime);
                toneGain.gain.setValueAtTime(0.2 * vel, ctx.currentTime);
                toneGain.gain.setValueCurveAtTime(new Float32Array([0.2 * vel, 0.2 * vel, 0.13 * vel, 0.05 * vel, 0.0]), ctx.currentTime, 0.10);
            }
            else if (slot.drum === 'NSS') {
                noiseGain.gain.cancelScheduledValues(ctx.currentTime);
                noiseGain.gain.setValueAtTime(0.1 * vel, ctx.currentTime);
                noiseGain.gain.setValueCurveAtTime(new Float32Array([0.1 * vel, 0.04 * vel, 0.0]), ctx.currentTime, 0.08);
                // Ugly workaround for safari being a bitch
                if ("pan" in noisePan) {
                    noisePan.pan.cancelScheduledValues(ctx.currentTime);
                    noisePan.pan.setValueAtTime(rnd() * 0.4 - 0.2, ctx.currentTime);
                }
            }
            else if (slot.drum === 'SNR') {
                toneOscillator.detune.cancelScheduledValues(ctx.currentTime);
                toneOscillator.detune.setValueAtTime(2400, ctx.currentTime);
                toneOscillator.detune.setTargetAtTime(600, ctx.currentTime, 0.04);
                toneGain.gain.cancelScheduledValues(ctx.currentTime);
                toneGain.gain.setValueAtTime(0.15 * vel, ctx.currentTime);
                toneGain.gain.setValueCurveAtTime(new Float32Array([0.15 * vel, 0.05 * vel, 0.01 * vel, 0]), ctx.currentTime, 0.10);
                noiseGain.gain.cancelScheduledValues(ctx.currentTime);
                noiseGain.gain.setValueAtTime(0.2 * vel, ctx.currentTime);
                noiseGain.gain.setValueCurveAtTime(new Float32Array([0.2 * vel, 0.15 * vel, 0.0]), ctx.currentTime, 0.15);
            }
        }
        function stop() {
            toneGain.gain.setValueAtTime(0, ctx.currentTime);
            noiseGain.gain.setValueAtTime(0, ctx.currentTime);
        }
        function dispose() {
            try {
                toneOscillator.stop();
            }
            catch (_a) { }
            try {
                noiseWavetableTrigger.stop();
            }
            catch (_b) { }
            try {
                toneGain.disconnect();
            }
            catch (_c) { }
            try {
                noiseGain.disconnect();
            }
            catch (_d) { }
            try {
                noisePan.disconnect();
            }
            catch (_e) { }
        }
        return { play, stop, dispose };
    }
    return { SquareSynth, AcidSynth, DrumSynth, OscSynth };
    return {
        SquareSynth,
        AcidSynth,
        DrumSynth
    };
}
export default Audio;
//# sourceMappingURL=audio.js.map