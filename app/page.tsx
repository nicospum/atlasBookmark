'use client'

import React, { useState, useEffect, useCallback } from 'react'
import {
  Archive, Menu, Search, RefreshCw
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Sidebar } from '@/components/sidebar'
import { DetailSheet } from '@/components/detail-sheet'
import { OverviewView } from '@/components/views/overview-view'
import { LibraryView } from '@/components/views/library-view'
import { TopicsView } from '@/components/views/topics-view'
import { SourcesView } from '@/components/views/sources-view'
import { ExportView } from '@/components/views/export-view'
import { CaptureView } from '@/components/views/capture-view'
import { BookmarkItem, ImportHistoryEntry } from '@/lib/types'

export default function AtlasApp() {
  const [active, setActive] = useState('Resumen')
  const [bookmarks, setBookmarks] = useState<BookmarkItem[]>([])
  const [importHistory, setImportHistory] = useState<ImportHistoryEntry[]>([])
  const [selectedDetailItem, setSelectedDetailItem] = useState<BookmarkItem | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [selectedTopicFilter, setSelectedTopicFilter] = useState<string | null>(null)
  const [selectedAuthorFilter, setSelectedAuthorFilter] = useState<string | null>(null)

  // Fetch bookmarks & history from SQLite API
  const refreshBookmarks = useCallback(async () => {
    try {
      const res = await fetch('/api/bookmarks')
      if (res.ok) {
        const data = await res.json()
        if (data.success && Array.isArray(data.items)) {
          setBookmarks(data.items)
          setSelectedDetailItem(prev => {
            if (!prev) return null
            return data.items.find((b: BookmarkItem) => b.id === prev.id) || prev
          })
        }
        if (Array.isArray(data.history)) {
          setImportHistory(data.history)
        }
      }
    } catch (e) {
      console.error('Error cargando bookmarks de SQLite:', e)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    refreshBookmarks()
  }, [refreshBookmarks])

  // Handlers for modifying bookmarks
  const handleOpenDetail = (item: BookmarkItem) => {
    setSelectedDetailItem(item)
    setDetailOpen(true)
  }

  const handleToggleReviewed = async (id: string) => {
    const current = bookmarks.find(b => b.id === id)
    if (!current) return
    const nextReviewed = !current.reviewed

    setBookmarks(prev => prev.map(b => (b.id === id ? { ...b, reviewed: nextReviewed } : b)))
    if (selectedDetailItem && selectedDetailItem.id === id) {
      setSelectedDetailItem(prev => (prev ? { ...prev, reviewed: nextReviewed } : null))
    }

    try {
      await fetch(`/api/bookmarks/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reviewed: nextReviewed })
      })
    } catch (err) {
      console.error('Error actualizando estado de revisión:', err)
    }
  }

  const handleAddTopic = async (id: string, topic: string) => {
    const current = bookmarks.find(b => b.id === id)
    if (!current || current.topics.includes(topic)) return
    const nextTopics = [...current.topics, topic]

    setBookmarks(prev => prev.map(b => (b.id === id ? { ...b, topics: nextTopics } : b)))
    if (selectedDetailItem && selectedDetailItem.id === id) {
      setSelectedDetailItem(prev => (prev ? { ...prev, topics: nextTopics } : null))
    }

    try {
      await fetch(`/api/bookmarks/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topics: nextTopics })
      })
    } catch (err) {
      console.error('Error añadiendo tema:', err)
    }
  }

  const handleRemoveTopic = async (id: string, topic: string) => {
    const current = bookmarks.find(b => b.id === id)
    if (!current) return
    const nextTopics = current.topics.filter(t => t !== topic)

    setBookmarks(prev => prev.map(b => (b.id === id ? { ...b, topics: nextTopics } : b)))
    if (selectedDetailItem && selectedDetailItem.id === id) {
      setSelectedDetailItem(prev => (prev ? { ...prev, topics: nextTopics } : null))
    }

    try {
      await fetch(`/api/bookmarks/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topics: nextTopics })
      })
    } catch (err) {
      console.error('Error eliminando tema:', err)
    }
  }

  const handleDeleteBookmark = async (id: string) => {
    setBookmarks(prev => prev.filter(b => b.id !== id))
    if (selectedDetailItem?.id === id) {
      setSelectedDetailItem(null)
      setDetailOpen(false)
    }

    try {
      await fetch(`/api/bookmarks/${id}`, { method: 'DELETE' })
    } catch (err) {
      console.error('Error borrando guardado:', err)
    }
  }

  const handleAnalyzeBookmark = async (id: string): Promise<string | undefined> => {
    try {
      const res = await fetch('/api/ai/enrich', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, fetchExternal: true })
      })
      const data = await res.json()
      if (res.ok && data.success) {
        await refreshBookmarks()
        if (data.item) {
          setSelectedDetailItem(data.item)
        }
        return data.degradationNotice
      }
    } catch (err) {
      console.error('Error enriqueciendo guardado con IA:', err)
    }
    return undefined
  }

  const handleReclassifyAll = async (): Promise<string | undefined> => {
    try {
      const res = await fetch('/api/ai/enrich', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reclassify-all', reclassifyAll: true })
      })
      const data = await res.json()
      if (res.ok && data.success) {
        await refreshBookmarks()
        return data.message
      }
    } catch (err) {
      console.error('Error reclasificando archivo:', err)
    }
    return undefined
  }

  const handleEnrichBatch = async (): Promise<string | undefined> => {
    try {
      const res = await fetch('/api/ai/enrich', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'enrich-batch', batch: true })
      })
      const data = await res.json()
      if (res.ok && data.success) {
        await refreshBookmarks()
        return data.message
      }
    } catch (err) {
      console.error('Error enriqueciendo lote con IA:', err)
    }
    return undefined
  }

  const handleBulkUpdateReviewed = async (ids: string[], reviewed: boolean) => {
    const idSet = new Set(ids)
    setBookmarks(prev => prev.map(b => (idSet.has(b.id) ? { ...b, reviewed } : b)))

    try {
      await fetch('/api/bookmarks', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, reviewed })
      })
    } catch (err) {
      console.error('Error en actualización masiva de revisados:', err)
    }
  }

  const handleBulkDelete = async (ids: string[]) => {
    const idSet = new Set(ids)
    setBookmarks(prev => prev.filter(b => !idSet.has(b.id)))

    try {
      await fetch('/api/bookmarks', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids })
      })
    } catch (err) {
      console.error('Error en borrado masivo:', err)
    }
  }

  const handleSelectTopic = (topic: string) => {
    setSelectedAuthorFilter(null)
    setSelectedTopicFilter(topic)
    setActive('Biblioteca')
  }

  const handleSelectAuthor = (authorHandle: string) => {
    setSelectedTopicFilter(null)
    setSelectedAuthorFilter(authorHandle)
    setActive('Biblioteca')
  }

  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-[#7c6cf0]/30 selection:text-white">
      {/* Sidebar fijo para escritorio */}
      <Sidebar
        active={active}
        setActive={setActive}
        totalCount={bookmarks.length}
      />

      <main className="min-h-screen lg:pl-[248px]">
        <div className="mx-auto max-w-[1440px] px-5 py-6 sm:px-8 lg:px-10">
          {/* Header Mobile */}
          <div className="mb-6 flex items-center justify-between border-b border-border/60 pb-4 lg:hidden">
            <div className="flex items-center gap-2">
              <div className="grid size-8 place-items-center rounded-lg bg-[#7c6cf0] text-white">
                <Archive className="size-4" />
              </div>
              <span className="font-serif text-lg font-medium">Atlas de Guardados</span>
            </div>

            <div className="flex items-center gap-2">
              <Badge variant="outline" className="border-border text-xs">
                {bookmarks.length}
              </Badge>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              >
                <Menu className="size-5" />
              </Button>
            </div>
          </div>

          {/* Menú desplegable Mobile */}
          {mobileMenuOpen && (
            <div className="mb-6 flex flex-col gap-1 rounded-lg border border-border bg-[#16181f] p-3 lg:hidden">
              {['Resumen', 'Biblioteca', 'Temas', 'Fuentes', 'Exportar', 'Captura'].map(name => (
                <button
                  key={name}
                  onClick={() => {
                    setActive(name)
                    setMobileMenuOpen(false)
                  }}
                  className={`rounded-md px-3 py-2 text-left text-xs font-medium ${
                    active === name ? 'bg-[#28263b] text-[#bfb8ff]' : 'text-muted-foreground'
                  }`}
                >
                  {name}
                </button>
              ))}
            </div>
          )}

          {/* Barra superior de navegación / migas */}
          <div className="mb-8 flex items-center justify-between border-b border-border pb-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="text-foreground">Archivo Unificado Legacy</span>
              <span>/</span>
              <span className="text-[#8e83f2] font-medium">{active}</span>
            </div>

            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="xs"
                onClick={refreshBookmarks}
                className="text-xs text-muted-foreground hover:text-foreground"
                title="Actualizar datos desde SQLite"
              >
                <RefreshCw className={`size-3 mr-1 ${isLoading ? 'animate-spin' : ''}`} /> Refrescar DB
              </Button>

              <button
                onClick={() => setActive('Biblioteca')}
                className="hidden items-center gap-1.5 rounded-md border border-border bg-[#16181f] px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground sm:flex"
              >
                <Search className="size-3.5" />
                <span>Buscar en archivo...</span>
              </button>

              <Badge
                variant="outline"
                className="gap-1.5 border-[#35314f] bg-[#161822] text-[#a59cf5] text-xs font-normal"
              >
                <span className="size-1.5 rounded-full bg-[#91d0b4]" />
                <span>SQLite: atlas.db · {bookmarks.length} guardados</span>
              </Badge>
            </div>
          </div>

          {/* Renderizado de vistas */}
          {active === 'Resumen' && (
            <OverviewView
              items={bookmarks}
              onOpenDetail={handleOpenDetail}
              onNavigate={setActive}
              onSync={() => setActive('Captura')}
              onSelectTopic={handleSelectTopic}
            />
          )}

          {active === 'Biblioteca' && (
            <LibraryView
              items={bookmarks}
              onOpenDetail={handleOpenDetail}
              onToggleReviewed={handleToggleReviewed}
              onDelete={handleDeleteBookmark}
              onBulkUpdateReviewed={handleBulkUpdateReviewed}
              onBulkDelete={handleBulkDelete}
              externalTopicFilter={selectedTopicFilter}
              externalAuthorFilter={selectedAuthorFilter}
              onClearExternalFilters={() => {
                setSelectedTopicFilter(null)
                setSelectedAuthorFilter(null)
              }}
            />
          )}

          {active === 'Temas' && (
            <TopicsView
              items={bookmarks}
              onSelectTopic={handleSelectTopic}
              onOpenDetail={handleOpenDetail}
              onReclassifyAll={handleReclassifyAll}
              onEnrichBatch={handleEnrichBatch}
              onRefresh={refreshBookmarks}
            />
          )}

          {active === 'Fuentes' && (
            <SourcesView
              items={bookmarks}
              onSelectAuthor={handleSelectAuthor}
              onOpenDetail={handleOpenDetail}
            />
          )}

          {active === 'Exportar' && (
            <ExportView items={bookmarks} />
          )}

          {active === 'Captura' && (
            <CaptureView
              onRefresh={refreshBookmarks}
              onNavigateLibrary={() => setActive('Biblioteca')}
              totalCount={bookmarks.length}
              history={importHistory}
            />
          )}
        </div>
      </main>

      {/* Slide-over panel de detalle */}
      <DetailSheet
        item={selectedDetailItem}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onToggleReviewed={handleToggleReviewed}
        onAddTopic={handleAddTopic}
        onRemoveTopic={handleRemoveTopic}
        onDelete={handleDeleteBookmark}
        onAnalyze={handleAnalyzeBookmark}
        onRefresh={refreshBookmarks}
      />
    </div>
  )
}
