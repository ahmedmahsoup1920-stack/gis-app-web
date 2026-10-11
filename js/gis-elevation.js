/* ================================================================
   GIS Module 04 — مقطع الارتفاع (Elevation Profile)
   يستخدم بلاطات DEM (Terrarium) لقراءة الارتفاعات على طول خط.
   ================================================================ */
(function () {
    'use strict';
    if (!window.GIS) { return; }
    var U = window.GIS.util;

    var TILE_URL = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
    var Z = 12;

    function lineCoords(f) {
        var g = f && f.geometry;
        if (!g) { return null; }
        if (g.type === 'LineString') { return g.coordinates; }
        if (g.type === 'MultiLineString') { return g.coordinates[0]; }
        if (g.type === 'Polygon') { return g.coordinates[0]; }
        if (g.type === 'MultiPolygon') { return g.coordinates[0][0]; }
        return null;
    }
    function approxDist(a, b) {
        var R = 6378137, dLat = (b[1] - a[1]) * Math.PI / 180, dLng = (b[0] - a[0]) * Math.PI / 180;
        var lat = (a[1] + b[1]) / 2 * Math.PI / 180;
        var x = dLng * Math.cos(lat), y = dLat;
        return Math.sqrt(x * x + y * y) * R;
    }
    function sampleAlong(coords, n) {
        var segs = [], total = 0, i;
        for (i = 0; i < coords.length - 1; i++) { var d = approxDist(coords[i], coords[i + 1]); segs.push(d); total += d; }
        if (!total) { return [{ p: coords[0], d: 0 }]; }
        var out = [], step = total / (n - 1), si = 0, cum = 0;
        for (var k = 0; k < n; k++) {
            var target = k * step;
            while (si < segs.length - 1 && cum + segs[si] < target) { cum += segs[si]; si++; }
            var t = (target - cum) / (segs[si] || 1);
            var a = coords[si], b = coords[si + 1] || coords[si];
            out.push({ p: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], d: target });
        }
        return out;
    }
    function lon2x(lon, z) { return (lon + 180) / 360 * Math.pow(2, z); }
    function lat2y(lat, z) { var r = lat * Math.PI / 180; return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * Math.pow(2, z); }

    function loadTile(z, x, y) {
        return new Promise(function (resolve) {
            var img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = function () {
                try {
                    var cv = document.createElement('canvas'); cv.width = 256; cv.height = 256;
                    var cx = cv.getContext('2d'); cx.drawImage(img, 0, 0);
                    resolve(cx.getImageData(0, 0, 256, 256));
                } catch (e) { resolve(null); }
            };
            img.onerror = function () { resolve(null); };
            img.src = TILE_URL.replace('{z}', z).replace('{x}', x).replace('{y}', y);
        });
    }

    window.GIS.registerModule({
        id: 'elevation',
        title: 'مقطع الارتفاع',
        icon: 'fa-mountain-sun',
        group: 'التحليل المكاني',
        order: 120,
        description: 'رسم مقطع ارتفاعي لخط/مضلع باستخدام بيانات DEM',

        mount: function (root, ctx) {
            root.innerHTML =
                '<div data-f="line" style="margin-bottom:8px"></div>' +
                '<label style="display:block;font-size:11.5px;color:var(--txt-dim,#94a3b8)">عدد نقاط القياس</label>' +
                '<input data-f="n" type="number" value="80" min="10" max="400" style="' + U.inputStyle + '">' +
                '<button type="button" data-act="run" style="' + U.btnStyle + '"><i class="fas fa-chart-area"></i> رسم المقطع</button>' +
                '<div data-f="out" style="margin-top:12px"></div>';

            var lineSel = U.el('select', { style: U.selectStyle });
            var lw = root.querySelector('[data-f="line"]');
            lw.innerHTML = '<label style="font-size:11.5px;color:var(--txt-dim,#94a3b8);display:block;margin-bottom:4px;">العنصر الخطي</label>';
            lw.appendChild(lineSel);
            var out = root.querySelector('[data-f="out"]');

            function fillLines() {
                var list = U.sourceFeatures('all').filter(function (o) { return U.geomType(o.f) === 'line' || U.geomType(o.f) === 'polygon'; });
                lineSel.innerHTML = list.map(function (o, i) { return '<option value="' + i + '">' + ctx.escapeHtml((o.name || 'عنصر') + ' [' + U.geomType(o.f) + ']') + '</option>'; }).join('') || '<option value="">— لا عناصر —</option>';
                lineSel._list = list;
            }
            fillLines();

            function run() {
                var list = lineSel._list || [];
                var item = list[Number(lineSel.value)];
                if (!item) { ctx.notify('اختر عنصرًا أولاً', 'warn'); return; }
                var coords = lineCoords(item.f);
                if (!coords || coords.length < 2) { ctx.notify('العنصر لا يحتوي على خط صالح', 'warn'); return; }
                var n = Math.max(10, Math.min(400, parseInt(root.querySelector('[data-f="n"]').value, 10) || 80));
                var samples = sampleAlong(coords, n);
                out.innerHTML = '<div style="color:var(--txt-dim,#94a3b8)">جارٍ قراءة الارتفاعات…</div>';

                var needed = Object.create(null);
                samples.forEach(function (s) {
                    var tx = Math.floor(lon2x(s.p[0], Z)), ty = Math.floor(lat2y(s.p[1], Z));
                    needed[tx + '_' + ty] = true;
                });
                var tileMap = Object.create(null);
                Promise.all(Object.keys(needed).map(function (key) {
                    var parts = key.split('_');
                    return loadTile(Z, Number(parts[0]), Number(parts[1])).then(function (im) { if (im) { tileMap[key] = im; } });
                })).then(function () {
                    var elevs = samples.map(function (s) {
                        var x = lon2x(s.p[0], Z), y = lat2y(s.p[1], Z);
                        var tx = Math.floor(x), ty = Math.floor(y);
                        var im = tileMap[tx + '_' + ty];
                        if (!im) { return null; }
                        var px = Math.floor((x - tx) * 256), py = Math.floor((y - ty) * 256);
                        var idx = (py * 256 + px) * 4, d = im.data;
                        return (d[idx] * 256 + d[idx + 1] + d[idx + 2] / 256) - 32768;
                    });
                    render(samples, elevs);
                });
            }

            function render(samples, elevs) {
                var valid = elevs.filter(function (e) { return e != null && isFinite(e); });
                if (!valid.length) {
                    out.innerHTML = '<div style="color:#fca5a5">تعذّر قراءة بيانات الارتفاع (قد تكون بلاطات DEM محجوبة).</div>';
                    ctx.notify('تعذّر جلب بيانات الارتفاع', 'error');
                    return;
                }
                var min = Math.min.apply(null, valid), max = Math.max.apply(null, valid);
                var sum = 0, gain = 0, loss = 0;
                for (var i = 0; i < elevs.length; i++) {
                    if (elevs[i] == null) { continue; }
                    sum += elevs[i];
                    if (i > 0 && elevs[i - 1] != null) { var dd = elevs[i] - elevs[i - 1]; if (dd > 0) { gain += dd; } else { loss -= dd; } }
                }
                var avg = sum / valid.length;
                var totalDist = samples[samples.length - 1].d;
                var W = 360, H = 130, pad = 6, span = (max - min) || 1;
                var pts = samples.map(function (s, i) {
                    var x = pad + (s.d / (totalDist || 1)) * (W - 2 * pad);
                    var y = H - pad - (((elevs[i] == null ? min : elevs[i]) - min) / span) * (H - 2 * pad);
                    return x.toFixed(1) + ',' + y.toFixed(1);
                }).join(' ');
                var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;height:150px;background:rgba(2,132,199,.08);border-radius:8px">' +
                    '<polyline points="' + pts + '" fill="none" stroke="#22d3ee" stroke-width="1.6"/></svg>';
                out.innerHTML =
                    '<div style="background:var(--card-bg,#1e293b);border:1px solid var(--card-brd,#334155);border-radius:10px;padding:10px">' +
                    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:12px;margin-bottom:8px">' +
                    kv('أعلى', max.toFixed(0) + ' م') + kv('أدنى', min.toFixed(0) + ' م') +
                    kv('متوسط', avg.toFixed(0) + ' م') + kv('الطول', window.formatDistance(totalDist)) +
                    kv('صعود', gain.toFixed(0) + ' م') + kv('هبوط', loss.toFixed(0) + ' م') +
                    '</div>' + svg +
                    '<div style="font-size:11px;color:var(--txt-dim,#94a3b8);margin-top:4px">DEM: Terrarium z' + Z + '</div></div>';
                ctx.notify('تم رسم المقطع الارتفاعي', 'success');
            }
            function kv(k, v) { return '<div style="display:flex;justify-content:space-between;background:rgba(148,163,184,.1);border-radius:6px;padding:4px 8px"><span>' + k + '</span><b>' + v + '</b></div>'; }

            root.querySelector('[data-act="run"]').addEventListener('click', run);
        }
    });
})();
