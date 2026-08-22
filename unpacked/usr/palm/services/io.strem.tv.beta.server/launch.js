// webOS service for io.strem.tv. Runs under the TV's (old) service Node runtime,
// so this file stays ES5 and minimal. On "start" it spawns ONE node18 child —
// tvserver.js — which itself starts the streaming server (server.js) and serves
// the injected v4 web shell on :8080. Then it waits until :8080 is up and
// reports ready. (Single-child spawn is the pattern that works reliably here.)

// webos-service lives in the system node_modules; make require() find it.
process.env.NODE_PATH = (process.env.NODE_PATH || '') + ':/usr/lib/node_modules:/usr/lib/nodejs';
require('module').Module._initPaths();

var Service = require('webos-service');
var path = require('path');
var net = require('net');
var fs = require('fs');
var spawn = require('child_process').spawn;

var DIR = __dirname;
function dbg(m) { try { fs.appendFileSync(path.join(DIR, 'launch.log'), new Date().toISOString() + ' ' + m + '\n'); } catch (e) {} }
dbg('launch.js loaded, uid=' + (process.getuid ? process.getuid() : '?'));
var LOADER = '/lib/ld-linux.so.3';
var NODE = path.join(DIR, 'bin', 'node18');
var LIB = path.join(DIR, 'bin', 'lib');
var SUPERVISOR = path.join(DIR, 'tvserver.js');
var APP_PORT = 8080;

var service = new Service('io.strem.tv.beta.server');
service.activityManager.create('keepAlive', function() {});

var spawned = false;

function isUp(cb) {
  var s = net.connect(APP_PORT, '127.0.0.1');
  var settled = false;
  function finish(v) { if (!settled) { settled = true; try { s.destroy(); } catch (e) {} cb(v); } }
  s.on('connect', function() { finish(true); });
  s.on('error', function() { finish(false); });
  setTimeout(function() { finish(false); }, 1000);
}

function startSupervisor() {
  if (spawned) return;
  spawned = true;
  var env = {};
  for (var k in process.env) { env[k] = process.env[k]; }
  env.HOME = env.HOME || '/home/root';
  env.USER = env.USER || 'root';
  env.FFMPEG_BIN = path.join(DIR, 'bin', 'ffmpeg');
  env.FFPROBE_BIN = path.join(DIR, 'bin', 'ffprobe');
  dbg('spawning supervisor: ' + LOADER + ' ' + NODE + ' ' + SUPERVISOR);
  var child;
  try {
    child = spawn(LOADER, ['--library-path', LIB, NODE, SUPERVISOR], {
      cwd: DIR, env: env, detached: true, stdio: 'ignore'
    });
  } catch (e) { dbg('spawn threw: ' + e.message); spawned = false; return; }
  child.on('error', function(e) { spawned = false; dbg('child error: ' + e.message); });
  child.on('exit', function(code, sig) { dbg('child exit code=' + code + ' sig=' + sig); });
  dbg('spawned pid=' + child.pid);
  child.unref();
}

function waitUp(cb, tries) {
  tries = tries || 0;
  isUp(function(up) {
    if (up) return cb(true);
    if (tries > 60) return cb(false);
    setTimeout(function() { waitUp(cb, tries + 1); }, 500);
  });
}

service.register('start', function(message) {
  isUp(function(up) {
    if (!up) startSupervisor();
    waitUp(function(ok) { message.respond({ ready: ok }); });
  });
});
