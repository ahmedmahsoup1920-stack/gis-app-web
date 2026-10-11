/* ================================================================
   GIS Module 07 — تحديد المواقع GPS + الالتقاط (Snapping)
   ================================================================ */
(function () {
    'use strict';
    if (!window.GIS) { return; }
    var U = window.GIS.util;

    function eachRing(geom, fnRing) {
        if (!geom) { return; }
        var t = geom.type;
        if (t === 'LineString') { fnRing(geom.coordinates); }
        else if (t === 'MultiLineString' || t === 'Polygon') { geom.coordinates.forEach(fnRing); }
        else if (t === 'MultiPolygon') { geom.coordinates.forEach(function (p) { p.forEach(fnRing); }); }
    }

    function referenceVertices(excludeGeojson) {
        var out = [];
        var gl = window.geoLayer;
        if (gl && gl.eachLayer) {
            gl.eachLayer(function (l) {
                if (!l.feature) { return; }
                window.featureVertices(l.feature).forEach(function (c) { out.push([c[1], c[0]]); });
            });
        }
        (window.customFeaturesData || []).forEach(function (cf) {
            if (cf.geojson === excludeGeojson) { return; }
            window.featureVertices(cf.geojson).forEach(function (c) { out.push([c[1], c[0]]); });
        });
        (window.locations || []).forEach(function (loc) { out.push([Number(loc.lat), Number(loc.lng)]); });
        return out;
    }

    window.GIS.registerModule({
        id: 'gps',
        title: 'المواقع GPS',
        icon: 'fa-location-crosshairs',
        group: 'أدوات التحرير والموقع',
        order: 50,
        description: 'تحديد موقعك الحقيقي، تتبّع المسار، والالتقاط عند الرؤوس',

        mount: function (root, ctx) {
            var L = ctx.L;
            root.innerHTML =
                '<div style="font-weight:800;margin-bottom:6px"><i class="fas fa-satellite-dish"></i> تحديد الموقع</div>' +
                '<div style="display:flex;gap:8px;margin-bottom:8px">' +
                  '<button type="button" data-act="locate" style="' + U.btn2Style + ';flex:1"><i class="fas fa-crosshairs"></i> موقعي</button>' +
                  '<button type="button" data-act="track" style="' + U.btn2Style + ';flex:1"><i class="fas fa-route"></i> تتبّع</button>' +
                  '<button type="button" data-act="addpt" style="' + U.btn2Style + ';flex:1"><i class="fas fa-location-dot"></i> نقطة</button>' +
                '</div>' +
                '<div data-f="gpsInfo"></div>' +
                '<hr style="border:none;border-top:1px solid var(--card-brd,#334155);margin:14px 0">' +
                '<div style="font-weight:800;margin-bottom:6px"><i class="fas fa-magnet"></i> الالتقاط (Snapping)</div>' +
                '<label style="font-size:11.5px;color:var(--txt-dim,#94a3b8)">تسامح الالتقاط بالبكسل للمؤشّر</label>' +
                '<input data-f="snaptol" type="number" value="12" min="2" max="40" style="' + U.inputStyle + '">' +
                '<label style="display:flex;align-items:center;gap:8px;margin-top:10px;font-size:12.5px"><input data-f="snapOn" type="checkbox"> إظهار مؤشّر أقرب رأس أثناء الحركة</label>' +
                '<button type="button" data-act="snapLayer" style="' + U.btn2Style + ';margin-top:10px;width:100%"><i class="fas fa-wand-magic-sparkles"></i> التقاط رؤوس عنصر مخصّص</button>' +
                '<div data-f="snapInfo" style="margin-top:10px"></div>';

            var gpsInfo = root.querySelector('[data-f="gpsInfo"]');
            var snapInfo = root.querySelector('[data-f="snapInfo"]');
            var snapTol = root.querySelector('[data-f="snaptol"]');

            /* ---------- GPS ---------- */
            var gps = { watchId: null, marker: null, accCircle: null, track: [], trackLine: null, lastPos: null, snapMarker: null };

            function readout(c, acc) {
                var lat = c.latitude, lng = c.longitude;
                var utm = window.wgs84ToUTM(lat, lng);
                gpsInfo.innerHTML =
                    '<div style="background:var(--card-bg,#1e293b);border:1px solid var(--card-brd,#334155);border-radius:10px;padding:10px;font-size:12.5px;line-height:1.9">' +
                    '<div>خط العرض: <b>' + lat.toFixed(6) + '</b></div>' +
                    '<div>خط الطول: <b>' + lng.toFixed(6) + '</b></div>' +
                    (acc != null ? '<div>الدقة: <b>±' + Math.round(acc) + ' م</b></div>' : '') +
                    (utm ? '<div>UTM ' + utm.zone + utm.hemisphere + ': <b>' + utm.easting.toFixed(1) + ' E / ' + utm.northing.toFixed(1) + ' N</b></div>' : '') +
                    '<div data-f="trackInfo"></div>' +
                    '</div>';
            }

            function placeMarker(lat, lng, acc) {
                if (gps.marker) { ctx.map.removeLayer(gps.marker); }
                if (gps.accCircle) { ctx.map.removeLayer(gps.accCircle); }
                gps.marker = L.circleMarker([lat, lng], { radius: 8, color: '#fff', weight: 3, fillColor: '#2563eb', fillOpacity: 1, pane: 'gisPointPane' }).addTo(ctx.map);
                if (acc) { gps.accCircle = L.circle([lat, lng], { radius: acc, color: '#2563eb', weight: 1, fillOpacity: 0.12, pane: 'gisPolyPane' }).addTo(ctx.map); }
            }

            function onPos(pos) {
                var c = pos.coords;
                gps.lastPos = [c.latitude, c.longitude];
                placeMarker(c.latitude, c.longitude, c.accuracy);
                readout(c, c.accuracy);
                if (gps.watchId != null) {
                    gps.track.push([c.latitude, c.longitude]);
                    if (gps.trackLine) { ctx.map.removeLayer(gps.trackLine); }
                    var d = 0;
                    for (var i = 1; i < gps.track.length; i++) { d += ctx.map.distance(gps.track[i - 1], gps.track[i]); }
                    gps.trackLine = L.polyline(gps.track, { color: '#22c55e', weight: 4, pane: 'gisLinePane' }).addTo(ctx.map);
                    var ti = root.querySelector('[data-f="trackInfo"]');
                    if (ti) { ti.innerHTML = 'مسار: <b>' + window.formatDistance(d) + '</b> (' + gps.track.length + ' نقطة)'; }
                }
            }
            function onErr(e) { ctx.notify('تعذّر تحديد الموقع: ' + (e.message || 'مرفوض'), 'error'); }

            root.querySelector('[data-act="locate"]').addEventListener('click', function () {
                if (!navigator.geolocation) { ctx.notify('المتصفح لا يدعم تحديد المواقع', 'error'); return; }
                ctx.notify('جارٍ تحديد الموقع...', 'info');
                navigator.geolocation.getCurrentPosition(function (pos) {
                    onPos(pos);
                    try { ctx.map.setView([pos.coords.latitude, pos.coords.longitude], Math.max(ctx.map.getZoom(), 16)); } catch (e) {}
                    ctx.notify('تم تحديد موقعك', 'success');
                }, onErr, { enableHighAccuracy: true, timeout: 12000 });
            });

            root.querySelector('[data-act="track"]').addEventListener('click', function () {
                if (gps.watchId != null) {
                    navigator.geolocation.clearWatch(gps.watchId); gps.watchId = null;
                    this.innerHTML = '<i class="fas fa-route"></i> تتبّع';
                    ctx.notify('تم إيقاف التتبّع', 'info');
                    return;
                }
                if (!navigator.geolocation) { ctx.notify('المتصفح لا يدعم تحديد المواقع', 'error'); return; }
                gps.track = [];
                gps.watchId = navigator.geolocation.watchPosition(onPos, onErr, { enableHighAccuracy: true, timeout: 15000 });
                this.innerHTML = '<i class="fas fa-stop"></i> إيقاف';
                ctx.notify('بدأ تتبّع الموقع', 'success');
            });

            root.querySelector('[data-act="addpt"]').addEventListener('click', function () {
                if (!gps.lastPos) { ctx.notify('حدّد موقعك أولاً', 'warn'); return; }
                var lat = gps.lastPos[0], lng = gps.lastPos[1];
                var feat = { type: 'Feature', properties: { name: 'موقعي', category: 'نقطة' }, geometry: { type: 'Point', coordinates: [lng, lat] } };
                var icon = L.divIcon({ className: 'gps-pt', html: '<div style="width:16px;height:16px;border-radius:50%;background:#2563eb;border:3px solid #fff;box-shadow:0 0 6px rgba(0,0,0,.5)"></div>', iconSize: [16, 16], iconAnchor: [8, 8] });
                var marker = L.marker([gps.lastPos[0], gps.lastPos[1]], { icon: icon, pane: 'gisPointPane' });
                try { window.addCustomFeature('نقطة', 'موقعي', 'من GPS', marker, feat); ctx.notify('تمت إضافة نقطة الموقع', 'success'); }
                catch (e) { ctx.notify('تعذّر إنشاء النقطة', 'error'); }
            });

            /* ---------- Snapping ---------- */
            var snapMarker = null;
            function nearestRef(latlng) {
                var tol = Number(root.querySelector('[data-f="snaptol"]').value) || 12;
                var refs = referenceVertices(null);
                var p = ctx.map.latLngToLayerPoint(latlng), best = null, bestD = tol;
                refs.forEach(function (r) { var d = p.distanceTo(ctx.map.latLngToLayerPoint([r[0], r[1]])); if (d <= bestD) { bestD = d; best = r; } });
                return best;
            }
            function onMove(e) {
                if (!snapMarker) { snapMarker = L.circleMarker([0, 0], { radius: 9, color: '#f59e0b', weight: 3, fillColor: '#f59e0b', fillOpacity: 0.35, pane: 'gisPointPane' }); }
                var hit = nearestRef(e.latlng);
                if (hit) {
                    snapMarker.setLatLng([hit[0], hit[1]]);
                    if (!ctx.map.hasLayer(snapMarker)) { snapMarker.addTo(ctx.map); }
                } else if (ctx.map.hasLayer(snapMarker)) { ctx.map.removeLayer(snapMarker); }
            }
            root.querySelector('[data-f="snapOn"]').addEventListener('change', function () {
                if (this.checked) { ctx.map.on('mousemove', onMove); }
                else { ctx.map.off('mousemove', onMove); if (snapMarker && ctx.map.hasLayer(snapMarker)) { ctx.map.removeLayer(snapMarker); } }
            });

            function snapSelectedFeature() {
                var cfs = (window.customFeaturesData || []).filter(function (cf) { return cf.geojson && (U.geomType(cf.geojson) === 'line' || U.geomType(cf.geojson) === 'polygon'); });
                if (!cfs.length) { ctx.notify('لا توجد عناصر خطية/مضلعية مخصّصة', 'warn'); return; }
                var names = cfs.map(function (cf, i) { return (i + 1) + '. ' + cf.name; }).join('\n');
                var pick = prompt('اختر رقم العنصر لالتقاط رؤوسه:\n' + names, '1');
                var idx = parseInt(pick, 10) - 1;
                if (isNaN(idx) || !cfs[idx]) { return; }
                var cf = cfs[idx];
                var tol = parseFloat(prompt('تسامح الالتقاط بالأمتار:', '5'));
                if (isNaN(tol)) { return; }
                var refs = referenceVertices(cf.geojson);
                var isPoly = U.geomType(cf.geojson) === 'polygon';
                var moved = 0;
                eachRing(cf.geojson.geometry, function (ring) {
                    ring.forEach(function (pos, i) {
                        if (isPoly && i === ring.length - 1 && pos[0] === ring[0][0] && pos[1] === ring[0][1]) { return; }
                        var lon = pos[0], lat = pos[1], best = null, bestD = tol;
                        refs.forEach(function (r) { var d = ctx.map.distance([lat, lon], [r[0], r[1]]); if (d <= bestD) { bestD = d; best = r; } });
                        if (best) { pos[0] = best[1]; pos[1] = best[0]; moved++; }
                    });
                });
                if (!moved) { ctx.notify('لا توجد رؤوس ضمن التسامح', 'info'); return; }
                cf.geojson.properties = cf.geojson.properties || {};
                cf.utm = window.featureUTM(cf.geojson);
                var ln = window.featureLengthM(cf.geojson), ar = window.featureAreaM2(cf.geojson);
                if (ln) { cf.geojson.properties.length_m = +ln.toFixed(2); }
                if (ar) { cf.geojson.properties.area_m2 = +ar.toFixed(2); }
                U.refreshCustomLayer(cf);
                ctx.notify('تم التقاط ' + moved + ' رأس', 'success');
            }
            root.querySelector('[data-act="snapLayer"]').addEventListener('click', snapSelectedFeature);

            this._cleanup = function () {
                if (gps.watchId != null) { try { navigator.geolocation.clearWatch(gps.watchId); } catch (e) {} gps.watchId = null; }
                ctx.map.off('mousemove', onMove);
                if (snapMarker && ctx.map.hasLayer(snapMarker)) { ctx.map.removeLayer(snapMarker); }
                if (gps.marker) { ctx.map.removeLayer(gps.marker); }
                if (gps.accCircle) { ctx.map.removeLayer(gps.accCircle); }
                if (gps.trackLine) { ctx.map.removeLayer(gps.trackLine); }
            };
        },

        destroy: function () { if (typeof this._cleanup === 'function') { try { this._cleanup(); } catch (e) {} } }
    });
})();
