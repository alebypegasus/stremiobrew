// Supervisor + injector for the Stremio v4 web shell. Runs under node18 (spawned
// by the webOS service launch.js), so modern JS is fine.
//
// Responsibilities:
//   1. Start the Stremio streaming server (server.js) on :11470 if not running.
//   2. Serve http://127.0.0.1:8080/ — fetch the real shell HTML from
//      app.strem.io, inject a <base> (assets load straight from app.strem.io),
//      plus our <style> (TV scaling) and <script> (remote-navigation fixes).
//
// The webview loads :8080; the page runs on our 127.0.0.1 origin so the
// injected JS controls it.
var http = require('http');
var https = require('https');
var net = require('net');
var path = require('path');
var zlib = require('zlib');
var urlmod = require('url');
var spawn = require('child_process').spawn;

var fs = require('fs');
var DIR = __dirname;
var LOADER = '/lib/ld-linux.so.3';
var NODE = path.join(DIR, 'bin', 'node18');
var LIB = path.join(DIR, 'bin', 'lib');
var SERVER = path.join(DIR, 'server.js');

function dbg(m) { try { fs.appendFileSync(path.join(DIR, 'tvserver.log'), new Date().toISOString() + ' ' + m + '\n'); } catch (e) {} }
dbg('tvserver starting, uid=' + (process.getuid ? process.getuid() : '?'));
process.on('uncaughtException', function (e) {
  dbg('UNCAUGHT: ' + (e && e.stack || e));
  if (e && e.code === 'EADDRINUSE') {
    dbg('port 8080 already bound by another tvserver instance, exiting duplicate');
    process.exit(0);
  }
});

// The app icon, as a data URI, so the loading splash logo is 1:1 with the app icon.
var ICON_URI = '';
var iconCandidates = [
  path.join(DIR, '..', '..', 'applications', 'io.strem.tv.beta', 'icon.png'),
  '/media/developer/apps/usr/palm/applications/io.strem.tv.beta/icon.png',
  '/media/cryptofs/apps/usr/palm/applications/io.strem.tv.beta/icon.png',
  path.join(DIR, 'stremio-logo.png')
];
for (var ic = 0; ic < iconCandidates.length; ic++) {
  try {
    if (fs.existsSync(iconCandidates[ic])) {
      ICON_URI = 'data:image/png;base64,' + fs.readFileSync(iconCandidates[ic]).toString('base64');
      break;
    }
  } catch (e) {}
}

// The official Stremio logo mark, served at /logo.png (beta splash + settings/search backdrop).
var LOGO_PNG = null;
try { LOGO_PNG = fs.readFileSync(path.join(DIR, 'stremio-logo.png')); } catch (e) { dbg('logo read failed: ' + e.message); }

var ORIGIN = 'https://app.strem.io';
var SHELL_URL = ORIGIN + '/shell-v4.4/';
var PORT = 8080;
var SERVER_PORT = 11470;

// ---------- start the streaming server ----------
function portUp(port, cb) {
  var s = net.connect(port, '127.0.0.1');
  var done = false;
  function f(v) { if (!done) { done = true; try { s.destroy(); } catch (e) {} cb(v); } }
  s.on('connect', function () { f(true); });
  s.on('error', function () { f(false); });
  setTimeout(function () { f(false); }, 1000);
}

var streamingChild = null;
function startStreamingServer() {
  if (process.platform !== 'linux' || !fs.existsSync(LOADER) || !fs.existsSync(SERVER)) return;
  var env = Object.assign({}, process.env);
  env.HOME = env.HOME || '/home/root';
  env.USER = env.USER || 'root';
  env.FFMPEG_BIN = path.join(DIR, 'bin', 'ffmpeg');
  env.FFPROBE_BIN = path.join(DIR, 'bin', 'ffprobe');
  env.NO_CORS = '1';
  env.BT_MAX_PEERS = '30';
  try {
    dbg('starting streaming server on :' + SERVER_PORT);
    streamingChild = spawn(LOADER, ['--library-path', LIB, NODE, '--max-old-space-size=48', '--optimize_for_size', '--max_semi_space_size=1', SERVER], {
      cwd: DIR, env: env, detached: true, stdio: 'ignore'
    });
    streamingChild.on('error', function (e) { dbg('server.js error: ' + (e && e.message)); });
    streamingChild.on('exit', function (c) { dbg('server.js exit: ' + c); streamingChild = null; });
    streamingChild.unref();
  } catch (e) { dbg('startStreamingServer threw: ' + e.message); }
}

function ensureStreamingServer(cb) {
  portUp(SERVER_PORT, function (up) {
    if (up) { if (cb) cb(true); return; }
    startStreamingServer();
    if (cb) {
      var count = 0;
      var check = function () {
        portUp(SERVER_PORT, function (ready) {
          if (ready) return cb(true);
          count++;
          if (count > 25) return cb(false);
          setTimeout(check, 400);
        });
      };
      setTimeout(check, 400);
    }
  });
}

// O streaming server só é iniciado sob demanda se um stream de torrent (:11470) for chamado,
// poupando ~80MB de memória RAM no arranque e navegação do catálogo.

// ---------- injected CSS / JS ----------
var CSS = [
  '/* Stremio-TV: bigger & more readable */',
  'html { zoom: 1.75; }',
  'body { -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility; }',
  '/* No boxy outline anywhere; cards use a soft white glow, chrome uses a tint. */',
  ':focus { outline: none !important; }',
  '.button:focus, .player-setting:focus, .option:focus, .setting:focus, .heading-button:focus, .link:focus, .login-logout-button:focus { background: rgba(140,92,255,.30) !important; border-radius: 12px !important; }',
  '/* one clean focus ring on the filter dropdowns (was doubling: tint + pill + native) */',
  '.custom-select:focus, .custom-select select:focus, #discover-filters .custom-select:focus, #library-filters .custom-select:focus, select:focus { outline: none !important; background: rgba(255,255,255,.14) !important; box-shadow: 0 0 0 3px #8c5cff !important; }',
  '/* keep the left sidebar tab labels on one line (they were wrapping) */',
  '#navbar .tab, #navbar .tab * { white-space: nowrap !important; }',
  '/* FIX: library/discover poster grid collapsed to one vertical column because',
  '   the cross-origin stylesheet leaves items as display:list-item. Force flow. */',
  '.items.poster, #library-port, #discover-items { display: flex !important; flex-wrap: wrap !important; align-content: flex-start !important; justify-content: flex-start !important; }',
  '.items.poster > *, #library-port > *, #discover-items > * { display: inline-block !important; vertical-align: top; float: none !important; margin: 0 20px 26px 0 !important; }',
  '/* Discover: drop the clipped side info panel and give the poster grid the full width */',
  '#discover .info-box { display: none !important; }',
  '#discover .content { width: 100% !important; flex: 1 1 100% !important; }',
  '/* Addons tab replaced by a single centered Sync button (full cover) */',
  '#tvSync { position: fixed; top: 0; right: 0; bottom: 0; left: 0; display: none; background: #0c0b11; z-index: 2000000; }',
  '#tvSync.show { display: block; }',
  '#tvSyncBox { position: absolute; top: 50%; left: 52%; transform: translate(-50%,-50%); text-align: center; }',
  '#tvSyncBtn { display: inline-block; padding: 24px 64px; font-size: 32px; font-weight: 600; color: #fff; background: #8c5cff; border-radius: 14px; }',
  '#tvSyncBtn.f, #tvSyncBtn:focus { box-shadow: 0 0 0 5px #fff; }',
  '#tvSyncSub { opacity: .6; margin-top: 22px; font-size: 19px; }',
  '/* Logo splash that hides the partial-render flash until the app is ready */',
  '#tvSplash { position: fixed; inset: 0; top:0;left:0;right:0;bottom:0; display: flex; align-items: center; justify-content: center; flex-direction: column; background: #0c0b11; z-index: 2147483647; transition: opacity .5s; }',
  '#tvSplash.hide { opacity: 0; pointer-events: none; }',
  '#tvSplashTxt { margin-top: 26px; font-size: 24px; color: rgba(255,255,255,.7); letter-spacing: .4px; font-family: sans-serif; }',
  '/* loading logo = the real app icon; ~96px CSS so it lands near the webOS launch-icon scale at zoom 1.75 */',
  'img#tvSplashLogo { width: 96px; height: 96px; border-radius: 22px; object-fit: cover; box-shadow: 0 12px 44px rgba(0,0,0,.45); animation: tvb 2.2s ease-in-out infinite; }',
  'div#tvSplashLogo { width: 88px; height: 88px; border-radius: 20px; background: linear-gradient(135deg,#7b5bf5,#a07cff); display:flex; align-items:center; justify-content:center; box-shadow: 0 12px 44px rgba(124,92,255,.45); animation: tvb 2.2s ease-in-out infinite; }',
  'div#tvSplashLogo:after { content:""; width:0;height:0; border-style:solid; border-width: 17px 0 17px 29px; border-color: transparent transparent transparent #fff; margin-left: 7px; }',
  '@keyframes tvb { 0%,100%{transform:scale(1);opacity:.82} 50%{transform:scale(1.06);opacity:1} }',
  '/* navigable custom dropdown (replaces the stuck native picker) */',
  '#tvdd { position:fixed; top:50%; left:50%; transform:translate(-50%,-50%); min-width:380px; max-width:70%; max-height:72%; overflow:auto; background:rgba(20,18,30,.985); border-radius:16px; padding:14px; display:none; z-index:1800000; box-shadow:0 24px 90px rgba(0,0,0,.75); }',
  '#tvdd.show { display:block; }',
  '#tvdd .ddi { padding:16px 26px; font-size:26px; border-radius:10px; white-space:nowrap; }',
  '#tvdd .ddi.f { background:#8c5cff; }',
  '',
  '/* ===== Theme: dark base + rounded poster cards with a smooth focus glow/scale ===== */',
  'body, #app, #board, #discover, #library, #search { background-color:#0c0b11 !important; }',
  '#navbar { background:linear-gradient(90deg,#0c0b11,rgba(12,11,17,.85)) !important; }',
  '#navbar .tab { transition:transform .18s ease, color .18s ease; }',
  '#navbar .tab.selected, #navbar .tab:focus { transform:scale(1.05); }',
  '.items li .thumb, .resume .thumb, #discover-items li .thumb, .meta-items .thumb, .items li img, #discover-items li img, #library-port li img, .board-row li img { border-radius:12px !important; }',
  '/* Focus = a crisp SOLID white ring (no blur -> cheap to draw, no flicker on the weak TV GPU).',
  '   No drop-shadow, no layer promotion, no transition on the ring. A small scale is the only',
  '   animation. This is what was glitching before (34px blur + translateZ layer thrash on each move). */',
  '.items li, #discover-items li, #library-port li, .board-row li, .meta-items > * { border-radius:12px; }',
  '/* Focus = a STATIC crisp white ring on the selected cell. No scale, no transition, no shadow,',
  '   no layer — nothing animates, so nothing can glitch/flicker on this TV GPU. Rock-solid. */',
  '.items li.selected, .items li:focus, #discover-items li.selected, #discover-items li:focus, #library-port li.selected, #library-port li:focus, .board-row li.selected, .board-row li:focus, #board .items li.selected, #board .items li:focus, .meta-items .selected, .meta-items > *:focus { box-shadow:0 0 0 3px #fff !important; z-index:6 !important; }',
  '#discover-filters .custom-select { background:rgba(255,255,255,.08) !important; border-radius:22px !important; padding:6px 20px !important; margin-right:14px !important; }',
  '/* never show the v4 player (we always redirect to our bare player) */',
  '#player { display:none !important; }',
  '',
  '/* ===== QR / phone sign-in ===== */',
  '#tvqr { position:fixed; top:0;left:0;right:0;bottom:0; display:none; align-items:center; justify-content:center; flex-direction:column; background:#0c0b11; z-index:1500000; text-align:center; }',
  '#tvqr.show { display:flex; }',
  '#tvqr h2 { font-size:36px; margin:0 0 10px; font-weight:700; }',
  '#tvqr .sub { opacity:.6; font-size:20px; margin-bottom:30px; }',
  '#tvqr img { width:300px; height:300px; background:#fff; border-radius:18px; padding:14px; box-sizing:border-box; }',
  '#tvqr .code { font-size:44px; letter-spacing:10px; font-weight:700; margin:26px 0 6px; }',
  '#tvqr .codehint { opacity:.5; font-size:17px; }',
  '#tvqr .status { margin-top:26px; opacity:.75; font-size:19px; }',
  '#tvqr .email { margin-top:30px; opacity:.55; font-size:17px; }',
  '#tvqr .email:focus { opacity:1; color:#cdbcff; }'
].join('\n');

