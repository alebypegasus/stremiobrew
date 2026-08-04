const fs = require('fs');

const file_path = "unpacked/usr/palm/services/io.strem.tv.beta.server/beta.html";
let html = fs.readFileSync(file_path, "utf-8");

// 1. CSS optimizations
html = html.replace(
  ".row{padding:18px 0 34px 48px;", 
  ".row{content-visibility:auto;contain-intrinsic-size:100% 450px;padding:18px 0 34px 48px;"
);

// 2. Language switcher
const ui_lang_opts = "var UI_LANG_OPTS=[['en','English'],['pt-BR','Português (Brasil)'],['pt-PT','Português (Portugal)'],['es','Español'],['fr','Français'],['de','Deutsch'],['it','Italiano'],['zh','中文'],['ja','日本語'],['ko','한국어'],['hi','हिन्दी'],['ar','العربية'],['ru','Русский'],['tr','Türkçe'],['id','Bahasa Indonesia']];";
html = html.replace("var LANG_OPTS=", ui_lang_opts + "\\nvar LANG_OPTS=");

html = html.replace(
  "{head:'Subtitles'},", 
  "{head: t('UI Language')},\\n    {k:'uiLang',lb: t('Language'),opts:UI_LANG_OPTS,d:'en'},\\n    {head: t('Subtitles')},"
);

const cycle_orig = `lsRawSet(def.k,def.opts[ci][0]);
  if(def.k==='bingeWatch')`;
const cycle_new = `lsRawSet(def.k,def.opts[ci][0]);
  if(def.k==='uiLang') setTimeout(function(){location.reload();}, 300);
  if(def.k==='bingeWatch')`;
html = html.replace(cycle_orig, cycle_new);

