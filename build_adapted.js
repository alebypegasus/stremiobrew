const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

console.log('=== Stremiobrew Adapted Package & Test Instance Builder (v5.0.4) ===');

const BASE_URL = 'https://stremiobrew.vercel.app';
const ADAPTED_VERSION = '5.0.4';
const ADAPTED_ID = 'io.strem.tv.adapted';
const ADAPTED_IPK = `${ADAPTED_ID}_${ADAPTED_VERSION}_all.ipk`;

console.log(`\n[1/3] Processing Adapted Test Package (${ADAPTED_IPK})...`);

if (fs.existsSync('unpacked_adapted') && fs.existsSync('control_adapted')) {
  console.log(' - Compressing data.tar.gz for adapted package...');
  execSync('cd unpacked_adapted && tar -czf ../data_adapted.tar.gz .', { stdio: 'inherit' });

  console.log(' - Compressing control.tar.gz for adapted package...');
  execSync('cd control_adapted && tar -czf ../control_adapted.tar.gz .', { stdio: 'inherit' });

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

  const debianBinary = Buffer.from('2.0\n', 'ascii');
  const adaptedFiles = [
    { name: 'debian-binary', data: debianBinary },
    { name: 'control.tar.gz', data: fs.readFileSync('control_adapted.tar.gz') },
    { name: 'data.tar.gz', data: fs.readFileSync('data_adapted.tar.gz') }
  ];
  createArArchive(adaptedFiles, ADAPTED_IPK);

  try { fs.unlinkSync('control_adapted.tar.gz'); } catch (_) {}
  try { fs.unlinkSync('data_adapted.tar.gz'); } catch (_) {}
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
  title: '[TESTE] Stremio Adapted LG (Experimental)',
  appDescription: 'VERSÃO DE TESTE: Adaptação experimental da interface Stremio Theater com tipografia Plus Jakarta Sans, tela de detalhes completa, gaveta de streams aprimorada e seleção automática de áudio sobre base leve.',
  iconUri: `${BASE_URL}/icon.png`,
  sourceUrl: 'https://github.com/alebypegasus/stremiobrew',
  rootRequired: true,
  ipkUrl: `${BASE_URL}/${ADAPTED_IPK}`,
  ipkHash: { sha256: adaptedSha256 }
};

fs.writeFileSync(`api/apps/${ADAPTED_ID}/manifest.json`, JSON.stringify(adaptedManifest, null, 2) + '\n');
fs.writeFileSync(`api/apps/${ADAPTED_ID}/releases/latest.json`, JSON.stringify(adaptedManifest, null, 2) + '\n');

const adaptedDescriptionHtml = `<div style="font-family:sans-serif;color:#e5e7eb;line-height:1.6">
  <div style="background:rgba(239,68,68,0.2);border:1px solid #ef4444;border-radius:8px;padding:12px 16px;margin-bottom:16px;">
    <b style="color:#ef4444;font-size:1.1rem;">⚠️ ATENÇÃO: VERSÃO DE TESTE / EXPERIMENTAL</b>
    <p style="margin:4px 0 0;font-size:0.95rem;">Este pacote foi criado para testes e validação da adaptação da interface Stremio Theater em Smart TVs LG antigas (webOS 3.x/4.x/5.x). Não substitui a versão estável oficial.</p>
  </div>

  <h2 style="color:#a78bfa;margin-top:0;font-size:1.35rem;">🧪 Stremio Adapted (Test Edition v${ADAPTED_VERSION})</h2>
  <p>Esta versão une a <b>riqueza visual e estrutural do Stremio Theater</b> (versão comum) à arquitetura de <b>baixo consumo de memória</b> para TVs clássicas.</p>

  <h3 style="color:#38bdf8;font-size:1.05rem;margin-top:12px;">✨ O que há de novo nesta adaptação:</h3>
  <ul>
    <li><b>Tipografia Oficial:</b> Fonte <i>Plus Jakarta Sans</i> embutida localmente.</li>
    <li><b>Tela de Detalhes Aprimorada:</b> Badges de Classificação Indicativa, nota IMDb em destaque (★), ano, duração e sinopse completa.</li>
    <li><b>Gaveta de Streams Avançada:</b> Tags destacadas de resolução (4K, 1080p, 720p), HDR, Debrid ([RD+], [AD+], [TB+]), seeds e tamanho do arquivo.</li>
    <li><b>Seleção Automática de Áudio:</b> Auto-seleção do idioma preferido do seu perfil Stremio via Luna Bridge.</li>
    <li><b>Controle Remoto LG:</b> Botões coloridos (Vermelho=Busca, Verde=Início, Amarelo=Biblioteca, Azul=Descobrir) e botões de mídia mapeados.</li>
    <li><b>Instância e Porta Dedicadas:</b> Executa na porta 8085 sob o ID <code>io.strem.tv.adapted</code> sem interferir em outras versões instaladas na TV.</li>
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
      iconUri: `${BASE_URL}/icon.png`,
      pool: 'non-free',
      manifestUrl: `${BASE_URL}/api/apps/${ADAPTED_ID}/manifest.json`,
      shortDescription: '[VERSÃO DE TESTE] Adaptação da interface Stremio Theater para webOS clássico com baixo consumo de RAM.',
      fullDescriptionUrl: `apps/${ADAPTED_ID}/full_description.html`,
      manifest: adaptedManifest
    }
  ]
};

fs.writeFileSync('test.json', JSON.stringify(testAppsData, null, 2) + '\n');
fs.writeFileSync('apps-test.json', JSON.stringify(testAppsData, null, 2) + '\n');

console.log(' -> Test feed generated: test.json & apps-test.json');
console.log('=== Test Instance Build Completed Successfully! ===\n');