// The shell uses window.SpatialNavigation (js-spatial-navigation) but only wired
// its CONTENT areas for TV. We register the chrome + dropdowns as sections so the
// remote can reach them, auto-focus a dropdown when it opens, and make Back close
// open overlays. (Do NOT touch tabindex — this lib focuses elements directly and
// relies on tabindex=-1.) Layout discovered via the inspector:
//   #navbar      = left vertical sidebar (.tab menu items)
//   #topbar      = top bar: #global-search-field (center) + .user-menu (right)
//   #user-panel  = user dropdown (.option items, .login-logout-button)
var JS = [
  '(function(){',
  '  // Logo splash: stays until the shell is FULLY loaded (board content or the',
  '  // login form is present), hiding the partial-render / purple flash.',
  '  (function(){',
  '    var sp = document.getElementById("tvSplash");',
  '    if (!sp) { sp = document.createElement("div"); sp.id = "tvSplash"; sp.innerHTML = "<div id=\\"tvSplashLogo\\"></div>"; (document.body || document.documentElement).appendChild(sp); }',
  '    try { if (sessionStorage.getItem("tvBack")) { sessionStorage.removeItem("tvBack"); var tt = document.createElement("div"); tt.id = "tvSplashTxt"; tt.textContent = "Taking you back to Stremio"; sp.appendChild(tt); } } catch (e) {}', // single "returning" splash
  '    var n = 0, boot = 0;',
  '    // Hide ~1.6s after the app has booted (navbar/login/board present) so the',
  '    // content has painted; hard cap so it can never get stuck.',
  '    function booted(){ return document.querySelector("#navbar .tab, input.email, #board .meta-item, .meta-items"); }',
  '    function check(){',
  '      n++;',
  '      if (!boot && booted()) boot = n;',
  '      if ((boot && n - boot >= 3) || n > 100) { sp.className = "hide"; setTimeout(function(){ if (sp.parentNode) sp.parentNode.removeChild(sp); }, 500); }',
  '      else setTimeout(check, 200);',
  '    }',
  '    check();',
  '  })();',
  '  function root(){ try { return angular.element(document.body).scope().$root; } catch (e) { return null; } }',
  '  var SN = null, added = {};',
  '  // Add a section + make it focusable ONCE (re-running churns focus = jitter).',
  '  function ensure(id, selector, cfg){',
  '    if (added[id] || !document.querySelector(selector)) return;',
  '    try {',
  '      var o = { id: id, selector: selector, enterTo: "last-focused", straightOnly: false };',
  '      if (cfg) for (var k in cfg) o[k] = cfg[k];',
  '      SN.add(o); SN.makeFocusable(id); added[id] = true;',
  '    } catch (e) {}',
  '  }',
  '  // The search box is an <input>, so arrow keys move the text caret and trap',
  '  // focus. Let Right/Left/Down escape to the neighbouring chrome / content.',
  '  function wireSearchEscape(){',
  '    var inp = document.querySelector("#global-search-field");',
  '    if (!inp || inp._tvwired) return;',
  '    inp._tvwired = true;',
  '    inp.addEventListener("keydown", function(e){',
  '      var user = document.querySelector("#topbar .user-menu");',
  '      if (e.keyCode === 39 && user) { e.preventDefault(); e.stopPropagation(); try { user.focus(); } catch (x) {} }',      // Right -> user button
  '      else if (e.keyCode === 40) { e.preventDefault(); e.stopPropagation(); try { SN.focus("board"); } catch (x) {} }',   // Down -> content
  '    }, true);',
  '  }',
  '  // On the login/intro form the on-screen keyboard steals focus; when it',
  '  // closes, spatial nav loses its place. Drive Up/Down deterministically',
  '  // through the visible fields/buttons so you can always reach them.',
  '  function wireLoginNav(){',
  '    if (document._tvLoginNav) return;',
  '    document._tvLoginNav = true;',
  '    document.addEventListener("keydown", function(e){',
  '      if (location.hash.indexOf("intro") < 0) return;',
  '      if (e.keyCode !== 38 && e.keyCode !== 40) return;',
  '      var sels = ["input.email", "input.password", "input.conf-password", ".proceed", ".fb"], order = [];',
  '      for (var i = 0; i < sels.length; i++) { var el = document.querySelector(sels[i]); if (el && el.getBoundingClientRect().width > 0) order.push(el); }',
  '      if (!order.length) return;',
  '      var idx = order.indexOf(document.activeElement), next;',
  '      if (e.keyCode === 40) next = order[idx < 0 ? 0 : Math.min(idx + 1, order.length - 1)];',
  '      else next = order[idx < 0 ? 0 : Math.max(idx - 1, 0)];',
  '      if (next && next !== document.activeElement) { e.preventDefault(); e.stopPropagation(); try { next.focus(); } catch (x) {} }',
  '    }, true);',
  '  }',
  '  // Addons tab -> a single centered "Sync Addons" button (reload re-pulls the',
  '  // account: login, addons, library all refresh to current state).',
  '  // Remove the Calendar + Addons sidebar tabs entirely.',
  '  function isGone(s){ s = (s || "").toLowerCase(); return s.indexOf("calendar") >= 0 || s.indexOf("addon") >= 0; }',
  '  function filterTabs(){',
  '    try {',
  '      var el = document.querySelector("#navbar"); if (!el) return;',
  '      var sc = angular.element(el).scope();',
  '      while (sc && !sc.tabs) sc = sc.$parent;',
  '      if (!sc || !sc.tabs || !sc.tabs.length) return;',
  '      var before = sc.tabs.length;',
  '      sc.tabs = sc.tabs.filter(function(t){ return !isGone((t.route || "") + " " + (t.name || "") + " " + (t.icon || "")); });',
  '      if (sc.tabs.length !== before && !sc.$$phase && !(sc.$root && sc.$root.$$phase)) sc.$apply();',
  '    } catch (e) {}',
  '  }',
  '  function hideTabs(){',
  '    filterTabs();',                                       // remove from the model (no DOM/icons)
  '    var t = document.querySelectorAll("#navbar .tab");',  // CSS fallback in case the model filter misses
  '    for (var i = 0; i < t.length; i++) {',
  '      var nm = t[i].getAttribute("tab-name") || "", hr = t[i].getAttribute("href") || t[i].getAttribute("ui-sref") || "";',
  '      if (isGone(nm) || isGone(hr)) { t[i].style.display = "none"; }',
  '    }',
  '  }',
  '  var syncEl = null, syncOn = false;',
  '  function ensureSync(){',
  '    if (syncEl) return;',
  '    syncEl = document.createElement("div"); syncEl.id = "tvSync";',
  '    syncEl.innerHTML = "<div id=\\"tvSyncBox\\"><div id=\\"tvSyncBtn\\" tabindex=\\"0\\">\\u21bb  Sync Addons</div><div id=\\"tvSyncSub\\">Refresh your account, addons &amp; library</div></div>";',
  '    document.body.appendChild(syncEl);',
  '    syncEl.querySelector("#tvSyncBtn").addEventListener("click", function(){ location.reload(); });',
  '  }',
  '  // ---- QR / phone sign-in (Stremio link flow) ----',
  '  function xg(u, cb){ try { var x=new XMLHttpRequest(); x.open("GET",u,true); x.onreadystatechange=function(){ if(x.readyState===4){ var j=null; try{j=JSON.parse(x.responseText);}catch(e){} cb(j); } }; x.send(); } catch(e){ cb(null); } }',
  '  function xp(u, body, cb){ try { var x=new XMLHttpRequest(); x.open("POST",u,true); x.setRequestHeader("Content-Type","application/json"); x.onreadystatechange=function(){ if(x.readyState===4){ var j=null; try{j=JSON.parse(x.responseText);}catch(e){} cb(j); } }; x.send(JSON.stringify(body)); } catch(e){ cb(null); } }',
  '  var qrEl=null, qrStarted=false, qrPoll=null, qrDismissed=false;',
  '  function buildQr(){',
  '    if (qrEl) return;',
  '    qrEl=document.createElement("div"); qrEl.id="tvqr";',
  '    qrEl.innerHTML="<h2>Sign in to Stremio</h2><div class=sub>Scan with your phone to sign in</div><img id=tvqrimg><div class=code id=tvqrcode></div><div class=codehint>or open link.stremio.com and enter the code</div><div class=status id=tvqrstatus>Generating code\\u2026</div><div class=email id=tvqremail tabindex=0>Use email instead (press OK)</div>";',
  '    document.body.appendChild(qrEl);',
  '    qrEl.querySelector("#tvqremail").addEventListener("click", dismissQr);',
  '  }',
  '  function dismissQr(){ qrDismissed=true; if(qrPoll){clearInterval(qrPoll);qrPoll=null;} if(qrEl) qrEl.className=""; try{ var em=document.querySelector("input.email"); if(em) em.focus(); }catch(e){} }',
  '  function startQr(){',
  '    if (qrStarted || qrDismissed) return; qrStarted=true; buildQr(); qrEl.className="show";',
  '    xg("https://link.stremio.com/api/create", function(j){',
  '      if (!j || !j.code) { var s=document.getElementById("tvqrstatus"); if(s)s.textContent="Couldn\\u2019t reach Stremio \\u2014 use email below."; qrStarted=false; return; }',
  '      document.getElementById("tvqrimg").src=j.qrcode; document.getElementById("tvqrcode").textContent=j.code; document.getElementById("tvqrstatus").textContent="Waiting for sign-in\\u2026";',
  '      qrPoll=setInterval(function(){',
  '        xg("https://link.stremio.com/api/read?code="+encodeURIComponent(j.code), function(r){',
  '          var ak = r && r.result && (r.result.authKey || r.result.auth_key);',
  '          if (ak) { clearInterval(qrPoll); qrPoll=null; finishQr(ak); }',
  '        });',
  '      }, 2500);',
  '    });',
  '  }',
  '  function finishQr(authKey){',
  '    var s=document.getElementById("tvqrstatus"); if(s)s.textContent="Signing in\\u2026";',
  '    try { localStorage.setItem("authKey", JSON.stringify(authKey)); } catch(e){}',
  '    xp("https://api.strem.io/api/getUser", { authKey: authKey }, function(j){',
  '      try { if (j && j.result) localStorage.setItem("user", JSON.stringify(j.result)); } catch(e){}',
  '      location.reload();',
  '    });',
  '  }',
  '  // ---- navigable custom dropdown (replaces the native picker that traps focus) ----',
  '  var ddEl=null, ddSel=null, ddItems=[], ddIdx=0;',
  '  function ddOpen(sel){',
  '    if (!sel || !sel.options || !sel.options.length) return false;',
  '    if (!ddEl){ ddEl=document.createElement("div"); ddEl.id="tvdd"; document.body.appendChild(ddEl); }',
  '    ddSel=sel; ddItems=[]; ddIdx=Math.max(0, sel.selectedIndex); var html="";',
  '    for (var i=0;i<sel.options.length;i++){ ddItems.push(i); html+="<div class=ddi>"+((sel.options[i].textContent||sel.options[i].value||"").replace(/</g,"&lt;"))+"</div>"; }',
  '    ddEl.innerHTML=html; ddEl.className="show"; ddPaint(); return true;',
  '  }',
  '  function ddPaint(){ var e=ddEl.querySelectorAll(".ddi"); for(var i=0;i<e.length;i++) e[i].className="ddi"+(i===ddIdx?" f":""); if(e[ddIdx]) e[ddIdx].scrollIntoView(false); }',
  '  function ddChoose(){ if(ddSel){ try{ ddSel.selectedIndex=ddIdx; var ev=document.createEvent("HTMLEvents"); ev.initEvent("change",true,true); ddSel.dispatchEvent(ev); }catch(e){} var r=root(); if(r){ try{ if(!r.$$phase && !(r.$root&&r.$root.$$phase)) r.$apply(); }catch(e){} } } ddClose(); }',
  '  function ddClose(){ if(ddEl) ddEl.className=""; ddSel=null; }',
  '  function ddIsOpen(){ return ddEl && ddEl.className==="show"; }',
  '  var prevUser = false, loginFocused = false;',
  '  function tick(){',
  '    SN = window.SpatialNavigation;',
  '    // Free compositor memory during playback: drop the zoom while the',
  '    // fullscreen player is open (this TV is very RAM-limited). Restore for UI.',
  '    try { document.documentElement.style.zoom = (location.hash.indexOf("player") >= 0) ? "1" : ""; } catch (e) {}',
  '    if (!SN) return;',
  '    ensure("tvtabs", "#navbar .tab");',
  '    ensure("tvtopbar", "#topbar #global-search-field, #topbar .user-menu");',
  '    wireSearchEscape();',
  '    wireLoginNav();',
  '    // Login / intro: QR sign-in over the form (email reachable via "Use email").',
  '    if (location.hash.indexOf("intro") >= 0 && document.querySelector(".email, .proceed")) {',
  '      startQr();',
  '      ensure("tvlogin", "input.email, input.password, input.conf-password, .proceed, .fb", { enterTo: "default-element", defaultElement: "input.email" });',
  '      try { SN.makeFocusable("tvlogin"); } catch (e) {}',
  '      if (qrDismissed && !loginFocused) { var em = document.querySelector("input.email"); if (em) { try { em.focus(); loginFocused = true; } catch (e) {} } }',
  '    } else { loginFocused = false; if (qrEl) { qrEl.className=""; qrStarted=false; qrDismissed=false; if (qrPoll){clearInterval(qrPoll);qrPoll=null;} } }',
  '    // Calendar + Addons tabs removed: hide them and bounce their routes home.',
  '    hideTabs();',
  '    if (location.hash.indexOf("addons") >= 0 || location.hash.indexOf("calendar") >= 0) { try { location.hash = "#/"; } catch (e) {} }',
  '    var r = root();',
  '    var userOpen = !!(r && r.userMenuOpen);',
  '    if (userOpen) {',
  '      ensure("tvusermenu", "#user-panel .option, #user-panel .login-logout-button", { enterTo: "default-element" });',
  '      try { SN.makeFocusable("tvusermenu"); } catch (e) {}',
  '      if (!prevUser) { try { SN.focus("tvusermenu"); } catch (e) {} }', // jump into menu when it opens
  '    }',
  '    prevUser = userOpen;',
  '    manageOverlayHistory(!!(r && (r.userMenuOpen || r.searchOpened)));',
  '  }',
  '  function closeOverlays(){',
  '    var r = root();',
  '    var a = document.activeElement;',
  '    var sf = a && (a.id === "global-search-field" || (a.closest && a.closest("#search-form-container, #search-bar, #search-dropdown")));',
  '    if (r && (r.userMenuOpen || r.searchOpened || sf)) {',
  '      r.userMenuOpen = false; r.searchOpened = false; r.searchNavActive = false;',
  '      try { if (a && a.blur) a.blur(); } catch (e) {}',           // drop edit focus from the search input
  '      try { r.$apply(); } catch (e) {}',
  '      try { window.SpatialNavigation.focus("tvtopbar"); } catch (e) {}',
  '      return true;',
  '    }',
  '    return false;',
  '  }',
  '  // This TV delivers Back as history navigation, not a key event. So when an',
  '  // overlay opens we push a dummy history entry; Back then pops it and we',
  '  // close the overlay instead of the underlying route changing.',
  '  var overlayPushed = false;',
  '  function manageOverlayHistory(open){',
  '    if (open && !overlayPushed) { try { history.pushState({ tvOverlay: true }, ""); } catch (e) {} overlayPushed = true; }',
  '    else if (!open) { overlayPushed = false; }',
  '  }',
  '  window.addEventListener("popstate", function(){',
  '    if (overlayPushed) { overlayPushed = false; closeOverlays(); }',
  '  });',
  '  // Fallback: some setups DO send Back/Escape as a key event.',
  '  document.addEventListener("keydown", function(e){',
  '    if (e.keyCode === 461 || e.keyCode === 27) {',
  '      if (closeOverlays()) { overlayPushed = false; e.preventDefault(); e.stopPropagation(); }',
  '    }',
  '  }, true);',
  '  // On the QR sign-in screen, OK switches to email login.',
  '  document.addEventListener("keydown", function(e){',
  '    if (qrEl && qrEl.className === "show" && e.keyCode === 13) { dismissQr(); e.preventDefault(); e.stopPropagation(); }',
  '  }, true);',
  '  // Dropdown: Enter on a <select> opens a navigable list; arrows move, Enter picks, Back cancels.',
  '  document.addEventListener("keydown", function(e){',
  '    if (ddIsOpen()) {',
  '      if (e.keyCode === 38) { ddIdx = Math.max(0, ddIdx-1); ddPaint(); }',
  '      else if (e.keyCode === 40) { ddIdx = Math.min(ddItems.length-1, ddIdx+1); ddPaint(); }',
  '      else if (e.keyCode === 13) { ddChoose(); }',
  '      else if (e.keyCode === 461 || e.keyCode === 27 || e.keyCode === 8) { ddClose(); }',
  '      e.preventDefault(); e.stopPropagation(); return;',
  '    }',
  '    if (e.keyCode === 13) {',
  '      var a = document.activeElement, sel = null;',
  '      if (a) { if (a.tagName === "SELECT") sel = a; else if (a.querySelector) { sel = a.querySelector("select"); if (!sel && a.closest) { var cs = a.closest(".custom-select"); if (cs) sel = cs.querySelector("select"); } } }',
  '      if (sel && ddOpen(sel)) { e.preventDefault(); e.stopPropagation(); }',
  '    }',
  '  }, true);',
  '  // In the player, Up/Down are bound to volume which the user does not want.',
  '  // Swallow them before the player handler runs.',
  '  document.addEventListener("keydown", function(e){',
  '    if (location.hash.indexOf("player") >= 0 && (e.keyCode === 38 || e.keyCode === 40)) {',
  '      e.preventDefault(); e.stopPropagation();',
  '    }',
  '  }, true);',
  '  var lastCover = null;',
  '  function goFocus(el){ try { SN.focus(el); } catch (x) { try { el.focus(); } catch (y) {} } }',
  '  // Down FROM a See-All button drops back into that row\'s covers. Narrow: only fires when the',
  '  // See-All itself is focused, so ordinary Down navigation is completely untouched.',
  '  document.addEventListener("keydown", function(e){',
  '    if (e.keyCode !== 40) return;',
  '    var a = document.activeElement;',
  '    if (!a || !a.className || String(a.className).indexOf("heading-button") < 0) return;',
  '    var back = (lastCover && lastCover.offsetParent) ? lastCover : null;',
  '    if (!back && a.closest) { var row = a.closest("li"); back = row && row.querySelector(".board-row li, ul li, .items li"); }',
  '    if (back) { e.preventDefault(); e.stopImmediatePropagation(); goFocus(back); }',
  '  }, true);',
  '  // Up ONLY when it would otherwise do nothing (top of the content): go to this row\'s See-All',
  '  // if present, else the top bar. Deferred + non-capturing so normal row-to-row Up is NOT touched.',
  '  document.addEventListener("keydown", function(e){',
  '    if (e.keyCode !== 38) return;',
  '    if (location.hash.indexOf("player") >= 0 || ddIsOpen()) return;',
  '    var r = root(); if (r && (r.userMenuOpen || r.searchOpened)) return;',
  '    var before = document.activeElement;',
  '    if (!before || !before.closest) return;',
  '    if (before.closest("#topbar, #navbar, #user-panel")) return;',
  '    if (before.className && String(before.className).indexOf("heading-button") >= 0) return;', // on a See-All: let it leave upward
  '    setTimeout(function(){',
  '      if (document.activeElement !== before) return;',   // row-to-row Up already worked -> do nothing
  '      var sa = null, el = before.parentNode;',
  '      for (var d = 0; el && d < 5; d++, el = el.parentNode) { if (el.querySelector) { var h = el.querySelector(".heading-button"); if (h) { sa = h; break; } } }',
  '      if (sa) { lastCover = before; if (sa.getAttribute("tabindex") == null) sa.setAttribute("tabindex", "-1"); goFocus(sa); }',
  '      else { try { SN.focus("tvtopbar"); } catch (x) {} }',
  '    }, 0);',
  '  }, false);',
  '  // Continue Watching: the remote OK was firing the item\'s ng-click (open the info page)',
  '  // instead of its spatial-nav-enter (resume the player). For .resume items, jump straight',
  '  // into the stream we last played; otherwise run the shell\'s own player-intent action.',
  '  window.addEventListener("keydown", function(e){',
  '    if (e.keyCode !== 13) return;',
  '    var a = document.activeElement; if (!a || !a.closest) return;',
  '    var el = a.closest(".resume"); if (!el) return;',
  '    var sc; try { sc = angular.element(el).scope(); } catch (x) { return; }',
  '    if (!sc || !sc.item) return;',
  '    var it = sc.item, id = it._id, vid = (it.state && it.state.video_id) || id, q = null;',
  '    try { q = localStorage.getItem("tvstream_" + id + "_" + vid); } catch (x) {}',
  '    e.preventDefault(); e.stopImmediatePropagation();',
  '    if (q) { location.assign("http://127.0.0.1:8080/play" + q); return; }',            // resume our exact stream + position (push so Back returns home)
  '    var expr = el.getAttribute("spatial-nav-enter");',                                  // else let Stremio open the player with its remembered stream
  '    if (expr) { try { sc.$apply(function(){ sc.$eval(expr); }); } catch (x) { try { sc.$eval(expr); } catch (y) {} } }',
  '  }, true);',
  '  // Sync overlay (Addons tab): Enter reloads; Left/Up/Back leaves it.',
  '  document.addEventListener("keydown", function(e){',
  '    if (!syncOn || !syncEl || syncEl.className !== "show") return;',
  '    if (e.keyCode === 13) { e.preventDefault(); e.stopPropagation(); location.reload(); }',
  '    else if (e.keyCode === 37 || e.keyCode === 38 || e.keyCode === 461 || e.keyCode === 27 || e.keyCode === 8) {',
  '      syncOn = false; syncEl.className = "";',
  '      try { SN.focus(e.keyCode === 38 ? "tvtopbar" : "tvtabs"); } catch (x) {}',
  '      e.preventDefault(); e.stopPropagation();',
  '    }',
  '  }, true);',
  '  // When Stremio navigates to its player, redirect to our BARE player page',
  '  // (/play). That unloads the whole ~205MB web app and frees RAM for video.',
  '  var lastShellHash = "#/";', // remember where we were so the player\'s Back returns there, not home
  '  function checkPlayer(){',
  '    var h = location.hash || "";',
  '    if (h.indexOf("#/player/") === 0) {',
  '      var parts = h.split("/");',                              // ["#","player",type,id,vid,token]
  '      var token = parts[parts.length - 1];',
  '      if (token && token.length > 20) {',
  '        try { var g = document.createElement("div"); g.style.cssText = "position:fixed;top:0;left:0;right:0;bottom:0;background:#0c0b11;z-index:2147483646"; (document.body||document.documentElement).appendChild(g); } catch (e) {}', // cover the OG player flash
  '        var qp = "type=" + encodeURIComponent(parts[2] || "") + "&id=" + encodeURIComponent(parts[3] || "") + "&vid=" + encodeURIComponent(parts[4] || "") + "&token=" + encodeURIComponent(token) + "&back=" + encodeURIComponent(lastShellHash);',
  '        window.location.replace("http://127.0.0.1:8080/play?" + qp);',
  '      }',
  '    } else if (h && h.indexOf("#/player") !== 0) { lastShellHash = h; }', // track the last real page (usually the detail page)
  '  }',
  '  window.addEventListener("hashchange", checkPlayer);',
  '  function start(){ checkPlayer(); tick(); setInterval(tick, 800); }',
  '  if (document.readyState !== "loading") start();',
  '  else document.addEventListener("DOMContentLoaded", start);',
  '})();'
].join('\n');

