'use client'

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Archive, Menu, Search, RefreshCw, AlertTriangle, Bot, Sliders
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Sidebar } from '@/components/sidebar'
import { DetailSheet } from '@/components/detail-sheet'
import { CommandPalette } from '@/components/command-palette'
import { CustomizationDrawer } from '@/components/customization-drawer'
import { GlobalAgentChat } from '@/components/global-agent-chat'
import { OverviewView } from '@/components/views/overview-view'
import { LibraryView } from '@/components/views/library-view'
import { ReposView } from '@/components/views/repos-view'
import { TopicsView } from '@/components/views/topics-view'
import { SourcesView } from '@/components/views/sources-view'
import { ExportView } from '@/components/views/export-view'
import { CaptureView } from '@/components/views/capture-view'
import { ReposSkillsExcelTable } from '@/components/repos-skills-excel-table'
import {
  AgentSectionContext,
  AgentToolExecutionResult,
  AtlasCustomizationConfig,
  BookmarkItem,
  ImportHistoryEntry,
  StorageDiagnostics
} from '@/lib/types'
import { applyDurableClientStateToBookmarks } from '@/lib/client-persistence'
import {
  DEFAULT_CUSTOMIZATION_CONFIG,
  loadCustomizationConfig,
  saveCustomizationConfig,
  applyCustomizationPatch,
  THEME_ACCENT_PALETTES
} from '@/lib/customization-store'
import {
  generateExcelFile,
  downloadCsvFile,
  downloadJsonBackupFile,
  TABLE_DEFAULT_COLUMNS,
  ALL_SHEETS
} from '@/lib/excel-export'