// 3. Translation Dictionary
const translations = {
  "en": {},
  "pt-BR": {
    "Search": "Buscar", "Home": "Início", "Discover": "Descobrir", "Library": "Biblioteca", "Settings": "Configurações",
    "Search movies & series": "Buscar filmes e séries", "Press OK to type, Down for results": "Pressione OK para digitar, Para baixo para resultados",
    "Left / Right to change · settings apply to the player instantly": "Esquerda / Direita para mudar · configurações aplicam-se ao reprodutor instantaneamente",
    "Sign in with your phone": "Faça login com seu celular", "Scan the code with your camera": "Escaneie o código com sua câmera",
    "Generating code…": "Gerando código…", "Or use email": "Ou use e-mail", "Email": "E-mail", "Password": "Senha", "Sign in": "Entrar",
    "Streams": "Links", "All": "Todos", "Movies": "Filmes", "Series": "Séries", "Addon": "Complemento",
    "UI Language": "Idioma da Interface", "Language": "Idioma", "Subtitles": "Legendas",
    "Subtitle size": "Tamanho da legenda", "Default subtitles": "Legenda padrão",
    "Subtitle colour": "Cor da legenda", "Subtitle outline": "Borda da legenda", "Subtitle background": "Fundo da legenda",
    "Embedded subtitles engine": "Motor de legendas embutidas",
    "Audio": "Áudio", "Auto audio track": "Faixa de áudio automática", "Default audio language": "Idioma de áudio padrão",
    "Playback": "Reprodução", "Seek step": "Passo de busca", "Auto-play next episode": "Reproduzir próximo episódio auto",
    "Background trailers": "Trailers em fundo", "Scrubbing previews": "Prévias de busca", "Addons": "Complementos",
    "Sync addons now": "Sincronizar complementos agora", "Account": "Conta", "Log out": "Sair",
    "Play": "Reproduzir", "Resume": "Continuar", "Details": "Detalhes", "Watch something similar": "Assistir algo parecido",
    "Trailer": "Trailer", "Mark as watched": "Marcar como visto", "Remove from Library": "Remover da Biblioteca",
    "Add to Library": "Adicionar à Biblioteca", "In Library": "Na Biblioteca", "+ Library": "+ Biblioteca",
    "Similar": "Similares", "Similar to": "Similares a"
  },
  "pt-PT": {
    "Search": "Pesquisar", "Home": "Início", "Discover": "Descobrir", "Library": "Biblioteca", "Settings": "Definições",
    "Search movies & series": "Pesquisar filmes e séries", "Press OK to type, Down for results": "Pressione OK para escrever, Baixo para resultados",
    "Left / Right to change · settings apply to the player instantly": "Esquerda / Direita para mudar · definições aplicam-se ao leitor instantaneamente",
    "Sign in with your phone": "Inicie sessão com o telemóvel", "Scan the code with your camera": "Leia o código com a câmara",
    "Generating code…": "A gerar código…", "Or use email": "Ou use o e-mail", "Email": "E-mail", "Password": "Palavra-passe", "Sign in": "Iniciar sessão",
    "Streams": "Links", "All": "Todos", "Movies": "Filmes", "Series": "Séries", "Addon": "Extensão",
    "UI Language": "Idioma da Interface", "Language": "Idioma", "Subtitles": "Legendas",
    "Subtitle size": "Tamanho da legenda", "Default subtitles": "Legenda predefinida",
    "Subtitle colour": "Cor da legenda", "Subtitle outline": "Contorno da legenda", "Subtitle background": "Fundo da legenda",
    "Embedded subtitles engine": "Motor de legendas embutidas",
    "Audio": "Áudio", "Auto audio track": "Faixa de áudio automática", "Default audio language": "Idioma de áudio predefinido",
    "Playback": "Reprodução", "Seek step": "Passo de avanço", "Auto-play next episode": "Reproduzir próximo episódio auto",
    "Background trailers": "Trailers em fundo", "Scrubbing previews": "Pré-visualizações ao avançar", "Addons": "Extensões",
    "Sync addons now": "Sincronizar extensões agora", "Account": "Conta", "Log out": "Terminar sessão",
    "Play": "Reproduzir", "Resume": "Retomar", "Details": "Detalhes", "Watch something similar": "Ver algo semelhante",
    "Trailer": "Trailer", "Mark as watched": "Marcar como visto", "Remove from Library": "Remover da Biblioteca",
    "Add to Library": "Adicionar à Biblioteca", "In Library": "Na Biblioteca", "+ Library": "+ Biblioteca",
    "Similar": "Semelhante", "Similar to": "Semelhante a"
  },
  "es": {
    "Search": "Buscar", "Home": "Inicio", "Discover": "Descubrir", "Library": "Biblioteca", "Settings": "Ajustes",
    "Search movies & series": "Buscar películas y series", "Press OK to type, Down for results": "Presiona OK para escribir, Abajo para resultados",
    "Left / Right to change · settings apply to the player instantly": "Izquierda / Derecha para cambiar · ajustes se aplican al instante",
    "Sign in with your phone": "Inicia sesión con tu teléfono", "Scan the code with your camera": "Escanea el código con tu cámara",
    "Generating code…": "Generando código…", "Or use email": "O usa correo electrónico", "Email": "Correo electrónico", "Password": "Contraseña", "Sign in": "Iniciar sesión",
    "Streams": "Enlaces", "All": "Todos", "Movies": "Películas", "Series": "Series", "Addon": "Addon",
    "UI Language": "Idioma de la interfaz", "Language": "Idioma", "Subtitles": "Subtítulos",
    "Subtitle size": "Tamaño del subtítulo", "Default subtitles": "Subtítulos por defecto",
    "Subtitle colour": "Color del subtítulo", "Subtitle outline": "Borde del subtítulo", "Subtitle background": "Fondo del subtítulo",
    "Embedded subtitles engine": "Motor de subtítulos integrados",
    "Audio": "Audio", "Auto audio track": "Pista de audio automática", "Default audio language": "Idioma de audio por defecto",
    "Playback": "Reproducción", "Seek step": "Salto de búsqueda", "Auto-play next episode": "Reproducir siguiente episodio auto",
    "Background trailers": "Tráilers de fondo", "Scrubbing previews": "Vistas previas de búsqueda", "Addons": "Addons",
    "Sync addons now": "Sincronizar addons ahora", "Account": "Cuenta", "Log out": "Cerrar sesión",
    "Play": "Reproducir", "Resume": "Reanudar", "Details": "Detalles", "Watch something similar": "Ver algo similar",
    "Trailer": "Tráiler", "Mark as watched": "Marcar como visto", "Remove from Library": "Eliminar de la Biblioteca",
    "Add to Library": "Añadir a la Biblioteca", "In Library": "En la Biblioteca", "+ Library": "+ Biblioteca",
    "Similar": "Similares", "Similar to": "Similar a"
  },
  "fr": {
    "Search": "Rechercher", "Home": "Accueil", "Discover": "Découvrir", "Library": "Bibliothèque", "Settings": "Paramètres",
    "Search movies & series": "Rechercher des films et des séries", "Press OK to type, Down for results": "Appuyez sur OK pour taper, Bas pour les résultats",
    "Left / Right to change · settings apply to the player instantly": "Gauche / Droite pour modifier · paramètres appliqués instantanément",
    "Sign in with your phone": "Connectez-vous avec votre téléphone", "Scan the code with your camera": "Scannez le code avec votre caméra",
    "Generating code…": "Génération du code…", "Or use email": "Ou utilisez l'e-mail", "Email": "E-mail", "Password": "Mot de passe", "Sign in": "Se connecter",
    "Streams": "Liens", "All": "Tous", "Movies": "Films", "Series": "Séries", "Addon": "Extension",
    "UI Language": "Langue de l'interface", "Language": "Langue", "Subtitles": "Sous-titres",
    "Subtitle size": "Taille des sous-titres", "Default subtitles": "Sous-titres par défaut",
    "Subtitle colour": "Couleur des sous-titres", "Subtitle outline": "Contour des sous-titres", "Subtitle background": "Fond des sous-titres",
    "Embedded subtitles engine": "Moteur de sous-titres intégrés",
    "Audio": "Audio", "Auto audio track": "Piste audio automatique", "Default audio language": "Langue audio par défaut",
    "Playback": "Lecture", "Seek step": "Saut de recherche", "Auto-play next episode": "Lecture automatique du prochain épisode",
    "Background trailers": "Bandes-annonces en arrière-plan", "Scrubbing previews": "Aperçus de défilement", "Addons": "Extensions",
    "Sync addons now": "Synchroniser les extensions", "Account": "Compte", "Log out": "Déconnexion",
    "Play": "Lecture", "Resume": "Reprendre", "Details": "Détails", "Watch something similar": "Regarder quelque chose de similaire",
    "Trailer": "Bande-annonce", "Mark as watched": "Marquer comme vu", "Remove from Library": "Retirer de la Bibliothèque",
    "Add to Library": "Ajouter à la Bibliothèque", "In Library": "Dans la Bibliothèque", "+ Library": "+ Bibliothèque",
    "Similar": "Similaire", "Similar to": "Similaire à"
  },
  "de": {
    "Search": "Suchen", "Home": "Start", "Discover": "Entdecken", "Library": "Bibliothek", "Settings": "Einstellungen",
    "Search movies & series": "Suche Filme & Serien", "Press OK to type, Down for results": "Drücke OK zum Tippen, Unten für Ergebnisse",
    "Left / Right to change · settings apply to the player instantly": "Links / Rechts zum Ändern · Einstellungen gelten sofort",
    "Sign in with your phone": "Mit dem Handy anmelden", "Scan the code with your camera": "Scanne den Code mit der Kamera",
    "Generating code…": "Code wird generiert…", "Or use email": "Oder E-Mail nutzen", "Email": "E-Mail", "Password": "Passwort", "Sign in": "Anmelden",
    "Streams": "Streams", "All": "Alle", "Movies": "Filme", "Series": "Serien", "Addon": "Addon",
    "UI Language": "Benutzeroberflächensprache", "Language": "Sprache", "Subtitles": "Untertitel",
    "Subtitle size": "Untertitelgröße", "Default subtitles": "Standard-Untertitel",
    "Subtitle colour": "Untertitel-Farbe", "Subtitle outline": "Untertitel-Umriss", "Subtitle background": "Untertitel-Hintergrund",
    "Embedded subtitles engine": "Integrierte Untertitel-Engine",
    "Audio": "Audio", "Auto audio track": "Automatische Audiospur", "Default audio language": "Standard-Audiosprache",
    "Playback": "Wiedergabe", "Seek step": "Spul-Schritt", "Auto-play next episode": "Nächste Episode automatisch abspielen",
    "Background trailers": "Hintergrund-Trailer", "Scrubbing previews": "Such-Vorschau", "Addons": "Addons",
    "Sync addons now": "Addons jetzt synchronisieren", "Account": "Konto", "Log out": "Abmelden",
    "Play": "Abspielen", "Resume": "Fortsetzen", "Details": "Details", "Watch something similar": "Etwas Ähnliches ansehen",
    "Trailer": "Trailer", "Mark as watched": "Als gesehen markieren", "Remove from Library": "Aus Bibliothek entfernen",
    "Add to Library": "Zur Bibliothek hinzufügen", "In Library": "In Bibliothek", "+ Library": "+ Bibliothek",
    "Similar": "Ähnlich", "Similar to": "Ähnlich wie"
  },
  "it": {
    "Search": "Cerca", "Home": "Home", "Discover": "Scopri", "Library": "Libreria", "Settings": "Impostazioni",
    "Search movies & series": "Cerca film e serie tv", "Press OK to type, Down for results": "Premi OK per digitare, Giù per i risultati",
    "Left / Right to change · settings apply to the player instantly": "Sinistra / Destra per cambiare · applicate all'istante",
    "Sign in with your phone": "Accedi con il telefono", "Scan the code with your camera": "Scansiona il codice con la fotocamera",
    "Generating code…": "Generazione codice…", "Or use email": "O usa l'email", "Email": "Email", "Password": "Password", "Sign in": "Accedi",
    "Streams": "Flussi", "All": "Tutti", "Movies": "Film", "Series": "Serie", "Addon": "Addon",
    "UI Language": "Lingua interfaccia", "Language": "Lingua", "Subtitles": "Sottotitoli",
    "Subtitle size": "Dimensione sottotitoli", "Default subtitles": "Sottotitoli predefiniti",
    "Subtitle colour": "Colore sottotitoli", "Subtitle outline": "Bordo sottotitoli", "Subtitle background": "Sfondo sottotitoli",
    "Embedded subtitles engine": "Motore sottotitoli integrato",
    "Audio": "Audio", "Auto audio track": "Traccia audio automatica", "Default audio language": "Lingua audio predefinita",
    "Playback": "Riproduzione", "Seek step": "Passo di ricerca", "Auto-play next episode": "Riproduzione automatica prossimo episodio",
    "Background trailers": "Trailer in background", "Scrubbing previews": "Anteprime di ricerca", "Addons": "Addon",
    "Sync addons now": "Sincronizza addon", "Account": "Account", "Log out": "Esci",
    "Play": "Riproduci", "Resume": "Riprendi", "Details": "Dettagli", "Watch something similar": "Guarda qualcosa di simile",
    "Trailer": "Trailer", "Mark as watched": "Segna come visto", "Remove from Library": "Rimuovi dalla Libreria",
    "Add to Library": "Aggiungi alla Libreria", "In Library": "Nella Libreria", "+ Library": "+ Libreria",
    "Similar": "Simili", "Similar to": "Simile a"
  },
  "zh": {
    "Search": "搜索", "Home": "主页", "Discover": "发现", "Library": "库", "Settings": "设置",
    "Search movies & series": "搜索电影和剧集", "Press OK to type, Down for results": "按OK键输入，向下查看结果",
    "Left / Right to change · settings apply to the player instantly": "左右切换 · 设置即时应用于播放器",
    "Sign in with your phone": "用手机登录", "Scan the code with your camera": "用相机扫描代码",
    "Generating code…": "生成代码中…", "Or use email": "或使用电子邮件", "Email": "电子邮件", "Password": "密码", "Sign in": "登录",
    "Streams": "流", "All": "全部", "Movies": "电影", "Series": "剧集", "Addon": "插件",
    "UI Language": "界面语言", "Language": "语言", "Subtitles": "字幕",
    "Subtitle size": "字幕大小", "Default subtitles": "默认字幕",
    "Subtitle colour": "字幕颜色", "Subtitle outline": "字幕边框", "Subtitle background": "字幕背景",
    "Embedded subtitles engine": "内置字幕引擎",
    "Audio": "音频", "Auto audio track": "自动音轨", "Default audio language": "默认音频语言",
    "Playback": "播放", "Seek step": "快进/快退步长", "Auto-play next episode": "自动播放下一集",
    "Background trailers": "后台预告片", "Scrubbing previews": "拖动预览", "Addons": "插件",
    "Sync addons now": "立即同步插件", "Account": "帐户", "Log out": "登出",
    "Play": "播放", "Resume": "继续", "Details": "详情", "Watch something similar": "观看相似内容",
    "Trailer": "预告片", "Mark as watched": "标记为已观看", "Remove from Library": "从库中移除",
    "Add to Library": "添加到库", "In Library": "在库中", "+ Library": "+ 库",
    "Similar": "相似", "Similar to": "相似于"
  },
  "ja": {
    "Search": "検索", "Home": "ホーム", "Discover": "見つける", "Library": "ライブラリ", "Settings": "設定",
    "Search movies & series": "映画とシリーズを検索", "Press OK to type, Down for results": "OKを押して入力、下で結果を表示",
    "Left / Right to change · settings apply to the player instantly": "左右で変更 · 設定はすぐに適用されます",
    "Sign in with your phone": "スマートフォンでサインイン", "Scan the code with your camera": "カメラでコードをスキャン",
    "Generating code…": "コードを生成中…", "Or use email": "またはメールを使用", "Email": "メール", "Password": "パスワード", "Sign in": "サインイン",
    "Streams": "ストリーム", "All": "すべて", "Movies": "映画", "Series": "シリーズ", "Addon": "アドオン",
    "UI Language": "UI言語", "Language": "言語", "Subtitles": "字幕",
    "Subtitle size": "字幕サイズ", "Default subtitles": "デフォルト字幕",
    "Subtitle colour": "字幕の色", "Subtitle outline": "字幕の枠線", "Subtitle background": "字幕の背景",
    "Embedded subtitles engine": "埋め込み字幕エンジン",
    "Audio": "オーディオ", "Auto audio track": "自動オーディオトラック", "Default audio language": "デフォルトの音声言語",
    "Playback": "再生", "Seek step": "シークステップ", "Auto-play next episode": "次のエピソードを自動再生",
    "Background trailers": "背景の予告編", "Scrubbing previews": "スクラブプレビュー", "Addons": "アドオン",
    "Sync addons now": "アドオンを同期", "Account": "アカウント", "Log out": "ログアウト",
    "Play": "再生", "Resume": "再開", "Details": "詳細", "Watch something similar": "似たような作品を見る",
    "Trailer": "予告編", "Mark as watched": "視聴済みとしてマーク", "Remove from Library": "ライブラリから削除",
    "Add to Library": "ライブラリに追加", "In Library": "ライブラリ内", "+ Library": "+ ライブラリ",
    "Similar": "類似作品", "Similar to": "類似する作品"
  },
  "ko": {
    "Search": "검색", "Home": "홈", "Discover": "둘러보기", "Library": "보관함", "Settings": "설정",
    "Search movies & series": "영화 및 시리즈 검색", "Press OK to type, Down for results": "OK를 눌러 입력, 아래로 결과를 확인",
    "Left / Right to change · settings apply to the player instantly": "좌우로 변경 · 설정은 플레이어에 즉시 적용됩니다",
    "Sign in with your phone": "휴대전화로 로그인", "Scan the code with your camera": "카메라로 코드를 스캔하세요",
    "Generating code…": "코드 생성 중…", "Or use email": "또는 이메일 사용", "Email": "이메일", "Password": "비밀번호", "Sign in": "로그인",
    "Streams": "스트림", "All": "전체", "Movies": "영화", "Series": "시리즈", "Addon": "애드온",
    "UI Language": "UI 언어", "Language": "언어", "Subtitles": "자막",
    "Subtitle size": "자막 크기", "Default subtitles": "기본 자막",
    "Subtitle colour": "자막 색상", "Subtitle outline": "자막 윤곽선", "Subtitle background": "자막 배경",
    "Embedded subtitles engine": "내장 자막 엔진",
    "Audio": "오디오", "Auto audio track": "자동 오디오 트랙", "Default audio language": "기본 오디오 언어",
    "Playback": "재생", "Seek step": "탐색 간격", "Auto-play next episode": "다음 에피소드 자동 재생",
    "Background trailers": "배경 예고편", "Scrubbing previews": "탐색 미리보기", "Addons": "애드온",
    "Sync addons now": "애드온 동기화", "Account": "계정", "Log out": "로그아웃",
    "Play": "재생", "Resume": "이어보기", "Details": "세부정보", "Watch something similar": "비슷한 콘텐츠 시청",
    "Trailer": "예고편", "Mark as watched": "시청함으로 표시", "Remove from Library": "보관함에서 제거",
    "Add 보관함": "보관함에 추가", "In Library": "보관함에 있음", "+ Library": "+ 보관함",
    "Similar": "유사한 콘텐츠", "Similar to": "유사한 콘텐츠"
  },
  "hi": {
    "Search": "खोजें", "Home": "होम", "Discover": "खोज", "Library": "लाइब्रेरी", "Settings": "सेटिंग्स",
    "Search movies & series": "फिल्में और सीरीज खोजें", "Press OK to type, Down for results": "टाइप करने के लिए OK दबाएं, परिणाम के लिए नीचे",
    "Left / Right to change · settings apply to the player instantly": "बदलने के लिए बाएँ/दाएँ · सेटिंग्स तुरंत लागू होती हैं",
    "Sign in with your phone": "अपने फोन से साइन इन करें", "Scan the code with your camera": "कैमरे से कोड स्कैन करें",
    "Generating code…": "कोड बन रहा है…", "Or use email": "या ईमेल का उपयोग करें", "Email": "ईमेल", "Password": "पासवर्ड", "Sign in": "साइन इन करें",
    "Streams": "स्ट्रीम्स", "All": "सभी", "Movies": "फिल्में", "Series": "सीरीज", "Addon": "एडऑन",
    "UI Language": "UI भाषा", "Language": "भाषा", "Subtitles": "उपशीर्षक",
    "Subtitle size": "उपशीर्षक का आकार", "Default subtitles": "डिफ़ॉल्ट उपशीर्षक",
    "Subtitle colour": "उपशीर्षक का रंग", "Subtitle outline": "उपशीर्षक की रूपरेखा", "Subtitle background": "उपशीर्षक की पृष्ठभूमि",
    "Embedded subtitles engine": "एम्बेडेड उपशीर्षक इंजन",
    "Audio": "ऑडियो", "Auto audio track": "ऑटो ऑडियो ट्रैक", "Default audio language": "डिफ़ॉल्ट ऑडियो भाषा",
    "Playback": "प्लेबैक", "Seek step": "सीक स्टेप", "Auto-play next episode": "अगला एपिसोड स्वतः चलाएं",
    "Background trailers": "बैकग्राउंड ट्रेलर", "Scrubbing previews": "स्क्रबिंग पूर्वावलोकन", "Addons": "एडऑन",
    "Sync addons now": "अभी एडऑन सिंक करें", "Account": "खाता", "Log out": "लॉग आउट करें",
    "Play": "चलाएं", "Resume": "फिर से शुरू", "Details": "विवरण", "Watch something similar": "कुछ ऐसा ही देखें",
    "Trailer": "ट्रेलर", "Mark as watched": "देखे गए के रूप में चिह्नित करें", "Remove from Library": "लाइब्रेरी से हटाएं",
    "Add to Library": "लाइब्रेरी में जोड़ें", "In Library": "लाइब्रेरी में", "+ Library": "+ लाइब्रेरी",
    "Similar": "समान", "Similar to": "के समान"
  },
  "ar": {
    "Search": "بحث", "Home": "الرئيسية", "Discover": "اكتشف", "Library": "المكتبة", "Settings": "الإعدادات",
    "Search movies & series": "ابحث عن الأفلام والمسلسلات", "Press OK to type, Down for results": "اضغط موافق للكتابة، لأسفل للنتائج",
    "Left / Right to change · settings apply to the player instantly": "يسار / يمين للتغيير · تطبق الإعدادات فورًا",
    "Sign in with your phone": "تسجيل الدخول بهاتفك", "Scan the code with your camera": "امسح الرمز بكاميرتك",
    "Generating code…": "جاري إنشاء الرمز…", "Or use email": "أو استخدم البريد", "Email": "البريد الإلكتروني", "Password": "كلمة المرور", "Sign in": "دخول",
    "Streams": "الروابط", "All": "الكل", "Movies": "أفلام", "Series": "مسلسلات", "Addon": "إضافة",
    "UI Language": "لغة الواجهة", "Language": "اللغة", "Subtitles": "الترجمات",
    "Subtitle size": "حجم الترجمة", "Default subtitles": "الترجمة الافتراضية",
    "Subtitle colour": "لون الترجمة", "Subtitle outline": "حدود الترجمة", "Subtitle background": "خلفية الترجمة",
    "Embedded subtitles engine": "محرك الترجمة المدمج",
    "Audio": "الصوت", "Auto audio track": "مسار صوتي تلقائي", "Default audio language": "لغة الصوت الافتراضية",
    "Playback": "التشغيل", "Seek step": "خطوة التقديم", "Auto-play next episode": "تشغيل الحلقة التالية تلقائيًا",
    "Background trailers": "إعلانات الخلفية", "Scrubbing previews": "معاينة التقديم", "Addons": "الإضافات",
    "Sync addons now": "مزامنة الإضافات", "Account": "الحساب", "Log out": "تسجيل خروج",
    "Play": "تشغيل", "Resume": "متابعة", "Details": "تفاصيل", "Watch something similar": "شاهد شيئًا مشابهًا",
    "Trailer": "إعلان", "Mark as watched": "تحديد كمشاهد", "Remove from Library": "إزالة من المكتبة",
    "Add to Library": "إضافة للمكتبة", "In Library": "في المكتبة", "+ Library": "+ المكتبة",
    "Similar": "مشابه", "Similar to": "مشابه لـ"
  },
  "ru": {
    "Search": "Поиск", "Home": "Главная", "Discover": "Обзор", "Library": "Медиатека", "Settings": "Настройки",
    "Search movies & series": "Поиск фильмов и сериалов", "Press OK to type, Down for results": "Нажмите OK для ввода, Вниз для результатов",
    "Left / Right to change · settings apply to the player instantly": "Влево / Вправо для изменения · применяются мгновенно",
    "Sign in with your phone": "Войти с помощью телефона", "Scan the code with your camera": "Отсканируйте код камерой",
    "Generating code…": "Генерация кода…", "Or use email": "Или используйте email", "Email": "Email", "Password": "Пароль", "Sign in": "Войти",
    "Streams": "Потоки", "All": "Все", "Movies": "Фильмы", "Series": "Сериалы", "Addon": "Аддон",
    "UI Language": "Язык интерфейса", "Language": "Язык", "Subtitles": "Субтитры",
    "Subtitle size": "Размер субтитров", "Default subtitles": "Субтитры по умолчанию",
    "Subtitle colour": "Цвет субтитров", "Subtitle outline": "Контур субтитров", "Subtitle background": "Фон субтитров",
    "Embedded subtitles engine": "Движок встроенных субтитров",
    "Audio": "Аудио", "Auto audio track": "Автоматическая аудиодорожка", "Default audio language": "Язык аудио по умолчанию",
    "Playback": "Воспроизведение", "Seek step": "Шаг перемотки", "Auto-play next episode": "Автовоспроизведение следующего эпизода",
    "Background trailers": "Фоновые трейлеры", "Scrubbing previews": "Предпросмотр перемотки", "Addons": "Аддоны",
    "Sync addons now": "Синхронизировать аддоны", "Account": "Аккаунт", "Log out": "Выйти",
    "Play": "Играть", "Resume": "Продолжить", "Details": "Детали", "Watch something similar": "Смотреть похожее",
    "Trailer": "Трейлер", "Mark as watched": "Отметить как просмотренное", "Remove from Library": "Удалить из Медиатеки",
    "Add to Library": "Добавить в Медиатеку", "In Library": "В Медиатеке", "+ Library": "+ Медиатека",
    "Similar": "Похожие", "Similar to": "Похожие на"
  },
  "tr": {
    "Search": "Ara", "Home": "Ana Sayfa", "Discover": "Keşfet", "Library": "Kütüphane", "Settings": "Ayarlar",
    "Search movies & series": "Film ve dizi ara", "Press OK to type, Down for results": "Yazmak için OK'e, sonuçlar için Aşağı'ya bas",
    "Left / Right to change · settings apply to the player instantly": "Değiştirmek için Sol / Sağ · ayarlar anında uygulanır",
    "Sign in with your phone": "Telefonunuzla giriş yapın", "Scan the code with your camera": "Kodu kameranızla tarayın",
    "Generating code…": "Kod oluşturuluyor…", "Or use email": "Veya e-posta kullan", "Email": "E-posta", "Password": "Şifre", "Sign in": "Giriş yap",
    "Streams": "Yayınlar", "All": "Tümü", "Movies": "Filmler", "Series": "Diziler", "Addon": "Eklenti",
    "UI Language": "Arayüz Dili", "Language": "Dil", "Subtitles": "Altyazılar",
    "Subtitle size": "Altyazı boyutu", "Default subtitles": "Varsayılan altyazılar",
    "Subtitle colour": "Altyazı rengi", "Subtitle outline": "Altyazı ana hattı", "Subtitle background": "Altyazı arka planı",
    "Embedded subtitles engine": "Gömülü altyazı motoru",
    "Audio": "Ses", "Auto audio track": "Otomatik ses parçası", "Default audio language": "Varsayılan ses dili",
    "Playback": "Oynatma", "Seek step": "İleri sarma adımı", "Auto-play next episode": "Sonraki bölümü otomatik oynat",
    "Background trailers": "Arka plan fragmanları", "Scrubbing previews": "İleri sarma önizlemeleri", "Addons": "Eklentiler",
    "Sync addons now": "Eklentileri senkronize et", "Account": "Hesap", "Log out": "Çıkış yap",
    "Play": "Oynat", "Resume": "Devam Et", "Details": "Detaylar", "Watch something similar": "Benzer bir şey izle",
    "Trailer": "Fragman", "Mark as watched": "İzlendi olarak işaretle", "Remove from Library": "Kütüphaneden kaldır",
    "Add to Library": "Kütüphaneye ekle", "In Library": "Kütüphanede", "+ Library": "+ Kütüphane",
    "Similar": "Benzer", "Similar to": "Şuna benzer"
  },
  "id": {
    "Search": "Cari", "Home": "Beranda", "Discover": "Temukan", "Library": "Perpustakaan", "Settings": "Pengaturan",
    "Search movies & series": "Cari film & serial", "Press OK to type, Down for results": "Tekan OK untuk mengetik, Bawah untuk hasil",
    "Left / Right to change · settings apply to the player instantly": "Kiri / Kanan untuk mengubah · pengaturan langsung berlaku",
    "Sign in with your phone": "Masuk dengan ponsel Anda", "Scan the code with your camera": "Pindai kode dengan kamera",
    "Generating code…": "Membuat kode…", "Or use email": "Atau gunakan email", "Email": "Email", "Password": "Kata sandi", "Sign in": "Masuk",
    "Streams": "Aliran", "All": "Semua", "Movies": "Film", "Series": "Serial", "Addon": "Pengaya",
    "UI Language": "Bahasa Antarmuka", "Language": "Bahasa", "Subtitles": "Takarir",
    "Subtitle size": "Ukuran takarir", "Default subtitles": "Takarir bawaan",
    "Subtitle colour": "Warna takarir", "Subtitle outline": "Garis besar takarir", "Subtitle background": "Latar belakang takarir",
    "Embedded subtitles engine": "Mesin takarir tersemat",
    "Audio": "Audio", "Auto audio track": "Trek audio otomatis", "Default audio language": "Bahasa audio bawaan",
    "Playback": "Pemutaran", "Seek step": "Langkah pencarian", "Auto-play next episode": "Putar otomatis episode berikutnya",
    "Background trailers": "Cuplikan latar belakang", "Scrubbing previews": "Pratinjau pencarian", "Addons": "Pengaya",
    "Sync addons now": "Sinkronkan pengaya sekarang", "Account": "Akun", "Log out": "Keluar",
    "Play": "Putar", "Resume": "Lanjutkan", "Details": "Detail", "Watch something similar": "Tonton sesuatu yang serupa",
    "Trailer": "Cuplikan", "Mark as watched": "Tandai sudah ditonton", "Remove from Library": "Hapus dari Perpustakaan",
    "Add to Library": "Tambahkan ke Perpustakaan", "In Library": "Di Perpustakaan", "+ Library": "+ Perpustakaan",
    "Similar": "Serupa", "Similar to": "Serupa dengan"
  }
};