function inject(html) {
  html = html.replace('<head>', '<head><base href="' + SHELL_URL + '">');
  // Drop scripts that are useless on this TV and just eat memory (Chromecast
  // sender, Apple ID SDK). This low-RAM set OOM-kills the app under load.
  html = html.replace(/<script[^>]*cast_sender[^>]*><\/script>/g, '');
  html = html.replace(/<script[^>]*appleid[^>]*><\/script>/g, '');
  html = html.replace('</head>', '<style>' + CSS + '</style></head>');
  // Splash sits in the HTML so it covers the very first paint (no flash before JS runs).
  var splashLogo = ICON_URI ? '<img id="tvSplashLogo" src="' + ICON_URI + '">' : '<div id="tvSplashLogo"></div>';
  html = html.replace(/<body[^>]*>/, '$&<div id="tvSplash">' + splashLogo + '</div>');
  html = html.replace('</body>', '<script>' + JS + '</script></body>');
  return html;
}

// ---------- bare-page player ----------
// Stremio encodes the picked stream as a zlib+base64 token in the player route.
// Decode it server-side (node has zlib) so the bare page stays tiny.
function decodeStreamToken(token) {
  if (!token) return null;
  try {
    var t = String(token).replace(/~([0-9A-Fa-f]{2})/g, function (m, h) { return String.fromCharCode(parseInt(h, 16)); });
    t = t.replace(/-/g, '+').replace(/_/g, '/');
    while (t.length % 4) t += '=';
    var out = zlib.inflateSync(Buffer.from(t, 'base64')).toString('utf8');
    return JSON.parse(out);
  } catch (e) { dbg('decode token failed: ' + e.message); return null; }
}

