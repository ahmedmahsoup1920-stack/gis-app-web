/* ================================================================
   GIS Module — معلومات النظام (System Info / Foundation Validator)
   أول وحدة تُبنى على طبقة الأساس للتحقق من سلامة خط الأنابيب:
   سجل الوحدات، الكونтекست، الخريطة، وأبعاد الواجهة القياسية.
   ================================================================ */
(function () {
    'use strict';
    if (!window.GIS) { return; }

    function row(label, value) {
        return '<tr><td style="padding:5px 8px;color:var(--txt-dim,#94a3b8);white-space:nowrap;border-bottom:1px solid var(--card-brd,#334155);">' +
            GIS.escapeHtml(label) +
            '</td><td style="padding:5px 8px;border-bottom:1px solid var(--card-brd,#334155);font-weight:600;">' +
            value + '</td></tr>';
    }

    GIS.registerModule({
        id: 'system-info',
        title: 'معلومات النظام',
        icon: 'fa-circle-info',
        group: 'النظام',
        order: 1,
        description: 'حالة طبقة الأساس، الخريطة، وأبعاد الواجهة.',
        mount: function (container, ctx) {
            var map = ctx.map;
            var hdr = document.querySelector('.header');
            var icon = document.querySelector('.controls button i') || document.querySelector('.advtoc-menu-btn i');
            var hdrH = hdr ? Math.round(hdr.getBoundingClientRect().height) : 0;
            var iconBox = icon ? icon.getBoundingClientRect() : null;
            var iconTxt = iconBox ? (Math.round(iconBox.width) + '×' + Math.round(iconBox.height)) : '—';
            var center = map ? map.getCenter() : null;
            var zoom = map ? map.getZoom() : '—';

            var html =
                '<table style="width:100%;border-collapse:collapse;font-size:12.5px;">' +
                row('إصدار طبقة الأساس', '<span class="gis-mod-badge">' + GIS.escapeHtml(GIS.version) + '</span>') +
                row('عدد الوحدات المسجّلة', String(GIS.listModules().length)) +
                row('ارتفاع الهيدر', hdrH + ' px') +
                row('حجم أيقونة الواجهة', iconTxt + ' px') +
                row('مركز الخريطة', center ? (center.lat.toFixed(5) + ', ' + center.lng.toFixed(5)) : 'غير متاح') +
                row('مستوى التكبير', String(zoom)) +
                row('Leaflet', ctx.L ? (ctx.L.version || 'محمّل') : 'غير محمّل') +
                row('Service Worker', (navigator.serviceWorker && navigator.serviceWorker.controller) ? 'نشِط ✓' : 'غير نشِط') +
                '</table>' +
                '<div style="margin-top:10px;font-size:11.5px;color:var(--txt-dim,#94a3b8);">' +
                'هذه الوحدة مُحمَّلة من ملف مستقل <b>js/gis-system-info.js</b> وتُثبت أن نظام الوحدات يعمل بدون أخطاء.</div>';

            container.innerHTML = html;

            if (ctx.notify) { ctx.notify('تم فتح وحدة معلومات النظام', 'success', 2200); }
        }
    });
})();
