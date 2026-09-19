# Stremiobrew — LG webOS Homebrew Channel Repository

Repositório oficial para distribuição de clientes **Stremio** otimizados para Smart TVs **LG webOS** (de 2016 a 2025+), cobrindo desde webOS 3.0 até o mais moderno webOS 25 (incluindo LG OLED C5).

---

## 📺 Visão Geral dos Aplicativos

| Aplicativo | Compatibilidade | Arquitetura | ID do Pacote |
| :--- | :--- | :--- | :--- |
| **Stremio Modern LG** | **2020 a 2025+** (OLED C1..C5, QNED, webOS 5.0+) | ARM64 / 64-bit | `io.strem.tv` |
| **Stremio Lite & Ultra Lite** | **2016 a 2019** (Séries B7/C8/C9, UK, UM, LK, webOS 3.x/4.x) | armv7 / 32-bit | `io.strem.tv.beta` |

---

## ✨ Recursos

### 1. Stremio Modern (OLED & 4K Edition)
- **Correção de Áudio Nativo**: Corrige o bug do app oficial da LG que sempre tocava a primeira faixa de áudio, respeitando o idioma preferido do seu perfil.
- **Hardware Moderno**: Aceleração gráfica completa, WebAssembly e compatibilidade com 4K HDR e Dolby Vision.
- **Binários ARM64**: FFmpeg e streaming server de alta performance integrados.

### 2. Stremio Lite & Ultra Lite (Legacy Edition)
- **Dois Modos de Desempenho (Configurações → Modo de Desempenho)**:
  - **Versão A (Lite)**: Visual equilibrado, ambient background, logotipos HD nos destaques e pôsteres compactos.
  - **Versão C (Ultra Lite)**: Máxima economia de RAM (<30MB VRAM). Remove texturas de fundo pesadas na GPU, elimina miniaturas de episódios e evita reboots de TV causados por estouro de memória (OOM).
- **Player de Trailers Nativo**: Execução de trailers MP4 leves acelerados por hardware sem travamento do YouTube.
- **Busca e Teclado Otimizados**: Correção do bug da tecla apagar (Backspace) e debounce no botão Voltar.
- **Compatibilidade com Chromium 53**: Suporte completo a navegadores de gerações antigas.
- **Multi-idioma (i18n)**: Português (BR/PT), Espanhol, Inglês, Francês, Alemão, Italiano e Russo.

---

## 🛠️ Como Adicionar o Repositório no Homebrew Channel

1. Abra o **Homebrew Channel** na sua TV LG.
2. Vá em **Settings** &rarr; **Repositories** &rarr; **Add repository**.
3. Insira a URL do repositório:
   ```text
   https://stremiobrew.vercel.app/apps.json
   ```
4. Navegue pela lista de aplicativos, escolha o **Stremio Modern** (para TVs novas / OLED C5) ou **Stremio Lite** (para TVs antigas) e clique em **Install**.

---

## 📦 Build e Atualização

Para recompilar ambos os pacotes e sincronizar manifests e hashes SHA-256:

```bash
node build.js
```

---

## 📄 Notas e Aviso Legal

- **Traga seus próprios addons:** O aplicativo não hospeda nem distribui qualquer conteúdo por padrão.
- Projeto comunitário de código aberto mantido por [alebypegasus/stremiobrew](https://github.com/alebypegasus/stremiobrew). Não afiliado ou endossado pela Smart Code OOD / Stremio oficial.
