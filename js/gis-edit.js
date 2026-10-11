/* ================================================================
   GIS Module 12 — تحرير الأشكال الهندسية (Geometry Editing)
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
    function isClosed(ring) { return ring.length > 2 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]; }

    window.GIS.registerModule({
        id: 'edit',
        title: 'تحرير الهندسة',
        icon: 'fa-pen-ruler',
        group: 'أدوات التحرير والموقع',
        order: 60,
        description: 'تحريك/إضافة/حذف رؤوس العناصر المخصّصة مع إعادة حساب المساحة والطول',

        mount: function (root, ctx) {
            var L = ctx.L;
            var editItems = L.featureGroup().addTo(ctx.map);
            var cf = null, mode = 'move', markers = [];

            root.innerHTML =
                '<div data-f="sel"></div>' +
                '<div style="display:flex;gap:6px;margin-top:10px">' +
                  '<button type="button" data-mode="move" class="gis-edit-mode" style="' + U.btn2Style + ';flex:1;border-color:#0284c7;background:rgba(2,132,199,.18)"><i class="fas fa-arrows-up-down-left-right"></i> تحريك</button>' +
                  '<button type="button" data-mode="add" class="gis-edit-mode" style="' + U.btn2Style + ';flex:1"><i class="fas fa-plus"></i> إضافة</button>' +
                  '<button type="button" data-mode="del" class="gis-edit-mode" style="' + U.btn2Style + ';flex:1"><i class="fas fa-minus"></i> حذف</button>' +
                '</div>' +
                '<button type="button" data-act="close" style="' + U.btnStyle + ';background:#475569"><i class="fas fa-xmark"></i> إنهاء التحرير</button>' +
                '<div data-f="out" style="margin-top:10px"></div>';

            var sel = U.el('select', { style: U.selectStyle });
            var selWrap = root.querySelector('[data-f="sel"]');
            selWrap.innerHTML = '<label style="font-size:11.5px;color:var(--txt-dim,#94a3b8);display:block;margin-bottom:4px;">العنصر المراد تحريره</label>';
            selWrap.appendChild(sel);
            var out = root.querySelector('[data-f="out"]');

            function fillSelect() {
                var list = ((typeof customFeaturesData !== 'undefined' ? customFeaturesData : null) || []);
                sel.innerHTML = '<option value="">— اختر عنصرًا —</option>' + list.map(function (c) {
                    return '<option value="' + c.id + '">' + ctx.escapeHtml(c.name + ' (' + c.kind + ')') + '</option>';
                }).join('');
            }
            fillSelect();

            function vertexIcon() {
                return L.divIcon({ className: 'gis-vertex', html: '<div style="width:12px;height:12px;border-radius:50%;background:#22d3ee;border:2px solid #0f172a;box-shadow:0 0 4px rgba(0,0,0,.6)"></div>', iconSize: [12, 12], iconAnchor: [6, 6] });
            }

            function commit() {
                if (!cf) { return; }
                cf.geojson.properties = cf.geojson.properties || {};
                var gt = U.geomType(cf.geojson);
                if (gt === 'polygon') { var a = window.featureAreaM2(cf.geojson); if (a) { cf.geojson.properties.area_m2 = +a.toFixed(2); } }
                if (gt === 'line') { var l = window.featureLengthM(cf.geojson); if (l) { cf.geojson.properties.length_m = +l.toFixed(2); } }
                cf.utm = window.featureUTM(cf.geojson);
                if (cf.utm) {
                    cf.geojson.properties.utm_zone = cf.utm.zone;
                    cf.geojson.properties.utm_hemisphere = cf.utm.hemisphere;
                    cf.geojson.properties.utm_easting = +cf.utm.easting.toFixed(3);
                    cf.geojson.properties.utm_northing = +cf.utm.northing.toFixed(3);
                }
                U.refreshCustomLayer(cf);
                info();
            }

            function clearMarkers() { editItems.clearLayers(); markers = []; }

            function buildMarkers() {
                clearMarkers();
                if (!cf) { return; }
                var gt = U.geomType(cf.geojson);
                if (gt === 'point') {
                    var c = cf.geojson.geometry.coordinates;
                    var m = L.marker([c[1], c[0]], { draggable: true, icon: vertexIcon(), pane: 'gisPointPane' });
                    m._ref = { ring: null, i: -1 };
                    m.on('dragend', function (e) { var ll = e.target.getLatLng(); cf.geojson.geometry.coordinates = [ll.lng, ll.lat]; commit(); });
                    editItems.addLayer(m); markers.push(m);
                } else {
                    eachRing(cf.geojson.geometry, function (ring) {
                        var closed = isClosed(ring);
                        ring.forEach(function (pos, i) {
                            if (isClosed(ring) && i === ring.length - 1) { return; }
                            var m = L.marker([pos[1], pos[0]], { draggable: true, icon: vertexIcon(), pane: 'gisPointPane' });
                            m._ref = { ring: ring, i: i, close: (i === 0 && closed) };
                            m.on('dragend', onDrag);
                    m.on('click', onVertexClick);
                            editItems.addLayer(m); markers.push(m);
                        });
                    });
                }
                info();
            }

            function onDrag(e) {
                var ll = e.target.getLatLng(), ref = e.target._ref;
                ref.ring[ref.i] = [ll.lng, ll.lat];
                if (ref.close) { ref.ring[ref.ring.length - 1] = [ll.lng, ll.lat]; }
                commit();
            }

            function onAddVertex(e) {
                if (!cf) { return; }
                var gt = U.geomType(cf.geojson);
                if (gt === 'point') { ctx.notify('العنصر نقطة', 'info'); return; }
                var click = e.latlng;
                var best = null, bestD = Infinity;
                eachRing(cf.geojson.geometry, function (ring) {
                    for (var i = 0; i < ring.length - 1; i++) {
                        var a = [ring[i][1], ring[i][0]], b = [ring[i + 1][1], ring[i + 1][0]];
                        var d = ctx.map.distance(click, a) + ctx.map.distance(click, b) + ctx.map.distance(a, b);
                        if (d < bestD) { bestD = d; best = { ring: ring, i: i }; }
                    }
                });
                if (!best) { return; }
                best.ring.splice(best.i + 1, 0, [click.lng, click.lat]);
                commit();
                buildMarkers();
                ctx.notify('تمت إضافة رأس', 'success');
            }

            function onVertexClick(e) {
                if (mode !== 'del' || !cf) { return; }
                L.DomEvent.stop(e);
                var ref = e.target._ref;
                var ring = ref.ring;
                var minLen = isClosed(ring) ? 4 : 2;
                if (ring.length <= minLen) { ctx.notify('لا يمكن حذف مزيد من الرؤوس', 'warn'); return; }
                if (isClosed(ring) && ref.i === 0) {
                    ring.shift();
                    ring[ring.length - 1] = ring[0].slice();
                } else {
                    ring.splice(ref.i, 1);
                    if (isClosed(ring)) { ring[ring.length - 1] = ring[0].slice(); }
                }
                commit();
                buildMarkers();
            }

            function info() {
                if (!cf) { out.innerHTML = '<div style="color:var(--txt-dim,#94a3b8);font-size:12px">اختر عنصرًا للتحرير.</div>'; return; }
                var p = cf.geojson.properties || {};
                var gt = U.geomType(cf.geojson);
                var extra = U.geomType(cf.geojson) === 'polygon' ? 'المساحة: <b>' + ctx.escapeHtml(window.formatArea(window.featureAreaM2(cf.geojson))) + '</b>'
                    : U.geomType(cf.geojson) === 'line' ? 'الطول: <b>' + ctx.escapeHtml(window.formatDistance(window.featureLengthM(cf.geojson))) + '</b>' : '';
                out.innerHTML =
                    '<div style="background:var(--card-bg,#1e293b);border:1px solid var(--card-brd,#334155);border-radius:10px;padding:10px;font-size:12.5px">' +
                    '<div style="font-weight:800">' + ctx.escapeHtml(cf.name) + ' <span class="gis-mod-badge">' + cf.kind + '</span></div>' +
                    '<div>الرؤوس: <b>' + markers.length + '</b></div>' +
                    (extra ? '<div>' + extra + '</div>' : '') +
                    '<div style="color:var(--txt-dim,#94a3b8);margin-top:4px;font-size:11.5px">اسحب الرؤوس للتحرير؛ التغييرات تُحفظ تلقائيًا.</div>' +
                    '</div>';
            }

            function startEdit() {
                var id = Number(sel.value);
                cf = ((typeof customFeaturesData !== 'undefined' ? customFeaturesData : null) || []).find(function (c) { return c.id === id; }) || null;
                if (!cf) { clearMarkers(); out.innerHTML = ''; return; }
                try { if (typeof stopCustomDraw === 'function') { stopCustomDraw(); } } catch (e) {}
                try { if (typeof stopMeasuring === 'function') { stopMeasuring(); } } catch (e) {}
                try { if (typeof stopCoordTool === 'function') { stopCoordTool(); } } catch (e) {}
                buildMarkers();
                try { var b = cf.layer.getBounds ? cf.layer.getBounds() : null; if (b && b.isValid()) { ctx.map.fitBounds(b, { padding: [60, 60], maxZoom: 18 }); } } catch (e) {}
            }

            function setMode(m) {
                mode = m;
                Array.prototype.forEach.call(root.querySelectorAll('.gis-edit-mode'), function (b) {
                    var on = b.getAttribute('data-mode') === m;
                    b.style.borderColor = on ? '#0284c7' : '';
                    b.style.background = on ? 'rgba(2,132,199,.18)' : '';
                });
            }

            root.querySelectorAll('.gis-edit-mode').forEach(function (b) {
                b.addEventListener('click', function () { setMode(b.getAttribute('data-mode')); });
            });

            var mapClick = function (e) { if (mode === 'add') { onAddVertex(e); } };
            ctx.map.on('click', mapClick);

            sel.addEventListener('change', startEdit);
            root.querySelector('[data-act="close"]').addEventListener('click', function () {
                clearMarkers(); cf = null; sel.value = '';
                out.innerHTML = '<div style="color:var(--txt-dim,#94a3b8);font-size:12px">تم إنهاء التحرير.</div>';
            });

            this._cleanup = function () {
                ctx.map.off('click', mapClick);
                clearMarkers();
                if (ctx.map.hasLayer(editItems)) { ctx.map.removeLayer(editItems); }
            };
        },

        destroy: function () { if (typeof this._cleanup === 'function') { try { this._cleanup(); } catch (e) {} } }
    });
})();
