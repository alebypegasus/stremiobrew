const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

console.log('=== Stremiobrew Multi-Target Build System (v5.0.2) ===');

const BASE_URL = 'https://stremiobrew.vercel.app';
const VERSION = '5.0.2';

// -------------------------------------------------------------
// 1. BUILD LEGACY (webOS 3.x - 4.x / 2016-2019)
// -------------------------------------------------------------
const LEGACY_VERSION = VERSION;
const LEGACY_ID = 'io.strem.tv.beta';
const LEGACY_IPK = `${LEGACY_ID}_${LEGACY_VERSION}_all.ipk`;

console.log('\n[1/2] Processing Legacy Package (Stremio Lite LG v5.0.2)...');

if (fs.existsSync('unpacked') && fs.existsSync('control_unpacked')) {
  console.log(' - Compressing data.tar.gz...');
  execSync('cd unpacked && tar -czf ../data.tar.gz .', { stdio: 'inherit' });

  console.log(' - Compressing control.tar.gz...');
  execSync('cd control_unpacked && tar -czf ../control.tar.gz .', { stdio: 'inherit' });

  fs.writeFileSync('debian-binary', '2.0\n');

  function createArArchive(files, outputPath) {
    const buffers = [Buffer.from('!<arch>\n', 'ascii')];
    for (const file of files) {
      const filename = path.basename(file.name);
      const content = file.data;
      const size = content.length;
      
      const header = Buffer.alloc(60, 0x20);
      header.write(filename, 0, 16, 'ascii');
      header.write(String(Math.floor(Date.now() / 1000)), 16, 12, 'ascii');
      header.write('0', 28, 6, 'ascii');
      header.write('0', 34, 6, 'ascii');
      header.write('100644', 40, 8, 'ascii');
      header.write(String(size), 48, 10, 'ascii');
      header.write('`\n', 58, 2, 'ascii');
      
      buffers.push(header);
      buffers.push(content);
      if (size % 2 !== 0) buffers.push(Buffer.from('\n', 'ascii'));
    }
    fs.writeFileSync(outputPath, Buffer.concat(buffers));
  }

  const legacyFiles = [
    { name: 'debian-binary', data: fs.readFileSync('debian-binary') },
    { name: 'control.tar.gz', data: fs.readFileSync('control.tar.gz') },
    { name: 'data.tar.gz', data: fs.readFileSync('data.tar.gz') }
  ];
  createArArchive(legacyFiles, LEGACY_IPK);
}

const legacyIpkBuf = fs.readFileSync(LEGACY_IPK);
const legacySha256 = crypto.createHash('sha256').update(legacyIpkBuf).digest('hex');
console.log(` -> Legacy IPK: ${LEGACY_IPK} (${(legacyIpkBuf.length / 1024 / 1024).toFixed(2)} MB)`);
console.log(` -> SHA-256: ${legacySha256}`);

// -------------------------------------------------------------
// 2. BUILD MODERN (webOS 5.0+ / 2020-2025 / OLED C Series)
// -------------------------------------------------------------
const MODERN_VERSION = VERSION;
const MODERN_ID = 'io.strem.tv';
const MODERN_IPK = `${MODERN_ID}_${MODERN_VERSION}_all.ipk`;

console.log(`\n[2/2] Packaging Modern Package (Stremio for webOS OLED/Modern v${MODERN_VERSION})...`);

const modernSourceDir = path.join(__dirname, 'packages/stremio-modern');
if (fs.existsSync(path.join(modernSourceDir, 'app')) && fs.existsSync(path.join(modernSourceDir, 'service/www'))) {
  console.log(' - Packaging modern IPK with ares-package...');
  execSync(`cd "${modernSourceDir}" && npx -y -p @webosose/ares-cli ares-package --no-minify app service -o .`, { stdio: 'inherit' });
  fs.copyFileSync(path.join(modernSourceDir, MODERN_IPK), MODERN_IPK);
}

if (!fs.existsSync(MODERN_IPK)) {
  throw new Error(`Modern IPK not found: ${MODERN_IPK}`);
}

const modernIpkBuf = fs.readFileSync(MODERN_IPK);
const modernSha256 = crypto.createHash('sha256').update(modernIpkBuf).digest('hex');
console.log(` -> Modern IPK: ${MODERN_IPK} (${(modernIpkBuf.length / 1024 / 1024).toFixed(2)} MB)`);
console.log(` -> SHA-256: ${modernSha256}`);

