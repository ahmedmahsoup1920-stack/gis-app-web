/* ================================================================
   GIS Module 01 — النطاقات العازلة والجوار (Buffer / Proximity)
   ================================================================ */
(function () {
    'use strict';
    if (!window.GIS) { return; }
    var U = window.GIS.util;

    function turfReady(ctx) {
        if (window.turf && typeof window.turf.buffer === 'function') { return true; }
        ctx.notify('مكتبة التحليل المكاني (Turf.js) غير محمّلة', 'error');
        return false;
    }

    window.GIS.registerModule({
        id: 'buffer',
        title: 'النطاقات العازلة',
        icon: 'fa-bullseye',
        group: 'التحليل المكاني',
        order: 10,
        description: 'إنشاء منطقة عازلة حول العناصر وإحصاء المتقاطعات معها',

        mount: function (root, ctx) {
            var html =
                '<div data-f="scope"></div>' +
                '<div data-f="dist"></div>' +
                '<button type="button" data-act="run" style="' + U.btnStyle + '"><i class="fas fa-play"></i> إنشاء النطاق العازل</button>' +
                '<div data-f="out" style="margin-top:12px"></div>';

            root.innerHTML = html;

            var scopeSel = U.el('select', { style: U.selectStyle }, U.options([
                { value: 'selected', label: 'العناصر المحدّدة (تحديد مستطيل)' },
                { value: 'file', label: 'الملف الحالي' },
                { value: 'custom', label: 'العناصر المخصصة' },
                { value: 'locations', label: 'المواقع المحفوظة' },
                { value: 'all', label: 'الكل (ملف + مخصص + مواقع)', sel: true }
            ]));
            var scopeWrap = root.querySelector('[data-f="scope"]');
            scopeWrap.innerHTML = '<label style="font-size:11.5px;color:var(--txt-dim,#94a3b8);display:block;margin-bottom:4px;">المصدر</label>';
            scopeWrap.appendChild(scopeSel);

            var distWrap = root.querySelector('[data-f="dist"]');
            var dist = U.el('input', { type: 'number', value: '100', min: '1', step: 'any', style: U.inputStyle });
            var unit = U.el('select', { style: U.selectStyle }, U.options([
                { value: 'm', label: 'متر', sel: true },
                { value: 'km', label: 'كيلومتر' },
                { value: 'ft', label: 'قدم' }
            ]));
            distWrap.innerHTML = '<div style="display:flex;gap:8px;margin-top:8px;">' +
                '<div style="flex:2"><label style="font-size:11.5px;color:var(--txt-dim,#94a3b8)">المسافة</label></div>' +
                '<div style="flex:1"><label style="font-size:11.5px;color:var(--txt-dim,#94a3b8)">الوحدة</label></div></div>';
            var r2 = U.el('div', { style: 'display:flex;gap:8px;margin-top:4px;' });
            r2.appendChild(dist); r2.appendChild(unit);
            distWrap.appendChild(r2);

            var out = root.querySelector('[data-f="out"]');

            function run() {
                if (!turfReady(ctx)) { return; }
                var feats = U.sourceFeatures(scopeSel.value);
                if (!feats.length) { ctx.notify('لا توجد عناصر في المصدر المحدّد', 'warn'); return; }
                var meters = U.toMeters(dist.value, unit.value);
                if (meters <= 0) { ctx.notify('أدخل مسافة صحيحة', 'warn'); return; }

                var buffered = [], failed = 0;
                feats.forEach(function (o) {
                    try {
                        var b = window.turf.buffer(o.f, meters, { units: 'meters', steps: 18 });
                        if (b) { buffered.push(b); } else { failed++; }
                    } catch (e) { failed++; }
                });
                if (!buffered.length) { ctx.notify('تعذّر إنشاء النطاق العازل', 'error'); return; }

                var merged = buffered[0];
                for (var i = 1; i < buffered.length; i++) {
                    try { merged = window.turf.union(merged, buffered[i]) || merged; } catch (e) {}
                }

                var area = 0;
                try { area = window.turf.area(merged); } catch (e) {}

                var hits = [];
                feats.forEach(function (o) {
                    try {
                        var g = o.f.geometry && o.f.geometry.type;
                        var inside = (g === 'Point') ? window.turf.booleanPointInPolygon(o.f, merged)
                            : window.turf.booleanIntersects(o.f, merged);
                        if (inside) { hits.push(o.name); }
                    } catch (e) {}
                });

                var dLabel = dist.value + ' ' + unit.options[unit.selectedIndex].text;
                var desc = 'نطاق عازل ' + dLabel + ' حول ' + feats.length + ' عنصر — المساحة: ' + U.fmtArea(area);
                var cf = U.addResultPolygon('نطاق عازل ' + dLabel, desc, merged, {
                    color: '#f59e0b', fill: '#f59e0b', weight: 2.5, fillOpacity: 0.15
                });

                var listHtml = hits.length
                    ? '<div style="max-height:180px;overflow:auto;margin-top:6px;border:1px solid var(--card-brd,#334155);border-radius:8px;">' +
                        hits.map(function (n, idx) {
                            return '<div style="padding:6px 9px;font-size:12px;border-bottom:1px solid rgba(148,163,184,.15)">' + (idx + 1) + '. ' + ctx.escapeHtml(n) + '</div>';
                        }).join('') + '</div>'
                    : '<div style="color:var(--txt-dim,#94a3b8);font-size:12px">لا توجد عناصر داخل النطاق.</div>';

                out.innerHTML =
                    '<div style="background:var(--card-bg,#1e293b);border:1px solid var(--card-brd,#334155);border-radius:10px;padding:10px;">' +
                    '<div style="font-weight:800;margin-bottom:4px"><i class="fas fa-circle-check" style="color:#22c55e"></i> تم إنشاء النطاق</div>' +
                    '<div style="font-size:12px">المساحة: <b>' + ctx.escapeHtml(U.fmtArea(area)) + '</b></div>' +
                    '<div style="font-size:12px">عناصر متقاطعة: <b>' + hits.length + '</b>' + (failed ? ' — فشل: ' + failed : '') + '</div>' +
                    listHtml +
                    (cf ? '<button type="button" data-act="remove" style="' + U.btn2Style + ';margin-top:10px;width:100%;border-color:#ef4444;color:#fca5a5"><i class="fas fa-trash"></i> حذف النتيجة</button>' : '') +
                    '</div>';

                if (cf) {
                    out.querySelector('[data-act="remove"]').addEventListener('click', function () {
                        U.removeCustomById(cf.id);
                        out.innerHTML = '<div style="color:var(--txt-dim,#94a3b8);font-size:12px">تم حذف النطاق.</div>';
                        ctx.notify('تم حذف النطاق العازل', 'info');
                    });
                }
                ctx.notify('تم إنشاء النطاق العازل (' + hits.length + ' متقاطع)', 'success');
            }

            root.querySelector('[data-act="run"]').addEventListener('click', run);
        }
    });
})();