function cleanTitle(stream) {
  // Prefer a human title from the description (addons put "🎬 Movie (Year)" on
  // the first line); fall back to a cleaned filename; then the stream name.
  var desc = stream.description || stream.title || '';
  var first = (desc.split('\n')[0] || '').replace(/^[^0-9A-Za-z(]+/, '').trim();
  if (first && first.length >= 2) return first;
  var fn = stream.behaviorHints && stream.behaviorHints.filename;
  if (fn) {
    return fn.replace(/\.[^.]+$/, '')
             .replace(/[._]/g, ' ')
             .replace(/\b(1080p|720p|2160p|4k|web[- ]?dl|bluray|x264|x265|h ?264|h ?265|hevc|amzn|ddp?5 1|aac|atmos)\b.*$/i, '')
             .trim();
  }
  return stream.name || 'Stremio';
}

function playerPage(stream, ctx) {
  var streamUrl = stream.url || '';
  ctx = ctx || {};
  var meta = ctx.meta || {};
  var title = meta.name || ctx.name || cleanTitle(stream);
  var seLine = (ctx.season && ctx.episode) ? ('Temporada ' + ctx.season + ' · Episódio ' + ctx.episode + (ctx.epTitle ? ' · ' + ctx.epTitle : '')) : '';
  var nextVid = ctx.nextVid || '';
  var fromBeta = (ctx.back || '').indexOf('beta') === 0;
  var nextHref = !nextVid ? '' : (fromBeta
    ? 'http://127.0.0.1:8080/beta#detail/' + encodeURIComponent(ctx.type || '') + '/' + encodeURIComponent(ctx.id || '') + '/' + encodeURIComponent(nextVid)
    : 'http://127.0.0.1:8080/#/detail/' + encodeURIComponent(ctx.type || '') + '/' + encodeURIComponent(ctx.id || '') + '/' + encodeURIComponent(nextVid));

  // YouTube-style TV Player for webOS (Chromium 53 & webOS 3/4/5/6 compatible)
  return '<!doctype html><html><head><meta charset="utf-8">' +
'<meta name="viewport" content="width=device-width,initial-scale=1">' +
'<title>' + (title ? (title + ' — ') : '') + 'YouTube Player</title>' +
'<style>' +
'html,body{margin:0;padding:0;width:100%;height:100%;background:#000;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:#fff;user-select:none;-webkit-user-select:none;}' +
'#v{position:fixed;top:0;left:0;width:100%;height:100%;background:#000;object-fit:contain;transition:object-fit .2s;}' +
'#v.cover{object-fit:cover;}' +
'#v.fill{object-fit:fill;}' +
'#gocov{position:fixed;top:0;left:0;right:0;bottom:0;background:#0c0b11;z-index:2147483647;display:none;}' +
'/* YouTube Buffering Spinner */' +
'#buf{position:fixed;top:0;left:0;right:0;bottom:0;display:none;align-items:center;justify-content:center;flex-direction:column;background:rgba(0,0,0,0.45);z-index:15;pointer-events:none;}' +
'#buf.show{display:-webkit-flex;display:flex;}' +
'.yt-spinner{width:76px;height:76px;animation:ytRot 1.4s linear infinite;}' +
'@keyframes ytRot{0%{transform:rotate(0deg);}100%{transform:rotate(360deg);}}' +
'.yt-spinner-circle{stroke:#ff0000;stroke-dasharray:90,200;stroke-dashoffset:0;animation:ytDash 1.4s ease-in-out infinite;}' +
'@keyframes ytDash{0%{stroke-dasharray:1,200;stroke-dashoffset:0;}50%{stroke-dasharray:90,200;stroke-dashoffset:-35px;}100%{stroke-dasharray:90,200;stroke-dashoffset:-125px;}}' +
'#bufMsg{margin-top:18px;font-size:22px;font-weight:600;color:rgba(255,255,255,0.9);text-shadow:0 2px 10px #000;letter-spacing:0.5px;}' +
'/* Loading Splash */' +
'#load{position:fixed;top:0;left:0;right:0;bottom:0;background:#08070d center/cover no-repeat;z-index:12;transition:opacity .4s ease;}' +
'#load:before{content:"";position:absolute;top:0;left:0;right:0;bottom:0;background:radial-gradient(ellipse at center,rgba(0,0,0,0.55),rgba(0,0,0,0.92));}' +
'#load .lwrap{position:absolute;top:50%;left:0;right:0;transform:translateY(-50%);text-align:center;padding:0 40px;}' +
'#lname{font-size:52px;font-weight:800;max-width:85%;margin:0 auto 16px;text-shadow:0 4px 24px #000;}' +
'#lname img{display:block;margin:0 auto;max-width:440px;max-height:160px;filter:drop-shadow(0 6px 24px rgba(0,0,0,0.9));}' +
'#loadStatus{font-size:24px;color:rgba(255,255,255,0.8);font-weight:600;margin-top:18px;text-shadow:0 2px 10px #000;}' +
'/* Subtitles Overlay */' +
'#sub{position:fixed;left:5%;right:5%;bottom:10%;text-align:center;line-height:1.38;z-index:10;pointer-events:none;}' +
'#sub span{display:inline-block;font-size:38px;color:#fff;text-shadow:-2px 0 #000,2px 0 #000,0 -2px #000,0 2px #000,-1px -1px #000,1px 1px #000,0 0 6px #000;border-radius:6px;}' +
'/* Seek Ripple Animation */' +
'.seek-ripple{position:fixed;top:0;bottom:0;width:38%;display:none;align-items:center;justify-content:center;z-index:18;pointer-events:none;}' +
'.seek-ripple.left{left:0;background:radial-gradient(ellipse at left center,rgba(255,255,255,0.18),transparent 70%);border-top-right-radius:50%;border-bottom-right-radius:50%;}' +
'.seek-ripple.right{right:0;background:radial-gradient(ellipse at right center,rgba(255,255,255,0.18),transparent 70%);border-top-left-radius:50%;border-bottom-left-radius:50%;}' +
'.seek-ripple.show{display:-webkit-flex;display:flex;animation:ripPulse .35s ease-out;}' +
'@keyframes ripPulse{0%{transform:scale(0.85);opacity:0;}50%{transform:scale(1.04);opacity:0.95;}100%{transform:scale(1);opacity:0.85;}}' +
'.ripple-content{text-align:center;color:#fff;text-shadow:0 4px 18px rgba(0,0,0,0.9);}' +
'.seek-arrows{font-size:52px;font-weight:900;letter-spacing:2px;color:#ff0000;margin-bottom:6px;}' +
'.seek-text{font-size:26px;font-weight:800;letter-spacing:0.5px;}' +
'/* Toast Notification */' +
'#toast{position:fixed;left:50%;top:50px;transform:translateX(-50%);background:rgba(20,20,25,0.94);color:#fff;font-size:22px;font-weight:600;padding:12px 28px;border-radius:28px;opacity:0;transition:opacity .25s ease;z-index:35;pointer-events:none;box-shadow:0 8px 30px rgba(0,0,0,0.7);border:1px solid rgba(255,255,255,0.14);}' +
'/* YouTube TV Player HUD Controls Overlay */' +
'#hud{position:fixed;top:0;left:0;right:0;bottom:0;z-index:14;display:-webkit-flex;display:flex;-webkit-flex-direction:column;flex-direction:column;-webkit-justify-content:space-between;justify-content:space-between;opacity:0;pointer-events:none;transition:opacity .22s ease;background:linear-gradient(to bottom,rgba(0,0,0,0.85) 0%,rgba(0,0,0,0.2) 28%,rgba(0,0,0,0.2) 68%,rgba(0,0,0,0.9) 100%);padding:36px 48px;box-sizing:border-box;}' +
'#hud.show{opacity:1;pointer-events:auto;}' +
'/* Top Header */' +
'#topBar{display:-webkit-flex;display:flex;-webkit-align-items:center;align-items:center;width:100%;}' +
'.hud-btn{width:56px;height:56px;border-radius:50%;background:rgba(255,255,255,0.12);display:-webkit-flex;display:flex;-webkit-align-items:center;align-items:center;-webkit-justify-content:center;justify-content:center;cursor:pointer;transition:background .15s,transform .15s;-webkit-flex-shrink:0;flex-shrink:0;margin-right:20px;}' +
'.hud-btn:hover,.hud-btn.f{background:#fff;color:#000;transform:scale(1.08);box-shadow:0 0 0 3px #ff0000;}' +
'.hud-btn:hover svg path,.hud-btn.f svg path{fill:#000;}' +
'#headerInfo{-webkit-flex:1;flex:1;min-width:0;}' +
'#title{font-size:36px;font-weight:800;letter-spacing:0.3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-shadow:0 2px 10px #000;}' +
'#subHeader{display:-webkit-flex;display:flex;-webkit-align-items:center;align-items:center;margin-top:6px;}' +
'#tse{font-size:22px;font-weight:600;color:#c9b8ff;text-shadow:0 2px 8px #000;margin-right:14px;}' +
'#tse:empty{display:none;}' +
'.live-badge{background:#ff0000;color:#fff;font-size:18px;font-weight:800;padding:4px 12px;border-radius:6px;letter-spacing:1px;box-shadow:0 2px 10px rgba(255,0,0,0.5);margin-right:12px;}' +
'.res-badge{background:rgba(255,255,255,0.18);color:#fff;font-size:18px;font-weight:700;padding:3px 10px;border-radius:6px;border:1px solid rgba(255,255,255,0.25);margin-right:12px;}' +
'/* Center Playback Controls */' +
'#centerControls{position:absolute;top:50%;left:50%;-webkit-transform:translate(-50%,-50%);transform:translate(-50%,-50%);display:-webkit-flex;display:flex;-webkit-align-items:center;align-items:center;-webkit-justify-content:center;justify-content:center;z-index:15;}' +
'.hud-ctrl-btn{width:84px;height:84px;border-radius:50%;background:rgba(20,20,25,0.72);border:2px solid rgba(255,255,255,0.25);display:-webkit-flex;display:flex;-webkit-align-items:center;align-items:center;-webkit-justify-content:center;justify-content:center;cursor:pointer;transition:transform .15s ease,background .15s ease,box-shadow .15s ease;margin:0 28px;-webkit-flex-shrink:0;flex-shrink:0;}' +
'.hud-ctrl-btn.main-pp{width:108px;height:108px;background:rgba(255,0,0,0.88);border-color:transparent;box-shadow:0 6px 24px rgba(255,0,0,0.5);}' +
'.hud-ctrl-btn:hover,.hud-ctrl-btn.f{transform:scale(1.12);background:#fff;box-shadow:0 0 0 4px #ff0000,0 8px 30px rgba(0,0,0,0.8);}' +
'.hud-ctrl-btn:hover svg path,.hud-ctrl-btn.f svg path{fill:#000;}' +
'.hud-ctrl-btn:hover text,.hud-ctrl-btn.f text{fill:#000;}' +
'.hud-ctrl-btn.main-pp.f{background:#fff;box-shadow:0 0 0 5px #ff0000,0 10px 36px rgba(255,0,0,0.6);}' +
'.hud-ctrl-btn.main-pp.f svg path{fill:#ff0000;}' +
'/* Bottom Bar */' +
'#bottomBar{position:absolute;left:48px;right:48px;bottom:36px;z-index:15;display:-webkit-flex;display:flex;-webkit-flex-direction:column;flex-direction:column;width:auto;}' +
'#seekContainer{position:relative;width:100%;height:28px;display:-webkit-flex;display:flex;-webkit-align-items:center;align-items:center;cursor:pointer;margin-bottom:14px;}' +
'#progressBar{position:relative;width:100%;height:6px;background:rgba(255,255,255,0.22);border-radius:3px;transition:height .15s ease;}' +
'#seekContainer.seeking #progressBar,#seekContainer:hover #progressBar,#seekContainer.f #progressBar{height:10px;}' +
'#bufferBar{position:absolute;left:0;top:0;height:100%;width:0;background:rgba(255,255,255,0.38);border-radius:3px;}' +
'#fillBar{position:absolute;left:0;top:0;height:100%;width:0;background:#ff0000;border-radius:3px;}' +
'#scrubberKnob{position:absolute;top:50%;left:0;width:16px;height:16px;margin:-8px 0 0 -8px;border-radius:50%;background:#ff0000;border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.8);transition:transform .15s ease,width .15s ease,height .15s ease,margin .15s ease;}' +
'#seekContainer.seeking #scrubberKnob,#seekContainer:hover #scrubberKnob,#seekContainer.f #scrubberKnob{width:24px;height:24px;margin:-12px 0 0 -12px;transform:scale(1.15);box-shadow:0 0 0 4px rgba(255,0,0,0.4);}' +
'#bottomRow{display:-webkit-flex;display:flex;-webkit-align-items:center;align-items:center;-webkit-justify-content:space-between;justify-content:space-between;width:100%;}' +
'#timeDisplay{font-size:24px;font-weight:700;font-variant-numeric:tabular-nums;color:rgba(255,255,255,0.92);letter-spacing:0.5px;text-shadow:0 2px 8px #000;-webkit-flex-shrink:0;flex-shrink:0;}' +
'#actionButtons{display:-webkit-flex;display:flex;-webkit-align-items:center;align-items:center;-webkit-flex-shrink:0;flex-shrink:0;}' +
'.hud-action-btn{display:-webkit-flex;display:flex;-webkit-align-items:center;align-items:center;padding:10px 18px;margin-left:14px;border-radius:24px;background:rgba(255,255,255,0.12);cursor:pointer;transition:background .15s,transform .15s,box-shadow .15s;position:relative;-webkit-flex-shrink:0;flex-shrink:0;}' +
'.hud-action-btn:first-child{margin-left:0;}' +
'.hud-action-btn svg{margin-right:8px;-webkit-flex-shrink:0;flex-shrink:0;}' +
'.hud-action-btn:hover,.hud-action-btn.f{background:#fff;color:#000;transform:scale(1.06);box-shadow:0 0 0 3px #ff0000;}' +
'.hud-action-btn:hover svg path,.hud-action-btn.f svg path{fill:#000;}' +
'.btn-label{font-size:20px;font-weight:700;}' +
'.cc-dot{position:absolute;bottom:6px;right:14px;width:6px;height:6px;border-radius:50%;background:#ff0000;display:none;}' +
'.cc-dot.on{display:block;}' +
'/* Modern Side Drawer Menu (Settings, Audio, Subtitles) */' +
'#menuOverlay{position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.65);z-index:40;display:none;}' +
'#menuOverlay.show{display:block;}' +
'#ytMenu{position:fixed;right:0;top:0;bottom:0;width:480px;background:rgba(18,17,26,0.98);box-shadow:-12px 0 45px rgba(0,0,0,0.85);border-left:1px solid rgba(255,255,255,0.12);z-index:45;display:none;padding:36px 28px;box-sizing:border-box;-webkit-flex-direction:column;flex-direction:column;}' +
'#ytMenu.show{display:-webkit-flex;display:flex;animation:drawerSlide .22s ease-out;}' +
'@keyframes drawerSlide{0%{opacity:0;transform:translateX(50px);}100%{opacity:1;transform:none;}}' +
'.yt-menu-header{font-size:26px;font-weight:800;margin-bottom:18px;padding-bottom:14px;border-bottom:1px solid rgba(255,255,255,0.12);color:#fff;-webkit-display:-webkit-flex;display:flex;-webkit-align-items:center;align-items:center;-webkit-justify-content:space-between;justify-content:space-between;}' +
'.yt-menu-close{display:-webkit-flex;display:flex;-webkit-align-items:center;align-items:center;padding:12px 20px;border-radius:12px;background:rgba(255,255,255,0.12);font-size:20px;font-weight:700;cursor:pointer;margin-bottom:16px;color:#fff;transition:background .15s;}' +
'.yt-menu-close:hover,.yt-menu-close.f{background:#ff0000;color:#fff;box-shadow:0 0 0 3px #fff;}' +
'.yt-menu-list{-webkit-flex:1;flex:1;overflow-y:auto;padding-right:4px;}' +
'.yt-menu-item{-webkit-display:-webkit-flex;display:flex;-webkit-align-items:center;align-items:center;-webkit-justify-content:space-between;justify-content:space-between;padding:16px 20px;border-radius:12px;font-size:22px;font-weight:600;color:rgba(255,255,255,0.85);margin-bottom:8px;background:rgba(255,255,255,0.05);cursor:pointer;transition:background .12s,transform .12s;}' +
'.yt-menu-item:hover,.yt-menu-item.f{background:#ff0000;color:#fff;font-weight:700;box-shadow:0 4px 18px rgba(255,0,0,0.5);transform:scale(1.02);}' +
'.yt-menu-item.active{background:rgba(255,0,0,0.22);border:1px solid rgba(255,0,0,0.5);color:#ff6666;font-weight:700;}' +
'.yt-menu-item.f.active{background:#ff0000;color:#fff;border-color:transparent;}' +
'.yt-menu-item .check{font-size:22px;font-weight:800;color:#ff5555;margin-right:12px;}' +
'.yt-menu-item.f .check{color:#fff;}' +
'.yt-menu-item .val{font-size:20px;opacity:0.8;font-weight:500;}' +
'/* Next Episode Floating Card */' +
'#npCard{position:fixed;right:48px;bottom:140px;width:440px;background:rgba(18,18,24,0.96);border-radius:16px;padding:22px;box-sizing:border-box;box-shadow:0 16px 48px rgba(0,0,0,0.85);border:1px solid rgba(255,255,255,0.18);z-index:30;display:none;-webkit-flex-direction:column;flex-direction:column;}' +
'#npCard.show{display:-webkit-flex;display:flex;animation:menuSlide .2s ease-out;}' +
'@keyframes menuSlide{0%{opacity:0;transform:translateY(16px);}100%{opacity:1;transform:none;}}' +
'.np-header{font-size:18px;font-weight:800;color:#ff0000;letter-spacing:1.5px;margin-bottom:8px;}' +
'.np-title{font-size:24px;font-weight:700;margin-bottom:14px;line-height:1.3;max-height:64px;overflow:hidden;}' +
'.np-thumb{width:100%;height:200px;border-radius:10px;object-fit:cover;background:#000;margin-bottom:16px;display:none;}' +
'.np-btn{background:#ff0000;color:#fff;text-align:center;padding:14px 0;border-radius:10px;font-size:22px;font-weight:800;cursor:pointer;transition:background .15s,transform .15s;}' +
'.np-btn:hover,.np-btn.f{background:#fff;color:#000;box-shadow:0 0 0 3px #ff0000;transform:scale(1.03);}' +
'.np-btn-cancel{background:rgba(255,255,255,0.14)!important;color:#fff!important;font-weight:600!important;}' +
'.np-btn-cancel:hover,.np-btn-cancel.f{background:#fff!important;color:#000!important;box-shadow:0 0 0 3px #fff!important;transform:scale(1.03);}' +
'</style></head><body>' +
'<video id="v" autoplay playsinline webkit-playsinline></video>' +
'<div id="sub"></div>' +
'<div id="buf"><div class="yt-spinner"><svg viewBox="0 0 50 50"><circle cx="25" cy="25" r="20" fill="none" stroke-width="4" stroke="#ff0000" stroke-linecap="round" class="yt-spinner-circle"></circle></svg></div><div id="bufMsg">Carregando…</div></div>' +
'<div id="seekRippleLeft" class="seek-ripple left"><div class="ripple-content"><div class="seek-arrows">◀◀</div><div class="seek-text" id="seekTextLeft">10 segundos</div></div></div>' +
'<div id="seekRippleRight" class="seek-ripple right"><div class="ripple-content"><div class="seek-arrows">▶▶</div><div class="seek-text" id="seekTextRight">10 segundos</div></div></div>' +
'<div id="toast"></div>' +
'<div id="load"><div class="lwrap"><div class="yt-spinner" style="margin:0 auto 20px"><svg viewBox="0 0 50 50"><circle cx="25" cy="25" r="20" fill="none" stroke-width="4" stroke="#ff0000" stroke-linecap="round" class="yt-spinner-circle"></circle></svg></div><div id="lname"></div><div id="loadStatus">Iniciando reprodução…</div></div></div>' +
'<div id="hud">' +
'  <div id="topBar">' +
'    <div id="backBtn" class="hud-btn" title="Voltar">' +
'      <svg viewBox="0 0 24 24" width="30" height="30"><path fill="#fff" d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>' +
'    </div>' +
'    <div id="headerInfo">' +
'      <div id="title"></div>' +
'      <div id="subHeader">' +
'        <span id="tse"></span>' +
'        <span id="liveBadge" class="live-badge" style="display:none">🔴 AO VIVO</span>' +
'        <span id="resBadge" class="res-badge">HD</span>' +
'      </div>' +
'    </div>' +
'  </div>' +
'  <div id="centerControls">' +
'    <div id="btnRw" class="hud-ctrl-btn" title="Retroceder 10s">' +
'      <svg viewBox="0 0 24 24" width="46" height="46"><path fill="#fff" d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/><text x="12" y="15" fill="#fff" font-size="7" font-weight="bold" text-anchor="middle">10</text></svg>' +
'    </div>' +
'    <div id="btnPP" class="hud-ctrl-btn main-pp" title="Play / Pause">' +
'      <svg id="icPlay" viewBox="0 0 24 24" width="56" height="56" style="display:none"><path fill="#fff" d="M8 5v14l11-7z"/></svg>' +
'      <svg id="icPause" viewBox="0 0 24 24" width="56" height="56"><path fill="#fff" d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>' +
'    </div>' +
'    <div id="btnFf" class="hud-ctrl-btn" title="Avançar 10s">' +
'      <svg viewBox="0 0 24 24" width="46" height="46"><path fill="#fff" d="M12 5V1l5 5-5 5V7c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6h2c0 4.42-3.58 8-8 8s-8-3.58-8-8 3.58-8 8-8z"/><text x="12" y="15" fill="#fff" font-size="7" font-weight="bold" text-anchor="middle">10</text></svg>' +
'    </div>' +
'  </div>' +
'  <div id="bottomBar">' +
'    <div id="seekContainer">' +
'      <div id="progressBar">' +
'        <div id="bufferBar"></div>' +
'        <div id="fillBar"></div>' +
'        <div id="scrubberKnob"></div>' +
'      </div>' +
'    </div>' +
'    <div id="bottomRow">' +
'      <div style="display:-webkit-flex;display:flex;-webkit-flex-direction:column;flex-direction:column;-webkit-flex-shrink:0;flex-shrink:0;">' +
'        <div id="timeDisplay">0:00 / 0:00</div>' +
'        <div id="colorShortcuts" style="display:-webkit-flex;display:flex;-webkit-align-items:center;align-items:center;margin-top:6px;font-size:15px;font-weight:700;color:rgba(255,255,255,0.72);">' +
'          <span style="margin-right:16px"><i style="color:#ff4444;font-style:normal;margin-right:4px">●</i>Áudio</span>' +
'          <span style="margin-right:16px"><i style="color:#2ecc71;font-style:normal;margin-right:4px">●</i>Legendas</span>' +
'          <span style="margin-right:16px"><i style="color:#f1c40f;font-style:normal;margin-right:4px">●</i>Proporção</span>' +
'          <span><i style="color:#3498db;font-style:normal;margin-right:4px">●</i>Opções</span>' +
'        </div>' +
'      </div>' +
'      <div id="actionButtons">' +
'        <div id="btnNext" class="hud-action-btn" style="display:none" title="Próximo Episódio">' +
'          <svg viewBox="0 0 24 24" width="28" height="28"><path fill="#fff" d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>' +
'          <span class="btn-label">Próximo</span>' +
'        </div>' +
'        <div id="btnSubs" class="hud-action-btn" title="Legendas">' +
'          <svg viewBox="0 0 24 24" width="28" height="28"><path fill="#fff" d="M19 4H5c-1.11 0-2 .9-2 2v12c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm-8 7H9.5v-.5h-2v3h2V13H11v1c0 .55-.45 1-1 1H7c-.55 0-1-.45-1-1v-4c0-.55.45-1 1-1h3c.55 0 1 .45 1 1v1zm7 0h-1.5v-.5h-2v3h2V13H18v1c0 .55-.45 1-1 1h-3c-.55 0-1-.45-1-1v-4c0-.55.45-1 1-1h3c.55 0 1 .45 1 1v1z"/></svg>' +
'          <span class="btn-label">Legendas</span>' +
'          <span id="ccIndicator" class="cc-dot"></span>' +
'        </div>' +
'        <div id="btnAudio" class="hud-action-btn" title="Áudio">' +
'          <svg viewBox="0 0 24 24" width="28" height="28"><path fill="#fff" d="M12 3v9.28c-.47-.17-.97-.28-1.5-.28C8.01 12 6 14.01 6 16.5S8.01 21 10.5 21c2.31 0 4.2-1.75 4.45-4H15V6h4V3h-7z"/></svg>' +
'          <span class="btn-label">Áudio</span>' +
'        </div>' +
'        <div id="btnSpeed" class="hud-action-btn" title="Velocidade">' +
'          <span id="speedLabel" style="font-weight:800;font-size:18px">1.0x</span>' +
'        </div>' +
'        <div id="btnAspect" class="hud-action-btn" title="Proporção da Tela">' +
'          <svg viewBox="0 0 24 24" width="28" height="28"><path fill="#fff" d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14zM7 10h2v7H7zm4-3h2v10h-2zm4 6h2v4h-2z"/></svg>' +
'        </div>' +
'        <div id="btnSettings" class="hud-action-btn" title="Configurações">' +
'          <svg viewBox="0 0 24 24" width="28" height="28"><path fill="#fff" d="M19.14 12.94a7.5 7.5 0 000-1.88l2.03-1.58a.5.5 0 00.12-.64l-1.92-3.32a.5.5 0 00-.61-.22l-2.39.96a7.3 7.3 0 00-1.62-.94l-.36-2.54A.5.5 0 0013.5 2h-3a.5.5 0 00-.5.42l-.36 2.54c-.59.24-1.13.56-1.62.94l-2.39-.96a.5.5 0 00-.61.22L2.7 8.84a.5.5 0 00.12.64l2.03 1.58a7.5 7.5 0 000 1.88L2.82 14.5a.5.5 0 00-.12.64l1.92 3.32a.5.5 0 00.61.22l2.39-.96c.49.38 1.03.7 1.62.94l.36 2.54a.5.5 0 00.5.42h3a.5.5 0 00.5-.42l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96a.5.5 0 00.61-.22l1.92-3.32a.5.5 0 00-.12-.64zM12 15.5A3.5 3.5 0 1112 8.5a3.5 3.5 0 010 7z"/></svg>' +
'        </div>' +
'      </div>' +
'    </div>' +
'  </div>' +
'</div>' +
'<div id="npCard"><div class="np-header">A SEGUIR · <span id="npSec">15</span>s</div><div id="npTitle" class="np-title"></div><img id="npThumb" class="np-thumb" src=""><div style="display:-webkit-flex;display:flex;margin-top:12px"><div id="npPlayBtn" class="np-btn" style="-webkit-flex:1;flex:1;margin-right:10px">Reproduzir Agora</div><div id="npCancelBtn" class="np-btn np-btn-cancel" style="width:110px">Cancelar</div></div></div>' +
'<div id="menuOverlay"></div>' +
'<div id="ytMenu"><div id="menuHeader" class="yt-menu-header"></div><div id="menuCloseBtn" class="yt-menu-close"><svg viewBox="0 0 24 24" width="22" height="22" style="margin-right:8px"><path fill="#fff" d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg><span>Voltar ao Vídeo</span></div><div id="menuList" class="yt-menu-list"></div></div>' +
'<div id="gocov"></div>' +
'<script>(function(){' +
'var URL=' + JSON.stringify(streamUrl) + ',TITLE=' + JSON.stringify(title) + ',TYPE=' + JSON.stringify(ctx.type || '') + ',ID=' + JSON.stringify(ctx.id || '') + ',VID=' + JSON.stringify(ctx.vid || '') + ',LOGO=' + JSON.stringify(meta.logo || '') + ',BG=' + JSON.stringify(meta.background || '') + ',POSTER=' + JSON.stringify(meta.poster || '') + ',SE=' + JSON.stringify(seLine) + ',NEXTVID=' + JSON.stringify(nextVid) + ',NEXTHREF=' + JSON.stringify(nextHref) + ',BACK=' + JSON.stringify(ctx.back || '') + ',NEXTTITLE=' + JSON.stringify(ctx.nextTitle || '') + ',NEXTTHUMB=' + JSON.stringify(ctx.nextThumb || '') + ',SNAME=' + JSON.stringify(String((stream.name || '') + ' ' + (stream.title || stream.description || '')).slice(0, 400)) + ';' +
'var v=document.getElementById("v"),hud=document.getElementById("hud"),fillBar=document.getElementById("fillBar"),bufferBar=document.getElementById("bufferBar"),scrubberKnob=document.getElementById("scrubberKnob"),timeDisplay=document.getElementById("timeDisplay"),subEl=document.getElementById("sub"),load=document.getElementById("load"),lname=document.getElementById("lname"),buf=document.getElementById("buf"),menuOverlay=document.getElementById("menuOverlay"),ytMenu=document.getElementById("ytMenu"),menuHeader=document.getElementById("menuHeader"),menuCloseBtn=document.getElementById("menuCloseBtn"),menuList=document.getElementById("menuList"),toastEl=document.getElementById("toast"),ccIndicator=document.getElementById("ccIndicator"),liveBadge=document.getElementById("liveBadge"),resBadge=document.getElementById("resBadge");' +
'var npCard=document.getElementById("npCard"),npTitle=document.getElementById("npTitle"),npThumb=document.getElementById("npThumb"),npPlayBtn=document.getElementById("npPlayBtn"),npCancelBtn=document.getElementById("npCancelBtn"),npSec=document.getElementById("npSec");' +
'var npTimer=null,npSecondsLeft=15,npDismissed=false,npFocusIdx=0;' +
'function goNextEp(){' +
'  if(!NEXTHREF)return;' +
'  if(npTimer){clearInterval(npTimer);npTimer=null;}' +
'  showToast("⏭ Próximo Episódio...");' +
'  try{v.pause();v.removeAttribute("src");v.load();}catch(e){}' +
'  document.getElementById("gocov").style.display="block";' +
'  location.replace(NEXTHREF);' +
'}' +
'function showNextEpCard(){' +
'  if(!NEXTHREF||npDismissed||!npCard)return;' +
'  if(npCard.className.indexOf("show")>=0)return;' +
'  if(NEXTTITLE)npTitle.textContent=NEXTTITLE;' +
'  else npTitle.textContent="Próximo Episódio";' +
'  if(NEXTTHUMB){npThumb.src=NEXTTHUMB;npThumb.style.display="block";}' +
'  npSecondsLeft=15;if(npSec)npSec.textContent=npSecondsLeft;' +
'  npCard.className="show";focusZone="np";npFocusIdx=0;paintFocus();' +
'  if(npTimer)clearInterval(npTimer);' +
'  npTimer=setInterval(function(){' +
'    npSecondsLeft--;' +
'    if(npSec)npSec.textContent=npSecondsLeft;' +
'    if(npSecondsLeft<=0){' +
'      clearInterval(npTimer);npTimer=null;' +
'      goNextEp();' +
'    }' +
'  },1000);' +
'}' +
'function dismissNextEpCard(){' +
'  npDismissed=true;' +
'  if(npTimer){clearInterval(npTimer);npTimer=null;}' +
'  if(npCard)npCard.className="";' +
'  if(focusZone==="np"){focusZone="center";focusIdx=1;paintFocus();}' +
'  showToast("Contagem cancelada");' +
'}' +
'if(npPlayBtn)npPlayBtn.addEventListener("click",goNextEp);' +
'if(npCancelBtn)npCancelBtn.addEventListener("click",dismissNextEpCard);' +
'document.getElementById("title").textContent=TITLE;' +
'if(SE)document.getElementById("tse").textContent=SE;' +
'if(BG)load.style.backgroundImage="url(\\""+BG+"\\")";' +
'if(LOGO){lname.innerHTML="<img src=\\""+LOGO+"\\">";}else{lname.textContent=TITLE;}' +
'function xhr(u,cb){try{var x=new XMLHttpRequest();x.open("GET",u,true);x.onreadystatechange=function(){if(x.readyState===4){var j=null;try{j=JSON.parse(x.responseText);}catch(e){}cb(j);}};x.send();}catch(e){cb(null);}}' +
'function showToast(m){if(!toastEl)return;toastEl.textContent=m;toastEl.style.opacity="1";clearTimeout(toastEl._t);toastEl._t=setTimeout(function(){toastEl.style.opacity="0";},3000);}' +
'function fmt(s){if(s==null||isNaN(s)||s<0)return "0:00";s=Math.floor(s);var h=Math.floor(s/3600),m=Math.floor((s%3600)/60),sec=s%60;function p(n){return(n<10?"0":"")+n;}return(h?h+":"+p(m):m)+":"+p(sec);}' +
'var isLive=(TYPE==="tv"||TYPE==="channel"||TYPE==="iptv"||URL.indexOf(".m3u8")>=0||URL.indexOf("/live/")>=0);' +
'if(isLive)liveBadge.style.display="inline-block";' +
'v.src=URL;' +
'var lastPlayTime=0,lastCheckTime=Date.now(),stallNudgeCount=0;' +
'setInterval(function(){' +
'  if(v.paused||v.seeking||!v.duration||isLive||load.style.display!=="none"){' +
'    lastPlayTime=v.currentTime;lastCheckTime=Date.now();return;' +
'  }' +
'  var now=Date.now();' +
'  if(v.currentTime===lastPlayTime){' +
'    if(now-lastCheckTime>3500){' +
'      stallNudgeCount++;' +
'      if(stallNudgeCount<=3){' +
'        try{var nudge=Math.max(0,v.currentTime-0.2);v.currentTime=nudge;v.play();}catch(e){}' +
'      }else{' +
'        try{v.currentTime=Math.max(0,v.currentTime-1.5);v.play();}catch(e){}' +
'        stallNudgeCount=0;' +
'      }' +
'      lastCheckTime=now;' +
'    }' +
'  }else{' +
'    lastPlayTime=v.currentTime;lastCheckTime=now;stallNudgeCount=0;' +
'  }' +
'},1000);' +
'function doPlay(){try{var p=v.play();if(p&&p.catch){p.catch(function(){showToast("Pressione OK para reproduzir");});}}catch(e){}}' +
'setTimeout(doPlay,50);' +
'document.addEventListener("click",function(){if(v.paused)doPlay();});' +
'var hideLoadT=setTimeout(function(){if(load.style.display!=="none"){document.getElementById("loadStatus").textContent=(URL.indexOf(":11470")>=0?"Conectando aos peers do torrent…":"Aguardando resposta do servidor…");}},3500);' +
'function onPlaying(){clearTimeout(hideLoadT);load.style.opacity="0";setTimeout(function(){load.style.display="none";},400);buf.className="";showHUD();lazyProbe();}' +
'v.addEventListener("playing",onPlaying);' +
'v.addEventListener("loadeddata",function(){setTimeout(onPlaying,100);});' +
'v.addEventListener("waiting",function(){if(!v.paused&&load.style.display==="none")buf.className="show";});' +
'v.addEventListener("stalled",function(){if(!v.paused&&load.style.display==="none")buf.className="show";});' +
'v.addEventListener("canplay",function(){buf.className="";});' +
'v.addEventListener("seeked",function(){buf.className="";});' +
'v.addEventListener("error",function(){buf.className="";var isTor=(URL.indexOf(":11470")>=0);var msg=isTor?"Torrent sem seeds suficientes ou formato não suportado. Tente outro link.":"Erro de conexão com o link de vídeo. Tente outro link ou formato.";lname.innerHTML="<div style=\\"font-size:24px;max-width:780px;margin:0 auto;line-height:1.4;background:rgba(20,20,25,0.94);padding:24px;border-radius:14px;\\"><div style=\\"font-size:26px;font-weight:800;color:#ff4444;margin-bottom:8px\\">Falha na Reprodução</div>"+msg+"<br><a href=\\"#\\" onclick=\\"exit();return false;\\" style=\\"display:inline-block;margin-top:16px;padding:10px 24px;background:#ff0000;color:#fff;border-radius:8px;text-decoration:none;font-weight:700;font-size:20px;\\">Voltar</a></div>";load.style.display="block";load.style.opacity="1";});' +
'var hudTimer=null,hudState="hidden",focusZone="center",focusIdx=1;' +
'function showHUD(){hud.className="show";hudState="visible";clearTimeout(hudTimer);hudTimer=setTimeout(function(){if(hudState==="visible"&&!v.paused&&menuState==="hidden"){hud.className="";hudState="hidden";}},4000);}' +
'function hideHUD(){hud.className="";hudState="hidden";clearTimeout(hudTimer);}' +
'function togglePlay(){if(v.paused)v.play();else v.pause();updatePlayIcons();showHUD();}' +
'function updatePlayIcons(){var p=v.paused;document.getElementById("icPlay").style.display=p?"block":"none";document.getElementById("icPause").style.display=p?"none":"block";}' +
'v.addEventListener("play",updatePlayIcons);' +
'v.addEventListener("pause",function(){updatePlayIcons();showHUD();});' +
'v.addEventListener("timeupdate",function(){' +
'  if(seekAccum<0){' +
'    if(v.duration&&v.duration!==Infinity&&!isNaN(v.duration)){' +
'      var pct=(v.currentTime/v.duration)*100;' +
'      fillBar.style.width=pct+"%";scrubberKnob.style.left=pct+"%";' +
'      timeDisplay.textContent=fmt(v.currentTime)+" / "+fmt(v.duration);' +
'      if(v.buffered&&v.buffered.length){try{var bEnd=v.buffered.end(v.buffered.length-1);var bPct=(bEnd/v.duration)*100;bufferBar.style.width=Math.min(100,bPct)+"%";}catch(e){}}' +
'      if(NEXTHREF&&!npDismissed&&v.duration>35&&(v.duration-v.currentTime)<=25){showNextEpCard();}' +
'    } else if(isLive){' +
'      fillBar.style.width="100%";scrubberKnob.style.left="100%";' +
'      timeDisplay.textContent="🔴 AO VIVO · "+fmt(v.currentTime);' +
'    }' +
'  }' +
'  renderSub();' +
'});' +
'v.addEventListener("ended",function(){' +
'  if(NEXTHREF&&!npDismissed){goNextEp();}' +
'  else{exit();}' +
'});' +
'var seekAccum=-1,seekTimer=null,seekRippleTimer=null,SEEK_STEP=10;' +
'function seekBy(delta){' +
'  if(!v.duration||v.duration===Infinity||isNaN(v.duration))return;' +
'  var base=(seekAccum>=0?seekAccum:v.currentTime);' +
'  seekAccum=Math.max(0,Math.min(v.duration,base+delta));' +
'  var diff=Math.round(seekAccum-v.currentTime);' +
'  var isFwd=(diff>=0);' +
'  var ripEl=document.getElementById(isFwd?"seekRippleRight":"seekRippleLeft");' +
'  var txtEl=document.getElementById(isFwd?"seekTextRight":"seekTextLeft");' +
'  if(ripEl&&txtEl){' +
'    txtEl.textContent=Math.abs(diff)+" segundos";' +
'    ripEl.className="seek-ripple "+(isFwd?"right":"left")+" show";' +
'    clearTimeout(seekRippleTimer);' +
'    seekRippleTimer=setTimeout(function(){ripEl.className="seek-ripple "+(isFwd?"right":"left");},500);' +
'  }' +
'  var pct=(seekAccum/v.duration)*100;' +
'  fillBar.style.width=pct+"%";scrubberKnob.style.left=pct+"%";' +
'  timeDisplay.textContent=fmt(seekAccum)+" / "+fmt(v.duration);' +
'  document.getElementById("seekContainer").className="seeking";' +
'  showHUD();' +
'  clearTimeout(seekTimer);' +
'  seekTimer=setTimeout(function(){' +
'    if(seekAccum>=0){v.currentTime=seekAccum;seekAccum=-1;}' +
'    document.getElementById("seekContainer").className="";' +
'  },600);' +
'}' +
'var ctrlBtns=[document.getElementById("btnRw"),document.getElementById("btnPP"),document.getElementById("btnFf")];' +
'var actionBtns=[document.getElementById("btnNext"),document.getElementById("btnSubs"),document.getElementById("btnAudio"),document.getElementById("btnSpeed"),document.getElementById("btnAspect"),document.getElementById("btnSettings")];' +
'if(NEXTVID){document.getElementById("btnNext").style.display="flex";}' +
'function paintFocus(){' +
'  for(var i=0;i<ctrlBtns.length;i++)ctrlBtns[i].className="hud-ctrl-btn"+(i===1?" main-pp":"")+(focusZone==="center"&&i===focusIdx?" f":"");' +
'  for(var j=0;j<actionBtns.length;j++)actionBtns[j].className="hud-action-btn"+(focusZone==="bottom"&&j===focusIdx?" f":"");' +
'  document.getElementById("backBtn").className="hud-btn"+(focusZone==="top"?" f":"");' +
'  document.getElementById("seekContainer").className=(focusZone==="seek"?"f":"");' +
'  if(npPlayBtn){npPlayBtn.className="np-btn"+(focusZone==="np"&&npFocusIdx===0?" f":"");}' +
'  if(npCancelBtn){npCancelBtn.className="np-btn np-btn-cancel"+(focusZone==="np"&&npFocusIdx===1?" f":"");}' +
'}' +
'var menuState="hidden",menuView="root",menuOpenedFrom="root",menuItems=[],menuIdx=0;' +
'var speedOpts=[0.5,0.75,1.0,1.25,1.5,2.0];' +
'var aspectOpts=["contain","cover","fill"];' +
'var aspectLabels=["Ajustar (Original)","Preencher (16:9)","Esticar (Tela Cheia)"];' +
'var curAspect=0,curSpeed=2;' +
'var embAudioTracks=[],curAudioIdx=0,curAudioName="Áudio Padrão";' +
'function openMenu(view,fromHud){' +
'  menuView=view;' +
'  if(fromHud)menuOpenedFrom=view;' +
'  menuState="visible";menuItems=[];menuIdx=0;' +
'  if(view==="root"){' +
'    menuHeader.textContent="Configurações";' +
'    menuItems.push({label:"Faixas de Áudio",val:curAudioName,action:function(){openMenu("audio");}});' +
'    menuItems.push({label:"Legendas",val:curSub==="off"?"Desativadas":(curSubName||"Ativas"),action:function(){openMenu("subs");}});' +
'    menuItems.push({label:"Velocidade",val:speedOpts[curSpeed]+"x",action:function(){openMenu("speed");}});' +
'    menuItems.push({label:"Proporção da Tela",val:aspectLabels[curAspect],action:function(){openMenu("aspect");}});' +
'  } else if(view==="audio"){' +
'    menuHeader.textContent="Faixas de Áudio";' +
'    var found=false;' +
'    try{' +
'      var ts=v.audioTracks||[];' +
'      if(ts.length>0){' +
'        found=true;' +
'        for(var a=0;a<ts.length;a++){' +
'          (function(idx,trk){' +
'            var nm=trk.label||trk.language||("Faixa "+(idx+1));' +
'            menuItems.push({label:nm,active:(idx===curAudioIdx),action:function(){setAudioTrack(idx,{name:nm,lang:trk.language});}});' +
'          })(a,ts[a]);' +
'        }' +
'      }' +
'    }catch(e){}' +
'    if(!found&&embAudioTracks&&embAudioTracks.length>0){' +
'      found=true;' +
'      for(var ea=0;ea<embAudioTracks.length;ea++){' +
'        (function(idx,trk){' +
'          menuItems.push({label:trk.name,active:(idx===curAudioIdx),action:function(){setAudioTrack(idx,trk);}});' +
'        })(ea,embAudioTracks[ea]);' +
'      }' +
'    }' +
'    if(!found){' +
'      menuItems.push({label:"Áudio Padrão (Original)",active:true,action:function(){showToast("Áudio Padrão");}});' +
'    }' +
'  } else if(view==="subs"){' +
'    menuHeader.textContent="Legendas";' +
'    menuItems.push({label:"Desativadas",active:curSub==="off",action:function(){subsOff();renderMenu();}});' +
'    if(embTracks&&embTracks.length){' +
'      for(var e=0;e<embTracks.length;e++){' +
'        (function(et){' +
'          menuItems.push({label:"[Embutida] "+et.name,active:curSub==="emb:"+et.n,action:function(){setEmbSub(et.n,et.ti,et.name);renderMenu();}});' +
'        })(embTracks[e]);' +
'      }' +
'    }' +
'    if(extSubs&&extSubs.length){' +
'      for(var x=0;x<extSubs.length;x++){' +
'        (function(es){' +
'          menuItems.push({label:"[Online] "+es.name,active:curSub==="ext:"+es.u,action:function(){setExtSub(es.u,es.name);renderMenu();}});' +
'        })(extSubs[x]);' +
'      }' +
'    }' +
'    menuItems.push({label:"Ajustar Sincronia / Atraso",action:function(){openMenu("subdelay");}});' +
'  } else if(view==="speed"){' +
'    menuHeader.textContent="Velocidade de Reprodução";' +
'    for(var s=0;s<speedOpts.length;s++){' +
'      (function(idx){' +
'        var sp=speedOpts[idx];' +
'        menuItems.push({label:(sp===1.0?"Normal (1.0x)":(sp+"x")),active:curSpeed===idx,action:function(){setSpeed(idx);renderMenu();}});' +
'      })(s);' +
'    }' +
'  } else if(view==="aspect"){' +
'    menuHeader.textContent="Proporção da Tela";' +
'    for(var ap=0;ap<aspectOpts.length;ap++){' +
'      (function(idx){' +
'        menuItems.push({label:aspectLabels[idx],active:curAspect===idx,action:function(){setAspect(idx);renderMenu();}});' +
'      })(ap);' +
'    }' +
'  } else if(view==="subdelay"){' +
'    menuHeader.textContent="Atraso: "+(subDelay>0?"+":"")+subDelay.toFixed(1)+"s";' +
'    menuItems.push({label:"Atrasar (+0.5s)",action:function(){subDelay+=0.5;openMenu("subdelay");}});' +
'    menuItems.push({label:"Adiantar (-0.5s)",action:function(){subDelay-=0.5;openMenu("subdelay");}});' +
'    menuItems.push({label:"Resetar (0.0s)",action:function(){subDelay=0;openMenu("subdelay");}});' +
'  }' +
'  renderMenu();' +
'  ytMenu.className="show";' +
'  if(menuOverlay)menuOverlay.className="show";' +
'  try{history.pushState({menu:1},"",location.href);}catch(e){}' +
'}' +
'function renderMenu(){' +
'  menuCloseBtn.className="yt-menu-close"+(menuIdx===0?" f":"");' +
'  menuList.innerHTML="";' +
'  for(var i=0;i<menuItems.length;i++){' +
'    var it=menuItems[i];' +
'    var d=document.createElement("div");' +
'    d.className="yt-menu-item"+((i+1)===menuIdx?" f":"")+(it.active?" active":"");' +
'    var chk=it.active?"<span class=check>✓</span>":"";' +
'    d.innerHTML="<div style=\\"display:flex;align-items:center\\">"+chk+"<span>"+it.label+"</span></div>"+(it.val?("<span class=val>"+it.val+"</span>"):"");' +
'    (function(item,targetIdx){' +
'      d.addEventListener("click",function(){ menuIdx=targetIdx; item.action(); });' +
'    })(it,i+1);' +
'    menuList.appendChild(d);' +
'  }' +
'}' +
'function closeMenu(){' +
'  ytMenu.className="";' +
'  if(menuOverlay)menuOverlay.className="";' +
'  menuState="hidden";' +
'  showHUD();' +
'}' +
'menuCloseBtn.addEventListener("click",function(){' +
'  if(menuView!=="root"&&menuOpenedFrom==="root")openMenu("root");' +
'  else closeMenu();' +
'});' +
'if(menuOverlay)menuOverlay.addEventListener("click",closeMenu);' +
'function setSpeed(idx){curSpeed=idx;v.playbackRate=speedOpts[idx];document.getElementById("speedLabel").textContent=speedOpts[idx]+"x";showToast("Velocidade: "+speedOpts[idx]+"x");}' +
'function setAspect(idx){curAspect=idx;v.className=(aspectOpts[idx]==="contain"?"":(aspectOpts[idx]==="cover"?"cover":"fill"));showToast(aspectLabels[idx]);}' +
'function setAudioTrack(idx,trk){' +
'  curAudioIdx=idx;' +
'  curAudioName=(trk&&trk.name)?trk.name:("Faixa "+(idx+1));' +
'  showToast("Áudio: "+curAudioName);' +
'  try{' +
'    if(v.audioTracks&&v.audioTracks.length>0){' +
'      for(var i=0;i<v.audioTracks.length;i++)v.audioTracks[i].enabled=(i===idx);' +
'      var curT=v.currentTime,paused=v.paused,srcUrl=v.src;' +
'      v.pause();v.removeAttribute("src");v.load();v.src=srcUrl;' +
'      v.addEventListener("loadedmetadata",function onceMd(){' +
'        v.removeEventListener("loadedmetadata",onceMd);' +
'        try{for(var k=0;k<v.audioTracks.length;k++)v.audioTracks[k].enabled=(k===idx);v.currentTime=curT;if(!paused)v.play();}catch(e2){}' +
'      });' +
'    }' +
'  }catch(e){}' +
'  try{if(window.PalmServiceBridge){new PalmServiceBridge().call("luna://com.webos.media/selectTrack",JSON.stringify({type:"audio",index:idx}));}}catch(e){}' +
'  try{if(window.webOS&&window.webOS.service){window.webOS.service.request("luna://com.webos.media",{method:"selectTrack",parameters:{type:"audio",index:idx}});} }catch(e){}' +
'  try{if(trk&&trk.lang)localStorage.setItem("audioLang",trk.lang);}catch(e){}' +
'  renderMenu();' +
'}' +
'var extSubs=[],cues=null,embTracks=null,curSub="off",curSubName="",subDelay=0,probed=false;' +
'function lazyProbe(){' +
'  if(probed)return;probed=true;' +
'  if(TYPE&&VID){xhr("/subs?type="+encodeURIComponent(TYPE)+"&vid="+encodeURIComponent(VID),function(j){if(j&&j.subtitles){extSubs=j.subtitles;autoSelectSubs();}});}' +
'  setTimeout(function(){xhr("/embtracks?u="+encodeURIComponent(URL),function(j){' +
'    if(j){' +
'      if(j.tracks)embTracks=j.tracks;' +
'      if(j.audioTracks&&j.audioTracks.length){embAudioTracks=j.audioTracks;autoSelectAudio();}' +
'    }' +
'  });},1500);' +
'  setTimeout(function(){xhr("/probe?u="+encodeURIComponent(URL),function(j){if(j&&j.res){resBadge.textContent=j.res.toUpperCase();}});},3000);' +
'}' +
'function autoSelectAudio(){' +
'  var want=(localStorage.getItem("audioLang")||"por").toLowerCase();' +
'  if(v.audioTracks&&v.audioTracks.length>0){' +
'    for(var i=0;i<v.audioTracks.length;i++){' +
'      var l=(v.audioTracks[i].language||v.audioTracks[i].label||"").toLowerCase();' +
'      if(l.indexOf(want)>=0||l.indexOf("portug")>=0){' +
'        setAudioTrack(i,{name:v.audioTracks[i].label||v.audioTracks[i].language||("Faixa "+(i+1)),lang:l});' +
'        return;' +
'      }' +
'    }' +
'  } else if(embAudioTracks&&embAudioTracks.length>0){' +
'    for(var a=0;a<embAudioTracks.length;a++){' +
'      var al=(embAudioTracks[a].lang||embAudioTracks[a].name||"").toLowerCase();' +
'      if(al.indexOf(want)>=0||al.indexOf("portug")>=0){' +
'        curAudioIdx=a;' +
'        curAudioName=embAudioTracks[a].name;' +
'        return;' +
'      }' +
'    }' +
'  }' +
'}' +
'function autoSelectSubs(){' +
'  var want=(localStorage.getItem("subsLang")||localStorage.getItem("subtitles")||"por").toLowerCase();' +
'  if(!want||want==="none"||want==="off")return;' +
'  for(var i=0;i<extSubs.length;i++){' +
'    var s=extSubs[i];' +
'    if((s.lang&&s.lang.indexOf(want)>=0)||(s.name&&s.name.toLowerCase().indexOf("portug")>=0)){' +
'      setExtSub(s.u,s.name);break;' +
'    }' +
'  }' +
'}' +
'function setExtSub(u,name){curSub="ext:"+u;curSubName=name||"Online";cues=null;subEl.innerHTML="";ccIndicator.className="cc-dot on";showToast("Legenda: "+curSubName);xhr("/sub?u="+encodeURIComponent(u),function(j){cues=(j&&j.cues)||[];});}' +
'function setEmbSub(n,ti,name){curSub="emb:"+n;curSubName=name||("Faixa "+n);cues=[];subEl.innerHTML="";ccIndicator.className="cc-dot on";showToast("Legenda: "+curSubName);xhr("/embstart?u="+encodeURIComponent(URL)+"&n="+n+"&id="+encodeURIComponent(ID)+"&vid="+encodeURIComponent(VID)+"&t="+(v.currentTime|0),function(j){if(j&&j.cues)cues=j.cues;});}' +
'function subsOff(){curSub="off";curSubName="";cues=null;subEl.innerHTML="";ccIndicator.className="cc-dot";showToast("Legendas desativadas");}' +
'function renderSub(){if(curSub==="off"||!cues||!cues.length){return;}' +
'  var t=v.currentTime-subDelay,txt="";' +
'  for(var i=0;i<cues.length;i++){if(t>=cues[i].s&&t<=cues[i].e){txt=cues[i].t;break;}}' +
'  if(subEl._last!==txt){subEl._last=txt;subEl.innerHTML=txt?("<span>"+txt.replace(/\\n/g,"<br>")+"</span>"):"";}' +
'}' +
'var exited=false;' +
'function exit(){' +
'  if(exited)return;exited=true;' +
'  try{v.pause();v.removeAttribute("src");v.load();}catch(e){}' +
'  document.getElementById("gocov").style.display="block";' +
'  var target="http://127.0.0.1:8080/"+(BACK||"beta");' +
'  location.replace(target);' +
'}' +
'var lastBackPress=0;' +
'function handlePlayerBack(e){' +
'  var now=Date.now();' +
'  if(now-lastBackPress<350){if(e&&e.preventDefault){e.preventDefault();e.stopPropagation();}return;}' +
'  lastBackPress=now;' +
'  if(e&&e.preventDefault){e.preventDefault();e.stopPropagation();}' +
'  if(npCard&&npCard.className.indexOf("show")>=0){' +
'    dismissNextEpCard();' +
'    return;' +
'  }' +
'  if(menuState==="visible"){' +
'    if(menuView!=="root"&&menuOpenedFrom==="root"){openMenu("root");}' +
'    else {closeMenu();}' +
'    return;' +
'  }' +
'  if(hudState==="visible"){' +
'    hideHUD();' +
'    return;' +
'  }' +
'  exit();' +
'}' +
'try{history.pushState({player:1},"",location.href);}catch(e){}' +
'window.addEventListener("popstate",function(e){' +
'  if(npCard&&npCard.className.indexOf("show")>=0){dismissNextEpCard();try{history.pushState({player:1},"",location.href);}catch(err){}return;}' +
'  if(menuState==="visible"){closeMenu();try{history.pushState({player:1},"",location.href);}catch(err){}return;}' +
'  if(hudState==="visible"){hideHUD();try{history.pushState({player:1},"",location.href);}catch(err){}return;}' +
'  exit();' +
'});' +
'document.addEventListener("keydown",function(e){' +
'  var k=e.keyCode;' +
'  if(k===29460)k=38;' +
'  if(k===29461)k=40;' +
'  if(k===4)k=37;' +
'  if(k===5)k=39;' +
'  if(k===29443||k===65376)k=13;' +
'  if(k===461||k===8||k===27||k===10009||k===88){' +
'    handlePlayerBack(e);return;' +
'  }' +
'  if(focusZone==="np"){' +
'    if(k===37){npFocusIdx=0;paintFocus();e.preventDefault();return;}' +
'    if(k===39){npFocusIdx=1;paintFocus();e.preventDefault();return;}' +
'    if(k===38){focusZone="center";focusIdx=1;paintFocus();e.preventDefault();return;}' +
'    if(k===13){if(npFocusIdx===0)goNextEp();else dismissNextEpCard();e.preventDefault();return;}' +
'  }' +
'  if(k===415||k===207){' +
'    if(v.paused)togglePlay();else{showToast("▶ Reproduzindo");showHUD();}' +
'    e.preventDefault();return;' +
'  }' +
'  if(k===19||k===119){' +
'    if(!v.paused)togglePlay();else{showToast("⏸ Pausado");showHUD();}' +
'    e.preventDefault();return;' +
'  }' +
'  if(k===179||k===402||k===10252){' +
'    togglePlay();e.preventDefault();return;' +
'  }' +
'  if(k===413){' +
'    showToast("⏹ Parando...");exit();e.preventDefault();return;' +
'  }' +
'  if(k===417||k===418||k===208){' +
'    seekBy(SEEK_STEP);e.preventDefault();return;' +
'  }' +
'  if(k===412||k===168){' +
'    seekBy(-SEEK_STEP);e.preventDefault();return;' +
'  }' +
'  if(k===425||k===176){' +
'    if(NEXTHREF){goNextEp();}else{seekBy(60);}' +
'    e.preventDefault();return;' +
'  }' +
'  if(k===424||k===177){' +
'    if(v.currentTime>6){v.currentTime=0;showToast("⏮ Reiniciando vídeo");}else{seekBy(-60);}' +
'    e.preventDefault();return;' +
'  }' +
'  if(k===403||k===458){' +
'    if(menuState==="visible"&&menuView==="audio")closeMenu();else{openMenu("audio",true);showToast("🔴 Faixa de Áudio");}' +
'    e.preventDefault();return;' +
'  }' +
'  if(k===404||k===460){' +
'    if(menuState==="visible"&&menuView==="subs")closeMenu();else{openMenu("subs",true);showToast("🟢 Legendas");}' +
'    e.preventDefault();return;' +
'  }' +
'  if(k===405){' +
'    curAspect=(curAspect+1)%aspectOpts.length;setAspect(curAspect);' +
'    showToast("🟡 Proporção: "+aspectLabels[curAspect]);' +
'    e.preventDefault();return;' +
'  }' +
'  if(k===406){' +
'    if(menuState==="visible"&&menuView==="root")closeMenu();else{openMenu("root",true);showToast("🔵 Configurações");}' +
'    e.preventDefault();return;' +
'  }' +
'  if(k===457){' +
'    if(hudState==="visible")hideHUD();else showHUD();' +
'    e.preventDefault();return;' +
'  }' +
'  if(k===33||k===427){' +
'    if(NEXTHREF){goNextEp();}else{seekBy(60);}' +
'    e.preventDefault();return;' +
'  }' +
'  if(k===34||k===428){' +
'    seekBy(-60);e.preventDefault();return;' +
'  }' +
'  if(k>=48&&k<=57&&v.duration>0){' +
'    var num=k-48,tgt=(num/10)*v.duration;' +
'    v.currentTime=tgt;showToast("Pular para "+(num*10)+"% ("+fmt(tgt)+")");showHUD();' +
'    e.preventDefault();return;' +
'  }' +
'  if(menuState==="visible"){' +
'    var maxIdx=menuItems.length;' +
'    if(k===38){menuIdx=Math.max(0,menuIdx-1);renderMenu();}' +
'    else if(k===40){menuIdx=Math.min(maxIdx,menuIdx+1);renderMenu();}' +
'    else if(k===13){' +
'      if(menuIdx===0){' +
'        if(menuView!=="root"&&menuOpenedFrom==="root")openMenu("root");' +
'        else closeMenu();' +
'      } else if(menuItems[menuIdx-1]){' +
'        menuItems[menuIdx-1].action();' +
'      }' +
'    }' +
'    e.preventDefault();return;' +
'  }' +
'  showHUD();' +
'  if(hudState==="hidden"||focusZone==="seek"){' +
'    if(k===37){seekBy(-SEEK_STEP);e.preventDefault();return;}' +
'    if(k===39){seekBy(SEEK_STEP);e.preventDefault();return;}' +
'  }' +
'  if(k===38){ /* UP */' +
'    if(focusZone==="bottom")focusZone="seek";' +
'    else if(focusZone==="seek")focusZone="center";' +
'    else if(focusZone==="center")focusZone="top";' +
'    paintFocus();e.preventDefault();return;' +
'  }' +
'  if(k===40){ /* DOWN */' +
'    if(focusZone==="top")focusZone="center";' +
'    else if(focusZone==="center")focusZone="seek";' +
'    else if(focusZone==="seek"){focusZone="bottom";focusIdx=Math.min(focusIdx,actionBtns.length-1);}' +
'    else if(focusZone==="bottom"){if(npCard&&npCard.className.indexOf("show")>=0){focusZone="np";npFocusIdx=0;}else{hideHUD();}}' +
'    paintFocus();e.preventDefault();return;' +
'  }' +
'  if(k===37){ /* LEFT */' +
'    if(focusZone==="center"){focusIdx=Math.max(0,focusIdx-1);paintFocus();}' +
'    else if(focusZone==="bottom"){focusIdx=Math.max(0,focusIdx-1);paintFocus();}' +
'    else seekBy(-SEEK_STEP);' +
'    e.preventDefault();return;' +
'  }' +
'  if(k===39){ /* RIGHT */' +
'    if(focusZone==="center"){focusIdx=Math.min(ctrlBtns.length-1,focusIdx+1);paintFocus();}' +
'    else if(focusZone==="bottom"){focusIdx=Math.min(actionBtns.length-1,focusIdx+1);paintFocus();}' +
'    else seekBy(SEEK_STEP);' +
'    e.preventDefault();return;' +
'  }' +
'  if(k===13){ /* OK / ENTER */' +
'    if(focusZone==="center"){' +
'      if(focusIdx===0)seekBy(-SEEK_STEP);' +
'      else if(focusIdx===1)togglePlay();' +
'      else if(focusIdx===2)seekBy(SEEK_STEP);' +
'    } else if(focusZone==="bottom"){' +
'      var btn=actionBtns[focusIdx];' +
'      if(btn===document.getElementById("btnNext")){goNextEp();}' +
'      else if(btn===document.getElementById("btnSubs"))openMenu("subs",true);' +
'      else if(btn===document.getElementById("btnAudio"))openMenu("audio",true);' +
'      else if(btn===document.getElementById("btnSpeed"))openMenu("speed",true);' +
'      else if(btn===document.getElementById("btnAspect"))openMenu("aspect",true);' +
'      else if(btn===document.getElementById("btnSettings"))openMenu("root",true);' +
'    } else if(focusZone==="top"){exit();}' +
'    else {togglePlay();}' +
'    e.preventDefault();return;' +
'  }' +
'},true);' +
'paintFocus();' +
'document.getElementById("backBtn").addEventListener("click",exit);' +
'document.getElementById("btnRw").addEventListener("click",function(){seekBy(-SEEK_STEP);});' +
'document.getElementById("btnPP").addEventListener("click",togglePlay);' +
'document.getElementById("btnFf").addEventListener("click",function(){seekBy(SEEK_STEP);});' +
'document.getElementById("btnNext").addEventListener("click",goNextEp);' +
'document.getElementById("btnSubs").addEventListener("click",function(){openMenu("subs",true);});' +
'document.getElementById("btnAudio").addEventListener("click",function(){openMenu("audio",true);});' +
'document.getElementById("btnSpeed").addEventListener("click",function(){openMenu("speed",true);});' +
'document.getElementById("btnAspect").addEventListener("click",function(){openMenu("aspect",true);});' +
'document.getElementById("btnSettings").addEventListener("click",function(){openMenu("root",true);});' +
'var lastMouseMove=0;' +
'document.addEventListener("mousemove",function(){' +
'  var now=Date.now();' +
'  if(now-lastMouseMove>350){lastMouseMove=now;showHUD();}' +
'});' +
'window.addEventListener("wheel",function(e){' +
'  showHUD();' +
'  if(e.deltaY>20)seekBy(-SEEK_STEP);' +
'  else if(e.deltaY<-20)seekBy(SEEK_STEP);' +
'},{passive:true});' +
'for(var ci=0;ci<ctrlBtns.length;ci++){(function(i){ctrlBtns[i].addEventListener("mouseenter",function(){focusZone="center";focusIdx=i;paintFocus();});})(ci);}' +
'for(var ai=0;ai<actionBtns.length;ai++){(function(i){actionBtns[i].addEventListener("mouseenter",function(){focusZone="bottom";focusIdx=i;paintFocus();});})(ai);}' +
'var bb=document.getElementById("backBtn");if(bb)bb.addEventListener("mouseenter",function(){focusZone="top";paintFocus();});' +
'var sc=document.getElementById("seekContainer");if(sc){' +
'  sc.addEventListener("mouseenter",function(){focusZone="seek";paintFocus();});' +
'  sc.addEventListener("click",function(e){' +
'    if(!v.duration)return;' +
'    var rect=sc.getBoundingClientRect();' +
'    var pct=Math.max(0,Math.min(1,(e.clientX-rect.left)/rect.width));' +
'    v.currentTime=pct*v.duration;' +
'    showToast("Pular para "+fmt(v.currentTime));showHUD();' +
'  });' +
'}' +
'hud.addEventListener("click",function(e){' +
'  if(e.target===hud){if(hudState==="hidden")showHUD();else togglePlay();}' +
'});' +
'})();<\/script></body></html>';
  waited = waited || 0;
  portUp(SERVER_PORT, function (up) {
    if (up || waited >= 25000) return cb();
    setTimeout(function () { waitForServer(cb, waited + 700); }, 700);
  });
}

var shellCache = null, shellCacheAt = 0, shellFetching = false, shellWaiters = [];
// Fetch + inject the shell once, cache it, and fan out to anyone waiting. Pre-warmed
// at startup so the first real request is served from memory (no app.strem.io round-trip).
function fetchShell(cb) {
  if (shellCache && (Date.now() - shellCacheAt) < 600000) return cb(shellCache);
  if (cb) shellWaiters.push(cb);
  if (shellFetching) return;
  shellFetching = true;
  https.get(SHELL_URL, function (r) {
    var chunks = [];
    r.on('data', function (d) { chunks.push(d); });
    r.on('end', function () {
      var html = inject(Buffer.concat(chunks).toString('utf8'));
      shellCache = html; shellCacheAt = Date.now(); shellFetching = false;
      var w = shellWaiters; shellWaiters = [];
      for (var i = 0; i < w.length; i++) w[i](html);
    });
  }).on('error', function () {
    shellFetching = false;
    var w = shellWaiters; shellWaiters = [];
    for (var i = 0; i < w.length; i++) w[i](null); // null => upstream error, served stale or 502
  });
}
function serveShell(res) {
  fetchShell(function (html) {
    if (!html && shellCache) html = shellCache; // fall back to stale cache over an error
    if (!html) { res.writeHead(502); res.end('upstream error'); return; }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
  });
}

// ---- helpers for meta/subtitle fetching ----
function sendJson(res, obj) {
  res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(obj));
}
var LANGS = { eng: 'English', spa: 'Spanish', fre: 'French', fra: 'French', ger: 'German', deu: 'German', ita: 'Italian', por: 'Portuguese', rus: 'Russian', ara: 'Arabic', dut: 'Dutch', nld: 'Dutch', pol: 'Polish', tur: 'Turkish', swe: 'Swedish', rum: 'Romanian', ron: 'Romanian', gre: 'Greek', heb: 'Hebrew', hin: 'Hindi', kor: 'Korean', jpn: 'Japanese', chi: 'Chinese', zho: 'Chinese', cze: 'Czech', dan: 'Danish', fin: 'Finnish', nor: 'Norwegian', hun: 'Hungarian', bul: 'Bulgarian', ukr: 'Ukrainian', srp: 'Serbian', hrv: 'Croatian', slo: 'Slovak', slv: 'Slovenian', spl: 'Spanish (LA)', pob: 'Portuguese (BR)' };
function langName(l) { return LANGS[l] || (l ? l.toUpperCase() : 'Unknown'); }
function fetchUrl(u, cb, depth) {
  depth = depth || 0;
  if (!u || depth > 5) return cb(null);
  var lib = u.indexOf('https:') === 0 ? https : http;
  var req;
  try { req = lib.get(u, onres); } catch (e) { return cb(null); }
  function onres(r) {
    if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) {
      r.resume();
      var loc = r.headers.location;
      if (loc.indexOf('http') !== 0) { var pu = urlmod.parse(u); loc = pu.protocol + '//' + pu.host + (loc.charAt(0) === '/' ? '' : '/') + loc; }
      return fetchUrl(loc, cb, depth + 1);
    }
    var chunks = [];
    r.on('data', function (d) { chunks.push(d); });
    r.on('end', function () {
      var buf = Buffer.concat(chunks);
      if (buf.length > 1 && buf[0] === 0x1f && buf[1] === 0x8b) { try { buf = zlib.gunzipSync(buf); } catch (e) {} }
      cb(buf);
    });
  }
  req.on('error', function () { cb(null); });
  req.setTimeout(12000, function () { try { req.abort(); } catch (e) {} });
}
function fetchJson(u, cb) { fetchUrl(u, function (buf) { if (!buf) return cb(null); try { cb(JSON.parse(buf.toString('utf8'))); } catch (e) { cb(null); } }); }

