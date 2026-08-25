const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

console.log('--- Starting Stremio Lite LG Build System ---');

const VERSION = '5.0.1';
const IPK_NAME = `io.strem.tv.beta_${VERSION}_all.ipk`;

// 1. Pack data.tar.gz from unpacked/
console.log('1. Compressing data.tar.gz...');
execSync('cd unpacked && tar -czf ../data.tar.gz .', { stdio: 'inherit' });

// 2. Pack control.tar.gz from control_unpacked/
console.log('2. Compressing control.tar.gz...');
execSync('cd control_unpacked && tar -czf ../control.tar.gz .', { stdio: 'inherit' });

// 3. Create debian-binary
fs.writeFileSync('debian-binary', '2.0\n');

// 4. Create standard Debian/opkg .ipk archive (pure JS ar implementation for deterministic output)
console.log(`3. Packaging ${IPK_NAME}...`);
function createArArchive(files, outputPath) {
  const buffers = [Buffer.from('!<arch>\n', 'ascii')];
  
  for (const file of files) {
    const filename = path.basename(file.name);
    const content = file.data;
    const size = content.length;
    
    // 60-byte ar header
    const header = Buffer.alloc(60, 0x20); // fill with spaces
    header.write(filename, 0, 16, 'ascii'); // Name
    header.write(String(Math.floor(Date.now() / 1000)), 16, 12, 'ascii'); // Timestamp
    header.write('0', 28, 6, 'ascii'); // Owner
    header.write('0', 34, 6, 'ascii'); // Group
    header.write('100644', 40, 8, 'ascii'); // Mode
    header.write(String(size), 48, 10, 'ascii'); // Size
    header.write('`\n', 58, 2, 'ascii'); // Magic end
    
    buffers.push(header);
    buffers.push(content);
    
    // 2-byte alignment
    if (size % 2 !== 0) {
      buffers.push(Buffer.from('\n', 'ascii'));
    }
  }
  
  const finalBuffer = Buffer.concat(buffers);
  fs.writeFileSync(outputPath, finalBuffer);
}

const filesToPack = [
  { name: 'debian-binary', data: fs.readFileSync('debian-binary') },
  { name: 'control.tar.gz', data: fs.readFileSync('control.tar.gz') },
  { name: 'data.tar.gz', data: fs.readFileSync('data.tar.gz') }
];

createArArchive(filesToPack, IPK_NAME);

// 5. Calculate SHA-256
const ipkBuf = fs.readFileSync(IPK_NAME);
const sha256 = crypto.createHash('sha256').update(ipkBuf).digest('hex');
console.log(`IPK generated: ${IPK_NAME} (${(ipkBuf.length / 1024 / 1024).toFixed(2)} MB)`);
console.log(`SHA-256 Checksum: ${sha256}`);

// 6. Update manifest.json, releases/latest.json, apps.json, api/apps.json
const BASE_URL = 'https://stremiobrew.vercel.app';

const manifest = {
  id: 'io.strem.tv.beta',
  version: VERSION,
  type: 'web',
  title: 'Stremio Lite LG',
  appDescription: 'Community Stremio client for rooted webOS 4 TVs (Chromium 53). Ultra-low RAM/VRAM optimized, Stremio Theater aesthetics, multi-language.',
  iconUri: `${BASE_URL}/icon.png`,
  sourceUrl: 'https://github.com/alebypegasus/stremiobrew',
  rootRequired: true,
  ipkUrl: `${BASE_URL}/${IPK_NAME}`,
  ipkHash: { sha256: sha256 }
};

fs.writeFileSync('api/apps/io.strem.tv.beta/manifest.json', JSON.stringify(manifest, null, 2) + '\n');
fs.writeFileSync('api/apps/io.strem.tv.beta/releases/latest.json', JSON.stringify(manifest, null, 2) + '\n');

const appsData = {
  paging: { page: 1, count: 1, maxPage: 1, itemsTotal: 1 },
  packages: [
    {
      id: 'io.strem.tv.beta',
      title: 'Stremio Lite LG',
      iconUri: `${BASE_URL}/icon.png`,
      pool: 'non-free',
      manifestUrl: `${BASE_URL}/api/apps/io.strem.tv.beta/manifest.json`,
      shortDescription: 'Stremio Lite LG client for rooted webOS 4 TVs with low RAM optimization and multi-language.',
      fullDescriptionUrl: 'apps/io.strem.tv.beta/full_description.html',
      manifest: manifest
    }
  ]
};

fs.writeFileSync('apps.json', JSON.stringify(appsData, null, 2) + '\n');
fs.writeFileSync('api/apps.json', JSON.stringify(appsData, null, 2) + '\n');

// 7. Write vercel.json
const vercelConfig = {
  "version": 2,
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "Access-Control-Allow-Origin", "value": "*" },
        { "key": "Access-Control-Allow-Methods", "value": "GET,OPTIONS" }
      ]
    }
  ]
};
fs.writeFileSync('vercel.json', JSON.stringify(vercelConfig, null, 2) + '\n');

// 8. Write index.html at root
const rootHtml = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Stremio Lite LG</title></head>
<body style="background:#0e0d14;color:#fff;font-family:sans-serif;text-align:center;padding-top:15vh">
  <h1>Stremio Lite LG Repository</h1>
  <p>Homebrew Channel repo for LG webOS 4.x TVs.</p>
  <p><a style="color:#7b5bf5" href="/apps.json">apps.json</a> | <a style="color:#7b5bf5" href="/${IPK_NAME}">Download IPK (${VERSION})</a></p>
</body>
</html>
`;
fs.writeFileSync('index.html', rootHtml);

console.log('--- Build Complete & Manifests Synchronized Successfully! ---');
