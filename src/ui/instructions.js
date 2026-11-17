import { DEFAULT_KEYBINDS } from '../core/constants.js';

/** Instruction templates share the same action IDs as the input controller. */
export function keyLabel(action, bindings = DEFAULT_KEYBINDS) {
    const code = bindings[action];
    if (!code) return 'unbound — use the build palette';
    if (code.startsWith('Digit')) return code.slice(5);
    if (code.startsWith('Key')) return code.slice(3);
    return code === 'Escape' ? 'ESC' : code;
}

export function formatInstructions(text, bindings = DEFAULT_KEYBINDS) {
    return text.replace(/\{key:([a-zA-Z_]+)\}/g, (_, action) => keyLabel(action, bindings));
}
