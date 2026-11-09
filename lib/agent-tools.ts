import type {
  AgentSectionContext,
  AgentToolCallRequest,
  AgentToolExecutionResult,
  AgentToolSensitivity,
  AtlasCustomizationConfig,
  BookmarkItem,
  LibraryColumnId,
  ResourceType,
  ThemeAccentId,
  ToolPermissionMode
} from './types'
import {
  getAllBookmarks,
  getBookmarkById,
  insertBookmark,
  updateBookmark,
  updateBookmarksBatch,
  deleteBookmark,
  deleteBookmarksBatch,
  getAllGalleryRepositories,
  getGalleryRepositoryByFullName,
  saveGalleryRepoWithBookmark,
  deleteGalleryRepository,
  reclassifyAllBookmarks,
  huntMissingGitHubReposBatch,
  importRepositoryListWithDeduplication,
  upsertProjectBlueprint
} from './bookmarks-repository'
import {
  parseGitHubUrl,
  fetchGitHubRepositoryData,
  buildDeterministicSpanishExplanations,
  numericIdFromFullName,
  extractInstallAndSetupSnippets
} from './github-gallery'
import { synthesizeBookmarkFields } from './resource-investigator'
import { analyzeContent, getTopicRulesMeta, saveTopicRulesWithSnapshot } from './ai-analyzer'
import { recommendStackForProjectIdea } from './stack-recommender'
import { auditRepositorySecurityAndHealth } from './repo-security-scanner'
import { evaluateBookmarkScopeAndOffTopic } from './web-navigator-agent'
import { DATA_DIR } from './db'
import fs from 'fs'
import path from 'path'

export interface AgentToolSpec {
  name: string
  category:
    | 'navigation'
    | 'bookmarks'
    | 'repositories'
    | 'customization'
    | 'investigation'
    | 'export'
    | 'security'
  sensitivity: AgentToolSensitivity
  descriptionEs: string
  parametersSchema: Record<string, any>
}

