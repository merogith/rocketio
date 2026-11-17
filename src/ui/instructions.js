import { DEFAULT_KEYBINDS } from '../core/constants.js';
import { Input } from './input.js';

/** Instruction templates share the same action IDs as the input controller. */
export function keyLabel(action, bindings = DEFAULT_KEYBINDS) {
    const code = bindings[action];
    if (!code) return 'unbound — use the build palette';
    return Input.getDisplayName(code);
}

export function formatInstructions(text, bindings = DEFAULT_KEYBINDS) {
    return text.replace(/\{key:([a-zA-Z_]+)\}/g, (_, action) => keyLabel(action, bindings));
}
