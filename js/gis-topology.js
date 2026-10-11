/* ================================================================
   GIS Module 13 — فحص التوبولوجي (Topology Checker)
   ================================================================ */
(function () {
    'use strict';
    if (!window.GIS) { return; }
    var U = window.GIS.util;

    function ccw(a, b, c) { return (c[1] - a[1]) * (b[0] - a[0]) > (b[1] - a[1]) * (c[0] - a[0]); }
    function segIntersect(p1, p2, p3, p4) { return (ccw(p1, p3, p4) !== ccw(p2, p3, p4)) && (ccw(p1, p2, p3) !== ccw(p1, p2, p4)); }

    function ringsOf(f) {
        var g = f && f.geometry, out = [];
        if (!g) { return out; }
        if (g.type === 'LineString') { out.push(g.coordinates); }
        else if (g.type === 'Polygon') { g.coordinates.forEach(function (r) { out.push(r); }); }
        else if (g.type === 'MultiLineString') { g.coordinates.forEach(function (r) { out.push(r); }); }
        else if (g.type === 'MultiPolygon') { g.coordinates.forEach(function (p) { p.forEach(function (r) { out.push(r); }); }); }
        return out;
    }
    function centroid(f) {
        var pts = window.featureVertices(f);
        if (!pts.length) { return null; }
        var sx = 0, sy = 0;
        pts.forEach(function (p) { sx += p[0]; sy += p[1]; });
        return [sx / pts.length, sy / pts.length];
    }
    function areaOrLen(f) {
        var a = window.featureAreaM2(f); if (a) { return a; }
        return window.featureLengthM(f);
    }

    window.GIS.registerModule({
        id: 'topology',
        title: 'فحص التوبولوجي',
        icon: 'fa-sitemap',
        group: 'الجودة والفحص',
        order: 70,
        description: 'كشف التكرار والرؤوس المكرّرة والتقاطع الذاتي والتراكب بين العناصر',

        mount: function (root, ctx) {
            root.innerHTML =
                '<div data-f="scope"></div>' +
                '<label style="display:block;margin-top:10px;font-size:11.5px;color:var(--txt-dim,#94a3b8)">تسامح الرؤوس المكرّرة (متر)</label>' +
                '<input data-f="vtol" type="number" value="0.5" min="0" step="any" style="' + U.inputStyle + '">' +
                '<label style="display:flex;align-items:center;gap:8px;margin-top:8px;font-size:12.5px"><input data-f="chk_overlap" type="checkbox" checked> فحص التراكب بين المضلعات</label>' +
                '<button type="button" data-act="run" style="' + U.btnStyle + '"><i class="fas fa-magnifying-glass-chart"></i> بدء الفحص</button>' +
                '<div data-f="out" style="margin-top:12px"></div>';

            var scopeSel = U.el('select', { style: U.selectStyle }, U.options([
                { value: 'all', label: 'كل العناصر', sel: true },
                { value: 'file', label: 'الملف الحالي' },
                { value: 'custom', label: 'العناصر المخصصة' }
            ]));
            var sw = root.querySelector('[data-f="scope"]');
            sw.innerHTML = '<label style="font-size:11.5px;color:var(--txt-dim,#94a3b8);display:block;margin-bottom:4px;">نطاق الفحص</label>';
            sw.appendChild(scopeSel);

            var out = root.querySelector('[data-f="out"]');
            var issueLayer = ctx.L.featureGroup().addTo(ctx.map);
            var vtolInput = root.querySelector('[data-f="vtol"]');

            function run() {
                var feats = U.sourceFeatures(scopeSel.value);
                if (!feats.length) { ctx.notify('لا توجد عناصر للفحص', 'warn'); return; }
                var vtol = Math.max(0, parseFloat(vtolInput.value) || 0.5);
                var issues = { dupFeat: [], dupVert: [], selfInt: [], overlap: [], lineCross: [] };
                issueLayer.clearLayers();

                function markPoint(lat, lng, color) {
                    ctx.L.circleMarker([lat, lng], { radius: 7, color: color, weight: 2, fillColor: color, fillOpacity: 0.35, pane: 'gisPointPane' }).addTo(issueLayer);
                }

                /* 1) عناصر مكرّرة */
                var seen = Object.create(null);
                feats.forEach(function (o) {
                    var c = centroid(o.f); if (!c) { return; }
                    var key = Math.round(c[0] * 1e6) + ':' + Math.round(c[1] * 1e6) + ':' + Math.round(areaOrLen(o.f) * 100) + ':' + U.geomType(o.f);
                    if (!seen[key]) { seen[key] = []; }
                    seen[key].push(o);
                });
                Object.keys(seen).forEach(function (k) {
                    if (seen[k].length > 1) {
                        seen[k].forEach(function (o) { issues.dupFeat.push(o); var c = centroid(o.f); if (c) { markPoint(c[1], c[0], '#ef4444'); } });
                        issues.dupFeat.push({ _group: seen[k].length });
                    }
                });

                /* 2) رؤوس مكرّرة داخل العنصر */
                feats.forEach(function (o) {
                    var pts = window.featureVertices(o.f);
                    for (var i = 0; i < pts.length; i++) {
                        for (var j = i + 1; j < pts.length; j++) {
                            var d = ctx.map.distance([pts[i][1], pts[i][0]], [pts[j][1], pts[j][0]]);
                            if (d <= vtol) { issues.dupVert.push(o); markPoint(pts[i][1], pts[i][0], '#f59e0b'); break; }
                        }
                    }
                });

                /* 3) تقاطع ذاتي */
                feats.forEach(function (o) {
                    var rings = ringsOf(o.f);
                    var hit = false;
                    rings.forEach(function (ring) {
                        for (var i = 0; i < ring.length - 1 && !hit; i++) {
                            for (var j = i + 2; j < ring.length - 1; j++) {
                                if (i === j) { continue; }
                                if (segIntersect(ring[i], ring[i + 1], ring[j], ring[j + 1])) { hit = true; issues.selfInt.push(o); markPoint(ring[i][1], ring[i][0], '#a855f7'); break; }
                            }
                        }
                    });
                });

                /* 4) تراكب مضلعات + 5) تقاطع خطوط */
                var polys = feats.filter(function (o) { return U.geomType(o.f) === 'polygon'; });
                var lines = feats.filter(function (o) { return U.geomType(o.f) === 'line'; });
                var doOverlap = root.querySelector('[data-f="chk_overlap"]').checked && window.turf;

                if (doOverlap) {
                    for (var a = 0; a < polys.length; a++) {
                        for (var b = a + 1; b < polys.length; b++) {
                            try {
                                var inter = window.turf.intersect(polys[a].f, polys[b].f);
                                if (inter) {
                                    var ar = window.turf.area(inter);
                                    if (ar > 1) {
                                        issues.overlap.push({ a: polys[a].name, b: polys[b].name, area: ar });
                                        var c = centroid(inter);
                                        if (c) { markPoint(c[1], c[0], '#22c55e'); }
                                    }
                                }
                            } catch (e) {}
                        }
                    }
                }

                if (window.turf && typeof window.turf.lineIntersect === 'function') {
                    for (var m = 0; m < lines.length; m++) {
                        for (var n = m + 1; n < lines.length; n++) {
                            try {
                                var pts = window.turf.lineIntersect(lines[m].f, lines[n].f);
                                if (pts && pts.features && pts.features.length) {
                                    issues.lineCross.push({ a: lines[m].name, b: lines[n].name, n: pts.features.length });
                                    var p0 = pts.features[0].geometry.coordinates;
                                    markPoint(p0[1], p0[0], '#f97316');
                                }
                            } catch (e) {}
                        }
                    }
                }

                var total = issues.dupFeat.filter(function (x) { return !x._group; }).length + issues.dupVert.length + issues.selfInt.length + issues.overlap.length + issues.lineCross.length;

                function section(title, color, count, rows) {
                    return '<div style="margin-bottom:8px"><div style="font-weight:800;color:' + color + '"><i class="fas fa-circle"></i> ' + title + ' <span class="gis-mod-badge">' + count + '</span></div>' +
                        (rows.length ? '<div style="max-height:130px;overflow:auto;margin-top:4px;font-size:12px">' + rows.join('') + '</div>' : '') + '</div>';
                }

                var dupFeatRows = [];
                Object.keys(seen).forEach(function (k) {
                    if (seen[k].length > 1) { dupFeatRows.push('<div style="padding:4px 8px">مجموعة من ' + seen[k].length + ' عنصر متطابق (' + seen[k][0].name + ')</div>'); }
                });
                var dupVertRows = issues.dupVert.slice(0, 50).map(function (o) { return '<div style="padding:4px 8px">' + ctx.escapeHtml(o.name || 'عنصر') + '</div>'; });
                var selfRows = issues.selfInt.slice(0, 50).map(function (o) { return '<div style="padding:4px 8px">' + ctx.escapeHtml(o.name || 'عنصر') + '</div>'; });
                var ovRows = issues.overlap.slice(0, 50).map(function (x, i) { return '<div style="padding:4px 8px" data-zoom="ov' + i + '">' + ctx.escapeHtml(x.a) + ' ↔ ' + ctx.escapeHtml(x.b) + ' — ' + U.fmtArea(x.area) + '</div>'; });
                var lxRows = issues.lineCross.slice(0, 50).map(function (x, i) { return '<div style="padding:4px 8px">' + ctx.escapeHtml(x.a) + ' × ' + ctx.escapeHtml(x.b) + ' — ' + x.n + ' تقاطع</div>'; });

                out.innerHTML =
                    '<div style="background:var(--card-bg,#1e293b);border:1px solid var(--card-brd,#334155);border-radius:10px;padding:10px">' +
                    '<div style="font-weight:800;margin-bottom:8px">النتيجة: <b style="color:' + (total ? '#f97316' : '#22c55e') + '">' + total + ' مشكلة</b> — فُحص ' + feats.length + ' عنصر</div>' +
                    section('عناصر مكرّرة', '#ef4444', issues.dupFeat.filter(function (x) { return !x._group; }).length, dupFeatRows) +
                    section('رؤوس مكرّرة', '#f59e0b', issues.dupVert.length, dupVertRows) +
                    section('تقاطع ذاتي', '#a855f7', issues.selfInt.length, selfRows) +
                    section('تراكب مضلعات', '#22c55e', issues.overlap.length, ovRows) +
                    section('تقاطع خطوط', '#f97316', issues.lineCross.length, lxRows) +
                    '<button type="button" data-act="clear" style="' + U.btn2Style + ';width:100%;margin-top:6px"><i class="fas fa-eye-slash"></i> إزالة الإبراز</button>' +
                    '</div>';

                out.querySelector('[data-act="clear"]').addEventListener('click', function () { issueLayer.clearLayers(); });
                ctx.notify('انتهى الفحص: ' + total + ' مشكلة', total ? 'warn' : 'success');
            }

            root.querySelector('[data-act="run"]').addEventListener('click', run);
            this._cleanup = function () { issueLayer.clearLayers(); if (ctx.map.hasLayer(issueLayer)) { ctx.map.removeLayer(issueLayer); } };
        },

        destroy: function () { if (typeof this._cleanup === 'function') { try { this._cleanup(); } catch (e) {} } }
    });
})();
