'use client'

import React, { useState } from 'react'
import {
  X as XClose, ExternalLink, Clipboard, Check, Sparkles,
  Link2, Plus, Image as ImageIcon, Camera, X as XIcon, Trash2, Loader2, FolderHeart, ShieldCheck, HardDriveDownload
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle
} from '@/components/ui/sheet'
import { BookmarkItem } from '@/lib/types'

interface DetailSheetProps {
  item: BookmarkItem | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onToggleReviewed: (id: string) => void
  onAddTopic: (id: string, topic: string) => void
  onRemoveTopic: (id: string, topic: string) => void
  onDelete?: (id: string) => void
  onAnalyze?: (id: string) => Promise<string | undefined>
  onRefresh?: () => Promise<void>
}

export function DetailSheet({
  item,
  open,
  onOpenChange,
  onToggleReviewed,
  onAddTopic,
  onRemoveTopic,
  onDelete,
  onAnalyze,
  onRefresh
}: DetailSheetProps) {
  const [copied, setCopied] = useState(false)
  const [newTopicInput, setNewTopicInput] = useState('')
  const [isAddingTopic, setIsAddingTopic] = useState(false)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [isArchivingMedia, setIsArchivingMedia] = useState(false)
  const [notice, setNotice] = useState('')

  if (!item) return null

  const handleCopy = () => {
    navigator.clipboard.writeText(`${item.caption}\n\nFuente: ${item.sourceUrl}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleAddTopicSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (newTopicInput.trim()) {
      onAddTopic(item.id, newTopicInput.trim())
      setNewTopicInput('')
      setIsAddingTopic(false)
    }
  }

  const handleRunAnalyze = async () => {
    if (!onAnalyze) return
    setIsAnalyzing(true)
    setNotice('')
    try {
      const deg = await onAnalyze(item.id)
      if (deg) setNotice(deg)
    } finally {
      setIsAnalyzing(false)
    }
  }

  const handleArchiveMedia = async () => {
    setIsArchivingMedia(true)
    setNotice('')
    try {
      const res = await fetch('/api/media/archive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id })
      })
      const data = await res.json()
      if (data.message) setNotice(data.message)
      await onRefresh?.()
    } catch {
      setNotice('Error archivando multimedia localmente.')
    } finally {
      setIsArchivingMedia(false)
    }
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

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto border-border bg-[#15171d] text-foreground sm:max-w-[540px]">
        <SheetHeader className="border-b border-border/80 pb-5">
          <div className="flex items-center justify-between">
            <Badge
              variant="outline"
              className={`gap-1.5 font-normal ${
                item.platform === 'x'
                  ? 'border-[#49436f] bg-[#222138] text-[#bfb8ff]'
                  : 'border-[#6f435f] bg-[#38212e] text-[#f2a8d6]'
              }`}
            >
              {item.platform === 'x' ? (
                <>
                  <XIcon className="size-3" /> X / Twitter
                </>
              ) : (
                <>
                  <Camera className="size-3" /> Instagram
                </>
              )}
            </Badge>

            <div className="flex items-center gap-2">
              <Badge
                variant={item.reviewed ? 'secondary' : 'outline'}
                className={item.reviewed ? 'bg-[#21352a] text-[#91d0b4]' : 'text-muted-foreground'}
              >
                {item.reviewed ? 'Revisado' : 'Pendiente'}
              </Badge>
              <SheetClose className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
                <XClose className="size-4" />
              </SheetClose>
            </div>
          </div>

          <SheetTitle className="font-serif text-xl font-normal leading-snug tracking-[-0.02em] text-[#f3f1f8] pt-2">
            {item.caption.slice(0, 120)}
            {item.caption.length > 120 ? '...' : ''}
          </SheetTitle>
          <SheetDescription className="text-left text-xs text-muted-foreground">
            Guardado el {formatDate(item.savedAt)} · ID: <span className="font-mono text-[11px]">{item.id}</span>
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-6 py-6 text-sm">
          {/* Autor */}
          <div className="flex items-center gap-3">
            {item.authorAvatar ? (
              <img
                src={item.authorAvatar}
                alt={item.authorName}
                className="size-10 rounded-full object-cover border border-border"
              />
            ) : (
              <div className="grid size-10 place-items-center rounded-full bg-[#353743] font-medium text-xs">
                {item.authorName.slice(0, 2).toUpperCase()}
              </div>
            )}
            <div>
              <p className="font-medium text-foreground">
                {item.authorName}{' '}
                <span className="font-normal text-muted-foreground">
                  {item.authorHandle}
                </span>
              </p>
              <p className="text-xs text-muted-foreground">
                Publicado {formatDate(item.publishedAt)}
              </p>
            </div>
          </div>

          {/* Texto completo */}
          <div className="rounded-lg border border-border bg-[#1b1d25] p-4">
            <p className="whitespace-pre-wrap font-serif text-[15px] leading-relaxed text-[#eae8f2]">
              {item.caption}
            </p>
          </div>

          {/* Media embebida si existe */}
          {item.mediaUrls && item.mediaUrls.length > 0 ? (
            <div className="flex flex-col gap-2">
              <div className="overflow-hidden rounded-lg border border-border bg-[#20222b]">
                <img
                  src={item.mediaUrls[0]}
                  alt="Media guardada"
                  className="max-h-[320px] w-full object-cover"
                />
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">
                  Estado media: <strong className="text-foreground">{item.mediaStatus || 'referenced'}</strong>
                  {item.mediaPaths && item.mediaPaths.length > 0 && ` (${item.mediaPaths[0]})`}
                </span>
                <Button
                  size="xs"
                  variant="outline"
                  disabled={isArchivingMedia}
                  onClick={handleArchiveMedia}
                  className="border-border text-xs"
                >
                  {isArchivingMedia ? (
                    <>
                      <Loader2 className="mr-1 size-3 animate-spin" /> Archivando...
                    </>
                  ) : (
                    <>
                      <HardDriveDownload className="mr-1 size-3" /> Archivar en data/media
                    </>
                  )}
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid aspect-[2.4] place-items-center rounded-lg border border-border/60 bg-[#191a22]">
              <div className="text-center text-muted-foreground">
                <ImageIcon className="mx-auto mb-1.5 size-6 opacity-40" />
                <p className="text-xs">Sin archivo multimedia adjunto</p>
              </div>
            </div>
          )}

          {/* Colecciones de Instagram si existen */}
          {item.collections && item.collections.length > 0 && (
            <div>
              <p className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                <FolderHeart className="size-3.5 text-[#f2a8d6]" /> Colecciones de origen
              </p>
              <div className="flex flex-wrap gap-1.5">
                {item.collections.map(col => (
                  <Badge
                    key={col}
                    variant="outline"
                    className="border-[#6f435f] bg-[#38212e] text-xs text-[#f2a8d6]"
                  >
                    {col}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Temas / Tags */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Temas clasificados
              </p>
              {typeof item.confidence === 'number' && (
                <span className="text-[11px] text-muted-foreground">
                  Confianza: <strong className="text-[#bfb8ff]">{Math.round(item.confidence * 100)}%</strong>
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {item.topics.map(topic => (
                <Badge
                  key={topic}
                  variant="secondary"
                  className="gap-1.5 bg-[#262933] py-1 text-xs text-[#dcd7f9] hover:bg-[#323644]"
                >
                  <span>{topic}</span>
                  <button
                    onClick={() => onRemoveTopic(item.id, topic)}
                    className="ml-0.5 text-muted-foreground hover:text-white"
                  >
                    <XClose className="size-3" />
                  </button>
                </Badge>
              ))}

              {isAddingTopic ? (
                <form onSubmit={handleAddTopicSubmit} className="inline-flex items-center gap-1">
                  <input
                    type="text"
                    value={newTopicInput}
                    onChange={e => setNewTopicInput(e.target.value)}
                    placeholder="Nuevo tema..."
                    autoFocus
                    className="h-6 rounded border border-[#7c6cf0] bg-[#121318] px-2 text-xs text-foreground focus:outline-none"
                  />
                  <Button size="xs" type="submit" className="bg-[#7c6cf0] text-xs text-white">
                    OK
                  </Button>
                  <Button
                    size="xs"
                    variant="ghost"
                    type="button"
                    onClick={() => setIsAddingTopic(false)}
                  >
                    <XClose className="size-3" />
                  </Button>
                </form>
              ) : (
                <button
                  onClick={() => setIsAddingTopic(true)}
                  className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-[#7c6cf0] hover:text-foreground"
                >
                  <Plus className="size-3" /> Añadir tema
                </button>
              )}
            </div>

            {/* Evidencia auditable de reglas */}
            {item.classificationMatches && Object.keys(item.classificationMatches).length > 0 && (
              <div className="mt-3 rounded-md border border-border/60 bg-[#121319] p-2.5 text-[11px] text-muted-foreground">
                <p className="mb-1 flex items-center gap-1 font-medium text-[#a59cf5]">
                  <ShieldCheck className="size-3" /> Reglas coincidentes (auditable):
                </p>
                <div className="flex flex-col gap-0.5 font-mono">
                  {Object.entries(item.classificationMatches).map(([topic, matches]) => (
                    <div key={topic}>
                      <span className="text-foreground">{topic}:</span> {matches.join(', ')}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Resumen IA */}
          <div className="rounded-lg border border-[#35314f] bg-[#1b1a29] p-4">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#bfb8ff]">
                <Sparkles className="size-3.5" /> Análisis IA / Semántico ({item.analysisMethod || 'rules'})
              </div>
              {onAnalyze && (
                <Button
                  size="xs"
                  variant="outline"
                  disabled={isAnalyzing}
                  onClick={handleRunAnalyze}
                  className="border-[#49436f] bg-[#24213a] text-[11px] text-[#dcd7f9] hover:bg-[#302c4d]"
                >
                  {isAnalyzing ? (
                    <>
                      <Loader2 className="mr-1 size-3 animate-spin" /> Analizando...
                    </>
                  ) : (
                    <>
                      <Sparkles className="mr-1 size-3" /> Re-analizar con IA + Enlaces
                    </>
                  )}
                </Button>
              )}
            </div>
            <p className="text-sm leading-relaxed text-[#c6c4d4]">
              {item.aiSummary}
            </p>
            {notice && (
              <p className="mt-2 border-t border-[#35314f] pt-2 text-[11px] text-[#f0c982]">
                {notice}
              </p>
            )}
          </div>

          {/* Entidades & Idioma */}
          <div className="grid grid-cols-2 gap-4 rounded-lg border border-border bg-[#171922] p-4 text-xs">
            <div>
              <p className="font-medium text-muted-foreground">Entidades detectadas</p>
              <p className="mt-1 font-mono text-sm text-foreground">
                {item.entities.length > 0 ? item.entities.join(' · ') : 'Ninguna'}
              </p>
            </div>
            <div>
              <p className="font-medium text-muted-foreground">Idioma</p>
              <p className="mt-1 text-sm text-foreground">{item.language}</p>
            </div>
          </div>

          {/* Enlaces salientes */}
          {item.outgoingLinks && item.outgoingLinks.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Enlaces salientes
              </p>
              <div className="flex flex-col gap-1.5">
                {item.outgoingLinks.map((link, i) => (
                  <a
                    key={i}
                    href={link}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 truncate text-xs text-[#a59cf5] hover:underline"
                  >
                    <Link2 className="size-3.5 shrink-0" />
                    <span className="truncate">{link}</span>
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Acciones */}
          <div className="flex flex-wrap items-center gap-2 pt-2">
            <a
              href={item.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#7c6cf0] px-3.5 py-2 text-xs font-medium text-white transition-colors hover:bg-[#6f60dc]"
            >
              <ExternalLink className="size-3.5" /> Abrir original
            </a>

            <Button
              variant="outline"
              size="sm"
              onClick={handleCopy}
              className="border-border text-xs"
            >
              {copied ? <Check className="size-3.5 text-[#91d0b4]" /> : <Clipboard className="size-3.5" />}
              {copied ? 'Copiado!' : 'Copiar'}
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => onToggleReviewed(item.id)}
              className="border-border text-xs"
            >
              <Check className="size-3.5" />
              {item.reviewed ? 'Marcar pendiente' : 'Marcar revisado'}
            </Button>

            {onDelete && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  if (confirm('¿Eliminar este guardado del archivo?')) {
                    onDelete(item.id)
                    onOpenChange(false)
                  }
                }}
                className="ml-auto text-xs"
              >
                <Trash2 className="size-3.5" />
              </Button>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