// ---- byte proxy for ffmpeg ----
// The bundled ffmpeg/ffprobe are statically linked against glibc, so getaddrinfo
// can't load libnss_dns and EVERY hostname fails ("Name or service not known").
// So ffmpeg never touches the network directly: it talks plain HTTP to us on
// 127.0.0.1 and node (which resolves DNS fine) does the real HTTPS fetch, follows
// debrid redirects, and streams the bytes back, honouring Range so ffmpeg can seek.
function localProxy(u) { return 'http://127.0.0.1:' + PORT + '/proxy?u=' + encodeURIComponent(u); }
var resolveCache = {}; // original debrid url -> { url: resolved-CDN-url, at: ts }
function proxyStream(target, range, method, clientRes, orig, depth, triedFresh) {
  depth = depth || 0;
  if (!target || depth > 6) { try { if (!clientRes.headersSent) clientRes.writeHead(502, { 'Access-Control-Allow-Origin': '*' }); clientRes.end(); } catch (e) {} return; }
  var pu;
  try { pu = urlmod.parse(target); } catch (e) { try { clientRes.writeHead(502, { 'Access-Control-Allow-Origin': '*' }); clientRes.end(); } catch (x) {} return; }
  var lib = pu.protocol === 'https:' ? https : http;
  var hdrs = { 'User-Agent': 'Stremio-TV/1.0', 'Accept': '*/*', 'Accept-Encoding': 'identity' };
  if (range) hdrs.Range = range;
  var opts = { protocol: pu.protocol, hostname: pu.hostname, port: pu.port, path: pu.path, method: method === 'HEAD' ? 'HEAD' : 'GET', headers: hdrs };
  var upReq;
  try { upReq = lib.request(opts, onUp); } catch (e) { try { clientRes.writeHead(502, { 'Access-Control-Allow-Origin': '*' }); clientRes.end(); } catch (x) {} return; }
  function onUp(up) {
    var sc = up.statusCode;
    if (sc >= 300 && sc < 400 && up.headers.location) {
      up.resume();
      var loc = up.headers.location;
      if (loc.indexOf('http') !== 0) loc = pu.protocol + '//' + pu.host + (loc.charAt(0) === '/' ? '' : '/') + loc;
      return proxyStream(loc, range, method, clientRes, orig, depth + 1, triedFresh);
    }
    // A cached signed CDN url likely expired — restart from the original once.
    if ((sc === 403 || sc === 410 || sc === 404) && !triedFresh && target !== orig) {
      up.resume(); delete resolveCache[orig];
      return proxyStream(orig, range, method, clientRes, orig, 0, true);
    }
    if (orig) resolveCache[orig] = { url: target, at: Date.now() }; // remember the working CDN url
    var h = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': '*'
    };
    ['content-type', 'content-length', 'content-range', 'accept-ranges', 'last-modified', 'etag'].forEach(function (k) {
      if (up.headers[k] != null) h[k] = up.headers[k];
    });
    if (!h['accept-ranges']) h['accept-ranges'] = 'bytes';
    try { clientRes.writeHead(sc, h); } catch (e) { try { up.destroy(); } catch (x) {} return; }
    // CLEAR the request timeout once streaming begins!
    // When the TV video decoder pauses socket read (flow control) during playback,
    // Node.js triggers setTimeout(20000) and aborts the connection mid-movie if not cleared!
    try { upReq.setTimeout(0); } catch (e) {}
    up.pipe(clientRes);
    up.on('error', function () { try { clientRes.end(); } catch (e) {} });
  }
  upReq.on('error', function () { try { if (!clientRes.headersSent) clientRes.writeHead(502, { 'Access-Control-Allow-Origin': '*' }); clientRes.end(); } catch (x) {} });
  upReq.setTimeout(25000, function () {
    if (!clientRes.headersSent) {
      try { clientRes.writeHead(504, { 'Access-Control-Allow-Origin': '*' }); } catch (x) {}
      try { clientRes.end(); } catch (x) {}
    }
    try { upReq.abort(); } catch (e) {}
  });
  clientRes.on('close', function () { try { upReq.abort(); } catch (e) {} }); // ffmpeg drops the connection on every seek
  upReq.end();
}
function parseSrt(srt) {
  srt = srt.replace(/\r/g, '');
  var blocks = srt.split(/\n\n+/), cues = [];
  for (var b = 0; b < blocks.length; b++) {
    var lines = blocks[b].split('\n'), tc = -1;
    for (var i = 0; i < lines.length; i++) { if (lines[i].indexOf('-->') >= 0) { tc = i; break; } }
    if (tc < 0) continue;
    var m = lines[tc].match(/(\d+):(\d+):(\d+)[,.](\d+)\s*-->\s*(\d+):(\d+):(\d+)[,.](\d+)/);
    if (!m) continue;
    var s = (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]) + (+m[4]) / 1000;
    var e = (+m[5]) * 3600 + (+m[6]) * 60 + (+m[7]) + (+m[8]) / 1000;
    var txt = lines.slice(tc + 1).join('\n').replace(/<[^>]+>/g, '').replace(/\{[^}]*\}/g, '');
    if (txt) cues.push({ s: s, e: e, t: txt });
  }
  return cues;
}

