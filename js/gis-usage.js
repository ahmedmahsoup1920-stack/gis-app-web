/* ================================================================
   GIS Module — سجل الاستخدام (Usage & Installs)
   يعرض مَن فتح التطبيق / ثبّته / سجّل الدخول، اعتمادًا على جدول
   app_events في Supabase. القراءة متاحة للمستخدمين المسجّلين فقط.
   يرتبط بوحدة السحابة window.GIS.cloud (logEvent / listEvents).
   ================================================================ */
(function () {
    'use strict';
    if (!window.GIS) { return; }

    var LABEL = { install: 'تثبيت', login: 'تسجيل دخول', open: 'فتح التطبيق' };
    var COLOR = { install: '#22c55e', login: '#38bdf8', open: '#a78bfa' };

    function esc(s) { return GIS.escapeHtml(s == null ? '' : s); }
    function fmt(ts) {
        try { return new Date(ts).toLocaleString('ar-EG'); } catch (e) { return String(ts || ''); }
    }
    function badge(ev) {
        var c = COLOR[ev] || '#94a3b8';
        return '<span style="display:inline-block;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:700;color:' + c +
            ';background:' + c + '22;border:1px solid ' + c + '55">' + esc(LABEL[ev] || ev) + '</span>';
    }

    GIS.registerModule({
        id: 'usage',
        title: 'Usage & Installs',
        icon: 'fa-users',
        group: 'System',
        order: 2,
        description: 'Track who opened, installed, and signed into the app (from Supabase app_events).',
        mount: function (container, ctx) {
            container.innerHTML =
                '<div class="tab-header"><h4><i class="fas fa-users"></i> سجل الاستخدام والتثبيت</h4>' +
                '<button data-act="refresh" class="add-btn" type="button"><i class="fas fa-rotate"></i> تحديث</button></div>' +
                '<div data-summary style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px"></div>' +
                '<div data-list style="font-size:12.5px"></div>';

            var summaryEl = container.querySelector('[data-summary]');
            var listEl = container.querySelector('[data-list]');

            function card(label, value, color) {
                return '<div style="flex:1 1 120px;min-width:110px;background:var(--card-bg,#1e293b);border:1px solid var(--card-brd,#334155);' +
                    'border-radius:10px;padding:10px 12px"><div style="font-size:11px;color:var(--txt-dim,#94a3b8)">' + esc(label) + '</div>' +
                    '<div style="font-size:20px;font-weight:800;color:' + (color || 'var(--accent,#0284c7)') + '">' + esc(value) + '</div></div>';
            }

            function render(events) {
                var installs = 0, logins = 0, opens = 0;
                var users = {};
                events.forEach(function (e) {
                    if (e.event === 'install') { installs++; }
                    else if (e.event === 'login') { logins++; }
                    else if (e.event === 'open') { opens++; }
                    if (e.email) { users[e.email] = 1; }
                });
                var uniqueUsers = Object.keys(users).length;

                summaryEl.innerHTML =
                    card('إجمالي الأحداث', events.length) +
                    card('تثبيتات التطبيق', installs, '#22c55e') +
                    card('مرات تسجيل الدخول', logins, '#38bdf8') +
                    card('مستخدمون مختلفون', uniqueUsers, '#a78bfa');

                if (!events.length) {
                    listEl.innerHTML = '<div style="color:var(--txt-dim,#94a3b8);padding:10px">لا توجد أحداث بعد. ' +
                        'تأكد من تشغيل ملف <b>supabase/schema.sql</b> لإنشاء جدول <b>app_events</b>.</div>';
                    return;
                }

                var rows = events.map(function (e) {
                    return '<tr>' +
                        '<td style="padding:6px 8px;border-bottom:1px solid var(--card-brd,#334155);white-space:nowrap">' + esc(fmt(e.created_at)) + '</td>' +
                        '<td style="padding:6px 8px;border-bottom:1px solid var(--card-brd,#334155)">' + badge(e.event) + '</td>' +
                        '<td style="padding:6px 8px;border-bottom:1px solid var(--card-brd,#334155);word-break:break-all">' + esc(e.email || '—') + '</td>' +
                        '<td style="padding:6px 8px;border-bottom:1px solid var(--card-brd,#334155);white-space:nowrap">' + esc(e.device || '—') + '</td>' +
                        '</tr>';
                }).join('');

                listEl.innerHTML =
                    '<div style="overflow:auto;max-height:52vh">' +
                    '<table style="width:100%;border-collapse:collapse">' +
                    '<thead><tr style="text-align:right;color:var(--txt-dim,#94a3b8);font-size:11px">' +
                    '<th style="padding:6px 8px">الوقت</th><th style="padding:6px 8px">الحدث</th>' +
                    '<th style="padding:6px 8px">المستخدم</td>'.replace('</td>', '</th>') +
                    '<th style="padding:6px 8px">الجهاز</th></tr></thead>' +
                    '<tbody>' + rows + '</tbody></table></div>';
            }

            function load() {
                listEl.innerHTML = '<div style="color:var(--txt-dim,#94a3b8);padding:10px"><i class="fas fa-spinner fa-spin"></i> جارٍ التحميل…</div>';
                var C = window.GIS && window.GIS.cloud;
                if (!C || typeof C.listEvents !== 'function') {
                    listEl.innerHTML = '<div style="color:#f87171;padding:10px">تعذّر الوصول لوحدة السحابة.</div>';
                    return;
                }
                C.listEvents(300).then(function (ev) {
                    render(ev || []);
                }).catch(function (e) {
                    var msg = (e && e.message) ? e.message : e;
                    listEl.innerHTML = '<div style="color:#f87171;padding:10px">تعذّر تحميل السجل: ' + esc(msg) +
                        '<br><span style="color:var(--txt-dim,#94a3b8)">تأكد أنك مسجّل الدخول وأن جدول <b>app_events</b> منشأ مع سياسة القراءة.</span></div>';
                });
            }

            var rf = container.querySelector('[data-act="refresh"]');
            if (rf) { rf.addEventListener('click', load); }

            load();
            if (ctx && ctx.notify) { ctx.notify('سجل الاستخدام', 'info', 2000); }
        }
    });
})();
