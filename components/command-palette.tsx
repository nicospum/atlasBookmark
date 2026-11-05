'use client'

import React, { useState, useEffect, useMemo, useRef } from 'react'
import {
  Search,
  FolderGit2,
  Bookmark,
  Compass,
  Layers,
  Download,
  Upload,
  Sparkles,
  ExternalLink,
  Copy,
  Check,
  X,
  Star,
  ArrowRight
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import type { BookmarkItem, GalleryRepository } from '@/lib/types'

interface CommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  bookmarks: BookmarkItem[]
  onNavigateView: (viewName: string) => void
  onSelectBookmark: (item: BookmarkItem) => void
  onSelectRepo: (repoFullName: string) => void
}

export function CommandPalette({
  open,
  onOpenChange,
  bookmarks,
  onNavigateView,
  onSelectBookmark,
  onSelectRepo
}: CommandPaletteProps) {
  const [query, setQuery] = useState('')
  const [repositories, setRepositories] = useState<GalleryRepository[]>([])
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  // Global keyboard shortcut: Ctrl+K / Cmd+K and Escape
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        onOpenChange(!open)
      } else if (e.key === 'Escape' && open) {
        e.preventDefault()
        onOpenChange(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onOpenChange])

  // Load repositories when opened
  useEffect(() => {
    if (!open) return
    setTimeout(() => inputRef.current?.focus(), 40)
    fetch('/api/github/repos')
      .then(r => r.json())
      .then(data => {
        if (data?.success && Array.isArray(data.repositories)) {
          setRepositories(data.repositories)
        }
      })
      .catch(() => {})
  }, [open])

  const quickActions = useMemo(
    () => [
      {
        id: 'nav-repos',
        label: 'Abrir Galería Visual de Repositorios GitHub',
        desc: `Explorar ${repositories.length || 261} repositorios, Skills, MCPs y Agentes`,
        icon: FolderGit2,
        run: () => {
          onNavigateView('Repositorios')
          onOpenChange(false)
        }
      },
      {
        id: 'nav-library',
        label: 'Ir a Biblioteca de Guardados (Tabla 8 Columnas)',
        desc: `Explorar tus ${bookmarks.length} publicaciones guardadas de X, Instagram y WhatsApp`,
        icon: Bookmark,
        run: () => {
          onNavigateView('Biblioteca')
          onOpenChange(false)
        }
      },
      {
        id: 'nav-capture',
        label: 'Capturar o Importar Guardados (HAR, WhatsApp, JSON, URLs)',
        desc: 'Subir archivos de red, pegar chats de WhatsApp o lotes de enlaces',
        icon: Upload,
        run: () => {
          onNavigateView('Captura')
          onOpenChange(false)
        }
      },
      {
        id: 'nav-export',
        label: 'Exportar Archivo a Excel (.xlsx Multi-Hoja) o JSON',
        desc: 'Descargar libro Excel de 6 pestañas verificadas o respaldo canónico',
        icon: Download,
        run: () => {
          onNavigateView('Exportar')
          onOpenChange(false)
        }
      },
      {
        id: 'nav-topics',
        label: 'Explorar Temas y Enriquecimiento Semántico IA',
        desc: 'Ver distribución temática y reclasificar con IA',
        icon: Sparkles,
        run: () => {
          onNavigateView('Temas')
          onOpenChange(false)
        }
      }
    ],
    [repositories.length, bookmarks.length, onNavigateView, onOpenChange]
  )

  const filteredActions = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return quickActions.slice(0, 4)
    return quickActions.filter(a => `${a.label} ${a.desc}`.toLowerCase().includes(q))
  }, [query, quickActions])

  const filteredRepos = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return repositories.slice(0, 6)
    const words = q.split(/\s+/).filter(Boolean)
    return repositories
      .filter(r => {
        const hay = `${r.fullName} ${r.shortExplanationEs || ''} ${r.description || ''} ${r.resourceType || ''} ${
          r.primaryLanguage || ''
        } ${(r.topics || []).join(' ')}`.toLowerCase()
        return words.every(w => hay.includes(w))
      })
      .slice(0, 10)
  }, [query, repositories])

  const filteredBookmarks = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return bookmarks.slice(0, 5)
    const words = q.split(/\s+/).filter(Boolean)
    return bookmarks
      .filter(b => {
        const hay = `${b.title || ''} ${b.purpose || ''} ${b.caption || ''} ${b.authorName} ${b.authorHandle} ${
          b.resourceType || ''
        } ${(b.topics || []).join(' ')}`.toLowerCase()
        return words.every(w => hay.includes(w))
      })
      .slice(0, 8)
  }, [query, bookmarks])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/75 pt-16 p-4 backdrop-blur-sm"
      onClick={() => onOpenChange(false)}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="flex max-h-[82vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-[#453f6e] bg-[#14161f] shadow-2xl"
      >
        {/* Barra de Búsqueda */}
        <div className="flex items-center gap-3 border-b border-border bg-[#191b26] px-4 py-3.5">
          <Search className="size-4 text-[#a59cf5] shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Buscar en repositorios de GitHub, Skills, MCPs, publicaciones guardadas o acciones..."
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="rounded-md p-1 text-muted-foreground hover:text-white"
            >
              <X className="size-3.5" />
            </button>
          )}
          <kbd className="hidden rounded border border-border bg-[#101218] px-2 py-0.5 text-[10px] text-muted-foreground sm:inline-block">
            ESC
          </kbd>
        </div>

        {/* Resultados */}
        <div className="flex-1 overflow-y-auto p-3 space-y-5">
          {/* Sección 1: Repositorios de GitHub */}
          {filteredRepos.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between px-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-[#a59cf5]">
                  Repositorios de GitHub ({filteredRepos.length})
                </span>
              </div>
              <div className="space-y-1">
                {filteredRepos.map(repo => (
                  <div
                    key={repo.fullName}
                    onClick={() => {
                      onSelectRepo(repo.fullName)
                      onOpenChange(false)
                    }}
                    className="group flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 cursor-pointer hover:bg-[#211f35] transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <img
                        src={repo.avatarUrl || `https://github.com/${repo.owner}.png?size=64`}
                        alt={repo.owner}
                        className="size-7 rounded-lg border border-border bg-[#0e1016] shrink-0"
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-xs font-semibold text-white group-hover:text-[#cfcaff]">
                            {repo.fullName}
                          </span>
                          <Badge
                            variant="outline"
                            className="border-[#423d66] bg-[#1b192c] text-[10px] text-[#cfcaff]"
                          >
                            {repo.resourceType || 'Repo'}
                          </Badge>
                          {repo.stars > 0 && (
                            <span className="flex items-center gap-0.5 text-[11px] text-amber-300">
                              <Star className="size-3 fill-amber-400 text-amber-400" />
                              {repo.stars.toLocaleString()}
                            </span>
                          )}
                        </div>
                        <p className="truncate text-[11px] text-muted-foreground">
                          {repo.shortExplanationEs || repo.description}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0" onClick={e => e.stopPropagation()}>
                      <button
                        onClick={async () => {
                          await navigator.clipboard.writeText(repo.url)
                          setCopiedId(repo.fullName)
                          setTimeout(() => setCopiedId(null), 1800)
                        }}
                        className="rounded-md border border-border bg-[#101218] p-1.5 text-muted-foreground hover:text-white"
                        title="Copiar URL de GitHub"
                      >
                        {copiedId === repo.fullName ? (
                          <Check className="size-3 text-emerald-400" />
                        ) : (
                          <Copy className="size-3" />
                        )}
                      </button>
                      <a
                        href={repo.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-md border border-border bg-[#101218] p-1.5 text-muted-foreground hover:text-white"
                        title="Abrir en GitHub"
                      >
                        <ExternalLink className="size-3" />
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Sección 2: Publicaciones Guardadas */}
          {filteredBookmarks.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between px-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-300">
                  Publicaciones Guardadas ({filteredBookmarks.length})
                </span>
              </div>
              <div className="space-y-1">
                {filteredBookmarks.map(bm => (
                  <div
                    key={bm.id}
                    onClick={() => {
                      onSelectBookmark(bm)
                      onOpenChange(false)
                    }}
                    className="flex items-center justify-between gap-3 rounded-xl px-3 py-2 cursor-pointer hover:bg-[#1c202e] transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[9px] uppercase">
                          {bm.platform}
                        </Badge>
                        <span className="truncate text-xs font-medium text-foreground">
                          {bm.title || bm.authorName}
                        </span>
                        <span className="text-[11px] text-muted-foreground">{bm.authorHandle}</span>
                      </div>
                      <p className="truncate text-[11px] text-muted-foreground mt-0.5">
                        {bm.purpose || bm.caption}
                      </p>
                    </div>
                    <ArrowRight className="size-3.5 text-muted-foreground shrink-0" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Sección 3: Acciones Rápidas */}
          {filteredActions.length > 0 && (
            <div className="space-y-1.5">
              <div className="px-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Navegación y Acciones Rápidas
                </span>
              </div>
              <div className="space-y-1">
                {filteredActions.map(act => {
                  const Icon = act.icon
                  return (
                    <div
                      key={act.id}
                      onClick={act.run}
                      className="flex items-center justify-between gap-3 rounded-xl px-3 py-2 cursor-pointer hover:bg-[#1b1e29] transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="grid size-7 place-items-center rounded-lg bg-[#232138] text-[#b4abff]">
                          <Icon className="size-3.5" />
                        </div>
                        <div>
                          <p className="text-xs font-medium text-foreground">{act.label}</p>
                          <p className="text-[11px] text-muted-foreground">{act.desc}</p>
                        </div>
                      </div>
                      <ArrowRight className="size-3.5 text-muted-foreground" />
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {filteredRepos.length === 0 && filteredBookmarks.length === 0 && filteredActions.length === 0 && (
            <div className="py-10 text-center text-xs text-muted-foreground">
              No se encontraron repositorios ni guardados para &ldquo;{query}&rdquo;.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border bg-[#101218] px-4 py-2 text-[11px] text-muted-foreground">
          <span>Atajo global: Ctrl+K o Cmd+K desde cualquier vista</span>
          <span>{repositories.length} repos · {bookmarks.length} guardados</span>
        </div>
      </div>
    </div>
  )
}
