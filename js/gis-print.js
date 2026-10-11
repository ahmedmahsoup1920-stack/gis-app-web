/* ================================================================
   GIS Module 08 — إخراج الطباعة / PDF (Print Layout)
   ينشئ إخراجًا متجهيًا للعرض الحالي مع عنوان ومفتاح ومقياس ثم يطبعه.
   ================================================================ */
(function () {
    'use strict';
    if (!window.GIS) { return; }
    var U = window.GIS.util;

    function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

    window.GIS.registerModule({
        id: 'print',
        title: 'تخطيط الطباعة (PDF)',
        icon: 'fa-print',
        group: 'إدارة المشروع',
        order: 140,
        description: 'تركيب لوحة طباعة (عنوان/مفتاح/مقياس/سهم شمال) وتصديرها PDF',

        mount: function (root, ctx) {
            root.innerHTML =
                '<label style="display:block;font-size:11.5px;color:var(--txt-dim,#94a3b8)">عنوان اللوحة</label>' +
                '<input data-f="title" type="text" value="خريطة" style="' + U.inputStyle + '">' +
                '<label style="display:flex;align-items:center;gap:8px;margin-top:8px;font-size:12.5px"><input data-f="legend" type="checkbox" checked> إظهار المفتاح والمقياس</label>' +
                '<button type="button" data-act="run" style="' + U.btnStyle + '"><i class="fas fa-print"></i> معاينة الطباعة</button>';

            function metersPerPixel(map) {
                var a = map.containerPointToLatLng([0, 0]), b = map.containerPointToLatLng([100, 0]);
                return map.distance(a, b) / 100;
            }

            function legendRows() {
                var rows = [];
                try { if (typeof activeMap !== 'undefined') { rows.push({ color: '#0e8f8a', label: 'الأساس: ' + activeMap }); } } catch (e) {}
                var pts = 0, lns = 0, pgs = 0;
                U.sourceFeatures('all').forEach(function (o) {
                    var g = U.geomType(o.f);
                    if (g === 'point') { pts++; } else if (g === 'line') { lns++; } else if (g === 'polygon') { pgs++; }
                });
                rows.push({ color: '#e63946', label: 'نقاط (' + pts + ')' });
                rows.push({ color: '#0e8f8a', label: 'خطوط (' + lns + ')' });
                rows.push({ color: '#1a5a8a', label: 'مضلعات (' + pgs + ')' });
                return rows;
            }

            function buildCanvas(showLegend) {
                var map = ctx.map, size = map.getSize(), dpr = 2;
                var W = size.x, H = size.y;
                var cv = document.createElement('canvas'); cv.width = W * dpr; cv.height = H * dpr;
                var cx = cv.getContext('2d'); cx.scale(dpr, dpr);

                cx.fillStyle = '#eef2f6'; cx.fillRect(0, 0, W, H);
                cx.strokeStyle = 'rgba(148,163,184,.30)'; cx.lineWidth = 1;
                for (var gx = 0; gx < W; gx += 50) { cx.beginPath(); cx.moveTo(gx, 0); cx.lineTo(gx, H); cx.stroke(); }
                for (var gy = 0; gy < H; gy += 50) { cx.beginPath(); cx.moveTo(0, gy); cx.lineTo(W, gy); cx.stroke(); }

                cx.textAlign = 'left'; cx.textBaseline = 'alphabetic';

                function pt(c) { return map.latLngToContainerPoint([c[1], c[0]]); }
                function circle(p, color, r) { cx.beginPath(); cx.arc(p.x, p.y, r, 0, Math.PI * 2); cx.fillStyle = color; cx.fill(); cx.strokeStyle = '#fff'; cx.lineWidth = 1.5; cx.stroke(); }
                function seg(ring, fill) {
                    cx.beginPath();
                    ring.forEach(function (c, i) { var p = pt(c); if (i === 0) { cx.moveTo(p.x, p.y); } else { cx.lineTo(p.x, p.y); } });
                    if (fill) { cx.closePath(); cx.fillStyle = 'rgba(14,143,138,.22)'; cx.fill(); }
                    cx.strokeStyle = '#0e8f8a'; cx.lineWidth = 2; cx.stroke();
                }

                U.sourceFeatures('all').forEach(function (o) {
                    var g = o.f.geometry;
                    if (!g) { return; }
                    if (g.type === 'Point') { circle(pt(g.coordinates), '#e63946', 5); }
                    else if (g.type === 'MultiPoint') { g.coordinates.forEach(function (c) { circle(pt(c), '#e63946', 4); }); }
                    else if (g.type === 'LineString') { seg(g.coordinates, false); }
                    else if (g.type === 'MultiLineString') { g.coordinates.forEach(function (r) { seg(r, false); }); }
                    else if (g.type === 'Polygon') { g.coordinates.forEach(function (r) { seg(r, true); }); }
                    else if (g.type === 'MultiPolygon') { g.coordinates.forEach(function (poly) { poly.forEach(function (r) { seg(r, true); }); }); }
                });

                if (showLegend) {
                    var mpp = metersPerPixel(map);
                    var scaleM = 500;
                    if (mpp * 90 < 300) { scaleM = 200; }
                    if (mpp * 120 > 1500) { scaleM = 1000; }
                    var barPx = Math.max(40, scaleM / mpp);

                    var rows = legendRows();
                    var boxH = 26 + rows.length * 18;
                    var boxW = 180, bx = 14, by = H - boxH - 34;
                    cx.fillStyle = 'rgba(255,255,255,.94)'; cx.strokeStyle = 'rgba(100,116,139,.5)'; cx.lineWidth = 1;
                    cx.beginPath(); if (cx.roundRect) { cx.roundRect(bx, by, boxW, boxH, 8); } else { cx.rect(bx, by, boxW, boxH); } cx.fill(); cx.stroke();
                    cx.fillStyle = '#0f172a'; cx.font = 'bold 12px sans-serif'; cx.textAlign = 'right';
                    cx.fillText('المفتاح', bx + boxW - 10, by + 16);
                    cx.textAlign = 'left'; cx.font = '11px sans-serif';
                    rows.forEach(function (r, i) {
                        var ry = by + 26 + i * 18;
                        cx.fillStyle = r.color; cx.fillRect(bx + 10, ry, 12, 12);
                        cx.fillStyle = '#0f172a'; cx.fillText(r.label, bx + 28, ry + 10);
                    });

                    var sby = H - 24;
                    cx.fillStyle = '#0f172a'; cx.fillRect(20, sby, barPx, 6);
                    cx.fillStyle = '#ffffff'; cx.fillRect(20, sby, barPx / 2, 6);
                    cx.strokeStyle = '#0f172a'; cx.strokeRect(20, sby, barPx, 6);
                    cx.fillStyle = '#0f172a'; cx.textAlign = 'left'; cx.font = '11px sans-serif';
                    cx.fillText(scaleM + ' م', 20, sby - 4);
                }

                cx.fillStyle = '#0f172a';
                cx.beginPath(); cx.moveTo(W - 30, 22); cx.lineTo(W - 24, 50); cx.lineTo(W - 30, 42); cx.lineTo(W - 36, 50); cx.closePath(); cx.fill();
                cx.font = 'bold 12px sans-serif'; cx.textAlign = 'center';
                cx.fillText('N', W - 30, 66);

                return cv;
            }

            function run() {
                var title = root.querySelector('[data-f="title"]').value || 'خريطة';
                var showLegend = root.querySelector('[data-f="legend"]').checked;
                var cv = buildCanvas(showLegend);
                var data = cv.toDataURL('image/png');
                var win = window.open('', '_blank');
                if (!win) {
                    var a = document.createElement('a'); a.href = data; a.download = 'layout.png'; a.click();
                    ctx.notify('تم تنزيل الصورة (النوافذ المنبثقة محجوبة)', 'warn'); return;
                }
                var today = new Date().toLocaleDateString('ar-EG');
                win.document.write('<html dir="rtl"><head><meta charset="utf-8"><title>' + esc(title) + '</title>' +
                    '<style>@page{size:A4 landscape;margin:12mm}body{margin:0;font-family:Tajawal,sans-serif;color:#0f172a}' +
                    'h2{text-align:center;margin:0 0 6px}.meta{display:flex;justify-content:space-between;font-size:12px;color:#475569;margin-bottom:6px}' +
                    'img{width:100%;border:1px solid #cbd5e1;border-radius:6px}</style></head><body>' +
                    '<h2>' + esc(title) + '</h2>' +
                    '<div class="meta"><span>التاريخ: ' + today + '</span><span>GIS App</span></div>' +
                    '<img src="' + data + '"></body></html>');
                win.document.close(); win.focus();
                setTimeout(function () { try { win.print(); } catch (e) {} }, 500);
                ctx.notify('تم تجهيز لوحة الطباعة', 'success');
            }

            root.querySelector('[data-act="run"]').addEventListener('click', run);
        }
    });
})();
