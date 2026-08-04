import re
import json

new_en_strings = [
    "Signed in", "Free account", "Premium until ", "Subtitle size", "Default subtitles", 
    "White", "Yellow", "Cyan", "Subtitle colour", "Black", "Subtitle outline", "None", "Solid", "Transparent", 
    "Subtitle background", "Extract (recommended)", "TV native", "Embedded subtitles engine", "Audio", 
    "Auto audio track", "On", "Off", "Default audio language", "Playback", "Seek step", "Auto-play next episode", 
    "Background trailers", "Scrubbing previews", "Addons", "Sync addons now", "Account", "Log out",
    "Loading trailer…", "Trailer unavailable", "No trailer available", "Removed from Library", 
    "Added to Library", "Mark as watched", "Marked as watched", "Could not load title", "Syncing…", 
    "Addons updated", "Addons up to date", "Signing out…", "Signing in…", "Resume", "Play", "Details", 
    "Watch something similar", "Trailer", "Remove from Library", "Add to Library", "Similar", "Similar to", 
    "In Library", "+ Library", "Addon"
]

translations = {
    "pt": {
        "Signed in": "Conectado", "Free account": "Conta Gratuita", "Premium until ": "Premium até ", "Subtitle size": "Tamanho da legenda", "Default subtitles": "Legendas padrão",
        "White": "Branco", "Yellow": "Amarelo", "Cyan": "Ciano", "Subtitle colour": "Cor da legenda", "Black": "Preto", "Subtitle outline": "Contorno da legenda",
        "None": "Nenhum", "Solid": "Sólido", "Transparent": "Transparente", "Subtitle background": "Fundo da legenda",
        "Extract (recommended)": "Extrair (recomendado)", "TV native": "Nativo da TV", "Embedded subtitles engine": "Motor de legendas embutidas",
        "Audio": "Áudio", "Auto audio track": "Faixa de áudio automática", "On": "Ligado", "Off": "Desligado", "Default audio language": "Idioma de áudio padrão",
        "Playback": "Reprodução", "Seek step": "Passo de busca", "Auto-play next episode": "Tocar próximo episódio", "Background trailers": "Trailers de fundo",
        "Scrubbing previews": "Prévias na barra de tempo", "Addons": "Complementos", "Sync addons now": "Sincronizar complementos", "Account": "Conta", "Log out": "Sair",
        "Loading trailer…": "Carregando trailer...", "Trailer unavailable": "Trailer indisponível", "No trailer available": "Nenhum trailer",
        "Removed from Library": "Removido da Biblioteca", "Added to Library": "Adicionado à Biblioteca", "Mark as watched": "Marcar como visto",
        "Marked as watched": "Marcado como visto", "Could not load title": "Não foi possível carregar o título", "Syncing…": "Sincronizando...",
        "Addons updated": "Complementos atualizados", "Addons up to date": "Complementos atualizados", "Signing out…": "Saindo...",
        "Signing in…": "Entrando...", "Resume": "Continuar", "Play": "Assistir", "Details": "Detalhes", "Watch something similar": "Assistir algo parecido",
        "Trailer": "Trailer", "Remove from Library": "Remover da Biblioteca", "Add to Library": "Adicionar à Biblioteca", "Similar": "Similares",
        "Similar to": "Similares a", "In Library": "Na Biblioteca", "+ Library": "+ Biblioteca", "Addon": "Complemento"
    },
    "es": {
        "Signed in": "Conectado", "Free account": "Cuenta Gratis", "Premium until ": "Premium hasta ", "Subtitle size": "Tamaño de subtítulos", "Default subtitles": "Subtítulos por defecto",
        "White": "Blanco", "Yellow": "Amarillo", "Cyan": "Cian", "Subtitle colour": "Color de subtítulo", "Black": "Negro", "Subtitle outline": "Borde de subtítulo",
        "None": "Ninguno", "Solid": "Sólido", "Transparent": "Transparente", "Subtitle background": "Fondo de subtítulo",
        "Extract (recommended)": "Extraer (recomendado)", "TV native": "Nativo de TV", "Embedded subtitles engine": "Motor de subtítulos",
        "Audio": "Audio", "Auto audio track": "Pista de audio automática", "On": "Activado", "Off": "Desactivado", "Default audio language": "Idioma de audio por defecto",
        "Playback": "Reproducción", "Seek step": "Paso de búsqueda", "Auto-play next episode": "Auto-reproducir próximo episodio", "Background trailers": "Trailers de fondo",
        "Scrubbing previews": "Vistas previas", "Addons": "Complementos", "Sync addons now": "Sincronizar complementos", "Account": "Cuenta", "Log out": "Cerrar sesión",
        "Loading trailer…": "Cargando trailer...", "Trailer unavailable": "Trailer no disponible", "No trailer available": "Sin trailer",
        "Removed from Library": "Eliminado de la Biblioteca", "Added to Library": "Añadido a la Biblioteca", "Mark as watched": "Marcar como visto",
        "Marked as watched": "Marcado como visto", "Could not load title": "No se pudo cargar", "Syncing…": "Sincronizando...",
        "Addons updated": "Complementos actualizados", "Addons up to date": "Complementos al día", "Signing out…": "Cerrando sesión...",
        "Signing in…": "Iniciando sesión...", "Resume": "Continuar", "Play": "Reproducir", "Details": "Detalles", "Watch something similar": "Ver algo similar",
        "Trailer": "Trailer", "Remove from Library": "Eliminar de Biblioteca", "Add to Library": "Añadir a Biblioteca", "Similar": "Similares",
        "Similar to": "Similares a", "In Library": "En Biblioteca", "+ Library": "+ Biblioteca", "Addon": "Complemento"
    },
}

with open('unpacked/usr/palm/services/io.strem.tv.beta.server/beta.html', 'r', encoding='utf-8') as f:
    content = f.read()

# We extract the current dict definition
dict_pattern = re.compile(r'var dict = (\{.*?\});\nfunction t\(s\)', re.DOTALL)
match = dict_pattern.search(content)

if match:
    current_dict_str = match.group(1)
    current_dict = json.loads(current_dict_str)
    
    # Update dict with new strings
    for lang, new_translations in translations.items():
        if lang in current_dict:
            current_dict[lang].update(new_translations)
            
    # For languages we didn't explicitly translate, just copy english as a fallback so we don't error out
    # Actually, if we don't have it, t() defaults to the string anyway. But let's add them to fr, de, it, zh, ja, ru, tr using basic dict mapping or just let them fallback
    
    new_dict_str = json.dumps(current_dict, ensure_ascii=False, indent=2)
    content = content[:match.start(1)] + new_dict_str + content[match.end(1):]
    
    with open('unpacked/usr/palm/services/io.strem.tv.beta.server/beta.html', 'w', encoding='utf-8') as f:
        f.write(content)
    print("Updated dict in beta.html")
else:
    print("Could not find dict")
