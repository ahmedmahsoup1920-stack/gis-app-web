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
        return U.sourceFeatures(scope).map(function (o) {
            return {
                f: o.f, layer: o.layer, source: o.source,
                name: o.name || (o.f.properties && (o.f.properties.name || o.f.properties.id)) || ''
            };
        });
    }

    var OPS = [
        { value: '=', label: 'Equals' },
        { value: '!=', label: 'Not equal' },
        { value: '>', label: 'Greater than' },
        { value: '>=', label: 'Greater or equal' },
        { value: '<', label: 'Less than' },
        { value: '<=', label: 'Less or equal' },
        { value: 'contains', label: 'Contains' },
        { value: 'startswith', label: 'Starts with' },
        { value: 'empty', label: 'Empty' },
        { value: 'notempty', label: 'Not empty' }
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
                  '<button type="button" data-act="add" style="' + U.btn2Style + ';flex:1"><i class="fas fa-plus"></i> Add Condition</button>' +
                  '<button type="button" data-act="clear" style="' + U.btn2Style + ';flex:1"><i class="fas fa-eraser"></i> Clear</button>' +
                '</div>' +
                '<button type="button" data-act="run" style="' + U.btnStyle + '"><i class="fas fa-magnifying-glass"></i> Apply Filter</button>' +
                '<div data-f="out" style="margin-top:12px"></div>';

            var scopeSel = U.el('select', { style: U.selectStyle }, U.options([
                { value: 'active', label: 'Active Layer / Selected Feature (User Drawings)', sel: true },
                { value: 'drawings', label: 'User Drawings Only' },
                { value: 'file', label: 'Current File Layer' },
                { value: 'all', label: 'All Layers' }
            ]));
            var scopeWrap = root.querySelector('[data-f="scope"]');
            scopeWrap.innerHTML = '<label style="font-size:11.5px;color:var(--txt-dim,#94a3b8);display:block;margin-bottom:4px;">Target Layer</label>';
            scopeWrap.appendChild(scopeSel);

            var condsWrap = root.querySelector('[data-f="conds"]');
            var out = root.querySelector('[data-f="out"]');
            var hlGroup = null;

            function currentFields() {
                return U.allFields(targetFeatures(scopeSel.value).map(function (o) { return o.f; }));
            }

            function addCondRow() {
                var fields = currentFields();
                if (!fields.length) { ctx.notify('No fields in the target layer', 'warn'); return; }
                var row = U.el('div', { style: 'display:flex;gap:6px;margin-bottom:6px;align-items:center;' });
                var fSel = U.el('select', { style: U.inputStyle + ';flex:1.2' }, U.options(fields));
                var oSel = U.el('select', { style: U.inputStyle + ';flex:1' }, U.options(OPS));
                var vInput = U.el('input', { type: 'text', placeholder: 'Value', style: U.inputStyle + ';flex:1' });
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
                if (!feats.length) {
                    ctx.notify(scopeSel.value === 'active' ? 'Select a feature on the map to analyze' : 'The target layer is empty', 'warn');
                    return;
                }
                var conds = readConds();
                if (!conds.length) { ctx.notify('Add at least one condition', 'warn'); return; }
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
                    '<div style="font-weight:800;margin-bottom:4px"><i class="fas fa-circle-check" style="color:#22c55e"></i> Filter Result</div>' +
                    '<div style="font-size:12.5px">Matched: <b>' + matched.length + '</b> of ' + feats.length + '</div>' +
                    (matched.length ? '<div style="margin-top:6px;max-height:200px;overflow:auto;border:1px solid var(--card-brd,#334155);border-radius:8px">' + names + '</div>' : '') +
                    '<button type="button" data-act="unhl" style="' + U.btn2Style + ';margin-top:10px;width:100%"><i class="fas fa-eye-slash"></i> Clear Highlight</button>' +
                    '</div>';
                out.querySelector('[data-act="unhl"]').addEventListener('click', function () {
                    clearHl(); window.__selectedFeatures = { type: 'FeatureCollection', features: [] };
                    out.innerHTML = '<div style="color:var(--txt-dim,#94a3b8);font-size:12px">Highlight cleared.</div>';
                });
                ctx.notify('Found ' + matched.length + ' matching feature(s)', 'success');
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
