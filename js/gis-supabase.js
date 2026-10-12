/* ================================================================
   GIS Cloud — Supabase backend (تسجيل دخول + مزامنة المشاريع)
   الوحدة العامة: window.GIS.cloud
   يعتمد على: js/gis-core.js (نظام الوحدات) + دالتي window.buildSavePayload / window.applyPayload
   ================================================================ */
(function () {
    'use strict';

    var SDK_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
    var LS_URL = 'gisSbUrl';
    var LS_KEY = 'gisSbKey';

    var SB_URL = localStorage.getItem(LS_URL) || '';
    var SB_KEY = localStorage.getItem(LS_KEY) || '';
    var client = null;
    var sdkPromise = null;
    var user = null;
    var projects = [];
    var projectsLoaded = false;
    var root = null;

    // ---------- helpers ----------
    function configured() { return !!(SB_URL && SB_KEY); }

    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    function fmtDate(iso) {
        try { return new Date(iso).toLocaleString(); } catch (e) { return iso || ''; }
    }

    function errMsg(err) {
        var m = (err && (err.message || err.error_description || err.msg || err.hint)) || String(err || '');
        if (/failed to fetch|networkerror|load failed|fetch failed/i.test(m)) {
            return 'تعذّر الوصول لسيرفر Supabase — راجع Project URL واتصال الإنترنت';
        }
        if (/invalid api key|invalidapikey/i.test(m)) return 'مفتاح anon غير صحيح';
        if (/email not confirmed/i.test(m)) return 'لازم تأكيد البريد أولًا (أو عطّل Confirm email في Supabase)';
        if (/user already registered/i.test(m)) return 'هذا البريد مسجّل بالفعل — جرّب تسجيل الدخول';
        if (/password should be at least/i.test(m)) return 'كلمة المرور قصيرة (٦ أحرف على الأقل)';
        return m;
    }

    function normUrl(u) {
        u = String(u || '').trim().replace(/\s+/g, '');
        if (!u) return '';
        if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
        try { return new URL(u).origin; } catch (e) { return u.replace(/\/+$/, ''); }
    }
    function normKey(k) { return String(k || '').trim().replace(/\s+/g, ''); }
    function validUrl(u) { return /^https:\/\/[a-z0-9][a-z0-9.-]*\.[a-z0-9-]{2,}$/i.test(String(u || '')); }

    function toast(msg, type) {
        if (typeof window.showToast === 'function') { try { window.showToast(msg, type || 'info'); return; } catch (e) {} }
        var t = document.createElement('div');
        t.textContent = msg;
        t.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:9999;background:#0f172a;color:#e2e8f0;border:1px solid #334155;padding:10px 16px;border-radius:10px;font:600 13px system-ui;box-shadow:0 8px 24px rgba(0,0,0,.4)';
        document.body.appendChild(t);
        setTimeout(function () { try { t.remove(); } catch (e) {} }, 4200);
    }

    var CARD = 'background:var(--card-bg,#1e293b);border:1px solid var(--card-brd,#334155);border-radius:10px;padding:12px;';
    var INPUT = 'width:100%;box-sizing:border-box;padding:9px 11px;margin:5px 0;border-radius:9px;border:1px solid var(--card-brd,#334155);background:#0f172a;color:var(--txt,#e2e8f0);font:13px inherit;';
    var BTN = 'display:block;width:100%;box-sizing:border-box;padding:10px 12px;margin:6px 0;border:none;border-radius:9px;background:var(--accent,#0284c7);color:#fff;font:700 13px inherit;cursor:pointer;';
    var BTN2 = 'display:inline-block;padding:7px 11px;margin:3px 3px 3px 0;border:1px solid var(--card-brd,#334155);border-radius:8px;background:transparent;color:var(--txt,#e2e8f0);font:600 12px inherit;cursor:pointer;';
    var HINT = 'font-size:11.5px;line-height:1.85;color:var(--txt-dim,#94a3b8);margin:6px 0;';

    // ---------- sdk ----------
    function loadSDK() {
        if (window.supabase && window.supabase.createClient) return Promise.resolve();
        if (sdkPromise) return sdkPromise;
        sdkPromise = new Promise(function (resolve, reject) {
            var s = document.createElement('script');
            s.src = SDK_URL; s.async = true;
            s.onload = function () {
                if (window.supabase && window.supabase.createClient) resolve();
                else { sdkPromise = null; reject(new Error('Supabase SDK لم يُحمّل بشكل صحيح')); }
            };
            s.onerror = function () { sdkPromise = null; reject(new Error('تعذّر تحميل مكتبة Supabase — تحقّق من الاتصال بالإنترنت')); };
            document.head.appendChild(s);
        });
        return sdkPromise;
    }

    function getClient() {
        if (!configured()) return Promise.reject(new Error('لم تضبط إعدادات Supabase بعد'));
        if (!validUrl(SB_URL)) return Promise.reject(new Error('رابط Supabase غير صالح: «' + SB_URL + '» — أعد إدخاله بالشكل https://xxxx.supabase.co'));
        return loadSDK().then(function () {
            if (!client) {
                client = window.supabase.createClient(SB_URL, SB_KEY, {
                    auth: { persistSession: true, autoRefreshToken: true }
                });
                try {
                    client.auth.onAuthStateChange(function (_evt, session) {
                        user = (session && session.user) ? session.user : null;
                        projectsLoaded = false;
                        render();
                    });
                } catch (e) {}
            }
            return client;
        });
    }

    function setConfig(url, key) {
        SB_URL = normUrl(url);
        SB_KEY = normKey(key);
        localStorage.setItem(LS_URL, SB_URL);
        localStorage.setItem(LS_KEY, SB_KEY);
        client = null;
    }

    function testConnection(url, key) {
        if (!url || !key) { toast('أدخل الرابط والمفتاح أولًا', 'error'); return; }
        toast('جارٍ اختبار الاتصال...', 'info');
        fetch(url.replace(/\/+$/, '') + '/auth/v1/health', { headers: { apikey: key } })
            .then(function (r) {
                if (r.ok || r.status === 200 || r.status === 401) toast('الاتصال بسيرفر Supabase ناجح ✅', 'success');
                else toast('وصل السيرفر لكن الرد: HTTP ' + r.status, 'info');
            })
            .catch(function () { toast('فشل الاتصال ❌ — راجع Project URL والإنترنت', 'error'); });
    }

    // ---------- project stats from live app ----------
    function projectStats() {
        var o = { files: 0, features: 0, customs: 0, locations: 0, measurements: 0 };
        try {
            var up = (typeof uploadedFiles !== 'undefined' ? uploadedFiles : []) || [];
            o.files = up.length;
            up.forEach(function (f) { o.features += (f && f.data && f.data.features ? f.data.features.length : 0); });
        } catch (e) {}
        try { o.customs = ((typeof customFeaturesData !== 'undefined' ? customFeaturesData : []) || []).length; } catch (e) {}
        try { o.locations = ((typeof locations !== 'undefined' ? locations : []) || []).length; } catch (e) {}
        try { o.measurements = ((typeof measurements !== 'undefined' ? measurements : []) || []).length; } catch (e) {}
        o.total = o.features + o.customs + o.locations;
        return o;
    }

    // ---------- auth ----------
    function signIn(email, password) {
        return getClient()
            .then(function (c) { return c.auth.signInWithPassword({ email: email, password: password }); })
            .then(function (r) {
                if (r.error) throw r.error;
                user = r.data && r.data.user ? r.data.user : null;
                projectsLoaded = false;
                toast('تم تسجيل الدخول', 'success');
                render();
            });
    }

    function signUp(email, password) {
        return getClient()
            .then(function (c) { return c.auth.signUp({ email: email, password: password }); })
            .then(function (r) {
                if (r.error) throw r.error;
                if (r.data && r.data.session) {
                    user = r.data.user;
                    projectsLoaded = false;
                    toast('تم إنشاء الحساب وتسجيل الدخول', 'success');
                    render();
                } else {
                    toast('تم إنشاء الحساب — يمكنك تسجيل الدخول الآن', 'success');
                }
                return r.data;
            });
    }

    function signOut() {
        if (!client) { user = null; projects = []; projectsLoaded = false; render(); return Promise.resolve(); }
        return client.auth.signOut().then(function () {
            user = null; projects = []; projectsLoaded = false;
            toast('تم تسجيل الخروج', 'info');
            render();
        });
    }

    // ---------- projects ----------
    function saveProject(name) {
        if (!user) { toast('سجّل الدخول أولًا', 'error'); return Promise.resolve(); }
        if (typeof window.buildSavePayload !== 'function') { toast('دالة حفظ البيانات غير متاحة', 'error'); return Promise.resolve(); }
        var payload;
        try { payload = window.buildSavePayload(); }
        catch (e) { toast('تعذّر تجهيز البيانات: ' + e.message, 'error'); return Promise.resolve(); }
        var row = {
            owner: user.id,
            name: (name || '').trim() || ('مشروع ' + new Date().toLocaleString()),
            data: payload,
            feature_count: projectStats().total
        };
        return getClient()
            .then(function (c) { return c.from('projects').insert(row).select('id').single(); })
            .then(function (r) {
                if (r.error) throw r.error;
                toast('تم حفظ المشروع سحابيًا', 'success');
                projectsLoaded = false;
                return ensureProjects();
            })
            .catch(function (e) { toast('فشل الحفظ: ' + errMsg(e), 'error'); });
    }

    function ensureProjects() {
        if (!user) return Promise.resolve();
        return getClient()
            .then(function (c) { return c.from('projects').select('id,name,updated_at,feature_count').order('updated_at', { ascending: false }); })
            .then(function (r) {
                if (r.error) throw r.error;
                projects = r.data || [];
                projectsLoaded = true;
                fillList();
            })
            .catch(function (e) { toast('فشل جلب المشاريع: ' + errMsg(e), 'error'); });
    }

    function loadProject(id) {
        return getClient()
            .then(function (c) { return c.from('projects').select('name,data').eq('id', id).single(); })
            .then(function (r) {
                if (r.error) throw r.error;
                if (typeof window.applyPayload !== 'function') throw new Error('دالة الاسترجاع غير متاحة');
                if (!confirm('سيتم استبدال البيانات الحالية بمحتوى المشروع «' + (r.data.name || '') + '». متابعة؟')) return;
                window.applyPayload(r.data.data || {});
                toast('تم تحميل المشروع: ' + (r.data.name || ''), 'success');
            })
            .catch(function (e) { toast('فشل التحميل: ' + errMsg(e), 'error'); });
    }

    function deleteProject(id, name) {
        if (!confirm('حذف المشروع «' + (name || '') + '» نهائيًا؟')) return Promise.resolve();
        return getClient()
            .then(function (c) { return c.from('projects').delete().eq('id', id); })
            .then(function (r) {
                if (r.error) throw r.error;
                projects = projects.filter(function (p) { return p.id !== id; });
                toast('تم الحذف', 'info');
                fillList();
            })
            .catch(function (e) { toast('فشل الحذف: ' + errMsg(e), 'error'); });
    }

    // ---------- UI ----------
    function render() {
        if (!root) return;
        if (!configured() || !validUrl(SB_URL)) { root.innerHTML = viewConfig(); wireConfig(); return; }
        if (!user) { root.innerHTML = viewAuth(); wireAuth(); return; }
        root.innerHTML = viewAccount();
        wireAccount();
        wireList();
        if (!projectsLoaded) ensureProjects();
    }

    function viewConfig() {
        var warn = (SB_URL && !validUrl(SB_URL))
            ? '<div style="color:#f87171;font-size:11.5px;margin:4px 0">الإعدادات المحفوظة غير صالحة: «' + esc(SB_URL) + '» — أعد إدخال الرابط الصحيح.</div>'
            : '';
        return '' +
            '<div class="tab-header"><h4><i class="fas fa-cloud"></i> Cloud (Supabase)</h4></div>' +
            '<div style="' + HINT + '">اربط مشروع Supabase الخاص بك: انسخ <b>Project URL</b> و<b>anon public key</b> من ' +
            'Supabase &rarr; Project Settings &rarr; API، ثم اضغط حفظ. رابط الـURL يجب أن يكون بالشكل <b>https://xxxx.supabase.co</b>.</div>' +
            warn +
            '<div style="' + CARD + '">' +
            '<input data-f="url" type="text" placeholder="https://xxxx.supabase.co" value="' + esc(SB_URL) + '" style="' + INPUT + '">' +
            '<input data-f="key" type="text" placeholder="anon public key" value="' + esc(SB_KEY) + '" style="' + INPUT + '">' +
            '<button data-act="savecfg" style="' + BTN + '"><i class="fas fa-link"></i> حفظ الإعدادات</button>' +
            '<button data-act="testconn" style="' + BTN2 + 'width:100%;box-sizing:border-box;padding:9px;text-align:center"><i class="fas fa-plug-circle-check"></i> اختبار الاتصال</button>' +
            '</div>' +
            (configured() ? '<button data-act="reset" style="' + BTN2 + 'margin-top:10px;color:#f87171;border-color:#7f1d1d"><i class="fas fa-trash"></i> مسح الإعدادات</button>' : '');
    }
    function wireConfig() {
        root.querySelector('[data-act="savecfg"]').addEventListener('click', function () {
            var u = root.querySelector('[data-f="url"]').value;
            var k = root.querySelector('[data-f="key"]').value;
            if (!u || !k) { toast('أدخل الرابط والمفتاح', 'error'); return; }
            var nu = normUrl(u);
            if (!validUrl(nu)) { toast('رابط غير صالح: «' + nu + '» — لازم يكون https://xxxx.supabase.co', 'error'); return; }
            setConfig(nu, k);
            toast('تم حفظ إعدادات Supabase', 'success');
            render();
        });
        var test = root.querySelector('[data-act="testconn"]');
        if (test) test.addEventListener('click', function () {
            testConnection(normUrl(root.querySelector('[data-f="url"]').value), normKey(root.querySelector('[data-f="key"]').value));
        });
        var reset = root.querySelector('[data-act="reset"]');
        if (reset) reset.addEventListener('click', function () {
            if (!confirm('مسح إعدادات الربط بمشروع Supabase؟')) return;
            localStorage.removeItem(LS_URL); localStorage.removeItem(LS_KEY);
            SB_URL = ''; SB_KEY = ''; client = null; user = null; projectsLoaded = false;
            render();
        });
    }

    function viewAuth() {
        return '' +
            '<div class="tab-header"><h4><i class="fas fa-cloud"></i> Cloud (Supabase)</h4></div>' +
            '<div style="' + HINT + '">سجّل الدخول لحفظ مشاريعك ومزامنتها سحابيًا.</div>' +
            '<div style="' + CARD + '">' +
            '<input data-f="email" type="email" placeholder="البريد الإلكتروني" style="' + INPUT + '">' +
            '<input data-f="pass" type="password" placeholder="كلمة المرور" style="' + INPUT + '">' +
            '<button data-act="login" style="' + BTN + '"><i class="fas fa-right-to-bracket"></i> تسجيل الدخول</button>' +
            '<button data-act="register" style="' + BTN2 + 'width:100%;box-sizing:border-box;padding:9px;text-align:center"><i class="fas fa-user-plus"></i> إنشاء حساب جديد</button>' +
            '</div>' +
            '<button data-act="forget" style="' + BTN2 + 'margin-top:10px"><i class="fas fa-gear"></i> تغيير إعدادات الربط</button>';
    }
    function wireAuth() {
        function creds() {
            return { e: root.querySelector('[data-f="email"]').value.trim(), p: root.querySelector('[data-f="pass"]').value };
        }
        root.querySelector('[data-act="login"]').addEventListener('click', function () {
            var c = creds();
            if (!c.e || !c.p) { toast('أدخل البريد وكلمة المرور', 'error'); return; }
            signIn(c.e, c.p).catch(function (err) { toast(errMsg(err), 'error'); });
        });
        root.querySelector('[data-act="register"]').addEventListener('click', function () {
            var c = creds();
            if (!c.e || !c.p) { toast('أدخل البريد وكلمة المرور', 'error'); return; }
            signUp(c.e, c.p).catch(function (err) { toast(errMsg(err), 'error'); });
        });
        root.querySelector('[data-act="forget"]').addEventListener('click', function () {
            if (!confirm('مسح إعدادات الربط بمشروع Supabase؟')) return;
            localStorage.removeItem(LS_URL); localStorage.removeItem(LS_KEY);
            SB_URL = ''; SB_KEY = ''; client = null; user = null; projectsLoaded = false;
            render();
        });
    }

    function renderList() {
        if (!projects.length) return '<div style="' + HINT + '">لا توجد مشاريع محفوظة بعد.</div>';
        return projects.map(function (p) {
            return '<div style="' + CARD + 'margin-bottom:8px">' +
                '<div style="font-weight:700;color:var(--txt,#e2e8f0);margin-bottom:2px">' + esc(p.name) + '</div>' +
                '<div style="font-size:11px;color:var(--txt-dim,#94a3b8);margin-bottom:8px">' +
                (p.feature_count || 0) + ' معلم · ' + fmtDate(p.updated_at) + '</div>' +
                '<button data-load="' + esc(p.id) + '" style="' + BTN2 + '"><i class="fas fa-folder-open"></i> تحميل</button>' +
                '<button data-del="' + esc(p.id) + '" data-name="' + esc(p.name) + '" style="' + BTN2 + 'color:#f87171;border-color:#7f1d1d"><i class="fas fa-trash"></i></button>' +
                '</div>';
        }).join('');
    }
    function wireList() {
        var c = root.querySelector('[data-list]');
        if (!c) return;
        Array.prototype.forEach.call(c.querySelectorAll('[data-load]'), function (b) {
            b.addEventListener('click', function () { loadProject(b.getAttribute('data-load')); });
        });
        Array.prototype.forEach.call(c.querySelectorAll('[data-del]'), function (b) {
            b.addEventListener('click', function () { deleteProject(b.getAttribute('data-del'), b.getAttribute('data-name')); });
        });
    }
    function fillList() {
        var c = root.querySelector('[data-list]');
        if (c) { c.innerHTML = renderList(); wireList(); }
    }

    function viewAccount() {
        var s = projectStats();
        return '' +
            '<div class="tab-header"><h4><i class="fas fa-cloud"></i> Cloud (Supabase)</h4></div>' +
            '<div style="' + CARD + 'margin-bottom:8px">' +
            '<div style="font-size:11.5px;color:var(--txt-dim,#94a3b8)">مسجّل الدخول باسم</div>' +
            '<div style="font-weight:700;color:var(--accent,#0284c7);word-break:break-all">' + esc(user.email || user.id) + '</div>' +
            '<button data-act="signout" style="' + BTN2 + 'margin-top:8px"><i class="fas fa-right-from-bracket"></i> تسجيل الخروج</button>' +
            '</div>' +
            '<div style="' + CARD + 'margin-bottom:8px">' +
            '<div style="font-size:11.5px;color:var(--txt-dim,#94a3b8);margin-bottom:4px">البيانات الحالية: ' +
            s.files + ' ملف · ' + s.features + ' معلم · ' + s.customs + ' رسم · ' + s.locations + ' موقع</div>' +
            '<input data-f="name" type="text" placeholder="اسم المشروع" style="' + INPUT + '">' +
            '<button data-act="save" style="' + BTN + '"><i class="fas fa-cloud-arrow-up"></i> حفظ المشروع الحالي سحابيًا</button>' +
            '</div>' +
            '<div class="tab-header"><h4><i class="fas fa-database"></i> مشاريعي السحابية</h4>' +
            '<button data-act="reload" class="add-btn" type="button"><i class="fas fa-rotate"></i> تحديث</button></div>' +
            '<div data-list>' + renderList() + '</div>';
    }
    function wireAccount() {
        var save = root.querySelector('[data-act="save"]');
        if (save) save.addEventListener('click', function () {
            var nm = root.querySelector('[data-f="name"]');
            saveProject(nm ? nm.value : '').catch(function (e) { toast('فشل: ' + errMsg(e), 'error'); });
        });
        var so = root.querySelector('[data-act="signout"]');
        if (so) so.addEventListener('click', function () { signOut(); });
        var reload = root.querySelector('[data-act="reload"]');
        if (reload) reload.addEventListener('click', function () { projectsLoaded = false; ensureProjects(); });
    }

    // ---------- init ----------
    function init() {
        root = document.getElementById('tab-cloud');
        if (!root) return;
        if (configured()) {
            getClient().then(function (c) { return c.auth.getUser(); })
                .then(function (r) { user = (r && r.data) ? r.data.user : null; })
                .catch(function () {})
                .then(render);
        } else {
            render();
        }
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();

    window.GIS = window.GIS || {};
    window.GIS.cloud = {
        configured: configured,
        setConfig: setConfig,
        testConnection: testConnection,
        signIn: signIn,
        signUp: signUp,
        signOut: signOut,
        saveProject: saveProject,
        loadProject: loadProject,
        deleteProject: deleteProject,
        refreshProjects: ensureProjects,
        projectStats: projectStats,
        getUser: function () { return user; },
        render: render
    };
})();
