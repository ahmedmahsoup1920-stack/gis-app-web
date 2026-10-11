/* ================================================================
   GIS Module 18 — تغطية الخدمات (Thiessen / Voronoi + Convex Hull)
   إنشاء مضلعات ثيسن (فورونوي) من النقاط + المغلّف المحدّب.
   ================================================================ */
(function () {
    'use strict';
    if (!window.GIS) { return; }
    var U = window.GIS.util;

    function addPoly(name, desc, geojson, color) {
        var L = window.L;
        var saved = { stroke: drawStyle.stroke, fill: drawStyle.fill, weight: drawStyle.weight, fillOpacity: drawStyle.fillOpacity };
        drawStyle.stroke = color; drawStyle.fill = color; drawStyle.weight = 2; drawStyle.fillOpacity = 0.16;
        var layer = L.geoJSON(geojson, { pane: 'gisPolyPane' });
        try { addCustomFeature('مضلع', name, desc, layer, geojson); }
        finally { drawStyle.stroke = saved.stroke; drawStyle.fill = saved.fill; drawStyle.weight = saved.weight; drawStyle.fillOpacity = saved.fillOpacity; }
        var arr = (typeof customFeaturesData !== 'undefined' ? customFeaturesData : null) || [];
        var cf = arr[arr.length - 1];
        if (cf) { cf.color = color; cf.fillColor = color; cf.moduleResult = true; try { applyCustomFeatureStyle(cf); updateTOC(); } catch (e) {} }
        return cf;
    }

    window.GIS.registerModule({
        id: 'voronoi',
        title: 'تغطية الخدمات (ثيسن)',
        icon: 'fa-diagram-cells',
        group: 'التحليل المكاني',
        order: 180,
        description: 'مضلعات ثيسن (فورونوي) لخدمة النقاط + المغلّف المحدّب',

        mount: function (root, ctx) {
            if (!window.turf) { root.innerHTML = '<div style="color:#fca5a5">مكتبة Turf غير محمّلة.</div>'; return; }

            root.innerHTML =
                U.field('المصدر (نقاط)', '<select data-f="scope" style="' + U.selectStyle + '">' +
                    U.options([
                        { value: 'all', label: 'كل النقاط', sel: true },
                        { value: 'file', label: 'نقاط الملف الحالي' },
                        { value: 'custom', label: 'النقاط المخصصة' },
                        { value: 'selected', label: 'العناصر المحدّدة' }
                    ]) + '</select>') +
                U.field('حدود التغطية', '<select data-f="ext" style="' + U.selectStyle + '">' +
                    '<option value="data">حول البيانات (هامش 20%)</option>' +
                    '<option value="view" selected>نطاق العرض الحالي للخريطة</option>' +
                '</select>') +
                U.field('تسميات الخلايا', '<label style="display:flex;gap:8px;align-items:center;font-size:12.5px"><input data-f="named" type="checkbox"> إظهار أسماء النقاط في لوحة الطبقات</label>') +
                '<div style="display:flex;gap:8px">' +
                '<button type="button" data-act="vor" style="' + U.btnStyle + ';flex:1"><i class="fas fa-table-cells"></i> ثيسن</button>' +
                '<button type="button" data-act="hull" style="' + U.btnStyle + ';flex:1;background:#8b5cf6"><i class="fas fa-draw-polygon"></i> مغلّف محدّب</button>' +
                '</div>' +
                '<div data-f="out" style="margin-top:12px"></div>';

            var scopeSel = root.querySelector('[data-f="scope"]');
            var extSel = root.querySelector('[data-f="ext"]');
            var out = root.querySelector('[data-f="out"]');

            function points(scope) {
                return U.sourceFeatures(scope).filter(function (o) { return o.f.geometry && o.f.geometry.type === 'Point'; });
            }
            function bboxOf(coords) {
                if (extSel.value === 'view') {
                    var b = ctx.map.getBounds();
                    return [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
                }
                var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                coords.forEach(function (c) {
                    if (c[0] < minX) { minX = c[0]; } if (c[1] < minY) { minY = c[1]; }
                    if (c[0] > maxX) { maxX = c[0]; } if (c[1] > maxY) { maxY = c[1]; }
                });
                var dx = (maxX - minX) * 0.2 || 0.01, dy = (maxY - minY) * 0.2 || 0.01;
                return [minX - dx, minY - dy, maxX + dx, maxY + dy];
            }

            function runVoronoi() {
                var pts = points(scopeSel.value);
                if (pts.length < 3) { ctx.notify('يلزم 3 نقاط على الأقل', 'warn'); return; }
                var fc = { type: 'FeatureCollection', features: pts.map(function (o) {
                    var f = JSON.parse(JSON.stringify(o.f));
                    f.properties = f.properties || {};
                    if (!f.properties.name) { f.properties.name = o.name; }
                    return f;
                }) };
                var cells;
                try { cells = window.turf.voronoi(fc, { bbox: bboxOf(pts.map(function (o) { return o.f.geometry.coordinates; })) }); }
                catch (e) { ctx.notify('فشل توليد ثيسن: ' + e.message, 'error'); return; }
                if (!cells || !cells.features || !cells.features.length) { ctx.notify('تعذّر توليد الخلايا', 'warn'); return; }
                var cf = addPoly('مضلعات ثيسن (' + cells.features.length + ')', 'تغطية خدمة من ' + pts.length + ' نقطة', cells, '#0ea5e9');
                show(out, 'ثيسن', cells.features.length, cf);
                ctx.notify('تم توليد ' + cells.features.length + ' خلية', 'success');
            }

            function runHull() {
                var pts = points(scopeSel.value);
                if (pts.length < 3) { ctx.notify('يلزم 3 نقاط على الأقل', 'warn'); return; }
                var hull;
                try { hull = window.turf.convex({ type: 'FeatureCollection', features: pts.map(function (o) { return o.f; }) }); }
                catch (e) { ctx.notify('فشل المغلّف: ' + e.message, 'error'); return; }
                if (!hull) { ctx.notify('تعذّر توليد المغلّف المحدّب', 'warn'); return; }
                var area = 0; try { area = window.turf.area(hull); } catch (e) {}
                var cf = addPoly('مغلّف محدّب', 'النطاق المحيط بـ ' + pts.length + ' نقطة — ' + U.fmtArea(area), hull, '#8b5cf6');
                show(out, 'المغلّف المحدّب', 1, cf, area);
                ctx.notify('تم توليد المغلّف المحدّب', 'success');
            }

            function show(host, title, n, cf, area) {
                host.innerHTML =
                    '<div style="background:var(--card-bg,#1e293b);border:1px solid var(--card-brd,#334155);border-radius:10px;padding:10px;">' +
                    '<div style="font-weight:800;margin-bottom:4px"><i class="fas fa-circle-check" style="color:#22c55e"></i> ' + ctx.escapeHtml(title) + '</div>' +
                    '<div style="font-size:12px">عدد العناصر: <b>' + n + '</b></div>' +
                    (area ? '<div style="font-size:12px">المساحة: <b>' + ctx.escapeHtml(U.fmtArea(area)) + '</b></div>' : '') +
                    (cf ? '<button type="button" data-act="remove" style="' + U.btn2Style + ';margin-top:10px;width:100%;border-color:#ef4444;color:#fca5a5"><i class="fas fa-trash"></i> حذف النتيجة</button>' : '') +
                    '</div>';
                if (cf) {
                    host.querySelector('[data-act="remove"]').addEventListener('click', function () {
                        U.removeCustomById(cf.id);
                        host.innerHTML = '<div style="color:var(--txt-dim,#94a3b8);font-size:12px">تم حذف النتيجة.</div>';
                    });
                }
            }

            root.querySelector('[data-act="vor"]').addEventListener('click', runVoronoi);
            root.querySelector('[data-act="hull"]').addEventListener('click', runHull);
        }
    });
})();