// ---- embedded subtitles via windowed ffmpeg ----
// This TV's native player never hands MKV sub cues to JS, so we demux them
// ourselves: ffprobe lists the text tracks, ffmpeg pulls ~10min at a time.
var FFMPEG = process.env.TV_FFMPEG || path.join(DIR, 'bin', 'ffmpeg');   // env override = offline testing on the Mac
var FFPROBE = process.env.TV_FFPROBE || path.join(DIR, 'bin', 'ffprobe');
var IMG_SUB = { hdmv_pgs_subtitle: 1, dvd_subtitle: 1, dvb_subtitle: 1, xsub: 1, dvb_teletext: 1 };

function embTracks(u, res) {
  if (!u) return sendJson(res, { tracks: [], audioTracks: [] });
  var args = ['-v', 'error', '-print_format', 'json', '-show_entries',
    'stream=index,codec_type,codec_name,channels:stream_tags=language,title', localProxy(u)];
  var out = [], err = [], done = false, pr;
  function finish() {
    if (done) return; done = true; clearTimeout(to);
    var tracks = [], audioTracks = [], errStr = '';
    try {
      var j = JSON.parse(Buffer.concat(out).toString('utf8')), ss = j.streams || [], subTi = 0, subN = 0, audN = 0;
      for (var i = 0; i < ss.length; i++) {
        var s = ss[i], tg = s.tags || {}, lang = (tg.language || '').toLowerCase();
        var nm = langName(lang); if (tg.title) nm += ' — ' + tg.title;
        if (s.codec_type === 'subtitle') {
          if (IMG_SUB[s.codec_name || '']) continue; // image subs can't render as text
          tracks.push({ n: subN, ti: subTi, name: nm, lang: lang });
          subN++; subTi++;
        } else if (s.codec_type === 'audio') {
          var audLabel = nm;
          if (s.codec_name) audLabel += ' (' + s.codec_name.toUpperCase() + (s.channels ? ' ' + s.channels + 'ch' : '') + ')';
          audioTracks.push({ n: audN, index: s.index, name: audLabel, lang: lang });
          audN++;
        }
      }
    } catch (e) {
      errStr = (Buffer.concat(err).toString('utf8').split('\n')[0] || 'probe failed').slice(0, 160);
    }
    console.log('[embtracks] subs=' + tracks.length + ' audio=' + audioTracks.length + (errStr ? ' err=' + errStr : ''));
    sendJson(res, { tracks: tracks, audioTracks: audioTracks, err: (tracks.length || audioTracks.length) ? '' : errStr });
  }
  try { pr = spawn(FFPROBE, args); } catch (e) { return sendJson(res, { tracks: [], audioTracks: [], err: 'ffprobe missing' }); }
  var to = setTimeout(function () { try { pr.kill(); } catch (e) {} finish(); }, 20000);
  pr.stdout.on('data', function (d) { out.push(d); });
  pr.stderr.on('data', function (d) { err.push(d); });
  pr.on('error', function (e) { if (done) return; done = true; clearTimeout(to); sendJson(res, { tracks: [], audioTracks: [], err: 'ffprobe error: ' + (e && e.code || e) }); });
  pr.on('close', finish);
}

