// ============================================================================
//  SFX + MUSIC
//
//  Runtime-synth audio. Zero assets shipped.
//
//   - SFX:   ZzFX by Frank Force (MIT) — https://github.com/KilledByAPixel/ZzFX
//            One tiny function + 20 params → any arcade-style SFX.
//   - Music: hand-rolled WebAudio procedural ambient drone with a
//            "tension" layer that fades in/out based on battlefield threat.
//
//  Public API:
//      SFX.init()                        // call once after first user input
//      SFX.play(name, opts?)             // trigger a preset
//      SFX.setSfxEnabled(bool)
//      SFX.setMusicEnabled(bool)
//      SFX.setVolume(0..1)
//      SFX.startMusic()                  // idempotent
//      SFX.setMusicIntensity(0..1)       // crossfade tension layer
// ============================================================================

// ---------------------------------------------------------------- ZzFX core
// Official one-liner (v1.3.0) — MIT © Frank Force.
// Signature:
//  zzfx(volume, randomness, frequency, attack, sustain, release, shape,
//       shapeCurve, slide, deltaSlide, pitchJump, pitchJumpTime, repeatTime,
//       noise, modulation, bitCrush, delay, sustainVolume, decay, tremolo)
//
//  Shape: 0=sine, 1=triangle, 2=saw, 3=tan, 4=noise
let zzfxX = null;       // shared AudioContext (lazy)
const zzfxV = 0.22;     // per-sample baseline (preset dynamic range)
const zzfxR = 44100;

function zzfxP(samples) {
    const buf = zzfxX.createBuffer(1, samples.length, zzfxR);
    buf.getChannelData(0).set(samples);
    const src = zzfxX.createBufferSource();
    src.buffer = buf;
    src.connect(_sfxBus);
    src.start();
    return src;
}

// Generate samples. Port of the official zzfxG.
function zzfxG(
    vol = 1, rand = 0.05, freq = 220, attack = 0, sustain = 0, release = 0.1,
    shape = 0, shapeCurve = 1, slide = 0, deltaSlide = 0, pitchJump = 0, pitchJumpTime = 0,
    repeatTime = 0, noise = 0, modulation = 0, bitCrush = 0, delay = 0,
    sustainVolume = 1, decay = 0, tremolo = 0
) {
    const M = Math, PI2 = 2 * M.PI;
    let startSlide = slide *= 500 * PI2 / zzfxR / zzfxR;
    let b = [], t = 0, tm = 0, i = 0, j = 1, r = 0, c = 0, s = 0, f, length;
    attack = attack * zzfxR + 9;
    decay *= zzfxR;
    sustain *= zzfxR;
    release *= zzfxR;
    delay *= zzfxR;
    deltaSlide *= 500 * PI2 / zzfxR ** 3;
    modulation *= PI2 / zzfxR;
    pitchJump *= PI2 / zzfxR;
    pitchJumpTime *= zzfxR;
    repeatTime = repeatTime * zzfxR | 0;
    freq *= PI2 / zzfxR;
    freq *= (1 + rand * (M.random() * 2 - 1));
    const freqStart = freq;
    for (length = attack + decay + sustain + release + delay | 0; i < length; b[i++] = s) {
        if (!(++c % (bitCrush * 100 | 0))) {
            s = shape ? shape > 1 ? shape > 2 ? shape > 3 ? M.sin(t ** 3) :
                M.max(M.min(M.tan(t), 1), -1) :
                1 - (2 * t / PI2 % 2 + 2) % 2 :
                1 - 4 * M.abs(M.round(t / PI2) - t / PI2) :
                M.sin(t);
            s = (repeatTime ?
                1 - tremolo + tremolo * M.sin(PI2 * i / repeatTime)
                : 1) *
                (s < 0 ? -1 : 1) * M.abs(s) ** shapeCurve *
                vol * zzfxV * (
                    i < attack ? i / attack :
                    i < attack + decay ? 1 - (i - attack) / decay * (1 - sustainVolume) :
                    i < attack + decay + sustain ? sustainVolume :
                    i < length - delay ? (length - i - delay) / release * sustainVolume : 0
                );
            s = delay ? s / 2 + (delay > i ? 0 :
                (i < length - delay ? 1 : (length - i) / delay) * b[i - delay | 0] / 2) : s;
        }
        f = (freq += slide += deltaSlide) * M.cos(modulation * tm++);
        t += f + f * noise * M.sin(i ** 5);
        if (j && ++j > pitchJumpTime) {
            freq += pitchJump;
            startSlide += pitchJump;
            j = 0;
        }
        if (repeatTime && !(++r % repeatTime)) {
            freq = freqStart;
            slide = startSlide;
            j = j || 1;
        }
    }
    return b;
}

