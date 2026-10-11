/* ================================================================
   GIS Module 19 — الخط الزمني (Time Slider)
   إبراز العناصر تدريجيًا حسب حقل زمني/رقمي مع تشغيل تلقائي.
   ================================================================ */
(function () {
    'use strict';
    if (!window.GIS) { return; }
    var U = window.GIS.util;

    function parseVal(raw) {
        if (raw == null || raw === '') { return null; }
        var n = Number(raw);
        if (isFinite(n)) { return { v: n, date: false }; }
        var t = Date.parse(raw);
        if (!isNaN(t)) { return { v: t, date: true }; }
        return null;
    }

    window.GIS.registerModule({
        id: 'timeline',
        title: 'الخط الزمني',
        icon: 'fa-clock',
        group: 'التمثيل البصري',
        order: 180,
        description: 'إبراز العناصر تدريجيًا حسب حقل زمني أو رقمي',

        mount: function (root, ctx) {
            var scopeFeats = U.sourceFeatures('all').filter(function (o) { return o.f.geometry; });
            var fields = U.allFields(scopeFeats.map(function (o) { return o.f; }));
            if (!fields.length) { root.innerHTML = '<div style="color:#fca5a5">لا توجد حقول في البيانات الحالية.</div>'; return; }

            root.innerHTML =
                U.field('الحقل الزمني / الرقمي', '<select data-f="field" style="' + U.selectStyle + '">' + U.options(fields) + '</select>') +
                '<div data-f="meta" style="font-size:12px;color:var(--txt-dim,#94a3b8);margin:2px 0 6px"></div>' +
                '<input data-f="range" type="range" min="0" max="100" value="100" style="width:100%">' +
                '<div data-f="cur" style="font-size:12.5px;margin:4px 0 8px;font-weight:700"></div>' +
                '<div style="display:flex;gap:8px">' +
                '<button type="button" data-act="play" style="' + U.btnStyle + ';flex:1;margin-top:0"><i class="fas fa-play"></i> تشغيل</button>' +
                '<button type="button" data-act="reset" style="' + U.btnStyle + ';flex:1;margin-top:0;background:#475569"><i class="fas fa-rotate-left"></i> إعادة</button>' +
                '</div>' +
                '<div style="margin-top:6px;font-size:11.5px;color:var(--txt-dim,#94a3b8)">يعرض العناصر التي قيمتها أقل من أو تساوي مؤشّر الشريط.</div>';

            var fieldSel = root.querySelector('[data-f="field"]');
            var range = root.querySelector('[data-f="range"]');
            var meta = root.querySelector('[data-f="meta"]');
            var cur = root.querySelector('[data-f="cur"]');
            var hl = window.L.layerGroup().addTo(ctx.map);
            var timer = null;
            var state = { min: 0, max: 1, isDate: false, vals: [] };

            function fmt(v) { return state.isDate ? new Date(v).toLocaleDateString('ar-EG') : String(Math.round(v * 100) / 100); }
            function valueAt(pct) { return state.min + (state.max - state.min) * pct / 100; }

            function prep() {
                var field = fieldSel.value;
                state.vals = scopeFeats.map(function (o) {
                    var p = parseVal((o.f.properties || {})[field]);
                    return { o: o, v: p ? p.v : null, date: p ? p.date : false };
                });
                var good = state.vals.filter(function (x) { return x.v !== null; });
                if (!good.length) { meta.textContent = 'لا توجد قيم صالحة في هذا الحقل.'; state.min = 0; state.max = 1; return; }
                state.isDate = good.some(function (x) { return x.date; });
                state.min = Math.min.apply(null, good.map(function (x) { return x.v; }));
                state.max = Math.max.apply(null, good.map(function (x) { return x.v; }));
                meta.textContent = 'النطاق: ' + fmt(state.min) + '  ←  ' + fmt(state.max);
            }

            function render() {
                var pct = Number(range.value);
                var thr = valueAt(pct);
                var matched = state.vals.filter(function (x) { return x.v !== null && x.v <= thr; });
                var fc = { type: 'FeatureCollection', features: matched.map(function (x) { return x.o.f; }) };
                window.__selectedFeatures = fc;
                hl.clearLayers();
                if (fc.features.length) {
                    hl.addLayer(window.L.geoJSON(fc, {
                        pane: 'gisPolyPane',
                        style: function () { return { color: '#f59e0b', weight: 4, fillColor: '#f59e0b', fillOpacity: 0.25 }; },
                        pointToLayer: function (f, ll) { return window.L.circleMarker(ll, { radius: 9, color: '#f59e0b', weight: 3, fillColor: '#f59e0b', fillOpacity: 0.6, pane: 'gisPointPane' }); }
                    }));
                }
                cur.textContent = pct + '%  —  ' + fmt(thr) + '  •  عناصر: ' + matched.length;
            }

            function stopPlay() {
                if (timer) { clearInterval(timer); timer = null; }
                var b = root.querySelector('[data-act="play"]');
                if (b) { b.innerHTML = '<i class="fas fa-play"></i> تشغيل'; }
            }

            root.querySelector('[data-act="play"]').addEventListener('click', function () {
                if (timer) { stopPlay(); return; }
                if (Number(range.value) >= 100) { range.value = 0; }
                this.innerHTML = '<i class="fas fa-stop"></i> إيقاف';
                timer = setInterval(function () {
                    var v = Number(range.value) + 2;
                    if (v >= 100) { range.value = 100; render(); stopPlay(); return; }
                    range.value = v; render();
                }, 120);
            });
            root.querySelector('[data-act="reset"]').addEventListener('click', function () { stopPlay(); range.value = 100; render(); });
            fieldSel.addEventListener('change', function () { stopPlay(); prep(); range.value = 100; render(); });
            range.addEventListener('input', function () { stopPlay(); render(); });

            prep();
            render();
            this._cleanup = function () { stopPlay(); try { ctx.map.removeLayer(hl); } catch (e) {} };
        },

        destroy: function () { if (typeof this._cleanup === 'function') { try { this._cleanup(); } catch (e) {} } }
    });
})();
