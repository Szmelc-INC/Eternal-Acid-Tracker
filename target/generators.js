/*
  Copyright 2020 David Whiting
  This work is licensed under a Creative Commons Attribution 4.0 International License
  https://creativecommons.org/licenses/by/4.0/
*/
import { choose, fill, rndInt, rnd } from './utils.js';
import * as music from './theory.js';
const PatternSize = 64;
function flip(trueChance = 0.5) {
    return rnd() < trueChance;
}
function getChord({ progression, key, scale }, rowIndex) {
    const progIndex = Math.floor(rowIndex / 4);
    const chordNumber = progression[progIndex];
    return music.chordTypes.triad.map(noteIndex => key + scale[(chordNumber - 1 + noteIndex) % scale.length]);
}
function octaveChoices(minOctave, maxOctave, preferred) {
    const choices = preferred.filter(oct => oct >= minOctave && oct <= maxOctave);
    return choices.length > 0 ? choices : [minOctave, maxOctave];
}
function constrainNote(note, context) {
    var _a, _b;
    const minOctave = (_a = context.minOctave) !== null && _a !== void 0 ? _a : -2;
    const maxOctave = (_b = context.maxOctave) !== null && _b !== void 0 ? _b : 6;
    const minNote = minOctave * 12;
    const maxNote = (maxOctave + 1) * 12 - 1;
    let clamped = Math.min(maxNote, Math.max(minNote, note));
    const mask = context.noteMask;
    if (mask && mask.length === 12 && !mask[((clamped % 12) + 12) % 12]) {
        for (let d = 1; d < 12; d++) {
            const down = clamped - d;
            const up = clamped + d;
            if (mask[((down % 12) + 12) % 12])
                return Math.min(maxNote, Math.max(minNote, down));
            if (mask[((up % 12) + 12) % 12])
                return Math.min(maxNote, Math.max(minNote, up));
        }
    }
    return clamped;
}
function arp(context) {
    var _a, _b;
    const octaves = octaveChoices((_a = context.minOctave) !== null && _a !== void 0 ? _a : -2, (_b = context.maxOctave) !== null && _b !== void 0 ? _b : 6, [-2, -2, -1, 0, 1, 2, 3]);
    const octave = choose(octaves) * 12;
    const offset = choose([0, 1, 2]);
    const pwOffset = rndInt(8) * 2;
    const pwCycle = choose([4, 5, 6, 8, 12, 16]);
    return fill(PatternSize, i => {
        const chord = getChord(context, i);
        return {
            note: constrainNote(chord[(i + offset + choose([0, 0, 0, 1, 2])) % chord.length] + octave + choose([0, 0, 12]), context),
            fx: {
                pulseWidth: ((pwOffset + i) % pwCycle) / (pwCycle + 1)
            }
        };
    });
}
function bass(context) {
    var _a, _b;
    const octaves = octaveChoices((_a = context.minOctave) !== null && _a !== void 0 ? _a : -2, (_b = context.maxOctave) !== null && _b !== void 0 ? _b : 6, [-2, -2, -1, 0, 1]);
    const octave = choose(octaves) * 12;
    return fill(PatternSize, i => {
        const chord = getChord(context, i);
        return {
            note: i % 2 === 1 ? 'cont' : constrainNote(chord[0] + (Math.floor(i / 2) % 2) * 12 + octave, context),
            fx: { pulseWidth: 0 }
        };
    });
}
function bass2(context) {
    return fill(PatternSize, i => {
        var _a, _b;
        const octaves = octaveChoices((_a = context.minOctave) !== null && _a !== void 0 ? _a : -2, (_b = context.maxOctave) !== null && _b !== void 0 ? _b : 6, [-2, -1, 0, 1]);
        const octave = choose(octaves) * 12;
        const chord = getChord(context, i);
        return {
            note: i % 8 === 0 ? constrainNote(((chord[0] + 4) % 12) + octave, context) : 'cont',
            vel: 2,
            fx: { pulseWidth: rnd() }
        };
    });
}
function melody1(context) {
    const slow = flip();
    const pwmMod = flip();
    let pwmAmount = rnd() * 0.5;
    const pattern = [];
    let current = (choose(music.chordTypes.triad) - 1) + context.scale.length * choose([1, 2, 3, 4]);
    for (let i = 0; i < PatternSize; i++) {
        pwmAmount += flip() ? 0.05 : -0.05;
        pwmAmount += pwmAmount > 0.7 ? -0.05 : pwmAmount < 0.1 ? 0.05 : 0;
        if (slow && i % 2 === 1 || flip(0.1 + 0.4 * (1 - i % 2))) {
            pattern.push({ note: "cont", fx: { pulseWidth: pwmMod ? pwmAmount : 0 } });
        }
        else {
            if (current > 10 && flip()) {
                current--;
            }
            else if (current < 32 && flip()) {
                current++;
            }
            else if (current > 15 && flip(0.2)) {
                current -= choose([2, 4, 7]);
            }
            else if (current < 25 && flip(0.2)) {
                current += choose([2, 4, 7]);
            }
            const chord = getChord(context, i);
            if (flip() && !chord.includes(current % context.scale.length)) {
                current += flip() ? -1 : 1;
            }
            if (current < 4)
                current = 4;
            if (current > 26)
                current = 26;
            pattern.push({
                note: constrainNote(context.key + context.scale[current % context.scale.length] + Math.floor(current / context.scale.length) * 12, context),
                fx: {
                    glide: flip(0.2) ? choose([0.1, 0.2, 0.5, 0.7]) : 0,
                    pulseWidth: pwmMod ? pwmAmount : 0
                }
            });
        }
    }
    return pattern;
}
function emptyNote() { return fill(PatternSize, _ => ({ note: '---' })); }
function emptyDrum() { return fill(PatternSize, _ => ({ drum: '---' })); }
function drum() {
    return fill(PatternSize, i => ({
        drum: i % 8 === 0 ? 'KCK' :
            i % 8 === 4 ? 'SNR' :
                (i % 2 === 0 && flip(0.2)) ? 'KCK' :
                    flip(0.05) ? choose(['KCK', 'SNR']) : 'NSS',
        vel: 0.6 + 0.2 * (1 - (i % 2))
    }));
}
export { arp, bass, bass2, melody1, drum, emptyNote, emptyDrum };
//# sourceMappingURL=generators.js.map