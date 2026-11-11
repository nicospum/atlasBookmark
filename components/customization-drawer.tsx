'use client'

import React, { useState } from 'react'
import {
  Sliders,
  X,
  Palette,
  Columns,
  ShieldCheck,
  Sparkles,
  Plus,
  Trash2,
  RotateCcw,
  Check,
  Bot,
  LayoutGrid
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  ALL_APP_SECTIONS,
  ALL_LIBRARY_COLUMNS,
  DEFAULT_CUSTOMIZATION_CONFIG,
  THEME_ACCENT_PALETTES,
  loadClientApiKeys,
  saveClientApiKeys
} from '@/lib/customization-store'
import type {
  AtlasCustomizationConfig,
  ChatDockMode,
  LayoutDensityMode,
  LibraryColumnId,
  ThemeAccentId,
  ToolPermissionMode
} from '@/lib/types'

interface CustomizationDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  config: AtlasCustomizationConfig
  onChangeConfig: (next: AtlasCustomizationConfig) => void
}

export function CustomizationDrawer({
  open,
  onOpenChange,
  config,
  onChangeConfig
}: CustomizationDrawerProps) {
  const [newOffTopicWord, setNewOffTopicWord] = useState('')
  const [newQaLabel, setNewQaLabel] = useState('')
  const [newQaPrompt, setNewQaPrompt] = useState('')
  const [newQaSection, setNewQaSection] = useState<string>('all')
  const [telegramStatus, setTelegramStatus] = useState<string>('')
  const [tgToken, setTgToken] = useState<string>(() => {
    if (typeof window === 'undefined') return ''
    return loadClientApiKeys().telegramBotToken || ''
  })

  if (!open) return null

  const update = (patch: Partial<AtlasCustomizationConfig>) => {
    onChangeConfig({
      ...config,
      ...patch
    })
  }

  const toggleColumn = (colId: LibraryColumnId) => {
    const exists = config.visibleLibraryColumns.includes(colId)
    if (exists && config.visibleLibraryColumns.length <= 2) return // Keep at least 2 columns
    const nextCols = exists
      ? config.visibleLibraryColumns.filter(c => c !== colId)
      : [...config.visibleLibraryColumns, colId]
    update({ visibleLibraryColumns: nextCols })
  }

  const toggleSection = (secId: string) => {
    if (secId === 'Resumen' || secId === 'Biblioteca') return // Core sections always visible
    const exists = config.visibleSections.includes(secId)
    const nextSecs = exists
      ? config.visibleSections.filter(s => s !== secId)
      : [...config.visibleSections, secId]
    update({ visibleSections: nextSecs })
  }

  const handleAddOffTopic = () => {
    const clean = newOffTopicWord.trim().toLowerCase()
    if (!clean) return
    if (!config.offTopicCustomKeywords.includes(clean)) {
      update({
        offTopicCustomKeywords: [...config.offTopicCustomKeywords, clean]
      })
    }
    setNewOffTopicWord('')
  }

  const handleRemoveOffTopic = (word: string) => {
    update({
      offTopicCustomKeywords: config.offTopicCustomKeywords.filter(w => w !== word)
    })
  }

  const handleAddQuickAction = () => {
    if (!newQaLabel.trim() || !newQaPrompt.trim()) return
    update({
      customQuickActions: [
        ...config.customQuickActions,
        {
          id: `qa-${Date.now()}`,
          label: newQaLabel.trim(),
          prompt: newQaPrompt.trim(),
          section: newQaSection
        }
      ]
    })
    setNewQaLabel('')
    setNewQaPrompt('')
  }

  const handleRemoveQuickAction = (id: string) => {
    update({
      customQuickActions: config.customQuickActions.filter(q => q.id !== id)
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/70 backdrop-blur-sm"
      onClick={() => onOpenChange(false)}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="flex h-full w-full max-w-xl flex-col border-l border-[#35314f] bg-[#12141d] text-foreground shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border bg-[#171924] px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="grid size-8 place-items-center rounded-lg bg-[#7c6cf0]/20 text-[#a59cf5] border border-[#7c6cf0]/40">
              <Sliders className="size-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">
                Herramientas de Customización (UI, Reglas y Agentes)
              </h2>
              <p className="text-[11px] text-muted-foreground">
                Personalizá la interfaz, columnas, criterios off-topic, permisos y comportamiento de Hermes
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="xs"
              variant="outline"
              onClick={() => onChangeConfig(DEFAULT_CUSTOMIZATION_CONFIG)}
              title="Restaurar valores por defecto"
              className="text-[11px]"
            >
              <RotateCcw className="size-3 mr-1" /> Restaurar
            </Button>
            <button
              onClick={() => onOpenChange(false)}
              className="rounded-lg p-1.5 text-muted-foreground hover:bg-white/5 hover:text-white"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* 1. Tema Visual y Densidad */}
          <section className="rounded-xl border border-border bg-[#161822] p-4 space-y-4">
            <div className="flex items-center gap-2">
              <Palette className="size-4 text-[#a59cf5]" />
              <h3 className="text-xs font-semibold uppercase tracking-wider text-white">
                1. Apariencia, Acento y Densidad Visual
              </h3>
            </div>

            <div>
              <label className="block text-xs text-muted-foreground mb-2">
                Paleta de Acento Global
              </label>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {(Object.keys(THEME_ACCENT_PALETTES) as ThemeAccentId[]).map(accentKey => {
                  const pal = THEME_ACCENT_PALETTES[accentKey]
                  const selected = config.themeAccent === accentKey
                  return (
                    <button
                      key={accentKey}
                      onClick={() => update({ themeAccent: accentKey })}
                      className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs transition-all ${
                        selected
                          ? 'border-white/60 bg-white/10 font-semibold text-white'
                          : 'border-border bg-[#10121a] text-muted-foreground hover:text-white'
                      }`}
                    >
                      <span
                        className="size-3 rounded-full shrink-0"
                        style={{ backgroundColor: pal.primary }}
                      />
                      <span className="truncate">{pal.name.split(' ')[0]}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs text-muted-foreground mb-1.5">
                  Densidad de Tablas y Tarjetas
                </label>
                <div className="flex rounded-lg border border-border bg-[#10121a] p-1">
                  {(
                    [
                      { id: 'compact', label: 'Compacta' },
                      { id: 'standard', label: 'Estándar' },
                      { id: 'comfortable', label: 'Cómoda' }
                    ] as Array<{ id: LayoutDensityMode; label: string }>
                  ).map(d => (
                    <button
                      key={d.id}
                      onClick={() => update({ layoutDensity: d.id })}
                      className={`flex-1 rounded-md py-1 text-[11px] font-medium transition-colors ${
                        config.layoutDensity === d.id
                          ? 'bg-[#28263b] text-[#cfcaff]'
                          : 'text-muted-foreground hover:text-white'
                      }`}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs text-muted-foreground mb-1.5">
                  Modo del Chat Agéntico Global
                </label>
                <div className="flex rounded-lg border border-border bg-[#10121a] p-1">
                  {(
                    [
                      { id: 'right_drawer', label: 'Panel Lateral' },
                      { id: 'floating_window', label: 'Ventana Flotante' }
                    ] as Array<{ id: ChatDockMode; label: string }>
                  ).map(m => (
                    <button
                      key={m.id}
                      onClick={() => update({ chatDockMode: m.id })}
                      className={`flex-1 rounded-md py-1 text-[11px] font-medium transition-colors ${
                        config.chatDockMode === m.id
                          ? 'bg-[#28263b] text-[#cfcaff]'
                          : 'text-muted-foreground hover:text-white'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* 2. Columnas visibles de la Biblioteca y Secciones */}
          <section className="rounded-xl border border-border bg-[#161822] p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Columns className="size-4 text-[#a59cf5]" />
                <h3 className="text-xs font-semibold uppercase tracking-wider text-white">
                  2. Columnas de Biblioteca y Secciones Activas
                </h3>
              </div>
              <Badge variant="outline" className="text-[10px] border-border">
                {config.visibleLibraryColumns.length}/8 columnas
              </Badge>
            </div>

            <div>
              <p className="text-[11px] text-muted-foreground mb-2">
                Elegí qué columnas mostrar en la tabla principal de Biblioteca (también podés pedírselo a Hermes por voz/texto):
              </p>
              <div className="grid grid-cols-2 gap-1.5">
                {ALL_LIBRARY_COLUMNS.map(col => {
                  const active = config.visibleLibraryColumns.includes(col.id)
                  return (
                    <button
                      key={col.id}
                      onClick={() => toggleColumn(col.id)}
                      className={`flex items-center justify-between rounded-lg border px-2.5 py-1.5 text-left text-xs transition-colors ${
                        active
                          ? 'border-[#433d6b] bg-[#211f33] text-[#d6d1ff]'
                          : 'border-border bg-[#101218] text-muted-foreground opacity-60'
                      }`}
                    >
                      <span className="truncate">{col.label}</span>
                      {active && <Check className="size-3.5 shrink-0 text-emerald-400" />}
                    </button>
                  )
                })}
              </div>
            </div>

            <div>
              <p className="text-[11px] text-muted-foreground mb-2">
                Secciones visibles en la barra lateral:
              </p>
              <div className="flex flex-wrap gap-1.5">
                {ALL_APP_SECTIONS.map(sec => {
                  const active = config.visibleSections.includes(sec)
                  return (
                    <button
                      key={sec}
                      onClick={() => toggleSection(sec)}
                      className={`rounded-md border px-2.5 py-1 text-[11px] transition-colors ${
                        active
                          ? 'border-[#433d6b] bg-[#211f33] text-[#d6d1ff]'
                          : 'border-border bg-[#101218] text-muted-foreground line-through opacity-60'
                      }`}
                    >
                      {sec === 'TablaReposSkills' ? 'Tabla Repos & Skills' : sec}
                    </button>
                  )
                })}
              </div>
            </div>
          </section>

          {/* 3. Permisos de Tool Calling y Seguridad */}
          <section className="rounded-xl border border-border bg-[#161822] p-4 space-y-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="size-4 text-emerald-400" />
              <h3 className="text-xs font-semibold uppercase tracking-wider text-white">
                3. Permisos de Herramientas (Tool Calling) y Confirmación
              </h3>
            </div>

            <div className="space-y-2">
              {(
                [
                  {
                    id: 'confirm_sensitive',
                    title: 'Confirmar acciones sensibles (Recomendado)',
                    desc: 'Navegar, filtrar, crear, editar y customizar se ejecutan al instante. Borrar elementos o instalar en disco requiere tu confirmación.'
                  },
                  {
                    id: 'confirm_all',
                    title: 'Confirmar toda escritura o modificación',
                    desc: 'Solo lectura y navegación son automáticas; cualquier cambio de datos pide aprobación previa.'
                  },
                  {
                    id: 'autonomous_safe',
                    title: 'Ejecución rápida asistida',
                    desc: 'Máxima fluidez para Hermes y demás agentes, manteniendo confirmación obligatoria en eliminaciones.'
                  }
                ] as Array<{ id: ToolPermissionMode; title: string; desc: string }>
              ).map(opt => (
                <button
                  key={opt.id}
                  onClick={() => update({ toolPermissionMode: opt.id })}
                  className={`w-full rounded-lg border p-3 text-left transition-all ${
                    config.toolPermissionMode === opt.id
                      ? 'border-emerald-500/50 bg-emerald-950/20'
                      : 'border-border bg-[#10121a] hover:border-border/80'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-white">{opt.title}</span>
                    {config.toolPermissionMode === opt.id && (
                      <Badge className="bg-emerald-600/30 text-emerald-300 border-emerald-500/40 text-[10px]">
                        Activo
                      </Badge>
                    )}
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">{opt.desc}</p>
                </button>
              ))}
            </div>
          </section>

          {/* 4. Criterios de Separación Off-Topic */}
          <section className="rounded-xl border border-border bg-[#161822] p-4 space-y-3">
            <div className="flex items-center gap-2">
              <LayoutGrid className="size-4 text-amber-400" />
              <h3 className="text-xs font-semibold uppercase tracking-wider text-white">
                4. Reglas de Separación Off-Topic ("Archivo separado / Otro tema")
              </h3>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Palabras clave que disparan la separación automática de archivos no técnicos (fotos personales, deportes, recetas, sorteos) para no contaminar tus repositorios de IA:
            </p>
            <div className="flex flex-wrap gap-1.5">
              {config.offTopicCustomKeywords.map(word => (
                <span
                  key={word}
                  className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-950/30 px-2.5 py-0.5 text-[11px] text-amber-200"
                >
                  {word}
                  <button
                    onClick={() => handleRemoveOffTopic(word)}
                    className="hover:text-white"
                  >
                    <X className="size-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={newOffTopicWord}
                onChange={e => setNewOffTopicWord(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddOffTopic()}
                placeholder="Agregar palabra clave off-topic (ej. gimnasio, cine, mascota)..."
                className="flex-1 rounded-lg border border-border bg-[#101218] px-3 py-1.5 text-xs text-white placeholder:text-muted-foreground focus:outline-none focus:border-[#7c6cf0]"
              />
              <Button size="xs" onClick={handleAddOffTopic} className="bg-[#7c6cf0] text-white">
                <Plus className="size-3.5 mr-1" /> Agregar
              </Button>
            </div>
          </section>

          {/* 5. Configuración de Hermes (Agente Principal) */}
          <section className="rounded-xl border border-border bg-[#161822] p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Bot className="size-4 text-[#a59cf5]" />
              <h3 className="text-xs font-semibold uppercase tracking-wider text-white">
                5. Hermes (Agente Principal) — Instrucciones y Gateway
              </h3>
            </div>

            <div>
              <label className="block text-[11px] text-muted-foreground mb-1">
                Instrucciones permanentes del Sistema para Hermes:
              </label>
              <textarea
                rows={3}
                value={config.hermesConfig.customSystemPrompt}
                onChange={e =>
                  update({
                    hermesConfig: {
                      ...config.hermesConfig,
                      customSystemPrompt: e.target.value
                    }
                  })
                }
                className="w-full rounded-lg border border-border bg-[#101218] p-2.5 text-xs text-white focus:outline-none focus:border-[#7c6cf0]"
              />
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div>
                <label className="block text-[11px] text-muted-foreground mb-1">
                  Hermes Gateway URL (Opcional · Nous/OpenClaw):
                </label>
                <input
                  type="text"
                  value={config.hermesConfig.gatewayUrl}
                  onChange={e =>
                    update({
                      hermesConfig: {
                        ...config.hermesConfig,
                        gatewayUrl: e.target.value
                      }
                    })
                  }
                  placeholder="http://localhost:8765/api/chat"
                  className="w-full rounded-lg border border-border bg-[#101218] px-2.5 py-1.5 text-xs text-white placeholder:text-muted-foreground focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] text-muted-foreground mb-1">
                  Motor LLM de respaldo para Hermes:
                </label>
                <select
                  value={config.hermesConfig.backingProvider}
                  onChange={e =>
                    update({
                      hermesConfig: {
                        ...config.hermesConfig,
                        backingProvider: e.target.value as any
                      }
                    })
                  }
                  className="w-full rounded-lg border border-border bg-[#101218] px-2.5 py-1.5 text-xs text-white focus:outline-none"
                >
                  <option value="auto">Automático (Mejor API activa + NLU Local)</option>
                  <option value="anthropic">Anthropic Claude</option>
                  <option value="gemini">Google Gemini</option>
                  <option value="openai">OpenAI ChatGPT</option>
                </select>
              </div>
            </div>

            <div className="pt-2 border-t border-white/10 space-y-1.5">
              <label className="block text-[11px] font-medium text-emerald-300">
                Telegram Bot Token (para operar Hermes desde Telegram):
              </label>
              <div className="flex gap-2">
                <input
                  type="password"
                  value={tgToken}
                  onChange={e => {
                    const val = e.target.value
                    setTgToken(val)
                    const current = loadClientApiKeys()
                    saveClientApiKeys({ ...current, telegramBotToken: val })
                  }}
                  placeholder="123456789:ABCdefGHIjklMNO... (Token de @BotFather)"
                  className="flex-1 rounded-lg border border-border bg-[#101218] px-2.5 py-1.5 text-xs text-white placeholder:text-muted-foreground focus:outline-none focus:border-emerald-500"
                />
                <Button
                  size="xs"
                  onClick={async () => {
                    if (!tgToken.trim()) {
                      setTelegramStatus('⚠️ Pegá primero el token de tu bot de Telegram.')
                      return
                    }
                    setTelegramStatus('Conectando webhook con Telegram...')
                    try {
                      const res = await fetch('/api/agent/telegram', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          action: 'register-webhook',
                          botToken: tgToken.trim()
                        })
                      })
                      const data = await res.json()
                      if (data.success) {
                        update({
                          hermesConfig: {
                            ...config.hermesConfig,
                            telegramBridgeEnabled: true
                          }
                        })
                        setTelegramStatus(`✅ Bot vinculado a ${data.webhookUrl}`)
                      } else {
                        setTelegramStatus(`⚠️ Error: ${data.error || 'Token inválido'}`)
                      }
                    } catch (err: any) {
                      setTelegramStatus(`⚠️ Error de red: ${err?.message || 'Reintentá'}`)
                    }
                  }}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white"
                >
                  Vincular Telegram
                </Button>
              </div>
              {telegramStatus && (
                <p className="text-[11px] text-emerald-300">{telegramStatus}</p>
              )}
            </div>
          </section>

          {/* 6. Atajos y Acciones Rápidas en el Chat */}
          <section className="rounded-xl border border-border bg-[#161822] p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-[#a59cf5]" />
              <h3 className="text-xs font-semibold uppercase tracking-wider text-white">
                6. Botones de Acción Rápida del Chat por Sección
              </h3>
            </div>

            <div className="space-y-1.5">
              {config.customQuickActions.map(qa => (
                <div
                  key={qa.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-border bg-[#10121a] px-3 py-2 text-xs"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-white">{qa.label}</span>
                      <Badge variant="outline" className="text-[10px] border-border">
                        {qa.section === 'all' ? 'Global' : qa.section}
                      </Badge>
                    </div>
                    <p className="truncate text-[11px] text-muted-foreground">{qa.prompt}</p>
                  </div>
                  <button
                    onClick={() => handleRemoveQuickAction(qa.id)}
                    className="text-muted-foreground hover:text-red-400 shrink-0"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>

            <div className="space-y-2 rounded-lg border border-border/70 bg-[#101218] p-3">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <input
                  type="text"
                  value={newQaLabel}
                  onChange={e => setNewQaLabel(e.target.value)}
                  placeholder="Etiqueta del botón..."
                  className="sm:col-span-2 rounded-md border border-border bg-[#161822] px-2.5 py-1.5 text-xs text-white"
                />
                <select
                  value={newQaSection}
                  onChange={e => setNewQaSection(e.target.value)}
                  className="rounded-md border border-border bg-[#161822] px-2.5 py-1.5 text-xs text-white"
                >
                  <option value="all">Todas las secciones</option>
                  {ALL_APP_SECTIONS.map(s => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newQaPrompt}
                  onChange={e => setNewQaPrompt(e.target.value)}
                  placeholder="Prompt que ejecutará el agente al hacer clic..."
                  className="flex-1 rounded-md border border-border bg-[#161822] px-2.5 py-1.5 text-xs text-white"
                />
                <Button size="xs" onClick={handleAddQuickAction} className="bg-[#7c6cf0] text-white">
                  <Plus className="size-3.5 mr-1" /> Sumar
                </Button>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
