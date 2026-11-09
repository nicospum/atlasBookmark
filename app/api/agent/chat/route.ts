import { NextResponse } from 'next/server'
import {
  ATLAS_AGENT_TOOLS,
  executeAgentToolServer,
  getToolSpec,
  inferNaturalLanguageToolCalls,
  shouldRequireToolConfirmation
} from '@/lib/agent-tools'
import {
  getAllBookmarks,
  getAllGalleryRepositories
} from '@/lib/bookmarks-repository'
import type {
  AgentSectionContext,
  AgentToolCallRequest,
  AgentToolExecutionResult,
  AtlasCustomizationConfig,
  ConfiguredApiKeys,
  ToolPermissionMode
} from '@/lib/types'

export interface AgentProviderCatalogItem {
  id: 'hermes' | 'gemini' | 'anthropic' | 'openai'
  name: string
  badge: string
  isPrimary?: boolean
  configuredOnServer: boolean
  models: Array<{ id: string; label: string }>
  defaultModel: string
  descriptionEs: string
}

export function getAgentCatalogServer(clientKeys?: ConfiguredApiKeys): AgentProviderCatalogItem[] {
  const hasGemini = Boolean(clientKeys?.gemini || process.env.GEMINI_API_KEY)
  const hasAnthropic = Boolean(clientKeys?.anthropic || process.env.ANTHROPIC_API_KEY)
  const hasOpenai = Boolean(clientKeys?.openai || process.env.OPENAI_API_KEY)

  return [
    {
      id: 'hermes',
      name: 'Hermes (Mi Agente Principal)',
      badge: 'Principal · Orquestador',
      isPrimary: true,
      configuredOnServer: true, // Always active (Gateway + Backing LLM + Local NLU Tool Engine)
      defaultModel: 'hermes-orchestrator-v2',
      models: [
        { id: 'hermes-orchestrator-v2', label: 'Hermes Orquestador v2 (Auto Multi-Motor + NLU)' },
        { id: 'hermes-claude-sonnet', label: 'Hermes → Claude Sonnet 4.6 / 3.7' },
        { id: 'hermes-gemini-flash', label: 'Hermes → Gemini 2.5 Flash' },
        { id: 'hermes-gpt-4o', label: 'Hermes → GPT-4o' }
      ],
      descriptionEs:
        'Tu agente principal con memoria de criterios de Atlas, separación estricta off-topic, navegador de hilos/comentarios y acceso total a las 14 herramientas de la app.'
    },
    {
      id: 'gemini',
      name: 'Google Gemini',
      badge: hasGemini ? 'API Activa' : 'Configurar Key',
      configuredOnServer: hasGemini,
      defaultModel: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
      models: [
        { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (Rápido + Tool Calling)' },
        { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro (Razonamiento Profundo)' }
      ],
      descriptionEs: 'Proveedor oficial de Google Gemini con baja latencia y ventana de contexto amplia.'
    },
    {
      id: 'anthropic',
      name: 'Anthropic Claude',
      badge: hasAnthropic ? 'API Activa' : 'Configurar Key',
      configuredOnServer: hasAnthropic,
      defaultModel: process.env.ANTHROPIC_MODEL || 'claude-3-7-sonnet-latest',
      models: [
        { id: 'claude-3-7-sonnet-latest', label: 'Claude 3.7 Sonnet (Arquitectura y Código)' },
        { id: 'claude-3-5-haiku-latest', label: 'Claude 3.5 Haiku (Respuesta Instantánea)' }
      ],
      descriptionEs: 'Proveedor oficial de Anthropic ideal para auditoría técnica, síntesis y ejecución precisa de herramientas.'
    },
    {
      id: 'openai',
      name: 'ChatGPT (OpenAI)',
      badge: hasOpenai ? 'API Activa' : 'Configurar Key',
      configuredOnServer: hasOpenai,
      defaultModel: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      models: [
        { id: 'gpt-4o-mini', label: 'GPT-4o Mini (Ágil y Eficiente)' },
        { id: 'gpt-4o', label: 'GPT-4o (Multimodal Completo)' }
      ],
      descriptionEs: 'Proveedor oficial de OpenAI (o compatible vía OpenRouter) con soporte completo de funciones.'
    }
  ]
}

export async function GET() {
  try {
    const agents = getAgentCatalogServer()
    return NextResponse.json({
      success: true,
      agents,
      tools: ATLAS_AGENT_TOOLS
    })
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || 'Error al obtener catálogo de agentes.' },
      { status: 500 }
    )
  }
}

