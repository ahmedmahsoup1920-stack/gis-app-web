/* ================================================================
   GIS Module 11 — أدوات التحليل المكاني (GeoProcessing)
   القص / التقاطع / الاتحاد / الإذابة (Clip / Intersect / Union / Dissolve)
   تعتمد على Turf.js وتُخرج طبقة نتيجة قابلة للحذف والتصدير.
   ================================================================ */
(function () {
    'use strict';
    if (!window.GIS) { return; }
    var U = window.GIS.util;

    function addResult(name, desc, geojson, color) {
        var L = window.L;
        var saved = { stroke: drawStyle.stroke, fill: drawStyle.fill, weight: drawStyle.weight, fillOpacity: drawStyle.fillOpacity };
        drawStyle.stroke = color; drawStyle.fill = color; drawStyle.weight = 2.5; drawStyle.fillOpacity = 0.2;
        var layer;
        try {
            if (window.turf && window.turf.area) { try { desc = desc + ' — المساحة: ' + U.fmtArea(window.turf.area(geojson)); } catch (e) {} }
            layer = L.geoJSON(geojson, { pane: 'gisPolyPane' });
            addCustomFeature('مضلع', name, desc, layer, geojson);
        } finally {
            drawStyle.stroke = saved.stroke; drawStyle.fill = saved.fill; drawStyle.weight = saved.weight; drawStyle.fillOpacity = saved.fillOpacity;
        }
        var arr = (typeof customFeaturesData !== 'undefined' ? customFeaturesData : null) || [];
        var cf = arr[arr.length - 1];
        if (cf) {
            cf.color = color; cf.fillColor = color; cf.moduleResult = true;
            try { applyCustomFeatureStyle(cf); updateTOC(); } catch (e) {}
        }
        return cf;
    }

    function unionAll(features) {
        var acc = null;
        features.forEach(function (f) {
            try { acc = acc ? (window.turf.union(acc, f) || acc) : f; } catch (e) {}
        });
        return acc;
    }

    window.GIS.registerModule({
        id: 'geoprocessing',
        title: 'التحليل المكاني',
        icon: 'fa-object-group',
        group: 'التحليل المكاني',
        order: 150,
        description: 'القص والتقاطع والاتحاد والإذابة بين طبقتين من المضلعات',

        mount: function (root, ctx) {
            if (!window.turf) { root.innerHTML = '<div style="color:#fca5a5">مكتبة Turf غير محمّلة.</div>'; return; }

            var scopeOpts = [
                { value: 'all', label: 'كل المضلعات' },
                { value: 'file', label: 'مضلعات الملف الحالي' },
                { value: 'custom', label: 'المضلعات المخصصة' },
                { value: 'selected', label: 'العناصر المحدّدة' }
            ];

            root.innerHTML =
                U.field('العملية', '<select data-f="op" style="' + U.selectStyle + '">' +
                    '<option value="clip">القص (Clip) — أ داخل ب</option>' +
                    '<option value="intersect">التقاطع (Intersect) — أ ∩ ب</option>' +
                    '<option value="union">الاتحاد (Union) — دمج أ و ب</option>' +
                    '<option value="dissolve">الإذابة (Dissolve) — دمج أ فقط</option>' +
                '</select>') +
                U.field('الطبقة أ', '<select data-f="a" style="' + U.selectStyle + '">' + U.options(scopeOpts) + '</select>') +
                '<div data-f="bwrap">' + U.field('الطبقة ب', '<select data-f="b" style="' + U.selectStyle + '">' + U.options(scopeOpts) + '</select>') + '</div>' +
                '<div data-f="fwrap" style="display:none">' + U.field('حقل الإذابة (اختياري)', '<select data-f="field" style="' + U.selectStyle + '"></select>') + '</div>' +
                '<button type="button" data-act="run" style="' + U.btnStyle + '"><i class="fas fa-scissors"></i> تنفيذ العملية</button>' +
                '<div data-f="out" style="margin-top:12px"></div>';

            var opSel = root.querySelector('[data-f="op"]');
            var aSel = root.querySelector('[data-f="a"]');
            var bSel = root.querySelector('[data-f="b"]');
            var fSel = root.querySelector('[data-f="field"]');
            var out = root.querySelector('[data-f="out"]');

            function polygons(scope) { return U.sourceFeatures(scope).filter(function (o) { return U.geomType(o.f) === 'polygon'; }); }

            function refreshFields() {
                var fields = U.allFields(polygons(aSel.value).map(function (o) { return o.f; }));
                fSel.innerHTML = '<option value="">— بدون تجميع —</option>' + U.options(fields);
            }
            function syncOp() {
                var op = opSel.value;
                root.querySelector('[data-f="bwrap"]').style.display = (op === 'dissolve') ? 'none' : '';
                root.querySelector('[data-f="fwrap"]').style.display = (op === 'dissolve') ? '' : 'none';
                if (op === 'dissolve') { refreshFields(); }
            }
            opSel.addEventListener('change', syncOp);
            aSel.addEventListener('change', refreshFields);
            syncOp(); refreshFields();

            function run() {
                var op = opSel.value;
                var A = polygons(aSel.value);
                if (!A.length) { ctx.notify('لا توجد مضلعات في الطبقة أ', 'warn'); return; }

                var results = [], color = '#0ea5e9', title = '';

                try {
                    if (op === 'intersect' || op === 'clip') {
                        var B = polygons(bSel.value);
                        if (!B.length) { ctx.notify('لا توجد مضلعات في الطبقة ب', 'warn'); return; }
                        var bUnion = (op === 'clip') ? unionAll(B.map(function (o) { return o.f; })) : null;
                        A.forEach(function (ao) {
                            B.forEach(function (bo) {
                                try {
                                    var r = (op === 'clip') ? window.turf.intersect(ao.f, bUnion)
                                        : window.turf.intersect(ao.f, bo.f);
                                    if (r) { r.properties = Object.assign({}, ao.f.properties); results.push(r); }
                                } catch (e) {}
                            });
                        });
                        color = '#22c55e'; title = (op === 'clip' ? 'نتيجة القص' : 'نتيجة التقاطع');

                    } else if (op === 'union') {
                        var B2 = polygons(bSel.value);
                        if (!B2.length) { ctx.notify('لا توجد مضلعات في الطبقة ب', 'warn'); return; }
                        var all = A.map(function (o) { return o.f; }).concat(B2.map(function (o) { return o.f; }));
                        var u = unionAll(all);
                        if (u) { results.push(u); }
                        color = '#f59e0b'; title = 'نتيجة الاتحاد';

                    } else if (op === 'dissolve') {
                        var field = fSel.value;
                        if (!field) {
                            var d = unionAll(A.map(function (o) { return o.f; }));
                            if (d) { results.push(d); }
                        } else {
                            var groups = Object.create(null);
                            A.forEach(function (o) {
                                var v = (o.f.properties || {})[field];
                                var key = (v == null ? '' : String(v));
                                (groups[key] = groups[key] || []).push(o.f);
                            });
                            Object.keys(groups).forEach(function (key) {
                                var g = unionAll(groups[key]);
                                if (g) { g.properties = { }; g.properties[field] = key; g.properties.group_count = groups[key].length; results.push(g); }
                            });
                        }
                        color = '#a855f7'; title = 'نتيجة الإذابة';
                    }
                } catch (e) {
                    ctx.notify('فشل تنفيذ العملية: ' + e.message, 'error'); return;
                }

                if (!results.length) { ctx.notify('لا توجد نتائج (قد لا تتقاطع الطبقتان)', 'warn'); return; }

                var fc = { type: 'FeatureCollection', features: results };
                var totalArea = 0;
                results.forEach(function (r) { try { totalArea += window.turf.area(r); } catch (e) {} });
                var desc = title + ' (' + results.length + ' قطعة) — المساحة: ' + U.fmtArea(totalArea);
                var cf = addResult(title, desc, fc, color);

                out.innerHTML =
                    '<div style="background:var(--card-bg,#1e293b);border:1px solid var(--card-brd,#334155);border-radius:10px;padding:10px;">' +
                    '<div style="font-weight:800;margin-bottom:4px"><i class="fas fa-circle-check" style="color:#22c55e"></i> ' + ctx.escapeHtml(title) + '</div>' +
                    '<div style="font-size:12px">عدد القطع: <b>' + results.length + '</b></div>' +
                    '<div style="font-size:12px">المساحة الكلية: <b>' + ctx.escapeHtml(U.fmtArea(totalArea)) + '</b></div>' +
                    (cf ? '<button type="button" data-act="remove" style="' + U.btn2Style + ';margin-top:10px;width:100%;border-color:#ef4444;color:#fca5a5"><i class="fas fa-trash"></i> حذف النتيجة</button>' : '') +
                    '</div>';
                if (cf) {
                    out.querySelector('[data-act="remove"]').addEventListener('click', function () {
                        U.removeCustomById(cf.id);
                        out.innerHTML = '<div style="color:var(--txt-dim,#94a3b8);font-size:12px">تم حذف النتيجة.</div>';
                    });
                }
                ctx.notify(title + ' — ' + results.length + ' قطعة', 'success');
            }

            root.querySelector('[data-act="run"]').addEventListener('click', run);
        }
    });
})();
