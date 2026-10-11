/* ================================================================
   GIS Module 06 — البثق ثلاثي الأبعاد (3D Extrusion)
   عرض المضلعات مجسّمة بارتفاع من حقل رقمي عبر MapLibre GL.
   ================================================================ */
(function () {
    'use strict';
    if (!window.GIS) { return; }
    var U = window.GIS.util;

    function polys(scope) { return U.sourceFeatures(scope).filter(function (o) { return U.geomType(o.f) === 'polygon'; }); }

    window.GIS.registerModule({
        id: 'extrude',
        title: 'بثق ثلاثي الأبعاد',
        icon: 'fa-cube',
        group: 'التمثيل البصري',
        order: 130,
        description: 'تجسيم المضلعات كمجسّمات 3D بارتفاع من حقل رقمي',

        mount: function (root, ctx) {
            if (!window.maplibregl) { root.innerHTML = '<div style="color:#fca5a5">مكتبة MapLibre غير محمّلة.</div>'; return; }

            root.innerHTML =
                '<div data-f="scope" style="margin-bottom:8px"></div>' +
                '<div data-f="field" style="margin-bottom:8px"></div>' +
                '<label style="display:block;font-size:11.5px;color:var(--txt-dim,#94a3b8)">ارتفاع أساسي (م)</label>' +
                '<input data-f="base" type="number" value="5" style="' + U.inputStyle + '">' +
                '<label style="display:block;margin-top:8px;font-size:11.5px;color:var(--txt-dim,#94a3b8)">شفافية</label>' +
                '<input data-f="op" type="range" min="20" max="100" value="80" style="width:100%">' +
                '<button type="button" data-act="run" style="' + U.btnStyle + '"><i class="fas fa-cube"></i> عرض ثلاثي الأبعاد</button>';

            var scopeSel = U.el('select', { style: U.selectStyle }, U.options([
                { value: 'all', label: 'كل المضلعات', sel: true },
                { value: 'file', label: 'مضلعات الملف الحالي' },
                { value: 'custom', label: 'المضلعات المخصصة' }
            ]));
            var sw = root.querySelector('[data-f="scope"]'); sw.innerHTML = '<label style="font-size:11.5px;color:var(--txt-dim,#94a3b8);display:block;margin-bottom:4px;">المصدر</label>'; sw.appendChild(scopeSel);

            var fieldSel = U.el('select', { style: U.selectStyle });
            var fw = root.querySelector('[data-f="field"]'); fw.innerHTML = '<label style="font-size:11.5px;color:var(--txt-dim,#94a3b8);display:block;margin-bottom:4px;">حقل الارتفاع (رقمي)</label>'; fw.appendChild(fieldSel);

            function refreshFields() {
                var nums = U.numericFields(polys(scopeSel.value).map(function (o) { return o.f; }));
                fieldSel.innerHTML = '<option value="">ارتفاع ثابت</option>' + U.options(nums);
            }
            refreshFields();
            scopeSel.addEventListener('change', refreshFields);

            var overlay = null, mlmap = null;
            function close() {
                if (overlay && overlay.parentNode) { overlay.parentNode.removeChild(overlay); }
                if (mlmap) { try { mlmap.remove(); } catch (e) {} }
                overlay = null; mlmap = null;
            }

            function run() {
                var list = polys(scopeSel.value);
                if (!list.length) { ctx.notify('لا توجد مضلعات', 'warn'); return; }
                var field = fieldSel.value;
                var base = Number(root.querySelector('[data-f="base"]').value) || 5;
                var op = Number(root.querySelector('[data-f="op"]').value) / 100;

                var feats = list.map(function (o) {
                    var f = JSON.parse(JSON.stringify(o.f));
                    var h = field ? Number((f.properties || {})[field]) : 1;
                    if (!isFinite(h) || h <= 0) { h = 1; }
                    f.properties.__h = base + h;
                    return f;
                });
                var fc = { type: 'FeatureCollection', features: feats };
                var bounds = [Infinity, Infinity, -Infinity, -Infinity];
                feats.forEach(function (f) {
                    window.featureVertices(f).forEach(function (c) {
                        if (c[0] < bounds[0]) { bounds[0] = c[0]; } if (c[1] < bounds[1]) { bounds[1] = c[1]; }
                        if (c[0] > bounds[2]) { bounds[2] = c[0]; } if (c[1] > bounds[3]) { bounds[3] = c[1]; }
                    });
                });
                var center = [(bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2];

                overlay = document.createElement('div');
                overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#0b1220;';
                overlay.innerHTML = '<div id="gisExtrudeMap" style="position:absolute;inset:0"></div>' +
                    '<button id="gisExtrudeClose" style="position:absolute;top:14px;right:14px;z-index:5;padding:8px 14px;border:none;border-radius:8px;background:#ef4444;color:#fff;font-weight:700;cursor:pointer"><i class="fas fa-times"></i> إغلاق</button>' +
                    '<div style="position:absolute;bottom:14px;right:14px;z-index:5;background:rgba(15,23,42,.8);color:#fff;padding:6px 12px;border-radius:8px;font-size:12px">بثق: ' + ctx.escapeHtml(field || 'ثابت') + '</div>';
                document.body.appendChild(overlay);
                overlay.querySelector('#gisExtrudeClose').addEventListener('click', close);

                mlmap = new window.maplibregl.Map({
                    container: 'gisExtrudeMap',
                    style: {
                        version: 8,
                        sources: {
                            sat: { type: 'raster', tiles: ['https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}'], tileSize: 256, attribution: 'Google' }
                        },
                        layers: [{ id: 'bg', type: 'raster', source: 'sat' }]
                    },
                    center: center,
                    zoom: 15,
                    pitch: 55,
                    bearing: -20,
                    attributionControl: false
                });
                mlmap.addControl(new window.maplibregl.NavigationControl({ visualizePitch: true }), 'top-left');
                mlmap.on('load', function () {
                    mlmap.addSource('ext', { type: 'geojson', data: fc });
                    mlmap.addLayer({
                        id: 'extrude', type: 'fill-extrusion', source: 'ext',
                        paint: {
                            'fill-extrusion-color': ['interpolate', ['linear'], ['get', '__h'], 0, '#22d3ee', 100, '#f59e0b', 300, '#ef4444'],
                            'fill-extrusion-height': ['get', '__h'],
                            'fill-extrusion-base': base,
                            'fill-extrusion-opacity': op
                        }
                    });
                    try { mlmap.fitBounds([[bounds[0], bounds[1]], [bounds[2], bounds[3]]], { padding: 80, pitch: 55, duration: 0 }); } catch (e) {}
                });
                ctx.notify('تم فتح العرض ثلاثي الأبعاد', 'success');
            }

            root.querySelector('[data-act="run"]').addEventListener('click', run);
            this._cleanup = close;
        },

        destroy: function () { if (typeof this._cleanup === 'function') { try { this._cleanup(); } catch (e) {} } }
    });
})();
