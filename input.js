import { DEFAULT_KEYBINDS, DEFAULT_SETTINGS } from './constants.js';

const keybinds = {};
const settings = {};
const keysDown = new Set();
const keysPressed = new Set();
let rebinding = null;

function loadKeybinds() {
    Object.assign(keybinds, DEFAULT_KEYBINDS);
    try {
        const stored = JSON.parse(localStorage.getItem('rocketio.keybinds'));
        if (stored && typeof stored === 'object') {
            Object.assign(keybinds, stored);
        }
    } catch (_) { /* use defaults */ }
}

function saveKeybinds() {
    localStorage.setItem('rocketio.keybinds', JSON.stringify(keybinds));
}

function loadSettings() {
    Object.assign(settings, DEFAULT_SETTINGS);
    try {
        const stored = JSON.parse(localStorage.getItem('rocketio.settings'));
        if (stored && typeof stored === 'object') {
            Object.assign(settings, stored);
        }
    } catch (_) { /* use defaults */ }
}

function saveSettings() {
    localStorage.setItem('rocketio.settings', JSON.stringify(settings));
}

function codeToReverse() {
    const map = {};
    for (const action in keybinds) {
        map[keybinds[action]] = action;
    }
    return map;
}

function onKeyDown(e) {
    const code = e.code;

    if (rebinding) {
        e.preventDefault();
        if (code === 'Escape') {
            const cb = rebinding.callback;
            rebinding = null;
            cb(null);
        } else {
            const { actionId, callback } = rebinding;
            rebinding = null;
            Input.setKeybind(actionId, code);
            callback(actionId, code);
        }
        return;
    }

    keysDown.add(code);
    keysPressed.add(code);
}

function onKeyUp(e) {
    keysDown.delete(e.code);
}

const DISPLAY_NAMES = {
    Space: 'SPACE',
    Escape: 'ESC',
    Equal: '+',
    Minus: '-',
    Comma: ',',
    Period: '.',
    Slash: '/',
    Backslash: '\\',
    BracketLeft: '[',
    BracketRight: ']',
    Semicolon: ';',
    Quote: "'",
    Backquote: '`',
    Enter: 'ENTER',
    Backspace: 'BKSP',
    Tab: 'TAB',
    ShiftLeft: 'L-SHIFT',
    ShiftRight: 'R-SHIFT',
    ControlLeft: 'L-CTRL',
    ControlRight: 'R-CTRL',
    AltLeft: 'L-ALT',
    AltRight: 'R-ALT',
    ArrowUp: 'UP',
    ArrowDown: 'DOWN',
    ArrowLeft: 'LEFT',
    ArrowRight: 'RIGHT',
    Delete: 'DEL',
    Insert: 'INS',
    Home: 'HOME',
    End: 'END',
    PageUp: 'PGUP',
    PageDown: 'PGDN',
    CapsLock: 'CAPS',
    NumLock: 'NUM',
    ScrollLock: 'SCROLL',
};

export const Input = {
    init() {
        loadKeybinds();
        loadSettings();
        window.addEventListener('keydown', onKeyDown);
        window.addEventListener('keyup', onKeyUp);
    },

    isDown(actionId) {
        return keysDown.has(keybinds[actionId]);
    },

    wasPressed(actionId) {
        return keysPressed.has(keybinds[actionId]);
    },

    consumePress(actionId) {
        const code = keybinds[actionId];
        if (keysPressed.has(code)) {
            keysPressed.delete(code);
            return true;
        }
        return false;
    },

    clearFrame() {
        keysPressed.clear();
    },

    getKeybinds() {
        return { ...keybinds };
    },

    setKeybind(actionId, keyCode) {
        if (actionId === 'cancel') return;

        for (const other in keybinds) {
            if (other !== actionId && other !== 'cancel' && keybinds[other] === keyCode) {
                keybinds[other] = '';
            }
        }
        keybinds[actionId] = keyCode;
        saveKeybinds();
    },

    resetKeybinds() {
        for (const key in keybinds) delete keybinds[key];
        Object.assign(keybinds, DEFAULT_KEYBINDS);
        saveKeybinds();
    },

    getSetting(key) {
        return settings[key];
    },

    setSetting(key, value) {
        settings[key] = value;
        saveSettings();
    },

    resetSettings() {
        for (const key in settings) delete settings[key];
        Object.assign(settings, DEFAULT_SETTINGS);
        saveSettings();
    },

    getActionForCode(keyCode) {
        for (const action in keybinds) {
            if (keybinds[action] === keyCode) return action;
        }
        return null;
    },

    getDisplayName(keyCode) {
        if (DISPLAY_NAMES[keyCode]) return DISPLAY_NAMES[keyCode];
        if (keyCode.startsWith('Key')) return keyCode.slice(3);
        if (keyCode.startsWith('Digit')) return keyCode.slice(5);
        if (keyCode.startsWith('Numpad')) return 'NUM' + keyCode.slice(6);
        if (/^F\d+$/.test(keyCode)) return keyCode;
        return keyCode.toUpperCase();
    },

    startRebind(actionId, callback) {
        rebinding = { actionId, callback };
    },

    stopRebind() {
        rebinding = null;
    },
};
