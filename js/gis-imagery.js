/* ================================================================
   GIS Module — Aerial Imagery Export
   تصدير الصور الجوية عالية الدقة من مصادر مفتوحة مع الإسناد الجغرافي
   ----------------------------------------------------------------
   • يعمل مع أي مصدر XYZ (Esri World Imagery، Sentinel-2 Cloudless،
     Google Satellite، أو رابط مخصّص يحدّده المستخدم).
   • يرسم المستخدم مستطيلاً (AOI) على الخريطة ثم يُصدَّر داخل ZIP واحد:
       - imagery.png   : الصورة المدمجة (Mosaic)
       - imagery.pgw   : World File (إسناد)
       - imagery.prj   : نظام الإحداثيات (WKT, EPSG:3857)
       - imagery.tif   : GeoTIFF حقيقي مُسند (EPSG:3857)
       - aoi.geojson   : حدود منطقة التصدير
       - README.txt    : تفاصيل التصدير والإسناد
   • يراعي حدود الاستخدام العادل (عدد البلاطات/الأبعاد) ويوضّح CORS.
   ================================================================ */
(function () {
    'use strict';
    if (!window.GIS) { return; }
    var U = window.GIS.util;

    var TILE = 256;
    var MAX_TILES = 512;                 // حد أقصى لعدد البلاطات
    var MAX_PIXELS = 40 * 1024 * 1024;   // حد أقصى لعدد البكسلات
    var MERC = 20037508.342789244;       // نصف محيط ميركاتور (متر)
    var EQUATOR = 40075016.685578488;    // محيط خط الاستواء (متر)
    var WKT_3857 = 'PROJCS["WGS_1984_Web_Mercator_Auxiliary_Sphere",GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]],PROJECTION["Mercator_Auxiliary_Sphere"],PARAMETER["False_Easting",0.0],PARAMETER["False_Northing",0.0],PARAMETER["Central_Meridian",0.0],PARAMETER["Standard_Parallel_1",0.0],PARAMETER["Auxiliary_Sphere_Type",0.0],UNIT["Meter",1.0]]';

    /* ---------------- هندسة البلاطات ---------------- */
    function lngLatToTileF(lng, lat, z) {
        var n = Math.pow(2, z);
        var x = (lng + 180) / 360 * n;
        var latRad = lat * Math.PI / 180;
        var y = (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n;
        return { x: x, y: y };
    }
    function rangeFromBox(box, z) {
        var n = Math.pow(2, z);
        var a = lngLatToTileF(box.west, box.north, z);
        var b = lngLatToTileF(box.east, box.south, z);
        var xMin = Math.floor(Math.min(a.x, b.x) + 1e-9);
        var xMax = Math.floor(Math.max(a.x, b.x) - 1e-9);
        var yMin = Math.floor(Math.min(a.y, b.y) + 1e-9);
        var yMax = Math.floor(Math.max(a.y, b.y) - 1e-9);
        xMin = Math.max(0, Math.min(n - 1, xMin));
        xMax = Math.max(0, Math.min(n - 1, xMax));
        yMin = Math.max(0, Math.min(n - 1, yMin));
        yMax = Math.max(0, Math.min(n - 1, yMax));
        if (xMax < xMin) { xMax = xMin; }
        if (yMax < yMin) { yMax = yMin; }
        return { xMin: xMin, xMax: xMax, yMin: yMin, yMax: yMax };
    }
    function mercOrigin(xMin, yMin, z) {
        var res256 = EQUATOR / Math.pow(2, z);
        return {
            originX: xMin * res256 - MERC,
            originY: MERC - yMin * res256,
            pxRes: res256 / TILE
        };
    }

    /* ---------------- جلب البلاطات ---------------- */
    function fillTemplate(tpl, z, x, y, subdomains, retina) {
        var s = 'a';
        if (subdomains && subdomains.length) { s = subdomains[(x + y) % subdomains.length]; }
        return String(tpl)
            .replace(/\{s\}/g, s)
            .replace(/\{z\}/g, z)
            .replace(/\{x\}/g, x)
            .replace(/\{y\}/g, y)
            .replace(/\{r\}/g, retina ? '@2x' : '');
    }
    function fetchBitmap(url) {
        return fetch(url, { mode: 'cors', credentials: 'omit' })
            .then(function (res) {
                if (!res.ok) { throw new Error('HTTP ' + res.status); }
                return res.blob();
            })
            .then(function (blob) {
                if (window.createImageBitmap) { return createImageBitmap(blob); }
                return new Promise(function (resolve, reject) {
                    var img = new Image();
                    var u = URL.createObjectURL(blob);
                    img.onload = function () { URL.revokeObjectURL(u); resolve(img); };
                    img.onerror = function () { URL.revokeObjectURL(u); reject(new Error('تعذّر فك ترميز البلاطة')); };
                    img.src = u;
                });
            });
    }
    async function fetchAll(tiles, onProgress) {
        var out = new Array(tiles.length);
        var i = 0, done = 0, failed = 0;
        async function worker() {
            while (true) {
                var idx = i++;
                if (idx >= tiles.length) { return; }
                try { out[idx] = await fetchBitmap(tiles[idx].url); }
                catch (e) { failed++; out[idx] = null; }
                done++;
                if (onProgress) { onProgress(done, tiles.length, failed); }
            }
        }
        var ws = [];
        for (var k = 0; k < 6; k++) { ws.push(worker()); }
        await Promise.all(ws);
        return { bitmaps: out, failed: failed };
    }

    /* ---------------- مُرمِّز GeoTIFF (Baseline RGB 8-bit غير مضغوط) ---------------- */
    function buildGeoTiff(rgb, w, h, originX, originY, pxRes) {
        var N = 16;
        var base = 8 + 2 + 12 * N + 4;  // = 206
        var offBits = base;             // 3 × SHORT = 6
        var offXRes = 216;              // RATIONAL = 8
        var offYRes = 224;              // RATIONAL = 8
        var offScale = 232;             // 3 × DOUBLE = 24
        var offTie = 256;               // 6 × DOUBLE = 48
        var offKeys = 304;              // 20 × SHORT = 40
        var offData = 344;
        var size = offData + w * h * 3;
        var buf = new ArrayBuffer(size);
        var dv = new DataView(buf);
        var u8 = new Uint8Array(buf);
        var le = true;

        dv.setUint16(0, 0x4949, le);    // "II"
        dv.setUint16(2, 42, le);
        dv.setUint32(4, 8, le);         // IFD offset
        dv.setUint16(8, N, le);
        var p = 10;
        function ent(tag, type, count, inlineVal, offset) {
            dv.setUint16(p, tag, le);
            dv.setUint16(p + 2, type, le);
            dv.setUint32(p + 4, count, le);
            if (offset != null) { dv.setUint32(p + 8, offset, le); }
            else { dv.setUint32(p + 8, inlineVal >>> 0, le); }
            p += 12;
        }
        ent(256, 4, 1, w);              // ImageWidth
        ent(257, 4, 1, h);              // ImageLength
        ent(258, 3, 3, 0, offBits);     // BitsPerSample
        ent(259, 3, 1, 1);              // Compression = none
        ent(262, 3, 1, 2);              // Photometric = RGB
        ent(273, 4, 1, 0, offData);     // StripOffsets
        ent(277, 3, 1, 3);              // SamplesPerPixel
        ent(278, 4, 1, h);              // RowsPerStrip
        ent(279, 4, 1, w * h * 3);      // StripByteCounts
        ent(282, 5, 1, 0, offXRes);     // XResolution
        ent(283, 5, 1, 0, offYRes);     // YResolution
        ent(284, 3, 1, 1);              // PlanarConfiguration
        ent(296, 3, 1, 1);              // ResolutionUnit = none
        ent(33550, 12, 3, 0, offScale); // ModelPixelScale
        ent(33922, 12, 6, 0, offTie);   // ModelTiepoint
        ent(34735, 3, 20, 0, offKeys);  // GeoKeyDirectory
        dv.setUint32(p, 0, le);         // next IFD = 0

        dv.setUint16(offBits, 8, le); dv.setUint16(offBits + 2, 8, le); dv.setUint16(offBits + 4, 8, le);
        dv.setUint32(offXRes, 72, le); dv.setUint32(offXRes + 4, 1, le);
        dv.setUint32(offYRes, 72, le); dv.setUint32(offYRes + 4, 1, le);
        dv.setFloat64(offScale, pxRes, le); dv.setFloat64(offScale + 8, pxRes, le); dv.setFloat64(offScale + 16, 0, le);
        var tie = [0, 0, 0, originX, originY, 0];
        for (var t = 0; t < 6; t++) { dv.setFloat64(offTie + t * 8, tie[t], le); }
        var keys = [1, 1, 0, 4, 1024, 0, 1, 1, 1025, 0, 1, 1, 2048, 0, 1, 4326, 3072, 0, 1, 3857];
        for (var g = 0; g < keys.length; g++) { dv.setUint16(offKeys + g * 2, keys[g], le); }
        u8.set(rgb, offData);
        return u8;
    }

    /* ---------------- أدوات ---------------- */
    function pad2(n) { return (n < 10 ? '0' : '') + n; }
    function stamp() {
        var d = new Date();
        return d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()) + '_' + pad2(d.getHours()) + pad2(d.getMinutes()) + pad2(d.getSeconds());
    }
    function saveBlob(blob, name) {
        try { if (window.saveAs) { window.saveAs(blob, name); return; } } catch (e) {}
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url; a.download = name;
        document.body.appendChild(a); a.click();
        setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 500);
    }
    function humanSize(bytes) {
        if (bytes > 1048576) { return (bytes / 1048576).toFixed(1) + ' MB'; }
        if (bytes > 1024) { return (bytes / 1024).toFixed(0) + ' KB'; }
        return bytes + ' B';
    }

    window.GIS.registerModule({
        id: 'imagery',
        icon: 'fa-satellite',
        order: 76,
        mount: function (root, ctx) {
            var map = ctx.map, L = ctx.L;
            if (!map || !L) { root.innerHTML = '<div style="color:#fca5a5">الخريطة غير مهيّأة.</div>'; return; }

            /* --- قائمة المصادر من الخرائط الأساسية --- */
            function subdomainsOf(layer) {
                var s = layer && layer.options && layer.options.subdomains;
                if (!s) { return ''; }
                return Array.isArray(s) ? s.join('') : String(s);
            }
            function sourceList() {
                var arr = [];
                try {
                    Object.keys(baseMaps).forEach(function (k) {
                        arr.push({
                            key: k,
                            url: baseMaps[k].layer._url,
                            maxNative: baseMaps[k].layer.options.maxNativeZoom || baseMaps[k].layer.options.maxZoom || 19,
                            subdomains: (function (l) {
                                var s = l && l.options && l.options.subdomains;
                                if (!s) { return ''; }
                                return Array.isArray(s) ? s.join('') : String(s);
                            })(baseMaps[k].layer),
                            attribution: baseMaps[k].layer.options.attribution || ''
                        });
                    });
                } catch (e) {}
                arr.push({ key: '__custom__', url: '', maxNative: 19, subdomains: '', attribution: 'Custom source' });
                return arr;
            }
            var sources = sourceList();

            root.innerHTML =
                '<div style="margin:0 0 8px;color:var(--txt-dim,#94a3b8);font-size:11.5px;line-height:1.7">' +
                'صدّر صورة جوية عالية الدقة لمنطقة تختارها، مع إسناد جغرافي جاهز لـ QGIS / ArcGIS / AutoCAD — من المصادر المفتوحة (Esri World Imagery، Sentinel-2).' +
                '</div>' +
                '<label style="display:block;font-size:12px;font-weight:700;margin:10px 0 3px;color:var(--txt,#e2e8f0)">مصدر الصور</label>' +
                '<select data-f="src" style="' + U.selectStyle + '">' + U.options(sources.map(function (s) { return { value: s.key, label: s.key === '__custom__' ? '— رابط XYZ مخصّص —' : s.key }; })) + '</select>' +
                '<div data-f="customwrap" style="display:none">' +
                    '<label style="display:block;font-size:12px;font-weight:700;margin:10px 0 3px;color:var(--txt,#e2e8f0)">قالب رابط XYZ</label>' +
                    '<input data-f="custom" type="text" placeholder="https://.../{z}/{x}/{y}.jpg" style="' + U.inputStyle + '">' +
                    '<label style="display:block;font-size:12px;font-weight:700;margin:10px 0 3px;color:var(--txt,#e2e8f0)">أقصى تكبير للمصدر</label>' +
                    '<input data-f="maxzoom" type="number" min="1" max="22" value="19" style="' + U.inputStyle + '">' +
                '</div>' +
                '<label style="display:block;font-size:12px;font-weight:700;margin:12px 0 3px;color:var(--txt,#e2e8f0)">مستوى التكبير (الدقة)</label>' +
                '<select data-f="zoom" style="' + U.selectStyle + '"></select>' +
                '<label style="display:block;font-size:12px;font-weight:700;margin:12px 0 3px;color:var(--txt,#e2e8f0)">شكل منطقة التصدير</label>' +
                '<select data-f="aoimode" style="' + U.selectStyle + '"><option value="rect">مستطيل (Bounding Box)</option><option value="poly">مضلع (Polygon)</option></select>' +
                '<label style="display:flex;align-items:center;gap:8px;font-size:12px;font-weight:700;margin:10px 0 3px;color:var(--txt,#e2e8f0);cursor:pointer;"><input type="checkbox" data-f="incvec"> تضمين بيانات الفيكتور داخل النطاق (GeoJSON + KML)</label>' +
                '<button type="button" data-act="finish" style="' + U.btnStyle + 'display:none;"><i class="fas fa-check"></i> إنهاء المضلع</button>' +
                '<button type="button" data-act="select" style="' + U.btnStyle + '"><i class="fas fa-vector-square"></i> ارسم مستطيل المنطقة على الخريطة</button>' +
                '<button type="button" data-act="export" style="' + U.btnStyle + ';background:#059669"><i class="fas fa-file-export"></i> تصدير الصورة (ZIP + GeoTIFF)</button>' +
                '<div data-f="info" style="margin-top:12px;background:var(--card-bg,#1e293b);border:1px solid var(--card-brd,#334155);border-radius:10px;padding:10px;font-size:12px;line-height:1.9;color:var(--txt,#e2e8f0)">لم تُحدَّد منطقة بعد.</div>' +
                '<div data-f="progress" style="margin-top:12px"></div>' +
                '<div style="margin-top:10px;font-size:11px;color:var(--txt-dim,#94a3b8);line-height:1.7">' +
                'ملاحظة: بعض المصادر (مثل Google) قد تمنع التصدير بسياسة CORS — استخدم Esri World Imagery أو Sentinel-2. الملف يُصدَّر بنظام إحداثيات Web Mercator (EPSG:3857) وهو مدعوم مباشرةً في QGIS/ArcGIS.' +
                '</div>';

            var srcSel = root.querySelector('[data-f="src"]');
            var customWrap = root.querySelector('[data-f="customwrap"]');
            var customInput = root.querySelector('[data-f="custom"]');
            var maxZoomInput = root.querySelector('[data-f="maxzoom"]');
            var zoomSel = root.querySelector('[data-f="zoom"]');
            var infoEl = root.querySelector('[data-f="info"]');
            var progEl = root.querySelector('[data-f="progress"]');
            var selectBtn = root.querySelector('[data-act="select"]');
            var finishBtn = root.querySelector('[data-act="finish"]');
            var aoiModeSel = root.querySelector('[data-f="aoimode"]');
            var incVec = root.querySelector('[data-f="incvec"]');
            var expBtn = root.querySelector('[data-act="export"]');

            var rectLayer = null, polyLayer = null, polyPts = [], polyMarkers = null;
            var drawing = false, startLatLng = null;
            function aoiMode() { return aoiModeSel ? aoiModeSel.value : 'rect'; }

            function bbox() {
                var b = null;
                if (aoiMode() === 'poly' && polyLayer) { b = polyLayer.getBounds(); }
                else if (rectLayer) { b = rectLayer.getBounds(); }
                if (!b || !b.isValid() || (b.getNorth() - b.getSouth()) < 1e-6 || (b.getEast() - b.getWest()) < 1e-6) { return null; }
                return { west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() };
            }
            function clearAoi() {
                if (rectLayer) { try { map.removeLayer(rectLayer); } catch (e) {} rectLayer = null; }
                if (polyLayer) { try { map.removeLayer(polyLayer); } catch (e) {} polyLayer = null; }
                if (polyMarkers) { try { map.removeLayer(polyMarkers); } catch (e) {} polyMarkers = null; }
                polyPts = [];
            }
            function aoiPolygonCoords() {
                if (aoiMode() === 'poly' && polyPts.length >= 3) {
                    var ring = polyPts.map(function (ll) { return [ll.lng, ll.lat]; });
                    if (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1]) { ring.push([ring[0][0], ring[0][1]]); }
                    return [ring];
                }
                var box = bbox();
                if (!box) { return null; }
                return [[[box.west, box.south], [box.east, box.south], [box.east, box.north], [box.west, box.north], [box.west, box.south]]];
            }
            function currentSource() {
                var key = srcSel.value;
                if (key === '__custom__') {
                    return { key: key, url: customInput.value.trim(), subdomains: '', maxNative: Math.max(1, Math.min(22, Number(maxZoomInput.value) || 19)), attribution: 'Custom XYZ' };
                }
                for (var i = 0; i < sources.length; i++) { if (sources[i].key === key) { return sources[i]; } }
                return sources[0];
            }

            function rebuildZoomOptions() {
                var s = currentSource();
                var maxZ = Math.max(1, Math.min(22, s.maxNative || 19));
                var html = '';
                for (var z = maxZ; z >= 1; z--) {
                    html += '<option value="' + z + '">' + z + (z === maxZ ? '  (الأقصى — الأعلى دقة)' : '') + '</option>';
                }
                zoomSel.innerHTML = html;
                var want = Math.max(1, Math.min(maxZ, Math.round(map.getZoom())));
                zoomSel.value = String(want);
            }

            function updateInfo() {
                var box = bbox();
                if (!box) { infoEl.innerHTML = 'لم تُحدَّد منطقة بعد.'; return; }
                var z = Number(zoomSel.value) || Math.round(map.getZoom());
                var tr = rangeFromBox(box, z);
                var tilesX = tr.xMax - tr.xMin + 1, tilesY = tr.yMax - tr.yMin + 1;
                var tiles = tilesX * tilesY;
                var px = tilesX * TILE, py = tilesY * TILE;
                var mo = mercOrigin(tr.xMin, tr.yMin, z);
                var kmW = (box.east - box.west) * 111.32 * Math.cos((box.north + box.south) / 2 * Math.PI / 180);
                var kmH = (box.north - box.south) * 110.574;
                var warn = '';
                if (tiles > MAX_TILES) { warn = '<div style="color:#fca5a5">تحذير: عدد البلاطات (' + tiles + ') كبير — اختر تكبيرًا أقل.</div>'; }
                else if (px * py > MAX_PIXELS) { warn = '<div style="color:#fca5a5">تحذير: الأبعاد (' + px + '×' + py + ') كبيرة جدًا — اختر تكبيرًا أقل.</div>'; }
                infoEl.innerHTML =
                    '<div>الإحداثيات: <b>' + box.south.toFixed(5) + '</b> ، <b>' + box.west.toFixed(5) + '</b> — <b>' + box.north.toFixed(5) + '</b> ، <b>' + box.east.toFixed(5) + '</b></div>' +
                    '<div>الحجم التقريبي: <b>' + kmW.toFixed(2) + ' × ' + kmH.toFixed(2) + ' كم</b></div>' +
                    '<div>البلاطات: <b>' + tilesX + ' × ' + tilesY + ' = ' + tiles + '</b> · البكسلات: <b>' + px + '×' + py + '</b></div>' +
                    '<div>دقة الأرض: <b>' + mo.pxRes.toFixed(3) + ' م/بكسل</b> عند التكبير ' + z + '</div>' + warn;
            }

            /* --- الرسم على الخريطة ---------------- */
            function stopMapEvents() {
                map.off('mousedown', onDown); map.off('mousemove', onMove); map.off('mouseup', onUp); map.off('click', onPolyClick);
            }
            function beginSelect() {
                clearAoi();
                stopMapEvents();
                updateInfo();
                drawing = true;
                map.getContainer().style.cursor = 'crosshair';
                if (aoiMode() === 'poly') {
                    finishBtn.style.display = 'block';
                    map.on('click', onPolyClick);
                    selectBtnLabel(true);
                    ctx.notify('انقر على الخريطة لإضافة نقاط المضلع ثم اضغط «إنهاء المضلع»', 'info', 4600);
                } else {
                    finishBtn.style.display = 'none';
                    map.dragging.disable();
                    map.once('mousedown', onDown);
                    selectBtnLabel(true);
                    ctx.notify('انقر واسحب على الخريطة لتحديد منطقة التصدير', 'info', 4200);
                }
            }
            function onDown(e) {
                if (!drawing) { return; }
                startLatLng = e.latlng;
                rectLayer = L.rectangle(L.latLngBounds(startLatLng, startLatLng), {
                    color: '#38bdf8', weight: 2, fillColor: '#38bdf8', fillOpacity: 0.15, dashArray: '6 4'
                }).addTo(map);
                map.on('mousemove', onMove);
                map.on('mouseup', onUp);
            }
            function onMove(e) {
                if (!drawing || !rectLayer || !startLatLng) { return; }
                rectLayer.setBounds(L.latLngBounds(startLatLng, e.latlng));
            }
            function onUp() {
                map.off('mousemove', onMove);
                map.off('mouseup', onUp);
                drawing = false;
                map.dragging.enable();
                map.getContainer().style.cursor = '';
                selectBtnLabel(false);
                var box = bbox();
                if (!box) {
                    clearAoi();
                    ctx.notify('المستطيل صغير جدًا — أعد المحاولة', 'warn');
                } else {
                    ctx.notify('تم تحديد المنطقة', 'success');
                }
                updateInfo();
            }
            function onPolyClick(e) {
                if (!drawing || aoiMode() !== 'poly') { return; }
                polyPts.push(e.latlng);
                renderPoly();
            }
            function renderPoly() {
                if (polyLayer) { try { map.removeLayer(polyLayer); } catch (e) {} polyLayer = null; }
                if (polyMarkers) { try { map.removeLayer(polyMarkers); } catch (e) {} polyMarkers = null; }
                if (polyPts.length >= 2) {
                    polyLayer = L.polygon(polyPts, { color: '#38bdf8', weight: 2, fillColor: '#38bdf8', fillOpacity: 0.15, dashArray: '6 4' }).addTo(map);
                }
                polyMarkers = L.layerGroup(polyPts.map(function (ll) {
                    return L.circleMarker(ll, { radius: 4, color: '#f59e0b', weight: 2, fillColor: '#fbbf24', fillOpacity: 1 });
                })).addTo(map);
                updateInfo();
            }
            function finishPoly() {
                stopMapEvents();
                drawing = false;
                map.getContainer().style.cursor = '';
                selectBtnLabel(false);
                if (polyPts.length < 3) {
                    ctx.notify('أضف ٣ نقاط على الأقل لإنشاء المضلع', 'warn');
                    return;
                }
                renderPoly();
                ctx.notify('تم إنشاء المضلع', 'success');
            }
            function selectBtnLabel(active) {
                selectBtn.innerHTML = active
                    ? '<i class="fas fa-hand-pointer"></i> جارٍ الرسم…'
                    : (aoiMode() === 'poly' ? '<i class="fas fa-draw-polygon"></i> أضف نقاط المضلع' : '<i class="fas fa-vector-square"></i> ارسم مستطيل المنطقة');
            }

            function setProgress(text, pct) {
                progEl.innerHTML = '<div style="margin-bottom:4px">' + text + '</div>' +
                    '<div style="height:6px;border-radius:999px;background:#1e293b;overflow:hidden"><div style="height:100%;width:' + (pct || 0) + '%;background:linear-gradient(90deg,#0284c7,#22d3ee);transition:width .2s"></div></div>';
            }

            /* ---------------- التصدير ---------------- */
            async function doExport() {
                var box = bbox();
                if (!box) { ctx.notify('حدّد المنطقة أولًا بالرسم على الخريطة', 'error'); return; }
                var src = currentSource();
                if (!src.url) { ctx.notify('أدخل قالب رابط XYZ صالحًا', 'error'); return; }
                var z = Number(zoomSel.value) || Math.round(map.getZoom());
                var tr = rangeFromBox(box, z);
                var tilesX = tr.xMax - tr.xMin + 1, tilesY = tr.yMax - tr.yMin + 1;
                var tiles = tilesX * tilesY;
                if (tiles > MAX_TILES) { ctx.notify('عدد البلاطات كبير جدًا (' + tiles + ') — اختر تكبيرًا أقل', 'error'); return; }
                var W = tilesX * TILE, H = tilesY * TILE;
                if (W * H > MAX_PIXELS) { ctx.notify('أبعاد الصورة كبيرة جدًا (' + W + '×' + H + ') — اختر تكبيرًا أقل', 'error'); return; }

                var list = [];
                for (var yy = tr.yMin; yy <= tr.yMax; yy++) {
                    for (var xx = tr.xMin; xx <= tr.xMax; xx++) {
                        list.push({ col: xx - tr.xMin, row: yy - tr.yMin, url: fillTemplate(src.url, z, xx, yy, src.subdomains, false) });
                    }
                }

                expBtn.disabled = true;
                expBtn.style.opacity = '0.6';
                setProgress('جارٍ تجهيز الملفات…', 0);
                try {
                    var lastPct = -1;
                    var res = await fetchAll(list, function (done, total, failed) {
                        var pct = Math.round(done / total * 100);
                        if (pct - lastPct >= 2 || done === total) {
                            lastPct = pct;
                            setProgress('تنزيل البلاطات… ' + done + '/' + total + (failed ? ' (فشل ' + failed + ')' : ''), pct);
                        }
                    });

                    var canvas = document.createElement('canvas');
                    canvas.width = W; canvas.height = H;
                    var c2 = canvas.getContext('2d');
                    c2.fillStyle = '#0b1220';
                    c2.fillRect(0, 0, W, H);
                    var ok = 0;
                    for (var i = 0; i < list.length; i++) {
                        var bmp = res.bitmaps[i];
                        if (!bmp) { continue; }
                        try { c2.drawImage(bmp, list[i].col * TILE, list[i].row * TILE, TILE, TILE); ok++; } catch (e) {}
                        if (bmp.close) { try { bmp.close(); } catch (e) {} }
                    }
                    if (ok === 0) { throw new Error('تعذّر تحميل أي بلاطة — قد يمنع المصدر طلبات CORS. جرّب Esri World Imagery أو Sentinel-2.'); }

                    setProgress('تجميع الصورة…', 100);
                    var mo = mercOrigin(tr.xMin, tr.yMin, z);
                    var img = c2.getImageData(0, 0, W, H).data;
                    var rgb = new Uint8Array(W * H * 3);
                    for (var q = 0, r = 0; q < img.length; q += 4, r += 3) { rgb[r] = img[q]; rgb[r + 1] = img[q + 1]; rgb[r + 2] = img[q + 2]; }

                    var pngBlob = await new Promise(function (resolve) { canvas.toBlob(resolve, 'image/png'); });
                    var tifBytes = buildGeoTiff(rgb, W, H, mo.originX, mo.originY, mo.pxRes);
                    var pgw = mo.pxRes.toFixed(10) + '\n0.0\n0.0\n-' + mo.pxRes.toFixed(10) + '\n' +
                        (mo.originX + mo.pxRes / 2).toFixed(6) + '\n' + (mo.originY - mo.pxRes / 2).toFixed(6) + '\n';
                    var geojson = {
                        type: 'Feature',
                        properties: { name: 'AOI', zoom: z, source: src.key, crs: 'EPSG:3857', shape: aoiMode() },
                        geometry: { type: 'Polygon', coordinates: aoiPolygonCoords() }
                    };
                    var readme =
                        'Aerial Imagery Export\r\n' +
                        '====================\r\n' +
                        'Source     : ' + src.key + '\r\n' +
                        'Attribution: ' + (src.attribution || 'n/a') + '\r\n' +
                        'Zoom       : ' + z + '\r\n' +
                        'Resolution : ' + mo.pxRes.toFixed(4) + ' m/pixel\r\n' +
                        'Dimensions : ' + W + ' x ' + H + ' px (' + tiles + ' tiles)\r\n' +
                        'CRS        : EPSG:3857 (WGS 84 / Web Mercator)\r\n' +
                        'Exported   : ' + new Date().toISOString() + '\r\n\r\n' +
                        'Files:\r\n' +
                        '  imagery.png  - stitched mosaic image\r\n' +
                        '  imagery.pgw  - world file for imagery.png (Web Mercator metres)\r\n' +
                        '  imagery.prj  - coordinate system (WKT, EPSG:3857)\r\n' +
                        '  imagery.tif  - georeferenced GeoTIFF (EPSG:3857)\r\n' +
                        '  aoi.geojson  - export extent in WGS84 lon/lat\r\n' +
                        '  aoi_features.* - vector features inside the AOI (if included)\r\n';

                    var zip = new window.JSZip();
                    zip.file('imagery.png', pngBlob);
                    zip.file('imagery.pgw', pgw);
                    zip.file('imagery.prj', WKT_3857);
                    zip.file('imagery.tif', tifBytes);
                    zip.file('aoi.geojson', JSON.stringify(geojson, null, 2));

                    if (incVec && incVec.checked && typeof window.collectExportFeatures === 'function') {
                        try {
                            var all = window.collectExportFeatures('visible');
                            var bounds = L.latLngBounds(L.latLng(box.south, box.west), L.latLng(box.north, box.east));
                            var usePoly = (aoiMode() === 'poly' && polyLayer && window.turf);
                            var polyFC = usePoly ? polyLayer.toGeoJSON() : null;
                            var inside = all.filter(function (f) {
                                try {
                                    if (usePoly) { return turf.booleanIntersects(f, polyFC); }
                                    var lay = L.geoJSON(f);
                                    var b = lay.getBounds();
                                    return b.isValid() && b.intersects(bounds);
                                } catch (e) { return false; }
                            });
                            if (inside.length) {
                                zip.file('aoi_features.geojson', JSON.stringify({ type: 'FeatureCollection', features: inside }, null, 2));
                                if (typeof window.geojsonToKML === 'function') {
                                    zip.file('aoi_features.kml', window.geojsonToKML({ type: 'FeatureCollection', features: inside }, 'aoi_features'));
                                }
                            }
                        } catch (e) {}
                    }
                    zip.file('README.txt', readme);
                    setProgress('ضغط الملفات…', 100);
                    var blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
                    saveBlob(blob, 'imagery_export_' + stamp() + '.zip');
                    setProgress('تم التصدير بنجاح (' + humanSize(blob.size) + ')', 100);
                    ctx.notify('تم تصدير الصورة الجوية بنجاح', 'success');
                } catch (e) {
                    setProgress('', 0);
                    ctx.notify('فشل التصدير: ' + (e && e.message ? e.message : e), 'error', 5600);
                } finally {
                    expBtn.disabled = false;
                    expBtn.style.opacity = '1';
                }
            }

            /* ---------------- ربط الأحداث ---------------- */
            srcSel.addEventListener('change', function () {
                customWrap.style.display = (srcSel.value === '__custom__') ? 'block' : 'none';
                rebuildZoomOptions();
                updateInfo();
            });
            customInput.addEventListener('input', updateInfo);
            maxZoomInput.addEventListener('input', function () { rebuildZoomOptions(); updateInfo(); });
            zoomSel.addEventListener('change', updateInfo);
            if (aoiModeSel) { aoiModeSel.addEventListener('change', function () { clearAoi(); selectBtnLabel(false); finishBtn.style.display = 'none'; updateInfo(); }); }
            selectBtn.addEventListener('click', beginSelect);
            finishBtn.addEventListener('click', finishPoly);
            expBtn.addEventListener('click', function () { doExport(); });

            var onMoveEnd = function () { if (rectLayer) { updateInfo(); } };
            map.on('moveend', onMoveEnd);

            rebuildZoomOptions();
            updateInfo();

            this._cleanup = function () {
                try { stopMapEvents(); } catch (e) {}
                try { map.off('moveend', onMoveEnd); } catch (e) {}
                if (drawing) { try { map.dragging.enable(); } catch (e) {} }
                clearAoi();
                try { map.getContainer().style.cursor = ''; } catch (e) {}
            };
        },

        destroy: function () { if (typeof this._cleanup === 'function') { try { this._cleanup(); } catch (e) {} } }
    });
})();
