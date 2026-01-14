/*
  Copyright 2020 David Whiting
  This work is licensed under a Creative Commons Attribution 4.0 International License
  https://creativecommons.org/licenses/by/4.0/
*/
const A0 = -12;

function textRepr(slot: Slot) {
    function hex(v: number) { return Math.floor(v * 255).toString(16).toUpperCase().padStart(2,'0'); }
    function noteName(v: number | "---" | "cont") {
        switch (v) {
            case "---":
                return "---";
            case "cont":
                return "&nbsp;&nbsp;&nbsp;";
            default:
                return ['A-', 'A#', 'B-', 'C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#'][(v - A0) % 12] + Math.floor((v - A0) / 12)
        }
    }
    if ("drum" in slot) {
        let string = slot.drum;
        if (slot.vel) string +=" v" + hex(slot.vel);
        return string;
    } else {
        let string = noteName(slot.note);
        if (slot.fx && slot.fx.pulseWidth) string += " w" +hex(slot.fx.pulseWidth);
        if (slot.fx && slot.fx.glide) string +=" g" + hex(slot.fx.glide);
        if (slot.vel) string += " v" + hex(slot.vel);
        return string;
    }
}

type TrackMeta = { enabled?: boolean[]; volumes?: number[]; synths?: string[] };

function PatternDisplay(display: HTMLElement) {

    function setPatterns(newPats: Pattern<Slot>[], saveString: string, meta?: TrackMeta) {
        display.innerHTML =
            "<div class='header'>Pattern ID: <a href='?" +
            saveString +
            "' class='save-string'>" +
            saveString +
            "</a> <button id='favorite-current' type='button' title='Favorite'>★</button></div>";
        const container = document.createElement("div");
        container.classList.add("columns");
        display.append(container);
        function add(pattern: Pattern<Slot>, index: number) {
            const enabled = meta?.enabled?.[index] ?? true;
            const vol = Math.round(((meta?.volumes?.[index] ?? 1) || 0) * 100);
            const synth = meta?.synths?.[index] ?? (index === 4 ? 'drums' : 'acid8');
            const pDisplay = document.createElement("code");
            pDisplay.innerHTML =
                `<div class='track-nav' data-track='${index}'>` +
                `<button class='track-mute' data-track='${index}'>${enabled ? "Mute" : "Unmute"}</button>` +
                `<input class='track-volume' data-track='${index}' type='range' min='0' max='100' value='${vol}' title='Volume'>` +
                `<select class='track-synth' data-track='${index}' title='Synth'>` +
                  `<option value="acid8" ${synth==='acid8'?'selected':''}>acid8</option>` +
                  `<option value="acid" ${synth==='acid'?'selected':''}>acid</option>` +
                  `<option value="bass" ${synth==='bass'?'selected':''}>bass</option>` +
                  `<option value="square" ${synth==='square'?'selected':''}>square</option>` +
                  `<option value="saw" ${synth==='saw'?'selected':''}>saw</option>` +
                  `<option value="rev-saw" ${synth==='rev-saw'?'selected':''}>rev-saw</option>` +
                  `<option value="triangle" ${synth==='triangle'?'selected':''}>triangle</option>` +
                  `<option value="sine" ${synth==='sine'?'selected':''}>sine</option>` +
                  `<option value="drums" ${synth==='drums'?'selected':''} ${index===4?'':'disabled'}>drums</option>` +
                `</select>` +
                `</div>` +
                "<h3>" + (index === 4 ? "*" : "⎍") + (index + 1) + "</h3>" +
                pattern.map((x, i) => "<div class='note' data-index='" + i + "'>" + textRepr(x) + "</div>").join("");

            container.append(pDisplay);
        }
        newPats.forEach((p, i) => add(p, i))
    }

    const patternDisplayStyles = document.createElement("style");
    patternDisplayStyles.setAttribute("type", "text/css");
    document.body.append(patternDisplayStyles);
    const css = patternDisplayStyles.sheet as CSSStyleSheet;

    function highlightRow(index: number) {
        if (css.rules.length > 0) {
            css.deleteRule(0);
        }
        css.insertRule(`.note[data-index='${index}'] { background-color: #339933; color: white; font-weight: bold }`)
    }

    return {
        setPatterns,
        highlightRow
    };
}

export default PatternDisplay;
