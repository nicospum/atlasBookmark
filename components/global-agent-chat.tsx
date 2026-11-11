'use client'

import React, { useState, useEffect, useRef } from 'react'
import {
  Bot,
  Send,
  KeyRound,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  Sparkles,
  Wrench,
  X,
  Sliders,
  Maximize2,
  Minimize2,
  MapPin,
  Trash2,
  RefreshCw
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  loadClientApiKeys,
  saveClientApiKeys,
  THEME_ACCENT_PALETTES
} from '@/lib/customization-store'
import type {
  AgentSectionContext,
  AgentToolCallRequest,
  AgentToolExecutionResult,
  AtlasCustomizationConfig,
  ConfiguredApiKeys
} from '@/lib/types'

interface ChatTurn {
  id: string
  role: 'user' | 'assistant'
  content: string
  agentId?: string
  providerLabel?: string
  timestamp: string
  executedTools?: AgentToolExecutionResult[]
  pendingConfirmations?: AgentToolCallRequest[]
}

const AGENT_PROVIDERS: Array<{
  id: 'hermes' | 'gemini' | 'anthropic' | 'openai'
  label: string
  shortLabel: string
  badge: string
  models: Array<{ id: string; label: string }>
}> = [
  {
    id: 'hermes',
    label: 'Hermes (Mi Agente Principal)',
    shortLabel: 'Hermes ★',
    badge: 'Principal',
    models: [
      { id: 'hermes-orchestrator-v2', label: 'Hermes Orquestador v2 (Auto + Tool Calling)' },
      { id: 'hermes-claude-sonnet', label: 'Hermes → Claude 3.7 Sonnet' },
      { id: 'hermes-gemini-flash', label: 'Hermes → Gemini 2.5 Flash' },
      { id: 'hermes-gpt-4o', label: 'Hermes → GPT-4o' }
    ]
  },
  {
    id: 'gemini',
    label: 'Google Gemini',
    shortLabel: 'Gemini',
    badge: 'Google',
    models: [
      { id: 'gemini-2.5-flash', label: 'gemini-2.5-flash' },
      { id: 'gemini-2.5-pro', label: 'gemini-2.5-pro' }
    ]
  },
  {
    id: 'anthropic',
    label: 'Anthropic Claude',
    shortLabel: 'Claude',
    badge: 'Anthropic',
    models: [
      { id: 'claude-3-7-sonnet-latest', label: 'claude-3-7-sonnet-latest' },
      { id: 'claude-3-5-haiku-latest', label: 'claude-3-5-haiku-latest' }
    ]
  },
  {
    id: 'openai',
    label: 'ChatGPT (OpenAI)',
    shortLabel: 'ChatGPT',
    badge: 'OpenAI',
    models: [
      { id: 'gpt-4o-mini', label: 'gpt-4o-mini' },
      { id: 'gpt-4o', label: 'gpt-4o' }
    ]
  }
]

interface GlobalAgentChatProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  sectionContext: AgentSectionContext
  customization: AtlasCustomizationConfig
  onUpdateCustomization: (patch: Partial<AtlasCustomizationConfig>) => void
  onOpenCustomizationDrawer: () => void
  onExecuteClientEffects: (effects: NonNullable<AgentToolExecutionResult['clientEffects']>) => void
}

