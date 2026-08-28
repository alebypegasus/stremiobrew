# Stremiobrew — Compatibility & TV Generation Matrix

O **Stremiobrew** foi projetado para fornecer clientes Stremio otimizados para qualquer geração de Smart TV LG (de 2016 até 2025+), cobrindo desde webOS 3.0 até o mais recente webOS 25.

---

## 📺 Matriz de Compatibilidade por Geração de TV

| Geração / Modelos | webOS | Motor Web & Hardware | Pacote Recomendado | Principais Destaques |
| :--- | :--- | :--- | :--- | :--- |
| **2020 a 2025+**<br>• LG OLED (CX, C1, C2, C3, C4, **C5**, G1–G5)<br>• QNED, NanoCell, UR/UQ/UP Series | **webOS 5.0+ até webOS 25** | Chromium 68 a 108+<br>64-bit (ARM64)<br>Hardware moderno | **Stremio Modern LG**<br>(`io.strem.tv`) | • **Fix de Áudio Nativo**: Respeita o idioma preferido do perfil<br>• Stremio Theater v1.9.2 completo<br>• WebAssembly + 4K HDR/Dolby Vision passthrough |
| **2018 a 2019**<br>• Séries UK, UM, LK, SK, SM<br>• OLED Séries B8, C8, B9, C9 | **webOS 4.0 a 4.9** | Chromium 53<br>32-bit (armv7)<br>Memória limitada (~512MB-1GB) | **Stremio Lite LG**<br>(`io.strem.tv.beta`) | • **Virtualização de Texturas GPU** (evita crash de VRAM)<br>• Metahub proxy downscale<br>• Multi-idioma (i18n completo)<br>• Servidor Node 32-bit embutido |
| **2016 a 2017**<br>• Séries UH, UJ, LJ, B7, C7 | **webOS 3.0 a 3.9** | Chromium 38<br>32-bit (armv7)<br>RAM baixa | **Stremio Lite LG**<br>(`io.strem.tv.beta`) | • Requer conexões leves / debrid direto<br>• Recomendado reprodução em 1080p/720p |

---

## 🚀 Como o Homebrew Channel Gerencia as Versões

Ao adicionar o repositório `https://stremiobrew.vercel.app/apps.json` nas configurações do **Homebrew Channel**, a loja carregará automaticamente os dois pacotes:

1. **`Stremio (webOS 5+ / OLED)`**: Ideal para TVs modernas como a LG OLED C5, com reprodução rápida e áudio corrigido.
2. **`Stremio Lite LG (webOS 3/4)`**: Ideal para TVs clássicas com pouca RAM.

---

## ⚙️ Arquitetura dos Pacotes

### 1. Stremio Modern (`io.strem.tv`)
- **Origem:** Baseado em [kieranbrown/stremio-webos](https://github.com/kieranbrown/stremio-webos) e [NoobyGains/stremio-vidaa-tv](https://github.com/NoobyGains/stremio-vidaa-tv).
- **Audio Language Selection Patch:** No app oficial da LG, o player ignora a preferência de áudio da conta Stremio e sempre seleciona a primeira faixa. O patch intercepta o pipeline de mídia nativo do webOS e seleciona automaticamente o idioma correto configurado na conta.
- **FFmpeg:** Binários ARM64 estáticos v7.0.2 com suporte a remux HLS.

### 2. Stremio Lite & Ultra Lite (`io.strem.tv.beta`)
- **Origem:** Otimização customizada para Chromium 53 e TVs com pouca memória (512MB RAM).
- **Perfis de Desempenho (Configurações → Modo de Desempenho):**
  - **Versão A (Lite):** Modo visual equilibrado com logotipos HD no Hero, pôsteres otimizados e ambient background.
  - **Versão C (Ultra Lite):** Modo extremo de economia de RAM (<30MB VRAM). Remove texturas de fundo pesadas na GPU, títulos em texto puro, miniaturas de episódios desativadas. Ideal para eliminar reboots causados pelo OOM killer da TV.
- **Trailers Nativos:** Substituição de `iframe` pesado do YouTube por stream de vídeo MP4 nativo acelerado por hardware via endpoint `/yt`.
- **Busca e Teclas Corrigidas:** Backspace permitido em caixas de pesquisa sem sair do app, debounce contra duplo toque no botão Voltar.
- **Node Server:** Binário 32-bit armv7 adaptado para webOS 3.x/4.x sem buffering de imagens em heap de memória.
