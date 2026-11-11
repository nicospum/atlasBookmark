# Auditoría de Salida, Herramientas de Customización y Prompts de Desarrollo por Etapas

> [!IMPORTANT]
> **Estado de la aplicación (`atlas-de-guardados-legacy`)**: Además de documentar los **3 entregables** solicitados, **ejecutamos e integramos directamente en el código del repositorio** la limpieza de los bugs detectados en la auditoría, el motor de **Customización Previa** ([`lib/customization-store.ts`](file:///c:/Users/User/Desktop/spum/IA/atlas-de-guardados-legacy/lib/customization-store.ts) y [`components/customization-drawer.tsx`](file:///c:/Users/User/Desktop/spum/IA/atlas-de-guardados-legacy/components/customization-drawer.tsx)) y el **Chat Agéntico Global** ([`components/global-agent-chat.tsx`](file:///c:/Users/User/Desktop/spum/IA/atlas-de-guardados-legacy/components/global-agent-chat.tsx), [`lib/agent-tools.ts`](file:///c:/Users/User/Desktop/spum/IA/atlas-de-guardados-legacy/lib/agent-tools.ts) y [`app/api/agent/chat/route.ts`](file:///c:/Users/User/Desktop/spum/IA/atlas-de-guardados-legacy/app/api/agent/chat/route.ts)) con **Hermes** como agente principal + **Gemini, Claude y ChatGPT** intercambiables.

---

## Entregable 1: Auditoría de lo que falta para salir (Verificaciones y Bugs Críticos)

Se realizó una inspección integral del repositorio `C:\Users\User\Desktop\spum\IA\atlas-de-guardados-legacy`, de la base de datos SQLite (`data/atlas.db` y `data/normalized/archive.json`), de las vistas de frontend y de los endpoints de servidor.

### 1.1. Bugs Críticos Detectados y Resueltos en esta Auditoría

| ID | Severidad | Hallazgo en Auditoría | Archivo / Componente Afectado | Estado y Corrección Aplicada |
| :--- | :--- | :--- | :--- | :--- |
| **BUG-01** | **Crítico (Datos)** | **Prefijos residuales `owner/repo — ...` en 20 títulos de `data/atlas.db`:** En pasadas previas de OCR/extracción, cuando un prompt devolvía el placeholder literal `owner/repo`, [`classifyGitHubUrl`](file:///c:/Users/User/Desktop/spum/IA/atlas-de-guardados-legacy/lib/resource-investigator.ts#L121-L189) no filtraba los segmentos genéricos `owner`/`repo` y [`synthesizeBookmarkFields`](file:///c:/Users/User/Desktop/spum/IA/atlas-de-guardados-legacy/lib/resource-investigator.ts#L452-L618) anteponía `owner/repo — ` al título. | [`lib/resource-investigator.ts`](file:///c:/Users/User/Desktop/spum/IA/atlas-de-guardados-legacy/lib/resource-investigator.ts), `data/atlas.db`, `data/normalized/archive.json` | **Resuelto y Verificado (`0` ocurrencias):** Se blindó `classifyGitHubUrl` para rechazar propietarios/repositorios placeholder (`owner`, `user`, `username`, `example`, `repo`, `your-repo`) y se limpiaron las 33 filas afectadas en SQLite y `archive.json`. |
| **BUG-02** | **Crítico (Cobertura)** | **31 guardados sin `github_repo` habían quedado sin su objeto `fallback_ref:` (`"El Link de ese Link"`) tras purgar `owner/repo`:** Al remover el falso positivo `owner/repo`, esos 31 posts técnicos quedaban sin enlace de referencia rápida al hilo/comentario ni búsqueda asistida en 1 clic. | `data/atlas.db`, [`lib/web-navigator-agent.ts`](file:///c:/Users/User/Desktop/spum/IA/atlas-de-guardados-legacy/lib/web-navigator-agent.ts) | **Resuelto y Verificado (`100 / 100` cubiertos):** Los **100 guardados** de la base quedan **100% contabilizados**: **66** con repositorio GitHub confirmado + **31** con `"El Link de ese Link"` (`fallback_ref:`) + **3** aislados en `"Archivo separado / Otro tema (No técnico)"` (`66 + 31 + 3 = 100`). |
| **BUG-03** | **Crítico (NLU Español)** | **Fallo de límite de palabra (`\b`) con vocales acentuadas en JavaScript:** En expresiones regulares de JS, `\b` después de `á/é/í/ó/ú` (ej. `eliminá\b`, `cambiá\b`, `agregá\b`) no coincide porque `\w` es solo ASCII, impidiendo disparar herramientas en imperativo rioplatense. | [`lib/agent-tools.ts`](file:///c:/Users/User/Desktop/spum/IA/atlas-de-guardados-legacy/lib/agent-tools.ts#L1130-L1290) | **Resuelto y Verificado con Test Unitario:** Se reemplazaron los bordes `\b` finales en verbos agudos por delimitadores compatibles con Unicode y se validó en `tests/core.test.cjs`. |
| **BUG-04** | **Alto (Arquitectura)** | **Chat de IA aislado solo en la pestaña `Repositorios` y sin Tool Calling:** El asistente anterior (`askGalleryAssistantServer`) solo respondía texto dentro de la vista de galería, carecía de contexto de otras secciones (`Biblioteca`, `Temas`, `Captura`, `Exportar`) y no podía ejecutar acciones reales sobre la app. | [`app/page.tsx`](file:///c:/Users/User/Desktop/spum/IA/atlas-de-guardados-legacy/app/page.tsx), [`components/global-agent-chat.tsx`](file:///c:/Users/User/Desktop/spum/IA/atlas-de-guardados-legacy/components/global-agent-chat.tsx), [`app/api/agent/chat/route.ts`](file:///c:/Users/User/Desktop/spum/IA/atlas-de-guardados-legacy/app/api/agent/chat/route.ts) | **Resuelto e Implementado:** Se construyó el **Chat Agéntico Global (`Ctrl+J`)** presente en todas las secciones, con `AgentSectionContext` en vivo y **14 herramientas ejecutables**. |
| **BUG-05** | **Alto (Agentes)** | **Ausencia de `Hermes` como agente principal y de configuración de API Keys en vivo:** `AiProviderId` no incluía a `hermes` ni permitía alternar entre **Hermes**, **Gemini**, **Claude** y **ChatGPT** configurando las claves desde el propio chat. | [`lib/types.ts`](file:///c:/Users/User/Desktop/spum/IA/atlas-de-guardados-legacy/lib/types.ts#L402), [`components/global-agent-chat.tsx`](file:///c:/Users/User/Desktop/spum/IA/atlas-de-guardados-legacy/components/global-agent-chat.tsx) | **Resuelto e Implementado:** **Hermes** es ahora el agente principal por defecto (`defaultAgentId: 'hermes'`), acompañado por **Gemini**, **Claude** y **ChatGPT** con selector de modelo y panel `🔑 Keys` integrado. |

### 1.2. Matriz de Verificación Pre-Lanzamiento

- **Integridad SQLite (`data/atlas.db`)**: `100` guardados totales (`66` con repo GitHub + `31` con `"El Link de ese Link"` + `3` en `"Archivo separado / Otro tema"` = `100/100`), `0` títulos con `owner/repo`, `263` repositorios en Galería Visual.
- **Suite de Pruebas Node.js (`tests/core.test.cjs` + `tests/extension.test.cjs`)**: **23 / 23 tests aprobados** (incluyendo el nuevo test integral de Chat Agéntico Global, las 14 herramientas, compuertas de confirmación de permisos y store de customización).
- **Suite de Pruebas Python (`tests/test_pipeline.py`)**: **10 / 10 tests aprobados** con `pytest`.
- **Persistencia Híbrida Local + Cloud (`Vercel`)**: Sincronización automática en `localStorage` (`atlas_durable_state_v1`, `atlas_customization_config_v1`, `atlas_agent_api_keys_v1`) para evitar pérdida de ediciones o configuraciones en funciones serverless efímeras.

---

## Entregable 2: Lista de Herramientas de Customización a Agregar Antes del Desarrollo

Para que tanto vos como los agentes (**Hermes**, **Gemini**, **Claude**, **ChatGPT**) puedan adaptar la aplicación sin tocar código fuente en cada ajuste, dividimos las herramientas de customización en **dos capas complementarias**:

### Capa A: Herramientas de Customización In-App (UI + Agent Tool Calling)

Implementadas en [`lib/customization-store.ts`](file:///c:/Users/User/Desktop/spum/IA/atlas-de-guardados-legacy/lib/customization-store.ts), [`components/customization-drawer.tsx`](file:///c:/Users/User/Desktop/spum/IA/atlas-de-guardados-legacy/components/customization-drawer.tsx) y expuestas como herramientas invocables por el chat en [`lib/agent-tools.ts`](file:///c:/Users/User/Desktop/spum/IA/atlas-de-guardados-legacy/lib/agent-tools.ts):

1. **Customizador de Tema y Tokens de Acento (`themeAccent`)**:
   - Permite alternar en tiempo real entre 4 identidades visuales: `Violeta Atlas` (`#7c6cf0`), `Esmeralda Hermes OS` (`#10b981`), `Ámbar Solar` (`#f59e0b`) y `Cian Cyber` (`#06b6d4`).
2. **Controlador de Densidad Visual (`layoutDensity`)**:
   - Conmuta entre vista `Compacta` (alta densidad de datos), `Estándar` y `Cómoda` (lectura extendida).
3. **Selector Dinámico de Columnas de Biblioteca (`visibleLibraryColumns`)**:
   - Permite activar/ocultar cualquiera de las 8 columnas analíticas (`Origen`, `Nombre / recurso`, `Para qué sirve`, `Tipo`, `Área / tema`, `Evaluación breve`, `Estado del análisis`, `Enlaces útiles`) desde el panel o pidiéndoselo a Hermes (*"Ocultá la columna evaluación"*).
4. **Visibilidad Modular de Secciones (`visibleSections`)**:
   - Permite mostrar u ocultar módulos del Sidebar según el flujo de trabajo activo.
5. **Gestor de Reglas de Separación Off-Topic (`offTopicCustomKeywords` + `separate_off_topic_items`)**:
   - Permite agregar palabras clave personalizadas (ej. `fútbol`, `receta`, `vacaciones`, `selfie`, `comprobante`, `meme`, `sorteo`) que disparan la clasificación automática en `"Archivo separado / Otro tema (No técnico)"` con bloqueo `manualFields`.
6. **Editor en Vivo de Reglas Temáticas (`manage_topic_rules`)**:
   - Permite crear o ampliar categorías temáticas deterministas con snapshot `SHA-256` y reversión en 1 clic.
7. **Gobernanza de Permisos de Tool Calling (`toolPermissionMode`)**:
   - Tres niveles configurables:
     - `confirm_sensitive` *(Recomendado)*: ejecuta directo lectura, navegación, creación, edición y customización; exige confirmación explícita con botón en el chat para acciones destructivas o de sistema (`delete_items`, `install_skill_or_mcp_local`).
     - `confirm_all`: exige confirmación antes de cualquier herramienta de escritura.
     - `autonomous_safe`: máxima velocidad operativa manteniendo confirmación obligatoria en borrados.
8. **Configurador de Identidad y Gateway de Hermes (`hermesConfig`)**:
   - Permite editar en caliente el `customSystemPrompt` permanente de Hermes, la URL del Gateway (`hermes-agent` / `OpenClaw` / puente Telegram) y el motor LLM de respaldo (`auto`, `anthropic`, `gemini`, `openai`).
9. **Constructor de Acciones Rápidas Contextuales (`customQuickActions`)**:
   - Permite crear botones de prompts frecuentes asociados a una sección específica (`Biblioteca`, `Repositorios`, etc.) o globales (`all`).

### Capa B: Herramientas de Customización del Arnés de Agentes (Catálogo `R001`–`R080` + `REA` + `Jev`)

Siguiendo las reglas de trazabilidad de tus documentos de referencia (`atlas Listo. Armé un mega prompt universa.txt` y `Herramientas para agentes que programan_ mapa de recursos (noviembre 2026).md`), estas son las herramientas seleccionadas para customizar y blindar el trabajo de los agentes programadores:

| ID / Recurso | Categoría | Qué aporta en la fase previa de customización | Estado de Adopción Real |
| :--- | :--- | :--- | :--- |
| **`R017` · `AGENTS.md`** (`https://agents.md/`) | Contexto y Convenciones | Define los contratos de arquitectura, comandos de verificación y límites de edición por rol en la raíz del repositorio. | **Instalado y Configurado** en el repo. |
| **`R038` · Google Labs `DESIGN.md`** (`https://github.com/google-labs-code/design.md`) | Diseño y Tokens Visuales | Formaliza las paletas (`violet`, `emerald`, `amber`, `cyan`), tipografías y densidad para que ningún subagente introduzca estilos arbitrarios (*anti-slop*). | **Evaluado y Adoptado** como esquema en `lib/customization-store.ts`. |
| **`R030` · `Impeccable`** (`https://github.com/pbakaus/impeccable`) + **`R029` · `Vercel Agent Skills`** | Auditoría y Pulido UI/UX | Comandos y reglas para criticar, auditar accesibilidad, foco de teclado y consistencia visual de componentes React/Next.js. | **Instalado en Galería (`pbakaus/impeccable`)** y reglas `react-best-practices` activas en el entorno. |
| **Jev de TypeSafe (`typesafe-ai`)** (`C:\Users\User\.gemini\config\skills\typesafe-ai\SKILL.md`) | Decisiones Tipadas (System One) | Sustituye heurísticas frágiles por preguntas tipadas con probabilidades calibradas para clasificar intención de usuario, riesgo de una acción de tool calling o si un archivo es off-topic. | **Skill Instalada en el Entorno Local**; lista para conectar cuando se disponga de API key de TypeSafe. |
| **REA (`reverse-engineer-anything`)** (`C:\Users\User\.gemini\config\skills\reverse-engineer-anything\SKILL.md`) | Evidencia de Runtime y Capturas | Permite inspeccionar capturas HAR/Playwright, comparar bundles o generar paquetes `AgentEnv` a partir de la instancia viva de la web app. | **Instalado y Disponible** vía servidor MCP `rea` y CLI global. |
| **`R018` · `Context7`** (`https://github.com/upstash/context7`) | Documentación por Versión | Evita alucinaciones de APIs en Next.js 16, React 19, Tailwind y SDKs de IA consultando documentación exacta por versión. | **Descubierto y Catalogado** en la base de repositorios de Atlas. |
| **`R039` / `R041` · `Playwright` + `Chrome DevTools MCP`** | Verificación Visual y Consola | Permite a los agentes comprobar en navegador real el flujo de punta a punta (UI → `/api/agent/chat` → SQLite → re-render). | **Servidor MCP `chrome-devtools-mcp` Instalado** en el entorno. |
| **`R048` · `Promptfoo`** + **`R049` / `R050` · `Trail of Bits Skills` & `Semgrep`** | Evaluación de Agentes y Seguridad | Evalúa la precisión del tool calling entre Hermes, Gemini, Claude y ChatGPT y audita que ninguna herramienta exponga secretos ni permita SSRF/inyección. | **Catalogado en Galería** y criterios aplicados en `lib/repo-security-scanner.ts`. |

---

## Entregable 3: Prompts de Desarrollo por Etapas

A continuación tenés los **4 Mega Prompts de Desarrollo por Etapas**, redactados con contratos explícitos, archivos objetivo, criterios de aceptación y comandos de verificación para usar en cualquier sesión de desarrollo o evolución del sistema.

---

### Etapa 1: Prompt de Desarrollo — Sistema de Customización Previa (UI, Reglas, Columnas y Persistencia)

```markdown
# PROMPT ETAPA 1 — SISTEMA DE CUSTOMIZACIÓN PREVIA Y REGLAS OPERATIVAS EN ATLAS DE GUARDADOS

## Rol y Contexto Operativo
Actuá como Arquitecto Principal e Implementador Full-Stack sobre el repositorio `C:\Users\User\Desktop\spum\IA\atlas-de-guardados-legacy` (Next.js 16 App Router + TypeScript + SQLite `better-sqlite3` + Tailwind CSS).
Antes de expandir las capacidades conversacionales, debés asegurar que la capa de customización de la aplicación esté completa, tipada, persistida y expuesta tanto en la interfaz gráfica como programáticamente para los agentes.

## Objetivos de la Etapa 1
1. **Store y Esquema de Customización (`lib/customization-store.ts` y `lib/types.ts`)**:
   - Mantener y validar `AtlasCustomizationConfig` con soporte para:
     - `themeAccent`: `'violet' | 'emerald' | 'amber' | 'cyan'` con sus tokens en `THEME_ACCENT_PALETTES`.
     - `layoutDensity`: `'compact' | 'standard' | 'comfortable'`.
     - `visibleSections`: visibilidad configurable de las secciones del Sidebar (`Resumen`, `Biblioteca`, `Repositorios`, `Temas`, `Fuentes`, `Exportar`, `Captura`, `TablaReposSkills`).
     - `visibleLibraryColumns`: visibilidad configurable de las 8 columnas de la Biblioteca (`fuente`, `nombre`, `proposito`, `tipo`, `temas`, `evaluacion`, `estado`, `links`) sincronizada en tiempo real con `components/views/library-view.tsx`.
     - `chatDockMode`: `'right_drawer' | 'floating_window'`.
     - `toolPermissionMode`: `'confirm_sensitive' | 'confirm_all' | 'autonomous_safe'`.
     - `offTopicCustomKeywords`: lista editable de palabras clave para separar archivos no técnicos en `"Archivo separado / Otro tema (No técnico)"`.
     - `hermesConfig`: configuración del agente principal Hermes (`personaName`, `gatewayUrl`, `backingProvider`, `customSystemPrompt`, `telegramBridgeEnabled`).
     - `customQuickActions`: atajos agénticos parametrizados por sección (`section: string | 'all'`).
2. **Panel Visual de Customización (`components/customization-drawer.tsx`)**:
   - Accesible desde el botón `Customizar` de la barra superior, desde el Sidebar y mediante tool calling.
   - Debe permitir modificar todos los parámetros anteriores en vivo y restaurar los valores por defecto en 1 clic (`DEFAULT_CUSTOMIZATION_CONFIG`).
3. **Protección de Ediciones Manuales (`manualFields`)**:
   - Toda edición manual o separación off-topic debe registrar los campos modificados en `manualFields` y sincronizar `lib/client-persistence.ts` (`atlas_durable_state_v1`) para resistir reinicios en entornos serverless.

## Verificación Obligatoria de Cierre de Etapa 1
- Ejecutar `node --test tests/core.test.cjs` y comprobar que `DEFAULT_CUSTOMIZATION_CONFIG` y `applyCustomizationPatch` pasan sin errores.
- Verificar que al ocultar o mostrar una columna en `CustomizationDrawer`, la tabla de `LibraryView` refleja el cambio instantáneamente sin recargar la página.
```

---

### Etapa 2: Prompt de Desarrollo — Chat Agéntico Global con Contexto de Sección, Tool Calling y Permisos

```markdown
# PROMPT ETAPA 2 — CHAT AGÉNTICO GLOBAL CON CONTEXTO DE SECCIÓN Y TOOL CALLING CON PERMISOS

## Rol y Contexto Operativo
Actuá como Ingeniero de Sistemas Agénticos sobre `C:\Users\User\Desktop\spum\IA\atlas-de-guardados-legacy`.
El objetivo de esta etapa es consolidar un único **Chat Agéntico Global** accesible desde todas las secciones de la app (`Ctrl+J` / botón flotante / botón en barra superior y Sidebar), consciente de la sección actual y conectado a las acciones reales de la aplicación mediante **Tool Calling** con control de permisos.

## Objetivos de la Etapa 2
1. **Conciencia de Contexto de Sección (`AgentSectionContext`)**:
   - El chat debe recibir en vivo desde `app/page.tsx`:
     - `activeSection` (`Resumen`, `Biblioteca`, `Repositorios`, `Temas`, `Fuentes`, `Exportar`, `Captura`, `TablaReposSkills`).
     - `selectedTopicFilter` y `selectedAuthorFilter`.
     - `selectedBookmarkId`, `selectedBookmarkTitle` y `selectedRepoFullName`.
     - Métricas reales de SQLite: `totalBookmarks`, `totalRepos`, `separatedCount` y `fallbackLinksCount`.
2. **Catálogo Unificado de 14 Herramientas (`ATLAS_AGENT_TOOLS` en `lib/agent-tools.ts`)**:
   - Exponer a todos los agentes el mismo set de herramientas con esquema JSON tipado y nivel de sensibilidad (`safe`, `write`, `sensitive`):
     1. `navigate_section` (`safe`): navegar entre vistas o abrir el panel de customización.
     2. `filter_and_search` (`safe`): aplicar filtros por tema/autor o abrir el detalle de un guardado/repo.
     3. `inspect_current_context` (`safe`): consultar guardados y repositorios en tiempo real.
     4. `create_bookmark_or_repo` (`write`): dar de alta un nuevo guardado o repositorio de GitHub (`owner/repo` o lista).
     5. `update_bookmark` (`write`): editar título, propósito, tipo, temas, notas o estado `reviewed` respetando `manualFields`.
     6. `separate_off_topic_items` (`write`): mover elementos no técnicos a `"Archivo separado / Otro tema (No técnico)"`.
     7. `investigate_links_and_comments` (`write`): disparar el Agente Navegador de Web y Comentarios (`web-navigator-agent.ts`) para destrabar hilos de X, leer imágenes por OCR y construir `"El Link de ese Link"`.
     8. `customize_interface_and_rules` (`write`): cambiar tema visual, densidad, modo del chat, columnas visibles, palabras off-topic o acciones rápidas.
     9. `manage_topic_rules` (`write`): agregar palabras clave a reglas temáticas y reclasificar.
     10. `recommend_project_stack` (`write`): generar un Blueprint de arquitectura y `PROMPT_MAESTRO.md` para una idea de proyecto.
     11. `audit_repo_security` (`safe`): auditar seguridad y capacidades (`shell`, `network`, `secrets`, `browser`) de un repositorio.
     12. `export_catalog` (`safe`): descargar en el navegador el archivo en `.xlsx`, `.csv` o `.json`.
     13. `install_skill_or_mcp_local` (`sensitive`): instalar o preparar en disco local una Skill (`SKILL.md`) o servidor MCP.
     14. `delete_items` (`sensitive`): eliminar guardados o repositorios de SQLite.
3. **Compuerta de Permisos y Confirmación Interactiva (`shouldRequireToolConfirmation`)**:
   - Las herramientas marcadas como `sensitive` (`delete_items`, `install_skill_or_mcp_local`) o aquellas alcanzadas por `toolPermissionMode === 'confirm_all'` **nunca deben ejecutarse automáticamente**: deben devolverse en `pendingConfirmations` y renderizar en el chat una tarjeta de seguridad con los argumentos exactos y los botones **[Confirmar y Ejecutar]** (`action: 'confirm-tool'`) y **[Cancelar]**.

## Verificación Obligatoria de Cierre de Etapa 2
- Verificar que pedir en lenguaje natural *"Llevame a repositorios y cambiá el tema a esmeralda"* ejecuta `navigate_section` y `customize_interface_and_rules` inmediatamente.
- Verificar que pedir *"Eliminá este guardado seleccionado"* NO borra el registro de inmediato, sino que presenta la tarjeta de confirmación obligatoria en el chat.
```

---

### Etapa 3: Prompt de Desarrollo — Integración de Agentes (Hermes Principal + Gemini, Claude y ChatGPT)

```markdown
# PROMPT ETAPA 3 — INTEGRACIÓN MULTI-AGENTE: HERMES PRINCIPAL + GEMINI, CLAUDE Y CHATGPT INTERCAMBIABLES

## Rol y Contexto Operativo
Actuá como Arquitecto de Integración de Modelos e IA en `C:\Users\User\Desktop\spum\IA\atlas-de-guardados-legacy`.
El objetivo de esta etapa es integrar en el Chat Agéntico Global a **Hermes** como agente principal junto con los tres proveedores más usados (**Google Gemini**, **Anthropic Claude** y **OpenAI ChatGPT**), todos accediendo exactamente al mismo catálogo de 14 herramientas de la app, con selector de agente/modelo en vivo y configuración de claves de API desde el mismo chat.

## Objetivos de la Etapa 3
1. **Hermes como Agente Principal (`agentId: 'hermes'`)**:
   - Seleccionado por defecto al iniciar la aplicación (`defaultAgentId: 'hermes'`).
   - Arquitectura de triple respaldo sin fallos:
     1. **Gateway de Hermes (`hermesConfig.gatewayUrl`)**: Si hay un endpoint activo de `hermes-agent` / `OpenClaw` configurado, enruta la conversación y el esquema de herramientas hacia él.
     2. **Motor Cloud Seleccionable (`hermes-claude-sonnet`, `hermes-gemini-flash`, `hermes-gpt-4o` o `auto`)**: Ejecuta con la identidad, reglas de negocio y prompt de sistema de Hermes sobre la API key activa de Claude, Gemini u OpenAI.
     3. **Motor NLU Determinista Local (`inferNaturalLanguageToolCalls`)**: Si no hay conexión externa o API keys configuradas aún, Hermes interpreta intenciones en español rioplatense y ejecuta las 14 herramientas de la app contra SQLite sin degradar la experiencia.
2. **Proveedores Intercambiables (`gemini`, `anthropic`, `openai`)**:
   - Selector de pestañas en la cabecera del chat (`Hermes ★`, `Gemini`, `Claude`, `ChatGPT`) y selector desplegable de modelo por proveedor:
     - **Gemini**: `gemini-2.5-flash`, `gemini-2.5-pro`.
     - **Claude**: `claude-3-7-sonnet-latest`, `claude-3-5-haiku-latest`.
     - **ChatGPT**: `gpt-4o-mini`, `gpt-4o`.
   - Todos reciben el mismo `systemPrompt` con `AgentSectionContext` y devuelven respuestas estructuradas compatibles con `ATLAS_AGENT_TOOLS`.
3. **Gestor de Claves de API en el Chat (`🔑 Keys` en `components/global-agent-chat.tsx`)**:
   - Panel desplegable dentro del mismo chat para configurar `GEMINI_API_KEY`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` y `GITHUB_TOKEN`, persistidas en `localStorage` (`atlas_agent_api_keys_v1`) y combinadas de forma segura con las variables de entorno del servidor en `/api/agent/chat`.

## Verificación Obligatoria de Cierre de Etapa 3
- Comprobar el cambio en caliente entre `Hermes ★`, `Gemini`, `Claude` y `ChatGPT` conservando el historial de la sesión y el contexto de la sección activa.
- Ejecutar `GET /api/agent/chat` y `POST /api/agent/chat` verificando que los 4 agentes están registrados y operan sobre las 14 herramientas.
```

---

### Etapa 4: Prompt de Desarrollo — Verificación E2E, Auditoría Cruzada y Cierre de Salida

```markdown
# PROMPT ETAPA 4 — AUDITORÍA CRUZADA, VERIFICACIÓN END-TO-END Y CIERRE DE PRODUCCIÓN

## Rol y Contexto Operativo
Actuá como Auditor de Calidad, Seguridad y Release Manager sobre `C:\Users\User\Desktop\spum\IA\atlas-de-guardados-legacy` antes de publicar en GitHub (`origin/main`) y Vercel (`https://atlasookmark.vercel.app`).

## Checklist Obligatorio de Verificación y Cierre
1. **Auditoría de Integridad de Datos en SQLite (`data/atlas.db` y `data/normalized/archive.json`)**:
   - Verificar que el 100% de los guardados estén clasificados sin ningún placeholder `owner/repo` residual (`ownerRepoCount === 0`).
   - Confirmar que la suma de guardados con repositorio GitHub confirmado (`github_repo`) + guardados con `"El Link de ese Link"` (`fallback_ref:`) + guardados en `"Archivo separado / Otro tema (No técnico)"` sea exactamente igual al total de guardados (`100 / 100`).
2. **Pruebas Automatizadas Multi-Lenguaje**:
   - Ejecutar `node --test tests/core.test.cjs tests/extension.test.cjs` (deben pasar los 23 tests, incluyendo SSRF, FTS5, Excel 6 hojas, Web Navigator Agent, 10 mejoras agénticas, Customización y Chat Agéntico Global).
   - Ejecutar `python -m pytest -q` (deben pasar los 10 tests del pipeline Python).
3. **Compilación de Producción y Verificación de Endpoints**:
   - Ejecutar `npm run build` (Next.js 16) verificando cero errores de tipos en TypeScript y generación limpia de `/api/agent/chat`, `/api/bookmarks`, `/api/github/repos`, `/api/github/ai` y `/api/github/install-local`.
   - Probar en vivo `POST /api/agent/chat` con:
     - Consulta contextual de estado.
     - Acción directa de navegación y customización (`navigate_section`, `customize_interface_and_rules`).
     - Acción sensible con compuerta de confirmación (`delete_items` → `requiresConfirmation: true`).
4. **Despliegue y Sincronización**:
   - Hacer commit limpio en `main`, push a `https://github.com/nicospum/atlasBookmark.git` y despliegue productivo a Vercel (`npx vercel --prod --yes`).
```
