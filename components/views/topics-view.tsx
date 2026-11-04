'use client'

import React, { useState, useEffect, useMemo } from 'react'
import {
  Tags, ArrowRight, Sparkles, RefreshCw, Loader2, ShieldCheck,
  RotateCcw, Plus, Save, CheckCircle2, Info, SlidersHorizontal
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { BookmarkItem, TopicRulesMeta } from '@/lib/types'
import { foldText, termMatches } from '@/lib/ai-analyzer'

interface TopicsViewProps {
  items: BookmarkItem[]
  onSelectTopic: (topic: string) => void
  onOpenDetail: (item: BookmarkItem) => void
  onReclassifyAll?: () => Promise<string | undefined>
  onEnrichBatch?: () => Promise<string | undefined>
  onRefresh?: () => Promise<void>
}

export function TopicsView({
  items,
  onSelectTopic,
  onOpenDetail,
  onReclassifyAll,
  onEnrichBatch,
  onRefresh
}: TopicsViewProps) {
  const [isReclassifying, setIsReclassifying] = useState(false)
  const [isEnriching, setIsEnriching] = useState(false)
  const [statusBanner, setStatusBanner] = useState<string>('')
  const [showRulesEditor, setShowRulesEditor] = useState(false)
  const [rulesMeta, setRulesMeta] = useState<TopicRulesMeta | null>(null)
  const [selectedRuleTopic, setSelectedRuleTopic] = useState<string>('IA')
  const [newTopicName, setNewTopicName] = useState<string>('')
  const [termsInput, setTermsInput] = useState<string>('')
  const [isSavingRules, setIsSavingRules] = useState(false)

  const fetchRulesMeta = async () => {
    try {
      const res = await fetch('/api/topics/rules')
      if (res.ok) {
        const data = await res.json()
        if (data.success) {
          setRulesMeta(data)
          const firstTopic = Object.keys(data.rules || {})[0] || 'IA'
          setSelectedRuleTopic(prev => (data.rules?.[prev] ? prev : firstTopic))
          const currentTerms = data.rules?.[selectedRuleTopic] || data.rules?.[firstTopic] || []
          setTermsInput(currentTerms.join(', '))
        }
      }
    } catch {
      // Ignore error
    }
  }

  useEffect(() => {
    fetchRulesMeta()
  }, [])

  const handleSelectRuleTopicChange = (topicName: string) => {
    setSelectedRuleTopic(topicName)
    if (topicName === '__new__') {
      setNewTopicName('')
      setTermsInput('')
    } else if (rulesMeta?.rules?.[topicName]) {
      setTermsInput(rulesMeta.rules[topicName].join(', '))
    }
  }

  // Live preview of how many bookmarks in the archive match the current termsInput
  const livePreviewMatches = useMemo(() => {
    const parsedTerms = termsInput
      .split(',')
      .map(t => t.trim())
      .filter(Boolean)
    if (parsedTerms.length === 0) return 0

    let count = 0
    for (const item of items) {
      const hay = ` ${foldText(
        [item.caption, item.domain || '', item.authorName, item.authorHandle, ...(item.collections || [])].join(' ')
      )} `
      if (parsedTerms.some(term => termMatches(hay, term))) {
        count++
      }
    }
    return count
  }, [items, termsInput])

  // Calculate statistics per topic
  const topicStats = useMemo(() => {
    const map: Record<string, { count: number; items: BookmarkItem[]; entities: Set<string> }> = {}

    items.forEach(item => {
      item.topics.forEach(t => {
        if (!map[t]) {
          map[t] = { count: 0, items: [], entities: new Set() }
        }
        map[t].count++
        map[t].items.push(item)
        item.entities.forEach(e => map[t].entities.add(e))
      })
    })

    return Object.entries(map)
      .map(([name, data]) => ({
        name,
        count: data.count,
        percent: items.length > 0 ? Math.round((data.count / items.length) * 100) : 0,
        sampleItems: data.items.slice(0, 2),
        entities: Array.from(data.entities).slice(0, 4)
      }))
      .sort((a, b) => b.count - a.count)
  }, [items])

  const handleRunReclassify = async () => {
    if (!onReclassifyAll) return
    setIsReclassifying(true)
    setStatusBanner('')
    try {
      const msg = await onReclassifyAll()
      if (msg) setStatusBanner(msg)
    } finally {
      setIsReclassifying(false)
    }
  }

  const handleRunEnrich = async () => {
    if (!onEnrichBatch) return
    setIsEnriching(true)
    setStatusBanner('')
    try {
      const msg = await onEnrichBatch()
      if (msg) setStatusBanner(msg)
    } finally {
      setIsEnriching(false)
    }
  }

  const handleSaveTopicRule = async (e: React.FormEvent) => {
    e.preventDefault()
    const targetTopic = selectedRuleTopic === '__new__' ? newTopicName.trim() : selectedRuleTopic
    const terms = termsInput
      .split(',')
      .map(t => t.trim())
      .filter(Boolean)

    if (!targetTopic || terms.length === 0) return

    setIsSavingRules(true)
    setStatusBanner('')
    try {
      const res = await fetch('/api/topics/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: targetTopic, terms })
      })
      const data = await res.json()
      if (res.ok && data.success) {
        setRulesMeta(data)
        setSelectedRuleTopic(targetTopic)
        setStatusBanner(data.message || 'Reglas actualizadas con snapshot SHA-256.')
        await onRefresh?.()
      }
    } finally {
      setIsSavingRules(false)
    }
  }

  const handleRevertRules = async () => {
    setIsSavingRules(true)
    setStatusBanner('')
    try {
      const res = await fetch('/api/topics/rules', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'revert' })
      })
      const data = await res.json()
      if (res.ok && data.success) {
        setRulesMeta(data)
        const firstTopic = Object.keys(data.rules || {})[0] || 'IA'
        setSelectedRuleTopic(firstTopic)
        setTermsInput((data.rules?.[firstTopic] || []).join(', '))
        setStatusBanner(data.message || 'Snapshot SHA-256 restaurado.')
        await onRefresh?.()
      }
    } finally {
      setIsSavingRules(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="mb-2 text-xs uppercase tracking-[0.16em] text-[#8e83f2]">Taxonomía Auditable + IA</p>
          <h1 className="font-serif text-3xl sm:text-4xl tracking-[-0.04em] text-foreground">
            Temas y Categorías
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Clasificación semántica mediante reglas deterministas (`data/topic_rules.json`) y enriquecimiento opcional con IA.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowRulesEditor(!showRulesEditor)}
            className="border-[#35314f] bg-[#1a1b26] text-xs text-[#bfb8ff] hover:bg-[#252438]"
          >
            <SlidersHorizontal className="mr-1.5 size-3.5" />
            {showRulesEditor ? 'Ocultar Editor de Reglas' : 'Editar Reglas (SHA-256)'}
          </Button>

          {onReclassifyAll && (
            <Button
              variant="outline"
              size="sm"
              disabled={isReclassifying || items.length === 0}
              onClick={handleRunReclassify}
              className="border-border text-xs"
            >
              {isReclassifying ? (
                <>
                  <Loader2 className="mr-1.5 size-3.5 animate-spin" /> Reclasificando...
                </>
              ) : (
                <>
                  <RefreshCw className="mr-1.5 size-3.5" /> Reclasificar todo (Reglas)
                </>
              )}
            </Button>
          )}

          {onEnrichBatch && (
            <Button
              size="sm"
              disabled={isEnriching || items.length === 0}
              onClick={handleRunEnrich}
              className="bg-[#7c6cf0] text-xs text-white hover:bg-[#6f60dc]"
            >
              {isEnriching ? (
                <>
                  <Loader2 className="mr-1.5 size-3.5 animate-spin" /> Analizando lote...
                </>
              ) : (
                <>
                  <Sparkles className="mr-1.5 size-3.5" /> Enriquecer lote con IA
                </>
              )}
            </Button>
          )}

          <Badge variant="outline" className="border-[#35314f] bg-[#1a1b26] py-1.5 text-xs text-[#a59cf5]">
            <Sparkles className="size-3 mr-1" /> {topicStats.length} temas activos
          </Badge>
        </div>
      </header>

      {/* Banner de feedback o degradación explícita */}
      {statusBanner && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-[#35314f] bg-[#1b1a29] p-3.5 text-xs text-[#dcd7f9]">
          <div className="flex items-center gap-2">
            {statusBanner.includes('Degradación') ? (
              <Info className="size-4 shrink-0 text-[#f0c982]" />
            ) : (
              <CheckCircle2 className="size-4 shrink-0 text-[#91d0b4]" />
            )}
            <span>{statusBanner}</span>
          </div>
          <button
            onClick={() => setStatusBanner('')}
            className="text-muted-foreground hover:text-white"
          >
            ✕
          </button>
        </div>
      )}

      {/* Editor Visual de Reglas con Snapshot SHA-256 y Reversión en 1 Clic */}
      {showRulesEditor && rulesMeta && (
        <Card className="border-[#35314f] bg-[#161822]">
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <ShieldCheck className="size-4 text-[#91d0b4]" />
                  Editor de Taxonomía Auditable (<code>data/topic_rules.json</code>)
                </CardTitle>
                <CardDescription>
                  Cada cambio genera un snapshot SHA-256 previo en <code>data/normalized/backups/</code> y reclasifica el archivo respetando tus ediciones manuales.
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="border-border font-mono text-[11px] text-muted-foreground">
                  Rev #{rulesMeta.revision} · SHA-256: {rulesMeta.sha256.slice(0, 10)}…
                </Badge>
                {rulesMeta.hasBackup && (
                  <Button
                    size="xs"
                    variant="outline"
                    disabled={isSavingRules}
                    onClick={handleRevertRules}
                    className="border-[#6f435f] bg-[#2a1b26] text-xs text-[#f2a8d6] hover:bg-[#38212e]"
                  >
                    <RotateCcw className="mr-1 size-3" /> Revertir cambio (Snapshot {rulesMeta.backupSha256?.slice(0, 7)})
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSaveTopicRule} className="flex flex-col gap-4">
              <div className="grid gap-4 md:grid-cols-[240px_1fr]">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                    Seleccionar tema o crear nuevo
                  </label>
                  <select
                    value={selectedRuleTopic}
                    onChange={e => handleSelectRuleTopicChange(e.target.value)}
                    className="h-9 w-full rounded-md border border-border bg-[#101217] px-3 text-xs text-foreground focus:border-[#7c6cf0] focus:outline-none"
                  >
                    {Object.keys(rulesMeta.rules).map(t => (
                      <option key={t} value={t}>
                        {t} ({rulesMeta.rules[t].length} términos)
                      </option>
                    ))}
                    <option value="__new__">+ Crear nuevo tema...</option>
                  </select>

                  {selectedRuleTopic === '__new__' && (
                    <input
                      type="text"
                      value={newTopicName}
                      onChange={e => setNewTopicName(e.target.value)}
                      placeholder="Nombre del nuevo tema..."
                      className="mt-2 h-9 w-full rounded-md border border-[#7c6cf0] bg-[#101217] px-3 text-xs text-foreground focus:outline-none"
                    />
                  )}
                </div>

                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <label className="text-xs font-medium text-muted-foreground">
                      Palabras clave bilingües (separadas por coma, límite de palabra completa)
                    </label>
                    <span className="text-[11px] text-[#91d0b4]">
                      Coincidencias en vivo en archivo: <strong>{livePreviewMatches}</strong> de {items.length} guardados
                    </span>
                  </div>
                  <textarea
                    rows={3}
                    value={termsInput}
                    onChange={e => setTermsInput(e.target.value)}
                    placeholder="ia, ai, llm, agent, claude, gemini, rag..."
                    className="w-full rounded-md border border-border bg-[#101217] p-2.5 font-mono text-xs text-foreground focus:border-[#7c6cf0] focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  type="submit"
                  size="sm"
                  disabled={isSavingRules || !termsInput.trim()}
                  className="bg-[#7c6cf0] text-xs text-white hover:bg-[#6f60dc]"
                >
                  {isSavingRules ? (
                    <>
                      <Loader2 className="mr-1.5 size-3.5 animate-spin" /> Guardando snapshot y reclasificando...
                    </>
                  ) : (
                    <>
                      <Save className="mr-1.5 size-3.5" /> Guardar Reglas con Snapshot SHA-256
                    </>
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Grid de temas */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {topicStats.map(stat => (
          <Card
            key={stat.name}
            className="flex flex-col justify-between border-border/80 bg-card/70 transition-all hover:border-[#7c6cf0]/50 hover:bg-[#1a1c24]"
          >
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="grid size-7 place-items-center rounded-md bg-[#262438] text-[#8e83f2]">
                    <Tags className="size-3.5" />
                  </div>
                  <CardTitle className="text-base text-foreground">{stat.name}</CardTitle>
                </div>
                <span className="font-semibold text-sm text-[#bfb8ff]">
                  {stat.count}{' '}
                  <span className="text-xs font-normal text-muted-foreground">
                    ({stat.percent}%)
                  </span>
                </span>
              </div>
              <CardDescription className="pt-2">
                {stat.entities.length > 0 ? (
                  <span className="text-[11px] text-muted-foreground">
                    Entidades: {stat.entities.join(' · ')}
                  </span>
                ) : (
                  <span className="text-[11px] text-muted-foreground">Clasificación temática</span>
                )}
              </CardDescription>
            </CardHeader>

            <CardContent className="flex flex-col gap-3 pt-0">
              {/* Muestras de guardados */}
              <div className="flex flex-col gap-2 rounded-md border border-border/60 bg-[#121319] p-2.5">
                {stat.sampleItems.map(item => (
                  <div
                    key={item.id}
                    onClick={() => onOpenDetail(item)}
                    className="cursor-pointer truncate text-xs text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <span className="font-serif text-[#d8d6e3]">“{item.caption.slice(0, 60)}...”</span>{' '}
                    <span className="text-[10px] text-muted-foreground/80">— {item.authorHandle}</span>
                  </div>
                ))}
              </div>

              {/* Botón para ver en biblioteca */}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onSelectTopic(stat.name)}
                className="mt-1 w-full justify-between text-xs text-muted-foreground hover:bg-[#252836] hover:text-foreground"
              >
                <span>Filtrar "{stat.name}" en Biblioteca</span>
                <ArrowRight className="size-3.5" />
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
