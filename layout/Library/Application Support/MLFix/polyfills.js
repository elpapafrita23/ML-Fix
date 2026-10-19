// MLFix polyfills + diagnostico. Editable sin recompilar:
// /Library/Application Support/MLFix/polyfills.js (despues haz respring o cierra/abre la app)
(function () {
  'use strict';
  if (window.__MLFIX__) return;
  window.__MLFIX__ = true;

  var DEBUG_OVERLAY = true;   // false = sin panel en pantalla
  var isTop = (window.top === window);
  var errors = 0, applied = [], unsupported = [], failedRes = [];

  // ---------- canal de log ----------
  var overlayLines = [], overlayEl = null;
  function post(kind, msg) {
    msg = String(msg);
    try {
      window.webkit.messageHandlers.MLFixLog.postMessage(
        { k: kind, m: msg, u: String(location.href).slice(0, 120) });
    } catch (e) {}
    if (isTop && DEBUG_OVERLAY) { overlayLines.push('[' + kind + '] ' + msg); drawOverlay(); }
  }
  function drawOverlay() {
    if (!document.body) return;
    if (!overlayEl) {
      overlayEl = document.createElement('div');
      overlayEl.style.cssText = 'position:fixed;left:0;right:0;bottom:0;max-height:35vh;overflow:auto;' +
        'background:rgba(0,0,0,.85);color:#7CFC00;font:10px/1.3 monospace;padding:4px 6px;' +
        'z-index:2147483647;white-space:pre-wrap;word-break:break-all';
      overlayEl.addEventListener('click', function () { overlayEl.style.display = 'none'; });
      document.body.appendChild(overlayEl);
    }
    overlayEl.textContent = 'MLFix (toca para ocultar)\n' + overlayLines.slice(-40).join('\n');
  }
  document.addEventListener('DOMContentLoaded', drawOverlay);

  // ---------- helper para definir polyfills ----------
  function def(obj, name, fn, label) {
    try {
      if (obj && typeof obj[name] === 'undefined') {
        Object.defineProperty(obj, name, { value: fn, writable: true, configurable: true });
        applied.push(label || name);
      }
    } catch (e) { post('error', 'no pude definir ' + (label || name) + ': ' + e); }
  }

  // ---------- polyfills ----------
  def(window, 'globalThis', window, 'globalThis');

  def(String.prototype, 'replaceAll', function (a, b) {
    if (a instanceof RegExp) {
      if (!a.global) throw new TypeError('replaceAll must be called with a global RegExp');
      return this.replace(a, b);
    }
    var esc = String(a).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return this.replace(new RegExp(esc, 'g'), b);
  }, 'String#replaceAll');

  def(String.prototype, 'matchAll', function (re) {
    var s = String(this), out = [], m;
    var r = new RegExp(re instanceof RegExp ? re.source : String(re),
                       (re instanceof RegExp ? re.flags : '').replace('g', '') + 'g');
    while ((m = r.exec(s)) !== null) { out.push(m); if (m[0] === '') r.lastIndex++; }
    return out[Symbol.iterator]();
  }, 'String#matchAll');

  function at(n) { n = Math.trunc(n) || 0; if (n < 0) n += this.length; return this[n]; }
  def(Array.prototype, 'at', at, 'Array#at');
  def(String.prototype, 'at', function (n) { n = Math.trunc(n) || 0; if (n < 0) n += this.length; return this.charAt(n) || undefined; }, 'String#at');

  def(Array.prototype, 'findLast', function (fn, t) {
    for (var i = this.length - 1; i >= 0; i--) if (fn.call(t, this[i], i, this)) return this[i];
  }, 'Array#findLast');
  def(Array.prototype, 'findLastIndex', function (fn, t) {
    for (var i = this.length - 1; i >= 0; i--) if (fn.call(t, this[i], i, this)) return i;
    return -1;
  }, 'Array#findLastIndex');

  def(Object, 'hasOwn', function (o, k) { return Object.prototype.hasOwnProperty.call(o, k); }, 'Object.hasOwn');
  def(Object, 'fromEntries', function (it) {
    var o = {}; for (var e of it) o[e[0]] = e[1]; return o;
  }, 'Object.fromEntries');

  def(Promise, 'allSettled', function (arr) {
    return Promise.all(Array.from(arr, function (p) {
      return Promise.resolve(p).then(
        function (v) { return { status: 'fulfilled', value: v }; },
        function (r) { return { status: 'rejected', reason: r }; });
    }));
  }, 'Promise.allSettled');

  def(Promise, 'any', function (arr) {
    return new Promise(function (res, rej) {
      var errs = [], n = 0, items = Array.from(arr);
      if (!items.length) return rej(new Error('All promises were rejected'));
      items.forEach(function (p, i) {
        Promise.resolve(p).then(res, function (e) {
          errs[i] = e; if (++n === items.length) {
            var err = new Error('All promises were rejected'); err.errors = errs; rej(err);
          }
        });
      });
    });
  }, 'Promise.any');

  def(window, 'queueMicrotask', function (fn) { Promise.resolve().then(fn); }, 'queueMicrotask');

  def(window, 'requestIdleCallback', function (fn) {
    var t = Date.now();
    return setTimeout(function () {
      fn({ didTimeout: false, timeRemaining: function () { return Math.max(0, 50 - (Date.now() - t)); } });
    }, 1);
  }, 'requestIdleCallback');
  def(window, 'cancelIdleCallback', function (id) { clearTimeout(id); }, 'cancelIdleCallback');

  // structuredClone aproximado (JSON): pierde Date/Map/Set/funciones
  def(window, 'structuredClone', function (v) {
    return v === undefined ? v : JSON.parse(JSON.stringify(v));
  }, 'structuredClone (aprox JSON)');

  if (window.crypto) def(window.crypto, 'randomUUID', function () {
    var b = new Uint8Array(16); crypto.getRandomValues(b);
    b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
    var h = Array.prototype.map.call(b, function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
    return h.slice(0,8)+'-'+h.slice(8,12)+'-'+h.slice(12,16)+'-'+h.slice(16,20)+'-'+h.slice(20);
  }, 'crypto.randomUUID');

  // matchMedia().addEventListener (iOS 12 solo tiene addListener)
  try {
    if (window.matchMedia) {
      var mq = window.matchMedia('all');
      if (typeof mq.addEventListener !== 'function') {
        var origMM = window.matchMedia.bind(window);
        window.matchMedia = function (q) {
          var m = origMM(q);
          if (typeof m.addEventListener !== 'function') {
            m.addEventListener = function (t, cb) { if (t === 'change') m.addListener(cb); };
            m.removeEventListener = function (t, cb) { if (t === 'change') m.removeListener(cb); };
          }
          return m;
        };
        applied.push('matchMedia().addEventListener');
      }
    }
  } catch (e) {}

  // stub no-op: evita ReferenceError, no mide nada de verdad
  if (typeof window.ResizeObserver === 'undefined') {
    window.ResizeObserver = function () {};
    window.ResizeObserver.prototype = { observe: function () {}, unobserve: function () {}, disconnect: function () {} };
    applied.push('ResizeObserver (stub no-op)');
  }

  // ---------- sondas de cosas que NO se pueden polyfillear ----------
  function probe(name, code) {
    try { new Function(code); }
    catch (e) {
      if (e instanceof SyntaxError) unsupported.push(name);   // EvalError = CSP, no cuenta
    }
  }
  probe('optional chaining (?.)', 'return ({}).a?.b');
  probe('nullish coalescing (??)', 'return null ?? 1');
  probe('class fields', 'class A { x = 1 }');
  probe('regex lookbehind', 'return /(?<=a)b/');
  probe('regex named groups/unicode props', 'return /\\p{L}/u');
  probe('dynamic import()', 'return import("x")');
  if (typeof BigInt === 'undefined') unsupported.push('BigInt');

  // ---------- captura de errores ----------
  window.addEventListener('error', function (e) {
    errors++;
    var t = e.target;
    if (t && t !== window && (t.src || t.href)) {
      var u = t.src || t.href; failedRes.push(u);
      post('error', 'fallo carga de recurso <' + (t.tagName || '?').toLowerCase() + '> ' + u);
      return;
    }
    var msg = e.message || 'sin mensaje';
    var where = (e.filename || '(sin archivo)') + ':' + (e.lineno || 0) + ':' + (e.colno || 0);
    post('error', msg + ' @ ' + where);
  }, true);

  window.addEventListener('unhandledrejection', function (e) {
    errors++;
    var r = e.reason;
    post('reject', 'Promise rechazada: ' + (r && (r.stack || r.message) || r));
  });

  var origCE = console.error;
  console.error = function () {
    try { post('console.error', Array.prototype.slice.call(arguments).map(String).join(' ').slice(0, 300)); } catch (x) {}
    return origCE && origCE.apply(console, arguments);
  };

  // fetch: loguea fallos y HTTP >= 400
  if (window.fetch) {
    var origFetch = window.fetch;
    window.fetch = function (input) {
      var url = (typeof input === 'string') ? input : (input && input.url) || '?';
      return origFetch.apply(this, arguments).then(function (r) {
        if (r.status >= 400) post('http', r.status + ' ' + url.slice(0, 150));
        return r;
      }, function (err) {
        post('http', 'fetch fallo: ' + url.slice(0, 150) + ' -> ' + err);
        throw err;
      });
    };
  }

  // ---------- reportes ----------
  post('info', 'UA: ' + navigator.userAgent);
  post('info', 'polyfills aplicados: ' + (applied.length ? applied.join(', ') : '(ninguno, ya existian)'));
  if (unsupported.length) {
    post('info', 'SINTAXIS/API NO SOPORTADA (sin polyfill posible): ' + unsupported.join(', ') +
         '. Si el captcha usa esto, esta es la causa raiz.');
  }

  if (isTop) {
    setTimeout(function () {
      var cap = document.querySelectorAll(
        'iframe[src*="captcha"],iframe[src*="hcaptcha"],iframe[src*="arkoselabs"],iframe[src*="recaptcha"],script[src*="captcha"]');
      var srcs = Array.prototype.map.call(cap, function (n) { return n.src; }).join(' | ');
      post('resumen', '10s despues: readyState=' + document.readyState + ', errores=' + errors +
           ', recursos caidos=' + failedRes.length + ', captcha en pagina=' + (cap.length ? srcs : 'no detectado'));
      if (!errors && cap.length) {
        post('resumen', 'Sin errores JS pero captcha colgado: probablemente el proveedor bloquea el navegador por version/UA (no es un fallo de polyfills).');
      }
    }, 10000);
  }
})();
