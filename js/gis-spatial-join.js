/* ================================================================
   GIS Module 15 — الربط المكاني (Spatial Join)
   إحصاء النقاط داخل كل مضلع (Point-in-Polygon)
   ================================================================ */
(function () {
    'use strict';
    if (!window.GIS) { return; }
    var U = window.GIS.util;

    function filePolygons() {
        var out = [];
        var cd = window.currentData;
        var gl = window.geoLayer;
        if (cd && Array.isArray(cd.features)) {
            cd.features.forEach(function (f) {
                if (U.geomType(f) !== 'polygon') { return; }
                var layer = null;
                if (gl && gl.eachLayer) { gl.eachLayer(function (l) { if (l.feature === f) { layer = l; } }); }
                out.push({ f: f, layer: layer, name: (f.properties && f.properties.name) || 'مضلع', origin: 'file' });
            });
        }
        return out;
    }
    function customPolygons() {
        return (window.customFeaturesData || []).filter(function (cf) { return cf.geojson && U.geomType(cf.geojson) === 'polygon'; })
            .map(function (cf) { return { f: cf.geojson, layer: cf.layer, name: cf.name || 'مضلع', origin: 'custom' }; });
    }
    function polygons(scope) {
        var out = [];
        if (scope === 'file' || scope === 'all') { out = out.concat(filePolygons()); }
        if (scope === 'custom' || scope === 'all') { out = out.concat(customPolygons()); }
        return out;
    }
    function points(scope) {
        return U.sourceFeatures(scope).filter(function (o) { return U.geomType(o.f) === 'point'; });
    }

    function ringsOf(f) {
        var g = f && f.geometry, out = [];
        if (!g) { return out; }
        if (g.type === 'Polygon') { g.coordinates.forEach(function (r) { out.push(r.map(function (c) { return [c[0], c[1]]; })); }); }
        else if (g.type === 'MultiPolygon') { g.coordinates.forEach(function (poly) { poly.forEach(function (r) { out.push(r.map(function (c) { return [c[0], c[1]]; })); }); }); }
        return out;
    }
    function insidePoly(polyRings, pt) {
        for (var i = 0; i < polyRings.length; i++) { if (window.pointInPolygon(pt, polyRings[i])) { return true; } }
        return false;
    }
    function ramp(t) {
        t = Math.max(0, Math.min(1, t));
        var c1 = [37, 99, 235], c2 = [239, 68, 68];
        return 'rgb(' + Math.round(c1[0] + (c2[0] - c1[0]) * t) + ',' + Math.round(c1[1] + (c2[1] - c1[1]) * t) + ',' + Math.round(c1[2] + (c2[2] - c1[2]) * t) + ')';
    }

    window.GIS.registerModule({
        id: 'spatial-join',
        title: 'الربط المكاني',
        icon: 'fa-diagram-project',
        group: 'التحليل المكاني',
        order: 40,
        description: 'إحصاء النقاط داخل المضلعات وكتابة النتائج كحقول',

        mount: function (root, ctx) {
            root.innerHTML =
                '<div data-f="poly" style="margin-bottom:8px"></div>' +
                '<div data-f="pt" style="margin-bottom:8px"></div>' +
                '<button type="button" data-act="run" style="' + U.btnStyle + '"><i class="fas fa-calculator"></i> تنفيذ الربط المكاني</button>' +
                '<div data-f="out" style="margin-top:12px"></div>';

            var polyScope = U.el('select', { style: U.selectStyle }, U.options([
                { value: 'file', label: 'مضلعات الملف الحالي', sel: true },
                { value: 'custom', label: 'المضلعات المخصصة' },
                { value: 'all', label: 'كل المضلعات' }
            ]));
            var pw = root.querySelector('[data-f="poly"]');
            pw.innerHTML = '<label style="font-size:11.5px;color:var(--txt-dim,#94a3b8);display:block;margin-bottom:4px;">طبقة المضلعات (الهدف)</label>';
            pw.appendChild(polyScope);

            var ptScope = U.el('select', { style: U.selectStyle }, U.options([
                { value: 'all', label: 'كل النقاط', sel: true },
                { value: 'file', label: 'نقاط الملف الحالي' },
                { value: 'custom', label: 'النقاط المخصصة' },
                { value: 'locations', label: 'المواقع المحفوظة' }
            ]));
            var tw = root.querySelector('[data-f="pt"]');
            tw.innerHTML = '<label style="font-size:11.5px;color:var(--txt-dim,#94a3b8);display:block;margin-bottom:4px;">طبقة النقاط (المصدر)</label>';
            tw.appendChild(ptScope);

            var out = root.querySelector('[data-f="out"]');
            var hl = null;

            function clearHl() { if (hl) { try { ctx.map.removeLayer(hl); } catch (e) {} hl = null; } }

            function run() {
                var polys = polygons(polyScope.value);
                if (!polys.length) { ctx.notify('لا توجد مضلعات في الطبقة المحدّدة', 'warn'); return; }
                var pts = points(ptScope.value);
                if (!pts.length) { ctx.notify('لا توجد نقاط في المصدر المحدّد', 'warn'); return; }

                var results = [];
                var max = 0;
                polys.forEach(function (p) {
                    var pr = ringsOf(p.f);
                    var cnt = 0;
                    pts.forEach(function (o) {
                        var c = o.f.geometry.coordinates;
                        if (insidePoly(pr, [c[0], c[1]])) { cnt++; }
                    });
                    if (cnt > max) { max = cnt; }
                    results.push({ p: p, count: cnt });
                });
                results.sort(function (a, b) { return b.count - a.count; });

                clearHl();
                var fc = { type: 'FeatureCollection', features: results.filter(function (r) { return r.count > 0; }).map(function (r) { return r.p.f; }) };
                hl = ctx.L.geoJSON(fc, {
                    style: function (feat) {
                        var r = results.find(function (x) { return x.p.f === feat; });
                        var col = r && r.count > 0 ? ramp(r.count / (max || 1)) : '#64748b';
                        return { color: col, weight: 2.5, opacity: 1, fillColor: col, fillOpacity: 0.35 };
                    }
                }).addTo(ctx.map);

                var rows = results.map(function (r, i) {
                    return '<tr style="border-bottom:1px solid rgba(148,163,184,.15)">' +
                        '<td style="padding:5px 7px">' + (i + 1) + '</td>' +
                        '<td style="padding:5px 7px">' + ctx.escapeHtml(r.p.name) + '</td>' +
                        '<td style="padding:5px 7px;font-weight:800;color:' + (r.count ? '#f97316' : '#94a3b8') + '">' + r.count + '</td></tr>';
                }).join('');

                var totalHit = results.reduce(function (s, r) { return s + r.count; }, 0);
                out.innerHTML =
                    '<div style="background:var(--card-bg,#1e293b);border:1px solid var(--card-brd,#334155);border-radius:10px;padding:10px;">' +
                    '<div style="font-weight:800;margin-bottom:6px"><i class="fas fa-diagram-project" style="color:#22d3ee"></i> نتائج الربط</div>' +
                    '<div style="font-size:12px;margin-bottom:6px">مضلعات: <b>' + polys.length + '</b> — نقاط: <b>' + pts.length + '</b> — إجمالي داخل: <b>' + totalHit + '</b></div>' +
                    '<div style="max-height:230px;overflow:auto;border:1px solid var(--card-brd,#334155);border-radius:8px">' +
                      '<table style="width:100%;border-collapse:collapse;font-size:12px"><thead><tr style="background:rgba(2,132,199,.15)"><th style="padding:6px 7px;text-align:right">#</th><th style="padding:6px 7px;text-align:right">المضلع</th><th style="padding:6px 7px;text-align:right">العدد</th></tr></thead><tbody>' + rows + '</tbody></table>' +
                    '</div>' +
                    '<div style="display:flex;gap:8px;margin-top:10px">' +
                      '<button type="button" data-act="write" style="' + U.btn2Style + ';flex:1"><i class="fas fa-pen"></i> كتابة العدد كحقل</button>' +
                      '<button type="button" data-act="clear" style="' + U.btn2Style + ';flex:1"><i class="fas fa-eye-slash"></i> إزالة الإبراز</button>' +
                    '</div></div>';

                out.querySelector('[data-act="clear"]').addEventListener('click', function () {
                    clearHl();
                    out.innerHTML = '<div style="color:var(--txt-dim,#94a3b8);font-size:12px">تم إزالة الإبراز.</div>';
                });
                out.querySelector('[data-act="write"]').addEventListener('click', function () {
                    var n = 0;
                    results.forEach(function (r) {
                        if (r.p.origin !== 'file') { return; }
                        r.p.f.properties = r.p.f.properties || {};
                        r.p.f.properties.point_count = r.count;
                        n++;
                    });
                    try { updateTOC(); } catch (e) {}
                    try { if (typeof renderAttrTable === 'function') renderAttrTable(); } catch (e) {}
                    ctx.notify('تمت كتابة العدد في ' + n + ' مضلع (حقل point_count)', 'success');
                });

                if (hl) { try { var b = hl.getBounds(); if (b && b.isValid()) ctx.map.fitBounds(b, { padding: [40, 40], maxZoom: 17 }); } catch (e) {} }
                ctx.notify('تم الربط المكاني — ' + totalHit + ' نقطة داخل ' + polys.length + ' مضلع', 'success');
            }

            root.querySelector('[data-act="run"]').addEventListener('click', run);
            this._cleanup = clearHl;
        },

        destroy: function () { if (typeof this._cleanup === 'function') { try { this._cleanup(); } catch (e) {} } }
    });
})();
