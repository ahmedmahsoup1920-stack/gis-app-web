/* ================================================================
   GIS Module 05 — لوحة المعلومات البيانية (BI Dashboard)
   ================================================================ */
(function () {
    'use strict';
    if (!window.GIS) { return; }
    var U = window.GIS.util;

    function esc(ctx, s) { return ctx.escapeHtml(s); }

    window.GIS.registerModule({
        id: 'bi',
        title: 'لوحة المعلومات البيانية',
        icon: 'fa-chart-column',
        group: 'التحليل البياني',
        order: 100,
        description: 'مخططات إحصائية ورسوم بيانية من حقول الطبقات',

        mount: function (root, ctx) {
            root.innerHTML =
                '<div data-f="scope" style="margin-bottom:8px"></div>' +
                '<div data-f="field" style="margin-bottom:8px"></div>' +
                '<button type="button" data-act="run" style="' + U.btnStyle + '"><i class="fas fa-chart-simple"></i> Generate Chart</button>' +
                '<div data-f="out" style="margin-top:12px"></div>';

            var scopeSel = U.el('select', { style: U.selectStyle }, U.options([
                { value: 'active', label: 'Active Layer / Selected Feature (User Drawings)', sel: true },
                { value: 'drawings', label: 'User Drawings Only' },
                { value: 'all', label: 'All Layers' },
                { value: 'file', label: 'Current File Layer' }
            ]));
            var sw = root.querySelector('[data-f="scope"]');
            sw.innerHTML = '<label style="font-size:11.5px;color:var(--txt-dim,#94a3b8);display:block;margin-bottom:4px;">Source Layer</label>';
            sw.appendChild(scopeSel);

            var fieldSel = U.el('select', { style: U.selectStyle });
            var fw = root.querySelector('[data-f="field"]');
            fw.innerHTML = '<label style="font-size:11.5px;color:var(--txt-dim,#94a3b8);display:block;margin-bottom:4px;">Attribute Field</label>';
            fw.appendChild(fieldSel);
            var out = root.querySelector('[data-f="out"]');

            function feats() { return U.sourceFeatures(scopeSel.value).map(function (o) { return o.f; }); }
            function refreshFields() {
                var fs = feats();
                var all = U.allFields(fs);
                var nums = U.numericFields(fs);
                fieldSel.innerHTML = all.map(function (k) {
                    return '<option value="' + ctx.escapeHtml(k) + '">' + ctx.escapeHtml(k) + (nums.indexOf(k) >= 0 ? ' (numeric)' : '') + '</option>';
                }).join('') || '<option value="">— لا حقول —</option>';
            }
            refreshFields();
            scopeSel.addEventListener('change', refreshFields);

            function bars(items, colorFn) {
                var max = 1; items.forEach(function (it) { if (it.v > max) { max = it.v; } });
                return items.map(function (it) {
                    var w = Math.round((it.v / max) * 100);
                    return '<div style="margin-bottom:6px">' +
                        '<div style="display:flex;justify-content:space-between;font-size:11.5px;margin-bottom:2px"><span>' + esc(ctx, it.k) + '</span><b>' + it.v + '</b></div>' +
                        '<div style="height:10px;background:rgba(148,163,184,.18);border-radius:6px;overflow:hidden"><div style="height:100%;width:' + w + '%;background:' + (colorFn ? colorFn(it, max) : '#0284c7') + '"></div></div>' +
                        '</div>';
                }).join('');
            }

            function run() {
                var fs = feats();
                if (!fs.length) {
                    ctx.notify(scopeSel.value === 'active' ? 'Select a feature on the map to analyze' : 'No data found in the selected source', 'warn');
                    return;
                }
                var field = fieldSel.value;
                var nums = U.numericFields(fs);
                var isNum = nums.indexOf(field) >= 0;

                /* ملخص عام */
                var pts = 0, lns = 0, pgs = 0, totLen = 0, totArea = 0;
                fs.forEach(function (f) {
                    var g = U.geomType(f);
                    if (g === 'point') { pts++; } else if (g === 'line') { lns++; totLen += window.featureLengthM(f); } else if (g === 'polygon') { pgs++; totArea += window.featureAreaM2(f); }
                });
                var summary =
                    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">' +
                    card('العناصر', fs.length) + card('نقاط / خطوط / مضلعات', pts + ' / ' + lns + ' / ' + pgs) +
                    card('إجمالي الطول', window.formatDistance(totLen)) + card('إجمالي المساحة', window.formatArea(totArea)) +
                    '</div>';

                var chartHtml = '';
                if (field && !isNum) {
                    var counts = Object.create(null);
                    fs.forEach(function (f) { var v = (f.properties || {})[field]; var k = (v == null || v === '') ? '(فارغ)' : String(v); counts[k] = (counts[k] || 0) + 1; });
                    var items = Object.keys(counts).map(function (k) { return { k: k, v: counts[k] }; }).sort(function (a, b) { return b.v - a.v; }).slice(0, 15);
                    chartHtml = '<div style="margin-top:12px"><div style="font-weight:800;margin-bottom:6px">توزيع القيم — ' + esc(ctx, field) + '</div>' + bars(items) + '</div>';
                } else if (field && isNum) {
                    var vals = fs.map(function (f) { return Number((f.properties || {})[field]); }).filter(function (v) { return isFinite(v); });
                    if (!vals.length) { chartHtml = '<div style="margin-top:12px;color:#fca5a5">لا قيم رقمية في هذا الحقل.</div>'; }
                    else {
                        var min = Math.min.apply(null, vals), max = Math.max.apply(null, vals);
                        var sum = vals.reduce(function (a, b) { return a + b; }, 0), avg = sum / vals.length;
                        var nb = 8, span = (max - min) || 1, bins = [];
                        for (var i = 0; i < nb; i++) { bins.push({ lo: min + span * i / nb, hi: min + span * (i + 1) / nb, v: 0 }); }
                        vals.forEach(function (v) { var idx = Math.min(nb - 1, Math.floor((v - min) / span * nb)); bins[idx].v++; });
                        var items = bins.map(function (b) { return { k: b.lo.toFixed(1) + ' – ' + b.hi.toFixed(1), v: b.v }; });
                        chartHtml = '<div style="margin-top:12px"><div style="font-weight:800;margin-bottom:6px">التوزيع التكراري — ' + esc(ctx, field) + '</div>' +
                            '<div style="font-size:12px;margin-bottom:6px">الحد الأدنى: <b>' + min.toFixed(2) + '</b> — الأعلى: <b>' + max.toFixed(2) + '</b> — المتوسط: <b>' + avg.toFixed(2) + '</b></div>' +
                            bars(items, function () { return '#22d3ee'; }) + '</div>';
                    }
                }

                out.innerHTML = '<div style="background:var(--card-bg,#1e293b);border:1px solid var(--card-brd,#334155);border-radius:10px;padding:12px">' + summary + chartHtml + '</div>';
                ctx.notify('تم توليد المخطط', 'success');
            }

            function card(label, val) {
                return '<div style="background:rgba(2,132,199,.12);border:1px solid rgba(2,132,199,.3);border-radius:10px;padding:10px">' +
                    '<div style="font-size:11.5px;color:var(--txt-dim,#94a3b8)">' + esc(ctx, label) + '</div>' +
                    '<div style="font-size:16px;font-weight:800">' + esc(ctx, val) + '</div></div>';
            }

            root.querySelector('[data-act="run"]').addEventListener('click', run);
        }
    });
})();