// ------------------------------------------------------------- AUDIO GRAPH
let _sfxBus, _musicBus, _master;
let _calmGain, _tenseGain, _bassOsc, _bassFilter, _tensePulse, _tensePad;
let _musicStarted = false;
let _musicEnabled = true;
let _sfxEnabled = true;
let _initialized = false;
let _sfxVolume = 0.7;       // user-controlled (0..1)
let _musicVolume = 0.7;     // user-controlled (0..1)

function _applySfxGain() {
    if (_sfxBus) _sfxBus.gain.value = _sfxEnabled ? _sfxVolume : 0;
}
function _applyMusicGain(fast = false) {
    if (!_musicBus || !zzfxX) return;
    const target = _musicEnabled ? _musicVolume * 0.6 : 0;
    const now = zzfxX.currentTime;
    _musicBus.gain.cancelScheduledValues(now);
    _musicBus.gain.linearRampToValueAtTime(target, now + (fast ? 0.05 : 0.35));
}

// ------------------------------------------------------------- THROTTLING
const _lastPlay = new Map();     // preset -> timestamp (ms)
const _recent = [];              // timestamps of recent plays (global budget)
const GLOBAL_WINDOW_MS = 120;
const GLOBAL_MAX = 8;

function _throttled(name, minGapMs) {
    const now = performance.now();
    const last = _lastPlay.get(name) || 0;
    if (now - last < minGapMs) return true;
    while (_recent.length && now - _recent[0] > GLOBAL_WINDOW_MS) _recent.shift();
    if (_recent.length >= GLOBAL_MAX) return true;
    _lastPlay.set(name, now);
    _recent.push(now);
    return false;
}

// ------------------------------------------------------------- SFX PRESETS
// Each preset: [zzfx params, minGapMs]
// Tweak in https://killedbyapixel.github.io/ZzFX/
const PRESETS = {
    // Big punchy rocket launch — low rumble + slide down
    launch_rocket:   { p: [1.4, .2, 90, .02, .18, .4, 3, 1.4, -3, 0, 0, 0, 0, .9, 0, .3, .1, .85, .1], gap: 60 },
    // Jet streak — quick high whoosh with bit of noise
    launch_airstrike:{ p: [1.1, .1, 1200, .01, .08, .25, 2, 1.1, 0, 0, 0, 0, 0, 1.6, 0, .2, 0, .7, .05], gap: 80 },
    // Drone buzz — short zzzp
    launch_drone:    { p: [.7, .1, 420, .01, .05, .08, 3, 1.5, 0, 0, 0, 0, 0, 1.2, 0, 0, 0, .6, .02], gap: 40 },
    // Crack of small arms — sharp, tight
    launch_barracks: { p: [1.1, .15, 900, 0, .01, .06, 4, 1.4, 0, 0, 0, 0, 0, 2.2, 0, .3, 0, .6, .02], gap: 30 },
    launch_militia:  { p: [.6, .3, 700, 0, .01, .04, 4, 1.3, 0, 0, 0, 0, 0, 2.5, 0, .2, 0, .5, .02], gap: 40 },

    // Big missile / airstrike impact
    impact_big:      { p: [2.2, .2, 70, .02, .22, .5, 4, 1.2, -1, 0, 0, 0, 0, 1.8, 0, .4, .08, .9, .2], gap: 60 },
    // Smaller bullet impact / drone hit
    impact_small:    { p: [.9, .2, 200, .01, .06, .15, 3, 1.2, 0, 0, 0, 0, 0, 1.5, 0, .25, 0, .6, .05], gap: 25 },
    // Interception — short metallic ping + zap
    intercept:       { p: [1.1, 0, 1400, .01, .04, .12, 1, 1.2, 0, -400, 0, 0, 0, 0, 0, 0, 0, .7, .03], gap: 30 },

    // UI (cheap click for build confirm etc. — optional)
    ui_click:        { p: [.5, 0, 600, 0, .02, .02, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0], gap: 20 },
};

// ------------------------------------------------------------- INIT
function _ensureCtx() {
    if (zzfxX) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    zzfxX = new AC();
    _master = zzfxX.createGain();
    _master.gain.value = 1;
    _master.connect(zzfxX.destination);

    _sfxBus = zzfxX.createGain();
    _sfxBus.gain.value = _sfxEnabled ? _sfxVolume : 0;
    _sfxBus.connect(_master);

    _musicBus = zzfxX.createGain();
    _musicBus.gain.value = 0;   // music fades in via _applyMusicGain()
    _musicBus.connect(_master);
}

