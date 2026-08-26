process.env.NODE_PATH = (process.env.NODE_PATH || '') + ':/usr/lib/node_modules:/usr/lib/nodejs';
require('module').Module._initPaths();
process.env.APP_PATH = process.env.APP_PATH || __dirname;

var http = require('http');
var fs = require('fs');
var path = require('path');
var Service = require('webos-service');

var service = new Service('io.strem.tv.server');
var ready = false;
var pendingMessages = [];

// Keep the service alive indefinitely
service.activityManager.create('keepAlive', function() {});

// Register the start method — responds once the HTTP server is listening
service.register('start', function(message) {
    if (ready) {
        message.respond({ ready: true });
    } else {
        pendingMessages.push(message);
    }
});

// Static file serving with High-Performance In-Memory RAM Cache
var wwwDir = path.join(__dirname, 'www');
var mimeTypes = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.ico': 'image/x-icon',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.ttf': 'font/ttf',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.svg': 'image/svg+xml',
    '.wasm': 'application/wasm',
    '.json': 'application/json; charset=utf-8',
    '.map': 'application/json; charset=utf-8',
    '.txt': 'text/plain; charset=utf-8',
    '.mp3': 'audio/mpeg'
};

var memoryCache = Object.create(null);

// Pre-cache core files in RAM for instant 0ms latency on TV navigation
function preloadStaticFiles() {
    try {
        if (!fs.existsSync(wwwDir)) return;
        var files = fs.readdirSync(wwwDir);
        files.forEach(function(file) {
            var fullPath = path.join(wwwDir, file);
            try {
                var stat = fs.statSync(fullPath);
                if (stat.isFile() && stat.size <= 10 * 1024 * 1024) { // Cache files up to 10MB (includes WASM)
                    var data = fs.readFileSync(fullPath);
                    var ext = path.extname(file).toLowerCase();
                    memoryCache['/' + file] = {
                        data: data,
                        ext: ext,
                        size: stat.size
                    };
                }
            } catch (_) {}
        });
        // Also map root / to index.html
        if (memoryCache['/index.html']) {
            memoryCache['/'] = memoryCache['/index.html'];
        }
    } catch (_) {}
}
preloadStaticFiles();

function serveStatic(urlPath, res, next) {
    var cached = memoryCache[urlPath];
    if (cached) {
        var isHtml = cached.ext === '.html';
        res.writeHead(200, {
            'Content-Type': mimeTypes[cached.ext] || 'application/octet-stream',
            'Content-Length': cached.size,
            'Cache-Control': isHtml ? 'no-cache, no-store, must-revalidate' : 'public, max-age=31536000, immutable',
            'Access-Control-Allow-Origin': '*'
        });
        res.end(cached.data);
        return;
    }

    // Fallback for uncached / dynamic paths
    var filePath = path.join(wwwDir, urlPath === '/' ? 'index.html' : urlPath);
    if (filePath.indexOf(wwwDir) !== 0) return next();

    fs.stat(filePath, function(err, stat) {
        if (err || !stat.isFile()) return next();
        var ext = path.extname(filePath).toLowerCase();
        var isHtml = ext === '.html';
        res.writeHead(200, {
            'Content-Type': mimeTypes[ext] || 'application/octet-stream',
            'Content-Length': stat.size,
            'Cache-Control': isHtml ? 'no-cache, no-store, must-revalidate' : 'public, max-age=31536000, immutable',
            'Access-Control-Allow-Origin': '*'
        });
        var stream = fs.createReadStream(filePath);
        stream.on('error', function() { try { res.end(); } catch (_) {} });
        stream.pipe(res);
    });
}

// Keep-Alive HTTP Proxy Agent for ultra-fast streaming communication
var proxyAgent = new http.Agent({
    keepAlive: true,
    maxSockets: 64,
    keepAliveMsecs: 30000
});

function proxyToStreaming(req, res) {
    var opts = {
        hostname: '127.0.0.1',
        port: 11470,
        path: req.url,
        method: req.method,
        headers: req.headers,
        agent: proxyAgent
    };
    var proxy = http.request(opts, function(proxyRes) {
        res.writeHead(proxyRes.statusCode, proxyRes.headers);
        proxyRes.pipe(res);
    });
    proxy.on('error', function() {
        res.writeHead(502, { 'Content-Type': 'text/plain' });
        res.end('Streaming server proxy error');
    });
    req.pipe(proxy);
}

// Single server: static RAM cache first, then proxy to streaming server
var server = http.createServer(function(req, res) {
    var urlPath = req.url.split('?')[0];
    serveStatic(urlPath, res, function() {
        proxyToStreaming(req, res);
    });
});

server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;

server.listen(8080, function() {
    ready = true;
    // Respond to any start calls that arrived before the server was ready
    pendingMessages.forEach(function(msg) { msg.respond({ ready: true }); });
    pendingMessages = [];
});

// Point the streaming server at the bundled ffmpeg binaries.
process.env.FFMPEG_BIN = path.join(__dirname, 'bin', 'ffmpeg');
process.env.FFPROBE_BIN = path.join(__dirname, 'bin', 'ffprobe');
process.env.NO_CORS = '1';

require('./server.js');