const js_injection = `
var TRANSLATIONS = ${JSON.stringify(translations)};
function t(k) {
  var lng = 'en';
  try { lng = localStorage.getItem('uiLang') || 'en'; } catch(e) {}
  if(TRANSLATIONS[lng] && TRANSLATIONS[lng][k]) return TRANSLATIONS[lng][k];
  return k;
}
`;

html = html.replace("<script>\\n(function(){\\n'use strict';", "<script>\\n" + js_injection + "\\n(function(){\\n'use strict';");

html = html.replace(">Search</div>", "><script>document.write(t('Search'))</script></div>");
html = html.replace(">Home</div>", "><script>document.write(t('Home'))</script></div>");
html = html.replace(">Discover</div>", "><script>document.write(t('Discover'))</script></div>");
html = html.replace(">Library</div>", "><script>document.write(t('Library'))</script></div>");
html = html.replace(">Settings</div>", "><script>document.write(t('Settings'))</script></div>");

html = html.replace('<input id="sBox" placeholder="Search movies & series">', '<input id="sBox">');
html = html.replace('<div id="sHint">Press OK to type, Down for results</div>', '<div id="sHint"></div>');
html = html.replace('<input class="lgin" id="lgEmail" placeholder="Email">', '<input class="lgin" id="lgEmail">');
html = html.replace('<input class="lgin" id="lgPass" placeholder="Password" type="password">', '<input class="lgin" id="lgPass" type="password">');

