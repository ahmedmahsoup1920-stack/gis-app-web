/* ================================================================
   GIS Module 09 — التمثيل الحراري (Heatmap / Dynamic Symbology)
   يعتمد على إضافة Leaflet.heat (L.heatLayer)
   ================================================================ */
(function () {
    'use strict';
    if (!window.GIS) { return; }
    var U = window.GIS.util;

    function pointsFor(scope) {
        return U.sourceFeatures(scope).filter(function (o) { return U.geomType(o.f) === 'point'; });
    }

    window.GIS.registerModule({
        id: 'heatmap',
        title: 'الخريطة الحرارية',
        icon: 'fa-fire',
        group: 'التمثيل البصري',
        order: 30,
        description: 'تمثيل كثافة النقاط حراريًا مع التحكم بنصف القطر والضبابية',

        mount: function (root, ctx) {
            var L = ctx.L;
            if (!L || typeof L.heatLayer !== 'function') {
                root.innerHTML = '<div style="color:#fca5a5">ملحق الخريطة الحرارية (leaflet.heat) غير محمّل.</div>';
                return;
            }

            root.innerHTML =
                '<div data-f="scope" style="margin-bottom:8px"></div>' +
                '<div data-f="field" style="margin-bottom:8px"></div>' +
                '<div style="display:flex;gap:12px;margin:10px 0">' +
                  '<label style="flex:1;font-size:12px">نصف القطر: <b data-f="rv">25</b><input data-f="radius" type="range" min="5" max="60" value="25" style="width:100%"></label>' +
                  '<label style="flex:1;font-size:12px">الضبابية: <b data-f="bv">15</b><input data-f="blur" type="range" min="0" max="50" value="15" style="width:100%"></label>' +
                '</div>' +
                '<button type="button" data-act="toggle" style="' + U.btnStyle + '"><i class="fas fa-fire"></i> تشغيل الخريطة الحرارية</button>' +
                '<div data-f="out" style="margin-top:12px"></div>';

            var scopeSel = U.el('select', { style: U.selectStyle }, U.options([
                { value: 'file', label: 'نقاط الملف الحالي', sel: true },
                { value: 'custom', label: 'النقاط المخصصة' },
                { value: 'locations', label: 'المواقع المحفوظة' },
                { value: 'all', label: 'الكل' }
            ]));
            var scopeWrap = root.querySelector('[data-f="scope"]');
            scopeWrap.innerHTML = '<label style="font-size:11.5px;color:var(--txt-dim,#94a3b8);display:block;margin-bottom:4px;">مصدر النقاط</label>';
            scopeWrap.appendChild(scopeSel);

            var fieldWrap = root.querySelector('[data-f="field"]');
            var fieldSel = U.el('select', { style: U.selectStyle });
            fieldWrap.innerHTML = '<label style="font-size:11.5px;color:var(--txt-dim,#94a3b8);display:block;margin-bottom:4px;">حقل الوزن (اختياري)</label>';
            fieldWrap.appendChild(fieldSel);

            var radius = root.querySelector('[data-f="radius"]');
            var blur = root.querySelector('[data-f="blur"]');
            var rv = root.querySelector('[data-f="rv"]');
            var bv = root.querySelector('[data-f="bv"]');
            var out = root.querySelector('[data-f="out"]');
            var heat = null;

            function refreshFields() {
                var pf = pointsFor(scopeSel.value);
                var nums = U.numericFields(pf.map(function (o) { return o.f; }));
                fieldSel.innerHTML = '<option value="">وزن موحّد (1)</option>' + U.options(nums);
            }
            refreshFields();
            scopeSel.addEventListener('change', function () { refreshFields(); if (heat) build(); });

            radius.addEventListener('input', function () { rv.textContent = radius.value; if (heat) build(); });
            blur.addEventListener('input', function () { bv.textContent = blur.value; if (heat) build(); });

            function build() {
                var pf = pointsFor(scopeSel.value);
                if (!pf.length) { ctx.notify('لا توجد نقاط في المصدر المحدّد', 'warn'); return 0; }
                var fld = fieldSel.value;
                var max = 0;
                var pts = pf.map(function (o) {
                    var g = o.f.geometry;
                    var w = 1;
                    if (fld) { w = Number((o.f.properties || {})[fld]); if (!isFinite(w)) { w = 0; } }
                    if (w > max) { max = w; }
                    return [g.coordinates[1], g.coordinates[0], w];
                });
                if (heat) { try { ctx.map.removeLayer(heat); } catch (e) {} heat = null; }
                heat = L.heatLayer(pts, {
                    radius: Number(radius.value),
                    blur: Number(blur.value),
                    maxZoom: 17,
                    max: fld ? (max || 1) : 1.0,
                    minOpacity: 0.25,
                    gradient: { 0.2: '#2563eb', 0.4: '#22d3ee', 0.6: '#22c55e', 0.8: '#f59e0b', 1.0: '#ef4444' }
                }).addTo(ctx.map);
                out.innerHTML = '<div style="background:var(--card-bg,#1e293b);border:1px solid var(--card-brd,#334155);border-radius:10px;padding:10px;font-size:12.5px">' +
                    '<div style="font-weight:800"><i class="fas fa-fire" style="color:#f97316"></i> النقاط: ' + pts.length + '</div>' +
                    (fld ? '<div>الوزن: <b>' + ctx.escapeHtml(fld) + '</b> (حتى ' + max + ')</div>' : '') +
                    '</div>';
                return pts.length;
            }

            var btn = root.querySelector('[data-act="toggle"]');
            btn.addEventListener('click', function () {
                if (heat) {
                    try { ctx.map.removeLayer(heat); } catch (e) {}
                    heat = null; out.innerHTML = '';
                    btn.innerHTML = '<i class="fas fa-fire"></i> تشغيل الخريطة الحرارية';
                    ctx.notify('تم إيقاف الخريطة الحرارية', 'info');
                    return;
                }
                var n = build();
                if (n) { btn.innerHTML = '<i class="fas fa-stop"></i> إيقاف الخريطة الحرارية'; ctx.notify('تم تشغيل الخريطة الحرارية', 'success'); }
            });

            this._cleanup = function () { if (heat) { try { ctx.map.removeLayer(heat); } catch (e) {} heat = null; } };
        },

        destroy: function () { if (typeof this._cleanup === 'function') { try { this._cleanup(); } catch (e) {} } }
    });
})();