async function callProviderWithToolProtocol(params: {
  agentId: 'hermes' | 'gemini' | 'anthropic' | 'openai'
  model: string
  systemPrompt: string
  userMessage: string
  history: Array<{ role: 'user' | 'assistant'; content: string }>
  apiKeys: ConfiguredApiKeys
  hermesGatewayUrl?: string
  hermesBackingProvider?: 'auto' | 'gemini' | 'anthropic' | 'openai'
}): Promise<{
  replyText: string
  proposedToolCalls: Array<{ toolName: string; args: Record<string, any>; reasonEs: string }>
  providerUsedLabel: string
} | null> {
  const {
    agentId,
    model,
    systemPrompt,
    userMessage,
    history,
    apiKeys,
    hermesGatewayUrl,
    hermesBackingProvider
  } = params

  const geminiKey = (apiKeys.gemini || process.env.GEMINI_API_KEY || '').trim()
  const anthropicKey = (apiKeys.anthropic || process.env.ANTHROPIC_API_KEY || '').trim()
  const openaiKey = (apiKeys.openai || process.env.OPENAI_API_KEY || '').trim()

  // 1. If Hermes has a custom Gateway URL configured, try calling it first
  if (agentId === 'hermes' && hermesGatewayUrl && /^https?:\/\//i.test(hermesGatewayUrl)) {
    try {
      const gwRes = await fetch(hermesGatewayUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKeys.hermesToken ? { Authorization: `Bearer ${apiKeys.hermesToken}` } : {})
        },
        body: JSON.stringify({
          system: systemPrompt,
          message: userMessage,
          history: history.slice(-10),
          tools: ATLAS_AGENT_TOOLS
        }),
        signal: AbortSignal.timeout(12000)
      })
      if (gwRes.ok) {
        const gwData = await gwRes.json()
        if (gwData?.replyText || gwData?.reply) {
          return {
            replyText: String(gwData.replyText || gwData.reply),
            proposedToolCalls: Array.isArray(gwData.toolCalls) ? gwData.toolCalls : [],
            providerUsedLabel: 'Hermes Gateway Remoto'
          }
        }
      }
    } catch {
      // Fallback transparently to backing LLM or local Hermes engine
    }
  }

  // Determine effective LLM engine to invoke
  let targetProvider: 'gemini' | 'anthropic' | 'openai' | null = null
  let targetModel = model

  if (agentId === 'gemini' && geminiKey) {
    targetProvider = 'gemini'
  } else if (agentId === 'anthropic' && anthropicKey) {
    targetProvider = 'anthropic'
  } else if (agentId === 'openai' && openaiKey) {
    targetProvider = 'openai'
  } else if (agentId === 'hermes') {
    if (model === 'hermes-claude-sonnet' && anthropicKey) {
      targetProvider = 'anthropic'
      targetModel = 'claude-3-7-sonnet-latest'
    } else if (model === 'hermes-gemini-flash' && geminiKey) {
      targetProvider = 'gemini'
      targetModel = 'gemini-2.5-flash'
    } else if (model === 'hermes-gpt-4o' && openaiKey) {
      targetProvider = 'openai'
      targetModel = 'gpt-4o'
    } else if (hermesBackingProvider && hermesBackingProvider !== 'auto') {
      if (hermesBackingProvider === 'anthropic' && anthropicKey) targetProvider = 'anthropic'
      if (hermesBackingProvider === 'gemini' && geminiKey) targetProvider = 'gemini'
      if (hermesBackingProvider === 'openai' && openaiKey) targetProvider = 'openai'
    } else {
      if (geminiKey) {
        targetProvider = 'gemini'
        targetModel = 'gemini-2.5-flash'
      } else if (anthropicKey) {
        targetProvider = 'anthropic'
        targetModel = 'claude-3-7-sonnet-latest'
      } else if (openaiKey) {
        targetProvider = 'openai'
        targetModel = 'gpt-4o-mini'
      }
    }
  }

  if (!targetProvider) return null

  const conversationMessages = [
    ...history.slice(-8).map(m => ({ role: m.role, content: m.content })),
    { role: 'user' as const, content: userMessage }
  ]

  try {
    if (targetProvider === 'gemini') {
      const mId = targetModel.startsWith('gemini-') ? targetModel : 'gemini-2.5-flash'
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${mId}:generateContent?key=${geminiKey}`
      const contents = conversationMessages.map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }]
      }))
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents,
          generationConfig: {
            temperature: 0.25,
            responseMimeType: 'application/json'
          }
        }),
        signal: AbortSignal.timeout(18000)
      })
      if (res.ok) {
        const data = await res.json()
        const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || ''
        const parsed = parseStructuredAgentJson(rawText)
        if (parsed) {
          return {
            ...parsed,
            providerUsedLabel: agentId === 'hermes' ? `Hermes (vía ${mId})` : `Google Gemini (${mId})`
          }
        }
      }
    }

    if (targetProvider === 'anthropic') {
      const mId = targetModel.startsWith('claude-') ? targetModel : 'claude-3-7-sonnet-latest'
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': anthropicKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: mId,
          system: systemPrompt,
          messages: conversationMessages,
          max_tokens: 1600,
          temperature: 0.25
        }),
        signal: AbortSignal.timeout(18000)
      })
      if (res.ok) {
        const data = await res.json()
        const rawText = data?.content?.[0]?.text || ''
        const parsed = parseStructuredAgentJson(rawText)
        if (parsed) {
          return {
            ...parsed,
            providerUsedLabel: agentId === 'hermes' ? `Hermes (vía ${mId})` : `Anthropic Claude (${mId})`
          }
        }
      }
    }

    if (targetProvider === 'openai') {
      const mId = targetModel.startsWith('gpt-') || targetModel.startsWith('o') ? targetModel : 'gpt-4o-mini'
      const baseUrl = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '')
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${openaiKey}`
        },
        body: JSON.stringify({
          model: mId,
          messages: [{ role: 'system', content: systemPrompt }, ...conversationMessages],
          temperature: 0.25,
          response_format: { type: 'json_object' }
        }),
        signal: AbortSignal.timeout(18000)
      })
      if (res.ok) {
        const data = await res.json()
        const rawText = data?.choices?.[0]?.message?.content || ''
        const parsed = parseStructuredAgentJson(rawText)
        if (parsed) {
          return {
            ...parsed,
            providerUsedLabel: agentId === 'hermes' ? `Hermes (vía ${mId})` : `OpenAI ChatGPT (${mId})`
          }
        }
      }
    }
  } catch {
    // Fall back to deterministic Hermes synthesis
  }

  return null
}

