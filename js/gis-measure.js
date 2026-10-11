/* ================================================================
   GIS Module 16 — ترقية القياس والإحداثيات (Measure & Coordinate)
   ================================================================ */
(function () {
    'use strict';
    if (!window.GIS) { return; }
    var U = window.GIS.util;

    function toDMS(value, isLat) {
        var hemi = isLat ? (value >= 0 ? 'N' : 'S') : (value >= 0 ? 'E' : 'W');
        var v = Math.abs(value);
        var d = Math.floor(v);
        var mFloat = (v - d) * 60;
        var m = Math.floor(mFloat);
        var s = ((mFloat - m) * 60).toFixed(1);
        return d + '° ' + m + "' " + s + '" ' + hemi;
    }

    window.GIS.registerModule({
        id: 'measure',
        title: 'القياس والإحداثيات',
        icon: 'fa-ruler-combined',
        group: 'القياس والتحليل',
        order: 80,
        description: 'مفتاح إحداثيات حيّ (عشري/DMS/UTM) وإجماليات القياس التراكمية',

        mount: function (root, ctx) {
            root.innerHTML =
                '<div style="font-weight:800;margin-bottom:6px"><i class="fas fa-crosshairs"></i> مفتاح الإحداثيات</div>' +
                '<label style="display:flex;align-items:center;gap:8px;font-size:12.5px;margin-bottom:6px"><input data-f="insp" type="checkbox"> تشغيل المفتاح (يتبع حركة الفأرة)</label>' +
                '<label style="display:flex;align-items:center;gap:8px;font-size:12.5px;margin-bottom:6px"><input data-f="copyOn" type="checkbox"> نسخ الإحداثيات عند النقر</label>' +
                '<div data-f="coord" style="background:var(--card-bg,#1e293b);border:1px solid var(--card-brd,#334155);border-radius:10px;padding:10px;font-size:12.5px;line-height:1.9;direction:ltr;text-align:left"><span style="color:var(--txt-dim,#94a3b8)">حرّك الفأرة فوق الخريطة…</span></div>' +
                '<hr style="border:none;border-top:1px solid var(--card-brd,#334155);margin:14px 0">' +
                '<div style="font-weight:800;margin-bottom:6px"><i class="fas fa-ruler-combined"></i> القياس التراكمي</div>' +
                '<div style="display:flex;gap:8px">' +
                  '<button type="button" data-act="dist" style="' + U.btn2Style + ';flex:1"><i class="fas fa-ruler"></i> مسافة</button>' +
                  '<button type="button" data-act="area" style="' + U.btn2Style + ';flex:1"><i class="fas fa-vector-square"></i> مساحة</button>' +
                '</div>' +
                '<div data-f="tot" style="margin-top:10px"></div>' +
                '<div style="display:flex;gap:8px;margin-top:8px">' +
                  '<button type="button" data-act="refresh" style="' + U.btn2Style + ';flex:1"><i class="fas fa-rotate"></i> تحديث</button>' +
                  '<button type="button" data-act="clear" style="' + U.btn2Style + ';flex:1;border-color:#ef4444;color:#fca5a5"><i class="fas fa-trash"></i> مسح</button>' +
                '</div>';

            var coordBox = root.querySelector('[data-f="coord"]');
            var totBox = root.querySelector('[data-f="tot"]');
            var insp = root.querySelector('[data-f="insp"]');
            var copyOn = root.querySelector('[data-f="copyOn"]');
            var lastCoord = null;

            function renderCoord(lat, lng) {
                lastCoord = [lat, lng];
                var utm = window.wgs84ToUTM(lat, lng);
                coordBox.innerHTML =
                    '<div>Lat: <b>' + lat.toFixed(6) + '</b></div>' +
                    '<div>Lng: <b>' + lng.toFixed(6) + '</b></div>' +
                    '<div>' + toDMS(lat, true) + '</div>' +
                    '<div>' + toDMS(lng, false) + '</div>' +
                    (utm ? '<div>UTM ' + utm.zone + utm.hemisphere + ': <b>' + utm.easting.toFixed(1) + ' / ' + utm.northing.toFixed(1) + '</b></div>' : '');
            }

            function onMove(e) { renderCoord(e.latlng.lat, e.latlng.lng); }
            function onClick(e) {
                if (!copyOn.checked || !lastCoord) { return; }
                var txt = lastCoord[0].toFixed(6) + ', ' + lastCoord[1].toFixed(6);
                try {
                    navigator.clipboard.writeText(txt).then(function () { ctx.notify('تم نسخ: ' + txt, 'success'); }, function () { ctx.notify('النسخ غير مدعوم', 'warn'); });
                } catch (err) { ctx.notify('النسخ غير مدعوم', 'warn'); }
            }

            insp.addEventListener('change', function () {
                if (this.checked) { ctx.map.on('mousemove', onMove); }
                else { ctx.map.off('mousemove', onMove); }
            });
            ctx.map.on('click', onClick);

            function totals() {
                var list = (typeof measurements !== 'undefined' ? measurements : []);
                var sumDist = 0, sumArea = 0;
                var rows = list.map(function (m) {
                    var val = '';
                    try {
                        if (m.type === 'distance') { var d = window.computeLineDistance(m.layer.getLatLngs()); sumDist += d; val = window.formatDistance(d); }
                        else { var a = window.computePolygonArea(m.layer.getLatLngs()); sumArea += a; val = window.formatArea(a); }
                    } catch (e) { val = m.label || ''; }
                    return '<div style="display:flex;justify-content:space-between;padding:4px 8px;border-bottom:1px solid rgba(148,163,184,.15)">' +
                        '<span>' + (m.type === 'distance' ? '📏 مسافة' : '⬛ مساحة') + '</span><b>' + ctx.escapeHtml(val) + '</b></div>';
                }).join('');
                totBox.innerHTML =
                    '<div style="background:var(--card-bg,#1e293b);border:1px solid var(--card-brd,#334155);border-radius:10px;padding:10px">' +
                    '<div style="display:flex;justify-content:space-between;font-size:13px"><span>إجمالي المسافات</span><b style="color:#22c55e">' + window.formatDistance(sumDist) + '</b></div>' +
                    '<div style="display:flex;justify-content:space-between;font-size:13px"><span>إجمالي المساحات</span><b style="color:#22d3ee">' + window.formatArea(sumArea) + '</b></div>' +
                    (rows ? '<div style="margin-top:8px;max-height:150px;overflow:auto">' + rows + '</div>' : '<div style="color:var(--txt-dim,#94a3b8);font-size:11.5px;margin-top:6px">لا توجد قياسات بعد.</div>') +
                    '</div>';
            }

            root.querySelector('[data-act="dist"]').addEventListener('click', function () { if (typeof startMeasuring === 'function') { startMeasuring('distance'); ctx.notify('انقر على الخريطة لرسم مسافة ثم انقر نقرًا مزدوجًا للإنهاء', 'info'); } });
            root.querySelector('[data-act="area"]').addEventListener('click', function () { if (typeof startMeasuring === 'function') { startMeasuring('area'); ctx.notify('انقر على الخريطة لرسم مساحة ثم انقر نقرًا مزدوجًا للإنهاء', 'info'); } });
            root.querySelector('[data-act="refresh"]').addEventListener('click', totals);
            root.querySelector('[data-act="clear"]').addEventListener('click', function () {
                try { if (typeof measureItems !== 'undefined' && measureItems) { measureItems.clearLayers(); } } catch (e) {}
                try { if (typeof measurements !== 'undefined') { measurements = []; } } catch (e) {}
                try { if (typeof renderMeasureList === 'function') { renderMeasureList(); } } catch (e) {}
                totals();
                ctx.notify('تم مسح القياسات', 'info');
            });

            var poll = setInterval(totals, 2500);
            totals();

            this._cleanup = function () {
                ctx.map.off('mousemove', onMove);
                ctx.map.off('click', onClick);
                clearInterval(poll);
            };
        },

        destroy: function () { if (typeof this._cleanup === 'function') { try { this._cleanup(); } catch (e) {} } }
    });
})();
