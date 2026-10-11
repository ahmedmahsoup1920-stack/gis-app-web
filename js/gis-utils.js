/* ================================================================
   GIS Utils — أدوات مشتركة لوحدات Phase 1
   (تُحمَّل بعد سكربت التطبيق الرئيسي، فتصل إلى المتغيّرات العامة مباشرةً)
   ================================================================ */
(function () {
    'use strict';
    if (!window.GIS) { return; }
    if (window.GIS.util) { return; }

    var G = window.GIS;

    function el(tag, attrs, html) {
        var n = document.createElement(tag);
        if (attrs) {
            for (var k in attrs) {
                if (k === 'class') { n.className = attrs[k]; }
                else if (k === 'style') { n.setAttribute('style', attrs[k]); }
                else if (k === 'html') { n.innerHTML = attrs[k]; }
                else if (k.indexOf('on') === 0 && typeof attrs[k] === 'function') { n.addEventListener(k.slice(2), attrs[k]); }
                else { n.setAttribute(k, attrs[k]); }
            }
        }
        if (html != null) { n.innerHTML = html; }
        return n;
    }

    function geomType(f) {
        var t = (f && f.geometry && f.geometry.type) || '';
        if (t === 'Point' || t === 'MultiPoint') { return 'point'; }
        if (t === 'LineString' || t === 'MultiLineString') { return 'line'; }
        if (t === 'Polygon' || t === 'MultiPolygon') { return 'polygon'; }
        return 'other';
    }

    function locationFeature(loc) {
        return {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [Number(loc.lng), Number(loc.lat)] },
            properties: { name: loc.name || '', description: loc.desc || '', category: 'موقع', color: loc.color || '#e63946' }
        };
    }

    /* العناصر المرسومة يدوياً (User Drawings / Active Layer) */
    function drawingsList() {
        var arr = (typeof customFeaturesData !== 'undefined' ? customFeaturesData : null) || [];
        return arr.filter(function (cf) { return cf && cf.geojson && cf.geojson.geometry; }).map(function (cf) {
            return { f: cf.geojson, layer: cf.layer, source: 'custom', id: cf.id, name: cf.name || 'User Drawing' };
        });
    }

    /* العناصر النشطة: التحديد الحالي، وإلا العنصر المرسوم النشط، وإلا كل العناصر المرسومة */
    function activeFeatures() {
        var sel = window.__selectedFeatures;
        if (sel && Array.isArray(sel.features) && sel.features.length) {
            return sel.features.map(function (f) {
                return { f: f, source: 'selected', name: (f.properties && (f.properties.name || f.properties.id)) || 'Selected Feature' };
            });
        }
        var drawings = drawingsList();
        var activeId = window.__activeDrawingId;
        if (activeId != null) {
            var hit = drawings.filter(function (o) { return o.id === activeId; });
            if (hit.length) { return hit; }
        }
        return drawings;
    }

    /* إرجاع عناصر النطاق المختار مع مصدرها واسمها */
    function sourceFeatures(scope) {
        var out = [];
        scope = scope || 'all';
        if (scope === 'active') {
            return activeFeatures();
        }
        if (scope === 'drawings') {
            return drawingsList();
        }
        if (scope === 'selected') {
            var sel = window.__selectedFeatures;
            if (sel && Array.isArray(sel.features)) {
                sel.features.forEach(function (f) { out.push({ f: f, source: 'selected', name: (f.properties && f.properties.name) || 'محدّد' }); });
            }
            return out;
        }
        if (scope === 'file' || scope === 'all') {
            var cd = (typeof currentData !== 'undefined' ? currentData : null);
            if (cd && Array.isArray(cd.features)) {
                var nm = (typeof currentFileName !== 'undefined' && currentFileName) || 'الملف الحالي';
                cd.features.forEach(function (f) { out.push({ f: f, source: 'file', name: nm }); });
            }
        }
        if (scope === 'custom' || scope === 'all') {
            ((typeof customFeaturesData !== 'undefined' ? customFeaturesData : null) || []).forEach(function (cf) {
                if (cf && cf.geojson && cf.geojson.geometry) { out.push({ f: cf.geojson, source: 'custom', name: cf.name || 'عنصر' }); }
            });
        }
        if (scope === 'locations' || scope === 'all') {
            (typeof locations !== 'undefined' ? locations : []).forEach(function (loc) {
                if (loc && !isNaN(loc.lat) && !isNaN(loc.lng)) { out.push({ f: locationFeature(loc), source: 'location', name: loc.name || 'موقع' }); }
            });
        }
        return out;
    }

    function toFeatureCollection(features) {
        return { type: 'FeatureCollection', features: features || [] };
    }

    function fcFromScope(scope) {
        return toFeatureCollection(sourceFeatures(scope).map(function (r) { return r.f; }));
    }

    function numericFields(features) {
        var seen = Object.create(null);
        features.forEach(function (f) {
            var p = (f && f.properties) || {};
            for (var k in p) {
                if (p[k] !== '' && p[k] != null && isFinite(Number(p[k]))) { seen[k] = true; }
            }
        });
        return Object.keys(seen);
    }

    function allFields(features) {
        var seen = Object.create(null), order = [];
        features.forEach(function (f) {
            var p = (f && f.properties) || {};
            for (var k in p) { if (!seen[k]) { seen[k] = true; order.push(k); } }
        });
        return order;
    }

    function center(f) {
        try {
            var b = window.L.geoJSON(f).getBounds();
            if (b && b.isValid()) { var c = b.getCenter(); return [c.lat, c.lng]; }
        } catch (e) {}
        return null;
    }

    function toMeters(value, unit) {
        value = Number(value) || 0;
        if (unit === 'km') { return value * 1000; }
        if (unit === 'ft') { return value * 0.3048; }
        return value;
    }

    function fmtArea(m2) { try { return window.fmtArea ? window.fmtArea(m2) : (Math.round(m2) + ' م²'); } catch (e) { return Math.round(m2) + ' م²'; } }
    function fmtLen(m) { try { return window.fmtLen ? window.fmtLen(m) : (Math.round(m) + ' م'); } catch (e) { return Math.round(m) + ' م'; } }

    /* إنشاء طبقة نتيجة وتُسجَّل كعنصر مخصّص لتظهر في لوحة الطبقات وتدعم الحذف/التكبير */
    function addResultPolygon(name, desc, feature, opts) {
        opts = opts || {};
        var L = window.L;
        var saved = { stroke: drawStyle.stroke, fill: drawStyle.fill, weight: drawStyle.weight, fillOpacity: drawStyle.fillOpacity };
        drawStyle.stroke = opts.color || '#7c3aed';
        drawStyle.fill = opts.fill || opts.color || '#7c3aed';
        drawStyle.weight = opts.weight != null ? opts.weight : 2.5;
        drawStyle.fillOpacity = opts.fillOpacity != null ? opts.fillOpacity : 0.18;
        var layer = L.geoJSON(feature, { pane: 'gisPolyPane' });
        try {
            addCustomFeature('مضلع', name, desc, layer, feature);
        } finally {
            drawStyle.stroke = saved.stroke; drawStyle.fill = saved.fill; drawStyle.weight = saved.weight; drawStyle.fillOpacity = saved.fillOpacity;
        }
        // العنصر المُضاف هو الأخير في customFeaturesData
        var cf = ((typeof customFeaturesData !== 'undefined' ? customFeaturesData : null) || [])[(typeof customFeaturesData !== 'undefined' ? customFeaturesData : null).length - 1];
        if (cf) {
            cf.color = opts.color || '#7c3aed';
            cf.fillColor = opts.fill || opts.color || '#7c3aed';
            cf.moduleResult = true;
            try { applyCustomFeatureStyle(cf); updateTOC(); } catch (e) {}
        }
        return cf;
    }

    function removeCustomById(id) {
        var arr = (typeof customFeaturesData !== 'undefined' ? customFeaturesData : null) || [];
        var i = arr.findIndex(function (c) { return c.id === id; });
        if (i < 0) { return false; }
        var cf = arr[i];
        try { window.customItems.removeLayer(cf.layer); } catch (e) {}
        arr.splice(i, 1);
        try { renderCustomFeatures(); updateTOC(); } catch (e) {}
        return true;
    }

    /* إعادة بناء طبقة عنصر مخصّص من الـ geojson بعد تعديل هندسته ثم إعادة التنسيق */
    function refreshCustomLayer(cf) {
        var L = window.L;
        if (!cf || !cf.geojson || !cf.layer) { return; }
        var gt = geomType(cf.geojson);
        var pane = gt === 'polygon' ? 'gisPolyPane' : (gt === 'line' ? 'gisLinePane' : 'gisPointPane');
        try { window.customItems.removeLayer(cf.layer); } catch (e) {}
        var layer;
        if (gt === 'point') {
            layer = L.geoJSON(cf.geojson, {
                pane: pane,
                pointToLayer: function (f, ll) { return L.circleMarker(ll, { radius: 8, color: cf.color, weight: 2, fillColor: cf.color, fillOpacity: 0.85, pane: pane }); }
            });
        } else {
            layer = L.geoJSON(cf.geojson, { pane: pane });
        }
        cf.layer = layer;
        try { window.customItems.addLayer(layer); } catch (e) {}
        try { if (layer.bindPopup) { layer.bindPopup(window.buildFeaturePopup ? window.buildFeaturePopup(cf.geojson) : (cf.name || ''), { maxWidth: 360, className: 'gis-popup' }); } } catch (e) {}
        try { applyCustomFeatureStyle(cf); } catch (e) {}
        try { renderCustomFeatures(); updateTOC(); } catch (e) {}
    }

    /* صفّ نموذج: label + control */
    function field(label, controlHtml, hint) {
        return '<label style="display:block;font-size:12px;font-weight:700;margin:8px 0 3px;color:var(--txt,#e2e8f0);">' +
            G.escapeHtml(label) + '</label>' + controlHtml +
            (hint ? '<div style="font-size:10.5px;color:var(--txt-dim,#94a3b8);margin-top:3px;">' + hint + '</div>' : '');
    }

    var selectStyle = 'width:100%;padding:8px 10px;border-radius:9px;border:1px solid var(--card-brd,#334155);background:var(--card-bg,#1e293b);color:var(--txt,#e2e8f0);font-family:inherit;font-size:12.5px;';
    var inputStyle = selectStyle;
    var btnStyle = 'margin-top:12px;width:100%;padding:10px;border:none;border-radius:10px;background:var(--accent,#0284c7);color:#fff;font-family:inherit;font-weight:700;font-size:13px;cursor:pointer;';
    var btn2Style = 'padding:8px 12px;border:1px solid var(--card-brd,#334155);border-radius:9px;background:transparent;color:var(--txt,#e2e8f0);font-family:inherit;font-size:12px;cursor:pointer;';

    G.util = {
        el: el,
        geomType: geomType,
        sourceFeatures: sourceFeatures,
        drawingsList: drawingsList,
        activeFeatures: activeFeatures,
        fcFromScope: fcFromScope,
        toFeatureCollection: toFeatureCollection,
        numericFields: numericFields,
        allFields: allFields,
        locationFeature: locationFeature,
        center: center,
        toMeters: toMeters,
        fmtArea: fmtArea,
        fmtLen: fmtLen,
        addResultPolygon: addResultPolygon,
        removeCustomById: removeCustomById,
        refreshCustomLayer: refreshCustomLayer,
        field: field,
        selectStyle: selectStyle,
        inputStyle: inputStyle,
        btnStyle: btnStyle,
        btn2Style: btn2Style,
        options: function (arr) {
            return (arr || []).map(function (o) {
                if (typeof o === 'string') { return '<option value="' + G.escapeHtml(o) + '">' + G.escapeHtml(o) + '</option>'; }
                return '<option value="' + G.escapeHtml(o.value) + '"' + (o.sel ? ' selected' : '') + '>' + G.escapeHtml(o.label) + '</option>';
            }).join('');
        }
    };
})();
