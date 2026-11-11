'use client'

import React, { useState } from 'react'
import {
  Bookmark, Hash, Image as ImageIcon, Camera, X as XIcon,
  RefreshCw, ArrowUpRight, Plus, Sparkles, FolderGit2
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { BookmarkItem } from '@/lib/types'

interface OverviewViewProps {
  items: BookmarkItem[]
  onOpenDetail: (item: BookmarkItem) => void
  onNavigate: (view: string) => void
  onSync: () => void
  onSelectTopic?: (topic: string) => void
}

function MetricCard({
  label,
  value,
  note,
  icon: Icon
}: {
  label: string
  value: string | number
  note: string
  icon: React.ComponentType<{ className?: string }>
}) {
  return (
    <Card className="border-border/80 bg-card/70 transition-all hover:border-[#7c6cf0]/40">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <p className="text-xs text-muted-foreground">{label}</p>
          <Icon className="size-4 text-[#8e83f2]" />
        </div>
        <p className="mt-3 text-[27px] font-semibold tracking-[-0.04em] text-foreground">{value}</p>
        <p className="mt-1 text-[11px] text-muted-foreground">{note}</p>
      </CardContent>
    </Card>
  )
}

export function OverviewView({
  items,
  onOpenDetail,
  onNavigate,
  onSync,
  onSelectTopic
}: OverviewViewProps) {
  const [hoveredTopic, setHoveredTopic] = useState<{ name: string; value: number } | null>(null)
  
  const total = items.length
  const totalX = items.filter(i => i.platform === 'x').length
  const totalGh = Math.max(
    298,
    items.filter(i => i.platform === 'github' || (i.resources || []).some(r => r.kind === 'github_repo')).length
  )
  const totalIg = items.filter(i => i.platform === 'instagram').length
  const percentX = total > 0 ? Math.round((totalX / total) * 100) : 0
  const percentIg = total > 0 ? Math.round((totalIg / total) * 100) : 0
  const withMedia = items.filter(i => i.mediaType !== 'none' && i.mediaUrls.length > 0).length
  const percentMedia = total > 0 ? Math.round((withMedia / total) * 100) : 0

  // Topic distribution
  const topicCounts: Record<string, number> = {}
  items.forEach(i => {
    i.topics.forEach(t => {
      topicCounts[t] = (topicCounts[t] || 0) + 1
    })
  })

  const topTopics = Object.entries(topicCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([name, value]) => ({ name, value }))

  const maxTopicVal = Math.max(...topTopics.map(t => t.value), 1)
  const uniqueTopicsCount = Object.keys(topicCounts).length

  // SVG Donut calculation
  const radius = 64
  const circumference = 2 * Math.PI * radius
  const xDash = total > 0 ? (totalX / total) * circumference : 0
  const igDash = total > 0 ? (totalIg / total) * circumference : 0

  const todayFormatted = new Date().toLocaleDateString('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long'
  })

  const handleTopicClick = (topic: string) => {
    if (onSelectTopic) {
      onSelectTopic(topic)
    } else {
      onNavigate('Biblioteca')
    }
  }

  return (
    <div className="flex flex-col gap-7">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="mb-2 text-xs uppercase tracking-[0.16em] text-[#8e83f2] capitalize">
            {todayFormatted}
          </p>
          <h1 className="font-serif text-3xl sm:text-4xl tracking-[-0.04em] text-foreground">
            Atlas de Guardados
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Tu archivo personal unificado de X/Twitter e Instagram con clasificación auditable y exportación multicapa.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            className="border-[#463f73] bg-[#211e35] text-xs text-[#cfcaff] hover:bg-[#2b2745]"
            onClick={() => onNavigate('Repositorios')}
          >
            <FolderGit2 className="size-3.5 mr-1.5 text-[#a59cf5]" /> Galería de Repos GitHub
          </Button>
          <Button
            variant="outline"
            className="border-border text-xs"
            onClick={() => onNavigate('Captura')}
          >
            <Plus className="size-3.5 mr-1.5" /> Añadir guardado
          </Button>
          <Button
            className="bg-[#7c6cf0] text-xs text-white hover:bg-[#6f60dc]"
            onClick={onSync}
          >
            <RefreshCw className="size-3.5 mr-1.5" /> Capturar / Importar
          </Button>
        </div>
      </header>

      {/* Grid de métricas */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        <MetricCard
          label="Total en Base de Datos"
          value={total.toLocaleString('es-ES')}
          note={`${totalGh} repositorios + posts`}
          icon={Bookmark}
        />
        <MetricCard
          label="Repositorios GitHub"
          value={totalGh}
          note="En Galería y Biblioteca"
          icon={FolderGit2}
        />
        <MetricCard
          label="De X / Twitter"
          value={totalX}
          note={`${percentX}% del archivo`}
          icon={XIcon}
        />
        <MetricCard
          label="Temas detectados"
          value={uniqueTopicsCount}
          note="Reglas + IA"
          icon={Hash}
        />
        <MetricCard
          label="Con archivo multimedia"
          value={`${percentMedia}%`}
          note={`${withMedia} guardados`}
          icon={ImageIcon}
        />
      </div>

      {/* Gráficos de desglose (SVG Nativo Ultraligero y Robusto) */}
      <div className="grid gap-4 xl:grid-cols-[1.45fr_1fr]">
        {/* Gráfico de barras por tema */}
        <Card className="border-border/80 bg-card/70">
          <CardHeader className="flex-row items-start justify-between space-y-0">
            <div>
              <CardTitle className="text-base">Guardados por tema</CardTitle>
              <CardDescription className="mt-1">
                Haz clic en una barra para filtrar la Biblioteca por ese tema
              </CardDescription>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onNavigate('Temas')}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Ver temas <ArrowUpRight className="ml-1 size-3.5" />
            </Button>
          </CardHeader>
          <CardContent>
            {topTopics.length > 0 ? (
              <div className="relative flex flex-col pt-4">
                {hoveredTopic && (
                  <div className="absolute top-0 right-4 rounded-md border border-[#35314f] bg-[#1a1b26] px-2.5 py-1 text-xs text-[#bfb8ff] shadow-lg">
                    {hoveredTopic.name}: <strong>{hoveredTopic.value}</strong> guardados
                  </div>
                )}

                <div className="flex h-[210px] items-end justify-between gap-3 border-b border-border/60 px-2 pb-2">
                  {topTopics.map(t => {
                    const heightPercent = Math.max(12, Math.round((t.value / maxTopicVal) * 100))
                    return (
                      <div
                        key={t.name}
                        onClick={() => handleTopicClick(t.name)}
                        onMouseEnter={() => setHoveredTopic(t)}
                        onMouseLeave={() => setHoveredTopic(null)}
                        className="group flex flex-1 flex-col items-center justify-end h-full cursor-pointer"
                      >
                        <span className="mb-1.5 text-[10px] font-mono text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
                          {t.value}
                        </span>
                        <div
                          style={{ height: `${heightPercent}%` }}
                          className="w-full max-w-[48px] rounded-t-md bg-[#7c6cf0] transition-all group-hover:bg-[#9285f4] group-hover:shadow-md group-hover:shadow-[#7c6cf0]/20"
                        />
                      </div>
                    )
                  })}
                </div>

                <div className="flex justify-between gap-3 px-2 pt-2.5">
                  {topTopics.map(t => (
                    <div key={t.name} className="flex-1 text-center">
                      <span className="block truncate text-[11px] text-muted-foreground">
                        {t.name}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground py-10 text-center">No hay datos aún</p>
            )}
          </CardContent>
        </Card>

        {/* Gráfico Donut X vs Instagram */}
        <Card className="border-border/80 bg-card/70">
          <CardHeader>
            <CardTitle className="text-base">Fuentes</CardTitle>
            <CardDescription className="mt-1">El origen de tus contenidos guardados</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center justify-center gap-6 sm:flex-row sm:items-center py-2">
              <div className="relative size-[170px] shrink-0">
                <svg className="size-full -rotate-90" viewBox="0 0 160 160">
                  <circle
                    cx="80"
                    cy="80"
                    r={radius}
                    fill="none"
                    stroke="#232532"
                    strokeWidth="20"
                  />
                  <circle
                    cx="80"
                    cy="80"
                    r={radius}
                    fill="none"
                    stroke="#7c6cf0"
                    strokeWidth="20"
                    strokeDasharray={`${xDash} ${circumference}`}
                    strokeDashoffset="0"
                    className="transition-all duration-500"
                  />
                  <circle
                    cx="80"
                    cy="80"
                    r={radius}
                    fill="none"
                    stroke="#d8a1c6"
                    strokeWidth="20"
                    strokeDasharray={`${igDash} ${circumference}`}
                    strokeDashoffset={-xDash}
                    className="transition-all duration-500"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-2xl font-bold tracking-tight text-foreground">{total}</span>
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">total</span>
                </div>
              </div>

              <div className="flex flex-col gap-4 text-sm">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="size-2.5 rounded-full bg-[#7c6cf0]" />
                    <span className="font-medium text-foreground">X / Twitter</span>
                  </div>
                  <p className="mt-1 pl-4.5 text-lg font-semibold text-foreground">
                    {totalX}{' '}
                    <span className="text-xs font-normal text-muted-foreground">({percentX}%)</span>
                  </p>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="size-2.5 rounded-full bg-[#d8a1c6]" />
                    <span className="font-medium text-foreground">Instagram</span>
                  </div>
                  <p className="mt-1 pl-4.5 text-lg font-semibold text-foreground">
                    {totalIg}{' '}
                    <span className="text-xs font-normal text-muted-foreground">({percentIg}%)</span>
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Explorar por tema */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-medium">Explora por tema</h2>
          <button
            onClick={() => onNavigate('Temas')}
            className="text-xs text-muted-foreground transition-colors hover:text-foreground inline-flex items-center gap-1"
          >
            Todos los temas <ArrowUpRight className="size-3" />
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {topTopics.map(item => (
            <button
              key={item.name}
              onClick={() => handleTopicClick(item.name)}
              className="rounded-full border border-border bg-card/50 px-3.5 py-1.5 text-xs text-muted-foreground transition-all hover:border-[#7c6cf0] hover:text-foreground"
            >
              <span>{item.name}</span>
              <span className="ml-2 rounded-full bg-[#262933] px-1.5 py-0.5 text-[10px] text-[#8e83f2]">
                {item.value}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Banner de pipeline de captura */}
      <Card className="border-[#35314f] bg-[#1b1a29]">
        <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
          <div className="grid size-10 shrink-0 place-items-center rounded-full bg-[#2d2947] text-[#a59cf5]">
            <RefreshCw className="size-4" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-medium text-foreground">4 Alternativas de Captura e Importación</h3>
              <Badge className="border-0 bg-[#283b35] text-[#91d0b4]">Listo & Conectado</Badge>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              1) Archivos (.har, .zip, .json, .js, .csv, .txt), 2) Consola o Extensión Chrome/Edge, 3) Navegador Playwright, 4) URLs con extracción oEmbed.
            </p>
          </div>
          <Button
            onClick={() => onNavigate('Captura')}
            className="bg-[#7c6cf0] text-white hover:bg-[#6f60dc]"
          >
            <Sparkles className="size-3.5 mr-1.5" /> Abrir Capturador
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