// ---- progressive embedded-subtitle extraction ----
// The windowed approach failed: every window re-seeked the container over the network
// and got truncated. But a straight sequential read measured ~9x realtime on this TV.
// So: ONE ffmpeg reading from the playhead to EOF, cues parsed as they stream out,
// the player polls for increments, and finished tracks are cached on disk so a file
// is only ever extracted once.
var crypto = require('crypto');
var SUBCACHE = path.join(DIR, 'subcache');
try { fs.mkdirSync(SUBCACHE); } catch (e) {}
function subKey(q) {
  var tail = String(q.u || '').split('/').pop().slice(0, 48);
  return crypto.createHash('sha1').update((q.id || '') + '|' + (q.vid || '') + '|' + (q.n || 0) + '|' + tail).digest('hex');
}
function pruneSubcache() {
  try {
    var fl = fs.readdirSync(SUBCACHE);
    if (fl.length <= 40) return;
    var st = [];
    for (var i = 0; i < fl.length; i++) { try { st.push({ f: fl[i], m: fs.statSync(path.join(SUBCACHE, fl[i])).mtimeMs }); } catch (e) {} }
    st.sort(function (a, b) { return a.m - b.m; });
    for (var j = 0; j < st.length - 40; j++) { try { fs.unlinkSync(path.join(SUBCACHE, st[j].f)); } catch (e) {} }
  } catch (e) {}
}
var embJob = null; // single slot (low-RAM TV)
function killJob() {
  if (!embJob) return;
  try { if (embJob.pr) embJob.pr.kill('SIGKILL'); } catch (e) {}
  embJob = null;
}
function spawnJobProc(job, fromT) {
  job.baseT = fromT;
  job.tail = '';
  job.startedAt = Date.now();
  var args = ['-nostdin'];
  if (fromT > 0) args.push('-ss', String(fromT));
  // -copyts: keep ORIGINAL absolute timestamps. Without it, -ss output may be seek-relative
  // or absolute depending on the file, which silently desynced mid-file extractions.
  args.push('-i', localProxy(job.u), '-copyts', '-map', '0:s:' + job.n, '-f', 'srt', 'pipe:1');
  var pr;
  try { pr = spawn(FFMPEG, args); } catch (e) { job.done = true; job.err = 'spawn failed'; return; }
  job.pr = pr;
  pr.stdout.on('data', function (d) {
    if (embJob !== job || job.pr !== pr) return;
    job.tail += d.toString('utf8');
    // parse only COMPLETE srt blocks; keep the trailing partial block for the next chunk
    var cut = job.tail.lastIndexOf('\n\n');
    if (cut < 0) return;
    var ready = job.tail.slice(0, cut);
    job.tail = job.tail.slice(cut + 2);
    var cues = parseSrt(ready);
    for (var i = 0; i < cues.length; i++) {
      // -copyts => timestamps are already absolute; no offset arithmetic
      job.cues.push(cues[i]);
      if (cues[i].e > job.frontier) job.frontier = cues[i].e;
    }
  });
  pr.stderr.on('data', function (d) { job.errTail = (job.errTail + d.toString('utf8')).slice(-400); });
  pr.on('error', function () { if (embJob === job && job.pr === pr) { job.done = true; job.err = 'ffmpeg error'; } });
  pr.on('close', function (code) {
    if (embJob !== job || job.pr !== pr) return;
    var last = parseSrt(job.tail); // flush the final block (timestamps already absolute via -copyts)
    for (var i = 0; i < last.length; i++) job.cues.push(last[i]);
    job.tail = ''; job.pr = null; job.done = true;
    var secs = ((Date.now() - job.startedAt) / 1000) | 0;
    console.log('[embjob] done key=' + job.key.slice(0, 8) + ' cues=' + job.cues.length + ' base=' + job.baseT + ' took=' + secs + 's code=' + code);
    // cache only full-coverage runs (started at the very beginning) that yielded cues
    if (code === 0 && job.baseT <= 5 && job.cues.length) {
      try { fs.writeFileSync(path.join(SUBCACHE, job.key + '.json'), JSON.stringify({ v: 1, cues: job.cues })); pruneSubcache(); } catch (e) {}
    }
  });
}
function embStart(q, res) {
  if (!q.u) return sendJson(res, { err: 'no url' });
  var key = subKey(q), n = parseInt(q.n || '0', 10) || 0, t = Math.max(0, Math.floor(parseFloat(q.t || '0') || 0));
  // instant path: already extracted this track before
  try {
    var cachedRaw = fs.readFileSync(path.join(SUBCACHE, key + '.json'), 'utf8');
    var cached = JSON.parse(cachedRaw);
    if (cached && cached.cues && cached.cues.length) {
      console.log('[embjob] cache hit key=' + key.slice(0, 8) + ' cues=' + cached.cues.length);
      return sendJson(res, { cached: true, done: true, cues: cached.cues });
    }
  } catch (e) {}
  if (embJob && embJob.key === key && !embJob.err) {
    return sendJson(res, { started: true, cues: embJob.cues, done: embJob.done });
  }
  killJob();
  // start slightly behind the playhead; if they later rewind past this, we restart from 0
  var from = Math.max(0, t - 30);
  embJob = { key: key, u: q.u, n: n, cues: [], frontier: from, baseT: from, done: false, err: '', errTail: '', lastPoll: Date.now(), pr: null, tail: '' };
  spawnJobProc(embJob, from);
  console.log('[embjob] start key=' + key.slice(0, 8) + ' n=' + n + ' from=' + from);
  sendJson(res, { started: true, cues: [], done: false });
}
function embCues(q, res) {
  var key = subKey(q), since = parseInt(q.since || '0', 10) || 0, t = parseFloat(q.t || '0') || 0;
  if (!embJob || embJob.key !== key) return sendJson(res, { cues: [], done: true, gone: true });
  var job = embJob;
  job.lastPoll = Date.now();
  // user rewound before our start point -> restart from 0 (keeps already-parsed cues)
  if (!job.done && job.baseT > 5 && t > 0 && t < job.baseT - 5 && !job.restarted0) {
    job.restarted0 = true;
    try { if (job.pr) job.pr.kill('SIGKILL'); } catch (e) {}
    console.log('[embjob] rewind -> restart from 0');
    spawnJobProc(job, 0);
  }
  // user jumped far past the extraction frontier -> hop the reader forward
  else if (!job.done && t > job.frontier + 300 && !job.hopped) {
    job.hopped = true; // one hop per job keeps it simple; cache is skipped anyway once baseT>5
    try { if (job.pr) job.pr.kill('SIGKILL'); } catch (e) {}
    console.log('[embjob] far seek -> hop to ' + ((t - 30) | 0));
    spawnJobProc(job, Math.max(0, Math.floor(t - 30)));
  }
  sendJson(res, { cues: job.cues.slice(since), done: job.done, err: job.err });
}
// reap the job if the player stopped polling (left playback)
setInterval(function () {
  if (embJob && (Date.now() - embJob.lastPoll) > 90000) { console.log('[embjob] idle reap'); killJob(); }
}, 30000);

