/* ================================================================
   GIS Module 14 — تحليل الشبكة والجوار (Network Analysis)
   تتبّع الشبكة المتصلة من عنصر خطّي + أقرب جار (Nearest Neighbor).
   ================================================================ */
(function () {
    'use strict';
    if (!window.GIS) { return; }
    var U = window.GIS.util;

    function addLineResult(name, desc, geojson, color) {
        var L = window.L;
        var saved = { stroke: drawStyle.stroke, weight: drawStyle.weight, opacity: drawStyle.opacity };
        drawStyle.stroke = color; drawStyle.weight = 4; if ('opacity' in drawStyle) { drawStyle.opacity = 1; }
        var layer = L.geoJSON(geojson, { pane: 'gisLinePane' });
        try { addCustomFeature('خط', name, desc, layer, geojson); }
        finally { drawStyle.stroke = saved.stroke; drawStyle.weight = saved.weight; if ('opacity' in drawStyle) { drawStyle.opacity = saved.opacity; } }
        var arr = (typeof customFeaturesData !== 'undefined' ? customFeaturesData : null) || [];
        var cf = arr[arr.length - 1];
        if (cf) { cf.color = color; cf.fillColor = color; cf.moduleResult = true; try { applyCustomFeatureStyle(cf); updateTOC(); } catch (e) {} }
        return cf;
    }

    function linesOf(feature) {
        var g = feature && feature.geometry;
        if (!g) { return []; }
        if (g.type === 'LineString') { return [g.coordinates]; }
        if (g.type === 'MultiLineString') { return g.coordinates; }
        return [];
    }
    function nodeKey(c) { return c[0].toFixed(6) + ',' + c[1].toFixed(6); }
    function repr(feature) {
        if (!feature || !feature.geometry) { return null; }
        if (feature.geometry.type === 'Point') { return feature.geometry.coordinates; }
        try { return window.turf.centroid(feature).geometry.coordinates; } catch (e) { return null; }
    }

    window.GIS.registerModule({
        id: 'network',
        title: 'تحليل الشبكة',
        icon: 'fa-share-nodes',
        group: 'التحليل المكاني',
        order: 160,
        description: 'تتبّع الشبكة المتصلة من عنصر خطّي + إيجاد أقرب جار',

        mount: function (root, ctx) {
            if (!window.turf) { root.innerHTML = '<div style="color:#fca5a5">مكتبة Turf غير محمّلة.</div>'; return; }

            root.innerHTML =
                U.field('نوع التحليل', '<select data-f="mode" style="' + U.selectStyle + '">' +
                    '<option value="trace">تتبّع الشبكة المتصلة</option>' +
                    '<option value="nearest">أقرب جار (Nearest Neighbor)</option>' +
                '</select>') +
                '<div data-f="scopeWrap">' + U.field('المصدر', '<select data-f="scope" style="' + U.selectStyle + '">' +
                    U.options([
                        { value: 'all', label: 'كل العناصر', sel: true },
                        { value: 'file', label: 'عناصر الملف الحالي' },
                        { value: 'custom', label: 'العناصر المخصصة' }
                    ]) + '</select>') + '</div>' +
                '<div data-f="traceWrap">' + U.field('عنصر البدء (خطّي)', '<select data-f="start" style="' + U.selectStyle + '"></select>') + '</div>' +
                '<button type="button" data-act="run" style="' + U.btnStyle + '"><i class="fas fa-diagram-project"></i> تنفيذ</button>' +
                '<div data-f="out" style="margin-top:12px"></div>';

            var modeSel = root.querySelector('[data-f="mode"]');
            var scopeSel = root.querySelector('[data-f="scope"]');
            var startSel = root.querySelector('[data-f="start"]');
            var out = root.querySelector('[data-f="out"]');

            function lineScope() { return U.sourceFeatures(scopeSel.value).filter(function (o) { return U.geomType(o.f) === 'line'; }); }

            function refreshStart() {
                var ls = lineScope();
                startSel.innerHTML = ls.length
                    ? U.options(ls.map(function (o, i) { return { value: String(i), label: (i + 1) + '. ' + (o.name || 'خط') }; }))
                    : '<option value="">لا توجد عناصر خطّية</option>';
                startSel._list = ls;
            }
            function sync() {
                var isTrace = modeSel.value === 'trace';
                root.querySelector('[data-f="traceWrap"]').style.display = isTrace ? '' : 'none';
                if (isTrace) { refreshStart(); }
            }
            modeSel.addEventListener('change', sync);
            scopeSel.addEventListener('change', sync);
            sync();

            function trace() {
                var ls = lineScope();
                if (ls.length < 1) { ctx.notify('لا توجد عناصر خطّية', 'warn'); return; }
                var startIdx = parseInt(startSel.value, 10);
                if (isNaN(startIdx) || startIdx < 0 || startIdx >= ls.length) { ctx.notify('اختر عنصر بدء صحيح', 'warn'); return; }

                var nodeToFeat = Object.create(null), featNodes = [];
                ls.forEach(function (o, i) {
                    var keys = [];
                    linesOf(o.f).forEach(function (coords) {
                        if (coords.length) {
                            var a = nodeKey(coords[0]), b = nodeKey(coords[coords.length - 1]);
                            (nodeToFeat[a] = nodeToFeat[a] || []).push(i);
                            (nodeToFeat[b] = nodeToFeat[b] || []).push(i);
                            keys.push(a, b);
                        }
                    });
                    featNodes[i] = keys;
                });

                var visited = Object.create(null), stack = [startIdx];
                visited[startIdx] = true;
                while (stack.length) {
                    var fi = stack.pop();
                    (featNodes[fi] || []).forEach(function (k) {
                        (nodeToFeat[k] || []).forEach(function (j) {
                            if (!visited[j]) { visited[j] = true; stack.push(j); }
                        });
                    });
                }

                var comp = Object.keys(visited).map(function (i) { return ls[Number(i)]; });
                var fc = { type: 'FeatureCollection', features: comp.map(function (o) { return o.f; }) };
                var totalLen = 0;
                comp.forEach(function (o) { try { totalLen += window.turf.length(o.f, { units: 'meters' }); } catch (e) {} });
                var desc = 'شبكة متصلة من ' + comp.length + ' خط — الطول الكلي: ' + U.fmtLen(totalLen);
                var cf = addLineResult('شبكة متصلة (' + comp.length + ')', desc, fc, '#22d3ee');

                out.innerHTML =
                    '<div style="background:var(--card-bg,#1e293b);border:1px solid var(--card-brd,#334155);border-radius:10px;padding:10px;">' +
                    '<div style="font-weight:800;margin-bottom:4px"><i class="fas fa-share-nodes" style="color:#22d3ee"></i> تتبّع الشبكة</div>' +
                    '<div style="font-size:12px">عناصر متصلة: <b>' + comp.length + '</b> من ' + ls.length + '</div>' +
                    '<div style="font-size:12px">الطول الكلي: <b>' + ctx.escapeHtml(U.fmtLen(totalLen)) + '</b></div>' +
                    (cf ? '<button type="button" data-act="remove" style="' + U.btn2Style + ';margin-top:10px;width:100%;border-color:#ef4444;color:#fca5a5"><i class="fas fa-trash"></i> حذف النتيجة</button>' : '') +
                    '</div>';
                if (cf) {
                    out.querySelector('[data-act="remove"]').addEventListener('click', function () {
                        U.removeCustomById(cf.id);
                        out.innerHTML = '<div style="color:var(--txt-dim,#94a3b8);font-size:12px">تم حذف النتيجة.</div>';
                    });
                }
                ctx.notify('شبكة متصلة: ' + comp.length + ' عنصر', 'success');
            }

            function nearest() {
                var list = U.sourceFeatures(scopeSel.value).filter(function (o) { return o.f.geometry; });
                if (list.length < 2) { ctx.notify('يلزم عنصران على الأقل', 'warn'); return; }
                if (list.length > 500) { list = list.slice(0, 500); }
                var rp = list.map(function (o) { return repr(o.f); });
                var best = null;
                for (var i = 0; i < list.length; i++) {
                    if (!rp[i]) { continue; }
                    for (var j = i + 1; j < list.length; j++) {
                        if (!rp[j]) { continue; }
                        var d = 0;
                        try { d = window.turf.distance(rp[i], rp[j], { units: 'meters' }); } catch (e) { continue; }
                        if (!best || d < best.d) { best = { i: i, j: j, d: d }; }
                    }
                }
                if (!best) { ctx.notify('تعذّر حساب المسافات', 'warn'); return; }

                var line = { type: 'Feature', properties: { distance_m: +best.d.toFixed(2) }, geometry: { type: 'LineString', coordinates: [rp[best.i], rp[best.j]] } };
                var cf = addLineResult('أقرب جار', 'الزوج الأقرب: ' + U.fmtLen(best.d), line, '#f472b6');
                var p1 = { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: rp[best.i] } };
                var p2 = { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: rp[best.j] } };
                try {
                    var L = window.L;
                    var pts = L.layerGroup([
                        L.circleMarker([rp[best.i][1], rp[best.i][0]], { radius: 7, color: '#f472b6', fillColor: '#f472b6', fillOpacity: 1, pane: 'gisPointPane' }),
                        L.circleMarker([rp[best.j][1], rp[best.j][0]], { radius: 7, color: '#f472b6', fillColor: '#f472b6', fillOpacity: 1, pane: 'gisPointPane' })
                    ]).addTo(ctx.map);
                    window._gisNearestPair = pts;
                } catch (e) {}

                out.innerHTML =
                    '<div style="background:var(--card-bg,#1e293b);border:1px solid var(--card-brd,#334155);border-radius:10px;padding:10px;">' +
                    '<div style="font-weight:800;margin-bottom:4px"><i class="fas fa-arrows-left-right-to-line" style="color:#f472b6"></i> أقرب جار</div>' +
                    '<div style="font-size:12px">أقرب مسافة: <b>' + ctx.escapeHtml(U.fmtLen(best.d)) + '</b></div>' +
                    '<div style="font-size:12px;color:var(--txt-dim,#94a3b8)">' + ctx.escapeHtml(list[best.i].name || '') + ' ↔ ' + ctx.escapeHtml(list[best.j].name || '') + '</div>' +
                    '<button type="button" data-act="remove" style="' + U.btn2Style + ';margin-top:10px;width:100%;border-color:#ef4444;color:#fca5a5"><i class="fas fa-trash"></i> حذف النتيجة</button>' +
                    '</div>';
                out.querySelector('[data-act="remove"]').addEventListener('click', function () {
                    if (cf) { U.removeCustomById(cf.id); }
                    try { if (window._gisNearestPair) { ctx.map.removeLayer(window._gisNearestPair); window._gisNearestPair = null; } } catch (e) {}
                    out.innerHTML = '<div style="color:var(--txt-dim,#94a3b8);font-size:12px">تم حذف النتيجة.</div>';
                });
                ctx.notify('أقرب مسافة: ' + U.fmtLen(best.d), 'success');
            }

            root.querySelector('[data-act="run"]').addEventListener('click', function () {
                if (modeSel.value === 'trace') { trace(); } else { nearest(); }
            });

            this._cleanup = function () { try { if (window._gisNearestPair) { ctx.map.removeLayer(window._gisNearestPair); window._gisNearestPair = null; } } catch (e) {} };
        },

        destroy: function () { if (typeof this._cleanup === 'function') { try { this._cleanup(); } catch (e) {} } }
    });
})();