export const ATLAS_AGENT_TOOLS: AgentToolSpec[] = [
  {
    name: 'navigate_section',
    category: 'navigation',
    sensitivity: 'safe',
    descriptionEs:
      'Navega a cualquier sección de la aplicación (Resumen, Biblioteca, Repositorios, Temas, Fuentes, Exportar, Captura, TablaReposSkills) o abre el panel de Customización.',
    parametersSchema: {
      type: 'object',
      properties: {
        section: {
          type: 'string',
          enum: [
            'Resumen',
            'Biblioteca',
            'Repositorios',
            'Temas',
            'Fuentes',
            'Exportar',
            'Captura',
            'TablaReposSkills',
            'Customizacion'
          ]
        }
      },
      required: ['section']
    }
  },
  {
    name: 'filter_and_search',
    category: 'navigation',
    sensitivity: 'safe',
    descriptionEs:
      'Filtra la Biblioteca por tema, autor (@handle) o abre el detalle de un guardado o repositorio específico.',
    parametersSchema: {
      type: 'object',
      properties: {
        topic: { type: 'string', description: 'Tema por el cual filtrar en Biblioteca' },
        author: { type: 'string', description: 'Handle o nombre de autor para filtrar' },
        openRepoFullName: { type: 'string', description: 'owner/repo para abrir en la Galería Visual' },
        openBookmarkId: { type: 'string', description: 'ID del guardado para abrir en el panel de detalle' },
        clearFilters: { type: 'boolean', description: 'Limpiar filtros activos' }
      }
    }
  },
  {
    name: 'inspect_current_context',
    category: 'navigation',
    sensitivity: 'safe',
    descriptionEs:
      'Consulta en tiempo real estadísticas, guardados o repositorios filtrados por búsqueda, tema o estado.',
    parametersSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Texto o término para buscar en guardados y repositorios' },
        limit: { type: 'number', description: 'Cantidad máxima de resultados a devolver (por defecto 8)' }
      }
    }
  },
  {
    name: 'create_bookmark_or_repo',
    category: 'repositories',
    sensitivity: 'write',
    descriptionEs:
      'Crea un nuevo guardado (desde URL o texto) o agrega uno o varios repositorios de GitHub (owner/repo o URL) a la galería y tabla.',
    parametersSchema: {
      type: 'object',
      properties: {
        repoOrUrl: {
          type: 'string',
          description: 'URL de GitHub (owner/repo), URL de post (X/IG/Web) o lista de repositorios'
        },
        title: { type: 'string', description: 'Título opcional para el guardado' },
        notes: { type: 'string', description: 'Notas personales o contexto del recurso' },
        topics: {
          type: 'array',
          items: { type: 'string' },
          description: 'Temas opcionales a asignar'
        }
      },
      required: ['repoOrUrl']
    }
  },
  {
    name: 'update_bookmark',
    category: 'bookmarks',
    sensitivity: 'write',
    descriptionEs:
      'Edita un guardado existente (título, propósito, tipo de recurso, temas, notas, estado revisado) protegiendo los campos con candado manualFields.',
    parametersSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'ID del guardado (o "selected" para usar el abierto actualmente)' },
        title: { type: 'string' },
        purpose: { type: 'string' },
        resourceType: { type: 'string' },
        topics: { type: 'array', items: { type: 'string' } },
        notes: { type: 'string' },
        reviewed: { type: 'boolean' }
      },
      required: ['id']
    }
  },
  {
    name: 'separate_off_topic_items',
    category: 'bookmarks',
    sensitivity: 'write',
    descriptionEs:
      'Separa archivos que no tienen nada que ver con IA/programación (fotos personales, deportes, cocina, memes, juegos casuales) en "Archivo separado / Otro tema (No técnico)" con candado manualFields.',
    parametersSchema: {
      type: 'object',
      properties: {
        bookmarkIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'IDs específicos a separar (si se omite, audita todo el archivo automáticamente)'
        },
        categoryLabel: {
          type: 'string',
          description: 'Categoría del archivo separado (ej. Fotos / Personal, Deportes, Juegos / Ocio)'
        }
      }
    }
  },
  {
    name: 'investigate_links_and_comments',
    category: 'investigation',
    sensitivity: 'write',
    descriptionEs:
      'Ejecuta el Agente Navegador de Web y Comentarios sobre un guardado o lote para destrabar hilos de X, leer imágenes por OCR, seguir links intermedios y generar "El Link de ese Link".',
    parametersSchema: {
      type: 'object',
      properties: {
        bookmarkId: { type: 'string', description: 'ID específico o vacío para escanear lote' },
        limit: { type: 'number', description: 'Cantidad máxima de guardados a investigar en lote (defecto 20)' }
      }
    }
  },
  {
    name: 'customize_interface_and_rules',
    category: 'customization',
    sensitivity: 'write',
    descriptionEs:
      'Customiza en vivo la interfaz, layout, columnas de la tabla, permisos de herramientas, prompt de Hermes o palabras clave off-topic.',
    parametersSchema: {
      type: 'object',
      properties: {
        themeAccent: { type: 'string', enum: ['violet', 'emerald', 'amber', 'cyan'] },
        layoutDensity: { type: 'string', enum: ['compact', 'standard', 'comfortable'] },
        chatDockMode: { type: 'string', enum: ['right_drawer', 'floating_window'] },
        toolPermissionMode: {
          type: 'string',
          enum: ['confirm_sensitive', 'confirm_all', 'autonomous_safe']
        },
        hideColumn: {
          type: 'string',
          enum: ['fuente', 'nombre', 'proposito', 'tipo', 'temas', 'evaluacion', 'estado', 'links']
        },
        showColumn: {
          type: 'string',
          enum: ['fuente', 'nombre', 'proposito', 'tipo', 'temas', 'evaluacion', 'estado', 'links']
        },
        resetColumns: { type: 'boolean' },
        addOffTopicKeyword: { type: 'string' },
        hermesSystemPrompt: { type: 'string' },
        addQuickActionLabel: { type: 'string' },
        addQuickActionPrompt: { type: 'string' }
      }
    }
  },
  {
    name: 'manage_topic_rules',
    category: 'customization',
    sensitivity: 'write',
    descriptionEs:
      'Agrega un nuevo tema o palabras clave al motor determinista de clasificación temática y reclasifica los guardados.',
    parametersSchema: {
      type: 'object',
      properties: {
        topicName: { type: 'string', description: 'Nombre del tema (ej. Agentes, Voz, Shaders)' },
        keywordsToAdd: {
          type: 'array',
          items: { type: 'string' },
          description: 'Palabras clave a sumar a la regla del tema'
        },
        reclassifyNow: { type: 'boolean', description: 'Si es true, reclasifica el archivo tras guardar' }
      },
      required: ['topicName', 'keywordsToAdd']
    }
  },
  {
    name: 'recommend_project_stack',
    category: 'repositories',
    sensitivity: 'write',
    descriptionEs:
      'Diseña un stack técnico recomendado y genera un Blueprint + PROMPT_MAESTRO.md seleccionando los mejores repositorios y skills del catálogo para una idea de proyecto.',
    parametersSchema: {
      type: 'object',
      properties: {
        idea: { type: 'string', description: 'Descripción de la idea o proyecto a construir' },
        autoSaveBlueprint: { type: 'boolean', description: 'Guardar el Blueprint en la base de datos' }
      },
      required: ['idea']
    }
  },
  {
    name: 'audit_repo_security',
    category: 'security',
    sensitivity: 'safe',
    descriptionEs:
      'Ejecuta una auditoría estática de seguridad sobre un repositorio de GitHub (owner/repo) para detectar ejecución de shell, red, lectura de secretos y nivel de riesgo.',
    parametersSchema: {
      type: 'object',
      properties: {
        fullName: { type: 'string', description: 'Repositorio en formato owner/repo' }
      },
      required: ['fullName']
    }
  },
  {
    name: 'export_catalog',
    category: 'export',
    sensitivity: 'safe',
    descriptionEs:
      'Dispara la exportación y descarga del catálogo en formato Excel (.xlsx multi-hoja), CSV o JSON.',
    parametersSchema: {
      type: 'object',
      properties: {
        format: { type: 'string', enum: ['xlsx', 'csv', 'json'] }
      },
      required: ['format']
    }
  },
  {
    name: 'install_skill_or_mcp_local',
    category: 'security',
    sensitivity: 'sensitive',
    descriptionEs:
      'ACCIÓN SENSIBLE: Clona o instala localmente una Skill (.agents/skills), servidor MCP (mcp_servers.json) o repositorio de GitHub.',
    parametersSchema: {
      type: 'object',
      properties: {
        fullName: { type: 'string', description: 'Repositorio en formato owner/repo' },
        mode: { type: 'string', enum: ['skill_clone', 'mcp_config', 'repo_clone'] }
      },
      required: ['fullName']
    }
  },
  {
    name: 'delete_items',
    category: 'bookmarks',
    sensitivity: 'sensitive',
    descriptionEs:
      'ACCIÓN SENSIBLE / DESTRUCTIVA: Elimina uno o varios guardados o un repositorio de la base de datos. Requiere confirmación explícita del usuario.',
    parametersSchema: {
      type: 'object',
      properties: {
        bookmarkIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'IDs de guardados a eliminar'
        },
        repoFullName: {
          type: 'string',
          description: 'Nombre completo owner/repo si se desea eliminar un repositorio de la galería'
        }
      }
    }
  }
]

export function getToolSpec(toolName: string): AgentToolSpec | undefined {
  return ATLAS_AGENT_TOOLS.find(t => t.name === toolName)
}

export function shouldRequireToolConfirmation(
  toolName: string,
  permissionMode: ToolPermissionMode = 'confirm_sensitive'
): boolean {
  const spec = getToolSpec(toolName)
  const sensitivity: AgentToolSensitivity = spec?.sensitivity || 'write'

  if (sensitivity === 'safe') return false
  if (sensitivity === 'sensitive') return true // Sensitive/destructive tools ALWAYS require explicit confirmation
  if (permissionMode === 'confirm_all') return true
  return false
}