function _buildMusic() {
    if (_musicStarted) return;
    _ensureCtx();
    const now = zzfxX.currentTime;

    // ---- CALM LAYER: low sawtooth drone through slow low-pass ----
    _calmGain = zzfxX.createGain();
    _calmGain.gain.value = 0.9;
    _calmGain.connect(_musicBus);

    _bassFilter = zzfxX.createBiquadFilter();
    _bassFilter.type = 'lowpass';
    _bassFilter.frequency.value = 260;
    _bassFilter.Q.value = 4;
    _bassFilter.connect(_calmGain);

    // two detuned saws for thickness
    _bassOsc = zzfxX.createOscillator();
    _bassOsc.type = 'sawtooth';
    _bassOsc.frequency.value = 55;            // low A
    _bassOsc.detune.value = -6;
    _bassOsc.connect(_bassFilter);
    _bassOsc.start(now);

    const bassOsc2 = zzfxX.createOscillator();
    bassOsc2.type = 'sawtooth';
    bassOsc2.frequency.value = 55;
    bassOsc2.detune.value = +6;
    bassOsc2.connect(_bassFilter);
    bassOsc2.start(now);

    // slow LFO on filter cutoff — gives "breathing" ambient movement
    const lfo = zzfxX.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.06;
    const lfoGain = zzfxX.createGain();
    lfoGain.gain.value = 120;
    lfo.connect(lfoGain);
    lfoGain.connect(_bassFilter.frequency);
    lfo.start(now);

    // ---- TENSE LAYER: starts silent, fades in under threat ----
    _tenseGain = zzfxX.createGain();
    _tenseGain.gain.value = 0;
    _tenseGain.connect(_musicBus);

    // Minor 3rd pad (82Hz + 98Hz = E2 + G2 ~ tense fifth-ish)
    const padFilter = zzfxX.createBiquadFilter();
    padFilter.type = 'bandpass';
    padFilter.frequency.value = 420;
    padFilter.Q.value = 2;
    padFilter.connect(_tenseGain);

    _tensePad = zzfxX.createOscillator();
    _tensePad.type = 'sawtooth';
    _tensePad.frequency.value = 82.41;
    _tensePad.connect(padFilter);
    _tensePad.start(now);

    const pad2 = zzfxX.createOscillator();
    pad2.type = 'sawtooth';
    pad2.frequency.value = 98.0;
    pad2.detune.value = 8;
    pad2.connect(padFilter);
    pad2.start(now);

    // Pulse: a low-frequency square clicker that gives the tension layer
    // a "ticking heartbeat" feel. Its gain rides on top of _tenseGain.
    _tensePulse = zzfxX.createOscillator();
    _tensePulse.type = 'square';
    _tensePulse.frequency.value = 1.6;   // ~96 BPM heartbeat
    const pulseShaper = zzfxX.createGain();
    pulseShaper.gain.value = 0;
    _tensePulse.connect(pulseShaper);
    pulseShaper.connect(padFilter.frequency); // modulate pad filter -> audible pulse
    // modulation depth 300Hz
    const pulseDepth = zzfxX.createGain();
    pulseDepth.gain.value = 0;
    _tensePulse.connect(pulseDepth);
    pulseDepth.connect(_tenseGain.gain);
    _tensePulse.start(now);

    _musicStarted = true;
}

// ------------------------------------------------------------- PUBLIC API
export const SFX = {
    init() {
        if (_initialized) return;
        _ensureCtx();
        if (zzfxX.state === 'suspended') zzfxX.resume();
        _initialized = true;
    },

    play(name) {
        if (!_sfxEnabled || !_initialized) return;
        const preset = PRESETS[name];
        if (!preset) return;
        if (_throttled(name, preset.gap)) return;
        try { zzfxP(zzfxG(...preset.p)); } catch (_) { /* AudioContext not ready */ }
    },

    setSfxVolume(v) {
        _sfxVolume = Math.max(0, Math.min(1, v));
        _applySfxGain();
    },

    setMusicVolume(v) {
        _musicVolume = Math.max(0, Math.min(1, v));
        _applyMusicGain();
    },

    setSfxEnabled(on) {
        _sfxEnabled = !!on;
        _applySfxGain();
    },

    setMusicEnabled(on) {
        _musicEnabled = !!on;
        if (!_initialized) return;
        if (_musicEnabled) this.startMusic();
        _applyMusicGain();
    },

    startMusic() {
        if (!_initialized) return;
        if (!_musicEnabled) return;
        _buildMusic();
        _applyMusicGain();
    },

    // intensity 0..1 → crossfade tense layer in
    setMusicIntensity(v) {
        if (!_musicStarted || !_tenseGain) return;
        v = Math.max(0, Math.min(1, v));
        const now = zzfxX.currentTime;
        _tenseGain.gain.cancelScheduledValues(now);
        _tenseGain.gain.linearRampToValueAtTime(v * 0.5, now + 1.2);
        // Also gently raise calm filter cutoff when tense — "opens up" the mix
        if (_bassFilter) {
            _bassFilter.frequency.cancelScheduledValues(now);
            _bassFilter.frequency.linearRampToValueAtTime(260 + v * 380, now + 1.2);
        }
    },
};
