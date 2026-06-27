// The in-page brain, injected into each job tab by the driver.
//
// This is a port of extension/filler-core.js's PURE DOM logic (collectFields,
// labelFor, matchOption, fillValue, hasValue, footer detection). Two differences
// from the extension version:
//   1. the bridge call() routes to the CDP binding __aplydBind (Node) instead of
//      chrome.runtime.sendMessage;
//   2. there is no in-page ask popup or agent card — an unknown field is RETURNED
//      to Node as a "needs input" record, never blocking.
//
// Exposed on window.AplydDrive: setJob(ctx), fillStep(), clickFooter(kind),
// footer(). The orchestrator (Node) drives the multi-step loop.
//
// IMPORTANT: this string is eval'd in the page. It must contain no ${...} (would
// interpolate against the outer template literal) and no backticks.
export const INJECTED_SOURCE = String.raw`
(function () {
  if (window.__aplydDriveInstalled) return;
  window.__aplydDriveInstalled = true;

  // ---- Page -> Node bridge (CDP binding) ----------------------------------
  window.__aplydPending = window.__aplydPending || {};
  window.__aplydResolve = function (id, val) {
    var r = window.__aplydPending[id];
    if (r) { delete window.__aplydPending[id]; r(val); }
  };
  var __seq = 0;
  function call(path, method, body) {
    return new Promise(function (resolve) {
      var id = 'b' + (++__seq) + '_' + Date.now();
      window.__aplydPending[id] = resolve;
      try {
        window.__aplydBind(JSON.stringify({ id: id, path: path, method: method, body: body || null }));
      } catch (e) { resolve({ ok: false }); }
    });
  }
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

  var job = { company: '', title: '', jobText: '' };

  // ---- DOM helpers (faithful port of filler-core) -------------------------
  var isVisible = function (el) {
    if (!el || el.disabled) return false;
    var r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    var s = getComputedStyle(el);
    return s.visibility !== 'hidden' && s.display !== 'none';
  };
  function setNativeValue(el, value) {
    var proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    var setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
  }
  function cleanLabel(s) {
    return (s || '')
      .replace(/[\r\n]+/g, ' ')
      .replace(/\*/g, ' ')
      .replace(/\b(required|optional)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  function labelFor(el) {
    var raw = '';
    if (el.id) {
      var l = document.querySelector('label[for="' + (window.CSS && CSS.escape ? CSS.escape(el.id) : el.id) + '"]');
      if (l && l.innerText.trim()) raw = l.innerText.trim();
    }
    if (!raw && el.getAttribute('aria-labelledby')) {
      var l2 = document.getElementById(el.getAttribute('aria-labelledby'));
      if (l2 && l2.innerText.trim()) raw = l2.innerText.trim();
    }
    if (!raw) {
      var grp = el.closest(
        '[data-test-form-element], .fb-dash-form-element, .jobs-easy-apply-form-element, ' +
        '.artdeco-text-input--container, .application-question, .field, fieldset, label, ' +
        '[class*="field"], [class*="question"]'
      );
      if (grp) {
        var l3 = grp.querySelector('label, legend, .label');
        if (l3 && l3.innerText.trim()) raw = l3.innerText.trim();
      }
    }
    if (!raw) raw = el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.getAttribute('name') || '';
    return cleanLabel(raw);
  }
  function optionLabel(r) {
    if (r.id) { var l = document.querySelector('label[for="' + (window.CSS && CSS.escape ? CSS.escape(r.id) : r.id) + '"]'); if (l && l.innerText.trim()) return cleanLabel(l.innerText); }
    var wrap = r.closest('label');
    if (wrap) { var c = wrap.cloneNode(true); c.querySelectorAll('input,select,textarea').forEach(function (n) { n.remove(); }); var s = c.innerText.trim(); if (s) return cleanLabel(s); }
    if (r.getAttribute('aria-label')) return cleanLabel(r.getAttribute('aria-label'));
    var sib = r.nextElementSibling;
    if (sib && sib.innerText && sib.innerText.trim().length <= 40) return cleanLabel(sib.innerText);
    if (r.value && r.value.trim()) return r.value.trim();
    return labelFor(r);
  }
  function groupQuestion(fs, radios) {
    var leg = fs.querySelector('legend');
    if (leg && leg.innerText.trim()) return cleanLabel(leg.innerText);
    var q = labelFor(fs);
    if (q) return q;
    return radios && radios[0] ? labelFor(radios[0]) : '';
  }
  function matchOption(labels, value) {
    var v = String(value || '').trim().toLowerCase();
    if (!v) return -1;
    var norm = function (l) { return String(l || '').trim().toLowerCase(); };
    var i = labels.findIndex(function (l) { return norm(l) === v; });
    if (i >= 0) return i;
    i = labels.findIndex(function (l) { return norm(l).replace(/^[^a-z0-9]+/i, '').startsWith(v); });
    if (i >= 0) return i;
    var re = new RegExp('\\b' + v.replace(/[.*+?^$\{\}()|[\]\\]/g, '\\$&') + '\\b', 'i');
    return labels.findIndex(function (l) { return re.test(l); });
  }

  // Page chrome (site nav / global search / header / footer) is NOT the form.
  function inChrome(el) {
    return !!el.closest('nav, header, footer, [role="navigation"], [role="search"], [role="banner"], '
      + '.global-nav, .search-global-typeahead, [data-test-global-nav], .authentication-outlet, '
      + '.scaffold-layout__sticky-header, .msg-overlay-list-bubble');
  }
  function looksLikeChromeField(el, label) {
    if (inChrome(el)) return true;
    var l = (label || '').toLowerCase();
    var ph = (el.getAttribute('placeholder') || '').toLowerCase();
    var aria = (el.getAttribute('aria-label') || '').toLowerCase();
    return /^search\b|search (jobs|by|for)|global search/.test(l + ' ' + ph + ' ' + aria);
  }

  function collectFields(root) {
    var out = [];
    var seen = new Set();
    root.querySelectorAll('input, select, textarea').forEach(function (el) {
      if (!isVisible(el)) return;
      var type = (el.getAttribute('type') || el.tagName).toLowerCase();
      if (['hidden', 'submit', 'button', 'search', 'password'].indexOf(type) >= 0) return;
      if (looksLikeChromeField(el, labelFor(el))) return; // skip site nav / search boxes

      if (el.tagName === 'SELECT') {
        var options = [].slice.call(el.options).map(function (o) { return o.text.trim(); }).filter(function (t) { return t && !/^(select|choose|please|pick)/i.test(t); });
        out.push({ el: el, kind: 'select', label: labelFor(el), options: options });
      } else if (el.tagName === 'TEXTAREA') {
        out.push({ el: el, kind: 'textarea', label: labelFor(el), options: [] });
      } else if (type === 'radio') {
        var fs = el.closest('fieldset') || el.closest('[role="radiogroup"]') || el.closest('[data-test-form-element]') || el.closest('[class*="question"]');
        var key = fs || el;
        if (seen.has(key)) return; seen.add(key);
        var radios = [].slice.call((fs || root).querySelectorAll('input[type="radio"]')).filter(isVisible)
          .filter(function (r) { return !fs || r.name === el.name; });
        var ropts = radios.map(optionLabel).filter(Boolean);
        out.push({ el: fs || el, kind: 'radio', label: fs ? groupQuestion(fs, radios) : labelFor(el), options: ropts, radios: radios });
      } else if (type === 'checkbox') {
        out.push({ el: el, kind: 'checkbox', label: labelFor(el), options: [] });
      } else if (type === 'file') {
        out.push({ el: el, kind: 'file', label: labelFor(el), options: [] });
      } else {
        out.push({ el: el, kind: 'text', label: labelFor(el), options: [] });
      }
    });
    return out;
  }

  function hasValue(f) {
    if (f.kind === 'radio') return (f.radios || []).some(function (r) { return r.checked; });
    if (f.kind === 'checkbox') return f.el.checked;
    if (f.kind === 'file') return f.el.files && f.el.files.length > 0;
    if (f.kind === 'select') {
      var v = (f.el.value || '').trim();
      if (!v || f.el.selectedIndex <= 0) return false;
      return !/^(select|choose|please|pick)/i.test(v);
    }
    return !!(f.el.value && f.el.value.trim());
  }

  function fillValue(f, value) {
    if (!value) return false;
    if (f.kind === 'select') {
      var opts = [].slice.call(f.el.options);
      var idx = matchOption(opts.map(function (o) { return o.text; }), value);
      if (idx >= 0) { f.el.value = opts[idx].value; f.el.dispatchEvent(new Event('change', { bubbles: true })); return true; }
      return false;
    }
    if (f.kind === 'radio') {
      var radios = f.radios || [];
      var ri = matchOption(radios.map(optionLabel), value);
      if (ri >= 0) { radios[ri].click(); return true; }
      return false;
    }
    setNativeValue(f.el, String(value));
    return true;
  }

  function b64ToFile(b64, name) {
    var bytes = Uint8Array.from(atob(b64), function (c) { return c.charCodeAt(0); });
    return new File([bytes], name || 'document.pdf', { type: 'application/pdf' });
  }
  function setFileOnInput(f, base64, name) {
    var file = b64ToFile(base64, name);
    var dt = new DataTransfer(); dt.items.add(file);
    f.el.files = dt.files;
    f.el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }
  function uploadDefaultDoc(f) {
    var label = (f.label || '').toLowerCase();
    var isCover = label.indexOf('cover') >= 0;
    // Resume upload: let Node pick the best variant for THIS job, then attach it.
    if (!isCover) {
      return call('/resume', 'POST', { title: job.title, jobText: job.jobText }).then(function (res) {
        if (res.ok && res.data && res.data.base64) return setFileOnInput(f, res.data.base64, res.data.fileName);
        return false;
      });
    }
    // Cover-letter file upload: pick a cover-letter-tagged doc.
    return call('/documents', 'GET').then(function (resp) {
      if (!resp.ok || !resp.data || !resp.data.documents || !resp.data.documents.length) return false;
      var docs = resp.data.documents;
      var doc = docs.find(function (d) { return d.isDefault && d.tags.indexOf('cover-letter') >= 0; })
        || docs.find(function (d) { return d.tags.indexOf('cover-letter') >= 0; });
      if (!doc) return false;
      return call('/document?id=' + encodeURIComponent(doc.id), 'GET').then(function (res) {
        if (!res.ok || !res.data || !res.data.base64) return false;
        return setFileOnInput(f, res.data.base64, res.data.fileName);
      });
    });
  }

  // ---- form root + footer detection (generic, no adapters) ----------------
  // count only REAL application fields (ignore nav/search/header chrome)
  function realFieldCount(scope) {
    return [].slice.call(scope.querySelectorAll('input, select, textarea')).filter(function (el) {
      if (!isVisible(el)) return false;
      var t = (el.getAttribute('type') || el.tagName).toLowerCase();
      if (['hidden', 'submit', 'button', 'search', 'password'].indexOf(t) >= 0) return false;
      return !looksLikeChromeField(el, labelFor(el));
    }).length;
  }
  function getFormRoot() {
    // LinkedIn Easy Apply modal first
    var modal = document.querySelector('.jobs-easy-apply-modal, [data-test-modal][role="dialog"], div[role="dialog"]');
    if (modal && isVisible(modal) && realFieldCount(modal) > 0) return modal;
    // otherwise the visible form with the most REAL fields
    var forms = [].slice.call(document.querySelectorAll('form')).filter(isVisible);
    var best = null, bestN = 0;
    forms.forEach(function (fm) { var n = realFieldCount(fm); if (n > bestN) { bestN = n; best = fm; } });
    if (best && bestN > 0) return best;
    // last resort: the whole document, but only if it has real application fields
    if (realFieldCount(document.body) > 0) return document.body;
    return null; // no application form here (e.g. a job description / external-apply page)
  }

  // Open a LinkedIn Easy Apply modal (in-page apply). Returns true if clicked.
  // Does NOT click external "Apply" buttons (those leave the site).
  function clickEasyApply() {
    var btns = [].slice.call(document.querySelectorAll('button, a')).filter(isVisible);
    for (var i = 0; i < btns.length; i++) {
      var t = (btns[i].innerText || btns[i].getAttribute('aria-label') || '').trim();
      if (/easy apply/i.test(t)) { btns[i].click(); return true; }
    }
    return false;
  }

  function buttonsIn(root) {
    var els = [].slice.call(root.querySelectorAll('button, [role="button"], input[type="submit"]'));
    return els.filter(function (b) { return isVisible(b) && !b.disabled; });
  }
  function btnText(b) { return (b.innerText || b.value || b.getAttribute('aria-label') || '').trim().toLowerCase(); }

  // priority: advance via next/review until only a final submit remains
  function detectFooter(root) {
    var btns = buttonsIn(root);
    var find = function (re) { return btns.find(function (b) { return re.test(btnText(b)); }) || null; };
    var next = find(/^(next|continue|save and continue|save & continue|save and next)\b/);
    if (next) return { kind: 'next', el: next };
    var review = find(/\breview\b/);
    if (review) return { kind: 'review', el: review };
    var submit = find(/\b(submit|send)\b/);
    if (submit) return { kind: 'submit', el: submit };
    return { kind: 'none', el: null };
  }

  // ---- the work --------------------------------------------------------------
  // Fill the current visible step once. Returns { filled, needs[], footer, noForm }.
  function fillStep() {
    var root = getFormRoot();
    if (!root) {
      // no form yet — try to open a LinkedIn Easy Apply modal, then retry
      if (clickEasyApply()) return Promise.resolve({ filled: 0, needs: [], footer: 'none', opening: true });
      return Promise.resolve({ filled: 0, needs: [], footer: 'none', noForm: true });
    }
    var fields = collectFields(root);
    var filled = 0;
    var needs = [];
    var i = 0;

    function step() {
      if (i >= fields.length) {
        var ff = detectFooter(root);
        return Promise.resolve({ filled: filled, needs: needs, footer: ff.kind, noForm: false });
      }
      var f = fields[i++];
      if (!f.label || hasValue(f)) return step();

      if (f.kind === 'file') {
        return uploadDefaultDoc(f).then(function (ok) { if (ok) filled++; return step(); });
      }
      if (f.kind === 'checkbox') {
        if (/agree|terms|consent|certify|privacy/i.test(f.label)) { f.el.click(); filled++; }
        return step();
      }
      if (f.kind === 'textarea') {
        return call('/tailor', 'POST', { question: f.label, jobText: job.jobText }).then(function (resp) {
          if (resp.ok && resp.data && resp.data.answer) { fillValue(f, resp.data.answer); filled++; }
          else needs.push({ label: f.label, kind: f.kind, options: f.options, hint: 'Open-ended answer' });
          return step();
        });
      }
      return call('/resolve', 'POST', { label: f.label, type: f.kind, options: f.options }).then(function (resp) {
        var data = resp && resp.data;
        if (resp.ok && data && data.action === 'fill' && fillValue(f, data.value)) { filled++; return step(); }
        needs.push({ label: f.label, kind: f.kind, options: f.options, hint: data && data.hint ? data.hint : null });
        return step();
      });
    }
    return step();
  }

  function clickFooter(kind) {
    var root = getFormRoot();
    if (!root) return false;
    var f = detectFooter(root);
    if (f.el && (!kind || f.kind === kind)) { f.el.click(); return true; }
    return false;
  }
  function footer() {
    var root = getFormRoot();
    if (!root) return 'none';
    return detectFooter(root).kind;
  }

  window.AplydDrive = {
    setJob: function (ctx) { job = { company: (ctx && ctx.company) || '', title: (ctx && ctx.title) || '', jobText: (ctx && ctx.jobText) || '' }; },
    fillStep: fillStep,
    clickFooter: clickFooter,
    footer: footer,
    hasForm: function () { return !!getFormRoot(); },
  };
})();
`;