const updater_script = `<script>
document.getElementById('sBox').placeholder = t('Search movies & series');
document.getElementById('sHint').textContent = t('Press OK to type, Down for results');
document.getElementById('lgEmail').placeholder = t('Email');
document.getElementById('lgPass').placeholder = t('Password');
document.querySelector('.sethint').textContent = t('Left / Right to change · settings apply to the player instantly');
document.querySelector('#lgQr h2').textContent = t('Sign in with your phone');
document.querySelector('#lgQr .s').textContent = t('Scan the code with your camera');
document.getElementById('lgStat').textContent = t('Generating code…');
document.querySelector('#lgForm h2').textContent = t('Or use email');
document.getElementById('lgBtn').textContent = t('Sign in');
document.querySelector('#streams h3').textContent = t('Streams');
</script>`;

html = html.replace("</body>", updater_script + "\\n</body>");

html = html.replace(">Left / Right to change · settings apply to the player instantly</div>", "></div>");
html = html.replace("<h2>Sign in with your phone</h2>", "<h2></h2>");
html = html.replace('<div class="s">Scan the code with your camera</div>', '<div class="s"></div>');
html = html.replace('<div id="lgStat">Generating code…</div>', '<div id="lgStat"></div>');
html = html.replace("<h2>Or use email</h2>", "<h2></h2>");
html = html.replace('<div id="lgBtn">Sign in</div>', '<div id="lgBtn"></div>');
html = html.replace("<h3>Streams</h3>", "<h3></h3>");

html = html.replace("'All'", "t('All')");
html = html.replace("'Movies'", "t('Movies')");
html = html.replace("'Series'", "t('Series')");
html = html.replace("'Addon'", "t('Addon')");
html = html.replace("'Similar'", "t('Similar')");
html = html.replace("'Similar to '", "t('Similar to') + ' '");
html = html.replace("'Play'", "t('Play')");
html = html.replace("'Resume'", "t('Resume')");
html = html.replace("'Details'", "t('Details')");
html = html.replace("'Watch something similar'", "t('Watch something similar')");
html = html.replace("'Trailer'", "t('Trailer')");
html = html.replace("'Mark as watched'", "t('Mark as watched')");
html = html.replace("'Remove from Library'", "t('Remove from Library')");
html = html.replace("'Add to Library'", "t('Add to Library')");
html = html.replace("'+ Library'", "t('+ Library')");
html = html.replace("'In Library'", "t('In Library')");

fs.writeFileSync(file_path, html, "utf-8");