// -------------------------------------------------------------
// 3. GENERATE MANIFESTS & FEED (apps.json)
// -------------------------------------------------------------
console.log('\n[3/3] Generating multi-language API manifests and Homebrew Channel feed...');

// Ensure API directory tree exists
fs.mkdirSync(`api/apps/${LEGACY_ID}/releases`, { recursive: true });
fs.mkdirSync(`api/apps/${MODERN_ID}/releases`, { recursive: true });

// Legacy Manifest
const legacyManifest = {
  id: LEGACY_ID,
  version: LEGACY_VERSION,
  type: 'web',
  title: 'Stremio Lite & Ultra Lite LG (2016-2019)',
  appDescription: 'Stremio client for legacy rooted LG webOS 3.x/4.x TVs (Chromium 53). Includes Versão A (Lite) & Versão C (Ultra Lite) performance modes with extreme RAM savings, hardware video trailers, and fixed back/search navigation.',
  iconUri: `${BASE_URL}/icon-legacy.png`,
  sourceUrl: 'https://github.com/alebypegasus/stremiobrew',
  rootRequired: true,
  ipkUrl: `${BASE_URL}/${LEGACY_IPK}`,
  ipkHash: { sha256: legacySha256 }
};

fs.writeFileSync(`api/apps/${LEGACY_ID}/manifest.json`, JSON.stringify(legacyManifest, null, 2) + '\n');
fs.writeFileSync(`api/apps/${LEGACY_ID}/releases/latest.json`, JSON.stringify(legacyManifest, null, 2) + '\n');

// Modern Manifest
const modernManifest = {
  id: MODERN_ID,
  version: MODERN_VERSION,
  type: 'web',
  title: 'Stremio for webOS (2020-2025 / OLED)',
  appDescription: 'High-performance Stremio client for modern LG webOS TVs (webOS 5.0+ / OLED C-Series) with Native Audio Track Fix, Turbo RAM Cache and ARM64 server.',
  iconUri: `${BASE_URL}/icon-modern.png`,
  sourceUrl: 'https://github.com/alebypegasus/stremiobrew',
  rootRequired: false,
  ipkUrl: `${BASE_URL}/${MODERN_IPK}`,
  ipkHash: { sha256: modernSha256 }
};

fs.writeFileSync(`api/apps/${MODERN_ID}/manifest.json`, JSON.stringify(modernManifest, null, 2) + '\n');
fs.writeFileSync(`api/apps/${MODERN_ID}/releases/latest.json`, JSON.stringify(modernManifest, null, 2) + '\n');

