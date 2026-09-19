const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

console.log('=== Stremiobrew Adapted Package & Test Instance Builder (v5.0.6) ===');

const BASE_URL = 'https://stremiobrew.vercel.app';
const ADAPTED_VERSION = '5.0.6';
const ADAPTED_ID = 'io.strem.tv.adapted';
const ADAPTED_IPK = `${ADAPTED_ID}_${ADAPTED_VERSION}_all.ipk`;

console.log(`\n[1/3] Packaging Adapted Test Package (${ADAPTED_IPK}) built from scratch for legacy webOS...`);

const adaptedSourceDir = path.join(__dirname, 'packages/stremio-adapted');
if (fs.existsSync(path.join(adaptedSourceDir, 'app')) && fs.existsSync(path.join(adaptedSourceDir, 'service/www'))) {
  console.log(' - Packaging adapted IPK with ares-package (Traditional Complete Stremio Base)...');
  execSync(`cd "${adaptedSourceDir}" && npx -y -p @webosose/ares-cli ares-package --no-minify app service -o .`, { stdio: 'inherit' });
  fs.copyFileSync(path.join(adaptedSourceDir, ADAPTED_IPK), ADAPTED_IPK);
}

if (!fs.existsSync(ADAPTED_IPK)) {
  throw new Error(`Adapted IPK not found: ${ADAPTED_IPK}`);
}

const adaptedIpkBuf = fs.readFileSync(ADAPTED_IPK);
const adaptedSha256 = crypto.createHash('sha256').update(adaptedIpkBuf).digest('hex');
console.log(`\n[SUCCESS] Adapted IPK generated: ${ADAPTED_IPK} (${(adaptedIpkBuf.length / 1024 / 1024).toFixed(2)} MB)`);
console.log(`SHA-256: ${adaptedSha256}`);

// -------------------------------------------------------------
// 2. GENERATE TEST MANIFESTS
// -------------------------------------------------------------
console.log('\n[2/3] Generating test API manifests...');
fs.mkdirSync(`api/apps/${ADAPTED_ID}/releases`, { recursive: true });

const adaptedManifest = {
  id: ADAPTED_ID,
  version: ADAPTED_VERSION,
  type: 'web',
  title: '[TESTE] Stremio Adapted (Experimental)',
  appDescription: 'VERSÃO DE TESTE: Construída do zero com base 100% no Stremio Tradicional Completo, adaptada especificamente para Smart TVs LG mais antigas (webOS 3.x/4.x, Chromium 53, zero WASM) na porta 8085.',
  iconUri: `${BASE_URL}/icon-modern.png`,
  sourceUrl: 'https://github.com/alebypegasus/stremiobrew',
  rootRequired: false,
  ipkUrl: `${BASE_URL}/${ADAPTED_IPK}`,
  ipkHash: { sha256: adaptedSha256 }
};

fs.writeFileSync(`api/apps/${ADAPTED_ID}/manifest.json`, JSON.stringify(adaptedManifest, null, 2) + '\n');
fs.writeFileSync(`api/apps/${ADAPTED_ID}/releases/latest.json`, JSON.stringify(adaptedManifest, null, 2) + '\n');

const adaptedDescriptionHtml = `<div style="font-family:sans-serif;color:#e5e7eb;line-height:1.6">
  <div style="background:rgba(239,68,68,0.2);border:1px solid #ef4444;border-radius:8px;padding:12px 16px;margin-bottom:16px;">
    <b style="color:#ef4444;font-size:1.1rem;">⚠️ ATENÇÃO: VERSÃO DE TESTE / EXPERIMENTAL</b>
    <p style="margin:4px 0 0;font-size:0.95rem;">Pacote experimental construído <b>do zero com base 100% no Stremio Tradicional Completo</b>, adaptado para navegadores legados (Chromium 53) sem dependência de WebAssembly na porta 8085.</p>
  </div>

  <h2 style="color:#a78bfa;margin-top:0;font-size:1.35rem;">🧪 Stremio Adapted (Test Edition v${ADAPTED_VERSION})</h2>
  <p>Esta versão recria a <b>experiência visual e funcional completa do Stremio Oficial</b> (Hero Banner dinâmico, Carrosséis com foco suave, Filtros de Descobrir, Detalhes com Temporadas/Episódios, Gaveta de Streams com badges 4K/HDR/Debrid, Player com seleção de áudio/legendas e Sincronização de Conta Stremio).</p>

  <h3 style="color:#38bdf8;font-size:1.05rem;margin-top:12px;">✨ Destaques da Versão Adaptada:</h3>
  <ul>
    <li><b>Base Tradicional Completa:</b> Interface completa com todos os recursos e telas oficiais.</li>
    <li><b>Zero WASM (Sem Tela Preta):</b> Desenvolvido em JavaScript 100% compatível com o Chromium 53 do webOS 3.x / 4.x.</li>
    <li><b>Porta Isolada:</b> Executa na porta <code>8085</code> (evita qualquer interferência com o Stremio estável).</li>
    <li><b>Suporte Binário Multi-Arquitetura:</b> Seleção automática de binários ARM64 e ARM32 para ffmpeg/ffprobe.</li>
    <li><b>Controle LG Magic & D-Pad:</b> Navegação espacial completa com teclas direcionais, cores e mídia.</li>
  </ul>
</div>
`;
fs.writeFileSync(`api/apps/${ADAPTED_ID}/full_description.html`, adaptedDescriptionHtml);

// -------------------------------------------------------------
// 3. GENERATE SEPARATE TEST FEED (test.json & apps-test.json)
// -------------------------------------------------------------
console.log('\n[3/3] Generating separate test repository feed (test.json)...');

const testAppsData = {
  paging: { page: 1, count: 1, maxPage: 1, itemsTotal: 1 },
  packages: [
    {
      id: ADAPTED_ID,
      title: '[TESTE] Stremio Adapted (Experimental)',
      iconUri: `${BASE_URL}/icon-modern.png`,
      pool: 'main',
      manifestUrl: `${BASE_URL}/api/apps/${ADAPTED_ID}/manifest.json`,
      shortDescription: '[VERSÃO DE TESTE] Construído do zero na base tradicional para Smart TVs LG mais antigas.',
      fullDescriptionUrl: `apps/${ADAPTED_ID}/full_description.html`,
      manifest: adaptedManifest
    }
  ]
};

fs.writeFileSync('test.json', JSON.stringify(testAppsData, null, 2) + '\n');
fs.writeFileSync('apps-test.json', JSON.stringify(testAppsData, null, 2) + '\n');

console.log(' -> Test feed generated: test.json & apps-test.json');
console.log('=== Test Instance Build Completed Successfully! ===\n');
