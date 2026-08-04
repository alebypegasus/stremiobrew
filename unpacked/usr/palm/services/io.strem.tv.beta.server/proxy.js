var http = require('http');
var fs = require('fs');
var path = require('path');

var WWW = path.join(__dirname, 'www');
var SERVER_PORT = 11470;

var MIME = {
  '.html':'text/html','.js':'application/javascript','.css':'text/css',
  '.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg',
  '.ico':'image/x-icon','.gif':'image/gif','.webp':'image/webp',
  '.ttf':'font/ttf','.woff':'font/woff','.woff2':'font/woff2',
  '.svg':'image/svg+xml','.wasm':'application/wasm','.json':'application/json',
  '.map':'application/json','.txt':'text/plain','.mp3':'audio/mpeg'
};

function serveStatic(req, res, next) {
  var urlPath = req.url.split('?')[0];
  if (urlPath === '/') urlPath = '/index.html';
  var filePath = path.join(WWW, urlPath);
  if (filePath.indexOf(WWW) !== 0) return next();
  fs.stat(filePath, function(err, stat) {
    if (err || !stat.isFile()) return next();
    var ext = path.extname(filePath).toLowerCase();
    var ct = MIME[ext] || 'application/octet-stream';
    var headers = {'Content-Type': ct, 'Content-Length': stat.size};
    if (ext === '.wasm') headers['Content-Type'] = 'application/wasm';
    res.writeHead(200, headers);
    fs.createReadStream(filePath).pipe(res);
  });
}

function proxyToServer(req, res) {
  var opts = {
    hostname: '127.0.0.1',
    port: SERVER_PORT,
    path: req.url,
    method: req.method,
    headers: req.headers
  };
  opts.headers['host'] = '127.0.0.1:' + SERVER_PORT;
  var p = http.request(opts, function(pr) {
    res.writeHead(pr.statusCode, pr.headers);
    pr.pipe(res);
  });
  p.on('error', function() {
    res.writeHead(502);
    res.end('Server not running');
  });
  req.pipe(p);
}

http.createServer(function(req, res) {
  serveStatic(req, res, function() {
    proxyToServer(req, res);
  });
}).listen(8080, function() {
  console.log('Stremio TV on :8080 (frontend from www/, API proxy to :' + SERVER_PORT + ')');
});
