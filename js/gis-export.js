/* ================================================================
   GIS Module — Download & Export Hub
   مركز التحميل والتصدير: تصدير كل الطبقات بكل الصيغ من مكان واحد،
   مع بوّابات مباشرة لتصدير الصور الجوية، وسحب بيانات OSM العالمية،
   وحفظ المشروع، وتخطيط الطباعة.
   يعتمد على: محرّك التصدير الموحّد في التطبيق (window.exportGeoData /
   window.collectExportFeatures / window.showToast) وطبقة الوحدات GIS.
   ================================================================ */
(function () {
    'use strict';
    if (!window.GIS) { return; }

    var U = window.GIS.util || {};
    var SEL = U.selectStyle || 'width:100%;padding:8px 10px;border-radius:9px;border:1px solid #334155;background:#1e293b;color:#e2e8f0;font-family:inherit;font-size:12.5px;';
    var optHtml = U.options || function (arr) {
        return (arr || []).map(function (o) {
            if (typeof o === 'string') { return '<option value="' + o + '">' + o + '</option>'; }
            return '<option value="' + o.value + '">' + o.label + '</option>';
        }).join('');
    };

    var FORMATS = [
        { id: 'geojson', label: 'GeoJSON', ext: '.geojson', icon: 'fa-file-code',        hint: 'معيار الويب المفتوح' },
        { id: 'kml',     label: 'KML',     ext: '.kml',     icon: 'fa-location-dot',     hint: 'Google Earth' },
        { id: 'kmz',     label: 'KMZ',     ext: '.kmz',     icon: 'fa-file-zipper',      hint: 'KML مضغوط' },
        { id: 'dxf',     label: 'DXF R12', ext: '.dxf',     icon: 'fa-drafting-compass', hint: 'AutoCAD · إحداثيات حقيقية' },
        { id: 'shp',     label: 'Shapefile', ext: '.zip',   icon: 'fa-layer-group',      hint: 'ZIP (shp/shx/dbf/prj)' },
        { id: 'csv',     label: 'CSV',     ext: '.csv',     icon: 'fa-table',            hint: 'جدول Excel / Excel/CSV' }
    ];

    var SOURCES = [
        { value: 'visible',   label: 'الطبقات الظاهرة على الخريطة' },
        { value: 'all',       label: 'كل الطبقات (ظاهرة ومخفية)' },
        { value: 'drawn',     label: 'الرسومات المخصّصة فقط' },
        { value: 'files',     label: 'الملفات المرفوعة فقط' },
        { value: 'locations', label: 'المواقع المحفوظة فقط' },
        { value: 'selection', label: 'التحديد الحالي' }
    ];

    var PORTALS = [
        { mod: 'imagery',       icon: 'fa-satellite',        title: 'تصدير الصور الجوية',   desc: 'صورة جوية عالية الدقة بدقة مرجعية (PNG + GeoTIFF EPSG:3857) لأي منطقة — Esri / Sentinel-2 / OpenAerialMap.' },
        { mod: 'osm-extractor', icon: 'fa-cloud-arrow-down', title: 'سحب البيانات العالمية', desc: 'تنزيل بيانات الشوارع والمباني والمياه وكل شيء من OpenStreetMap بعدّاد Overpass لأي منطقة وتصديرها.' },
        { mod: 'project',       icon: 'fa-box-archive',      title: 'حفظ ملف المشروع',      desc: 'حفظ الجلسة كاملة (طبقات + إعدادات + إحداثيات) في ملف واحد واستعادتها لاحقًا.' },
        { mod: 'print',         icon: 'fa-file-pdf',         title: 'تخطيط الطباعة (PDF)',   desc: 'تكوين لوحة طباعة باحترافية (عنوان / مفتاح / مسطرة / سهم الشمال) وتصديرها PDF.' }
    ];

    /* ---------------- CSS ---------------- */
    function injectCss() {
        if (document.getElementById('gis-export-style')) { return; }
        var css = [
            '.gx-intro{font-size:11.5px;color:var(--txt-dim,#94a3b8);line-height:1.7;margin:0 0 10px;}',
            '.gx-sec{margin:0 0 14px;}',
            '.gx-sec-h{display:flex;align-items:center;gap:8px;font-size:12.5px;font-weight:800;color:var(--txt,#e2e8f0);margin:0 0 8px;}',
            '.gx-ic{width:26px;height:26px;border-radius:8px;display:inline-flex;align-items:center;justify-content:center;background:linear-gradient(135deg,rgba(16,185,129,.22),rgba(2,132,199,.22));color:#7dd3fc;font-size:12px;flex-shrink:0;}',
            '.gx-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;}',
            '.gx-card{display:flex;align-items:center;gap:10px;padding:11px;border-radius:12px;border:1px solid var(--card-brd,#334155);background:linear-gradient(160deg,rgba(255,255,255,.05),rgba(255,255,255,.01));color:var(--txt,#e2e8f0);cursor:pointer;text-align:right;font-family:inherit;transition:.16s;backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);}',
            '.gx-card:hover{border-color:#10b981;transform:translateY(-2px);box-shadow:0 10px 24px rgba(0,0,0,.28);}',
            '.gx-portal .gx-ic2{background:linear-gradient(135deg,rgba(16,185,129,.28),rgba(2,132,199,.28));color:#a7f3d0;}',
            '.gx-b{min-width:0;flex:1;display:flex;flex-direction:column;}',
            '.gx-name{font-weight:800;font-size:12.5px;}',
            '.gx-desc{font-size:10.5px;color:var(--txt-dim,#94a3b8);line-height:1.5;margin-top:2px;}',
            '.gx-count{font-size:12px;font-weight:700;margin:8px 0 2px;}',
            '.gx-out{display:block;width:100%;margin-top:6px;padding:9px;border:1px solid var(--card-brd,#334155);border-radius:10px;background:rgba(255,255,255,.04);color:var(--txt,#e2e8f0);font-family:inherit;font-size:12px;font-weight:700;cursor:pointer;text-align:center;transition:.16s;}',
            '.gx-out:hover{border-color:#10b981;background:rgba(16,185,129,.14);}',
            '.gx-note{font-size:10.5px;color:var(--txt-dim,#94a3b8);line-height:1.7;margin-top:6px;}'
        ].join('');
        var s = document.createElement('style');
        s.id = 'gis-export-style';
        s.textContent = css;
        document.head.appendChild(s);
    }

    function hubHtml() {
        var fmtHtml = FORMATS.map(function (f) {
            return '<button type="button" class="gx-out" data-fmt="' + f.id + '"><i class="fas ' + f.icon + '"></i> ' + f.label + ' ' + f.ext + '</button>';
        }).join('');
        var portalHtml = PORTALS.map(function (p) {
            return '<button type="button" class="gx-card gx-portal" data-mod="' + p.mod + '">' +
                '<span class="gx-ic gx-ic2"><i class="fas ' + p.icon + '"></i></span>' +
                '<span class="gx-b">' +
                    '<span class="gx-name">' + p.title + '</span>' +
                    '<span class="gx-desc">' + p.desc + '</span>' +
                '</span>' +
                '</button>';
        }).join('');

        return '' +
            '<div class="gx-intro"><i class="fas fa-circle-info"></i> صدّر كل ما على الخريطة بصيغة واحدة من مكان واحد، أو انتقل إلى أدوات تصدير متقدّمة (صور جوية، بيانات OSM، مشروع، طباعة).</div>' +

            '<div class="gx-sec">' +
                '<div class="gx-sec-h"><span class="gx-ic"><i class="fas fa-file-export"></i></span> تصدير الطبقات المتجهة</div>' +
                '<label style="display:block;font-size:12px;font-weight:700;margin:0 0 4px;color:var(--txt,#e2e8f0)">المصدر</label>' +
                '<select data-f="src" style="' + SEL + '">' + optHtml(SOURCES) + '</select>' +
                '<div class="gx-count" data-f="count"></div>' +
                '<div class="gx-grid" style="margin-top:6px">' + fmtHtml + '</div>' +
                '<div class="gx-note">تُصدَّر الإحداثيات الحقيقية (WGS84 / WGS84 UTM حسب الصيغة). صيغة Shapefile تُغلّف في ZIP مع ملف الإسناد <b>.prj</b> وترميز UTF-8.</div>' +
                '<button type="button" class="gx-out" data-act="adv" style="border-style:dashed"><i class="fas fa-sliders"></i> خيارات متقدّمة للتصدير…</button>' +
            '</div>' +

            '<div class="gx-sec">' +
                '<div class="gx-sec-h"><span class="gx-ic"><i class="fas fa-arrow-right-arrow-left"></i></span> مصدّرات متخصّصة</div>' +
                '<div class="gx-grid">' + portalHtml + '</div>' +
            '</div>' +

            '<div class="gx-note"><i class="fas fa-shield-halved"></i> كل عمليات التصدير تتم في متصفحك — لا تُرسل بياناتك إلى أي خادم.</div>';
    }

    function getCount(source) {
        try {
            if (typeof window.collectExportFeatures === 'function') { return window.collectExportFeatures(source).length; }
        } catch (e) {}
        return 0;
    }

    function renderHub(container, ctx) {
        if (!container) { return { destroy: function () {} }; }
        injectCss();
        container.innerHTML = hubHtml();

        var srcSel = container.querySelector('[data-f="src"]');
        var countEl = container.querySelector('.gx-count');

        function updateCount() {
            if (!countEl) { return; }
            var n = getCount(srcSel ? srcSel.value : 'visible');
            countEl.textContent = n ? ('المعالم الجاهزة للتصدير: ' + n) : 'لا توجد معالم في هذا المصدر.';
            countEl.style.color = n ? '#34d399' : '#fca5a5';
        }

        async function doExport(fmt) {
            var source = srcSel ? srcSel.value : 'visible';
            var features;
            try { features = window.collectExportFeatures(source); } catch (e) { features = []; }
            if (!features || !features.length) {
                if (window.showToast) { window.showToast('لا توجد معالم في هذا المصدر للتصدير.', 'warn'); }
                if (ctx && ctx.notify) { ctx.notify('لا توجد معالم في هذا المصدر للتصدير.', 'warn'); }
                return;
            }
            var name = 'water-gis-export';
            try { if (window.currentFileName) { name = String(window.currentFileName).replace(/\.[^.]+$/, ''); } } catch (e) {}
            if (source === 'selection') { name += '_selection'; }
            try {
                await window.exportGeoData(features, fmt, { name: name });
                if (window.showToast) { window.showToast('⬇️ تم تصدير ' + features.length + ' معلم بصيغة ' + fmt.toUpperCase(), 'ok'); }
            } catch (e) {
                if (window.showToast) { window.showToast('❌ تعذر التصدير: ' + (e && e.message ? e.message : e), 'err'); }
            }
        }

        if (srcSel) { srcSel.addEventListener('change', updateCount); }

        Array.prototype.forEach.call(container.querySelectorAll('[data-fmt]'), function (b) {
            b.addEventListener('click', function () { doExport(b.getAttribute('data-fmt')); });
        });

        var advBtn = container.querySelector('[data-act="adv"]');
        if (advBtn) {
            advBtn.addEventListener('click', function () {
                try { if (typeof window.openExportModal === 'function') { window.openExportModal(); return; } } catch (e) {}
                if (window.showToast) { window.showToast('الخيارات المتقدّمة غير متاحة في هذه النسخة.', 'warn'); }
            });
        }

        Array.prototype.forEach.call(container.querySelectorAll('[data-mod]'), function (b) {
            b.addEventListener('click', function () {
                var id = b.getAttribute('data-mod');
                if (window.GIS && typeof window.GIS.openModule === 'function') { window.GIS.openModule(id); }
            });
        });

        updateCount();
        var timer = setInterval(function () {
            if (container && container.offsetParent !== null) { updateCount(); }
        }, 3000);

        return {
            destroy: function () { if (timer) { clearInterval(timer); } }
        };
    }

    var _tabView = null;
    var _panelView = null;

    window.GIS.registerModule({
        id: 'export-hub',
        icon: 'fa-file-export',
        title: 'Download & Export',
        group: 'Export & Workspace',
        description: 'One place to export every layer (GeoJSON · KML · KMZ · DXF · Shapefile · CSV) plus direct portals to imagery, OSM extraction, project and print.',
        order: 73,
        init: function (ctx) {
            var pane = document.getElementById('tab-export');
            if (pane) { _tabView = renderHub(pane, ctx); }
        },
        mount: function (root, ctx) {
            _panelView = renderHub(root, ctx);
        },
        destroy: function () {
            if (_panelView && _panelView.destroy) { try { _panelView.destroy(); } catch (e) {} }
            _panelView = null;
        }
    });
})();