export default function AtlasApp() {
  const [active, setActive] = useState('Resumen')
  const [bookmarks, setBookmarks] = useState<BookmarkItem[]>([])
  const [reposCount, setReposCount] = useState<number>(0)
  const [selectedRepoFullName, setSelectedRepoFullName] = useState<string | null>(null)
  const [importHistory, setImportHistory] = useState<ImportHistoryEntry[]>([])
  const [storageDiag, setStorageDiag] = useState<StorageDiagnostics | null>(null)
  const [apiError, setApiError] = useState<string | null>(null)
  const [selectedDetailItem, setSelectedDetailItem] = useState<BookmarkItem | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [selectedTopicFilter, setSelectedTopicFilter] = useState<string | null>(null)
  const [selectedAuthorFilter, setSelectedAuthorFilter] = useState<string | null>(null)
  const [customization, setCustomization] = useState<AtlasCustomizationConfig>(
    DEFAULT_CUSTOMIZATION_CONFIG
  )
  const [customizationDrawerOpen, setCustomizationDrawerOpen] = useState(false)
  const [agentChatOpen, setAgentChatOpen] = useState(false)

  useEffect(() => {
    setCustomization(loadCustomizationConfig())
  }, [])

  // Fetch bookmarks & history from SQLite API
  const refreshBookmarks = useCallback(async () => {
    setIsLoading(true)
    setApiError(null)
    try {
      const res = await fetch('/api/bookmarks')
      const data = await res.json().catch(() => null)
      if (res.ok && data) {
        if (data.success && Array.isArray(data.items)) {
          const mergedItems = applyDurableClientStateToBookmarks(data.items)
          setBookmarks(mergedItems)
          setSelectedDetailItem(prev => {
            if (!prev) return null
            return mergedItems.find((b: BookmarkItem) => b.id === prev.id) || prev
          })
          // Guardar snapshot de seguridad en el navegador por si el entorno en nube es efímero
          if (typeof window !== 'undefined' && data.items.length > 0) {
            try {
              localStorage.setItem(
                'atlas_browser_backup_v2',
                JSON.stringify({
                  savedAt: new Date().toISOString(),
                  count: data.items.length,
                  items: data.items.slice(0, 250)
                })
              )
            } catch {
              // Ignorar límite de cuota de localStorage
            }
          }
        }
        if (Array.isArray(data.history)) {
          setImportHistory(data.history)
        }
        if (data.stats?.storage) {
          setStorageDiag(data.stats.storage)
        }
        if (typeof data.stats?.totalGalleryRepos === 'number') {
          setReposCount(data.stats.totalGalleryRepos)
        }
      } else {
        setApiError(data?.error || `Error HTTP ${res.status} al consultar /api/bookmarks`)
      }
    } catch (e) {
      console.error('Error cargando bookmarks de SQLite:', e)
      setApiError('No se pudo conectar con /api/bookmarks. Verifica el servidor local.')
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

  const handleOpenRepoInGallery = (repoFullName: string) => {
    setDetailOpen(false)
    setSelectedRepoFullName(repoFullName)
    setActive('Repositorios')
  }

  const handleChangeCustomization = (next: AtlasCustomizationConfig) => {
    setCustomization(next)
    saveCustomizationConfig(next)
  }

  const handleUpdateCustomizationPatch = (patch: Partial<AtlasCustomizationConfig>) => {
    setCustomization(prev => applyCustomizationPatch(prev, patch))
  }

  const handleExecuteClientEffects = useCallback(
    async (effects: NonNullable<AgentToolExecutionResult['clientEffects']>) => {
      if (effects.customizationPatch) {
        setCustomization(prev => applyCustomizationPatch(prev, effects.customizationPatch!))
      }
      if (effects.openCustomizationDrawer) {
        setCustomizationDrawerOpen(true)
      }
      if (effects.filterTopic !== undefined) {
        setSelectedTopicFilter(effects.filterTopic)
      }
      if (effects.filterAuthor !== undefined) {
        setSelectedAuthorFilter(effects.filterAuthor)
      }
      if (effects.openRepoFullName) {
        setDetailOpen(false)
        setSelectedRepoFullName(effects.openRepoFullName)
        setActive('Repositorios')
      } else if (effects.navigateTo) {
        setActive(effects.navigateTo)
      }
      if (effects.refreshData) {
        await refreshBookmarks()
      }
      if (effects.openBookmarkId) {
        const found = bookmarks.find(b => b.id === effects.openBookmarkId)
        if (found) {
          setSelectedDetailItem(found)
          setDetailOpen(true)
        }
      }
      if (effects.triggerExportFormat) {
        if (effects.triggerExportFormat === 'xlsx') {
          generateExcelFile(
            bookmarks,
            ALL_SHEETS,
            TABLE_DEFAULT_COLUMNS,
            `atlas_catalogo_maestro_${new Date().toISOString().slice(0, 10)}.xlsx`
          )
        } else if (effects.triggerExportFormat === 'csv') {
          downloadCsvFile(
            bookmarks,
            TABLE_DEFAULT_COLUMNS,
            `atlas_guardados_${new Date().toISOString().slice(0, 10)}.csv`
          )
        } else if (effects.triggerExportFormat === 'json') {
          downloadJsonBackupFile(
            bookmarks,
            `atlas_backup_${new Date().toISOString().slice(0, 10)}.json`
          )
        }
      }
    },
    [bookmarks, refreshBookmarks]
  )

  const sectionContext: AgentSectionContext = useMemo(() => {
    const separatedCount = bookmarks.filter(
      b => b.resourceType === 'Archivo separado / Otro tema (No técnico)'
    ).length
    const fallbackLinksCount = bookmarks.filter(b =>
      (b.resources || []).some(r => r.id?.startsWith('fallback_ref:'))
    ).length
    return {
      activeSection: active,
      selectedTopicFilter,
      selectedAuthorFilter,
      selectedBookmarkId: selectedDetailItem?.id || null,
      selectedBookmarkTitle: selectedDetailItem?.title || null,
      selectedRepoFullName,
      totalBookmarks: bookmarks.length,
      totalRepos: reposCount || 263,
      separatedCount,
      fallbackLinksCount
    }
  }, [
    active,
    selectedTopicFilter,
    selectedAuthorFilter,
    selectedDetailItem,
    selectedRepoFullName,
    bookmarks,
    reposCount
  ])

  const accentPalette = THEME_ACCENT_PALETTES[customization.themeAccent || 'violet']

  return (
    <div
      className={`min-h-screen bg-background text-foreground selection:bg-[#7c6cf0]/30 selection:text-white ${
        customization.layoutDensity === 'compact'
          ? 'text-[13px]'
          : customization.layoutDensity === 'comfortable'
          ? 'leading-relaxed'
          : ''
      }`}
    >
      {/* Sidebar fijo para escritorio */}
      <Sidebar
        active={active}
        setActive={setActive}
        totalCount={bookmarks.length}
        reposCount={reposCount}
        visibleSections={customization.visibleSections}
        themeAccent={customization.themeAccent}
        onOpenAgentChat={() => setAgentChatOpen(true)}
        onOpenCustomization={() => setCustomizationDrawerOpen(true)}
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
              {['Resumen', 'Biblioteca', 'Repositorios', 'Temas', 'Fuentes', 'Exportar', 'Captura', 'TablaReposSkills'].map(name => (
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
                  {name === 'TablaReposSkills' ? 'Tabla Repos & Skills' : name}
                </button>
              ))}
            </div>
          )}

          {/* Barra superior de navegación / migas */}
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="text-foreground">Archivo Unificado Legacy</span>
              <span>/</span>
              <span className="text-[#8e83f2] font-medium">{active}</span>
            </div>

            <div className="flex flex-wrap items-center gap-3">
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
                onClick={() => setCustomizationDrawerOpen(true)}
                className="flex items-center gap-1.5 rounded-md border border-border bg-[#16181f] px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-[#7c6cf0]/50 hover:text-foreground"
                title="Herramientas de Customización (Apariencia, Columnas, Reglas Off-Topic y Permisos)"
              >
                <Sliders className="size-3.5 text-[#a59cf5]" />
                <span>Customizar</span>
              </button>

              <button
                onClick={() => setAgentChatOpen(!agentChatOpen)}
                style={{
                  backgroundColor: accentPalette.badgeBg,
                  color: accentPalette.badgeText,
                  borderColor: accentPalette.border
                }}
                className="flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-opacity hover:opacity-90"
                title="Abrir Chat Agéntico Global con Hermes, Gemini, Claude y ChatGPT (Ctrl+J)"
              >
                <Bot className="size-3.5" />
                <span>Chat Agéntico (Hermes)</span>
                <kbd className="rounded bg-black/30 px-1.5 py-0.2 text-[10px]">Ctrl+J</kbd>
              </button>

              <button
                onClick={() => setCommandPaletteOpen(true)}
                className="flex items-center gap-2 rounded-md border border-border bg-[#16181f] px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-[#7c6cf0]/50 hover:text-foreground"
                title="Abrir Paleta de Comandos y Búsqueda Global (Ctrl+K)"
              >
                <Search className="size-3.5 text-[#a59cf5]" />
                <span>Buscar en archivo o repos...</span>
                <kbd className="rounded border border-border bg-[#101218] px-1.5 py-0.2 text-[10px] text-muted-foreground">
                  Ctrl+K
                </kbd>
              </button>

              <Badge
                variant="outline"
                title={storageDiag?.warning || 'Base de datos SQLite local persistente sincronizada con archive.json'}
                className={`gap-1.5 text-xs font-normal ${
                  storageDiag?.isEphemeralFallback
                    ? 'border-[#5a4822] bg-[#241e14] text-[#e3c08d]'
                    : 'border-[#35314f] bg-[#161822] text-[#a59cf5]'
                }`}
              >
                <span
                  className={`size-1.5 rounded-full ${
                    storageDiag?.isEphemeralFallback ? 'bg-[#e3c08d]' : 'bg-[#91d0b4]'
                  }`}
                />
                <span>
                  {storageDiag?.isEphemeralFallback
                    ? `SQLite Efímero (/tmp) · ${bookmarks.length} guardados`
                    : `SQLite Local: atlas.db · ${bookmarks.length} guardados`}
                </span>
              </Badge>
            </div>
          </div>

          {/* Aviso de error de API o almacenamiento efímero */}
          {apiError && (
            <div className="mb-6 flex items-center justify-between gap-3 rounded-lg border border-red-500/40 bg-red-950/30 px-4 py-3 text-xs text-red-200">
              <div className="flex items-center gap-2">
                <AlertTriangle className="size-4 shrink-0 text-red-400" />
                <span>{apiError}</span>
              </div>
              <Button size="xs" variant="outline" onClick={refreshBookmarks}>
                Reintentar
              </Button>
            </div>
          )}

          {storageDiag?.isEphemeralFallback && storageDiag.warning && (
            <div className="mb-6 flex items-center justify-between gap-3 rounded-lg border border-[#5a4822] bg-[#241e14] px-4 py-2.5 text-xs text-[#e3c08d]">
              <div className="flex items-center gap-2">
                <AlertTriangle className="size-4 shrink-0" />
                <span>{storageDiag.warning}</span>
              </div>
              <Button
                size="xs"
                variant="outline"
                onClick={() => setActive('Exportar')}
                className="border-[#5a4822] text-xs text-[#e3c08d]"
              >
                Descargar Respaldo
              </Button>
            </div>
          )}

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
              onOpenRepoInGallery={handleOpenRepoInGallery}
              onToggleReviewed={handleToggleReviewed}
              onDelete={handleDeleteBookmark}
              onBulkUpdateReviewed={handleBulkUpdateReviewed}
              onBulkDelete={handleBulkDelete}
              onRefresh={refreshBookmarks}
              externalTopicFilter={selectedTopicFilter}
              externalAuthorFilter={selectedAuthorFilter}
              customizedVisibleColumns={customization.visibleLibraryColumns}
              onClearExternalFilters={() => {
                setSelectedTopicFilter(null)
                setSelectedAuthorFilter(null)
              }}
            />
          )}

          {active === 'Repositorios' && (
            <ReposView
              bookmarks={bookmarks}
              onOpenBookmarkDetail={handleOpenDetail}
              onRefreshBookmarks={refreshBookmarks}
              initialSelectedRepoFullName={selectedRepoFullName}
              onClearInitialSelectedRepo={() => setSelectedRepoFullName(null)}
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
              bookmarks={bookmarks}
              onOpenRepoDetail={handleOpenRepoInGallery}
            />
          )}

          {active === 'TablaReposSkills' && (
            <ReposSkillsExcelTable
              bookmarks={bookmarks}
              onSelectRepoDetail={handleOpenRepoInGallery}
              title="Tabla Maestra de Repositorios y Skills (2 Pestañas tipo Excel)"
              subtitle="Pestaña 1: Toda la información de tus Repositorios · Pestaña 2: Todos los Skills dentro de los repositorios (qué hace, link al repo, estrellas, comentarios editables, si lo recomendás, empresa creadora y para qué proyecto sirve)."
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
        onOpenRepoInGallery={handleOpenRepoInGallery}
      />

      {/* Paleta de Comandos y Búsqueda Global (Ctrl+K / Cmd+K) */}
      <CommandPalette
        open={commandPaletteOpen}
        onOpenChange={setCommandPaletteOpen}
        bookmarks={bookmarks}
        onNavigateView={setActive}
        onSelectBookmark={handleOpenDetail}
        onSelectRepo={handleOpenRepoInGallery}
      />

      {/* Panel de Herramientas de Customización (Fase Previa y Runtime) */}
      <CustomizationDrawer
        open={customizationDrawerOpen}
        onOpenChange={setCustomizationDrawerOpen}
        config={customization}
        onChangeConfig={handleChangeCustomization}
      />

      {/* Chat Agéntico Global (Hermes Principal + Gemini, Claude, ChatGPT con Tool Calling) */}
      <GlobalAgentChat
        open={agentChatOpen}
        onOpenChange={setAgentChatOpen}
        sectionContext={sectionContext}
        customization={customization}
        onUpdateCustomization={handleUpdateCustomizationPatch}
        onOpenCustomizationDrawer={() => setCustomizationDrawerOpen(true)}
        onExecuteClientEffects={handleExecuteClientEffects}
      />
    </div>
  )
}
