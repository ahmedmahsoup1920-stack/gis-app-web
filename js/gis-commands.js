/* ================================================================
   GIS Module 17 — لوحة الأوامر والمساعدة (Command Palette & Help)
   بحث موحّد يفتح أي وحدة فورًا + دليل مختصر.
   ================================================================ */
(function () {
    'use strict';
    if (!window.GIS) { return; }
    var U = window.GIS.util;

    window.GIS.registerModule({
        id: 'commands',
        title: 'لوحة الأوامر',
        icon: 'fa-terminal',
        group: 'إدارة المشروع',
        order: 170,
        description: 'بحث سريع يفتح أي وحدة، ودليل مختصر للاستخدام',

        mount: function (root, ctx) {
            root.innerHTML =
                '<input data-f="q" type="text" placeholder="ابحث عن وحدة… (مثال: نطاق، مقارنة، طباعة)" style="' + U.inputStyle + '">' +
                '<div data-f="list" style="margin-top:10px;max-height:320px;overflow:auto"></div>' +
                '<div style="margin-top:12px;border-top:1px solid var(--card-brd,#334155);padding-top:10px;font-size:12px;color:var(--txt-dim,#94a3b8);line-height:1.9">' +
                '<div style="font-weight:800;color:var(--txt,#e2e8f0);margin-bottom:4px"><i class="fas fa-circle-info"></i> دليل سريع</div>' +
                '• اختر أي وحدة من التبويب «وحدات» أو ابحث هنا.<br>' +
                '• مفتاح <b>Esc</b> يغلق نافذة الوحدة.<br>' +
                '• نتائج التحليل تُضاف كطبقات في لوحة الطبقات (قابلة للحذف/التصدير).<br>' +
                '• بعض الوحدات تتطلّب وجود بيانات (خطوط/نقاط/مضلعات) في الملف أو العناصر المخصصة.' +
                '</div>';

            function renderList(term) {
                var all = window.GIS.listModules().filter(function (m) { return m.id !== 'commands'; });
                var t = (term || '').trim().toLowerCase();
                var items = all.filter(function (m) {
                    if (!t) { return true; }
                    return (m.title + ' ' + m.description + ' ' + m.id).toLowerCase().indexOf(t) !== -1;
                });
                var host = root.querySelector('[data-f="list"]');
                if (!items.length) { host.innerHTML = '<div style="color:var(--txt-dim,#94a3b8);font-size:12px">لا نتائج مطابقة.</div>'; return; }
                host.innerHTML = items.map(function (m) {
                    return '<button type="button" data-open="' + ctx.escapeHtml(m.id) + '" style="' + U.btn2Style + ';display:flex;align-items:center;gap:10px;width:100%;text-align:right;margin-bottom:6px">' +
                        '<span style="width:30px;height:30px;border-radius:8px;display:flex;align-items:center;justify-content:center;background:rgba(2,132,199,.16);color:#38bdf8"><i class="fas ' + ctx.escapeHtml(m.icon || 'fa-puzzle-piece') + '"></i></span>' +
                        '<span style="flex:1"><span style="display:block;font-weight:700">' + ctx.escapeHtml(m.title) + '</span>' +
                        '<span style="display:block;font-size:11px;color:var(--txt-dim,#94a3b8)">' + ctx.escapeHtml(m.description || '') + '</span></span>' +
                        '</button>';
                }).join('');
                Array.prototype.forEach.call(host.querySelectorAll('[data-open]'), function (btn) {
                    btn.addEventListener('click', function () { window.GIS.openModule(btn.getAttribute('data-open')); });
                });
            }

            root.querySelector('[data-f="q"]').addEventListener('input', function () { renderList(this.value); });
            renderList('');
        }
    });
})();