export function GlobalAgentChat({
  open,
  onOpenChange,
  sectionContext,
  customization,
  onUpdateCustomization,
  onOpenCustomizationDrawer,
  onExecuteClientEffects
}: GlobalAgentChatProps) {
  const [selectedAgent, setSelectedAgent] = useState<'hermes' | 'gemini' | 'anthropic' | 'openai'>(
    customization.defaultAgentId || 'hermes'
  )
  const [selectedModel, setSelectedModel] = useState<string>(
    customization.agentModels?.[customization.defaultAgentId || 'hermes'] || 'hermes-orchestrator-v2'
  )
  const [apiKeys, setApiKeys] = useState<ConfiguredApiKeys>({})
  const [showKeyPanel, setShowKeyPanel] = useState(false)
  const [input, setInput] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [turns, setTurns] = useState<ChatTurn[]>([
    {
      id: 'welcome-hermes',
      role: 'assistant',
      agentId: 'hermes',
      providerLabel: 'Hermes Orquestador Principal',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      content:
        '¡Hola Nico! Soy **Hermes**, tu agente principal en **Atlas de Guardados**.\n\n' +
        'Estoy conectado al contexto de la sección donde estás y tengo acceso a las **14 herramientas de la app** (navegar, filtrar, crear repos/guardados, editar, separar archivos off-topic, investigar hilos y comentarios, customizar la interfaz o exportar a Excel).\n\n' +
        'También podés cambiar en cualquier momento entre **Hermes**, **Gemini**, **Claude** y **ChatGPT** desde el selector de arriba.'
    }
  ])

  const scrollRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    setApiKeys(loadClientApiKeys())
  }, [])

  // Keyboard shortcut Ctrl+J / Cmd+J to toggle Global Agent Chat
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'j') {
        e.preventDefault()
        onOpenChange(!open)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onOpenChange])

  useEffect(() => {
    if (open) {
      setTimeout(() => {
        inputRef.current?.focus()
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
      }, 60)
    }
  }, [open, turns.length])

  // Active Telegram Long-Polling so Hermes ↔ Telegram works even on localhost or behind Vercel Auth
  useEffect(() => {
    const candidateTgToken = (
      apiKeys.telegramBotToken ||
      (/^\d{6,15}:[A-Za-z0-9_-]{20,}$/.test(apiKeys.hermesToken || '') ? apiKeys.hermesToken : '') ||
      ''
    ).trim()
    if (!candidateTgToken) return

    const timer = setInterval(async () => {
      try {
        const res = await fetch('/api/agent/telegram', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'poll-updates',
            botToken: candidateTgToken
          })
        })
        const data = await res.json().catch(() => null)
        if (data?.success && Array.isArray(data.events) && data.events.length > 0) {
          for (const ev of data.events) {
            if (Array.isArray(ev.executedResults)) {
              for (const ex of ev.executedResults) {
                if (ex.clientEffects) {
                  onExecuteClientEffects(ex.clientEffects)
                }
              }
            }
            setTurns(prev => [
              ...prev,
              ...(ev.userText
                ? [
                    {
                      id: `tg-u-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
                      role: 'user' as const,
                      content: `📱 [Telegram] ${ev.userText}`,
                      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                    }
                  ]
                : []),
              {
                id: `tg-a-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
                role: 'assistant' as const,
                agentId: 'hermes',
                providerLabel: 'Hermes · Telegram En Vivo',
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                content: ev.replyText || 'Acción ejecutada desde Telegram.',
                executedTools: ev.executedResults || [],
                pendingConfirmations: ev.pendingConfirmations || []
              }
            ])
          }
        }
      } catch {}
    }, 4000)

    return () => clearInterval(timer)
  }, [apiKeys.telegramBotToken, apiKeys.hermesToken, onExecuteClientEffects])

  const handleSelectAgent = (agentId: 'hermes' | 'gemini' | 'anthropic' | 'openai') => {
    setSelectedAgent(agentId)
    const providerObj = AGENT_PROVIDERS.find(p => p.id === agentId)
    const nextModel =
      customization.agentModels?.[agentId] || providerObj?.models[0]?.id || 'hermes-orchestrator-v2'
    setSelectedModel(nextModel)
    onUpdateCustomization({ defaultAgentId: agentId })
  }

  const handleSelectModel = (modelId: string) => {
    setSelectedModel(modelId)
    onUpdateCustomization({
      agentModels: {
        ...customization.agentModels,
        [selectedAgent]: modelId
      }
    })
  }

  const handleSaveKeys = (nextKeys: ConfiguredApiKeys) => {
    setApiKeys(nextKeys)
    saveClientApiKeys(nextKeys)
  }

  const sendMessage = async (textOverride?: string) => {
    const text = (textOverride ?? input).trim()
    if (!text || isSending) return
    if (!textOverride) setInput('')

    const userTurn: ChatTurn = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }

    setTurns(prev => [...prev, userTurn])
    setIsSending(true)

    try {
      const historyPayload = turns.slice(-10).map(t => ({
        role: t.role,
        content: t.content
      }))

      const res = await fetch('/api/agent/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'chat',
          message: text,
          history: historyPayload,
          agentId: selectedAgent,
          model: selectedModel,
          permissionMode: customization.toolPermissionMode,
          apiKeys,
          customization,
          sectionContext
        })
      })

      const data = await res.json()
      if (res.ok && data.success) {
        const executedResults: AgentToolExecutionResult[] = Array.isArray(data.executedResults)
          ? data.executedResults
          : []
        const pendingConfirmations: AgentToolCallRequest[] = Array.isArray(data.pendingConfirmations)
          ? data.pendingConfirmations
          : []

        // Apply client-side effects for all executed tools
        for (const exec of executedResults) {
          if (exec.clientEffects) {
            onExecuteClientEffects(exec.clientEffects)
          }
        }

        const assistantTurn: ChatTurn = {
          id: `a-${Date.now()}`,
          role: 'assistant',
          agentId: selectedAgent,
          providerLabel: data.providerUsedLabel || selectedAgent.toUpperCase(),
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          content: data.replyText || 'Listo.',
          executedTools: executedResults,
          pendingConfirmations
        }

        setTurns(prev => [...prev, assistantTurn])
      } else {
        setTurns(prev => [
          ...prev,
          {
            id: `err-${Date.now()}`,
            role: 'assistant',
            agentId: selectedAgent,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            content: `⚠️ Error: ${data?.error || 'No se pudo procesar la solicitud.'}`
          }
        ])
      }
    } catch (err: any) {
      setTurns(prev => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: 'assistant',
          agentId: selectedAgent,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          content: `⚠️ Error de red al conectar con /api/agent/chat: ${err?.message || 'Reintentá en unos segundos.'}`
        }
      ])
    } finally {
      setIsSending(false)
    }
  }

  const handleConfirmSensitiveTool = async (turnId: string, toolCall: AgentToolCallRequest) => {
    setIsSending(true)
    try {
      const res = await fetch('/api/agent/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'confirm-tool',
          toolCall,
          apiKeys,
          customization,
          sectionContext
        })
      })
      const data = await res.json()
      if (res.ok && data.success) {
        const executed: AgentToolExecutionResult[] = data.executedResults || []
        for (const ex of executed) {
          if (ex.clientEffects) {
            onExecuteClientEffects(ex.clientEffects)
          }
        }

        // Remove from pendingConfirmations in that turn and append confirmation message
        setTurns(prev =>
          prev
            .map(t =>
              t.id === turnId
                ? {
                    ...t,
                    pendingConfirmations: (t.pendingConfirmations || []).filter(
                      p => p.id !== toolCall.id
                    ),
                    executedTools: [...(t.executedTools || []), ...executed]
                  }
                : t
            )
            .concat({
              id: `conf-${Date.now()}`,
              role: 'assistant',
              agentId: selectedAgent,
              providerLabel: 'Ejecutor de Herramientas Autorizado',
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              content: data.replyText || '✅ Acción confirmada y ejecutada.'
            })
        )
      }
    } finally {
      setIsSending(false)
    }
  }

  const handleCancelSensitiveTool = (turnId: string, toolCallId: string) => {
    setTurns(prev =>
      prev.map(t =>
        t.id === turnId
          ? {
              ...t,
              pendingConfirmations: (t.pendingConfirmations || []).filter(p => p.id !== toolCallId)
            }
          : t
      )
    )
  }

  const accentPalette = THEME_ACCENT_PALETTES[customization.themeAccent || 'violet']
  const currentAgentInfo =
    AGENT_PROVIDERS.find(a => a.id === selectedAgent) || AGENT_PROVIDERS[0]

  const contextualQuickActions = customization.customQuickActions.filter(
    qa => qa.section === 'all' || qa.section === sectionContext.activeSection
  )

  const configuredKeysCount = [
    apiKeys.hermesToken,
    apiKeys.gemini,
    apiKeys.anthropic,
    apiKeys.openai,
    apiKeys.githubToken,
    apiKeys.telegramBotToken
  ].filter(Boolean).length

  // Floating trigger button when closed
  if (!open) {
    return (
      <div className="fixed bottom-5 right-5 z-40 flex items-center gap-2">
        <button
          onClick={() => onOpenChange(true)}
          style={{
            backgroundColor: accentPalette.primary,
            boxShadow: `0 10px 28px -6px ${accentPalette.primary}80`
          }}
          className="group flex items-center gap-2.5 rounded-full border border-white/20 px-4 py-3 text-xs font-semibold text-white transition-all hover:scale-[1.03]"
          title="Abrir Chat Agéntico Global con Hermes, Gemini, Claude y ChatGPT (Ctrl+J)"
        >
          <Bot className="size-4" />
          <span>Chat Agéntico · {currentAgentInfo.shortLabel}</span>
          <Badge className="bg-black/30 text-[10px] text-white border-white/20">
            {sectionContext.activeSection}
          </Badge>
          <kbd className="hidden rounded bg-black/25 px-1.5 py-0.5 text-[10px] text-white/90 sm:inline-block">
            Ctrl+J
          </kbd>
        </button>
      </div>
    )
  }

  const isFloating = customization.chatDockMode === 'floating_window'

  return (
    <div
      className={
        isFloating
          ? 'fixed bottom-4 right-4 z-50 flex h-[660px] max-h-[88vh] w-[460px] max-w-[95vw] flex-col overflow-hidden rounded-2xl border border-[#453f6e] bg-[#12141d] shadow-2xl'
          : 'fixed inset-y-0 right-0 z-50 flex h-full w-full max-w-[460px] flex-col border-l border-[#35314f] bg-[#12141d] shadow-2xl'
      }
    >
      {/* Top Header: Agent Selector + Window Controls */}
      <div className="border-b border-border bg-[#171924] px-4 py-3 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div
              className="grid size-8 place-items-center rounded-lg text-white shrink-0"
              style={{ backgroundColor: accentPalette.primary }}
            >
              <Bot className="size-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-xs font-semibold text-white">
                  Chat Agéntico Global
                </span>
                <Badge
                  variant="outline"
                  className="border-emerald-500/40 bg-emerald-950/30 text-[10px] text-emerald-300"
                >
                  14 Tools Activas
                </Badge>
              </div>
              <p className="truncate text-[10px] text-muted-foreground">
                Hermes principal · Gemini · Claude · ChatGPT intercambiables
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => setShowKeyPanel(!showKeyPanel)}
              className={`flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] transition-colors ${
                showKeyPanel || configuredKeysCount > 0
                  ? 'border-amber-500/50 bg-amber-950/30 text-amber-200'
                  : 'border-border bg-[#101218] text-muted-foreground hover:text-white'
              }`}
              title="Configurar claves de API (Gemini, Claude, ChatGPT, GitHub)"
            >
              <KeyRound className="size-3" />
              <span>Keys{configuredKeysCount > 0 ? ` (${configuredKeysCount})` : ''}</span>
            </button>

            <button
              onClick={onOpenCustomizationDrawer}
              className="rounded-md border border-border bg-[#101218] p-1.5 text-muted-foreground hover:text-white"
              title="Abrir Herramientas de Customización"
            >
              <Sliders className="size-3.5" />
            </button>

            <button
              onClick={() =>
                onUpdateCustomization({
                  chatDockMode: isFloating ? 'right_drawer' : 'floating_window'
                })
              }
              className="rounded-md border border-border bg-[#101218] p-1.5 text-muted-foreground hover:text-white"
              title={isFloating ? 'Acoplar como panel lateral derecho' : 'Convertir en ventana flotante'}
            >
              {isFloating ? <Maximize2 className="size-3.5" /> : <Minimize2 className="size-3.5" />}
            </button>

            <button
              onClick={() => onOpenChange(false)}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-white/5 hover:text-white"
              title="Minimizar chat (Ctrl+J)"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>

        {/* Agent Tabs (Hermes, Gemini, Claude, ChatGPT) */}
        <div className="grid grid-cols-4 gap-1 rounded-lg border border-border bg-[#0f1118] p-1">
          {AGENT_PROVIDERS.map(ag => {
            const active = selectedAgent === ag.id
            return (
              <button
                key={ag.id}
                onClick={() => handleSelectAgent(ag.id)}
                style={active ? { backgroundColor: accentPalette.badgeBg, color: accentPalette.badgeText } : {}}
                className={`rounded-md py-1.5 px-2 text-center text-[11px] font-medium transition-all ${
                  active
                    ? 'border border-white/15 shadow-sm'
                    : 'text-muted-foreground hover:text-white'
                }`}
              >
                {ag.shortLabel}
              </button>
            )
          })}
        </div>

        {/* Model Selector & Live Section Context Pill */}
        <div className="flex items-center justify-between gap-2 text-[11px]">
          <select
            value={selectedModel}
            onChange={e => handleSelectModel(e.target.value)}
            className="flex-1 truncate rounded-md border border-border bg-[#101218] px-2 py-1 text-[11px] text-white focus:outline-none"
          >
            {currentAgentInfo.models.map(m => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>

          <div
            className="flex items-center gap-1 rounded-md border border-border bg-[#101218] px-2 py-1 text-[10px] text-muted-foreground shrink-0"
            title="El agente conoce automáticamente la sección y filtros donde estás"
          >
            <MapPin className="size-3 text-emerald-400" />
            <span className="text-white font-medium">{sectionContext.activeSection}</span>
            {sectionContext.selectedTopicFilter && (
              <span className="text-[#a59cf5]">· {sectionContext.selectedTopicFilter}</span>
            )}
          </div>
        </div>
      </div>

      {/* Collapsible API Keys Configurator */}
      {showKeyPanel && (
        <div className="border-b border-amber-500/30 bg-[#18161d] p-3.5 space-y-2.5 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-amber-200 flex items-center gap-1.5">
              <KeyRound className="size-3.5" /> Claves de API por Proveedor (Guardadas en tu navegador)
            </span>
            <button
              onClick={() => setShowKeyPanel(false)}
              className="text-[11px] text-muted-foreground hover:text-white"
            >
              Cerrar
            </button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Configurá tus claves para intercambiar en vivo entre **Hermes**, **Gemini**, **Claude** y **ChatGPT**.
          </p>
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 pb-1.5 border-b border-white/10">
              <span className="w-24 text-[11px] text-[#bfb8ff] font-semibold">Hermes Key ★:</span>
              <input
                type="password"
                value={apiKeys.hermesToken || ''}
                onChange={e => handleSaveKeys({ ...apiKeys, hermesToken: e.target.value })}
                placeholder="sk-or-... / Key de Hermes / Gateway URL"
                className="flex-1 rounded border border-[#564c96] bg-[#0f1118] px-2 py-1 text-xs text-white"
              />
              <button
                type="button"
                onClick={async () => {
                  const raw = (apiKeys.hermesToken || '').trim()
                  if (!raw) return
                  // If the user pasted a Telegram Bot token inside Hermes Key, link it via Telegram route automatically
                  if (/^\d{6,15}:[A-Za-z0-9_-]{20,}$/.test(raw)) {
                    handleSaveKeys({ ...apiKeys, hermesToken: raw, telegramBotToken: raw })
                    const tgRes = await fetch('/api/agent/telegram', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ action: 'register-webhook', botToken: raw })
                    })
                    const tgData = await tgRes.json()
                    setTurns(prev => [
                      ...prev,
                      {
                        id: `hm-tg-${Date.now()}`,
                        role: 'assistant',
                        agentId: 'hermes',
                        providerLabel: 'Hermes · Vinculación',
                        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                        content: tgData.success
                          ? tgData.message
                          : `⚠️ Error al vincular token: ${tgData.error}`
                      }
                    ])
                    setShowKeyPanel(false)
                    return
                  }

                  const res = await fetch('/api/agent/chat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      action: 'verify-hermes',
                      apiKeys
                    })
                  })
                  const data = await res.json()
                  setTurns(prev => [
                    ...prev,
                    {
                      id: `hm-${Date.now()}`,
                      role: 'assistant',
                      agentId: 'hermes',
                      providerLabel: 'Hermes · Vinculación',
                      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                      content: data.success
                        ? data.replyText
                        : `⚠️ No se pudo verificar la Key de Hermes: ${data.error}`
                    }
                  ])
                  if (data.success) setShowKeyPanel(false)
                }}
                className="rounded border border-[#7c6cf0]/60 bg-[#7c6cf0]/25 px-2.5 py-1 text-[10px] font-semibold text-[#d8d3ff] hover:bg-[#7c6cf0]/40"
              >
                Vincular
              </button>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-24 text-[11px] text-emerald-300 font-medium">Telegram Bot:</span>
              <input
                type="password"
                value={apiKeys.telegramBotToken || ''}
                onChange={e => handleSaveKeys({ ...apiKeys, telegramBotToken: e.target.value })}
                placeholder="123456:ABC-DEF... (Token de @BotFather)"
                className="flex-1 rounded border border-border bg-[#0f1118] px-2 py-1 text-xs text-white"
              />
              <button
                type="button"
                onClick={async () => {
                  const token = (apiKeys.telegramBotToken || apiKeys.hermesToken || '').trim()
                  if (!token) return
                  const res = await fetch('/api/agent/telegram', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      action: 'register-webhook',
                      botToken: token
                    })
                  })
                  const data = await res.json()
                  setTurns(prev => [
                    ...prev,
                    {
                      id: `tg-${Date.now()}`,
                      role: 'assistant',
                      agentId: 'hermes',
                      providerLabel: 'Hermes · Puente Telegram',
                      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                      content: data.success
                        ? data.message
                        : `⚠️ ${data.error || 'No se pudo vincular el bot de Telegram.'}`
                    }
                  ])
                  if (data.success) setShowKeyPanel(false)
                }}
                className="rounded border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-1 text-[10px] font-medium text-emerald-300 hover:bg-emerald-500/25"
              >
                Vincular
              </button>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-24 text-[11px] text-muted-foreground">Gemini Key:</span>
              <input
                type="password"
                value={apiKeys.gemini || ''}
                onChange={e => handleSaveKeys({ ...apiKeys, gemini: e.target.value })}
                placeholder="AIzaSy..."
                className="flex-1 rounded border border-border bg-[#0f1118] px-2 py-1 text-xs text-white"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="w-24 text-[11px] text-muted-foreground">Claude Key:</span>
              <input
                type="password"
                value={apiKeys.anthropic || ''}
                onChange={e => handleSaveKeys({ ...apiKeys, anthropic: e.target.value })}
                placeholder="sk-ant-..."
                className="flex-1 rounded border border-border bg-[#0f1118] px-2 py-1 text-xs text-white"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="w-24 text-[11px] text-muted-foreground">OpenAI Key:</span>
              <input
                type="password"
                value={apiKeys.openai || ''}
                onChange={e => handleSaveKeys({ ...apiKeys, openai: e.target.value })}
                placeholder="sk-proj-..."
                className="flex-1 rounded border border-border bg-[#0f1118] px-2 py-1 text-xs text-white"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="w-24 text-[11px] text-muted-foreground">GitHub PAT:</span>
              <input
                type="password"
                value={apiKeys.githubToken || ''}
                onChange={e => handleSaveKeys({ ...apiKeys, githubToken: e.target.value })}
                placeholder="ghp_... (opcional para 5000 req/h)"
                className="flex-1 rounded border border-border bg-[#0f1118] px-2 py-1 text-xs text-white"
              />
            </div>
          </div>
        </div>
      )}

      {/* Conversation Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {turns.map(turn => (
          <div
            key={turn.id}
            className={`flex flex-col ${turn.role === 'user' ? 'items-end' : 'items-start'}`}
          >
            <div className="mb-1 flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <span className="font-medium text-white/80">
                {turn.role === 'user' ? 'Vos' : turn.providerLabel || 'Agente'}
              </span>
              <span>·</span>
              <span>{turn.timestamp}</span>
            </div>

            <div
              style={
                turn.role === 'user'
                  ? { backgroundColor: accentPalette.primary, color: '#ffffff' }
                  : {}
              }
              className={`max-w-[92%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed whitespace-pre-wrap ${
                turn.role === 'user'
                  ? 'rounded-br-sm shadow-sm'
                  : 'rounded-bl-sm border border-border bg-[#181b26] text-foreground'
              }`}
            >
              {turn.content}

              {/* Executed Tools Badges */}
              {turn.executedTools && turn.executedTools.length > 0 && (
                <div className="mt-2.5 space-y-1.5 border-t border-white/10 pt-2">
                  {turn.executedTools.map(et => (
                    <div
                      key={et.toolCallId}
                      className="flex items-start gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-950/25 px-2.5 py-1.5 text-[11px] text-emerald-200"
                    >
                      <Wrench className="size-3.5 shrink-0 mt-0.5 text-emerald-400" />
                      <div>
                        <span className="font-semibold">Tool: {et.toolName}</span>
                        <p className="text-[10px] text-emerald-100/90">{et.summaryEs}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Pending Sensitive Tool Confirmations */}
              {turn.pendingConfirmations && turn.pendingConfirmations.length > 0 && (
                <div className="mt-3 space-y-2 border-t border-amber-500/30 pt-2.5">
                  {turn.pendingConfirmations.map(pc => (
                    <div
                      key={pc.id}
                      className="rounded-xl border border-amber-500/50 bg-amber-950/30 p-3 space-y-2 text-amber-100"
                    >
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-300">
                        <ShieldAlert className="size-4 shrink-0" />
                        <span>Permiso requerido: {pc.toolName}</span>
                      </div>
                      <p className="text-[11px] text-amber-100/90">{pc.reasonEs}</p>
                      <pre className="overflow-x-auto rounded bg-black/40 p-1.5 text-[10px] text-amber-200">
                        {JSON.stringify(pc.args, null, 2)}
                      </pre>
                      <div className="flex items-center gap-2 pt-1">
                        <Button
                          size="xs"
                          onClick={() => handleConfirmSensitiveTool(turn.id, pc)}
                          disabled={isSending}
                          className="bg-emerald-600 hover:bg-emerald-500 text-white text-[11px]"
                        >
                          <CheckCircle2 className="size-3.5 mr-1" /> Confirmar y Ejecutar
                        </Button>
                        <Button
                          size="xs"
                          variant="outline"
                          onClick={() => handleCancelSensitiveTool(turn.id, pc.id)}
                          disabled={isSending}
                          className="border-amber-500/40 text-amber-200 text-[11px]"
                        >
                          <XCircle className="size-3.5 mr-1" /> Cancelar
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {isSending && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <RefreshCw className="size-3.5 animate-spin text-[#a59cf5]" />
            <span>{currentAgentInfo.shortLabel} está analizando y ejecutando herramientas...</span>
          </div>
        )}
      </div>

      {/* Contextual Quick Action Pills */}
      {contextualQuickActions.length > 0 && (
        <div className="border-t border-border/60 bg-[#141620] px-3 py-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-1">
              <Sparkles className="size-3 text-[#a59cf5]" /> Acciones rápidas en {sectionContext.activeSection}
            </span>
            <button
              onClick={() => setTurns(turns.slice(0, 1))}
              className="text-[10px] text-muted-foreground hover:text-white flex items-center gap-1"
              title="Limpiar historial del chat"
            >
              <Trash2 className="size-2.5" /> Limpiar
            </button>
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {contextualQuickActions.map(qa => (
              <button
                key={qa.id}
                onClick={() => sendMessage(qa.prompt)}
                disabled={isSending}
                className="shrink-0 rounded-full border border-[#3d3960] bg-[#1e1c30] px-2.5 py-1 text-[11px] text-[#cfcaff] hover:bg-[#2a2742] transition-colors"
              >
                {qa.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input Box */}
      <form
        onSubmit={e => {
          e.preventDefault()
          sendMessage()
        }}
        className="flex items-center gap-2 border-t border-border bg-[#171924] p-3"
      >
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder={`Pedile a ${currentAgentInfo.shortLabel} crear, editar, navegar, customizar...`}
          className="flex-1 rounded-xl border border-border bg-[#0f1118] px-3.5 py-2 text-xs text-white placeholder:text-muted-foreground focus:outline-none focus:border-[#7c6cf0]"
        />
        <Button
          type="submit"
          size="sm"
          disabled={!input.trim() || isSending}
          style={{ backgroundColor: accentPalette.primary }}
          className="text-white rounded-xl px-3"
        >
          <Send className="size-3.5" />
        </Button>
      </form>
    </div>
  )
}
