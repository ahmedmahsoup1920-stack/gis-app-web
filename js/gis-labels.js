/* ================================================================
   GIS Module 20 — محرّك التسميات (Labels)
   عرض أسماء/قيم العناصر على الخريطة حسب حقل، مع ضبط المظهر.
   ================================================================ */
(function () {
    'use strict';
    if (!window.GIS) { return; }
    var U = window.GIS.util;

    function anchorOf(f) {
        if (!f || !f.geometry) { return null; }
        if (f.geometry.type === 'Point') { return [f.geometry.coordinates[1], f.geometry.coordinates[0]]; }
        try { var c = window.turf.centroid(f).geometry.coordinates; return [c[1], c[0]]; } catch (e) { return null; }
    }
    function iconHtml(text, size, color, halo) {
        return '<span style="font:700 ' + size + 'px Tajawal,sans-serif;color:' + color + ';' +
            (halo ? 'text-shadow:0 0 3px #000,0 0 3px #000,0 0 3px #000;' : '') +
            'white-space:nowrap;padding:1px 3px;">' + window.GIS.escapeHtml(text) + '</span>';
    }

    window.GIS.registerModule({
        id: 'labels',
        title: 'التسميات',
        icon: 'fa-tag',
        group: 'التمثيل البصري',
        order: 180,
        description: 'إظهار تسميات العناصر حسب حقل مع ضبط الحجم واللون',

        mount: function (root, ctx) {
            var feats = U.sourceFeatures('all').filter(function (o) { return o.f.geometry; });
            var fields = U.allFields(feats.map(function (o) { return o.f; }));
            if (!fields.length) { root.innerHTML = '<div style="color:#fca5a5">لا توجد حقول في البيانات الحالية.</div>'; return; }
            var def = fields.indexOf('name') !== -1 ? 'name' : fields[0];

            root.innerHTML =
                U.field('حقل التسمية', '<select data-f="field" style="' + U.selectStyle + '">' + U.options(fields.map(function (f) { return { value: f, label: f, sel: f === def }; })) + '</select>') +
                U.field('أشكال مشمولة', '<div style="display:flex;gap:12px;font-size:12.5px">' +
                    '<label><input data-f="tpoint" type="checkbox" checked> نقاط</label>' +
                    '<label><input data-f="tline" type="checkbox" checked> خطوط</label>' +
                    '<label><input data-f="tpoly" type="checkbox" checked> مضلعات</label></div>') +
                '<div style="display:flex;gap:8px;margin-top:4px">' +
                U.field('حجم', '<input data-f="size" type="number" value="11" min="8" max="28" style="' + U.inputStyle + '">') +
                U.field('اللون', '<input data-f="color" type="color" value="#fde047" style="' + U.inputStyle + ';padding:2px;height:36px">') +
                '</div>' +
                '<label style="display:flex;gap:8px;align-items:center;font-size:12.5px;margin-top:6px"><input data-f="halo" type="checkbox" checked> خلفية داكنة للتسمية</label>' +
                '<button type="button" data-act="run" style="' + U.btnStyle + '"><i class="fas fa-tags"></i> عرض التسميات</button>' +
                '<button type="button" data-act="clear" style="' + U.btnStyle + ';background:#475569"><i class="fas fa-eraser"></i> مسح التسميات</button>' +
                '<div data-f="out" style="margin-top:8px;font-size:12px;color:var(--txt-dim,#94a3b8)"></div>';

            var fieldSel = root.querySelector('[data-f="field"]');
            var sizeInp = root.querySelector('[data-f="size"]');
            var colorInp = root.querySelector('[data-f="color"]');
            var haloInp = root.querySelector('[data-f="halo"]');
            var out = root.querySelector('[data-f="out"]');
            var labels = window.L.layerGroup().addTo(ctx.map);

            function run() {
                var field = fieldSel.value;
                var size = Math.max(8, Math.min(28, parseInt(sizeInp.value, 10) || 11));
                var color = colorInp.value || '#fde047';
                var halo = haloInp.checked;
                var tPoint = root.querySelector('[data-f="tpoint"]').checked;
                var tLine = root.querySelector('[data-f="tline"]').checked;
                var tPoly = root.querySelector('[data-f="tpoly"]').checked;

                labels.clearLayers();
                var count = 0;
                feats.forEach(function (o) {
                    if (count >= 300) { return; }
                    var gt = U.geomType(o.f);
                    if ((gt === 'point' && !tPoint) || (gt === 'line' && !tLine) || (gt === 'polygon' && !tPoly) || gt === 'other') { return; }
                    var val = (o.f.properties || {})[field];
                    if (val == null || val === '') { return; }
                    var ctr = anchorOf(o.f);
                    if (!ctr) { return; }
                    var icon = window.L.divIcon({ className: 'gis-label', html: iconHtml(String(val), size, color, halo), iconSize: null, iconAnchor: [0, 0] });
                    labels.addLayer(window.L.marker(ctr, { icon: icon, interactive: false, pane: 'gisPointPane' }));
                    count++;
                });
                out.textContent = count ? ('تم عرض ' + count + ' تسمية.') : 'لا توجد قيم لعرضها في هذا الحقل.';
                ctx.notify(count ? ('تم عرض ' + count + ' تسمية') : 'لا توجد قيم لعرضها', count ? 'success' : 'warn');
            }

            root.querySelector('[data-act="run"]').addEventListener('click', run);
            root.querySelector('[data-act="clear"]').addEventListener('click', function () {
                labels.clearLayers();
                out.textContent = 'تم مسح التسميات.';
            });

            this._cleanup = function () { try { ctx.map.removeLayer(labels); } catch (e) {} };
        },

        destroy: function () { if (typeof this._cleanup === 'function') { try { this._cleanup(); } catch (e) {} } }
    });
})();