// Rich Multi-Language Description HTMLs with embedded images
const legacyDescriptionHtml = `<div style="font-family:sans-serif;color:#e5e7eb;line-height:1.6">
  <img src="${BASE_URL}/preview_lite.jpg" alt="Stremio Lite LG Legacy" style="width:100%;max-width:720px;border-radius:12px;margin-bottom:16px;box-shadow:0 8px 24px rgba(0,0,0,0.6);" />
  
  <!-- ENGLISH -->
  <h2 style="color:#f59e0b;margin-top:0;font-size:1.35rem;">🇺🇸 Stremio Lite & Ultra Lite LG — Legacy Low-RAM Edition (v5.0.2)</h2>
  <p>Ultra-lightweight Stremio client designed for legacy <b>rooted</b> LG Smart TVs (webOS 3.x & 4.x / 2016–2019) with Chromium 53 engine and limited RAM (~512MB–1GB).</p>
  
  <h3 style="color:#38bdf8;font-size:1.05rem;margin-top:12px;">⚡ Dual Performance Profiles:</h3>
  <ul>
    <li><b>Versão A — Stremio Lite (Balanced):</b> High-definition logos in Hero banner, ambient background, downscaled poster textures.</li>
    <li><b>Versão C — Stremio Ultra Lite (Maximum Memory Free):</b> Zero background textures on GPU, pure text logos, text-based episode lists. Ideal for 512MB RAM TVs (prevents TV reboots / OOM crashes).</li>
    <li><i>Switch instantly in Settings → Performance Mode!</i></li>
  </ul>

  <h3 style="color:#38bdf8;font-size:1.05rem;margin-top:12px;">📺 Hardware Compatibility:</h3>
  <ul>
    <li><b>2018–2019 Models:</b> UK, UM, LK, SK, SM, OLED B8, C8, B9, C9 (webOS 4.x)</li>
    <li><b>2016–2017 Models:</b> UH, UJ, LJ, B7, C7 (webOS 3.x)</li>
    <li><b>Requirement:</b> Rooted LG TV with <b>Homebrew Channel</b> installed.</li>
  </ul>

  <h3 style="color:#38bdf8;font-size:1.05rem;margin-top:12px;">🛠️ Key Fixes & Features:</h3>
  <ul>
    <li><b>Native Video Trailers:</b> Hardware-accelerated MP4 player replaces memory-heavy YouTube iframe.</li>
    <li><b>Fixed Back & Search Navigation:</b> Backspace key properly deletes text without crashing or closing the app; double-back event debounced.</li>
    <li><b>Zero Memory Buffers:</b> Node.js local proxy avoids RAM buffer hoarding and background CPU spikes.</li>
  </ul>

  <hr style="border:none;border-top:1px solid rgba(255,255,255,0.15);margin:24px 0;" />

  <!-- PORTUGUÊS -->
  <h2 style="color:#f59e0b;font-size:1.25rem;">🇧🇷 Português — Stremio Lite & Ultra Lite LG (v5.0.2)</h2>
  <p>Edição super leve para TVs LG clássicas com root (webOS 3.x e 4.x / 2016–2019).</p>
  <ul>
    <li><b>Dois Modos de Desempenho:</b>
      <ul>
        <li><b>Versão A (Lite):</b> Visual equilibrado com logotipos HD no topo e pôsteres otimizados.</li>
        <li><b>Versão C (Ultra Lite):</b> Modo extremo de economia de RAM (&lt;30MB VRAM), sem texturas pesadas na GPU para TVs de 512MB que antes reiniciavam.</li>
      </ul>
    </li>
    <li><b>Trailers Nativos:</b> Player de vídeo HTML5 acelerado por hardware sem travar a TV.</li>
    <li><b>Busca e Tecla Voltar Corrigidas:</b> Digitação e remoção de caracteres sem fechar o app, retorno seguro por camadas.</li>
  </ul>

  <hr style="border:none;border-top:1px solid rgba(255,255,255,0.15);margin:24px 0;" />

  <!-- ESPAÑOL -->
  <h2 style="color:#f59e0b;font-size:1.25rem;">🇪🇸 Español — Stremio Lite LG (v5.0.2)</h2>
  <p>Edición ultraligera para Smart TVs LG clásicas con root (webOS 3.x y 4.x / 2016–2019).</p>
  <ul>
    <li><b>Virtualización de Texturas GPU:</b> Evita cierres inesperados por falta de memoria RAM.</li>
    <li><b>Multi-idioma Completo:</b> Español, Portugués, Inglés y otros.</li>
  </ul>
</div>
`;
fs.writeFileSync(`api/apps/${LEGACY_ID}/full_description.html`, legacyDescriptionHtml);

