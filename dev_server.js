const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const urlmod = require('url');

const PORT = 8080;
const DIR = path.join(__dirname, 'unpacked', 'usr', 'palm', 'services', 'io.strem.tv.beta.server');

const server = http.createServer((req, res) => {
  const parsed = urlmod.parse(req.url, true);
  const p = parsed.pathname;

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  if (p === '/' || p === '/beta' || p === '/beta.html') {
    const htmlPath = path.join(DIR, 'beta.html');
    if (fs.existsSync(htmlPath)) {
      const html = fs.readFileSync(htmlPath, 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    } else {
      res.writeHead(404);
      res.end('beta.html not found');
    }
  } else if (p === '/logo.png') {
    const logoPath = path.join(DIR, 'stremio-logo.png');
    const fallbackLogo = path.join(__dirname, 'icon.png');
    const targetPath = fs.existsSync(logoPath) ? logoPath : fallbackLogo;
    if (fs.existsSync(targetPath)) {
      res.writeHead(200, { 'Content-Type': 'image/png' });
      res.end(fs.readFileSync(targetPath));
    } else {
      res.writeHead(404);
      res.end();
    }
  } else if (p === '/bgz') {
    const targetUrl = parsed.query.u;
    if (!targetUrl) {
      res.writeHead(400);
      res.end('Missing u param');
      return;
    }
    const client = targetUrl.startsWith('https') ? https : http;
    client.get(targetUrl, (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res);
    }).on('error', () => {
      res.writeHead(500);
      res.end();
    });
  } else if (p === '/yt') {
    // Return direct embedded URL or status
    const vid = parsed.query.v;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ytId: vid, status: 'ok' }));
  } else if (p === '/ping') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('pong');
  } else {
    res.writeHead(404);
    res.end('Not Found');
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`StremioBrew Web Server running at http://localhost:${PORT}/beta`);
});
