// Interactive HUD panels: draggable, collapsible, closeable.
// Persists position + collapsed/hidden state per panel in localStorage.
// Pure DOM script (no module). Loaded after main.js.

(function () {
    'use strict';

    const STORAGE_KEY = 'rio.ui.panels.v1';

    // [panel id] -> { title, allowDrag, allowCollapse, allowClose }
    const PANELS = {
        'side-panel': { title: 'BUILD', allowDrag: true, allowCollapse: true, allowClose: true },
        'info-panel': { title: 'INTEL', allowDrag: true, allowCollapse: true, allowClose: true },
        'minimap-wrap': { title: 'TACTICAL', allowDrag: true, allowCollapse: true, allowClose: true },
        'combat-log': {
            title: 'COMBAT LOG',
            allowDrag: true,
            allowCollapse: true,
            allowClose: true,
            customHeader: true,
        },
    };

    function loadState() {
        try {
            return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
        } catch (_) {
            return {};
        }
    }
    function saveState(state) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        } catch (_) {}
    }
    const state = loadState();
    function getEntry(id) {
        return state[id] || (state[id] = {});
    }

    function makeBtn(text, title, cls) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'panel-chrome-btn ' + (cls || '');
        b.textContent = text;
        b.title = title;
        return b;
    }

    function ensureTitlebar(panel, conf) {
        if (panel.querySelector(':scope > .panel-titlebar')) return panel.querySelector(':scope > .panel-titlebar');

        const bar = document.createElement('div');
        bar.className = 'panel-titlebar';
        if (conf.compact) bar.classList.add('compact');

        const grip = document.createElement('span');
        grip.className = 'panel-grip';
        grip.textContent = '⋮⋮';
        grip.title = 'Drag to move';
        bar.appendChild(grip);

        const label = document.createElement('span');
        label.className = 'panel-title';
        label.textContent = conf.title;
        bar.appendChild(label);

        const spacer = document.createElement('span');
        spacer.className = 'panel-spacer';
        bar.appendChild(spacer);

        if (conf.allowCollapse) {
            const cBtn = makeBtn('–', 'Collapse / expand', 'collapse-btn');
            cBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                togglePanel(panel, conf, 'collapsed');
            });
            bar.appendChild(cBtn);
        }
        if (conf.allowClose) {
            const xBtn = makeBtn('×', 'Hide panel', 'close-btn');
            xBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                togglePanel(panel, conf, 'hidden');
                refreshTray();
            });
            bar.appendChild(xBtn);
        }
        // Insert at top
        panel.insertBefore(bar, panel.firstChild);
        panel.classList.add('panel-interactive');
        return bar;
    }

    // For combat-log we reuse its existing header instead of inserting a new bar.
    function decorateCustomHeader(panel, conf) {
        const header = panel.querySelector('.combat-log-header');
        if (!header) return ensureTitlebar(panel, conf);
        if (header.dataset.panelDecorated === '1') return header;
        header.dataset.panelDecorated = '1';
        header.classList.add('panel-titlebar', 'panel-titlebar-inline');
        // Add grip
        const grip = document.createElement('span');
        grip.className = 'panel-grip';
        grip.textContent = '⋮⋮';
        grip.title = 'Drag to move';
        header.insertBefore(grip, header.firstChild);
        // Add close
        if (conf.allowClose) {
            const xBtn = makeBtn('×', 'Hide panel', 'close-btn');
            xBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                togglePanel(panel, conf, 'hidden');
                refreshTray();
            });
            header.appendChild(xBtn);
        }
        panel.classList.add('panel-interactive');
        return header;
    }

    function togglePanel(panel, conf, flag, force) {
        const cls = flag === 'collapsed' ? 'panel-collapsed' : 'panel-hidden';
        const isOn = typeof force === 'boolean' ? force : !panel.classList.contains(cls);
        panel.classList.toggle(cls, isOn);
        const entry = getEntry(panel.id);
        entry[flag] = isOn;
        saveState(state);
        // Update collapse button text
        const cBtn = panel.querySelector('.collapse-btn');
        if (cBtn) cBtn.textContent = panel.classList.contains('panel-collapsed') ? '+' : '–';
    }

    function applyStoredState(panel, conf) {
        const entry = getEntry(panel.id);
        if (entry.collapsed && conf.allowCollapse) togglePanel(panel, conf, 'collapsed', true);
        if (entry.hidden && conf.allowClose) togglePanel(panel, conf, 'hidden', true);
        if (entry.pos) applyPos(panel, entry.pos);
    }

    function applyPos(panel, pos) {
        panel.style.position = 'fixed';
        panel.style.left = pos.left + 'px';
        panel.style.top = pos.top + 'px';
        panel.style.right = 'auto';
        panel.style.bottom = 'auto';
        panel.style.transform = 'none';
        // Preserve original width if it was layout-sized
        if (pos.width) panel.style.width = pos.width + 'px';
        panel.classList.add('panel-floating');
    }

    function makeDraggable(panel, handle, conf) {
        if (!conf.allowDrag || !handle) return;
        handle.classList.add('panel-drag-handle');
        let dragging = false,
            startX = 0,
            startY = 0,
            baseLeft = 0,
            baseTop = 0;

        handle.addEventListener('mousedown', (e) => {
            // Ignore clicks on buttons inside the bar
            if (e.target.closest('button')) return;
            if (e.button !== 0) return;
            const rect = panel.getBoundingClientRect();
            // Promote to fixed positioning preserving rect
            panel.style.position = 'fixed';
            panel.style.left = rect.left + 'px';
            panel.style.top = rect.top + 'px';
            panel.style.right = 'auto';
            panel.style.bottom = 'auto';
            panel.style.transform = 'none';
            panel.style.width = rect.width + 'px';
            panel.classList.add('panel-floating', 'panel-dragging');
            dragging = true;
            startX = e.clientX;
            startY = e.clientY;
            baseLeft = rect.left;
            baseTop = rect.top;
            e.preventDefault();
        });

        window.addEventListener('mousemove', (e) => {
            if (!dragging) return;
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            const W = window.innerWidth,
                H = window.innerHeight;
            const w = panel.offsetWidth,
                h = panel.offsetHeight;
            const nl = Math.max(0, Math.min(W - 40, baseLeft + dx));
            const nt = Math.max(0, Math.min(H - 28, baseTop + dy));
            panel.style.left = nl + 'px';
            panel.style.top = nt + 'px';
        });

        window.addEventListener('mouseup', () => {
            if (!dragging) return;
            dragging = false;
            panel.classList.remove('panel-dragging');
            const rect = panel.getBoundingClientRect();
            const entry = getEntry(panel.id);
            entry.pos = { left: Math.round(rect.left), top: Math.round(rect.top), width: Math.round(rect.width) };
            saveState(state);
        });

        // Double-click on titlebar resets position
        handle.addEventListener('dblclick', (e) => {
            if (e.target.closest('button')) return;
            resetPanel(panel);
        });
    }

    function resetPanel(panel) {
        panel.style.position = '';
        panel.style.left = '';
        panel.style.top = '';
        panel.style.right = '';
        panel.style.bottom = '';
        panel.style.width = '';
        panel.style.transform = '';
        panel.classList.remove('panel-floating');
        const entry = getEntry(panel.id);
        delete entry.pos;
        saveState(state);
    }

    // --- Hidden-panel tray ---------------------------------------------------
    let tray = null;
    function ensureTray() {
        if (tray) return tray;
        tray = document.createElement('div');
        tray.id = 'panel-tray';
        tray.className = 'panel-tray hidden';
        document.body.appendChild(tray);
        return tray;
    }
    function refreshTray() {
        ensureTray();
        tray.innerHTML = '';
        let any = false;
        for (const id of Object.keys(PANELS)) {
            const panel = document.getElementById(id);
            if (!panel) continue;
            if (panel.classList.contains('panel-hidden')) {
                any = true;
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'panel-tray-btn';
                btn.textContent = PANELS[id].title;
                btn.title = 'Show ' + PANELS[id].title;
                btn.addEventListener('click', () => {
                    togglePanel(panel, PANELS[id], 'hidden', false);
                    refreshTray();
                });
                tray.appendChild(btn);
            }
        }
        if (any) {
            const resetAll = document.createElement('button');
            resetAll.type = 'button';
            resetAll.className = 'panel-tray-btn reset-all';
            resetAll.textContent = '⟲ RESET LAYOUT';
            resetAll.title = 'Restore default panel positions';
            resetAll.addEventListener('click', () => {
                for (const id of Object.keys(PANELS)) {
                    const p = document.getElementById(id);
                    if (!p) continue;
                    p.classList.remove('panel-hidden', 'panel-collapsed', 'panel-floating');
                    p.style.cssText = '';
                    delete state[id];
                }
                saveState(state);
                refreshTray();
            });
            tray.appendChild(resetAll);
            tray.classList.remove('hidden');
        } else {
            tray.classList.add('hidden');
        }
    }

    function init() {
        for (const id of Object.keys(PANELS)) {
            const panel = document.getElementById(id);
            if (!panel) continue;
            const conf = PANELS[id];
            const handle = conf.customHeader ? decorateCustomHeader(panel, conf) : ensureTitlebar(panel, conf);
            makeDraggable(panel, handle, conf);
            applyStoredState(panel, conf);
        }
        refreshTray();
    }

    // Game UI is only present after the player enters the match. Re-init when #app becomes visible.
    function tryInit() {
        const app = document.getElementById('app');
        if (!app) return false;
        if (app.classList.contains('hidden')) return false;
        init();
        return true;
    }

    if (!tryInit()) {
        const mo = new MutationObserver(() => {
            if (tryInit()) mo.disconnect();
        });
        const app = document.getElementById('app');
        if (app) mo.observe(app, { attributes: true, attributeFilter: ['class'] });
        // Fallback: also try on every animation frame for a short while
        let tries = 0;
        const iv = setInterval(() => {
            if (tryInit() || ++tries > 200) clearInterval(iv);
        }, 200);
    }
})();
