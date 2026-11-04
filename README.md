# Atlas de Guardados — Versión Final Unificada (Legacy MVP + Mejoras)

Esta es la **versión final unificada y mejorada** del proyecto **Atlas de Guardados** (X/Twitter e Instagram Bookmarks) en `C:\Users\User\Desktop\spum\IA\atlas-de-guardados-legacy`.

## Qué incluye esta versión

1. **Datos reales precargados (`data/atlas.db` + `data/normalized/archive.json`)**:
   - Incluye tus **20 guardados reales de X** extraídos de tu captura real `data/raw/x/x.com.initial.har` (`@beamnxw`, `@RoundtableSpace`, `@Rahmanbarik`, `@simplifyinAI`, etc.), sin registros demo falsos.
2. **Interfaz completa de 6 vistas (`Resumen`, `Biblioteca`, `Temas`, `Fuentes`, `Exportar`, `Captura`)**:
   - **Búsqueda Dual en Biblioteca**: Alterna entre **Búsqueda Exacta (SQLite FTS5)** con índice full-text y **Búsqueda Semántica / Conceptual** bilingüe con porcentaje de afinidad.
   - **Acciones en lote transaccionales (`PUT /api/bookmarks`)**: Marca múltiples guardados como revisados o edita temas en una sola transacción SQLite.
3. **Las 4 Alternativas Reales de Captura e Importación**:
   - **Alternativa 1 — Subir Archivos (`.har`, `.zip`, `.json`, `.js`, `.csv`, `.txt`)**: Procesa capturas `.har` de DevTools (X GraphQL `Bookmarks`), archivos `.zip`/`saved_posts.json` de Meta/Instagram (incluyendo colecciones), `bookmarks.js` de X GDPR, CSV y TXT.
   - **Alternativa 2 — Captura en tu navegador (Script de Consola 1-Clic o Extensión Chrome/Edge)**: Copia el script de auto-scroll o usa la extensión Manifest V3 (`browser-extension/`), que ahora incluye **Sincronización Directa en 1 Clic (`POST http://localhost:3070/api/bookmarks`)** además de descarga JSON.
   - **Alternativa 3 — Navegador Automatizado Playwright (`scripts/browser-extractor.mjs`)**: Abre una ventana de Chromium con perfil persistente y guarda automáticamente en SQLite.
   - **Alternativa 4 — URLs / Lote Rápido con Extracción Pública oEmbed**: Recupera automáticamente el texto real y el autor de tweets públicos mediante `publish.twitter.com/oembed` sin requerir API de pago.
4. **Taxonomía Auditable con Snapshot SHA-256 + IA con Degradación Explícita**:
   - **Editor Visual de Reglas (`TopicsView` + `/api/topics/rules`)**: Lee y edita dinámicamente `data/topic_rules.json`, previsualiza coincidencias en tiempo real, crea un **snapshot SHA-256** previo (`data/normalized/backups/topic_rules.snapshot.json`) y permite **revertir en 1 clic**.
   - **Enriquecimiento IA + Enlaces Externos (`/api/ai/enrich`)**: Extrae metadatos de enlaces salientes (`outgoingLinks`) y soporta Gemini (`GEMINI_API_KEY`) u Ollama local (`OLLAMA_MODEL`) con degradación explícita y honesta hacia reglas deterministas locales.
5. **Archivador Multimedia Local (`/api/media/archive`) y Exportación Excel Verificada de 6 Hojas (`exports/bookmarks_archive.xlsx`)**:
   - Pestañas `Resumen`, `Todos`, `Por tema`, `Por fuente`, `Errores` y `Manifest`, incluyendo columna `Confianza` y protección contra inyección de fórmulas.

---

## Cómo iniciar la aplicación

Ejecuta desde la terminal en `C:\Users\User\Desktop\spum\IA\atlas-de-guardados-legacy` (o haz doble clic en **`iniciar-atlas.bat`**):

```bash
npm run dev
```

Luego abre **`http://localhost:3070`** en tu navegador.

## Pruebas automatizadas

```bash
npm test
```
