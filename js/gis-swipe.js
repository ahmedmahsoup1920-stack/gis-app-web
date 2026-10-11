/* ================================================================
   GIS Module 03 — المقارنة بالسحب (Swipe / Basemap Compare)
   ================================================================ */
(function () {
    'use strict';
    if (!window.GIS) { return; }
    var U = window.GIS.util;

    function baseKeys() { try { return Object.keys(baseMaps); } catch (e) { return []; } }

    window.GIS.registerModule({
        id: 'swipe',
        title: 'مقارنة الخرائط (Swipe)',
        icon: 'fa-left-right',
        group: 'التمثيل البصري',
        order: 90,
        description: 'سحب فاصل عمودي للمقارنة بين خريطتين أساسيتين',

        mount: function (root, ctx) {
            var L = ctx.L;
            var keys = baseKeys();
            if (!keys.length) { root.innerHTML = '<div style="color:#fca5a5">لا توجد خرائط أساس متاحة.</div>'; return; }

            root.innerHTML =
                '<div data-f="a" style="margin-bottom:8px"></div>' +
                '<div data-f="b" style="margin-bottom:8px"></div>' +
                '<label style="font-size:11.5px;color:var(--txt-dim,#94a3b8)">موضع الفاصل</label>' +
                '<input data-f="range" type="range" min="0" max="100" value="50" style="width:100%">' +
                '<button type="button" data-act="toggle" style="' + U.btnStyle + '"><i class="fas fa-play"></i> تشغيل المقارنة</button>' +
                '<div style="margin-top:8px;font-size:11.5px;color:var(--txt-dim,#94a3b8)">عند التشغيل تُخفى الخريطة النشطة وتُعرض الخريطتان مع فاصل قابل للسحب.</div>';

            var aSel = U.el('select', { style: U.selectStyle }, U.options(keys.map(function (k) { return { value: k, label: k, sel: (typeof activeMap !== 'undefined' && k === activeMap) }; })));
            var bSel = U.el('select', { style: U.selectStyle }, U.options(keys.map(function (k, i) { return { value: k, label: k, sel: i === 1 }; })));
            var aw = root.querySelector('[data-f="a"]'); aw.innerHTML = '<label style="font-size:11.5px;color:var(--txt-dim,#94a3b8);display:block;margin-bottom:4px;">الخريطة اليسرى (أ)</label>'; aw.appendChild(aSel);
            var bw = root.querySelector('[data-f="b"]'); bw.innerHTML = '<label style="font-size:11.5px;color:var(--txt-dim,#94a3b8);display:block;margin-bottom:4px;">الخريطة اليمنى (ب)</label>'; bw.appendChild(bSel);

            var range = root.querySelector('[data-f="range"]');
            var st = { on: false, a: null, b: null, paneA: null, paneB: null, line: null, handle: null };

            function cloneBase(key, pane) {
                var l = baseMaps[key].layer;
                var opts = {}; for (var k in l.options) { opts[k] = l.options[k]; }
                opts.pane = pane;
                return L.tileLayer(l._url, opts);
            }
            function setPos(pct) {
                pct = Math.max(0, Math.min(100, pct));
                if (st.paneB) { st.paneB.style.clipPath = 'inset(0 0 0 ' + pct + '%)'; st.paneB.style.webkitClipPath = 'inset(0 0 0 ' + pct + '%)'; }
                if (st.line) { st.line.style.left = pct + '%'; }
                if (st.handle) { st.handle.style.left = pct + '%'; }
            }

            function start() {
                if (st.on) { return; }
                var c = ctx.map.getContainer();
                if (!ctx.map.getPane('swipeA')) { ctx.map.createPane('swipeA'); }
                if (!ctx.map.getPane('swipeB')) { ctx.map.createPane('swipeB'); }
                st.paneA = ctx.map.getPane('swipeA'); st.paneB = ctx.map.getPane('swipeB');
                st.paneA.style.zIndex = 210; st.paneA.style.pointerEvents = 'none';
                st.paneB.style.zIndex = 211; st.paneB.style.pointerEvents = 'none';

                st.a = cloneBase(aSel.value, 'swipeA').addTo(ctx.map);
                st.b = cloneBase(bSel.value, 'swipeB').addTo(ctx.map);

                try { if (typeof currentLayer !== 'undefined' && currentLayer && ctx.map.hasLayer(currentLayer)) { ctx.map.removeLayer(currentLayer); } } catch (e) {}

                st.line = document.createElement('div');
                st.line.style.cssText = 'position:absolute;top:0;bottom:0;width:2px;background:#fff;box-shadow:0 0 6px rgba(0,0,0,.6);z-index:1000;pointer-events:none;';
                st.handle = document.createElement('div');
                st.handle.style.cssText = 'position:absolute;top:50%;transform:translate(-50%,-50%);width:30px;height:30px;border-radius:50%;background:#0284c7;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.5);z-index:1001;cursor:ew-resize;touch-action:none;display:flex;align-items:center;justify-content:center;';
                st.handle.innerHTML = '<i class="fas fa-left-right" style="color:#fff;font-size:12px"></i>';
                c.appendChild(st.line); c.appendChild(st.handle);

                setPos(Number(range.value));
                var dragging = false;
                st._down = function (e) { dragging = true; e.preventDefault(); };
                st._mv = function (e) {
                    if (!dragging) { return; }
                    var rect = c.getBoundingClientRect();
                    setPos(((e.touches ? e.touches[0].clientX : e.clientX) - rect.left) / rect.width * 100);
                };
                st._up = function () { dragging = false; };
                st.handle.addEventListener('mousedown', st._down);
                st.handle.addEventListener('touchstart', st._down, { passive: false });
                window.addEventListener('mousemove', st._mv);
                window.addEventListener('touchmove', st._mv, { passive: false });
                window.addEventListener('mouseup', st._up);
                window.addEventListener('touchend', st._up);

                st.on = true;
                ctx.notify('تم تشغيل المقارنة — اسحب الفاصل', 'success');
            }

            function stop() {
                if (!st.on) { return; }
                try { if (st.a) { ctx.map.removeLayer(st.a); } } catch (e) {}
                try { if (st.b) { ctx.map.removeLayer(st.b); } } catch (e) {}
                if (st.line && st.line.parentNode) { st.line.parentNode.removeChild(st.line); }
                if (st.handle && st.handle.parentNode) { st.handle.parentNode.removeChild(st.handle); }
                if (st._mv) { window.removeEventListener('mousemove', st._mv); window.removeEventListener('touchmove', st._mv); }
                if (st._up) { window.removeEventListener('mouseup', st._up); window.removeEventListener('touchend', st._up); }
                try { if (typeof switchMap === 'function' && typeof activeMap !== 'undefined') { switchMap(activeMap); } } catch (e) {}
                st.on = false; st.line = null; st.handle = null;
                ctx.notify('تم إيقاف المقارنة', 'info');
            }

            range.addEventListener('input', function () { if (st.on) { setPos(Number(range.value)); } });
            root.querySelector('[data-act="toggle"]').addEventListener('click', function () {
                if (st.on) { stop(); this.innerHTML = '<i class="fas fa-play"></i> تشغيل المقارنة'; }
                else { start(); this.innerHTML = '<i class="fas fa-stop"></i> إيقاف المقارنة'; }
            });

            this._cleanup = stop;
        },

        destroy: function () { if (typeof this._cleanup === 'function') { try { this._cleanup(); } catch (e) {} } }
    });
})();