// ---- YouTube trailer resolver ----
// Innertube ANDROID first (direct googlevideo mp4 when Google allows it), then
// public Piped instances (they proxy the stream themselves, so their URL plays
// from anywhere). The final URL is wrapped in our localhost /proxy so the TV's
// old TLS/CA stack never talks to the outside world.
var ytCache = {}; // videoId -> { lo, hi, at }  (lo=360p-ish, hi=720p-ish)
var PIPED = [
  'https://api.piped.private.coffee',
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.ducks.party',
  'https://pipedapi.reallyaweso.me',
  'https://pipedapi.adminforge.de'
];
var pipedGood = -1; // remember the instance that worked last
var pipedBad = {};   // instance idx -> last-failure ts (3min cooldown)
var ytFail = {};     // videoId -> ts (10min negative cache; stop hammering dead videos)
function postJsonUpstream(host, path, headers, body, cb) {
  var req = https.request({ hostname: host, path: path, method: 'POST', headers: headers }, function (r) {
    var chunks = [];
    r.on('data', function (d) { chunks.push(d); });
    r.on('end', function () {
      var buf = Buffer.concat(chunks);
      if (buf.length > 1 && buf[0] === 0x1f && buf[1] === 0x8b) { try { buf = zlib.gunzipSync(buf); } catch (e) {} }
      try { cb(JSON.parse(buf.toString('utf8'))); } catch (e) { cb(null); }
    });
  });
  req.on('error', function () { cb(null); });
  req.setTimeout(10000, function () { try { req.abort(); } catch (e) {} });
  req.end(body);
}
function ytInnertube(vid, cb) {
  var body = JSON.stringify({
    videoId: vid,
    context: { client: { clientName: 'ANDROID', clientVersion: '19.09.37', androidSdkVersion: 30, hl: 'en', gl: 'US' } },
    contentCheckOk: true, racyCheckOk: true
  });
  postJsonUpstream('www.youtube.com', '/youtubei/v1/player?prettyPrint=false', {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
    'User-Agent': 'com.google.android.youtube/19.09.37 (Linux; U; Android 11) gzip',
    'X-Youtube-Client-Name': '3',
    'X-Youtube-Client-Version': '19.09.37'
  }, body, function (j) {
    if (!j) return cb(null);
    var fm = (j.streamingData && j.streamingData.formats) || [];
    var out = { lo: '', hi: '' };
    for (var i = 0; i < fm.length; i++) {
      var f = fm[i];
      if (!f.url || String(f.mimeType || '').indexOf('video/mp4') !== 0) continue;
      if (f.itag === 22) out.hi = f.url;
      else if (f.itag === 18) out.lo = f.url;
      else if (!out.lo) out.lo = f.url;
    }
    cb((out.lo || out.hi) ? out : null);
  });
}
function ytPiped(vid, idx, cb) {
  var now = Date.now(), fresh = [], cooling = [];
  function push(i) { ((pipedBad[i] && now - pipedBad[i] < 180000) ? cooling : fresh).push(i); }
  if (pipedGood >= 0) push(pipedGood);
  for (var i = 0; i < PIPED.length; i++) if (i !== pipedGood) push(i);
  var order = fresh.concat(cooling); // throttled instances only as a last resort
  function tryOne(k) {
    if (k >= order.length) return cb(null);
    var ii = order[k];
    var u = PIPED[ii] + '/streams/' + encodeURIComponent(vid);
    fetchJson(u, function (j) {
      var vs = (j && j.videoStreams) || [];
      var out = { lo: '', hi: '' };
      for (var s = 0; s < vs.length; s++) {
        var v = vs[s];
        if (v.videoOnly || !v.url || String(v.mimeType || '').indexOf('video/mp4') !== 0) continue;
        var q = parseInt(v.quality, 10) || 0;
        if (q >= 480) { if (!out.hi) out.hi = v.url; }
        else if (!out.lo) out.lo = v.url;
      }
      if (out.lo || out.hi) { pipedGood = ii; delete pipedBad[ii]; dbg('[yt] piped ok via ' + PIPED[ii]); return cb(out); }
      if (!j) pipedBad[ii] = Date.now(); // network/parse fail -> cool this instance down
      tryOne(k + 1);
    });
  }
  tryOne(0);
}
function ytResolve(vid, lq, cb) {
  if (!/^[\w-]{6,16}$/.test(vid)) return cb('', 'bad id');
  function pick(cc) {
    var u = lq ? (cc.lo || cc.hi) : (cc.hi || cc.lo);
    return u ? localProxy(u) : ''; // play through our proxy: node's TLS, Range honoured
  }
  var c = ytCache[vid];
  if (c && (Date.now() - c.at) < 2 * 3600 * 1000) { var u0 = pick(c); return cb(u0, u0 ? '' : 'no format'); }
  if (ytFail[vid] && (Date.now() - ytFail[vid]) < 180000) return cb('', 'unavailable'); // retry after 3min (mirror outages recover)
  ytInnertube(vid, function (a) {
    if (a) { a.at = Date.now(); ytCache[vid] = a; return cb(pick(a), ''); }
    ytPiped(vid, 0, function (b) {
      if (b) { b.at = Date.now(); ytCache[vid] = b; return cb(pick(b), ''); }
      ytFail[vid] = Date.now();
      dbg('[yt] ' + vid + ' unresolved');
      cb('', 'unavailable');
    });
  });
}

// ---- stream tech-info probe (for the paused-player vignette badges) ----
var probeCache = {};
function probeInfo(u, res) {
  if (!u) return sendJson(res, {});
  if (probeCache[u]) return sendJson(res, probeCache[u]);
  var args = ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', localProxy(u)];
  var out = [], done = false, pr;
  function finish() {
    if (done) return; done = true; clearTimeout(to);
    var info = {};
    try {
      var j = JSON.parse(Buffer.concat(out).toString('utf8'));
      var ss = j.streams || [], fmtI = j.format || {}, vs = null, as = null;
      for (var i = 0; i < ss.length; i++) {
        var cn = String(ss[i].codec_name || '');
        if (!vs && ss[i].codec_type === 'video' && cn !== 'mjpeg' && cn !== 'png') vs = ss[i];
        if (!as && ss[i].codec_type === 'audio') as = ss[i];
      }
      if (vs) {
        var h = vs.height || 0;
        info.res = h >= 2000 ? '4K' : (h >= 1000 ? '1080p' : (h >= 690 ? '720p' : (h ? h + 'p' : '')));
        var vc = String(vs.codec_name || '').toLowerCase();
        info.vcodec = vc === 'hevc' ? 'HEVC' : (vc === 'h264' ? 'H.264' : (vc === 'av1' ? 'AV1' : vc.toUpperCase()));
        var trc = String(vs.color_transfer || '').toLowerCase();
        if (String(vs.codec_tag_string || '').toLowerCase().indexOf('dvh') === 0) info.hdr = 'Dolby Vision';
        else if (trc === 'smpte2084') info.hdr = 'HDR10';
        else if (trc === 'arib-std-b67') info.hdr = 'HLG';
        var sd = vs.side_data_list || [];
        for (var s2 = 0; s2 < sd.length; s2++) { if (String(sd[s2].side_data_type || '').toLowerCase().indexOf('dovi') >= 0) info.hdr = 'Dolby Vision'; }
      }
      if (as) {
        var ac = String(as.codec_name || '').toLowerCase();
        var nm = ac === 'eac3' ? 'Dolby Digital+' : (ac === 'ac3' ? 'Dolby Digital' : (ac === 'truehd' ? 'Dolby TrueHD' : (ac.indexOf('dts') === 0 ? 'DTS' : ac.toUpperCase())));
        var ch = as.channels || 0;
        var lay = ch === 8 ? '7.1' : (ch === 6 ? '5.1' : (ch === 2 ? '2.0' : (ch ? ch + 'ch' : '')));
        info.audio = nm + (lay ? ' ' + lay : '');
      }
      var sz = parseInt(fmtI.size || '0', 10);
      if (sz > 0) info.size = sz >= 1073741824 ? (Math.round(sz / 107374182.4) / 10) + ' GB' : Math.round(sz / 1048576) + ' MB';
      var br = parseInt(fmtI.bit_rate || '0', 10);
      if (br > 0) info.br = (Math.round(br / 100000) / 10) + ' Mb/s';
    } catch (e) {}
    if (Object.keys(probeCache).length > 20) probeCache = {};
    probeCache[u] = info;
    console.log('[probe] ' + JSON.stringify(info));
    sendJson(res, info);
  }
  try { pr = spawn(FFPROBE, args); } catch (e) { return sendJson(res, {}); }
  var to = setTimeout(function () { try { pr.kill(); } catch (e) {} finish(); }, 25000);
  pr.stdout.on('data', function (d) { out.push(d); });
  pr.on('error', function () { finish(); });
  pr.on('close', finish);
}

// ---- scrub-preview: background coarse-sprite cache (Netflix-style, adapted for a remote
// stream on weak hardware). On player load /spritegen extracts ~SPRITE_N evenly-spaced
// thumbnails ONE AT A TIME in the background; /frame snaps the seek target to the nearest
// already-extracted bucket and serves it INSTANTLY (204 while that region isn't ready yet).
// The header/Cues are fetched once by the first seek, so each extra thumb is cheap.
function spriteGen(q, res) {
  // Desativado no cliente low-RAM para evitar picos de CPU e estouro de memória (OOM)
  sendJson(res, { ok: false });
}

function bgResize(q, res) {
  var u = q.u || '';
  if (!u) { res.writeHead(404); res.end(); return; }
  if (u.indexOf('images.metahub.space') >= 0) {
    u = u.replace(/(images\.metahub\.space\/background\/)[a-z]+\//, '$1medium/');
  }
  // Redirecionamento 302 direto: sem armazenar buffers de imagens na memória RAM do Node
  res.writeHead(302, { 'Location': u, 'Access-Control-Allow-Origin': '*' });
  res.end();
}

function grabFrame(q, res) {
  var u = q.u || '', t = Math.max(0, parseInt(q.t || '0', 10) || 0);
  if (!u) { res.writeHead(404); res.end(); return; }
  if (spriteJob && spriteJob.key === spriteKeyOf(u)) {
    var job = spriteJob, b = job.buckets;
    // nearest BAKED bucket
    var best = -1, bd = 1e9;
    for (var i = 0; i < b.length; i++) { if (job.frames[i] != null) { var d = Math.abs(b[i] - t); if (d < bd) { bd = d; best = i; } } }
    // nearest bucket overall; if it isn't baked yet, bump it to the FRONT of the queue so
    // the region being scrubbed bakes next (priority-on-demand)
    var want = -1, wd = 1e9;
    for (var j = 0; j < b.length; j++) { var dj = Math.abs(b[j] - t); if (dj < wd) { wd = dj; want = j; } }
    if (want >= 0 && job.frames[want] == null && !job.done) {
      var qi = job.queue.indexOf(want);
      if (qi > 0) { job.queue.splice(qi, 1); job.queue.unshift(want); }
    }
    if (best >= 0) { res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' }); res.end(job.frames[best]); return; }
  }
  res.writeHead(204); res.end();
}

var mainServer = http.createServer(function (req, res) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': '*'
    });
    res.end();
    return;
  }
  var p = req.url.split('?')[0];
  var q = urlmod.parse(req.url, true).query;
  if (p === '/ping') {
    // Instant readiness probe for the app launcher — proves :8080 is bound so it can
    // redirect here instead of guessing on a timer (which races a cold node start).
    res.writeHead(200, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' });
    res.end('ok');
  } else if (p === '/log') {
    console.log('[clientlog] ' + JSON.stringify(q));
    res.writeHead(200, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' });
    res.end('ok');
  } else if (p === '/' || p === '/index.html') {
    waitForServer(function () { serveShell(res); });
  } else if (p === '/beta') {
    // The custom Netflix-like shell — a real file on disk (never strings-in-strings again).
    // Read per-request: tiny file, always fresh after an scp, no restart needed.
    // NO waitForServer here: unlike the v4 shell, beta doesn't need :11470 at boot
    // (only torrent playback does, and server.js starts in parallel) — faster cold start.
    fs.readFile(path.join(DIR, 'beta.html'), function (err, buf) {
      if (err) { res.writeHead(404); res.end('beta shell missing'); return; }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(buf);
    });
  } else if (p === '/play') {
    var stream = decodeStreamToken(q.token || '');
    if (!stream && q.u) stream = { url: q.u }; // beta shell passes the stream URL directly
    if (!stream || !stream.url) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<body style="background:#000;color:#fff;font-family:sans-serif;text-align:center;padding-top:40vh">Não foi possível ler o link do vídeo. <a style="color:#ff0000;font-weight:bold" href="http://127.0.0.1:8080/beta">Voltar ao Stremio</a></body>');
      return;
    }
    if (stream.url.indexOf(':11470') >= 0) {
      ensureStreamingServer();
    }
    var ctx = {
      type: q.type || '',
      id: q.id || '',
      vid: q.vid || '',
      back: q.back || '',
      name: q.name || q.title || '',
      meta: {
        name: q.name || q.title || '',
        logo: q.logo || '',
        background: q.bg || q.background || q.poster || '',
        poster: q.poster || '',
        cert: q.cert || ''
      }
    };
    var vid = ctx.vid || '';
    if (vid.indexOf(':') >= 0) {
      var pp = vid.split(':');
      ctx.episode = pp[pp.length - 1];
      ctx.season = pp[pp.length - 2];
      ctx.nextVid = pp[0] + ':' + ctx.season + ':' + (parseInt(ctx.episode, 10) + 1);
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(playerPage(stream, ctx));
  } else if (p === '/meta') {
    fetchJson('https://v3-cinemeta.strem.io/meta/' + encodeURIComponent(q.type || 'movie') + '/' + encodeURIComponent(q.id || '') + '.json', function (j) {
      var meta = (j && j.meta) || {};
      sendJson(res, { name: meta.name || '', poster: (meta.poster || '').replace('/small/', '/medium/'), background: meta.background || meta.poster || '', logo: meta.logo || '' });
    });
  } else if (p === '/subs') {
    fetchJson('https://opensubtitles-v3.strem.io/subtitles/' + encodeURIComponent(q.type || 'movie') + '/' + encodeURIComponent(q.vid || '') + '.json', function (j) {
      var subs = (j && j.subtitles) || [], out = [], per = {};
      for (var i = 0; i < subs.length; i++) {
        var lang = (subs[i].lang || '').toLowerCase();
        if (!lang || !subs[i].url) continue;
        per[lang] = (per[lang] || 0) + 1;
        if (per[lang] > 12) continue; // cap per language
        out.push({ lang: lang, name: langName(lang), u: subs[i].url, n: per[lang] });
      }
      out.sort(function (a, b) { if (a.lang === 'eng' && b.lang !== 'eng') return -1; if (b.lang === 'eng' && a.lang !== 'eng') return 1; if (a.name !== b.name) return a.name < b.name ? -1 : 1; return a.n - b.n; });
      sendJson(res, { subtitles: out });
    });
  } else if (p === '/sub') {
    fetchUrl(q.u || '', function (buf) { sendJson(res, { cues: buf ? parseSrt(buf.toString('utf8')) : [] }); });
  } else if (p === '/proxy') {
    var orig = q.u || '';
    var c = resolveCache[orig];
    var start = (c && (Date.now() - c.at) < 120000) ? c.url : orig; // reuse a fresh resolved CDN url
    proxyStream(start, req.headers.range, req.method, res, orig, 0, false);
  } else if (p === '/watchedbits') {
    // Decode Stremio's watched bitfield: "<anchorVideoId>:<anchorLen>:<zlib-b64>".
    // The browser has no zlib, so we inflate here and hand back raw bits.
    var wf = String(q.f || '');
    var wparts = wf.split(':');
    var wb64 = wparts.pop();
    var walen = parseInt(wparts.pop(), 10) || 0;
    var wanchor = wparts.join(':');
    var wbits = [];
    try {
      var wbuf = zlib.inflateSync(Buffer.from(wb64, 'base64'));
      for (var wi = 0; wi < wbuf.length * 8; wi++) wbits.push((wbuf[wi >> 3] & (0x80 >> (wi % 8))) ? 1 : 0);
    } catch (e) {}
    sendJson(res, { anchor: wanchor, alen: walen, bits: wbits });
  } else if (p === '/logo.png') {
    if (LOGO_PNG) { res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'max-age=86400', 'Access-Control-Allow-Origin': '*' }); res.end(LOGO_PNG); }
    else { res.writeHead(404); res.end(); }
  } else if (p === '/yt') {
    ytResolve(String(q.v || ''), !!q.lq, function (url, err) { sendJson(res, url ? { url: url } : { err: err || 'unavailable' }); });
  } else if (p === '/probe') {
    probeInfo(q.u || '', res);
  } else if (p === '/frame') {
    grabFrame(q, res);
  } else if (p === '/spritegen') {
    spriteGen(q, res);
  } else if (p === '/bgz') {
    bgResize(q, res);
  } else if (p === '/embtracks') {
    embTracks(q.u || '', res);
  } else if (p === '/embstart') {
    embStart(q, res);
  } else if (p === '/embcues') {
    embCues(q, res);
  } else {
    res.writeHead(302, { Location: SHELL_URL.replace(/\/$/, '') + req.url });
    res.end();
  }
});
mainServer.on('error', function (err) {
  if (err && err.code === 'EADDRINUSE') {
    dbg('port ' + PORT + ' already in use by another instance, exiting duplicate');
    process.exit(0);
  }
});
mainServer.listen(PORT, '127.0.0.1', function () {
  dbg('listening on :' + PORT); console.log('tvserver on :' + PORT);
  fetchShell(function () { dbg('shell prewarmed'); });
});
