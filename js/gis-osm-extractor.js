/* ================================================================
   GIS Module — Global Vector Data Extractor (OpenStreetMap / Overpass)
   يسحب بيانات الفيكتور الحقيقية لأي منطقة في العالم من OpenStreetMap
   عبر Overpass API (نقاط / خطوط / مضلعات / علاقات Multipolygon)،
   يعرضها على الخريطة، ويصدّرها بصيغ GIS الاحترافية:
        GeoJSON · KML · KMZ · DXF (إحداثيات حقيقية) · Shapefile · CSV
   ----------------------------------------------------------------
   طرق تحديد المنطقة: نافذة الخريطة · مستطيل · مضلع مرسوم.
   يعتمد على: طبقة الوحدات GIS + محرّك التصدير الموحّد في التطبيق.
   ================================================================ */
(function () {
    'use strict';
    if (!window.GIS) { return; }

    var U = window.GIS.util || {};
    var SEL = U.selectStyle || 'width:100%;padding:8px 10px;border-radius:9px;border:1px solid #334155;background:#1e293b;color:#e2e8f0;font-family:inherit;font-size:12.5px;';
    var INPUT = U.inputStyle || SEL;

    var ENDPOINTS = [
        'https://overpass-api.de/api/interpreter',
        'https://overpass.private.coffee/api/interpreter',
        'https://maps.mail.ru/osm/tools/overpass/api/interpreter'
    ];

    var PRESETS = {
        water:      { label: 'شبكات المياه والصرف', filters: ['["waterway"]', '["man_made"="water_works"]', '["man_made"="water_tower"]', '["man_made"="reservoir_covered"]', '["man_made"="pipeline"]', '["man_made"="pump_station"]', '["man_made"="wastewater_plant"]', '["natural"="water"]', '["water"="reservoir"]', '["water"="tank"]'] },
        buildings:  { label: 'المباني',                 filters: ['["building"]'] },
        roads:      { label: 'الطرق والشوارع',         filters: ['["highway"]'] },
        landuse:    { label: 'استخدامات الأراضي',      filters: ['["landuse"]'] },
        poi:        { label: 'المعالم والنشاطات (POI)', filters: ['["amenity"]', '["shop"]'] },
        power:      { label: 'شبكات الكهرباء',         filters: ['["power"~"line|minor_line|tower|substation|pole"]'] },
        boundaries: { label: 'الحدود الإدارية',        filters: ['["boundary"="administrative"]'] },
        vegetation: { label: 'الغطاء النباتي',         filters: ['["natural"~"wood|scrub|tree_row|grassland"]'] },
        places:     { label: 'الأماكن المأهولة',       filters: ['["place"]'] },
        custom:     { label: '— استعلام Overpass مخصّص —', filters: null }
    };

    var FORMATS = [
        { id: 'geojson', label: 'GeoJSON', ext: '.geojson', icon: 'fa-file-code' },
        { id: 'kml', label: 'KML', ext: '.kml', icon: 'fa-map-location-dot' },
        { id: 'kmz', label: 'KMZ', ext: '.kmz', icon: 'fa-file-zipper' },
        { id: 'dxf', label: 'DXF', ext: '.dxf', icon: 'fa-drafting-compass' },
        { id: 'shp', label: 'Shapefile', ext: '.zip', icon: 'fa-layer-group' },
        { id: 'csv', label: 'CSV', ext: '.csv', icon: 'fa-table' }
    ];

    /* ---------------- CSS ---------------- */
    function injectCss() {
        if (document.getElementById('gis-osm-style')) { return; }
        var css = [
            '.osm-row{display:flex;gap:6px;}',
            '.osm-row>*{flex:1;}',
            '.osm-btn{display:block;width:100%;padding:9px;border:1px solid var(--card-brd,#334155);border-radius:10px;background:rgba(255,255,255,.04);color:var(--txt,#e2e8f0);font-family:inherit;font-size:12.5px;font-weight:700;cursor:pointer;transition:.16s;text-align:center;}',
            '.osm-btn:hover{border-color:#38bdf8;background:rgba(2,132,199,.14);}',
            '.osm-btn.primary{background:linear-gradient(135deg,#0284c7,#0e8f8a);border-color:transparent;color:#fff;}',
            '.osm-btn.primary:hover{filter:brightness(1.08);}',
            '.osm-btn.danger{border-color:#ef4444;color:#fca5a5;}',
            '.osm-btn[disabled]{opacity:.5;cursor:not-allowed;}',
            '.osm-info{font-size:11.5px;color:var(--txt,#e2e8f0);line-height:1.8;background:rgba(255,255,255,.03);border:1px solid var(--card-brd,#334155);border-radius:10px;padding:9px 11px;margin-top:8px;}',
            '.osm-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:8px;}',
            '.osm-fmt{padding:9px 4px;border:1px solid var(--card-brd,#334155);border-radius:10px;background:rgba(255,255,255,.03);color:var(--txt,#e2e8f0);font-family:inherit;font-size:11px;font-weight:700;cursor:pointer;transition:.16s;text-align:center;}',
            '.osm-fmt:hover{border-color:#10b981;background:rgba(16,185,129,.14);}',
            '.osm-fmt i{display:block;font-size:15px;margin-bottom:4px;color:#7dd3fc;}',
            '.osm-prog{margin-top:9px;}',
            '.osm-bar{height:6px;border-radius:999px;background:#1e293b;overflow:hidden;}',
            '.osm-bar>span{display:block;height:100%;width:0;background:linear-gradient(90deg,#0284c7,#22d3ee);transition:width .2s;}',
            '.osm-hint{font-size:10.5px;color:var(--txt-dim,#94a3b8);line-height:1.7;margin-top:6px;}',
            '.osm-sep{height:1px;background:var(--card-brd,#334155);margin:12px 0;}',
            '.osm-ta{width:100%;padding:8px 10px;border-radius:9px;border:1px solid var(--card-brd,#334155);background:var(--card-bg,#1e293b);color:var(--txt,#e2e8f0);font-family:ui-monospace,Menlo,Consolas,monospace;font-size:11.5px;min-height:96px;resize:vertical;margin-top:6px;}'
        ].join('');
        var s = document.createElement('style');
        s.id = 'gis-osm-style';
        s.textContent = css;
        document.head.appendChild(s);
    }

    /* ---------------- Overpass → GeoJSON ---------------- */
    function ptEq(a, b) { return a && b && a[0] === b[0] && a[1] === b[1]; }
    function stitchRings(list) {
        var rings = [];
        (list || []).forEach(function (coords) {
            if (!coords || coords.length < 2) { return; }
            for (var i = 0; i < rings.length; i++) {
                var r = rings[i];
                if (ptEq(r[r.length - 1], coords[0])) { rings[i] = r.concat(coords.slice(1)); return; }
                if (ptEq(r[r.length - 1], coords[coords.length - 1])) { rings[i] = r.concat(coords.slice(0, -1).reverse()); return; }
                if (ptEq(r[0], coords[coords.length - 1])) { rings[i] = coords.slice(0, -1).concat(r); return; }
                if (ptEq(r[0], coords[0])) { rings[i] = coords.slice(1).reverse().concat(r); return; }
            }
            rings.push(coords.slice());
        });
        return rings;
    }
    function overpassToGeoJSON(data) {
        var els = (data && data.elements) || [];
        var nodes = {}, ways = {};
        els.forEach(function (e) {
            if (e.type === 'node' && e.lon != null && e.lat != null) { nodes[e.id] = [e.lon, e.lat]; }
            else if (e.type === 'way') { ways[e.id] = e; }
        });
        function propsOf(e) {
            var p = {};
            if (e.tags) { for (var k in e.tags) { if (Object.prototype.hasOwnProperty.call(e.tags, k)) { p[k] = e.tags[k]; } } }
            p.osm_type = e.type; p.osm_id = e.id;
            return p;
        }
        function coordsOf(way) {
            if (!way || !way.nodes) { return null; }
            var out = [];
            for (var i = 0; i < way.nodes.length; i++) { var c = nodes[way.nodes[i]]; if (c) { out.push(c); } }
            return out.length >= 2 ? out : null;
        }
        function closeRing(r) { return ptEq(r[0], r[r.length - 1]) ? r : r.concat([r[0]]); }

        var features = [];

        els.forEach(function (e) {
            if (e.type === 'node' && e.tags && e.lon != null && e.lat != null) {
                features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [e.lon, e.lat] }, properties: propsOf(e) });
            }
        });

        els.forEach(function (e) {
            if (e.type !== 'way') { return; }
            var coords = coordsOf(e);
            if (!coords) { return; }
            var closed = e.nodes.length > 3 && e.nodes[0] === e.nodes[e.nodes.length - 1];
            features.push({ type: 'Feature', geometry: closed ? { type: 'Polygon', coordinates: [coords] } : { type: 'LineString', coordinates: coords }, properties: propsOf(e) });
        });

        els.forEach(function (e) {
            if (e.type !== 'relation') { return; }
            var tags = e.tags || {};
            var isMP = (tags.type === 'multipolygon' || tags.type === 'boundary' || tags.boundary === 'administrative');
            if (!isMP) { return; }
            var outers = [], inners = [];
            (e.members || []).forEach(function (m) {
                if (m.type !== 'way') { return; }
                var c = coordsOf(ways[m.id]);
                if (!c) { return; }
                if (m.role === 'inner') { inners.push(c); } else { outers.push(c); }
            });
            if (!outers.length) { return; }
            var outerRings = stitchRings(outers).map(closeRing);
            var innerRings = stitchRings(inners).map(closeRing);
            var geom;
            if (outerRings.length === 1) {
                geom = { type: 'Polygon', coordinates: [outerRings[0]].concat(innerRings) };
            } else {
                var cc = outerRings.map(function (o) { return [o]; });
                if (innerRings.length) { cc[0] = cc[0].concat(innerRings); }
                geom = { type: 'MultiPolygon', coordinates: cc };
            }
            features.push({ type: 'Feature', geometry: geom, properties: propsOf(e) });
        });

        return { type: 'FeatureCollection', features: features };
    }

    /* ---------------- Query builders ---------------- */
    function buildPresetQuery(key, bbox) {
        var p = PRESETS[key];
        if (!p || !p.filters) { return ''; }
        var lines = p.filters.map(function (f) { return '  nwr' + f + '(' + bbox + ');'; });
        return '[out:json][timeout:60];\n(\n' + lines.join('\n') + '\n);\nout body;\n>;\nout skel qt;';
    }
    function buildCustomQuery(text, bbox) {
        var t = String(text || '').trim();
        if (!t) { return ''; }
        if (t.indexOf('{{bbox}}') >= 0) { t = t.split('{{bbox}}').join(bbox); }
        if (!/\[out:/.test(t)) { t = '[out:json][timeout:60];\n' + t; }
        if (!/\bout\b/.test(t)) { t += '\nout body;\n>;\nout skel qt;'; }
        return t;
    }

    /* ---------------- Fetch with fallback ---------------- */
    async function runOverpass(query, onProgress) {
        var lastErr = null;
        for (var i = 0; i < ENDPOINTS.length; i++) {
            if (onProgress) { onProgress('الاتصال بـ Overpass (' + (i + 1) + '/' + ENDPOINTS.length + ')…', 25); }
            try {
                var res = await fetch(ENDPOINTS[i], {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: 'data=' + encodeURIComponent(query)
                });
                if (res.status === 429 || res.status === 504 || res.status === 502) { lastErr = new Error('HTTP ' + res.status + ' (الخادم مشغول)'); continue; }
                if (!res.ok) { lastErr = new Error('HTTP ' + res.status); continue; }
                return await res.json();
            } catch (e) { lastErr = e; }
        }
        throw lastErr || new Error('تعذّر الاتصال بخوادم Overpass');
    }

    var cleanupFn = null;

    window.GIS.registerModule({
        id: 'osm-extractor',
        icon: 'fa-cloud-arrow-down',
        title: 'Global Vector Data (OSM)',
        group: 'Export & Workspace',
        description: 'Download real vector features for any area worldwide from OpenStreetMap (Overpass API) and export them as GeoJSON/KML/DXF/Shapefile with real coordinates.',
        order: 74,
        mount: function (root, ctx) {
            var map = ctx.map, L = ctx.L;
            if (!map || !L) { root.innerHTML = '<div style="color:#fca5a5">الخريطة غير مهيّأة.</div>'; return; }
            injectCss();

            /* ---- view state ---- */
            var presetOpts = Object.keys(PRESETS).map(function (k) { return { value: k, label: PRESETS[k].label }; }).join('');

            root.innerHTML =
                '<div class="osm-hint" style="margin-top:0;margin-bottom:8px"><i class="fas fa-earth-africa"></i> اسحب بيانات فيكتور حقيقية لأي منطقة في العالم من OpenStreetMap (Overpass API) — مبانٍ، طرق، مياه، حدود، ومعالم — ثم صدّرها بإحداثياتها الحقيقية.</div>' +
                '<label style="display:block;font-size:12px;font-weight:700;margin:8px 0 3px;color:var(--txt,#e2e8f0)">منطقة الاهتمام (AOI)</label>' +
                '<select data-f="mode" style="' + SEL + '">' +
                    '<option value="view">نافذة الخريطة الحالية</option>' +
                    '<option value="rect">مستطيل — أرسمه على الخريطة</option>' +
                    '<option value="poly">مضلع — أرسمه على الخريطة</option>' +
                '</select>' +
                '<div class="osm-row" style="margin-top:6px">' +
                    '<button class="osm-btn" data-act="draw" style="display:none"><i class="fas fa-draw-polygon"></i> ابدأ الرسم</button>' +
                    '<button class="osm-btn" data-act="finish" style="display:none"><i class="fas fa-check"></i> إنهاء المضلع</button>' +
                    '<button class="osm-btn" data-act="clear-aoi" style="display:none"><i class="fas fa-eraser"></i> مسح</button>' +
                '</div>' +
                '<div class="osm-info" data-f="aoiinfo">منطقة الاهتمام: نافذة الخريطة الحالية.</div>' +
                '<label style="display:block;font-size:12px;font-weight:700;margin:12px 0 3px;color:var(--txt,#e2e8f0)">نوع البيانات</label>' +
                '<select data-f="preset" style="' + SEL + '">' + presetOpts + '</select>' +
                '<div data-f="customwrap" style="display:none">' +
                    '<textarea data-f="custom" class="osm-ta" placeholder="اكتب استعلام Overpass، مثال:\nnwr[&quot;amenity&quot;=&quot;drinking_water&quot;]({{bbox}});&#10;(استخدم {{bbox}} كبديل عن منطقة الاهتمام)"></textarea>' +
                '</div>' +
                '<button class="osm-btn primary" data-act="run" style="margin-top:12px"><i class="fas fa-cloud-arrow-down"></i> تنزيل البيانات من OSM</button>' +
                '<div class="osm-prog" data-f="prog" style="display:none"><div data-f="progtext" style="font-size:11px;margin-bottom:4px"></div><div class="osm-bar"><span data-f="progbar"></span></div></div>' +
                '<div class="osm-info" data-f="result" style="display:none"></div>' +
                '<div class="osm-sep"></div>' +
                '<label style="display:block;font-size:12px;font-weight:700;margin:0 0 3px;color:var(--txt,#e2e8f0)">تصدير البيانات المُنزّلة</label>' +
                '<div class="osm-grid" data-f="formats"></div>' +
                '<div class="osm-row" style="margin-top:8px">' +
                    '<button class="osm-btn" data-act="zoom" disabled><i class="fas fa-magnifying-glass-location"></i> تكبير</button>' +
                    '<button class="osm-btn danger" data-act="remove" disabled><i class="fas fa-trash-can"></i> إزالة من الخريطة</button>' +
                '</div>' +
                '<div class="osm-hint"><i class="fas fa-circle-info"></i> البيانات تخضع لرخصة ODbL من OpenStreetMap. الصيغ المدعومة: GeoJSON · KML · DXF · Shapefile · CSV.</div>';

            root.querySelector('[data-f="formats"]').innerHTML = FORMATS.map(function (f) {
                return '<button class="osm-fmt" data-fmt="' + f.id + '"><i class="fas ' + f.icon + '"></i>' + f.label + '</button>';
            }).join('');

            var presetSel = root.querySelector('[data-f="preset"]');
            var customWrap = root.querySelector('[data-f="customwrap"]');
            var customTa = root.querySelector('[data-f="custom"]');
            var aoiInfo = root.querySelector('[data-f="aoiinfo"]');
            var progBox = root.querySelector('[data-f="prog"]');
            var progText = root.querySelector('[data-f="progtext"]');
            var progBar = root.querySelector('[data-f="progbar"]');
            var resultBox = root.querySelector('[data-f="result"]');
            var runBtn = root.querySelector('[data-act="run"]');
            var drawBtn = root.querySelector('[data-act="draw"]');
            var finishBtn = root.querySelector('[data-act="finish"]');
            var clearAoiBtn = root.querySelector('[data-act="clear-aoi"]');
            var zoomBtn = root.querySelector('[data-act="zoom"]');
            var removeBtn = root.querySelector('[data-act="remove"]');

            /* ---- AOI state ---- */
            var aoiMode = 'view';
            var rect = null, poly = null, polyPts = [], markers = null;
            var drawing = false, dragStart = null;
            var drawGroup = L.featureGroup().addTo(map);
            var resultLayer = null;
            var result = null;

            function bboxOf() {
                var b;
                if (aoiMode === 'rect' && rect) { b = rect.getBounds(); }
                else if (aoiMode === 'poly' && poly) { b = poly.getBounds(); }
                else { b = map.getBounds(); }
                return { west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() };
            }
            function bboxStr() { var b = bboxOf(); return [b.south, b.west, b.north, b.east].map(function (n) { return n.toFixed(6); }).join(','); }
            function updateAoiInfo() {
                var b = bboxOf();
                var label = aoiMode === 'rect' ? 'مستطيل مرسوم' : (aoiMode === 'poly' ? 'مضلع مرسوم' : 'نافذة الخريطة الحالية');
                aoiInfo.innerHTML = '<div>المنطقة: <b>' + label + '</b></div>' +
                    '<div style="color:var(--txt-dim,#94a3b8)">' + b.south.toFixed(5) + ' , ' + b.west.toFixed(5) + ' — ' + b.north.toFixed(5) + ' , ' + b.east.toFixed(5) + '</div>';
            }

            /* ---- drawing ---- */
            function clearRect() { if (rect) { try { drawGroup.removeLayer(rect); } catch (e) {} rect = null; } }
            function clearPoly() {
                if (poly) { try { drawGroup.removeLayer(poly); } catch (e) {} poly = null; }
                if (markers) { try { drawGroup.removeLayer(markers); } catch (e) {} markers = null; }
                polyPts = [];
            }
            function renderPoly() {
                if (poly) { try { drawGroup.removeLayer(poly); } catch (e) {} poly = null; }
                if (markers) { try { drawGroup.removeLayer(markers); } catch (e) {} markers = null; }
                if (polyPts.length >= 2) {
                    poly = L.polygon(polyPts, { color: '#10b981', weight: 2, fillColor: '#10b981', fillOpacity: 0.15 }).addTo(drawGroup);
                }
                markers = L.layerGroup(polyPts.map(function (ll) {
                    return L.circleMarker(ll, { radius: 4, color: '#f59e0b', weight: 2, fillColor: '#fbbf24', fillOpacity: 1 });
                })).addTo(drawGroup);
                updateAoiInfo();
            }
            function onRectDown(e) {
                if (!drawing || aoiMode !== 'rect') { return; }
                dragStart = e.latlng;
                clearRect();
                rect = L.rectangle(L.latLngBounds(dragStart, dragStart), { color: '#38bdf8', weight: 2, fillColor: '#38bdf8', fillOpacity: 0.15, dashArray: '6 4' }).addTo(drawGroup);
                map.on('mousemove', onRectMove); map.on('mouseup', onRectUp);
            }
            function onRectMove(e) { if (rect && dragStart) { rect.setBounds(L.latLngBounds(dragStart, e.latlng)); } }
            function onRectUp() {
                map.off('mousemove', onRectMove); map.off('mouseup', onRectUp);
                drawing = false; map.dragging.enable(); map.getContainer().style.cursor = '';
                syncButtons(); updateAoiInfo();
            }
            function onPolyClick(e) {
                if (!drawing || aoiMode !== 'poly') { return; }
                polyPts.push(e.latlng); renderPoly();
            }
            function stopDraw() {
                drawing = false;
                try { map.dragging.enable(); } catch (e) {}
                map.getContainer().style.cursor = '';
                map.off('mousedown', onRectDown); map.off('click', onPolyClick);
                map.off('mousemove', onRectMove); map.off('mouseup', onRectUp);
            }
            function beginDraw() {
                stopDraw();
                if (aoiMode === 'view') { updateAoiInfo(); return; }
                drawing = true;
                map.getContainer().style.cursor = 'crosshair';
                if (aoiMode === 'rect') {
                    clearRect(); map.dragging.disable(); map.on('mousedown', onRectDown);
                    if (ctx.notify) { ctx.notify('انقر واسحب على الخريطة لرسم المستطيل', 'info', 3600); }
                } else {
                    map.on('click', onPolyClick);
                    if (ctx.notify) { ctx.notify('انقر على الخريطة لإضافة نقاط المضلع ثم اضغط «إنهاء المضلع»', 'info', 4200); }
                }
                syncButtons();
            }
            function finishPoly() {
                stopDraw();
                if (polyPts.length < 3) { if (ctx.notify) { ctx.notify('أضف ٣ نقاط على الأقل', 'warn'); } return; }
                renderPoly(); updateAoiInfo();
                if (ctx.notify) { ctx.notify('تم إنشاء المضلع', 'success'); }
            }
            function syncButtons() {
                drawBtn.style.display = (aoiMode === 'view') ? 'none' : 'block';
                finishBtn.style.display = (aoiMode === 'poly') ? 'block' : 'none';
                clearAoiBtn.style.display = (aoiMode === 'view') ? 'none' : 'block';
                drawBtn.innerHTML = drawing
                    ? '<i class="fas fa-hand-pointer"></i> جارٍ الرسم…'
                    : (aoiMode === 'poly' ? '<i class="fas fa-draw-polygon"></i> إضافة نقاط' : '<i class="fas fa-vector-square"></i> ابدأ الرسم');
            }

            /* ---- progress ---- */
            function setProgress(text, pct) {
                progBox.style.display = 'block';
                progText.textContent = text;
                progBar.style.width = (pct || 0) + '%';
            }
            function hideProgress() { progBox.style.display = 'none'; }

            /* ---- run ---- */
            async function run() {
                var key = presetSel.value;
                var bbox = bboxStr();
                var query = (key === 'custom') ? buildCustomQuery(customTa.value, bbox) : buildPresetQuery(key, bbox);
                if (!query) { if (ctx.notify) { ctx.notify('اكتب استعلامًا مخصّصًا أولًا', 'warn'); } return; }
                runBtn.disabled = true;
                setProgress('تجهيز الاستعلام…', 8);
                try {
                    var data = await runOverpass(query, function (msg, pct) { setProgress(msg, pct); });
                    setProgress('تحويل البيانات…', 72);
                    var fc = overpassToGeoJSON(data);
                    if (aoiMode === 'poly' && poly && polyPts.length >= 3 && window.turf) {
                        try {
                            var polyFC = L.polygon(polyPts).toGeoJSON();
                            fc = { type: 'FeatureCollection', features: fc.features.filter(function (f) { try { return turf.booleanIntersects(f, polyFC); } catch (e) { return true; } }) };
                        } catch (e) {}
                    }
                    if (!fc.features.length) {
                        setProgress('لا توجد عناصر في هذه المنطقة', 100);
                        if (ctx.notify) { ctx.notify('لم يُعثر على عناصر مطابقة', 'warn'); }
                        return;
                    }
                    result = fc;
                    setProgress('تم التنزيل', 100);
                    showResult(fc);
                    addToMap(fc);
                    if (ctx.notify) { ctx.notify('تم تنزيل ' + fc.features.length + ' عنصر من OSM', 'success'); }
                } catch (e) {
                    hideProgress();
                    if (ctx.notify) { ctx.notify('فشل التنزيل: ' + (e && e.message ? e.message : e), 'error', 5600); }
                } finally {
                    runBtn.disabled = false;
                }
            }
            function showResult(fc) {
                var c = { p: 0, l: 0, a: 0 };
                fc.features.forEach(function (f) {
                    var t = f.geometry && f.geometry.type;
                    if (t === 'Point' || t === 'MultiPoint') { c.p++; }
                    else if (t === 'LineString' || t === 'MultiLineString') { c.l++; }
                    else { c.a++; }
                });
                resultBox.style.display = 'block';
                resultBox.innerHTML = '<div>عدد العناصر: <b>' + fc.features.length + '</b></div>' +
                    '<div style="color:var(--txt-dim,#94a3b8)">نقاط: <b>' + c.p + '</b> · خطوط: <b>' + c.l + '</b> · مضلعات: <b>' + c.a + '</b></div>';
                zoomBtn.disabled = false; removeBtn.disabled = false;
            }
            function addToMap(fc) {
                removeFromMap();
                resultLayer = L.geoJSON(fc, {
                    style: function (f) {
                        var t = f.geometry && f.geometry.type;
                        if (t === 'LineString' || t === 'MultiLineString') { return { color: '#38bdf8', weight: 2, opacity: 0.9 }; }
                        return { color: '#10b981', weight: 1.5, fillColor: '#10b981', fillOpacity: 0.15 };
                    },
                    pointToLayer: function (f, ll) { return L.circleMarker(ll, { radius: 4, color: '#f59e0b', weight: 2, fillColor: '#fbbf24', fillOpacity: 0.9 }); },
                    onEachFeature: function (f, layer) {
                        var tags = f.properties || {};
                        var keys = Object.keys(tags).filter(function (k) { return k.indexOf('osm_') !== 0; }).slice(0, 12);
                        var rows = keys.map(function (k) {
                            return '<div style="display:flex;gap:6px"><span style="color:#94a3b8;min-width:72px">' + k + '</span><span>' + String(tags[k]) + '</span></div>';
                        }).join('');
                        layer.bindPopup('<div style="font-family:Tajawal,sans-serif;font-size:12px;max-height:220px;overflow:auto">' +
                            (tags.name ? '<div style="font-weight:800;margin-bottom:4px">' + tags.name + '</div>' : '') +
                            '<div style="color:#7dd3fc;font-size:11px;margin-bottom:4px">' + (tags.osm_type || '') + ' #' + (tags.osm_id || '') + '</div>' +
                            (rows || '<i style="color:#94a3b8">لا وسوم</i>') + '</div>');
                    }
                }).addTo(map);
                try { resultLayer.bringToFront(); } catch (e) {}
            }
            function removeFromMap() { if (resultLayer) { try { map.removeLayer(resultLayer); } catch (e) {} resultLayer = null; } }
            function zoomToResult() { if (resultLayer && resultLayer.getBounds && resultLayer.getBounds().isValid()) { map.fitBounds(resultLayer.getBounds(), { padding: [40, 40], maxZoom: 18 }); } }

            async function doExport(fmt) {
                if (!result || !result.features || !result.features.length) { if (ctx.notify) { ctx.notify('نزّل البيانات أولًا', 'warn'); } return; }
                var name = 'osm_' + (presetSel.value || 'data');
                try {
                    await window.exportGeoData(result.features, fmt, { name: name });
                    if (ctx.notify) { ctx.notify('تم تصدير ' + result.features.length + ' عنصر بصيغة ' + fmt.toUpperCase(), 'success'); }
                } catch (e) {
                    if (ctx.notify) { ctx.notify('تعذر التصدير: ' + (e && e.message ? e.message : e), 'error'); }
                }
            }

            /* ---- wiring ---- */
            root.querySelector('[data-f="mode"]').addEventListener('change', function () {
                aoiMode = this.value; stopDraw();
                if (aoiMode === 'view') { clearRect(); clearPoly(); }
                syncButtons(); updateAoiInfo();
            });
            presetSel.addEventListener('change', function () { customWrap.style.display = (this.value === 'custom') ? 'block' : 'none'; });
            drawBtn.addEventListener('click', beginDraw);
            finishBtn.addEventListener('click', finishPoly);
            clearAoiBtn.addEventListener('click', function () { stopDraw(); clearRect(); clearPoly(); syncButtons(); updateAoiInfo(); });
            runBtn.addEventListener('click', run);
            zoomBtn.addEventListener('click', zoomToResult);
            removeBtn.addEventListener('click', removeFromMap);
            Array.prototype.forEach.call(root.querySelectorAll('[data-fmt]'), function (b) {
                b.addEventListener('click', function () { doExport(b.getAttribute('data-fmt')); });
            });

            var onMove = function () { if (aoiMode === 'view') { updateAoiInfo(); } };
            map.on('moveend', onMove);

            syncButtons(); updateAoiInfo();

            cleanupFn = function () {
                stopDraw();
                map.off('moveend', onMove);
                clearRect(); clearPoly();
                try { map.removeLayer(drawGroup); } catch (e) {}
                removeFromMap();
            };
        },
        destroy: function () {
            if (typeof cleanupFn === 'function') { try { cleanupFn(); } catch (e) {} cleanupFn = null; }
        }
    });
})();
