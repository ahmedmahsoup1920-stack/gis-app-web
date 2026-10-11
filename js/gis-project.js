/* ================================================================
   GIS Module 10 — حفظ/تحميل المشروع (.gisproj)
   ================================================================ */
(function () {
    'use strict';
    if (!window.GIS) { return; }
    var U = window.GIS.util;

    function download(name, text, mime) {
        var blob = new Blob([text], { type: mime || 'application/json' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url; a.download = name;
        document.body.appendChild(a); a.click();
        setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 200);
    }

    window.GIS.registerModule({
        id: 'project',
        title: 'المشروع (.gisproj)',
        icon: 'fa-floppy-disk',
        group: 'إدارة المشروع',
        order: 110,
        description: 'حفظ كل الجلسة في ملف واحد وإعادة تحميلها لاحقًا',

        mount: function (root, ctx) {
            root.innerHTML =
                '<div data-f="meta" style="margin-bottom:10px"></div>' +
                '<button type="button" data-act="save" style="' + U.btnStyle + '"><i class="fas fa-download"></i> حفظ المشروع (.gisproj)</button>' +
                '<button type="button" data-act="load" style="' + U.btnStyle + ';background:#475569"><i class="fas fa-upload"></i> تحميل مشروع</button>' +
                '<input data-f="file" type="file" accept=".gisproj,.json,application/json" style="display:none">' +
                '<div style="margin-top:10px;font-size:11.5px;color:var(--txt-dim,#94a3b8)">يشمل المشروع: الملفات، العناصر المخصّصة، المواقع، الأنماط، والقياسات.</div>';

            var meta = root.querySelector('[data-f="meta"]');
            var fileInput = root.querySelector('[data-f="file"]');

            function counts() {
                var files = 0, feats = 0, customs = 0, locs = 0, meas = 0;
                try { files = (typeof uploadedFiles !== 'undefined' ? uploadedFiles : []).length; (typeof uploadedFiles !== 'undefined' ? uploadedFiles : []).forEach(function (f) { feats += (f.data && f.data.features ? f.data.features.length : 0); }); } catch (e) {}
                try { customs = (typeof customFeaturesData !== 'undefined' ? customFeaturesData : []).length; } catch (e) {}
                try { locs = (typeof locations !== 'undefined' ? locations : []).length; } catch (e) {}
                try { meas = (typeof measurements !== 'undefined' ? measurements : []).length; } catch (e) {}
                return { files: files, feats: feats, customs: customs, locs: locs, meas: meas };
            }
            function refresh() {
                var c = counts();
                meta.innerHTML = '<div style="background:var(--card-bg,#1e293b);border:1px solid var(--card-brd,#334155);border-radius:10px;padding:10px;font-size:12.5px;line-height:1.9">' +
                    '<div>ملفات: <b>' + c.files + '</b> (' + c.feats + ' عنصر)</div>' +
                    '<div>عناصر مخصّصة: <b>' + c.customs + '</b></div>' +
                    '<div>مواقع: <b>' + c.locs + '</b></div>' +
                    '<div>قياسات: <b>' + c.meas + '</b></div></div>';
            }
            refresh();
            var poll = setInterval(refresh, 4000);

            root.querySelector('[data-act="save"]').addEventListener('click', function () {
                if (typeof window.buildSavePayload !== 'function') { ctx.notify('دالة الحفظ غير متاحة', 'error'); return; }
                try {
                    var payload = window.buildSavePayload();
                    var project = { __gisproj: true, format: 'gisproj', version: '1.0', app: 'GIS_App_Mobile', savedAt: new Date().toISOString(), data: payload };
                    var name = 'project_' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-') + '.gisproj';
                    download(name, JSON.stringify(project), 'application/json');
                    ctx.notify('تم حفظ المشروع: ' + name, 'success');
                } catch (e) { ctx.notify('فشل الحفظ: ' + e.message, 'error'); }
            });

            root.querySelector('[data-act="load"]').addEventListener('click', function () { fileInput.click(); });
            fileInput.addEventListener('change', function (e) {
                var file = e.target.files && e.target.files[0];
                if (!file) { return; }
                var reader = new FileReader();
                reader.onload = function () {
                    try {
                        var obj = JSON.parse(reader.result);
                        var payload = (obj && obj.__gisproj && obj.data) ? obj.data : obj;
                        if (typeof window.applyPayload !== 'function') { ctx.notify('دالة الاسترجاع غير متاحة', 'error'); return; }
                        if (!confirm('سيتم استبدال البيانات الحالية بمحتوى المشروع. متابعة؟')) { return; }
                        window.applyPayload(payload);
                        refresh();
                        ctx.notify('تم تحميل المشروع بنجاح', 'success');
                    } catch (err) { ctx.notify('ملف مشروع غير صالح: ' + err.message, 'error'); }
                };
                reader.readAsText(file);
                e.target.value = '';
            });

            this._cleanup = function () { clearInterval(poll); };
        },

        destroy: function () { if (typeof this._cleanup === 'function') { try { this._cleanup(); } catch (e) {} } }
    });
})();
