/*! custom-web_slicer 0.1.4 — 웹 슬라이서 화면 불러오기 (이 플러그인 화면 data-wsl-app 이 있을 때만 앱 · 엔진을 받음) · AGPL-3.0-or-later */
(function () {
  'use strict';
  if (window.__wslLoader) return;
  window.__wslLoader = true;
  var API = '/api/plugins/custom-web_slicer', V = '0.1.4', loading = false;
  function app() {
    if (!document.querySelector('[data-wsl-app]')) return;
    if (!document.getElementById('wsl-css')) {
      var l = document.createElement('link'); l.id = 'wsl-css'; l.rel = 'stylesheet'; l.href = API + '/assets/app.css?v=' + V; document.head.appendChild(l);
    }
    if (window.__wslApp) { window.__wslApp.tick(); return; }
    if (loading) return; loading = true;
    var s = document.createElement('script'); s.type = 'module'; s.src = API + '/assets/app.js?v=' + V; s.onerror = function () { loading = false; }; document.head.appendChild(s);
  }
  app();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', app);
  addEventListener('popstate', function () { setTimeout(app, 40); });
  try { new MutationObserver(function () { if (document.querySelector('[data-wsl-app]')) app(); }).observe(document.documentElement, { childList: true, subtree: true }); } catch (e) {}

  // 헤더 메인 메뉴 「웹 슬라이서」 (#wsl-nav · #wsl-nav-mobile) — 설정은 화면 HTML 에 같이 실려 옴: G7Config.appConfig.cextNav["custom-web_slicer"].cfg
  var NAV_ID = 'wsl-nav', NAV_MOB = 'wsl-nav-mobile', NAV_PATH = '/slicer', NAV_LABEL = '웹 슬라이서';
  var NAV_BASE = 'px-3 py-2 text-sm font-medium whitespace-nowrap cursor-pointer rounded-lg transition-colors';
  var NAV_ON = NAV_BASE + ' bg-gray-900 text-white dark:bg-white dark:text-gray-900';
  var NAV_OFF = NAV_BASE + ' text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800';
  var DRAWER_BTN = 'w-full flex items-center justify-start gap-3 px-3 py-2.5 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg cursor-pointer';
  function navCfg() { try { var n = window.G7Config && window.G7Config.appConfig && window.G7Config.appConfig.cextNav; return (n && n['custom-web_slicer'] && n['custom-web_slicer'].cfg) || {}; } catch (e) { return {}; } }
  function navGo(p) {
    try { if (window.G7Core && typeof G7Core.dispatch === 'function') { G7Core.dispatch({ handler: 'navigate', params: { path: p } }); return; } } catch (e) {}
    location.href = p;
  }
  function nav() {
    var c = navCfg(), on = c.enabled !== false && c.menu_enabled !== false, label = c.menu_label || NAV_LABEL, p = c.path || NAV_PATH;
    var here = location.pathname === p || location.pathname.indexOf(p + '/') === 0;
    var btn = document.getElementById(NAV_ID), mob = document.getElementById(NAV_MOB);
    if (!on) { if (btn) btn.remove(); if (mob) mob.remove(); return; }
    var home = document.querySelector('[data-testid="nav-home"]'), row = home && home.parentNode;
    if (row) {
      if (!btn) { btn = document.createElement('button'); btn.id = NAV_ID; btn.type = 'button'; btn.setAttribute('data-testid', 'nav-web-slicer'); btn.addEventListener('click', function (e) { e.preventDefault(); navGo(p); }); }
      if (btn.textContent !== label) btn.textContent = label;
      var cls = here ? NAV_ON : NAV_OFF; if (btn.className !== cls) btn.className = cls;
      if (btn.parentNode !== row) row.appendChild(btn);
    }
    var drawer = document.querySelector('div[class*="inset-y-0"][class*="right-0"][class*="w-80"]');
    if (!drawer || (mob && drawer.contains(mob))) { if (mob) { var l0 = mob.querySelector('[data-wsl-label]'); if (l0 && l0.textContent !== label) l0.textContent = label; } return; }
    var btns = Array.prototype.filter.call(drawer.querySelectorAll('button[class*="px-3 py-2.5"][class*="w-full"]'), function (b) { return !(b.closest && b.closest('[id$="-nav-mobile"]')); });
    if (!btns.length) return;
    var section = btns[btns.length - 1].parentNode;
    if (!section || !section.parentNode) return;
    if (!mob) {
      mob = document.createElement('div'); mob.id = NAV_MOB; mob.className = 'px-4 py-4 border-b border-gray-200 dark:border-gray-700';
      var b = document.createElement('button'); b.type = 'button'; b.className = DRAWER_BTN; b.setAttribute('data-testid', 'mobile-nav-web-slicer');
      var s = document.createElement('span'); s.setAttribute('data-wsl-label', '1'); s.textContent = label; b.appendChild(s); mob.appendChild(b);
      b.addEventListener('click', function () { try { G7Core.state.set({ mobileMenuOpen: false }); } catch (e) {} navGo(p); });
    }
    section.parentNode.insertBefore(mob, section.nextSibling);
  }
  var navT = 0;
  function navSoon() { if (navT) return; navT = setTimeout(function () { navT = 0; try { nav(); } catch (e) {} }, 60); }
  navSoon();
  addEventListener('popstate', navSoon);
  try { new MutationObserver(navSoon).observe(document.documentElement, { childList: true, subtree: true }); } catch (e) {}

  /* ───────── 0.1.4 「🖨️ 프린터로 보내기」 — 다른 확장(출력 검사기 · 맞춤 3D …)의 받기 단추에 data-wsl-send 만 붙이면 옆에 단추
   *  누르면 새 탭에 웹 슬라이서(/slicer?handoff=열쇠)를 열고 → 그 받기 단추를 대신 눌러 → 만든 파일(Blob → <a download>.click)을
   *  내려받지 않고 이 사이트의 IndexedDB 에 잠깐 둠 → 웹 슬라이서가 꺼내 엶 (서버로는 안 감). 웹저장소 연결의 「내 저장소에 저장」과 같은 방식
   *  data-wsl-send="무엇" (말풍선) · data-wsl-send-class="그 확장의 보통 단추 class" (강조 단추를 그대로 베끼지 않게) */
  var SEND_ADMIN_ONLY = true;   // 웹 슬라이서의 「📤 내 프린터로 보내기」가 시험 중이라 관리자에게만 (app.js 와 같이 바꿈)
  var HDB = 'wsl-handoff', HST = 'files', MODEL = /\.(stl|3mf|obj|zip)$/i;
  var armed = null, blobs = {}, me = null;
  function tok() {
    var t = '';
    try { if (window.G7Core && G7Core.api && typeof G7Core.api.getToken === 'function') t = G7Core.api.getToken() || ''; } catch (e) {}
    if (!t) { try { t = localStorage.getItem('auth_token') || ''; } catch (e) {} }
    t = String(t).replace(/^"+|"+$/g, ''); return !t || t === 'undefined' || t === 'null' ? '' : t;
  }
  function who() {
    if (me) return me;
    var h = { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' }, t = tok(); if (t) h.Authorization = 'Bearer ' + t;
    me = fetch(API + '/me', { headers: h, credentials: 'same-origin', cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { return (j && j.data) || {}; }, function () { return {}; });
    return me;
  }
  function put(key, val) {
    return new Promise(function (ok, no) {
      var r = indexedDB.open(HDB, 1);
      r.onupgradeneeded = function () { if (!r.result.objectStoreNames.contains(HST)) r.result.createObjectStore(HST); };
      r.onerror = function () { no(r.error); };
      r.onsuccess = function () { var db = r.result, tx = db.transaction(HST, 'readwrite'); tx.objectStore(HST).put(val, key); tx.oncomplete = function () { db.close(); ok(); }; tx.onerror = function () { db.close(); no(tx.error); }; };
    });
  }
  function disarm() { clearTimeout(armed && armed.t); armed = null; blobs = {}; }
  function fail(o, msg) { put(o.key, { error: msg, at: Date.now() }).catch(function () {}); }
  function take(a) {
    if (!armed || !a || !a.hasAttribute || !a.hasAttribute('download')) return false;
    var href = a.href || '', o = armed, b = blobs[href], name = a.getAttribute('download') || 'model.stl';
    var get = b ? Promise.resolve(b) : /^(data:|blob:)/.test(href) || (href.indexOf(location.origin + '/') === 0) ? fetch(href, { credentials: 'same-origin' }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.blob(); }) : null;
    if (!get) return false;
    disarm(); a.setAttribute('data-cls-taken', '1');   // 부른 쪽이 「저장했어요」 알림을 안 띄우게 (웹저장소 연결과 같은 표시)
    if (!MODEL.test(name)) { fail(o, '「' + name + '」 은(는) 슬라이스할 수 있는 모델 파일(STL · 3MF · OBJ)이 아니에요.'); return true; }
    get.then(function (bl) { return put(o.key, { name: name, blob: bl, at: Date.now(), from: location.pathname }); })
      .then(function () { if (!o.w) location.href = '/slicer?handoff=' + o.key; }, function (e) { fail(o, '파일을 넘기지 못했어요: ' + ((e && e.message) || e)); });
    return true;
  }
  (function hook() {
    try {
      if (!window.URL || !URL.createObjectURL || URL.createObjectURL.__wsl) return;
      var orig = URL.createObjectURL, w = function (o) { var u = orig.apply(this, arguments); try { if (armed && o instanceof Blob) blobs[u] = o; } catch (e) {} return u; };
      w.__wsl = 1; if (orig.__cls) w.__cls = orig.__cls; URL.createObjectURL = w;
      var click = HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click = function () { try { if (armed && take(this)) return; } catch (e) {} return click.apply(this, arguments); };
      document.addEventListener('click', function (e) { try { if (!armed) return; var a = e.target && e.target.closest && e.target.closest('a[download]'); if (a && take(a)) { e.preventDefault(); e.stopPropagation(); } } catch (er) {} }, true);
    } catch (e) {}
  })();
  function sendButtons() {
    var list = document.querySelectorAll('[data-wsl-send]:not([data-wsl-sent])');
    if (!list.length || !window.indexedDB) return;
    var c = navCfg(); if (c.enabled === false) return;
    who().then(function (m) {
      if (!m.logged_in || (SEND_ADMIN_ONLY && !m.admin)) return;
      Array.prototype.forEach.call(document.querySelectorAll('[data-wsl-send]:not([data-wsl-sent])'), function (src) {
        src.setAttribute('data-wsl-sent', '1');
        var b = document.createElement('button'); b.type = 'button'; b.className = (src.getAttribute('data-wsl-send-class') || src.className || '') + ' wsl-send2';
        b.setAttribute('data-cls-skip', '1'); b.setAttribute('data-wsl-btn', '1');
        b.title = (src.getAttribute('data-wsl-send') || '이 파일') + '을(를) 웹 슬라이서에서 슬라이스해 내 프린터로 — 새 탭으로 열려요' + (SEND_ADMIN_ONLY ? ' (🔒 관리자 시험)' : '');
        b.textContent = '🖨️ 프린터로 보내기'; b.disabled = !!src.disabled; b.hidden = !!src.hidden;
        b.addEventListener('click', function (e) {
          e.preventDefault(); e.stopPropagation(); if (src.disabled) return;
          var key = 'h' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8), w = null;
          try { w = window.open('/slicer?handoff=' + key, '_blank'); } catch (er) {}
          disarm(); armed = { key: key, w: w, t: setTimeout(function () { if (armed && armed.key === key) { fail(armed, '파일을 만드는 데 너무 오래 걸렸어요 — 원래 화면에서 받아 끌어 놓아 주세요.'); disarm(); } }, 60000) };
          src.click();
        });
        src.insertAdjacentElement('afterend', b);
        try { new MutationObserver(function () { b.disabled = !!src.disabled; b.hidden = !!src.hidden; }).observe(src, { attributes: true, attributeFilter: ['disabled', 'hidden'] }); } catch (er) {}
      });
    });
  }
  var sendT = 0;
  function sendSoon() { if (sendT) return; sendT = setTimeout(function () { sendT = 0; try { sendButtons(); } catch (e) {} }, 120); }
  sendSoon();
  try { new MutationObserver(sendSoon).observe(document.documentElement, { childList: true, subtree: true }); } catch (e) {}
})();
