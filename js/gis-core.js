/* ================================================================
   GIS Core — طبقة الأساس للوحدات المستقلة (Module Foundation)
   الإصدار: 1.0.0
   المزايا:
     - سجل وحدات (Registry) مع تحميل معزول وعزل أخطاء لكل وحدة.
     - ناقل أحداث (Event Bus) مشترك.
     - إشعارات Toast موحّدة.
     - ربط مرجعي (Bootstrap) بالخريطة وبقية حالة التطبيق.
     - مضيف واجهة موحّد: تبويب «وحدات» + نافذة عائمة.
   لا يعتمد على أي مكتبة خارجية (Leaflet يُمرَّر عبر الكونтекست).
   يُحمَّل هذا الملف قبل سكربت التطبيق الرئيسي.
   ================================================================ */
(function () {
    'use strict';
    if (window.GIS) { return; }

    var MODULES = Object.create(null);
    var ORDER = [];
    var EVENTS = Object.create(null);
    var READY_FNS = [];
    var STARTED = false;
    var REFS = null;
    var GRID = null;
    var PANEL = null;
    var PANEL_BODY = null;
    var ACTIVE = null;

    function log() { try { console.log.apply(console, ['[GIS]'].concat([].slice.call(arguments))); } catch (e) {} }
    function warn() { try { console.warn.apply(console, ['[GIS]'].concat([].slice.call(arguments))); } catch (e) {} }
    function safe(fn, label) { try { return fn(); } catch (e) { warn('خطأ في ' + (label || 'وحدة'), e); return null; } }

    function el(tag, cls, html) {
        var n = document.createElement(tag);
        if (cls) { n.className = cls; }
        if (html != null) { n.innerHTML = html; }
        return n;
    }
    function escapeHtml(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }
    function clear(node) { while (node && node.firstChild) { node.removeChild(node.firstChild); } }

    /* ---------- Toast ---------- */
    function ensureToastHost() {
        var host = document.getElementById('gisToastHost');
        if (!host) {
            host = el('div', 'gis-toast-host');
            host.id = 'gisToastHost';
            document.body.appendChild(host);
        }
        return host;
    }
    function notify(msg, type, ms) {
        var host = ensureToastHost();
        var t = el('div', 'gis-toast gis-toast-' + (type || 'info'), String(msg == null ? '' : msg));
        host.appendChild(t);
        setTimeout(function () { t.classList.add('show'); }, 12);
        setTimeout(function () {
            t.classList.remove('show');
            setTimeout(function () { if (t.parentNode) { t.parentNode.removeChild(t); } }, 260);
        }, ms || 3200);
    }

    /* ---------- Styles ---------- */
    function injectStyles() {
        if (document.getElementById('gis-core-style')) { return; }
        var css = [
            '.gis-toast-host{position:fixed;top:calc(var(--app-top,70px) + 12px);left:50%;transform:translateX(-50%);z-index:99999;display:flex;flex-direction:column;gap:8px;pointer-events:none;align-items:center;}',
            '.gis-toast{background:rgba(15,23,42,.96);color:#e2e8f0;border:1px solid #334155;border-inline-start:3px solid #0284c7;padding:10px 14px;border-radius:10px;font-family:Tajawal,sans-serif;font-size:13px;box-shadow:0 10px 30px rgba(0,0,0,.4);opacity:0;transform:translateY(-8px);transition:opacity .22s,transform .22s;max-width:82vw;}',
            '.gis-toast.show{opacity:1;transform:none;}',
            '.gis-toast-success{border-inline-start-color:#10b981;}',
            '.gis-toast-error{border-inline-start-color:#ef4444;}',
            '.gis-toast-warn{border-inline-start-color:#f59e0b;}',
            '.gis-mod-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;}',
            '.gis-mod-group-title{font-size:12px;font-weight:800;color:var(--txt-dim,#94a3b8);margin:10px 2px 4px;letter-spacing:.3px;}',
            '.gis-mod-card{display:flex;flex-direction:column;gap:6px;align-items:flex-start;text-align:right;padding:12px;border-radius:12px;border:1px solid var(--card-brd,#334155);background:var(--card-bg,#1e293b);color:var(--txt,#e2e8f0);cursor:pointer;transition:.18s;font-family:inherit;}',
            '.gis-mod-card:hover{border-color:var(--accent,#0284c7);transform:translateY(-2px);}',
            '.gis-mod-card .gis-mod-ico{width:34px;height:34px;border-radius:10px;display:flex;align-items:center;justify-content:center;background:rgba(2,132,199,.16);color:#38bdf8;font-size:16px;}',
            '.gis-mod-card .gis-mod-name{font-size:13px;font-weight:700;}',
            '.gis-mod-card .gis-mod-desc{font-size:11px;color:var(--txt-dim,#94a3b8);line-height:1.5;}',
            '.gis-mod-card.is-soon{opacity:.5;cursor:default;}',
            '.gis-mod-card.is-error{border-color:#ef4444;}',
            '.gis-mod-panel{position:fixed;top:calc(var(--app-top,70px) + 12px);left:50%;transform:translateX(-50%);z-index:99998;width:min(520px,94vw);max-height:calc(var(--vh,100vh) - var(--app-top,70px) - 34px);display:none;flex-direction:column;background:var(--panel-bg,rgba(15,23,42,.94));backdrop-filter:blur(12px) saturate(150%);-webkit-backdrop-filter:blur(12px) saturate(150%);border:1px solid var(--card-brd,#334155);border-radius:14px;box-shadow:0 20px 50px rgba(0,0,0,.5);color:var(--txt,#e2e8f0);overflow:hidden;}',
            '.gis-mod-panel.open{display:flex;}',
            '.gis-mod-panel-head{display:flex;align-items:center;gap:8px;padding:11px 13px;border-bottom:1px solid var(--card-brd,#334155);background:linear-gradient(90deg,rgba(2,132,199,.20),transparent);}',
            '.gis-mod-panel-title{font-size:13.5px;font-weight:800;display:flex;align-items:center;gap:8px;min-width:0;}',
            '.gis-mod-panel-title i{color:var(--accent,#38bdf8);}',
            '.gis-mod-panel-close{margin-inline-start:auto;width:30px;height:30px;border-radius:9px;border:1px solid var(--card-brd,#334155);background:rgba(255,255,255,.05);color:#cfe0ee;cursor:pointer;}',
            '.gis-mod-panel-close:hover{background:#ef4444;color:#fff;border-color:#ef4444;}',
            '.gis-mod-panel-body{padding:13px;overflow:auto;font-family:Tajawal,sans-serif;font-size:13px;line-height:1.7;}',
            '.gis-mod-panel-body:empty::before{content:"لا يوجد محتوى.";color:var(--txt-dim,#94a3b8);}',
            '.gis-mod-badge{display:inline-block;padding:2px 8px;border-radius:999px;font-size:11px;background:rgba(2,132,199,.18);color:#7dd3fc;border:1px solid rgba(2,132,199,.35);}'
        ].join('');
        var s = el('style');
        s.id = 'gis-core-style';
        s.textContent = css;
        document.head.appendChild(s);
    }

    /* ---------- UI host ---------- */
    function fallbackSwitch(tab) {
        Array.prototype.forEach.call(document.querySelectorAll('.tab-pane'), function (p) { p.classList.remove('active'); });
        Array.prototype.forEach.call(document.querySelectorAll('.tabs button'), function (b) { b.classList.remove('active'); });
        var pane = document.getElementById('tab-' + tab);
        var btn = document.querySelector('.tabs button[data-tab="' + tab + '"]');
        if (pane) { pane.classList.add('active'); }
        if (btn) { btn.classList.add('active'); }
    }
    function switchTo(tab) {
        if (REFS && REFS.ui && typeof REFS.ui.switchTab === 'function') { REFS.ui.switchTab(tab); }
        else { fallbackSwitch(tab); }
    }

    function buildUi() {
        if (document.getElementById('tab-modules')) { GRID = document.getElementById('gisModulesGrid'); return; }
        var tabs = document.querySelector('.sidebar .tabs');
        var content = document.querySelector('.sidebar .content');
        if (!tabs || !content) { warn('لم يتم العثور على حاوية اللوحة الجانبية'); return; }

        var btn = el('button', '', '<i class="fas fa-cubes"></i> وحدات');
        btn.setAttribute('data-tab', 'modules');
        btn.addEventListener('click', function () { switchTo('modules'); });
        tabs.appendChild(btn);

        var pane = el('div', 'tab-pane');
        pane.id = 'tab-modules';
        pane.innerHTML =
            '<div class="tab-header"><h4><i class="fas fa-cubes"></i> وحدات GIS المتقدمة</h4></div>' +
            '<div class="gis-mod-grid" id="gisModulesGrid"></div>';
        content.appendChild(pane);
        GRID = pane.querySelector('#gisModulesGrid');

        var dock = document.getElementById('sideDock');
        if (dock) {
            var d = el('button');
            d.type = 'button';
            d.setAttribute('data-side', 'modules');
            d.title = 'وحدات GIS';
            d.innerHTML = '<i class="fas fa-cubes"></i>';
            d.addEventListener('click', function () {
                if (REFS && REFS.ui && typeof REFS.ui.setSidePanel === 'function') { REFS.ui.setSidePanel(true, 'modules'); }
                else { switchTo('modules'); }
            });
            dock.appendChild(d);
        }
    }

    function buildPanel() {
        if (PANEL) { return; }
        PANEL = el('div', 'gis-mod-panel');
        PANEL.id = 'gisModPanel';
        PANEL.innerHTML =
            '<div class="gis-mod-panel-head">' +
                '<span class="gis-mod-panel-title" id="gisModPanelTitle"></span>' +
                '<button type="button" class="gis-mod-panel-close" id="gisModPanelClose" title="إغلاق"><i class="fas fa-times"></i></button>' +
            '</div>' +
            '<div class="gis-mod-panel-body" id="gisModPanelBody"></div>';
        document.body.appendChild(PANEL);
        PANEL_BODY = PANEL.querySelector('#gisModPanelBody');
        PANEL.querySelector('#gisModPanelClose').addEventListener('click', closePanel);
        document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { closePanel(); } });
    }

    function mountCard(def) {
        if (!GRID) { return; }
        if (GRID.querySelector('.gis-mod-card[data-mod="' + def.id + '"]')) { return; }
        var groupTitle = def.group || 'أدوات عامة';
        var groupKey = 'g-' + groupTitle.replace(/\s+/g, '_');
        var group = GRID.querySelector('[data-group="' + groupKey + '"]');
        if (!group) {
            var gt = el('div', 'gis-mod-group-title', escapeHtml(groupTitle));
            gt.setAttribute('data-group-head', groupKey);
            GRID.appendChild(gt);
            group = el('div', 'gis-mod-grid');
            group.setAttribute('data-group', groupKey);
            GRID.appendChild(group);
        }
        var available = typeof def.mount === 'function' || typeof def.open === 'function';
        var card = el('button', 'gis-mod-card' + (available ? '' : ' soon'));
        card.type = 'button';
        card.setAttribute('data-mod', def.id);
        card.innerHTML =
            '<span class="gis-mod-ico"><i class="fas ' + escapeHtml(def.icon || 'fa-puzzle-piece') + '"></i></span>' +
            '<span class="gis-mod-name">' + escapeHtml(def.title || def.id) + '</span>' +
            '<span class="gis-mod-desc">' + escapeHtml(def.description || '') + '</span>';
        if (available) {
            card.addEventListener('click', function () { openModule(def.id); });
        } else {
            card.disabled = true;
        }
        group.appendChild(card);
    }

    function openModule(id) {
        var def = MODULES[id];
        if (!def) { warn('openModule: وحدة غير معروفة', id); return; }
        if (ACTIVE && ACTIVE !== def && typeof ACTIVE.destroy === 'function') { safe(function () { ACTIVE.destroy(); }, 'destroy:' + ACTIVE.id); }
        ACTIVE = def;
        buildPanel();
        clear(PANEL_BODY);
        var title = PANEL.querySelector('#gisModPanelTitle');
        title.innerHTML = '<i class="fas ' + escapeHtml(def.icon || 'fa-puzzle-piece') + '"></i> ' + escapeHtml(def.title || def.id);
        PANEL.classList.add('open');
        if (typeof def.open === 'function') { safe(function () { def.open(PANEL_BODY, GIS.ctx); }, 'open:' + id); return; }
        safe(function () { def.mount(PANEL_BODY, GIS.ctx); }, 'mount:' + id);
        GIS.emit('module:open', { id: id });
    }

    function closePanel() {
        if (!PANEL) { return; }
        PANEL.classList.remove('open');
        if (ACTIVE && typeof ACTIVE.destroy === 'function') { safe(function () { ACTIVE.destroy(); }, 'destroy:' + ACTIVE.id); }
        ACTIVE = null;
        clear(PANEL_BODY);
        GIS.emit('module:close', {});
    }

    /* ---------- Lifecycle ---------- */
    function buildCtx() {
        var r = REFS || {};
        GIS.ctx = {
            map: r.map || null,
            L: r.L || window.L || null,
            ui: r.ui || {},
            state: r.state || {},
            api: r.api || {},
            notify: notify,
            el: el,
            escapeHtml: escapeHtml,
            on: GIS.on,
            emit: GIS.emit,
            openModule: openModule
        };
    }

    function start() {
        if (STARTED) { return; }
        STARTED = true;
        injectStyles();
        buildCtx();
        buildUi();
        buildPanel();
        ensureToastHost();
        ORDER.forEach(function (id) { mountCard(MODULES[id]); });
        ORDER.forEach(function (id) {
            var m = MODULES[id];
            if (typeof m.init === 'function') { safe(function () { m.init(GIS.ctx); }, 'init:' + id); }
        });
        READY_FNS.forEach(function (f) { safe(f, 'ready'); });
        READY_FNS.length = 0;
        log('تم تشغيل طبقة الأساس — عدد الوحدات:', ORDER.length);
        GIS.emit('start', { count: ORDER.length });
    }

    var GIS = {
        version: '1.0.0',
        modules: MODULES,
        ctx: {},
        refs: null,

        registerModule: function (def) {
            if (!def || !def.id) { warn('registerModule: مطلوب حقل id', def); return null; }
            if (MODULES[def.id]) { warn('registerModule: معرّف مكرر', def.id); return MODULES[def.id]; }
            def.order = (typeof def.order === 'number') ? def.order : 100;
            MODULES[def.id] = def;
            ORDER.push(def.id);
            ORDER.sort(function (a, b) { return (MODULES[a].order - MODULES[b].order); });
            if (STARTED) { mountCard(def); }
            return def;
        },
        getModule: function (id) { return MODULES[id] || null; },
        listModules: function () { return ORDER.map(function (id) { return MODULES[id]; }); },

        ready: function (fn) {
            if (typeof fn !== 'function') { return; }
            if (STARTED) { safe(fn, 'ready'); } else { READY_FNS.push(fn); }
        },

        on: function (evt, fn) { (EVENTS[evt] = EVENTS[evt] || []).push(fn); return fn; },
        off: function (evt, fn) {
            var a = EVENTS[evt]; if (!a) { return; }
            var i = a.indexOf(fn); if (i >= 0) { a.splice(i, 1); }
        },
        emit: function (evt, data) {
            var a = EVENTS[evt]; if (!a) { return; }
            a.slice().forEach(function (f) { safe(function () { f(data); }, 'event:' + evt); });
        },

        notify: notify,
        bootstrap: function (refs) { REFS = refs || {}; GIS.refs = REFS; },
        start: start,
        openModule: openModule,
        closePanel: closePanel
    };

    window.GIS = GIS;

    if (document.readyState === 'complete') { setTimeout(start, 0); }
    else { window.addEventListener('load', start); }
})();
