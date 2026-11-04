# MVP Acceptance Checklist

Fecha de última verificación: 2026-11-04

- [x] `node_modules` verificado y `npm run build` pasa con TypeScript (Next.js 16.3.3).
- [x] `npm test` ejecuta suite completa Node (`tests/core.test.cjs`, `tests/extension.test.cjs`) + Python (`pytest`).
- [x] `npm run classify` y `npm run export:xlsx` apuntan a `scripts/classify_topics.py` y `scripts/build_xlsx.py`.
- [x] El HAR real local importa como 20 registros únicos.
- [x] Reimportar el mismo HAR produce 20 duplicados y 0 nuevos, sin inflar el archivo.
- [x] Raw file de X se preserva bajo `data/raw/x/`.
- [x] Se escribe checkpoint `data/checkpoints/x-import.last.json` e historial `import_history` en SQLite.
- [x] Instagram export oficial JSON/ZIP/HTML está implementado y cubierto por fixture.
- [x] Biblioteca usa datos reales de `/api/bookmarks` con índice SQLite FTS5 (`bookmarks_fts`) y modo de Búsqueda Semántica / Conceptual.
- [x] Actualización en lote (`PUT /api/bookmarks`) opera en una única transacción SQLite.
- [x] Editor visual de reglas (`data/topic_rules.json`) crea snapshot SHA-256 previo y permite reversión limpia en 1 clic.
- [x] Botones de "Reclasificar todo (Reglas)" y "Enriquecer lote con IA" funcionan de punta a punta con degradación explícita y honesta.
- [x] Archivador local de multimedia (`POST /api/media/archive`) descarga archivos en `data/media/` o degrada a `referenced`.
- [x] Extensión de navegador (`browser-extension/`) incluye sincronización directa a `http://localhost:3070/api/bookmarks`.
- [x] Excel contiene `Resumen`, `Todos`, `Por tema`, `Por fuente`, `Errores`, `Manifest` y columna `Confianza` alineada.
- [x] No se usa API paga de X ni se exponen credenciales.
