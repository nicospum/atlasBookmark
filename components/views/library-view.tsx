'use client'

import React, { useState, useMemo, useEffect } from 'react'
import {
  Search, LayoutGrid, Table as TableIcon, X as XIcon,
  Camera, Check, Trash2, FileSpreadsheet, Image as ImageIcon, ChevronLeft, ChevronRight, X as XClose, Sparkles
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { BookmarkItem, SourcePlatform } from '@/lib/types'
import { generateExcelFile, AVAILABLE_COLUMNS, ALL_SHEETS } from '@/lib/excel-export'
import { semanticSearchBookmarks } from '@/lib/ai-analyzer'

interface LibraryViewProps {
  items: BookmarkItem[]
  onOpenDetail: (item: BookmarkItem) => void
  onToggleReviewed: (id: string) => void
  onDelete: (id: string) => void
  onBulkUpdateReviewed: (ids: string[], reviewed: boolean) => void
  onBulkDelete: (ids: string[]) => void
  externalTopicFilter?: string | null
  externalAuthorFilter?: string | null
  onClearExternalFilters?: () => void
}

const PAGE_SIZE = 50

export function LibraryView({
  items,
  onOpenDetail,
  onToggleReviewed,
  onDelete,
  onBulkUpdateReviewed,
  onBulkDelete,
  externalTopicFilter,
  externalAuthorFilter,
  onClearExternalFilters
}: LibraryViewProps) {
  const [search, setSearch] = useState('')
  const [searchMode, setSearchMode] = useState<'exact' | 'semantic'>('exact')
  const [platformFilter, setPlatformFilter] = useState<SourcePlatform | 'all'>('all')
  const [topicFilter, setTopicFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'reviewed'>('all')
  const [hasMediaOnly, setHasMediaOnly] = useState(false)
  const [sortBy, setSortBy] = useState<'savedDesc' | 'savedAsc' | 'pubDesc'>('savedDesc')
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [currentPage, setCurrentPage] = useState(1)

  // Sync external filters passed from Resumen / Temas / Fuentes
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

  // Collect all unique topics
  const allTopics = useMemo(() => {
    const set = new Set<string>()
    items.forEach(i => i.topics.forEach(t => set.add(t)))
    return Array.from(set).sort()
  }, [items])

  // Filtered & sorted items
  const filteredItems = useMemo(() => {
    const baseFiltered = items.filter(item => {
      if (platformFilter !== 'all' && item.platform !== platformFilter) return false
      if (topicFilter !== 'all' && !item.topics.includes(topicFilter)) return false
      if (statusFilter === 'pending' && item.reviewed) return false
      if (statusFilter === 'reviewed' && !item.reviewed) return false
      if (hasMediaOnly && (item.mediaType === 'none' || item.mediaUrls.length === 0)) return false
      return true
    })

    if (search.trim()) {
      if (searchMode === 'semantic') {
        return semanticSearchBookmarks(baseFiltered, search.trim())
      }

      const q = search.toLowerCase()
      const exactFiltered = baseFiltered.filter(item => {
        const inCaption = item.caption.toLowerCase().includes(q)
        const inAuthor =
          item.authorName.toLowerCase().includes(q) || item.authorHandle.toLowerCase().includes(q)
        const inTopic = item.topics.some(t => t.toLowerCase().includes(q))
        const inEntity = item.entities.some(e => e.toLowerCase().includes(q))
        const inSummary = item.aiSummary.toLowerCase().includes(q)
        const inCollection = (item.collections || []).some(c => c.toLowerCase().includes(q))
        return inCaption || inAuthor || inTopic || inEntity || inSummary || inCollection
      })

      return exactFiltered.sort((a, b) => {
        if (sortBy === 'savedDesc') return new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime()
        if (sortBy === 'savedAsc') return new Date(a.savedAt).getTime() - new Date(b.savedAt).getTime()
        if (sortBy === 'pubDesc') return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
        return 0
      })
    }

    return [...baseFiltered].sort((a, b) => {
      if (sortBy === 'savedDesc') {
        return new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime()
      }
      if (sortBy === 'savedAsc') {
        return new Date(a.savedAt).getTime() - new Date(b.savedAt).getTime()
      }
      if (sortBy === 'pubDesc') {
        return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
      }
      return 0
    })
  }, [items, platformFilter, topicFilter, statusFilter, hasMediaOnly, search, searchMode, sortBy])

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE))
  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE
    return filteredItems.slice(start, start + PAGE_SIZE)
  }, [filteredItems, currentPage])

  // Selection handlers
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

  const handleExportSelected = () => {
    const selectedItems = items.filter(i => selectedIds.has(i.id))
    if (selectedItems.length === 0) return
    generateExcelFile(selectedItems, {
      sheets: [...ALL_SHEETS],
      columns: AVAILABLE_COLUMNS,
      filename: `atlas-seleccionados-${selectedItems.length}.xlsx`
    })
  }

  const handleResetFilters = () => {
    setSearch('')
    setPlatformFilter('all')
    setTopicFilter('all')
    setStatusFilter('all')
    setHasMediaOnly(false)
    setCurrentPage(1)
    onClearExternalFilters?.()
  }

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString('es-ES', {
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
    statusFilter !== 'all' ||
    hasMediaOnly

  return (
    <div className="flex flex-col gap-6">
      {/* Encabezado */}
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <p className="mb-2 text-xs uppercase tracking-[0.16em] text-[#8e83f2]">Base de Datos Unificada · SQLite FTS5</p>
          <h1 className="font-serif text-3xl sm:text-4xl tracking-[-0.04em] text-foreground">
            Biblioteca de Guardados
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Explora, busca por texto exacto o por concepto semántico y gestiona tus guardados de X e Instagram.
          </p>
        </div>

        {/* Toggle table/cards */}
        <div className="flex items-center gap-2">
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

      {/* Barra de Filtros y Búsqueda */}
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-[#16181f] p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
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
                    ? 'Búsqueda conceptual (ej: "arquitectura de agentes", "interfaces bauhaus")...'
                    : 'Buscar en texto, autor, temas, colecciones, entidades o resumen IA...'
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
              title="Alternar entre búsqueda exacta FTS5 y búsqueda conceptual por similitud semántica"
            >
              <Sparkles className="size-3.5" />
              <span>{searchMode === 'semantic' ? 'Semántica' : 'Exacta'}</span>
            </button>
          </div>

          {/* Filtros selectores */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Fuente */}
            <select
              value={platformFilter}
              onChange={e => {
                setPlatformFilter(e.target.value as any)
                setCurrentPage(1)
              }}
              className="h-9 rounded-md border border-border bg-[#101217] px-3 text-xs text-foreground focus:border-[#7c6cf0] focus:outline-none"
            >
              <option value="all">Todas las fuentes</option>
              <option value="x">Solo X / Twitter</option>
              <option value="instagram">Solo Instagram</option>
            </select>

            {/* Tema */}
            <select
              value={topicFilter}
              onChange={e => {
                setTopicFilter(e.target.value)
                setCurrentPage(1)
              }}
              className="h-9 rounded-md border border-border bg-[#101217] px-3 text-xs text-foreground focus:border-[#7c6cf0] focus:outline-none"
            >
              <option value="all">Todos los temas ({allTopics.length})</option>
              {allTopics.map(t => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>

            {/* Estado */}
            <select
              value={statusFilter}
              onChange={e => {
                setStatusFilter(e.target.value as any)
                setCurrentPage(1)
              }}
              className="h-9 rounded-md border border-border bg-[#101217] px-3 text-xs text-foreground focus:border-[#7c6cf0] focus:outline-none"
            >
              <option value="all">Cualquier estado</option>
              <option value="pending">Solo pendientes</option>
              <option value="reviewed">Solo revisados</option>
            </select>

            {/* Orden */}
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as any)}
              className="h-9 rounded-md border border-border bg-[#101217] px-3 text-xs text-foreground focus:border-[#7c6cf0] focus:outline-none"
            >
              <option value="savedDesc">Guardados más recientes</option>
              <option value="savedAsc">Guardados más antiguos</option>
              <option value="pubDesc">Publicación original</option>
            </select>

            {/* Switch con media */}
            <button
              onClick={() => {
                setHasMediaOnly(!hasMediaOnly)
                setCurrentPage(1)
              }}
              className={`flex h-9 items-center gap-1.5 rounded-md border px-3 text-xs transition-colors ${
                hasMediaOnly
                  ? 'border-[#7c6cf0] bg-[#28263b] text-[#bfb8ff]'
                  : 'border-border bg-[#101217] text-muted-foreground hover:text-foreground'
              }`}
            >
              <ImageIcon className="size-3.5" />
              <span>Con media</span>
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
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onBulkUpdateReviewed(Array.from(selectedIds), true)}
                className="border-border text-xs"
              >
                <Check className="size-3 mr-1 text-[#91d0b4]" /> Marcar como revisados
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportSelected}
                className="border-border text-xs"
              >
                <FileSpreadsheet className="size-3 mr-1 text-[#8e83f2]" /> Exportar selección a Excel
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
          <strong className="text-foreground">{filteredItems.length}</strong> filtrados ({items.length} totales)
          {search.trim() && searchMode === 'semantic' && (
            <span className="ml-2 text-[#bfb8ff]">· Ordenados por afinidad conceptual</span>
          )}
        </p>
        {filteredItems.length > 0 && (
          <button
            onClick={handleSelectAll}
            className="text-xs text-[#a59cf5] hover:underline"
          >
            {selectedIds.size === filteredItems.length ? 'Deseleccionar todos' : 'Seleccionar todos en vista'}
          </button>
        )}
      </div>

      {/* Contenido: Modo Tabla */}
      {viewMode === 'table' ? (
        <div className="overflow-hidden rounded-lg border border-border bg-[#16181f]">
          <Table>
            <TableHeader className="bg-[#121318]">
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="w-10 text-center">
                  <input
                    type="checkbox"
                    checked={filteredItems.length > 0 && selectedIds.size === filteredItems.length}
                    onChange={handleSelectAll}
                    className="accent-[#7c6cf0]"
                  />
                </TableHead>
                <TableHead className="w-[110px]">Fuente</TableHead>
                <TableHead className="w-[180px]">Autor</TableHead>
                <TableHead>Contenido / Texto</TableHead>
                <TableHead className="w-[190px]">Temas</TableHead>
                <TableHead className="w-[110px]">Guardado</TableHead>
                <TableHead className="w-[80px] text-right">Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedItems.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-40 text-center text-muted-foreground">
                    No se encontraron guardados con los filtros aplicados.
                  </TableCell>
                </TableRow>
              ) : (
                paginatedItems.map((item: any) => {
                  const isSelected = selectedIds.has(item.id)
                  return (
                    <TableRow
                      key={item.id}
                      onClick={() => onOpenDetail(item)}
                      className={`cursor-pointer border-border transition-colors hover:bg-[#1f212a] ${
                        isSelected ? 'bg-[#212030]' : ''
                      }`}
                    >
                      <TableCell
                        className="text-center"
                        onClick={e => handleToggleSelect(item.id, e)}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {}}
                          className="accent-[#7c6cf0]"
                        />
                      </TableCell>

                      {/* Fuente */}
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={`gap-1 font-normal text-[11px] ${
                            item.platform === 'x'
                              ? 'border-[#49436f] bg-[#222138] text-[#bfb8ff]'
                              : 'border-[#6f435f] bg-[#38212e] text-[#f2a8d6]'
                          }`}
                        >
                          {item.platform === 'x' ? (
                            <>
                              <XIcon className="size-2.5" /> X
                            </>
                          ) : (
                            <>
                              <Camera className="size-2.5" /> IG
                            </>
                          )}
                        </Badge>
                      </TableCell>

                      {/* Autor */}
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {item.authorAvatar ? (
                            <img
                              src={item.authorAvatar}
                              alt={item.authorName}
                              className="size-6 rounded-full object-cover"
                            />
                          ) : (
                            <div className="grid size-6 place-items-center rounded-full bg-[#353743] text-[10px]">
                              {item.authorName.slice(0, 1)}
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="truncate text-xs font-medium text-foreground">{item.authorName}</p>
                            <p className="truncate text-[10px] text-muted-foreground">{item.authorHandle}</p>
                          </div>
                        </div>
                      </TableCell>

                      {/* Texto */}
                      <TableCell className="max-w-[380px]">
                        <p className="truncate font-serif text-xs text-[#dcd9e8]">
                          {item.caption}
                        </p>
                        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                          {item.aiSummary}
                        </p>
                      </TableCell>

                      {/* Temas */}
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {typeof item.semanticScore === 'number' && search.trim() && searchMode === 'semantic' && (
                            <Badge
                              variant="outline"
                              className="border-[#35314f] bg-[#1b1a29] px-1.5 py-0 text-[10px] text-[#91d0b4]"
                            >
                              {Math.round(item.semanticScore * 100)}%
                            </Badge>
                          )}
                          {item.topics.slice(0, 2).map((t: string) => (
                            <Badge
                              key={t}
                              variant="secondary"
                              className="bg-[#242632] px-1.5 py-0 text-[10px] font-normal text-[#cfcbef]"
                            >
                              {t}
                            </Badge>
                          ))}
                          {item.topics.length > 2 && (
                            <span className="text-[10px] text-muted-foreground">
                              +{item.topics.length - 2}
                            </span>
                          )}
                        </div>
                      </TableCell>

                      {/* Fecha guardado */}
                      <TableCell className="text-xs text-muted-foreground">
                        {formatDate(item.savedAt)}
                      </TableCell>

                      {/* Estado */}
                      <TableCell className="text-right">
                        <span
                          className={`inline-block size-2 rounded-full ${
                            item.reviewed ? 'bg-[#91d0b4]' : 'bg-[#e5a95f]'
                          }`}
                          title={item.reviewed ? 'Revisado' : 'Pendiente'}
                        />
                      </TableCell>
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
          {paginatedItems.map((item: any) => (
            <div
              key={item.id}
              onClick={() => onOpenDetail(item)}
              className="flex cursor-pointer flex-col justify-between rounded-lg border border-border bg-[#16181f] p-4 transition-all hover:border-[#7c6cf0]/50 hover:bg-[#1a1c24]"
            >
              <div>
                <div className="flex items-center justify-between">
                  <Badge
                    variant="outline"
                    className={`gap-1 text-[11px] font-normal ${
                      item.platform === 'x'
                        ? 'border-[#49436f] text-[#bfb8ff]'
                        : 'border-[#6f435f] text-[#f2a8d6]'
                    }`}
                  >
                    {item.platform === 'x' ? <XIcon className="size-2.5" /> : <Camera className="size-2.5" />}
                    {item.platform === 'x' ? 'X / Twitter' : 'Instagram'}
                  </Badge>

                  <span
                    className={`size-2 rounded-full ${item.reviewed ? 'bg-[#91d0b4]' : 'bg-[#e5a95f]'}`}
                    title={item.reviewed ? 'Revisado' : 'Pendiente'}
                  />
                </div>

                <div className="mt-3 flex items-center gap-2">
                  {item.authorAvatar ? (
                    <img
                      src={item.authorAvatar}
                      alt={item.authorName}
                      className="size-7 rounded-full object-cover"
                    />
                  ) : (
                    <div className="grid size-7 place-items-center rounded-full bg-[#353743] text-xs">
                      {item.authorName.slice(0, 1)}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium text-foreground">{item.authorName}</p>
                    <p className="truncate text-[10px] text-muted-foreground">{item.authorHandle}</p>
                  </div>
                </div>

                <p className="mt-3 font-serif text-sm leading-relaxed line-clamp-3 text-[#eae7f5]">
                  {item.caption}
                </p>

                {item.mediaUrls && item.mediaUrls.length > 0 && (
                  <div className="mt-3 overflow-hidden rounded-md border border-border">
                    <img
                      src={item.mediaUrls[0]}
                      alt="Media"
                      className="h-32 w-full object-cover"
                    />
                  </div>
                )}
              </div>

              <div className="mt-4 border-t border-border/60 pt-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  {item.topics.map((t: string) => (
                    <Badge
                      key={t}
                      variant="secondary"
                      className="bg-[#242632] px-2 py-0 text-[10px] text-[#cfcbef]"
                    >
                      {t}
                    </Badge>
                  ))}
                  <span className="ml-auto text-[10px] text-muted-foreground">
                    {formatDate(item.savedAt)}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Paginación */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between rounded-lg border border-border bg-[#16181f] px-4 py-3 text-xs">
          <span className="text-muted-foreground">
            Página <strong className="text-foreground">{currentPage}</strong> de{' '}
            <strong className="text-foreground">{totalPages}</strong>
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
