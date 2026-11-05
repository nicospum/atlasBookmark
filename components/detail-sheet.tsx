'use client'

import React, { useState, useEffect } from 'react'
import {
  X as XClose,
  ExternalLink,
  Clipboard,
  Check,
  Sparkles,
  Link2,
  Plus,
  Image as ImageIcon,
  Camera,
  X as XIcon,
  Trash2,
  Loader2,
  FolderHeart,
  ShieldCheck,
  HardDriveDownload,
  GitBranch as Github,
  MessageCircle,
  Save,
  Edit3,
  CheckCircle2,
  AlertCircle
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from '@/components/ui/sheet'
import { BookmarkItem, ResourceType } from '@/lib/types'
import { CANONICAL_RESOURCE_TYPES } from '@/lib/resource-investigator'
import { formatAnalysisStateLabel } from '@/lib/excel-export'

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
  onOpenRepoInGallery?: (repoFullName: string) => void
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
  onRefresh,
  onOpenRepoInGallery
}: DetailSheetProps) {
  const [copied, setCopied] = useState(false)
  const [newTopicInput, setNewTopicInput] = useState('')
  const [isAddingTopic, setIsAddingTopic] = useState(false)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [isArchivingMedia, setIsArchivingMedia] = useState(false)
  const [isEditingFields, setIsEditingFields] = useState(false)
  const [isSavingFields, setIsSavingFields] = useState(false)
  const [notice, setNotice] = useState('')

  // Editable synthesis & notes state
  const [editTitle, setEditTitle] = useState('')
  const [editPurpose, setEditPurpose] = useState('')
  const [editResourceType, setEditResourceType] = useState<ResourceType>('Otro / pendiente de clasificar')
  const [editEvaluation, setEditEvaluation] = useState('')
  const [editNotes, setEditNotes] = useState('')

  useEffect(() => {
    if (item) {
      setEditTitle(item.title || '')
      setEditPurpose(item.purpose || item.aiSummary || '')
      setEditResourceType(item.resourceType || 'Otro / pendiente de clasificar')
      setEditEvaluation(item.evaluation || '')
      setEditNotes(item.notes || '')
      setIsEditingFields(false)
      setNotice('')
    }
  }, [item])

  if (!item) return null

  const handleCopy = () => {
    const ghLinks = (item.resources || [])
      .filter(r => r.kind === 'github_repo')
      .map(r => r.resolvedUrl)
      .join('\n')
    navigator.clipboard.writeText(
      `${item.title || ''}\n${item.purpose || ''}\n${ghLinks ? `\nGitHub:\n${ghLinks}\n` : ''}\nTexto original:\n${item.caption}\n\nFuente: ${item.sourceUrl}`
    )
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

  const handleSaveManualFields = async () => {
    setIsSavingFields(true)
    setNotice('')
    try {
      const res = await fetch(`/api/bookmarks/${encodeURIComponent(item.id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: editTitle.trim(),
          purpose: editPurpose.trim(),
          resourceType: editResourceType,
          evaluation: editEvaluation.trim(),
          notes: editNotes.trim()
        })
      })
      if (res.ok) {
        setIsEditingFields(false)
        setNotice('Cambios guardados y protegidos frente a futuros reanálisis.')
        await onRefresh?.()
      } else {
        setNotice('Error al guardar cambios.')
      }
    } catch {
      setNotice('Error de conexión al guardar cambios.')
    } finally {
      setIsSavingFields(false)
    }
  }

  const handleRunAnalyze = async () => {
    if (!onAnalyze) return
    setIsAnalyzing(true)
    setNotice('')
    try {
      const deg = await onAnalyze(item.id)
      if (deg) {
        setNotice(deg)
      } else {
        setNotice('Enlaces, repositorios de GitHub y síntesis actualizados.')
      }
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

  const resources = item.resources || []
  const ghRepos = resources.filter(r => r.kind === 'github_repo')

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto border-border bg-[#15171d] text-foreground sm:max-w-[580px]">
        <SheetHeader className="border-b border-border/80 pb-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Badge
                variant="outline"
                className={`gap-1.5 font-normal ${
                  item.platform === 'x'
                    ? 'border-[#49436f] bg-[#222138] text-[#bfb8ff]'
                    : item.platform === 'instagram'
                    ? 'border-[#6f435f] bg-[#38212e] text-[#f2a8d6]'
                    : 'border-[#2d5a43] bg-[#162b21] text-[#91d0b4]'
                }`}
              >
                {item.platform === 'x' ? (
                  <>
                    <XIcon className="size-3" /> X / Twitter
                  </>
                ) : item.platform === 'instagram' ? (
                  <>
                    <Camera className="size-3" /> Instagram
                  </>
                ) : (
                  <>
                    <MessageCircle className="size-3" /> WhatsApp
                  </>
                )}
              </Badge>

              <Badge
                variant="outline"
                className="border-[#3b3759] bg-[#1d1c2b] text-[11px] font-normal text-[#d2ccff]"
              >
                {item.resourceType || 'Otro / pendiente de clasificar'}
              </Badge>
            </div>

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
            {item.title || item.caption.slice(0, 120)}
          </SheetTitle>
          <SheetDescription className="text-left text-xs text-muted-foreground">
            Guardado el {formatDate(item.savedAt)} · Estado análisis:{' '}
            <strong className="text-foreground">{formatAnalysisStateLabel(item.analysisState)}</strong> · ID:{' '}
            <span className="font-mono text-[11px]">{item.id}</span>
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-6 py-6 text-sm">
          {/* Bloque estructurado: Qué es, Para qué sirve, Evaluación breve y Notas */}
          <div className="rounded-lg border border-[#35314f] bg-[#1b1a29] p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#bfb8ff]">
                <Sparkles className="size-3.5" /> Ficha del Recurso y Utilidad
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={() => setIsEditingFields(!isEditingFields)}
                  className="text-[11px] text-[#a59cf5] hover:text-white"
                >
                  <Edit3 className="mr-1 size-3" />
                  {isEditingFields ? 'Cancelar edición' : 'Editar ficha / notas'}
                </Button>
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
                        <Loader2 className="mr-1 size-3 animate-spin" /> Investigando...
                      </>
                    ) : (
                      <>
                        <Sparkles className="mr-1 size-3" /> Investigar enlaces + GitHub
                      </>
                    )}
                  </Button>
                )}
              </div>
            </div>

            {isEditingFields ? (
              <div className="flex flex-col gap-3 text-xs">
                <div>
                  <label className="mb-1 block text-muted-foreground">Nombre / recurso</label>
                  <input
                    type="text"
                    value={editTitle}
                    onChange={e => setEditTitle(e.target.value)}
                    className="h-8 w-full rounded border border-border bg-[#121319] px-2.5 text-xs text-foreground"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-muted-foreground">Tipo de recurso</label>
                  <select
                    value={editResourceType}
                    onChange={e => setEditResourceType(e.target.value as ResourceType)}
                    className="h-8 w-full rounded border border-border bg-[#121319] px-2.5 text-xs text-foreground"
                  >
                    {CANONICAL_RESOURCE_TYPES.map(rt => (
                      <option key={rt} value={rt}>
                        {rt}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-muted-foreground">Para qué sirve</label>
                  <textarea
                    rows={3}
                    value={editPurpose}
                    onChange={e => setEditPurpose(e.target.value)}
                    className="w-full rounded border border-border bg-[#121319] p-2.5 text-xs text-foreground"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-muted-foreground">Evaluación breve (utilidad y limitación)</label>
                  <textarea
                    rows={2}
                    value={editEvaluation}
                    onChange={e => setEditEvaluation(e.target.value)}
                    className="w-full rounded border border-border bg-[#121319] p-2.5 text-xs text-foreground"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-muted-foreground">Notas personales (protegidas en reanálisis)</label>
                  <textarea
                    rows={2}
                    value={editNotes}
                    onChange={e => setEditNotes(e.target.value)}
                    placeholder="Agregá tus notas sobre cómo usar este recurso..."
                    className="w-full rounded border border-border bg-[#121319] p-2.5 text-xs text-foreground"
                  />
                </div>
                <div className="flex justify-end">
                  <Button
                    size="xs"
                    disabled={isSavingFields}
                    onClick={handleSaveManualFields}
                    className="bg-[#7c6cf0] text-xs text-white hover:bg-[#6f60dc]"
                  >
                    <Save className="mr-1 size-3" />
                    {isSavingFields ? 'Guardando...' : 'Guardar cambios manuales'}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    Para qué sirve
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-[#eceaf6]">
                    {item.purpose || item.aiSummary}
                  </p>
                </div>

                <div className="border-t border-[#35314f]/70 pt-2.5">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    Evaluación breve y verificación
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-[#c6c4d4]">
                    {item.evaluation || 'Basado en el texto de la publicación.'}
                  </p>
                </div>

                {item.notes && (
                  <div className="rounded border border-[#4a3f28] bg-[#241f14] p-2.5 text-xs text-[#f0c982]">
                    <strong className="block text-[10px] uppercase">Notas personales:</strong>
                    {item.notes}
                  </div>
                )}
              </div>
            )}

            {notice && (
              <p className="mt-2.5 border-t border-[#35314f] pt-2 text-[11px] text-[#91d0b4]">
                {notice}
              </p>
            )}
          </div>

          {/* Recursos vinculados y Repositorios de GitHub */}
          {resources.length > 0 && (
            <div>
              <p className="mb-2.5 flex items-center justify-between text-xs font-medium uppercase tracking-wider text-muted-foreground">
                <span>Recursos y Repositorios Vinculados ({resources.length})</span>
                {ghRepos.length > 0 && (
                  <span className="text-[11px] text-[#91d0b4]">
                    {ghRepos.length} repo{ghRepos.length > 1 ? 's' : ''} GitHub
                  </span>
                )}
              </p>
              <div className="flex flex-col gap-2">
                {resources.slice(0, 12).map(res => (
                  <div
                    key={res.id + res.resolvedUrl}
                    className="rounded-lg border border-border bg-[#181a23] p-3 text-xs"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <a
                        href={res.resolvedUrl || res.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 font-medium text-[#bfb8ff] hover:underline truncate"
                      >
                        {res.kind === 'github_repo' ? (
                          <Github className="size-3.5 shrink-0 text-[#91d0b4]" />
                        ) : (
                          <Link2 className="size-3.5 shrink-0 text-[#8e83f2]" />
                        )}
                        <span className="truncate">{res.fullName || res.name || res.resolvedUrl}</span>
                        <ExternalLink className="size-3 shrink-0 opacity-70" />
                      </a>

                      <Badge
                        variant="outline"
                        className={`shrink-0 text-[10px] font-normal ${
                          res.verificationStatus === 'confirmed'
                            ? 'border-[#2d5a43] bg-[#162b21] text-[#91d0b4]'
                            : res.verificationStatus === 'not_found' || res.verificationStatus === 'error'
                            ? 'border-red-500/40 text-red-300'
                            : 'border-border text-muted-foreground'
                        }`}
                      >
                        {res.verificationStatus === 'confirmed' ? (
                          <>
                            <CheckCircle2 className="mr-1 size-2.5" /> Corroborado
                          </>
                        ) : res.verificationStatus === 'not_found' ? (
                          <>
                            <AlertCircle className="mr-1 size-2.5" /> 404 No existe
                          </>
                        ) : (
                          'Detectado'
                        )}
                      </Badge>
                    </div>

                    {res.description && (
                      <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
                        {res.description}
                      </p>
                    )}

                    <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-[10px] text-muted-foreground">
                      <div className="flex flex-wrap items-center gap-2">
                        <span>Tipo: {res.resourceType}</span>
                        {res.stars !== undefined && <span className="text-[#f0c982]">★ {res.stars}</span>}
                        {res.license && <span>Licencia: {res.license}</span>}
                        {res.provenanceChain && res.provenanceChain.length > 1 && (
                          <span className="truncate font-mono text-[9px] opacity-75">
                            Vía: {res.provenanceChain.join(' → ')}
                          </span>
                        )}
                      </div>
                      {res.kind === 'github_repo' && res.fullName && onOpenRepoInGallery && (
                        <button
                          type="button"
                          onClick={() => onOpenRepoInGallery(res.fullName!)}
                          className="inline-flex items-center gap-1 rounded border border-[#4a4475] bg-[#24213a] px-2 py-0.5 text-[10px] font-medium text-[#d6d1ff] hover:bg-[#312d4e]"
                        >
                          <Github className="size-2.5" /> Abrir en Galería de Repos
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                {resources.length > 12 && (
                  <p className="text-center text-[11px] text-muted-foreground">
                    +{resources.length - 12} recursos adicionales vinculados a esta publicación.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Autor y Publicación Original */}
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
                <span className="font-normal text-muted-foreground">{item.authorHandle}</span>
              </p>
              <p className="text-xs text-muted-foreground">
                Publicado {formatDate(item.publishedAt)} · Fuente: {item.provenance || item.captureSource}
              </p>
            </div>
          </div>

          {/* Texto original completo */}
          <div>
            <p className="mb-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Texto original de la publicación
            </p>
            <div className="rounded-lg border border-border bg-[#1b1d25] p-4">
              <p className="whitespace-pre-wrap font-serif text-[14px] leading-relaxed text-[#eae8f2]">
                {item.caption}
              </p>
            </div>
          </div>

          {/* Media embebida si existe */}
          {item.mediaUrls && item.mediaUrls.length > 0 ? (
            <div className="flex flex-col gap-2">
              <div className="overflow-hidden rounded-lg border border-border bg-[#20222b]">
                <img
                  src={item.mediaUrls[0]}
                  alt="Media guardada"
                  className="max-h-[300px] w-full object-cover"
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
            <div className="grid aspect-[3.2] place-items-center rounded-lg border border-border/60 bg-[#191a22]">
              <div className="text-center text-muted-foreground">
                <ImageIcon className="mx-auto mb-1 size-5 opacity-40" />
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
                Área / Temas clasificados
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

          {/* Acciones */}
          <div className="flex flex-wrap items-center gap-2 pt-2">
            {item.sourceUrl && item.sourceUrl.startsWith('http') && (
              <a
                href={item.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#7c6cf0] px-3.5 py-2 text-xs font-medium text-white transition-colors hover:bg-[#6f60dc]"
              >
                <ExternalLink className="size-3.5" /> Abrir original
              </a>
            )}

            <Button
              variant="outline"
              size="sm"
              onClick={handleCopy}
              className="border-border text-xs"
            >
              {copied ? <Check className="size-3.5 text-[#91d0b4]" /> : <Clipboard className="size-3.5" />}
              {copied ? 'Copiado!' : 'Copiar ficha'}
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