export async function executeAgentToolServer(
  toolCall: AgentToolCallRequest,
  context: {
    sectionContext: AgentSectionContext
    currentCustomization?: AtlasCustomizationConfig
    githubToken?: string | null
  }
): Promise<AgentToolExecutionResult> {
  const { toolName, args, id: toolCallId } = toolCall
  const { sectionContext, currentCustomization, githubToken } = context

  try {
    // 1. navigate_section
    if (toolName === 'navigate_section') {
      const target = String(args.section || 'Resumen')
      if (target === 'Customizacion') {
        return {
          toolCallId,
          toolName,
          success: true,
          summaryEs: 'Abriendo el panel de Customización de la aplicación.',
          clientEffects: {
            openCustomizationDrawer: true
          }
        }
      }
      return {
        toolCallId,
        toolName,
        success: true,
        summaryEs: `Navegando a la sección **${target}**.`,
        clientEffects: {
          navigateTo: target
        }
      }
    }

    // 2. filter_and_search
    if (toolName === 'filter_and_search') {
      if (args.openRepoFullName) {
        return {
          toolCallId,
          toolName,
          success: true,
          summaryEs: `Abriendo el repositorio **${args.openRepoFullName}** en la Galería Visual.`,
          clientEffects: {
            navigateTo: 'Repositorios',
            openRepoFullName: String(args.openRepoFullName)
          }
        }
      }
      if (args.openBookmarkId) {
        return {
          toolCallId,
          toolName,
          success: true,
          summaryEs: `Abriendo el panel de detalle del guardado \`${args.openBookmarkId}\`.`,
          clientEffects: {
            openBookmarkId: String(args.openBookmarkId)
          }
        }
      }
      if (args.clearFilters) {
        return {
          toolCallId,
          toolName,
          success: true,
          summaryEs: 'Filtros de tema y autor limpiados en la Biblioteca.',
          clientEffects: {
            navigateTo: 'Biblioteca',
            filterTopic: null,
            filterAuthor: null
          }
        }
      }
      const topic = args.topic ? String(args.topic) : undefined
      const author = args.author ? String(args.author) : undefined
      return {
        toolCallId,
        toolName,
        success: true,
        summaryEs: `Filtrando Biblioteca${topic ? ` por tema **${topic}**` : ''}${author ? ` por autor **${author}**` : ''}.`,
        clientEffects: {
          navigateTo: 'Biblioteca',
          ...(topic !== undefined ? { filterTopic: topic } : {}),
          ...(author !== undefined ? { filterAuthor: author } : {})
        }
      }
    }

    // 3. inspect_current_context
    if (toolName === 'inspect_current_context') {
      const q = String(args.query || '').trim()
      const limit = Math.min(20, Math.max(3, Number(args.limit) || 8))
      const bookmarks = getAllBookmarks(q ? { search: q, limit } : { limit })
      const allRepos = getAllGalleryRepositories()
      const matchingRepos = q
        ? allRepos
            .filter(r =>
              `${r.fullName} ${r.shortExplanationEs || ''} ${r.description} ${(r.topics || []).join(' ')}`
                .toLowerCase()
                .includes(q.toLowerCase())
            )
            .slice(0, limit)
        : allRepos.slice(0, 6)

      return {
        toolCallId,
        toolName,
        success: true,
        summaryEs: q
          ? `Consulta sobre **"${q}"**: ${bookmarks.length} guardados y ${matchingRepos.length} repositorios encontrados.`
          : `Contexto actual (${sectionContext.activeSection}): ${sectionContext.totalBookmarks} guardados y ${allRepos.length} repositorios en catálogo.`,
        data: {
          section: sectionContext.activeSection,
          bookmarks: bookmarks.map(b => ({
            id: b.id,
            title: b.title,
            author: b.authorHandle,
            resourceType: b.resourceType,
            topics: b.topics,
            url: b.sourceUrl
          })),
          repositories: matchingRepos.map(r => ({
            fullName: r.fullName,
            stars: r.stars,
            resourceType: r.resourceType,
            shortExplanationEs: r.shortExplanationEs || r.description,
            url: r.url
          }))
        }
      }
    }

    // 4. create_bookmark_or_repo
    if (toolName === 'create_bookmark_or_repo') {
      const rawInput = String(args.repoOrUrl || '').trim()
      if (!rawInput) {
        return {
          toolCallId,
          toolName,
          success: false,
          summaryEs: 'Falta indicar la URL o el nombre del repositorio (owner/repo).'
        }
      }

      const parsedGh = parseGitHubUrl(rawInput)
      if (parsedGh) {
        let repo = await fetchGitHubRepositoryData(parsedGh.owner, parsedGh.repo, githubToken).catch(
          () => null
        )
        if (!repo) {
          const fullName = `${parsedGh.owner}/${parsedGh.repo}`
          const now = new Date().toISOString()
          const baseRepo = {
            id: numericIdFromFullName(fullName),
            owner: parsedGh.owner,
            name: parsedGh.repo,
            fullName,
            url: `https://github.com/${fullName}`,
            avatarUrl: `https://github.com/${parsedGh.owner}.png?size=128`,
            description: args.notes || args.title || `Repositorio de GitHub ${fullName}`,
            explanation: args.notes || args.title || `Repositorio de GitHub ${fullName}`,
            imageUrl: `https://opengraph.githubassets.com/1/${parsedGh.owner}/${parsedGh.repo}`,
            imageSource: 'opengraph' as const,
            stars: 0,
            forks: 0,
            openIssues: 0,
            primaryLanguage: null,
            languages: [],
            topics: Array.isArray(args.topics) ? args.topics : [],
            license: null,
            createdAt: now,
            updatedAt: now,
            pushedAt: now,
            latestRelease: null,
            addedAt: now,
            homepage: null,
            defaultBranch: 'main',
            notes: args.notes || ''
          }
          const synth = buildDeterministicSpanishExplanations(baseRepo)
          repo = {
            ...baseRepo,
            shortExplanationEs: synth.shortExplanationEs,
            longExplanationEs: synth.longExplanationEs,
            explanation: synth.shortExplanationEs,
            resourceType: synth.resourceType
          }
        } else if (args.notes) {
          repo.notes = args.notes
        }

        const saved = saveGalleryRepoWithBookmark(repo)
        return {
          toolCallId,
          toolName,
          success: true,
          summaryEs: `Repositorio **${saved.fullName}** (${saved.resourceType || 'Repo'}) agregado a la Galería Visual y a la Biblioteca.`,
          clientEffects: {
            refreshData: true,
            openRepoFullName: saved.fullName
          },
          data: { repository: saved }
        }
      }

      // Check if it's a multi-repo list
      if (rawInput.includes('github.com/') && rawInput.split(/\s+/).length > 2) {
        const listRes = await importRepositoryListWithDeduplication({
          text: rawInput,
          notes: args.notes,
          token: githubToken
        })
        if (listRes.added > 0 || listRes.duplicatesSkipped > 0) {
          return {
            toolCallId,
            toolName,
            success: true,
            summaryEs: `Lista procesada: **${listRes.added} repositorios nuevos agregados** y ${listRes.duplicatesSkipped} duplicados omitidos.`,
            clientEffects: {
              refreshData: true
            },
            data: listRes
          }
        }
      }

      // Otherwise create a new BookmarkItem from URL or note
      const isUrl = /^https?:\/\//i.test(rawInput)
      const sourceUrl = isUrl ? rawInput : `https://atlas.local/note/${Date.now()}`
      const platform = /instagram\.com/i.test(sourceUrl)
        ? 'instagram'
        : /x\.com|twitter\.com/i.test(sourceUrl)
        ? 'x'
        : /whatsapp/i.test(sourceUrl)
        ? 'whatsapp'
        : 'x'
      const caption = args.notes || args.title || rawInput
      const analysis = analyzeContent(caption, [], { externalUrls: isUrl ? [sourceUrl] : [] })
      const finalTopics =
        Array.isArray(args.topics) && args.topics.length > 0 ? args.topics : analysis.topics
      const syn = synthesizeBookmarkFields({
        caption,
        authorName: 'Usuario / Agente',
        authorHandle: '@hermes_agent',
        platform,
        outgoingLinks: isUrl ? [sourceUrl] : [],
        topics: finalTopics,
        entities: analysis.entities
      })

      const newBm: BookmarkItem = {
        id: `agent:${Date.now()}`,
        platform,
        sourceUrl,
        authorName: 'Agregado por Agente',
        authorHandle: '@hermes_agent',
        publishedAt: new Date().toISOString(),
        savedAt: new Date().toISOString(),
        importedAt: new Date().toISOString(),
        caption,
        title: args.title || syn.title,
        purpose: syn.purpose,
        resourceType: syn.resourceType,
        evaluation: syn.evaluation,
        analysisState: 'completed',
        notes: args.notes || '',
        resources: syn.resources,
        manualFields: args.title ? ['title'] : [],
        topics: finalTopics,
        entities: analysis.entities,
        aiSummary: syn.purpose,
        language: 'Español',
        outgoingLinks: isUrl ? [sourceUrl] : [],
        mediaType: 'none',
        mediaUrls: [],
        reviewed: false,
        analysisMethod: 'manual',
        classificationStatus: 'manual',
        captureSource: 'agent_chat'
      }

      insertBookmark(newBm)
      return {
        toolCallId,
        toolName,
        success: true,
        summaryEs: `Guardado **"${newBm.title}"** creado en la Biblioteca (${newBm.resourceType}).`,
        clientEffects: {
          refreshData: true,
          openBookmarkId: newBm.id
        },
        data: { bookmark: newBm }
      }
    }

    // 5. update_bookmark
    if (toolName === 'update_bookmark') {
      const targetId =
        args.id === 'selected' && sectionContext.selectedBookmarkId
          ? sectionContext.selectedBookmarkId
          : String(args.id || '')

      if (!targetId) {
        return {
          toolCallId,
          toolName,
          success: false,
          summaryEs: 'No se especificó un ID de guardado ni hay uno abierto en el panel de detalle.'
        }
      }

      const updated = updateBookmark(
        targetId,
        {
          ...(args.title !== undefined ? { title: String(args.title) } : {}),
          ...(args.purpose !== undefined ? { purpose: String(args.purpose) } : {}),
          ...(args.resourceType !== undefined
            ? { resourceType: String(args.resourceType) as ResourceType }
            : {}),
          ...(Array.isArray(args.topics) ? { topics: args.topics.map(String) } : {}),
          ...(args.notes !== undefined ? { notes: String(args.notes) } : {}),
          ...(typeof args.reviewed === 'boolean' ? { reviewed: args.reviewed } : {})
        },
        true
      )

      if (!updated) {
        return {
          toolCallId,
          toolName,
          success: false,
          summaryEs: `No se encontró el guardado con ID \`${targetId}\`.`
        }
      }

      return {
        toolCallId,
        toolName,
        success: true,
        summaryEs: `Guardado **${updated.title || updated.id}** actualizado y protegido con candado \`manualFields\`.`,
        clientEffects: {
          refreshData: true
        },
        data: { bookmark: updated }
      }
    }

    // 6. separate_off_topic_items
    if (toolName === 'separate_off_topic_items') {
      const explicitIds: string[] = Array.isArray(args.bookmarkIds) ? args.bookmarkIds : []
      const catLabel = String(args.categoryLabel || 'Otros Temas / Recreativo o Personal')

      if (explicitIds.length > 0) {
        const count = updateBookmarksBatch(
          explicitIds,
          {
            resourceType: 'Archivo separado / Otro tema (No técnico)',
            topics: ['Archivos Separados / Otros Temas', catLabel],
            evaluation: `Archivo separado (${catLabel}): apartado por indicación del usuario en el chat agéntico.`
          },
          true
        )
        return {
          toolCallId,
          toolName,
          success: true,
          summaryEs: `Se apartaron **${count} guardados** como \`Archivo separado / Otro tema (No técnico)\` bajo la categoría **${catLabel}**.`,
          clientEffects: {
            refreshData: true
          }
        }
      }

      // Automatic audit across all bookmarks
      const all = getAllBookmarks()
      const newlySeparated: string[] = []
      const customKw = currentCustomization?.offTopicCustomKeywords || []

      for (const bm of all) {
        if (bm.resourceType === 'Archivo separado / Otro tema (No técnico)') continue
        const scope = evaluateBookmarkScopeAndOffTopic(bm)
        const textLower = `${bm.title || ''} ${bm.caption || ''}`.toLowerCase()
        const matchesCustomKw = customKw.some(kw => kw && textLower.includes(kw.toLowerCase()))
        const hasGh = (bm.resources || []).some(r => r.kind === 'github_repo')

        if (scope.isOffTopic || (matchesCustomKw && !hasGh)) {
          const cat = scope.categoryLabel || catLabel
          updateBookmark(
            bm.id,
            {
              resourceType: 'Archivo separado / Otro tema (No técnico)',
              topics: Array.from(new Set(['Archivos Separados / Otros Temas', cat])),
              evaluation: `Archivo separado (${cat}): ${scope.reasonEs || 'Detectado por regla de separación off-topic.'}`
            },
            true
          )
          newlySeparated.push(bm.title || bm.id)
        }
      }

      const totalAlreadySeparated = getAllBookmarks().filter(
        b => b.resourceType === 'Archivo separado / Otro tema (No técnico)'
      ).length

      return {
        toolCallId,
        toolName,
        success: true,
        summaryEs:
          newlySeparated.length > 0
            ? `Auditoría completada: se separaron **${newlySeparated.length} archivos nuevos** (${newlySeparated.join(', ')}). Total en Archivos Separados: **${totalAlreadySeparated}**.`
            : `Auditoría completada: no se encontraron nuevos intrusos no técnicos. Tenés **${totalAlreadySeparated} archivos separados** correctamente aislados.`,
        clientEffects: {
          refreshData: true
        }
      }
    }

    // 7. investigate_links_and_comments
    if (toolName === 'investigate_links_and_comments') {
      const bmId = args.bookmarkId ? String(args.bookmarkId) : undefined
      const limit = Math.min(40, Math.max(1, Number(args.limit) || 15))
      const huntRes = await huntMissingGitHubReposBatch({
        bookmarkIds: bmId ? [bmId] : undefined,
        limit,
        token: githubToken
      })

      const withFallback = huntRes.findings.filter(f => f.fallbackReference).length
      return {
        toolCallId,
        toolName,
        success: true,
        summaryEs: `Agente Navegador ejecutado sobre **${huntRes.scannedCount} guardados**: **${huntRes.discoveredReposCount} repositorios descubiertos** y **${withFallback} enlaces de referencia ("El Link de ese Link")** verificados.`,
        clientEffects: {
          refreshData: true
        },
        data: huntRes
      }
    }

    // 8. customize_interface_and_rules
    if (toolName === 'customize_interface_and_rules') {
      const base = currentCustomization
      const patch: Partial<AtlasCustomizationConfig> = {}
      const changesDesc: string[] = []

      if (args.themeAccent) {
        patch.themeAccent = args.themeAccent as ThemeAccentId
        changesDesc.push(`tema de color → **${args.themeAccent}**`)
      }
      if (args.layoutDensity) {
        patch.layoutDensity = args.layoutDensity
        changesDesc.push(`densidad visual → **${args.layoutDensity}**`)
      }
      if (args.chatDockMode) {
        patch.chatDockMode = args.chatDockMode
        changesDesc.push(`modo del chat → **${args.chatDockMode}**`)
      }
      if (args.toolPermissionMode) {
        patch.toolPermissionMode = args.toolPermissionMode as ToolPermissionMode
        changesDesc.push(`permisos de herramientas → **${args.toolPermissionMode}**`)
      }
      if (args.resetColumns) {
        patch.visibleLibraryColumns = [
          'fuente',
          'nombre',
          'proposito',
          'tipo',
          'temas',
          'evaluacion',
          'estado',
          'links'
        ]
        changesDesc.push('columnas de la Biblioteca restauradas (8/8)')
      } else if (args.hideColumn && base) {
        const col = args.hideColumn as LibraryColumnId
        patch.visibleLibraryColumns = base.visibleLibraryColumns.filter(c => c !== col)
        changesDesc.push(`columna ocultada → **${col}**`)
      } else if (args.showColumn && base) {
        const col = args.showColumn as LibraryColumnId
        patch.visibleLibraryColumns = Array.from(new Set([...base.visibleLibraryColumns, col]))
        changesDesc.push(`columna visible → **${col}**`)
      }
      if (args.addOffTopicKeyword && base) {
        const kw = String(args.addOffTopicKeyword).trim().toLowerCase()
        patch.offTopicCustomKeywords = Array.from(new Set([...base.offTopicCustomKeywords, kw]))
        changesDesc.push(`palabra clave off-topic agregada → **"${kw}"**`)
      }
      if (args.hermesSystemPrompt && base) {
        patch.hermesConfig = {
          ...base.hermesConfig,
          customSystemPrompt: String(args.hermesSystemPrompt)
        }
        changesDesc.push('instrucciones del agente Hermes actualizadas')
      }
      if (args.addQuickActionLabel && args.addQuickActionPrompt && base) {
        patch.customQuickActions = [
          ...base.customQuickActions,
          {
            id: `qa-${Date.now()}`,
            label: String(args.addQuickActionLabel),
            prompt: String(args.addQuickActionPrompt),
            section: 'all'
          }
        ]
        changesDesc.push(`acción rápida agregada → **${args.addQuickActionLabel}**`)
      }

      return {
        toolCallId,
        toolName,
        success: true,
        summaryEs:
          changesDesc.length > 0
            ? `Customización aplicada en vivo: ${changesDesc.join(', ')}.`
            : 'Panel de customización sincronizado.',
        clientEffects: {
          customizationPatch: patch
        }
      }
    }

    // 9. manage_topic_rules
    if (toolName === 'manage_topic_rules') {
      const topicName = String(args.topicName || '').trim()
      const keywords: string[] = Array.isArray(args.keywordsToAdd)
        ? args.keywordsToAdd.map((k: any) => String(k).trim().toLowerCase()).filter(Boolean)
        : []
      if (!topicName || keywords.length === 0) {
        return {
          toolCallId,
          toolName,
          success: false,
          summaryEs: 'Indicá el nombre del tema y al menos una palabra clave.'
        }
      }
      const currentRules = getTopicRulesMeta().rules
      const existingKw = currentRules[topicName] || []
      const mergedKw = Array.from(new Set([...existingKw, ...keywords]))
      const nextRules = {
        ...currentRules,
        [topicName]: mergedKw
      }
      saveTopicRulesWithSnapshot(nextRules)
      if (args.reclassifyNow !== false) {
        reclassifyAllBookmarks(false)
      }
      return {
        toolCallId,
        toolName,
        success: true,
        summaryEs: `Regla temática **${topicName}** actualizada con ${keywords.length} palabras clave (${keywords.join(', ')}) y archivo reclasificado.`,
        clientEffects: {
          refreshData: true
        }
      }
    }

    // 10. recommend_project_stack
    if (toolName === 'recommend_project_stack') {
      const idea = String(args.idea || '').trim()
      const repos = getAllGalleryRepositories()
      const bookmarks = getAllBookmarks()
      const rec = recommendStackForProjectIdea({
        idea,
        repos,
        bookmarks,
        maxRepos: 6
      })
      if (args.autoSaveBlueprint !== false && rec.generatedBlueprint) {
        upsertProjectBlueprint(rec.generatedBlueprint)
      }
      return {
        toolCallId,
        toolName,
        success: true,
        summaryEs: `Stack recomendado para **"${rec.suggestedName}"** generado con **${rec.recommendedRepos.length} repositorios** (${rec.recommendedRepos.map(r => r.fullName).join(', ')}) y guardado en tus Blueprints.`,
        clientEffects: {
          refreshData: true
        },
        data: rec
      }
    }

    // 11. audit_repo_security
    if (toolName === 'audit_repo_security') {
      const fullName = String(args.fullName || '').trim()
      const existing = getGalleryRepositoryByFullName(fullName)
      const [owner, name] = fullName.split('/')
      if (!owner || !name) {
        return {
          toolCallId,
          toolName,
          success: false,
          summaryEs: 'Formato de repositorio inválido. Usá owner/repo.'
        }
      }
      const repoObj =
        existing ||
        ({
          id: numericIdFromFullName(fullName),
          owner,
          name,
          fullName,
          url: `https://github.com/${fullName}`,
          avatarUrl: `https://github.com/${owner}.png`,
          description: '',
          explanation: '',
          imageUrl: null,
          imageSource: 'fallback',
          stars: 0,
          forks: 0,
          openIssues: 0,
          primaryLanguage: null,
          languages: [],
          topics: [],
          license: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          pushedAt: new Date().toISOString(),
          latestRelease: null,
          addedAt: new Date().toISOString()
        } as any)

      const audit = await auditRepositorySecurityAndHealth(repoObj, { token: githubToken })
      return {
        toolCallId,
        toolName,
        success: true,
        summaryEs: `Auditoría de seguridad de **${fullName}**: Puntaje **${audit.securityScore}/10** (Riesgo **${audit.riskLevel}**). ${audit.summaryEs}`,
        data: audit
      }
    }

    // 12. export_catalog
    if (toolName === 'export_catalog') {
      const format = (args.format || 'xlsx') as 'xlsx' | 'csv' | 'json'
      return {
        toolCallId,
        toolName,
        success: true,
        summaryEs: `Iniciando descarga del catálogo en formato **.${format.toUpperCase()}**.`,
        clientEffects: {
          triggerExportFormat: format
        }
      }
    }

    // 13. install_skill_or_mcp_local (SENSITIVE)
    if (toolName === 'install_skill_or_mcp_local') {
      const fullName = String(args.fullName || '').trim()
      const [owner, name] = fullName.split('/')
      if (!owner || !name) {
        return {
          toolCallId,
          toolName,
          success: false,
          summaryEs: 'Formato de repositorio inválido. Usá owner/repo.'
        }
      }
      const existing = getGalleryRepositoryByFullName(fullName)
      const repoObj =
        existing ||
        ({
          id: numericIdFromFullName(fullName),
          owner,
          name,
          fullName,
          url: `https://github.com/${fullName}`,
          description: `Recurso ${fullName}`,
          explanation: `Recurso ${fullName}`
        } as any)
      const snippet = extractInstallAndSetupSnippets(repoObj)
      const safeFolder = `${owner}__${name}`.replace(/[^a-zA-Z0-9_.-]/g, '_')
      const targetDir = path.join(DATA_DIR, 'skills-installed', safeFolder)
      fs.mkdirSync(targetDir, { recursive: true })
      const skillMdPath = path.join(targetDir, 'SKILL.md')
      const skillMdContent = `---\nname: ${name}\ndescription: ${repoObj.shortExplanationEs || repoObj.description || fullName}\nrepository: https://github.com/${fullName}\n---\n\n# ${fullName}\n\nComando principal: \`${snippet.primaryCommand}\`\n`
      fs.writeFileSync(skillMdPath, skillMdContent, 'utf-8')
      return {
        toolCallId,
        toolName,
        success: true,
        summaryEs: `Recurso **${fullName}** preparado e instalado en \`${skillMdPath}\` (Comando: \`${snippet.primaryCommand}\`).`,
        data: { fullName, targetPath: skillMdPath, primaryCommand: snippet.primaryCommand }
      }
    }

    // 14. delete_items (SENSITIVE)
    if (toolName === 'delete_items') {
      if (args.repoFullName) {
        const ok = deleteGalleryRepository(String(args.repoFullName))
        return {
          toolCallId,
          toolName,
          success: ok,
          summaryEs: ok
            ? `Repositorio **${args.repoFullName}** eliminado de la galería.`
            : `No se encontró el repositorio **${args.repoFullName}**.`,
          clientEffects: {
            refreshData: true
          }
        }
      }
      const ids: string[] = Array.isArray(args.bookmarkIds) ? args.bookmarkIds : []
      if (ids.length === 1) {
        deleteBookmark(ids[0])
        return {
          toolCallId,
          toolName,
          success: true,
          summaryEs: `Guardado \`${ids[0]}\` eliminado de la base de datos.`,
          clientEffects: {
            refreshData: true
          }
        }
      }
      if (ids.length > 1) {
        const removed = deleteBookmarksBatch(ids)
        return {
          toolCallId,
          toolName,
          success: true,
          summaryEs: `Se eliminaron **${removed} guardados** de la base de datos.`,
          clientEffects: {
            refreshData: true
          }
        }
      }
      return {
        toolCallId,
        toolName,
        success: false,
        summaryEs: 'No se especificaron elementos para eliminar.'
      }
    }

    return {
      toolCallId,
      toolName,
      success: false,
      summaryEs: `Herramienta desconocida: ${toolName}`
    }
  } catch (err: any) {
    return {
      toolCallId,
      toolName,
      success: false,
      summaryEs: `Error ejecutando ${toolName}: ${err?.message || 'Error interno'}`
    }
  }
}

