/* ================================================================
   GIS Module 02 — مُنشئ الفلترة المرئية (Visual Filter Builder)
   ================================================================ */
(function () {
    'use strict';
    if (!window.GIS) { return; }
    var U = window.GIS.util;

    function norm(s) {
        return String(s == null ? '' : s)
            .replace(/[\u064B-\u0652\u0670\u0640]/g, '')
            .replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي')
            .replace(/ة/g, 'ه').trim().toLowerCase();
    }

    function targetFeatures(scope) {
        var out = [];
        if (scope === 'file' || scope === 'all') {
            var gl = (typeof geoLayer !== 'undefined' ? geoLayer : null);
            if (gl && gl.eachLayer) {
                gl.eachLayer(function (l) {
                    if (l.feature) { out.push({ f: l.feature, layer: l, source: 'file', name: (l.feature.properties && l.feature.properties.name) || '' }); }
                });
            }
        }
        if (scope === 'custom' || scope === 'all') {
            ((typeof customFeaturesData !== 'undefined' ? customFeaturesData : null) || []).forEach(function (cf) {
                if (cf.geojson && cf.geojson.geometry) out.push({ f: cf.geojson, layer: cf.layer, source: 'custom', name: cf.name || '' });
            });
        }
        return out;
    }

    var OPS = [
        { value: '=', label: 'يساوي' },
        { value: '!=', label: 'لا يساوي' },
        { value: '>', label: 'أكبر من' },
        { value: '>=', label: 'أكبر أو يساوي' },
        { value: '<', label: 'أصغر من' },
        { value: '<=', label: 'أصغر أو يساوي' },
        { value: 'contains', label: 'يحتوي على' },
        { value: 'startswith', label: 'يبدأ بـ' },
        { value: 'empty', label: 'فارغ' },
        { value: 'notempty', label: 'غير فارغ' }
    ];

    function evalCond(f, c) {
        var v = (f.properties || {})[c.field], nv = Number(v), nc = Number(c.value);
        var a = String(v == null ? '' : v).trim(), b = String(c.value == null ? '' : c.value).trim();
        switch (c.op) {
            case '=': return a === b || (v !== '' && isFinite(nv) && isFinite(nc) && nv === nc) || norm(a) === norm(b);
            case '!=': return !(a === b || norm(a) === norm(b));
            case '>': return isFinite(nv) && isFinite(nc) && nv > nc;
            case '>=': return isFinite(nv) && isFinite(nc) && nv >= nc;
            case '<': return isFinite(nv) && isFinite(nc) && nv < nc;
            case '<=': return isFinite(nv) && isFinite(nc) && nv <= nc;
            case 'contains': return norm(a).indexOf(norm(b)) >= 0;
            case 'startswith': return norm(a).indexOf(norm(b)) === 0;
            case 'empty': return a === '';
            case 'notempty': return a !== '';
            default: return false;
        }
    }

    window.GIS.registerModule({
        id: 'filter',
        title: 'الفلترة المرئية',
        icon: 'fa-filter',
        group: 'التحليل المكاني',
        order: 20,
        description: 'بناء شروط متعددة لفلترة عناصر الطبقة وإبراز المطابق',

        mount: function (root, ctx) {
            root.innerHTML =
                '<div data-f="scope"></div>' +
                '<div data-f="conds" style="margin-top:10px"></div>' +
                '<div style="display:flex;gap:8px;margin-top:8px">' +
                  '<button type="button" data-act="add" style="' + U.btn2Style + ';flex:1"><i class="fas fa-plus"></i> إضافة شرط</button>' +
                  '<button type="button" data-act="clear" style="' + U.btn2Style + ';flex:1"><i class="fas fa-eraser"></i> مسح</button>' +
                '</div>' +
                '<button type="button" data-act="run" style="' + U.btnStyle + '"><i class="fas fa-magnifying-glass"></i> تطبيق الفلترة</button>' +
                '<div data-f="out" style="margin-top:12px"></div>';

            var scopeSel = U.el('select', { style: U.selectStyle }, U.options([
                { value: 'file', label: 'الملف الحالي', sel: true },
                { value: 'custom', label: 'العناصر المخصصة' },
                { value: 'all', label: 'الكل' }
            ]));
            var scopeWrap = root.querySelector('[data-f="scope"]');
            scopeWrap.innerHTML = '<label style="font-size:11.5px;color:var(--txt-dim,#94a3b8);display:block;margin-bottom:4px;">الطبقة المستهدفة</label>';
            scopeWrap.appendChild(scopeSel);

            var condsWrap = root.querySelector('[data-f="conds"]');
            var out = root.querySelector('[data-f="out"]');
            var hlGroup = null;

            function currentFields() {
                return U.allFields(targetFeatures(scopeSel.value).map(function (o) { return o.f; }));
            }

            function addCondRow() {
                var fields = currentFields();
                if (!fields.length) { ctx.notify('لا توجد حقول في الطبقة المستهدفة', 'warn'); return; }
                var row = U.el('div', { style: 'display:flex;gap:6px;margin-bottom:6px;align-items:center;' });
                var fSel = U.el('select', { style: U.inputStyle + ';flex:1.2' }, U.options(fields));
                var oSel = U.el('select', { style: U.inputStyle + ';flex:1' }, U.options(OPS));
                var vInput = U.el('input', { type: 'text', placeholder: 'القيمة', style: U.inputStyle + ';flex:1' });
                var del = U.el('button', { type: 'button', style: U.btn2Style + ';padding:6px 9px;color:#fca5a5;border-color:#ef4444' }, '<i class="fas fa-times"></i>');
                function syncVal() { var dis = (oSel.value === 'empty' || oSel.value === 'notempty'); vInput.style.display = dis ? 'none' : ''; }
                oSel.addEventListener('change', syncVal);
                del.addEventListener('click', function () { row.remove(); });
                row.appendChild(fSel); row.appendChild(oSel); row.appendChild(vInput); row.appendChild(del);
                condsWrap.appendChild(row);
                syncVal();
            }

            function readConds() {
                return Array.prototype.map.call(condsWrap.children, function (row) {
                    var sels = row.querySelectorAll('select'), inp = row.querySelector('input');
                    return { field: sels[0].value, op: sels[1].value, value: inp ? inp.value : '' };
                });
            }

            function clearHl() {
                if (hlGroup) { try { ctx.map.removeLayer(hlGroup); } catch (e) {} hlGroup = null; }
            }

            function run() {
                var feats = targetFeatures(scopeSel.value);
                if (!feats.length) { ctx.notify('الطبقة فارغة', 'warn'); return; }
                var conds = readConds();
                if (!conds.length) { ctx.notify('أضف شرطًا واحدًا على الأقل', 'warn'); return; }
                var matched = feats.filter(function (o) {
                    return conds.every(function (c) { return evalCond(o.f, c); });
                });
                clearHl();
                var fc = { type: 'FeatureCollection', features: matched.map(function (o) { return o.f; }) };
                hlGroup = ctx.L.geoJSON(fc, {
                    style: { color: '#22d3ee', weight: 4, opacity: 1, fillColor: '#22d3ee', fillOpacity: 0.22 },
                    pointToLayer: function (f, ll) { return ctx.L.circleMarker(ll, { radius: 9, color: '#22d3ee', weight: 3, fillColor: '#22d3ee', fillOpacity: 0.5 }); }
                }).addTo(ctx.map);
                window.__selectedFeatures = { type: 'FeatureCollection', features: matched.map(function (o) { return JSON.parse(JSON.stringify(o.f)); }) };
                try { var b = hlGroup.getBounds(); if (b && b.isValid()) ctx.map.fitBounds(b, { padding: [40, 40], maxZoom: 17 }); } catch (e) {}

                var names = matched.slice(0, 60).map(function (o) {
                    return '<div style="padding:5px 9px;font-size:12px;border-bottom:1px solid rgba(148,163,184,.15)">' +
                        ctx.escapeHtml(o.name || (o.f.properties && (o.f.properties.name || o.f.properties.id)) || 'عنصر') + '</div>';
                }).join('');

                out.innerHTML =
                    '<div style="background:var(--card-bg,#1e293b);border:1px solid var(--card-brd,#334155);border-radius:10px;padding:10px;">' +
                    '<div style="font-weight:800;margin-bottom:4px"><i class="fas fa-circle-check" style="color:#22c55e"></i> نتيجة الفلترة</div>' +
                    '<div style="font-size:12.5px">المطابق: <b>' + matched.length + '</b> من ' + feats.length + '</div>' +
                    (matched.length ? '<div style="margin-top:6px;max-height:200px;overflow:auto;border:1px solid var(--card-brd,#334155);border-radius:8px">' + names + '</div>' : '') +
                    '<button type="button" data-act="unhl" style="' + U.btn2Style + ';margin-top:10px;width:100%"><i class="fas fa-eye-slash"></i> إزالة الإبراز</button>' +
                    '</div>';
                out.querySelector('[data-act="unhl"]').addEventListener('click', function () {
                    clearHl(); window.__selectedFeatures = { type: 'FeatureCollection', features: [] };
                    out.innerHTML = '<div style="color:var(--txt-dim,#94a3b8);font-size:12px">تم إزالة الإبراز.</div>';
                });
                ctx.notify('تم العثور على ' + matched.length + ' عنصر مطابق', 'success');
            }

            addCondRow();
            scopeSel.addEventListener('change', function () { });
            root.querySelector('[data-act="add"]').addEventListener('click', addCondRow);
            root.querySelector('[data-act="clear"]').addEventListener('click', function () { condsWrap.innerHTML = ''; addCondRow(); clearHl(); out.innerHTML = ''; });
            root.querySelector('[data-act="run"]').addEventListener('click', run);
            this._cleanup = clearHl;
        },

        destroy: function () {
            if (typeof this._cleanup === 'function') { try { this._cleanup(); } catch (e) {} }
        }
    });
})();