function parseStructuredAgentJson(rawText: string): {
  replyText: string
  proposedToolCalls: Array<{ toolName: string; args: Record<string, any>; reasonEs: string }>
} | null {
  if (!rawText || typeof rawText !== 'string') return null
  try {
    const match = rawText.match(/\{[\s\S]*\}/)
    const obj = JSON.parse(match ? match[0] : rawText)
    if (obj && typeof obj === 'object') {
      const replyText = String(obj.replyText || obj.reply || obj.message || '').trim()
      const rawCalls = Array.isArray(obj.toolCalls || obj.proposedToolCalls)
        ? obj.toolCalls || obj.proposedToolCalls
        : []
      const proposedToolCalls = rawCalls
        .filter((c: any) => c && typeof c.toolName === 'string' && getToolSpec(c.toolName))
        .map((c: any) => ({
          toolName: String(c.toolName),
          args: typeof c.args === 'object' && c.args ? c.args : {},
          reasonEs: String(c.reasonEs || `Ejecutar ${c.toolName}`)
        }))
      if (replyText || proposedToolCalls.length > 0) {
        return {
          replyText: replyText || 'Acción procesada.',
          proposedToolCalls
        }
      }
    }
  } catch {
    // If the model returned plain markdown instead of JSON, wrap it
    return {
      replyText: rawText.trim(),
      proposedToolCalls: []
    }
  }
  return null
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const action = body?.action || 'chat'
    const agentId: 'hermes' | 'gemini' | 'anthropic' | 'openai' = body?.agentId || 'hermes'
    const model: string = body?.model || 'hermes-orchestrator-v2'
    const permissionMode: ToolPermissionMode = body?.permissionMode || 'confirm_sensitive'
    const apiKeys: ConfiguredApiKeys = body?.apiKeys || {}
    const currentCustomization: AtlasCustomizationConfig | undefined = body?.customization
    const sectionContext: AgentSectionContext = body?.sectionContext || {
      activeSection: 'Resumen',
      totalBookmarks: 100,
      totalRepos: 263,
      separatedCount: 3,
      fallbackLinksCount: 31
    }

    // 1. Direct execution of an approved sensitive tool call
    if (action === 'confirm-tool' && body?.toolCall) {
      const tc = body.toolCall as AgentToolCallRequest
      const result = await executeAgentToolServer(tc, {
        sectionContext,
        currentCustomization,
        githubToken: apiKeys.githubToken || process.env.GITHUB_TOKEN
      })
      return NextResponse.json({
        success: true,
        executedResults: [result],
        replyText: `${result.success ? '✅ **Acción confirmada y ejecutada:**' : '⚠️ **Error en la acción:**'} ${result.summaryEs}`
      })
    }

    const userMessage = String(body?.message || '').trim()
    const history: Array<{ role: 'user' | 'assistant'; content: string }> = Array.isArray(body?.history)
      ? body.history
      : []

    if (!userMessage) {
      return NextResponse.json(
        { success: false, error: 'Escribí un mensaje o instrucción para el agente.' },
        { status: 400 }
      )
    }

    // Gather live snapshot of the database so the agent has exact context
    const allBookmarks = getAllBookmarks()
    const allRepos = getAllGalleryRepositories()
    const separatedCount = allBookmarks.filter(
      b => b.resourceType === 'Archivo separado / Otro tema (No técnico)'
    ).length
    const withGhCount = allBookmarks.filter(b =>
      (b.resources || []).some(r => r.kind === 'github_repo')
    ).length
    const fallbackCount = allBookmarks.filter(b =>
      (b.resources || []).some(r => r.id?.startsWith('fallback_ref:'))
    ).length

    const enrichedContext: AgentSectionContext = {
      ...sectionContext,
      totalBookmarks: allBookmarks.length,
      totalRepos: allRepos.length,
      separatedCount,
      fallbackLinksCount: fallbackCount
    }

    const sampleReposText = allRepos
      .slice(0, 20)
      .map(r => `- ${r.fullName} (${r.resourceType || 'Repo'}, ★${r.stars}): ${r.shortExplanationEs || r.description}`)
      .join('\n')

    const toolsCatalogPrompt = ATLAS_AGENT_TOOLS.map(
      t =>
        `- "${t.name}" [sensibilidad: ${t.sensitivity}]: ${t.descriptionEs} | Parámetros JSON: ${JSON.stringify(
          t.parametersSchema.properties || {}
        )}`
    ).join('\n')

    const hermesPersonaHeader =
      agentId === 'hermes'
        ? currentCustomization?.hermesConfig?.customSystemPrompt ||
          'Sos Hermes, el agente principal de Nico en Atlas de Guardados.'
        : `Sos el agente ${agentId.toUpperCase()} operando dentro del Chat Agéntico Global de Atlas de Guardados.`

    const systemPrompt = `${hermesPersonaHeader}
Estás integrado globalmente en la aplicación "Atlas de Guardados & Galería Visual de GitHub".
CONTEXTO VIVO DE LA SECCIÓN ACTUAL:
- Sección donde está el usuario ahora mismo: "${enrichedContext.activeSection}"
- Filtro de tema activo: "${enrichedContext.selectedTopicFilter || 'Ninguno'}"
- Filtro de autor activo: "${enrichedContext.selectedAuthorFilter || 'Ninguno'}"
- Guardado abierto en detalle: "${enrichedContext.selectedBookmarkTitle || enrichedContext.selectedBookmarkId || 'Ninguno'}"
- Repositorio seleccionado: "${enrichedContext.selectedRepoFullName || 'Ninguno'}"
- Total de guardados en SQLite: ${enrichedContext.totalBookmarks} (${withGhCount} con repo GitHub directo, ${fallbackCount} con "El Link de ese Link", ${separatedCount} separados como Otro tema no técnico)
- Total de repositorios en Galería Visual: ${enrichedContext.totalRepos}
- Tema visual actual: ${currentCustomization?.themeAccent || 'violet'} | Densidad: ${currentCustomization?.layoutDensity || 'standard'} | Permisos: ${permissionMode}

MUESTRA DE REPOSITORIOS DEL CATÁLOGO:
${sampleReposText}

HERRAMIENTAS DISPONIBLES (TOOL CALLING):
${toolsCatalogPrompt}

INSTRUCCIONES DE RESPUESTA:
Respondé SIEMPRE en español y devolvé EXCLUSIVAMENTE un objeto JSON válido con esta estructura:
{
  "replyText": "Tu respuesta clara en Markdown para el usuario explicando qué hiciste o respondiendo su consulta",
  "toolCalls": [
    {
      "toolName": "nombre_de_la_herramienta",
      "args": { ... },
      "reasonEs": "Breve motivo en español"
    }
  ]
}
Si el usuario te pide hacer algo en la app (navegar, filtrar, crear un repo o guardado, editar, separar archivos off-topic, investigar links/comentarios, customizar colores/densidad/columnas, recomendar un stack, auditar seguridad, exportar a Excel o borrar), incluí la llamada correspondiente en "toolCalls".`

    // Step 1: Deterministic NLU Tool Detection (guarantees tool calling works even without external API keys)
    const deterministicCalls = inferNaturalLanguageToolCalls(
      userMessage,
      enrichedContext,
      permissionMode
    )

    // Step 2: Call Cloud LLM / Hermes Gateway if configured
    const llmOut = await callProviderWithToolProtocol({
      agentId,
      model,
      systemPrompt,
      userMessage,
      history,
      apiKeys,
      hermesGatewayUrl: currentCustomization?.hermesConfig?.gatewayUrl,
      hermesBackingProvider: currentCustomization?.hermesConfig?.backingProvider
    })

    // Merge LLM proposed tool calls with deterministic NLU calls (avoiding duplicate toolNames)
    const finalToolCalls: AgentToolCallRequest[] = []
    const seenTools = new Set<string>()

    if (llmOut && llmOut.proposedToolCalls.length > 0) {
      for (const ptc of llmOut.proposedToolCalls) {
        const spec = getToolSpec(ptc.toolName)
        if (!spec) continue
        seenTools.add(ptc.toolName)
        finalToolCalls.push({
          id: `tc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          toolName: ptc.toolName,
          args: ptc.args || {},
          reasonEs: ptc.reasonEs || spec.descriptionEs,
          sensitivity: spec.sensitivity,
          requiresConfirmation: shouldRequireToolConfirmation(ptc.toolName, permissionMode)
        })
      }
    }

    for (const dtc of deterministicCalls) {
      if (!seenTools.has(dtc.toolName)) {
        seenTools.add(dtc.toolName)
        finalToolCalls.push(dtc)
      }
    }

    // Separate tool calls into immediate execution vs pending confirmation
    const immediateCalls = finalToolCalls.filter(tc => !tc.requiresConfirmation)
    const pendingConfirmations = finalToolCalls.filter(tc => tc.requiresConfirmation)

    const executedResults: AgentToolExecutionResult[] = []
    for (const tc of immediateCalls) {
      const execRes = await executeAgentToolServer(tc, {
        sectionContext: enrichedContext,
        currentCustomization,
        githubToken: apiKeys.githubToken || process.env.GITHUB_TOKEN
      })
      executedResults.push(execRes)
    }

    // Build grounded reply if no cloud LLM was used or enrich LLM reply with tool execution outcomes
    let replyText = llmOut?.replyText || ''
    const providerUsedLabel =
      llmOut?.providerUsedLabel ||
      (agentId === 'hermes'
        ? 'Hermes Orquestador Local (NLU + SQLite)'
        : `${agentId.toUpperCase()} (Modo Determinista Local — Configurá tu API Key en 🔑 para LLM en nube)`)

    if (!replyText) {
      if (executedResults.length > 0 || pendingConfirmations.length > 0) {
        const parts: string[] = []
        for (const r of executedResults) {
          parts.push(`${r.success ? '✅' : '⚠️'} ${r.summaryEs}`)
        }
        for (const p of pendingConfirmations) {
          parts.push(
            `🛡️ **Confirmación requerida para \`${p.toolName}\`**: ${p.reasonEs}. Hacé clic en **"Confirmar y Ejecutar"** abajo para autorizar la acción.`
          )
        }
        replyText = parts.join('\n\n')
      } else {
        // Contextual question answering over the user's database
        const qLower = userMessage.toLowerCase()
        if (qLower.includes('cuántos') || qLower.includes('cuantos') || qLower.includes('estado') || qLower.includes('resumen')) {
          replyText =
            `**Estado actual desde ${enrichedContext.activeSection}:**\n` +
            `- **Guardados totales en SQLite:** **${enrichedContext.totalBookmarks}**\n` +
            `  - Con repositorio de GitHub confirmado: **${withGhCount}**\n` +
            `  - Con **"El Link de ese Link"** (referencia directa al hilo/comentario + búsqueda en 1 clic): **${fallbackCount}**\n` +
            `  - En **Archivo separado / Otro tema (No técnico)**: **${separatedCount}**\n` +
            `- **Repositorios en Galería Visual:** **${enrichedContext.totalRepos}**\n\n` +
            `Podés pedirme en lenguaje natural que navegue a otra sección, filtre por tema, agregue un repositorio, investigue comentarios, cambie el tema visual o exporte a Excel.`
        } else {
          const matchingBms = allBookmarks
            .filter(b =>
              `${b.title || ''} ${b.purpose || ''} ${b.caption || ''} ${(b.topics || []).join(' ')}`
                .toLowerCase()
                .includes(qLower)
            )
            .slice(0, 4)
          const matchingRepos = allRepos
            .filter(r =>
              `${r.fullName} ${r.shortExplanationEs || ''} ${r.description || ''} ${(r.topics || []).join(' ')}`
                .toLowerCase()
                .includes(qLower)
            )
            .slice(0, 4)

          if (matchingRepos.length > 0 || matchingBms.length > 0) {
            const lines: string[] = [
              `Encontré estos recursos en tu catálogo (estás en la sección **${enrichedContext.activeSection}**):`
            ]
            for (const r of matchingRepos) {
              lines.push(
                `- 📦 **[${r.fullName}](${r.url})** (*${r.resourceType || 'Repo'}* · ★ ${r.stars.toLocaleString()}): ${
                  r.shortExplanationEs || r.description
                }`
              )
            }
            for (const b of matchingBms) {
              lines.push(
                `- 🔖 **${b.title || b.id}** (${b.authorHandle} · *${b.resourceType}*): ${b.purpose || b.caption.slice(0, 120)}`
              )
            }
            replyText = lines.join('\n')
          } else {
            replyText =
              `Soy **${agentId === 'hermes' ? 'Hermes, tu agente principal' : agentId.toUpperCase()}**, activo en la sección **${enrichedContext.activeSection}**.\n\n` +
              `Puedo ejecutar acciones reales sobre toda la app por vos:\n` +
              `- **Navegar y filtrar:** *"Llevame a Repositorios"*, *"Filtrá la biblioteca por Agentes"*\n` +
              `- **Crear y editar:** *"Agregá el repo NousResearch/hermes-agent"*, *"Marcá como revisado este guardado"*\n` +
              `- **Criterio de clasificación y separación:** *"Separá los archivos que no tienen que ver con IA"*, *"Investigá los links en comentarios"*\n` +
              `- **Customizar la app:** *"Cambiá el tema a esmeralda y poné densidad compacta"*, *"Ocultá la columna evaluación"*\n` +
              `- **Exportar o instalar:** *"Exportá todo a Excel"*, *"Instalá localmente anthropics/skills"*`
          }
        }
      }
    } else if (executedResults.length > 0) {
      const toolNotes = executedResults.map(r => `${r.success ? '✅' : '⚠️'} *${r.summaryEs}*`).join('\n')
      replyText = `${replyText}\n\n---\n${toolNotes}`
    }

    return NextResponse.json({
      success: true,
      agentId,
      model,
      providerUsedLabel,
      replyText,
      executedResults,
      pendingConfirmations,
      sectionContext: enrichedContext
    })
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error?.message || 'Error al procesar el mensaje en el chat agéntico.'
      },
      { status: 500 }
    )
  }
}
