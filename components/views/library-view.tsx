'use client'

import React, { useState, useMemo, useEffect } from 'react'
import {
  Search,
  LayoutGrid,
  Table as TableIcon,
  X as XIcon,
  Camera,
  Check,
  Trash2,
  FileSpreadsheet,
  Image as ImageIcon,
  ChevronLeft,
  ChevronRight,
  X as XClose,
  Sparkles,
  GitBranch as Github,
  ExternalLink,
  MessageCircle,
  Columns,
  FileText,
  FileJson,
  RefreshCw,
  CheckCircle2,
  Clock,
  FolderArchive,
  Compass
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { AnalysisState, BookmarkItem, ResourceType, SourcePlatform } from '@/lib/types'
import {
  generateExcelFile,
  downloadCsvFile,
  downloadJsonBackupFile,
  TABLE_DEFAULT_COLUMNS,
  AVAILABLE_COLUMNS,
  ALL_SHEETS,
  formatAnalysisStateLabel
} from '@/lib/excel-export'
import { semanticSearchBookmarks } from '@/lib/ai-analyzer'
import { CANONICAL_RESOURCE_TYPES } from '@/lib/resource-investigator'
import {
  evaluateBookmarkScopeAndOffTopic,
  skillBuildFallbackReferenceLink
} from '@/lib/web-navigator-agent'

interface LibraryViewProps {
  items: BookmarkItem[]
  onOpenDetail: (item: BookmarkItem) => void
  onOpenRepoInGallery?: (repoFullName: string) => void
  onToggleReviewed: (id: string) => void
  onDelete: (id: string) => void
  onBulkUpdateReviewed: (ids: string[], reviewed: boolean) => void
  onBulkDelete: (ids: string[]) => void
  onRefresh?: () => Promise<void>
  externalTopicFilter?: string | null
  externalAuthorFilter?: string | null
  onClearExternalFilters?: () => void
}

const PAGE_SIZE = 50

export function LibraryView({
  items,
  onOpenDetail,
  onOpenRepoInGallery,
  onToggleReviewed,
  onDelete,
  onBulkUpdateReviewed,
  onBulkDelete,
  onRefresh,
  externalTopicFilter,
  externalAuthorFilter,
  onClearExternalFilters
}: LibraryViewProps) {
  const [search, setSearch] = useState('')
  const [searchMode, setSearchMode] = useState<'exact' | 'semantic'>('exact')
  const [platformFilter, setPlatformFilter] = useState<SourcePlatform | 'all'>('all')
  const [topicFilter, setTopicFilter] = useState<string>('all')
  const [resourceTypeFilter, setResourceTypeFilter] = useState<ResourceType | 'all'>('all')
  const [analysisStateFilter, setAnalysisStateFilter] = useState<AnalysisState | 'all'>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'reviewed'>('all')
  const [hasMediaOnly, setHasMediaOnly] = useState(false)
  const [hasGitHubOnly, setHasGitHubOnly] = useState(false)
  const [scopeFilter, setScopeFilter] = useState<'all' | 'radar_tecnico' | 'separados'>('all')
  const [sortBy, setSortBy] = useState<'savedDesc' | 'savedAsc' | 'pubDesc'>('savedDesc')
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [currentPage, setCurrentPage] = useState(1)
  const [visibleColumns, setVisibleColumns] = useState<string[]>([...TABLE_DEFAULT_COLUMNS])
  const [showColumnPicker, setShowColumnPicker] = useState(false)
  const [isInvestigating, setIsInvestigating] = useState(false)
  const [investigateMsg, setInvestigateMsg] = useState('')

  useEffect(() => {
    if (externalTopicFilter) {
      setTopicFilter(externalTopicFilter)
      setCurrentPage(1)
    }
  }, [externalTopicFilter])

  useEffect(() => {
    if (externalAuthorFilter) {
      setSearch(externalAuthorFilter)
      setCurrentPage(1)
    }
  }, [externalAuthorFilter])

  const allTopics = useMemo(() => {
    const set = new Set<string>()
    items.forEach(i => i.topics.forEach(t => set.add(t)))
    return Array.from(set).sort()
  }, [items])

  const safeTimestamp = (item: BookmarkItem, field: 'savedAt' | 'publishedAt'): number => {
    const raw =
      field === 'savedAt'
        ? item.savedAt || item.publishedAt || item.importedAt
        : item.publishedAt || item.savedAt || item.importedAt
    if (!raw) return 0
    const t = new Date(raw).getTime()
    return Number.isFinite(t) ? t : 0
  }

  const itemHasGitHub = (item: BookmarkItem): boolean => {
    return (
      (item.resources || []).some(r => r.kind === 'github_repo') ||
      item.outgoingLinks.some(u => u.toLowerCase().includes('github.com/'))
    )
  }

  const isItemOffTopicSeparated = (item: BookmarkItem): boolean => {
    if (item.platform === 'github') return false
    if (
      item.resourceType === 'Archivo separado / Otro tema (No técnico)' ||
      item.topics.includes('Archivos Separados / Otros Temas')
    ) {
      return true
    }
    return evaluateBookmarkScopeAndOffTopic({
      caption: item.caption,
      title: item.title,
      authorName: item.authorName,
      authorHandle: item.authorHandle,
      platform: item.platform,
      outgoingLinks: item.outgoingLinks,
      mediaType: item.mediaType,
      mediaUrls: item.mediaUrls,
      topics: item.topics
    }).isOffTopic
  }

  const separatedCount = useMemo(() => items.filter(isItemOffTopicSeparated).length, [items])
  const radarTecnicoCount = items.length - separatedCount

  const filteredItems = useMemo(() => {
    const baseFiltered = items.filter(item => {
      if (scopeFilter === 'radar_tecnico' && isItemOffTopicSeparated(item)) return false
      if (scopeFilter === 'separados' && !isItemOffTopicSeparated(item)) return false
      if (platformFilter !== 'all' && item.platform !== platformFilter) return false
      if (topicFilter !== 'all' && !item.topics.includes(topicFilter)) return false
      if (resourceTypeFilter !== 'all' && item.resourceType !== resourceTypeFilter) return false
      if (analysisStateFilter !== 'all' && (item.analysisState || 'completed') !== analysisStateFilter) return false
      if (statusFilter === 'pending' && item.reviewed) return false
      if (statusFilter === 'reviewed' && !item.reviewed) return false
      if (hasMediaOnly && (item.mediaType === 'none' || item.mediaUrls.length === 0)) return false
      if (hasGitHubOnly && !itemHasGitHub(item)) return false
      return true
    })

    const sortList = <T extends BookmarkItem>(list: T[]): T[] => {
      return [...list].sort((a, b) => {
        if (sortBy === 'savedDesc') return safeTimestamp(b, 'savedAt') - safeTimestamp(a, 'savedAt')
        if (sortBy === 'savedAsc') return safeTimestamp(a, 'savedAt') - safeTimestamp(b, 'savedAt')
        if (sortBy === 'pubDesc') return safeTimestamp(b, 'publishedAt') - safeTimestamp(a, 'publishedAt')
        return 0
      })
    }

    if (search.trim()) {
      if (searchMode === 'semantic') {
        return semanticSearchBookmarks(baseFiltered, search.trim())
      }

      const q = search.toLowerCase()
      const exactFiltered = baseFiltered.filter(item => {
        const inTitle = (item.title || '').toLowerCase().includes(q)
        const inPurpose = (item.purpose || '').toLowerCase().includes(q)
        const inType = (item.resourceType || '').toLowerCase().includes(q)
        const inEval = (item.evaluation || '').toLowerCase().includes(q)
        const inNotes = (item.notes || '').toLowerCase().includes(q)
        const inCaption = item.caption.toLowerCase().includes(q)
        const inAuthor =
          item.authorName.toLowerCase().includes(q) || item.authorHandle.toLowerCase().includes(q)
        const inTopic = item.topics.some(t => t.toLowerCase().includes(q))
        const inEntity = item.entities.some(e => e.toLowerCase().includes(q))
        const inSummary = item.aiSummary.toLowerCase().includes(q)
        const inCollection = (item.collections || []).some(c => c.toLowerCase().includes(q))
        const inResources = (item.resources || []).some(
          r =>
            r.name.toLowerCase().includes(q) ||
            (r.fullName || '').toLowerCase().includes(q) ||
            r.resolvedUrl.toLowerCase().includes(q)
        )
        return (
          inTitle ||
          inPurpose ||
          inType ||
          inEval ||
          inNotes ||
          inCaption ||
          inAuthor ||
          inTopic ||
          inEntity ||
          inSummary ||
          inCollection ||
          inResources
        )
      })

      return sortList(exactFiltered)
    }

    return sortList(baseFiltered)
  }, [
    items,
    platformFilter,
    topicFilter,
    resourceTypeFilter,
    analysisStateFilter,
    statusFilter,
    hasMediaOnly,
    hasGitHubOnly,
    scopeFilter,
    search,
    searchMode,
    sortBy
  ])

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE))
  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE
    return filteredItems.slice(start, start + PAGE_SIZE)
  }, [filteredItems, currentPage])

  const handleSelectAll = () => {
    if (selectedIds.size === filteredItems.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filteredItems.map(i => i.id)))
    }
  }

  const handleToggleSelect = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const next = new Set(selectedIds)
    if (next.has(id)) {
      next.delete(id)
    } else {
      next.add(id)
    }
    setSelectedIds(next)
  }

  const getExportTargetItems = (): { list: BookmarkItem[]; suffix: string } => {
    if (selectedIds.size > 0) {
      const sel = filteredItems.filter(i => selectedIds.has(i.id))
      return { list: sel, suffix: `seleccionados-${sel.length}` }
    }
    return { list: filteredItems, suffix: `filtrados-${filteredItems.length}` }
  }

  const handleExportExcel = () => {
    const { list, suffix } = getExportTargetItems()
    if (list.length === 0) return
    generateExcelFile(list, {
      sheets: [...ALL_SHEETS],
      columns: visibleColumns,
      filename: `atlas-${suffix}.xlsx`
    })
  }

  const handleExportCsv = () => {
    const { list, suffix } = getExportTargetItems()
    if (list.length === 0) return
    downloadCsvFile(list, visibleColumns, `atlas-${suffix}.csv`)
  }

  const handleExportJson = () => {
    const { list, suffix } = getExportTargetItems()
    if (list.length === 0) return
    downloadJsonBackupFile(list, `atlas-backup-v2-${suffix}.json`)
  }

  const handleInvestigateBatch = async () => {
    setIsInvestigating(true)
    setInvestigateMsg('')
    try {
      const targetIds =
        selectedIds.size > 0
          ? Array.from(selectedIds).slice(0, 20)
          : paginatedItems
              .filter(i => i.outgoingLinks.length > 0 || (i.resources && i.resources.length > 0))
              .slice(0, 12)
              .map(i => i.id)

      const res = await fetch('/api/ai/enrich', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'investigate-batch', ids: targetIds })
      })
      const data = await res.json()
      if (res.ok && data.success) {
        setInvestigateMsg(data.message || 'Investigación de enlaces y GitHub completada.')
        await onRefresh?.()
      }
    } catch {
      setInvestigateMsg('No se pudo completar la investigación en red.')
    } finally {
      setIsInvestigating(false)
    }
  }

  const toggleVisibleColumn = (col: string) => {
    if (visibleColumns.includes(col)) {
      if (visibleColumns.length > 2) {
        setVisibleColumns(visibleColumns.filter(c => c !== col))
      }
    } else {
      setVisibleColumns([...visibleColumns, col])
    }
  }

  const handleResetFilters = () => {
    setSearch('')
    setPlatformFilter('all')
    setTopicFilter('all')
    setResourceTypeFilter('all')
    setAnalysisStateFilter('all')
    setStatusFilter('all')
    setHasMediaOnly(false)
    setHasGitHubOnly(false)
    setCurrentPage(1)
    onClearExternalFilters?.()
  }

  const formatDate = (iso: string) => {
    if (!iso) return '—'
    try {
      const d = new Date(iso)
      if (!Number.isFinite(d.getTime())) return '—'
      return d.toLocaleDateString('es-ES', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      })
    } catch {
      return iso
    }
  }

  const hasActiveFilters =
    search.trim() !== '' ||
    platformFilter !== 'all' ||
    topicFilter !== 'all' ||
    resourceTypeFilter !== 'all' ||
    analysisStateFilter !== 'all' ||
    statusFilter !== 'all' ||
    hasMediaOnly ||
    hasGitHubOnly

  const renderPlatformBadge = (item: BookmarkItem) => {
    if (item.platform === 'github') {
      return (
        <Badge
          variant="outline"
          className="gap-1 font-normal text-[11px] border-cyan-500/40 bg-cyan-950/30 text-cyan-300"
        >
          <Github className="size-2.5" /> GitHub
        </Badge>
      )
    }
    if (item.platform === 'whatsapp') {
      return (
        <Badge
          variant="outline"
          className="gap-1 font-normal text-[11px] border-[#2d5a43] bg-[#162b21] text-[#91d0b4]"
        >
          <MessageCircle className="size-2.5" /> WhatsApp
        </Badge>
      )
    }
    if (item.platform === 'instagram') {
      return (
        <Badge
          variant="outline"
          className="gap-1 font-normal text-[11px] border-[#6f435f] bg-[#38212e] text-[#f2a8d6]"
        >
          <Camera className="size-2.5" /> Instagram
        </Badge>
      )
    }
    return (
      <Badge
        variant="outline"
        className="gap-1 font-normal text-[11px] border-[#49436f] bg-[#222138] text-[#bfb8ff]"
      >
        <XIcon className="size-2.5" /> X
      </Badge>
    )
  }

  const renderAnalysisBadge = (item: BookmarkItem) => {
    const st = item.analysisState || 'completed'
    const label = formatAnalysisStateLabel(st)
    const confirmedGh = (item.resources || []).some(
      r => r.kind === 'github_repo' && r.verificationStatus === 'confirmed'
    )
    if (st === 'completed') {
      return (
        <div className="flex flex-col gap-0.5">
          <Badge className="w-fit border-0 bg-[#1e3329] px-2 py-0.5 text-[10px] font-normal text-[#91d0b4]">
            <CheckCircle2 className="mr-1 size-2.5" />
            {label}
          </Badge>
          {confirmedGh && (
            <span className="text-[10px] text-[#91d0b4]/80">GitHub verificado</span>
          )}
        </div>
      )
    }
    if (st === 'partial') {
      return (
        <div className="flex flex-col gap-0.5">
          <Badge className="w-fit border-0 bg-[#332b1c] px-2 py-0.5 text-[10px] font-normal text-[#f0c982]">
            <Clock className="mr-1 size-2.5" />
            {label}
          </Badge>
          <span className="text-[10px] text-muted-foreground">Texto + candidato</span>
        </div>
      )
    }
    return (
      <Badge variant="outline" className="w-fit text-[10px] font-normal text-muted-foreground">
        {label}
      </Badge>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Encabezado */}
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <p className="mb-1.5 text-xs uppercase tracking-[0.16em] text-[#8e83f2]">
            Tabla Analítica Unificada · Guardado Persistente + Recursos Vinculados
          </p>
          <h1 className="font-serif text-3xl sm:text-4xl tracking-[-0.04em] text-foreground">
            Biblioteca de Guardados y Recursos
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Visualizá qué es cada guardado, para qué sirve, su tipo, repositorios de GitHub y evaluación breve. La tabla exportada (CSV / Excel) conserva exactamente las columnas visibles aquí.
          </p>
        </div>

        {/* Controles superiores: Investigar, Columnas, Exportación rápida, Vista */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={isInvestigating}
            onClick={handleInvestigateBatch}
            className="border-[#49436f] bg-[#1e1c30] text-xs text-[#bfb8ff] hover:bg-[#2a2742]"
            title="Corroborar enlaces salientes y repositorios de GitHub en red"
          >
            <RefreshCw className={`mr-1.5 size-3.5 ${isInvestigating ? 'animate-spin' : ''}`} />
            {isInvestigating ? 'Investigando enlaces...' : 'Investigar recursos / GitHub'}
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowColumnPicker(!showColumnPicker)}
            className="border-border bg-[#16181f] text-xs"
          >
            <Columns className="mr-1.5 size-3.5 text-[#8e83f2]" />
            Columnas ({visibleColumns.length})
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCsv}
            className="border-border bg-[#16181f] text-xs"
            title="Exportar esta misma tabla a CSV (compatible con Excel y Google Sheets)"
          >
            <FileText className="mr-1.5 size-3.5 text-[#91d0b4]" />
            CSV ({selectedIds.size > 0 ? selectedIds.size : filteredItems.length})
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleExportExcel}
            className="border-border bg-[#16181f] text-xs"
            title="Exportar esta misma tabla a libro Excel (.xlsx)"
          >
            <FileSpreadsheet className="mr-1.5 size-3.5 text-[#8e83f2]" />
            Excel ({selectedIds.size > 0 ? selectedIds.size : filteredItems.length})
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleExportJson}
            className="border-border bg-[#16181f] text-xs"
            title="Descargar respaldo JSON versionado (re-importable)"
          >
            <FileJson className="mr-1.5 size-3.5 text-[#f0c982]" />
            JSON v2
          </Button>

          <div className="flex items-center rounded-lg border border-border bg-[#16181f] p-1">
            <button
              onClick={() => setViewMode('table')}
              className={`rounded-md p-1.5 transition-colors ${
                viewMode === 'table' ? 'bg-[#28263b] text-[#bfb8ff]' : 'text-muted-foreground hover:text-foreground'
              }`}
              title="Vista de Tabla"
            >
              <TableIcon className="size-4" />
            </button>
            <button
              onClick={() => setViewMode('cards')}
              className={`rounded-md p-1.5 transition-colors ${
                viewMode === 'cards' ? 'bg-[#28263b] text-[#bfb8ff]' : 'text-muted-foreground hover:text-foreground'
              }`}
              title="Vista de Tarjetas"
            >
              <LayoutGrid className="size-4" />
            </button>
          </div>
        </div>
      </div>

      {investigateMsg && (
        <div className="flex items-center justify-between rounded-lg border border-[#2d4a3e] bg-[#162621] px-4 py-2.5 text-xs text-[#91d0b4]">
          <span>{investigateMsg}</span>
          <button onClick={() => setInvestigateMsg('')} className="text-muted-foreground hover:text-white">
            ✕
          </button>
        </div>
      )}

      {/* Selector de columnas visibles (sincronizado con exportación CSV/XLSX) */}
      {showColumnPicker && (
        <div className="rounded-lg border border-[#35314f] bg-[#161822] p-4 text-xs">
          <div className="mb-2.5 flex items-center justify-between">
            <span className="font-medium text-foreground">
              Columnas visibles en la tabla y al exportar (CSV / XLSX):
            </span>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setVisibleColumns([...TABLE_DEFAULT_COLUMNS])}
                className="text-[#a59cf5] hover:underline"
              >
                Restaurar 8 recomendadas
              </button>
              <button
                onClick={() => setVisibleColumns([...AVAILABLE_COLUMNS])}
                className="text-[#a59cf5] hover:underline"
              >
                Mostrar todas
              </button>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {AVAILABLE_COLUMNS.map(col => {
              const active = visibleColumns.includes(col)
              return (
                <Badge
                  key={col}
                  variant={active ? 'secondary' : 'outline'}
                  onClick={() => toggleVisibleColumn(col)}
                  className={`cursor-pointer gap-1 py-1 text-[11px] ${
                    active
                      ? 'bg-[#29273f] text-[#bfb8ff] hover:bg-[#343252]'
                      : 'border-border text-muted-foreground hover:border-[#7c6cf0]'
                  }`}
                >
                  {active && <Check className="size-3 text-[#91d0b4]" />}
                  <span>{col}</span>
                </Badge>
              )
            })}
          </div>
        </div>
      )}

      {/* Selector de Alcance: Radar Técnico vs Archivos Separados (Fotos / Otros Temas) */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#2c2a42] bg-[#14151e] px-4 py-2.5 text-xs">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 font-medium text-muted-foreground">Criterio de clasificación:</span>
          <button
            type="button"
            onClick={() => {
              setScopeFilter('all')
              setCurrentPage(1)
            }}
            className={`rounded-md px-3 py-1.5 font-medium transition-colors ${
              scopeFilter === 'all'
                ? 'bg-[#28263b] text-[#bfb8ff] border border-[#49436f]'
                : 'text-muted-foreground hover:bg-[#1b1d27] hover:text-foreground'
            }`}
          >
            Todos ({items.length})
          </button>
          <button
            type="button"
            onClick={() => {
              setScopeFilter('radar_tecnico')
              setCurrentPage(1)
            }}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition-colors ${
              scopeFilter === 'radar_tecnico'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                : 'text-muted-foreground hover:bg-[#1b1d27] hover:text-foreground'
            }`}
          >
            <Compass className="size-3.5 text-emerald-400" />
            <span>Radar Técnico: IA, Código & Herramientas ({radarTecnicoCount})</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setScopeFilter('separados')
              setCurrentPage(1)
            }}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition-colors ${
              scopeFilter === 'separados'
                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                : 'text-muted-foreground hover:bg-[#1b1d27] hover:text-foreground'
            }`}
            title="Fotos personales, juegos casuales, deportes, recetas o temas ajenos al trabajo técnico"
          >
            <FolderArchive className="size-3.5 text-rose-400" />
            <span>Archivos Separados / Otros Temas ({separatedCount})</span>
          </button>
        </div>
        <span className="text-[11px] text-muted-foreground">
          Los archivos que no son de IA/programación se apartan en <strong>Archivos Separados</strong> para mantener limpio tu catálogo.
        </span>
      </div>

      {/* Barra de Filtros y Búsqueda */}
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-[#16181f] p-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
          {/* Input de búsqueda + Selector Exacta / Semántica */}
          <div className="flex flex-1 items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={search}
                onChange={e => {
                  setSearch(e.target.value)
                  setCurrentPage(1)
                }}
                placeholder={
                  searchMode === 'semantic'
                    ? 'Búsqueda conceptual (ej: "agentes de programación", "repositorios de voz")...'
                    : 'Buscar por nombre, para qué sirve, repositorio GitHub, autor, tema o texto...'
                }
                className="h-9 w-full rounded-md border border-border bg-[#101217] pl-9 pr-16 text-xs text-foreground placeholder:text-muted-foreground focus:border-[#7c6cf0] focus:outline-none"
              />
              {search && (
                <button
                  onClick={() => {
                    setSearch('')
                    setCurrentPage(1)
                    onClearExternalFilters?.()
                  }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground"
                >
                  Limpiar
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() => {
                setSearchMode(prev => (prev === 'exact' ? 'semantic' : 'exact'))
                setCurrentPage(1)
              }}
              className={`flex h-9 shrink-0 items-center gap-1.5 rounded-md border px-3 text-xs transition-colors ${
                searchMode === 'semantic'
                  ? 'border-[#7c6cf0] bg-[#28263b] text-[#bfb8ff]'
                  : 'border-border bg-[#101217] text-muted-foreground hover:text-foreground'
              }`}
              title="Alternar entre búsqueda exacta FTS5 y búsqueda conceptual"
            >
              <Sparkles className="size-3.5" />
              <span>{searchMode === 'semantic' ? 'Semántica' : 'Exacta'}</span>
            </button>
          </div>

          {/* Filtros selectores */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Origen */}
            <select
              value={platformFilter}
              onChange={e => {
                setPlatformFilter(e.target.value as any)
                setCurrentPage(1)
              }}
              className="h-9 rounded-md border border-border bg-[#101217] px-2.5 text-xs text-foreground focus:border-[#7c6cf0] focus:outline-none"
            >
              <option value="all">Todos los orígenes</option>
              <option value="x">X / Twitter</option>
              <option value="instagram">Instagram</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="github">GitHub</option>
            </select>

            {/* Tipo de Recurso */}
            <select
              value={resourceTypeFilter}
              onChange={e => {
                setResourceTypeFilter(e.target.value as any)
                setCurrentPage(1)
              }}
              className="h-9 max-w-[180px] rounded-md border border-border bg-[#101217] px-2.5 text-xs text-foreground focus:border-[#7c6cf0] focus:outline-none"
            >
              <option value="all">Todos los tipos</option>
              {CANONICAL_RESOURCE_TYPES.map(rt => (
                <option key={rt} value={rt}>
                  {rt}
                </option>
              ))}
            </select>

            {/* Área / Tema */}
            <select
              value={topicFilter}
              onChange={e => {
                setTopicFilter(e.target.value)
                setCurrentPage(1)
              }}
              className="h-9 rounded-md border border-border bg-[#101217] px-2.5 text-xs text-foreground focus:border-[#7c6cf0] focus:outline-none"
            >
              <option value="all">Todas las áreas ({allTopics.length})</option>
              {allTopics.map(t => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>

            {/* Estado del análisis */}
            <select
              value={analysisStateFilter}
              onChange={e => {
                setAnalysisStateFilter(e.target.value as any)
                setCurrentPage(1)
              }}
              className="h-9 rounded-md border border-border bg-[#101217] px-2.5 text-xs text-foreground focus:border-[#7c6cf0] focus:outline-none"
            >
              <option value="all">Cualquier análisis</option>
              <option value="completed">Completado</option>
              <option value="partial">Parcial</option>
              <option value="pending">Pendiente</option>
              <option value="error">Con error</option>
            </select>

            {/* Orden */}
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as any)}
              className="h-9 rounded-md border border-border bg-[#101217] px-2.5 text-xs text-foreground focus:border-[#7c6cf0] focus:outline-none"
            >
              <option value="savedDesc">Más recientes</option>
              <option value="savedAsc">Más antiguos</option>
              <option value="pubDesc">Fecha publicación</option>
            </select>

            {/* Switch Con GitHub */}
            <button
              onClick={() => {
                setHasGitHubOnly(!hasGitHubOnly)
                setCurrentPage(1)
              }}
              className={`flex h-9 items-center gap-1.5 rounded-md border px-2.5 text-xs transition-colors ${
                hasGitHubOnly
                  ? 'border-[#7c6cf0] bg-[#28263b] text-[#bfb8ff]'
                  : 'border-border bg-[#101217] text-muted-foreground hover:text-foreground'
              }`}
            >
              <Github className="size-3.5" />
              <span>Con GitHub</span>
            </button>

            {/* Switch Con media */}
            <button
              onClick={() => {
                setHasMediaOnly(!hasMediaOnly)
                setCurrentPage(1)
              }}
              className={`flex h-9 items-center gap-1.5 rounded-md border px-2.5 text-xs transition-colors ${
                hasMediaOnly
                  ? 'border-[#7c6cf0] bg-[#28263b] text-[#bfb8ff]'
                  : 'border-border bg-[#101217] text-muted-foreground hover:text-foreground'
              }`}
            >
              <ImageIcon className="size-3.5" />
              <span>Media</span>
            </button>

            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleResetFilters}
                className="h-9 text-xs text-[#a59cf5] hover:text-foreground"
              >
                <XClose className="mr-1 size-3.5" /> Quitar filtros
              </Button>
            )}
          </div>
        </div>

        {/* Acciones en lote (si hay seleccionados) */}
        {selectedIds.size > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3 text-xs">
            <span className="font-medium text-[#bfb8ff]">
              {selectedIds.size} elemento{selectedIds.size > 1 ? 's' : ''} seleccionado{selectedIds.size > 1 ? 's' : ''}
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onBulkUpdateReviewed(Array.from(selectedIds), true)}
                className="border-border text-xs"
              >
                <Check className="size-3 mr-1 text-[#91d0b4]" /> Marcar revisados
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportCsv}
                className="border-border text-xs"
              >
                <FileText className="size-3 mr-1 text-[#91d0b4]" /> Exportar selección (CSV)
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportExcel}
                className="border-border text-xs"
              >
                <FileSpreadsheet className="size-3 mr-1 text-[#8e83f2]" /> Exportar selección (Excel)
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  if (confirm(`¿Eliminar ${selectedIds.size} elementos seleccionados?`)) {
                    onBulkDelete(Array.from(selectedIds))
                    setSelectedIds(new Set())
                  }
                }}
                className="text-xs"
              >
                <Trash2 className="size-3 mr-1" /> Eliminar
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Contador de resultados */}
      <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
        <p>
          Mostrando <strong className="text-foreground">{paginatedItems.length}</strong> de{' '}
          <strong className="text-foreground">{filteredItems.length}</strong> filtrados ({items.length} totales en base)
          {search.trim() && searchMode === 'semantic' && (
            <span className="ml-2 text-[#bfb8ff]">· Ordenados por afinidad conceptual</span>
          )}
        </p>
        {filteredItems.length > 0 && (
          <button
            onClick={handleSelectAll}
            className="text-xs text-[#a59cf5] hover:underline"
          >
            {selectedIds.size === filteredItems.length
              ? 'Deseleccionar todos'
              : `Seleccionar los ${filteredItems.length} filtrados`}
          </button>
        )}
      </div>

      {/* Contenido: Modo Tabla Comprensible */}
      {viewMode === 'table' ? (
        <div className="overflow-x-auto rounded-lg border border-border bg-[#16181f]">
          <Table>
            <TableHeader className="bg-[#121318]">
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="w-9 text-center">
                  <input
                    type="checkbox"
                    checked={filteredItems.length > 0 && selectedIds.size === filteredItems.length}
                    onChange={handleSelectAll}
                    className="accent-[#7c6cf0]"
                  />
                </TableHead>
                {visibleColumns.includes('Nombre / recurso') && (
                  <TableHead className="min-w-[220px]">Nombre / recurso</TableHead>
                )}
                {visibleColumns.includes('Para qué sirve') && (
                  <TableHead className="min-w-[260px]">Para qué sirve</TableHead>
                )}
                {visibleColumns.includes('Tipo') && (
                  <TableHead className="w-[155px]">Tipo</TableHead>
                )}
                {visibleColumns.includes('Área / tema') && (
                  <TableHead className="w-[160px]">Área / tema</TableHead>
                )}
                {visibleColumns.includes('Enlaces útiles') && (
                  <TableHead className="min-w-[185px]">Enlaces útiles</TableHead>
                )}
                {visibleColumns.includes('Evaluación breve') && (
                  <TableHead className="min-w-[230px]">Evaluación breve</TableHead>
                )}
                {visibleColumns.includes('Estado del análisis') && (
                  <TableHead className="w-[130px]">Estado del análisis</TableHead>
                )}
                {visibleColumns.includes('Origen') && (
                  <TableHead className="w-[130px]">Origen</TableHead>
                )}
                {visibleColumns.includes('Autor') && (
                  <TableHead className="w-[150px]">Autor</TableHead>
                )}
                {visibleColumns.includes('Notas') && (
                  <TableHead className="min-w-[160px]">Notas</TableHead>
                )}
                {visibleColumns.includes('Texto completo') && (
                  <TableHead className="min-w-[240px]">Texto original</TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedItems.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={visibleColumns.length + 1} className="h-40 text-center text-muted-foreground">
                    No se encontraron guardados con los filtros aplicados.
                  </TableCell>
                </TableRow>
              ) : (
                paginatedItems.map((item: BookmarkItem & { semanticScore?: number }) => {
                  const isSelected = selectedIds.has(item.id)
                  const ghRepos = (item.resources || []).filter(r => r.kind === 'github_repo')
                  const otherLinks = (item.resources || []).filter(r => r.kind !== 'github_repo')

                  return (
                    <TableRow
                      key={item.id}
                      onClick={() => onOpenDetail(item)}
                      className={`cursor-pointer border-border align-top transition-colors hover:bg-[#1f212a] ${
                        isSelected ? 'bg-[#212030]' : ''
                      }`}
                    >
                      <TableCell
                        className="pt-3.5 text-center"
                        onClick={e => handleToggleSelect(item.id, e)}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {}}
                          className="accent-[#7c6cf0]"
                        />
                      </TableCell>

                      {/* 1. Nombre / recurso */}
                      {visibleColumns.includes('Nombre / recurso') && (
                        <TableCell className="max-w-[260px] py-3">
                          <p className="font-medium text-xs leading-snug text-[#f0eef8] line-clamp-2">
                            {item.title || item.caption.slice(0, 75) || item.authorName}
                          </p>
                          <div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                            <span className="truncate font-mono text-[10px] text-[#a59cf5]">
                              {item.authorHandle || item.authorName}
                            </span>
                            {item.reviewed && (
                              <span className="rounded bg-[#21352a] px-1 py-0 text-[9px] text-[#91d0b4]">
                                Revisado
                              </span>
                            )}
                          </div>
                        </TableCell>
                      )}

                      {/* 2. Para qué sirve */}
                      {visibleColumns.includes('Para qué sirve') && (
                        <TableCell className="max-w-[310px] py-3">
                          <p className="text-xs leading-relaxed text-[#d7d4e6] line-clamp-3">
                            {item.purpose || item.aiSummary}
                          </p>
                        </TableCell>
                      )}

                      {/* 3. Tipo */}
                      {visibleColumns.includes('Tipo') && (
                        <TableCell className="py-3">
                          <Badge
                            variant="outline"
                            className="whitespace-normal border-[#3b3759] bg-[#1d1c2b] px-2 py-0.5 text-[10px] font-normal leading-tight text-[#d2ccff]"
                          >
                            {item.resourceType || 'Otro / pendiente de clasificar'}
                          </Badge>
                        </TableCell>
                      )}

                      {/* 4. Área / tema */}
                      {visibleColumns.includes('Área / tema') && (
                        <TableCell className="py-3">
                          <div className="flex flex-wrap gap-1">
                            {typeof item.semanticScore === 'number' && search.trim() && searchMode === 'semantic' && (
                              <Badge
                                variant="outline"
                                className="border-[#35314f] bg-[#1b1a29] px-1.5 py-0 text-[10px] text-[#91d0b4]"
                              >
                                {Math.round(item.semanticScore * 100)}%
                              </Badge>
                            )}
                            {item.topics.slice(0, 3).map((t: string) => (
                              <Badge
                                key={t}
                                variant="secondary"
                                className="bg-[#242632] px-1.5 py-0 text-[10px] font-normal text-[#cfcbef]"
                              >
                                {t}
                              </Badge>
                            ))}
                            {item.topics.length > 3 && (
                              <span className="text-[10px] text-muted-foreground">+{item.topics.length - 3}</span>
                            )}
                          </div>
                        </TableCell>
                      )}

                      {/* 5. Enlaces útiles */}
                      {visibleColumns.includes('Enlaces útiles') && (
                        <TableCell className="max-w-[230px] py-3" onClick={e => e.stopPropagation()}>
                          <div className="flex flex-col gap-1">
                            {ghRepos.slice(0, 2).map(repo => (
                              <div key={repo.id + repo.resolvedUrl} className="flex items-center gap-1">
                                <a
                                  href={repo.resolvedUrl || repo.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex w-fit max-w-[180px] items-center gap-1 rounded border border-[#3a4252] bg-[#161b24] px-2 py-0.5 text-[11px] text-[#91d0b4] hover:border-[#91d0b4]"
                                  title={repo.description || repo.resolvedUrl}
                                >
                                  <Github className="size-3 shrink-0" />
                                  <span className="truncate font-mono text-[10px]">
                                    {repo.fullName || repo.name}
                                  </span>
                                  {repo.verificationStatus === 'confirmed' && (
                                    <Check className="size-2.5 shrink-0 text-[#91d0b4]" />
                                  )}
                                </a>
                                {onOpenRepoInGallery && repo.fullName && (
                                  <button
                                    type="button"
                                    onClick={() => onOpenRepoInGallery(repo.fullName!)}
                                    className="rounded border border-[#453f6e] bg-[#211f34] px-1.5 py-0.5 text-[9px] text-[#c5bfff] hover:bg-[#2c2946]"
                                    title="Ver ficha en Galería Visual de Repositorios"
                                  >
                                    Galería
                                  </button>
                                )}
                              </div>
                            ))}
                            {ghRepos.length > 2 && (
                              <span className="text-[10px] text-[#91d0b4]/80">
                                +{ghRepos.length - 2} repositorios más en ficha
                              </span>
                            )}
                            {otherLinks.slice(0, 2).map(link => (
                              <a
                                key={link.id + link.resolvedUrl}
                                href={link.resolvedUrl || link.url}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex w-fit max-w-full items-center gap-1 text-[11px] text-[#a59cf5] hover:underline"
                              >
                                <ExternalLink className="size-2.5 shrink-0" />
                                <span className="truncate">
                                  {link.kind === 'article'
                                    ? 'Artículo X'
                                    : link.kind === 'docs'
                                    ? `Docs (${link.domain})`
                                    : link.domain || 'Enlace'}
                                </span>
                              </a>
                            ))}
                            {ghRepos.length === 0 &&
                              (() => {
                                const fb = skillBuildFallbackReferenceLink({
                                  sourceUrl: item.sourceUrl,
                                  platform: item.platform,
                                  authorHandle: item.authorHandle,
                                  authorName: item.authorName,
                                  title: item.title,
                                  caption: item.caption,
                                  expandedUrls: item.outgoingLinks || [],
                                  candidateQueries: []
                                })
                                return (
                                  <div className="mt-0.5 flex flex-col gap-1">
                                    {otherLinks.length === 0 && (
                                      <a
                                        href={fb.primaryUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="inline-flex w-fit max-w-full items-center gap-1 text-[11px] text-amber-300 hover:underline"
                                        title={fb.reasonEs}
                                      >
                                        <ExternalLink className="size-2.5 shrink-0" />
                                        <span className="truncate">{fb.primaryLabel}</span>
                                      </a>
                                    )}
                                    <a
                                      href={fb.githubSearchUrl}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="inline-flex w-fit items-center gap-1 rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-200 hover:bg-amber-500/20"
                                      title={`Buscar repositorio en GitHub: "${fb.extractedQuery}"`}
                                    >
                                      <Search className="size-2.5 shrink-0" />
                                      <span>Buscar Repo ({fb.extractedQuery.slice(0, 18)})</span>
                                    </a>
                                  </div>
                                )
                              })()}
                          </div>
                        </TableCell>
                      )}

                      {/* 6. Evaluación breve */}
                      {visibleColumns.includes('Evaluación breve') && (
                        <TableCell className="max-w-[260px] py-3">
                          <p className="text-[11px] leading-relaxed text-muted-foreground line-clamp-3">
                            {item.evaluation || 'Basado en el texto de la publicación.'}
                          </p>
                        </TableCell>
                      )}

                      {/* 7. Estado del análisis */}
                      {visibleColumns.includes('Estado del análisis') && (
                        <TableCell className="py-3">{renderAnalysisBadge(item)}</TableCell>
                      )}

                      {/* 8. Origen */}
                      {visibleColumns.includes('Origen') && (
                        <TableCell className="py-3" onClick={e => e.stopPropagation()}>
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-1.5">
                              {renderPlatformBadge(item)}
                              {item.sourceUrl && item.sourceUrl.startsWith('http') && (
                                <a
                                  href={item.sourceUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-muted-foreground hover:text-foreground"
                                  title="Abrir publicación original"
                                >
                                  <ExternalLink className="size-3" />
                                </a>
                              )}
                            </div>
                            <span className="text-[10px] text-muted-foreground">
                              {formatDate(item.savedAt || item.publishedAt)}
                            </span>
                          </div>
                        </TableCell>
                      )}

                      {/* Columnas opcionales */}
                      {visibleColumns.includes('Autor') && (
                        <TableCell className="py-3 text-xs">
                          <p className="font-medium text-foreground">{item.authorName}</p>
                          <p className="text-[10px] text-muted-foreground">{item.authorHandle}</p>
                        </TableCell>
                      )}

                      {visibleColumns.includes('Notas') && (
                        <TableCell className="max-w-[200px] py-3 text-xs text-[#f0c982]">
                          {item.notes || '—'}
                        </TableCell>
                      )}

                      {visibleColumns.includes('Texto completo') && (
                        <TableCell className="max-w-[280px] py-3 text-xs text-muted-foreground">
                          <p className="line-clamp-3">{item.caption}</p>
                        </TableCell>
                      )}
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>
      ) : (
        /* Contenido: Modo Tarjetas */
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {paginatedItems.map((item: BookmarkItem) => {
            const ghRepos = (item.resources || []).filter(r => r.kind === 'github_repo')
            return (
              <div
                key={item.id}
                onClick={() => onOpenDetail(item)}
                className="flex cursor-pointer flex-col justify-between rounded-lg border border-border bg-[#16181f] p-4 transition-all hover:border-[#7c6cf0]/50 hover:bg-[#1a1c24]"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    {renderPlatformBadge(item)}
                    <Badge
                      variant="outline"
                      className="border-[#3b3759] bg-[#1d1c2b] text-[10px] font-normal text-[#d2ccff]"
                    >
                      {item.resourceType || 'Recurso'}
                    </Badge>
                  </div>

                  <h3 className="mt-3 font-medium text-sm leading-snug text-[#f3f1f8]">
                    {item.title || item.caption.slice(0, 80)}
                  </h3>

                  <p className="mt-2 text-xs leading-relaxed text-[#cfcde0] line-clamp-3">
                    {item.purpose || item.aiSummary}
                  </p>

                  {ghRepos.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5" onClick={e => e.stopPropagation()}>
                      {ghRepos.slice(0, 3).map(repo => (
                        <a
                          key={repo.id + repo.resolvedUrl}
                          href={repo.resolvedUrl || repo.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 rounded border border-[#3a4252] bg-[#161b24] px-2 py-0.5 text-[11px] text-[#91d0b4] hover:border-[#91d0b4]"
                        >
                          <Github className="size-3" />
                          <span className="font-mono text-[10px]">{repo.fullName || repo.name}</span>
                        </a>
                      ))}
                    </div>
                  )}

                  <p className="mt-2.5 text-[11px] text-muted-foreground line-clamp-2">
                    {item.evaluation}
                  </p>
                </div>

                <div className="mt-4 border-t border-border/60 pt-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {item.topics.slice(0, 3).map((t: string) => (
                      <Badge
                        key={t}
                        variant="secondary"
                        className="bg-[#242632] px-2 py-0 text-[10px] text-[#cfcbef]"
                      >
                        {t}
                      </Badge>
                    ))}
                    <span className="ml-auto text-[10px] text-muted-foreground">
                      {item.authorHandle} · {formatDate(item.savedAt || item.publishedAt)}
                    </span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Paginación */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between rounded-lg border border-border bg-[#16181f] px-4 py-3 text-xs">
          <span className="text-muted-foreground">
            Página <strong className="text-foreground">{currentPage}</strong> de{' '}
            <strong className="text-foreground">{totalPages}</strong> ({filteredItems.length} resultados)
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              className="border-border text-xs"
            >
              <ChevronLeft className="mr-1 size-3.5" /> Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              className="border-border text-xs"
            >
              Siguiente <ChevronRight className="ml-1 size-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