const modernDescriptionHtml = `<div style="font-family:sans-serif;color:#e5e7eb;line-height:1.6">
  <img src="${BASE_URL}/preview_modern.jpg" alt="Stremio Modern LG OLED" style="width:100%;max-width:720px;border-radius:12px;margin-bottom:16px;box-shadow:0 8px 24px rgba(0,0,0,0.6);" />
  
  <!-- ENGLISH -->
  <h2 style="color:#a78bfa;margin-top:0;font-size:1.35rem;">🇺🇸 Stremio for webOS — Modern OLED & 4K Edition (v5.0.2)</h2>
  <p>High-performance Stremio client designed for modern LG Smart TVs with 64-bit ARM64 processors running webOS 5.0 up to webOS 25+.</p>
  
  <h3 style="color:#38bdf8;font-size:1.05rem;margin-top:12px;">📺 Hardware Compatibility:</h3>
  <ul>
    <li><b>LG OLED:</b> CX, C1, C2, C3, C4, <b>C5</b>, G1, G2, G3, G4, G5, B1..B4</li>
    <li><b>LG QNED / NanoCell / 4K UHD:</b> 2020 to 2025+ models (webOS 5.0, 6.0, 22, 23, 24, 25)</li>
    <li><b>Execution Mode:</b> Fully compatible with both <b>Root (Homebrew Channel)</b> and <b>Developer Mode (no root)</b>.</li>
  </ul>

  <h3 style="color:#38bdf8;font-size:1.05rem;margin-top:12px;">🚀 Key Features & Optimizations:</h3>
  <ul>
    <li><b>Native Audio Track Selection Fix:</b> Solves the official LG app bug where the first audio track was always forced. Automatically selects your preferred audio language configured in your Stremio profile.</li>
    <li><b>Turbo RAM Cache (Zero Stutter):</b> Pre-caches all UI assets and WASM in RAM for 0ms disk latency and smooth 60 FPS catalog navigation.</li>
    <li><b>4K HDR & Dolby Vision:</b> Direct hardware-accelerated video decoding passthrough.</li>
    <li><b>ARM64 Streaming Server:</b> Bundled static FFmpeg v7.0.2 binaries for HLS stream transcoding and remuxing.</li>
  </ul>

  <hr style="border:none;border-top:1px solid rgba(255,255,255,0.15);margin:24px 0;" />

  <!-- PORTUGUÊS -->
  <h2 style="color:#a78bfa;font-size:1.25rem;">🇧🇷 Português — Stremio Modern LG OLED (v5.0.2)</h2>
  <p>Cliente Stremio de alto desempenho para Smart TVs LG modernas (2020 a 2025 / OLED C1..C5) com processador 64-bit ARM64 e webOS 5.0+.</p>
  <ul>
    <li><b>Correção de Áudio Nativo:</b> Respeita automaticamente o idioma preferido de áudio configurado na sua conta Stremio.</li>
    <li><b>Turbo RAM Cache:</b> Navegação super fluida a 60 FPS sem travamentos ao rolar os pôsteres.</li>
    <li><b>4K HDR & Dolby Vision:</b> Decodificação de vídeo acelerada por hardware nativo da TV.</li>
    <li><b>Suporte a Root e Dev Mode:</b> Funciona no Homebrew Channel e em sideload Dev Mode.</li>
  </ul>

  <hr style="border:none;border-top:1px solid rgba(255,255,255,0.15);margin:24px 0;" />

  <!-- ESPAÑOL -->
  <h2 style="color:#a78bfa;font-size:1.25rem;">🇪🇸 Español — Stremio Modern LG OLED (v5.0.2)</h2>
  <p>Cliente Stremio de alto rendimiento para televisores LG modernos (2020 a 2025 / OLED C1..C5, webOS 5.0+).</p>
  <ul>
    <li><b>Corrección de Audio Nativo:</b> Respeta el idioma de audio configurado en tu cuenta Stremio.</li>
    <li><b>Turbo RAM Cache:</b> Navegación fluida a 60 FPS sin retrasos de lectura en disco.</li>
    <li><b>4K HDR y Dolby Vision:</b> Reproducción por aceleración nativa de hardware.</li>
  </ul>
</div>
`;
fs.writeFileSync(`api/apps/${MODERN_ID}/full_description.html`, modernDescriptionHtml);

// Unified apps.json
const appsData = {
  paging: { page: 1, count: 2, maxPage: 1, itemsTotal: 2 },
  packages: [
    {
      id: MODERN_ID,
      title: 'Stremio (webOS 5+ / OLED)',
      iconUri: `${BASE_URL}/icon-modern.png`,
      pool: 'main',
      manifestUrl: `${BASE_URL}/api/apps/${MODERN_ID}/manifest.json`,
      shortDescription: 'Stremio for modern LG TVs (2020-2025: OLED C1..C5, webOS 5+) with Native Audio Fix & Turbo RAM Cache.',
      fullDescriptionUrl: `apps/${MODERN_ID}/full_description.html`,
      manifest: modernManifest
    },
    {
      id: LEGACY_ID,
      title: 'Stremio Lite LG (webOS 3/4)',
      iconUri: `${BASE_URL}/icon-legacy.png`,
      pool: 'non-free',
      manifestUrl: `${BASE_URL}/api/apps/${LEGACY_ID}/manifest.json`,
      shortDescription: 'Stremio Lite for legacy rooted LG TVs (2016-2019: webOS 3/4) with GPU texture virtualization & low RAM optimization.',
      fullDescriptionUrl: `apps/${LEGACY_ID}/full_description.html`,
      manifest: legacyManifest
    }
  ]
};

fs.writeFileSync('apps.json', JSON.stringify(appsData, null, 2) + '\n');
fs.writeFileSync('api/apps.json', JSON.stringify(appsData, null, 2) + '\n');

// -------------------------------------------------------------
// 4. VERCEL CONFIG
// -------------------------------------------------------------
const vercelConfig = {
  version: 2,
  headers: [
    {
      source: "/(.*)",
      headers: [
        { key: "Access-Control-Allow-Origin", value: "*" },
        { key: "Access-Control-Allow-Methods", value: "GET,OPTIONS" }
      ]
    }
  ]
};
fs.writeFileSync('vercel.json', JSON.stringify(vercelConfig, null, 2) + '\n');

console.log('=== Multi-Target Build Finished Successfully! ===');