/**
 * Deterministic NLU Tool Router for Hermes & Fallback Mode:
 * Detects natural language commands in Spanish so the agent can execute real actions
 * even when no external cloud API key is configured or to complement LLM responses.
 */
export function inferNaturalLanguageToolCalls(
  message: string,
  sectionContext: AgentSectionContext,
  permissionMode: ToolPermissionMode = 'confirm_sensitive'
): AgentToolCallRequest[] {
  const m = message.trim()
  const lower = m.toLowerCase()
  const calls: AgentToolCallRequest[] = []

  const pushCall = (toolName: string, args: Record<string, any>, reasonEs: string) => {
    const spec = getToolSpec(toolName)
    const sensitivity: AgentToolSensitivity = spec?.sensitivity || 'write'
    calls.push({
      id: `tc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      toolName,
      args,
      reasonEs,
      sensitivity,
      requiresConfirmation: shouldRequireToolConfirmation(toolName, permissionMode)
    })
  }

  // 1. Navigation intents
  if (/(?:^|\s)(llevame|ir a|abr[ií]|mostrar|mostrame|navegar a|cambiar a)(?:\s|$)/i.test(lower)) {
    if (/(tabla\s*(?:de\s*)?repos|excel\s*table|2\s*pesta[ñn]as|skills)/i.test(lower) && /(tabla|pesta[ñn]a)/i.test(lower)) {
      pushCall('navigate_section', { section: 'TablaReposSkills' }, 'Abrir la Tabla de Repositorios y Skills')
    } else if (/(repositorios|galer[ií]a)/i.test(lower)) {
      pushCall('navigate_section', { section: 'Repositorios' }, 'Ir a la Galería Visual de Repositorios')
    } else if (/(biblioteca|guardados|tabla)/i.test(lower)) {
      pushCall('navigate_section', { section: 'Biblioteca' }, 'Ir a la Biblioteca de Guardados')
    } else if (/(resumen|inicio|dashboard|overview)/i.test(lower)) {
      pushCall('navigate_section', { section: 'Resumen' }, 'Ir al panel de Resumen')
    } else if (/(temas|categor[ií]as|t[oó]picos)/i.test(lower)) {
      pushCall('navigate_section', { section: 'Temas' }, 'Ir a la vista de Temas')
    } else if (/(fuentes|autores)/i.test(lower)) {
      pushCall('navigate_section', { section: 'Fuentes' }, 'Ir a la vista de Fuentes y Autores')
    } else if (/(exportar|descargar)/i.test(lower) && !/(excel|xlsx|csv|json)/i.test(lower)) {
      pushCall('navigate_section', { section: 'Exportar' }, 'Ir a la sección de Exportación')
    } else if (/(captura|importar|sincronizar)/i.test(lower)) {
      pushCall('navigate_section', { section: 'Captura' }, 'Ir a la sección de Captura e Importación')
    } else if (/(customizaci[oó]n|personalizar|ajustes de interfaz|configurar interfaz)/i.test(lower)) {
      pushCall('navigate_section', { section: 'Customizacion' }, 'Abrir el panel de Customización')
    }
  }

  // 2. Customization intents (Theme, Density, Columns, Dock mode, Permissions)
  const customArgs: Record<string, any> = {}
  if (/(esmeralda|verde|hermes theme)/i.test(lower) && /(tema|color|acento|pon[eé]|cambi[aá])/i.test(lower)) {
    customArgs.themeAccent = 'emerald'
  } else if (/([aá]mbar|dorado|amarillo|solar)/i.test(lower) && /(tema|color|acento|pon[eé]|cambi[aá])/i.test(lower)) {
    customArgs.themeAccent = 'amber'
  } else if (/(cian|celeste|azul|cyber)/i.test(lower) && /(tema|color|acento|pon[eé]|cambi[aá])/i.test(lower)) {
    customArgs.themeAccent = 'cyan'
  } else if (/(violeta|original|morado)/i.test(lower) && /(tema|color|acento|pon[eé]|cambi[aá])/i.test(lower)) {
    customArgs.themeAccent = 'violet'
  }

  if (/(densidad|modo|vista)\s+compact[ao]|m[aá]s\s+compact[ao]/i.test(lower)) {
    customArgs.layoutDensity = 'compact'
  } else if (/(densidad|modo|vista)\s+c[oó]mod[ao]|m[aá]s\s+espaciad[ao]/i.test(lower)) {
    customArgs.layoutDensity = 'comfortable'
  } else if (/(densidad|modo|vista)\s+(est[aá]ndar|normal)/i.test(lower)) {
    customArgs.layoutDensity = 'standard'
  }

  if (/(ventana\s+flotante|chat\s+flotante)/i.test(lower)) {
    customArgs.chatDockMode = 'floating_window'
  } else if (/(panel\s+lateral|acoplar\s+chat|drawer)/i.test(lower)) {
    customArgs.chatDockMode = 'right_drawer'
  }

  if (/(ocult[aá]|escond[eé]|sac[aá])\s+(?:la\s+)?columna\s+(fuente|nombre|prop[oó]sito|tipo|temas|evaluaci[oó]n|estado|links)/i.test(lower)) {
    const colMatch = lower.match(/columna\s+(fuente|nombre|prop[oó]sito|tipo|temas|evaluaci[oó]n|estado|links)/i)
    if (colMatch) {
      customArgs.hideColumn = colMatch[1]
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
    }
  } else if (/(mostr[aá]|restaur[aá])\s+(?:todas\s+)?(?:las\s+)?columnas/i.test(lower)) {
    customArgs.resetColumns = true
  }

  if (Object.keys(customArgs).length > 0) {
    pushCall(
      'customize_interface_and_rules',
      customArgs,
      'Actualizar las preferencias de customización de la app'
    )
  }

  // 3. Export intents
  if (/(export[aá]|descarg[aá]|baj[aá])/i.test(lower) && /(excel|xlsx|csv|json|cat[aá]logo)/i.test(lower)) {
    const fmt = /\bcsv\b/i.test(lower) ? 'csv' : /\bjson\b/i.test(lower) ? 'json' : 'xlsx'
    pushCall('export_catalog', { format: fmt }, `Exportar y descargar el archivo en formato .${fmt}`)
  }

  // 4. Create / Add Repository or Bookmark intents
  if (/(agreg[aá]|sum[aá]|cre[aá]|guard[aá]|import[aá])/i.test(lower)) {
    const ghMatch = m.match(/(?:https?:\/\/github\.com\/)?([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)/)
    const urlMatch = m.match(/https?:\/\/[^\s"'<>]+/)
    if (ghMatch && !/^(http|https|x\.com|t\.co)/i.test(ghMatch[1])) {
      pushCall(
        'create_bookmark_or_repo',
        { repoOrUrl: ghMatch[1] },
        `Agregar el repositorio ${ghMatch[1]} a la Galería y Biblioteca`
      )
    } else if (urlMatch) {
      pushCall(
        'create_bookmark_or_repo',
        { repoOrUrl: urlMatch[0] },
        `Guardar el enlace ${urlMatch[0]} en la Biblioteca`
      )
    }
  }

  // 5. Off-topic separation intents
  if (
    /(separ[aá]|apart[aá]|aisl[aá]|limpi[aá])/i.test(lower) &&
    /(off-?topic|no\s+t[eé]cnic|otro\s+tema|nada\s+que\s+ver|fotos|intrusos|archivos\s+separados)/i.test(lower)
  ) {
    pushCall(
      'separate_off_topic_items',
      {},
      'Auditar y separar archivos no técnicos en "Archivo separado / Otro tema (No técnico)"'
    )
  }

  // 6. Web & Comment Navigator Agent intents
  if (
    /(investig[aá]|naveg[aá]|caz[aá]|busc[aá]\s+en\s+comentarios|destrab[aá]|link\s+de\s+ese\s+link)/i.test(
      lower
    ) &&
    /(hilos|comentarios|links|guardados|repos|faltantes)/i.test(lower)
  ) {
    pushCall(
      'investigate_links_and_comments',
      { limit: 15 },
      'Ejecutar el Agente Navegador de Web y Comentarios para descubrir repositorios y generar El Link de ese Link'
    )
  }

  // 7. Recommend Stack / Blueprint intents
  if (/(recomend[aá]|arm[aá]|dise[ñn][aá])/i.test(lower) && /(stack|blueprint|arquitectura|proyecto)/i.test(lower)) {
    pushCall(
      'recommend_project_stack',
      { idea: m, autoSaveBlueprint: true },
      'Diseñar un stack recomendado de repositorios y guardar su Blueprint'
    )
  }

  // 8. Security Audit intents
  if (/(audit[aá]|seguridad|riesgo)/i.test(lower)) {
    const repoMatch = m.match(/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)/)
    if (repoMatch) {
      pushCall(
        'audit_repo_security',
        { fullName: repoMatch[1] },
        `Ejecutar auditoría de seguridad sobre ${repoMatch[1]}`
      )
    }
  }

  // 9. Install local skill/MCP (SENSITIVE -> always requires confirmation)
  if (/(instal[aá]|clon[aá])/i.test(lower)) {
    const repoMatch = m.match(/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)/)
    if (repoMatch) {
      pushCall(
        'install_skill_or_mcp_local',
        { fullName: repoMatch[1] },
        `Instalar localmente el recurso ${repoMatch[1]}`
      )
    }
  }

  // 10. Delete intents (SENSITIVE -> always requires confirmation)
  if (/(borr[aá]|elimin[aá]|quit[aá])/i.test(lower)) {
    const idMatch = m.match(/\b((?:x|ig|wa|github|agent):[A-Za-z0-9_./-]+)\b/i)
    const repoMatch = m.match(/\brepo(?:sitorio)?\s+([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)/i)
    if (idMatch) {
      pushCall(
        'delete_items',
        { bookmarkIds: [idMatch[1]] },
        `Eliminar el guardado ${idMatch[1]} de la base de datos`
      )
    } else if (repoMatch) {
      pushCall(
        'delete_items',
        { repoFullName: repoMatch[1] },
        `Eliminar el repositorio ${repoMatch[1]} de la galería`
      )
    } else if (/(este\s+guardado|guardado\s+abierto|seleccionado)/i.test(lower) && sectionContext.selectedBookmarkId) {
      pushCall(
        'delete_items',
        { bookmarkIds: [sectionContext.selectedBookmarkId] },
        `Eliminar el guardado abierto actualmente (${sectionContext.selectedBookmarkTitle || sectionContext.selectedBookmarkId})`
      )
    }
  }

  // 11. Filter by Topic or Author
  if (calls.length === 0 && /(filtr[aá]|mostrame\s+los\s+de)/i.test(lower)) {
    const authorMatch = m.match(/@[A-Za-z0-9_]+/)
    if (authorMatch) {
      pushCall(
        'filter_and_search',
        { author: authorMatch[0] },
        `Filtrar la Biblioteca por el autor ${authorMatch[0]}`
      )
    } else if (/\b(agentes|mcp|skills|voz|video|seguridad|frontend|ui|datos|rag)\b/i.test(lower)) {
      const topicMap: Record<string, string> = {
        agentes: 'Agentes',
        mcp: 'MCP',
        skills: 'Skills',
        voz: 'Voz y Audio',
        video: 'Video y Animación',
        seguridad: 'Seguridad',
        frontend: 'Frontend y UI',
        ui: 'Frontend y UI',
        datos: 'Bases de Datos',
        rag: 'RAG y Memoria'
      }
      for (const [k, v] of Object.entries(topicMap)) {
        if (lower.includes(k)) {
          pushCall('filter_and_search', { topic: v }, `Filtrar la Biblioteca por el tema ${v}`)
          break
        }
      }
    }
  }

  return calls
}
