'use client'

import React, { useState, useRef } from 'react'
import {
  Zap,
  Check,
  RefreshCw,
  Upload,
  Terminal,
  X as XIcon,
  Camera,
  Globe,
  Sparkles,
  Copy,
  ExternalLink,
  FolderArchive,
  CheckCircle2,
  AlertCircle,
  Database,
  Code2,
  Puzzle,
  MessageCircle,
  ShieldCheck
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { BookmarkItem, ImportHistoryEntry, ImportResult, WhatsAppParsedMessage } from '@/lib/types'
import { ReposSkillsExcelTable } from '@/components/repos-skills-excel-table'

interface CaptureViewProps {
  onRefresh: () => Promise<void>
  onNavigateLibrary: () => void
  totalCount: number
  history: ImportHistoryEntry[]
  bookmarks?: BookmarkItem[]
  onOpenRepoDetail?: (repoFullName: string) => void
}

const CONSOLE_CAPTURE_SNIPPET = `(() => {
  const isIG = location.hostname.includes('instagram.com');
  const items = new Map();
  let passes = 0;
  console.log('🚀 [Atlas] Iniciando captura visible en ' + (isIG ? 'Instagram' : 'X/Twitter') + '...');
  const timer = setInterval(() => {
    passes++;
    if (!isIG) {
      document.querySelectorAll('article[data-testid="tweet"]').forEach(art => {
        const time = art.querySelector('time');
        const link = time?.closest('a') || art.querySelector('a[href*="/status/"]');
        if (!link) return;
        const m = link.href.match(/\\/status\\/(\\d+)/);
        if (!m) return;
        const id = 'x:' + m[1];
        const userText = art.querySelector('[data-testid="User-Name"]')?.innerText || '';
        const handle = userText.match(/@[\\w]+/)?.[0] || '';
        const author = userText.split('\\n')[0] || handle;
        const text = art.querySelector('[data-testid="tweetText"]')?.innerText || '';
        const media = [...art.querySelectorAll('[data-testid="tweetPhoto"] img')].map(i => i.currentSrc || i.src).filter(Boolean);
        const urls = [...art.querySelectorAll('[data-testid="tweetText"] a')].map(a => a.href).filter(h => /^https?:/.test(h));
        items.set(id, { record_id: id, platform: 'X', url: link.href, author, handle, text, published_at: time?.dateTime || '', media_urls: media, external_urls: urls });
      });
    } else {
      document.querySelectorAll('main a[href], article a[href]').forEach(a => {
        const m = a.href.match(/\\/(p|reel|tv)\\/([\\w-]+)/);
        if (!m) return;
        const id = 'instagram:' + m[2];
        const media = [...a.querySelectorAll('img')].map(i => i.currentSrc || i.src).filter(Boolean);
        const alt = a.querySelector('img')?.alt || '';
        if (!items.has(id)) items.set(id, { record_id: id, platform: 'Instagram', url: a.href, text: alt, media_urls: media });
      });
    }
    console.log('📦 [Atlas] Guardados capturados hasta ahora: ' + items.size + ' (pasada ' + passes + '/15)');
    window.scrollBy({ top: Math.max(600, window.innerHeight * 0.85), behavior: 'smooth' });
    if (passes >= 15) {
      clearInterval(timer);
      const blob = new Blob([JSON.stringify([...items.values()], null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'atlas-captura-' + (isIG ? 'instagram' : 'x') + '-' + items.size + '.json';
      a.click();
      console.log('✅ [Atlas] ¡Descarga lista! Subí el archivo JSON en la pestaña Captura de Atlas.');
    }
  }, 2200);
})();`

export function CaptureView({
  onRefresh,
  onNavigateLibrary,
  totalCount,
  history,
  bookmarks = [],
  onOpenRepoDetail
}: CaptureViewProps) {
  const [activeTab, setActiveTab] = useState<'file' | 'whatsapp' | 'browser' | 'playwright' | 'url'>('file')
  const [isBusy, setIsBusy] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const [lastResult, setLastResult] = useState<ImportResult | null>(null)
  const [copiedSnippet, setCopiedSnippet] = useState(false)

  // URL Batch & Manual input state
  const [urlInput, setUrlInput] = useState('')
  const [manualCaption, setManualCaption] = useState('')
  const [manualTopics, setManualTopics] = useState('')

  // WhatsApp state
  const [waTextInput, setWaTextInput] = useState('')
  const [waPreviewMessages, setWaPreviewMessages] = useState<WhatsAppParsedMessage[]>([])
  const [waSelectedIds, setWaSelectedIds] = useState<Set<string>>(new Set())
  const [waOnlyLinks, setWaOnlyLinks] = useState(true)
  const [waSourceName, setWaSourceName] = useState('WhatsApp')

  // Playwright live logs
  const [pwStatus, setPwStatus] = useState<string>('')

  const fileInputRef = useRef<HTMLInputElement>(null)
  const waFileInputRef = useRef<HTMLInputElement>(null)

  const handleUploadFile = async (file: File) => {
    setIsBusy(true)
    setErrorMsg('')
    setSuccessMsg('')
    setLastResult(null)

    try {
      const form = new FormData()
      form.set('file', file)
      const res = await fetch('/api/import', {
        method: 'POST',
        body: form
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'No se pudo procesar el archivo.')
      }

      setLastResult(data)
      setSuccessMsg(
        `Archivo "${file.name}" procesado: ${data.added} nuevos, ${data.updated} enriquecidos, ${data.duplicates} duplicados omitidos (${data.total} totales en base).`
      )
      await onRefresh()
    } catch (err: any) {
      setErrorMsg(err.message || 'Error al importar el archivo.')
    } finally {
      setIsBusy(false)
    }
  }

  const handleReimportLocalHar = async () => {
    setIsBusy(true)
    setErrorMsg('')
    setSuccessMsg('')
    setLastResult(null)

    try {
      const res = await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reimport-local-har' })
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'No se pudo sincronizar los archivos HAR locales.')
      }
      setLastResult(data)
      setSuccessMsg(
        `Sincronización de capturas HAR locales (data/raw/x) completada: ${data.total} guardados únicos verificados en SQLite (${data.added} nuevos, ${data.updated} enriquecidos, ${data.duplicates} sin cambios).`
      )
      await onRefresh()
    } catch (err: any) {
      setErrorMsg(err.message)
    } finally {
      setIsBusy(false)
    }
  }

  const handlePreviewWhatsAppText = async () => {
    if (!waTextInput.trim()) {
      setErrorMsg('Pegá al menos un mensaje o bloque de chat de WhatsApp para analizar.')
      return
    }
    setIsBusy(true)
    setErrorMsg('')
    setSuccessMsg('')
    try {
      const res = await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'preview-whatsapp', text: waTextInput })
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'No se pudo analizar el texto de WhatsApp.')
      }
      const msgs: WhatsAppParsedMessage[] = data.messages || []
      setWaPreviewMessages(msgs)
      setWaSourceName('WhatsApp (texto pegado)')
      const defaultOnlyLinks = msgs.some(m => m.hasLinks)
      setWaOnlyLinks(defaultOnlyLinks)
      const initialIds = (defaultOnlyLinks ? msgs.filter(m => m.hasLinks) : msgs).map(m => m.id)
      setWaSelectedIds(new Set(initialIds))
    } catch (err: any) {
      setErrorMsg(err.message)
    } finally {
      setIsBusy(false)
    }
  }

  const handleUploadWhatsAppFile = async (file: File) => {
    setIsBusy(true)
    setErrorMsg('')
    setSuccessMsg('')
    try {
      const form = new FormData()
      form.set('file', file)
      form.set('previewWhatsApp', 'true')
      const res = await fetch('/api/import', {
        method: 'POST',
        body: form
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'No se pudo leer el archivo de WhatsApp.')
      }
      const msgs: WhatsAppParsedMessage[] = data.messages || []
      setWaPreviewMessages(msgs)
      setWaSourceName(file.name)
      const defaultOnlyLinks = msgs.some(m => m.hasLinks)
      setWaOnlyLinks(defaultOnlyLinks)
      const initialIds = (defaultOnlyLinks ? msgs.filter(m => m.hasLinks) : msgs).map(m => m.id)
      setWaSelectedIds(new Set(initialIds))
    } catch (err: any) {
      setErrorMsg(err.message)
    } finally {
      setIsBusy(false)
    }
  }

  const handleImportSelectedWhatsApp = async () => {
    const selectedMsgs = waPreviewMessages.filter(m => waSelectedIds.has(m.id))
    if (selectedMsgs.length === 0) {
      setErrorMsg('Seleccioná al menos un mensaje de WhatsApp para importar.')
      return
    }
    setIsBusy(true)
    setErrorMsg('')
    setSuccessMsg('')
    try {
      const res = await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'import-whatsapp',
          messages: selectedMsgs,
          filename: waSourceName
        })
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'No se pudieron importar los mensajes de WhatsApp.')
      }
      setLastResult(data)
      setWaPreviewMessages([])
      setWaTextInput('')
      setSuccessMsg(
        `WhatsApp importado (${waSourceName}): ${data.added} nuevos guardados analizados y añadidos a la tabla.`
      )
      await onRefresh()
    } catch (err: any) {
      setErrorMsg(err.message)
    } finally {
      setIsBusy(false)
    }
  }

  const handleHydrateWhatsAppAndHuntRepos = async () => {
    setIsBusy(true)
    setErrorMsg('')
    setSuccessMsg('')
    try {
      const res = await fetch('/api/github/repos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'hunt-missing-repos',
          limit: 35,
          platform: 'all'
        })
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'No se pudo completar la hidratación de enlaces.')
      }
      setSuccessMsg(
        `🕵️ Hidratación y Cazador Profundo completado: ${data.hydratedPostsCount} enlaces de WhatsApp/X expandidos con su texto completo y ${data.discoveredReposCount} repositorios de GitHub ocultos descubiertos (${data.newGalleryReposCount} nuevos en la Galería).`
      )
      await onRefresh()
    } catch (err: any) {
      setErrorMsg(err.message)
    } finally {
      setIsBusy(false)
    }
  }

  const handleUrlImport = async (e: React.FormEvent) => {
    e.preventDefault()
    const urls = urlInput
      .split(/\r?\n/)
      .map(u => u.trim())
      .filter(Boolean)

    if (urls.length === 0) {
      setErrorMsg('Ingresá al menos una URL válida de X (x.com/...) o Instagram (instagram.com/p/...).')
      return
    }

    setIsBusy(true)
    setErrorMsg('')
    setSuccessMsg('')
    setLastResult(null)

    try {
      const topics = manualTopics
        .split(',')
        .map(t => t.trim())
        .filter(Boolean)

      const res = await fetch('/api/bookmarks/fetch-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          urls,
          caption: manualCaption,
          topics
        })
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'No se pudieron importar las URLs.')
      }

      setLastResult(data)
      setUrlInput('')
      setManualCaption('')
      setManualTopics('')
      setSuccessMsg(
        `Se procesaron ${urls.length} enlace(s): ${data.added} nuevos guardados y clasificados automáticamente.`
      )
      await onRefresh()
    } catch (err: any) {
      setErrorMsg(err.message)
    } finally {
      setIsBusy(false)
    }
  }

  const handleLaunchPlaywright = async (platform: 'x' | 'instagram') => {
    setPwStatus(`Iniciando navegador Chromium para ${platform === 'x' ? 'X / Twitter' : 'Instagram'}...`)
    setErrorMsg('')
    try {
      const res = await fetch('/api/capture/browser', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform, maxItems: 100 })
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'No se pudo iniciar Playwright.')
      }
      setPwStatus(
        data.message ||
          'Ventana abierta. Iniciá sesión si es tu primera vez; el extractor guardará los elementos en SQLite automáticamente.'
      )
    } catch (err: any) {
      setErrorMsg(err.message)
      setPwStatus('')
    }
  }

  const copyConsoleSnippet = () => {
    navigator.clipboard.writeText(CONSOLE_CAPTURE_SNIPPET)
    setCopiedSnippet(true)
    setTimeout(() => setCopiedSnippet(false), 2500)
  }

  const visibleWaMessages = waOnlyLinks
    ? waPreviewMessages.filter(m => m.hasLinks)
    : waPreviewMessages

  return (
    <div className="flex flex-col gap-7">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="mb-2 text-xs uppercase tracking-[0.16em] text-[#8e83f2]">
            Guardar Primero, Analizar Después · X · Instagram · WhatsApp
          </p>
          <h1 className="font-serif text-3xl sm:text-4xl tracking-[-0.04em] text-foreground">
            Captura, Importación y Respaldo
          </h1>
          <p className="mt-2 text-sm text-muted-foreground max-w-3xl">
            Importá archivos de red (<code>.HAR</code>), exportaciones oficiales (<code>.JSON</code> / <code>.ZIP</code>), chats o mensajes de <strong>WhatsApp</strong>, respaldos <code>atlas-backup-v2.json</code> o enlaces directos. Cada guardado se persiste antes del enriquecimiento.
          </p>
        </div>

        <Badge variant="outline" className="border-[#35314f] bg-[#161822] px-3 py-1.5 text-xs text-[#a59cf5]">
          <Database className="size-3.5 mr-1.5 text-[#91d0b4]" />
          {totalCount} guardados únicos en SQLite
        </Badge>
      </header>

      {/* Alertas de resultado o error */}
      {errorMsg && (
        <div className="flex items-start justify-between gap-3 rounded-lg border border-red-500/40 bg-red-950/30 p-4 text-xs text-red-200">
          <div className="flex items-center gap-2">
            <AlertCircle className="size-4 shrink-0 text-red-400" />
            <span>{errorMsg}</span>
          </div>
          <button onClick={() => setErrorMsg('')} className="text-red-300 hover:text-white">
            ✕
          </button>
        </div>
      )}

      {successMsg && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#2d4a3e] bg-[#162621] p-4 text-xs text-[#91d0b4]">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="size-4 shrink-0 text-[#91d0b4]" />
            <span>{successMsg}</span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="xs"
              onClick={onNavigateLibrary}
              className="bg-[#7c6cf0] text-white hover:bg-[#6f60dc]"
            >
              Ver Tabla en Biblioteca
            </Button>
            <button onClick={() => setSuccessMsg('')} className="ml-1 text-muted-foreground hover:text-white">
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Desglose por etapa de la última importación */}
      {lastResult && (
        <div className="rounded-lg border border-[#35314f] bg-[#161822] p-4">
          <p className="mb-3 text-xs font-medium uppercase tracking-wider text-[#bfb8ff]">
            Trazabilidad por Etapa de Importación ({lastResult.filename || 'lote'})
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
            {[
              {
                label: 'Entradas leídas',
                value: lastResult.stages?.networkEntries ?? lastResult.total,
                color: 'text-muted-foreground'
              },
              {
                label: 'Respuestas útiles',
                value: lastResult.stages?.recognizedResponses ?? 1,
                color: 'text-[#a59cf5]'
              },
              {
                label: 'Ruido omitido',
                value: lastResult.stages?.incidentalSkipped ?? 0,
                color: 'text-muted-foreground'
              },
              {
                label: 'Items detectados',
                value: lastResult.stages?.detectedItems ?? lastResult.added + lastResult.duplicates + lastResult.updated,
                color: 'text-foreground'
              },
              { label: 'Nuevos guardados', value: lastResult.added, color: 'text-[#91d0b4]' },
              { label: 'Enriquecidos', value: lastResult.updated, color: 'text-[#bfb8ff]' },
              { label: 'Duplicados', value: lastResult.duplicates, color: 'text-muted-foreground' },
              { label: 'Persistidos en DB', value: lastResult.total, color: 'text-[#91d0b4]' }
            ].map(stat => (
              <div key={stat.label} className="rounded-md border border-border bg-[#121319] p-2.5">
                <p className={`text-xl font-semibold ${stat.color}`}>{stat.value}</p>
                <p className="mt-0.5 text-[10px] text-muted-foreground">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Selector de las 5 Vías de Captura */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border pb-3">
        <button
          onClick={() => setActiveTab('file')}
          className={`flex items-center gap-2 rounded-md px-3.5 py-2 text-xs font-medium transition-colors ${
            activeTab === 'file'
              ? 'bg-[#28263b] text-[#bfb8ff] shadow-sm'
              : 'text-muted-foreground hover:bg-[#191b24] hover:text-foreground'
          }`}
        >
          <FolderArchive className="size-3.5" />
          <span>1. Subir Archivo (.HAR / .JSON / .ZIP / .CSV)</span>
          <Badge className="ml-1 border-0 bg-[#283b35] px-1.5 py-0 text-[10px] text-[#91d0b4]">
            Principal
          </Badge>
        </button>

        <button
          onClick={() => setActiveTab('whatsapp')}
          className={`flex items-center gap-2 rounded-md px-3.5 py-2 text-xs font-medium transition-colors ${
            activeTab === 'whatsapp'
              ? 'bg-[#1b3328] text-[#91d0b4] shadow-sm'
              : 'text-muted-foreground hover:bg-[#191b24] hover:text-foreground'
          }`}
        >
          <MessageCircle className="size-3.5 text-[#91d0b4]" />
          <span>2. WhatsApp (Mensajes / Chat .TXT o .ZIP)</span>
          <Badge className="ml-1 border-0 bg-[#213b2f] px-1.5 py-0 text-[10px] text-[#91d0b4]">
            Nuevo
          </Badge>
        </button>

        <button
          onClick={() => setActiveTab('browser')}
          className={`flex items-center gap-2 rounded-md px-3.5 py-2 text-xs font-medium transition-colors ${
            activeTab === 'browser'
              ? 'bg-[#28263b] text-[#bfb8ff] shadow-sm'
              : 'text-muted-foreground hover:bg-[#191b24] hover:text-foreground'
          }`}
        >
          <Puzzle className="size-3.5" />
          <span>3. En tu Navegador (Script 1-Clic / Extensión)</span>
        </button>

        <button
          onClick={() => setActiveTab('playwright')}
          className={`flex items-center gap-2 rounded-md px-3.5 py-2 text-xs font-medium transition-colors ${
            activeTab === 'playwright'
              ? 'bg-[#28263b] text-[#bfb8ff] shadow-sm'
              : 'text-muted-foreground hover:bg-[#191b24] hover:text-foreground'
          }`}
        >
          <Zap className="size-3.5" />
          <span>4. Ventana Controlada (Playwright Live)</span>
        </button>

        <button
          onClick={() => setActiveTab('url')}
          className={`flex items-center gap-2 rounded-md px-3.5 py-2 text-xs font-medium transition-colors ${
            activeTab === 'url'
              ? 'bg-[#28263b] text-[#bfb8ff] shadow-sm'
              : 'text-muted-foreground hover:bg-[#191b24] hover:text-foreground'
          }`}
        >
          <Globe className="size-3.5" />
          <span>5. Pegar URLs / Guardado Rápido</span>
        </button>
      </div>

      {/* ALTERNATIVA 1: SUBIR ARCHIVO UNIVERSAL (.HAR, .JSON, .ZIP, .CSV, .TXT) */}
      {activeTab === 'file' && (
        <div className="grid gap-6 xl:grid-cols-[1.35fr_1fr]">
          <Card className="border-border/80 bg-card/70">
            <CardHeader>
              <CardTitle className="text-base">
                Importador Universal Sanitizado (.HAR, .JSON, .ZIP, .CSV, Respaldo v2)
              </CardTitle>
              <CardDescription>
                Extrae publicaciones, artículos de X, tarjetas de GitHub y tweets citados desde <code>.HAR</code>, exportaciones de Instagram (<code>.ZIP</code> / <code>saved_posts.json</code>), chats de WhatsApp o respaldos <code>atlas-backup-v2.json</code>. Las cabeceras sensibles (cookies/tokens) se eliminan automáticamente.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              <div
                onClick={() => !isBusy && fileInputRef.current?.click()}
                onDragOver={e => e.preventDefault()}
                onDrop={e => {
                  e.preventDefault()
                  const file = e.dataTransfer.files?.[0]
                  if (file && !isBusy) handleUploadFile(file)
                }}
                className={`grid min-h-[200px] cursor-pointer place-items-center rounded-xl border-2 border-dashed border-[#49436f] bg-[#121319] p-6 text-center transition-all hover:border-[#7c6cf0] hover:bg-[#161822] ${
                  isBusy ? 'opacity-60 pointer-events-none' : ''
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".har,.json,.zip,.js,.csv,.txt,.html,.htm"
                  onChange={e => {
                    const file = e.target.files?.[0]
                    if (file) handleUploadFile(file)
                    e.target.value = ''
                  }}
                  className="hidden"
                />
                <div>
                  <Upload className="mx-auto mb-3 size-9 text-[#8e83f2]" />
                  <p className="text-sm font-medium text-foreground">
                    {isBusy
                      ? 'Validando estructura, extrayendo recursos y guardando en SQLite...'
                      : 'Arrastrá tu archivo aquí o hacé clic para elegirlo'}
                  </p>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    Soporta: <code className="text-[#bfb8ff]">.har</code> (X / IG DevTools) ·{' '}
                    <code className="text-[#bfb8ff]">.zip / .json</code> (Instagram / WhatsApp / Respaldo Atlas v2) ·{' '}
                    <code className="text-[#bfb8ff]">.csv</code> · <code className="text-[#bfb8ff]">.txt</code>
                  </p>
                </div>
              </div>

              {/* Botón rápido para re-verificar / sincronizar los HAR reales en data/raw/x */}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#35314f] bg-[#1b1a29] p-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-foreground">
                      Capturas HAR locales en disco: <code>data/raw/x/</code>
                    </span>
                    <Badge className="border-0 bg-[#283b35] text-[10px] text-[#91d0b4]">
                      100 guardados reales (20 + 80)
                    </Badge>
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Sincroniza todos los archivos HAR almacenados en <code>data/raw/x</code> (incluyendo el lote de 80 elementos) preservando tus notas y ediciones manuales.
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={isBusy}
                  onClick={handleReimportLocalHar}
                  className="border-[#49436f] bg-[#242238] text-xs text-[#bfb8ff] hover:bg-[#2f2c48]"
                >
                  <RefreshCw className={`size-3.5 mr-1.5 ${isBusy ? 'animate-spin' : ''}`} />
                  Sincronizar HARs locales
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Guía verificada paso a paso para HAR en Chrome DevTools */}
          <Card className="border-border/80 bg-card/70">
            <CardHeader>
              <CardTitle className="text-base">Guía Verificada: Captura HAR sin fallos ni archivos de 0 bytes</CardTitle>
              <CardDescription>
                Cómo evitar que Chrome exporte un HAR vacío o sin respuestas de Bookmarks
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 text-xs text-muted-foreground">
              <div className="rounded-lg border border-border bg-[#161821] p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-foreground flex items-center gap-1.5">
                    <XIcon className="size-3.5 text-[#8e83f2]" /> En X / Twitter (vía Chrome / Edge DevTools)
                  </span>
                  <a
                    href="https://x.com/i/bookmarks"
                    target="_blank"
                    rel="noreferrer"
                    className="text-[#a59cf5] hover:underline inline-flex items-center gap-1"
                  >
                    Abrir X Bookmarks <ExternalLink className="size-3" />
                  </a>
                </div>
                <ol className="list-decimal pl-4 space-y-1.5 leading-relaxed">
                  <li>
                    Abrí <strong>F12 → Red (Network)</strong> <em>antes</em> de entrar o recargar <code>x.com/i/bookmarks</code>.
                  </li>
                  <li>
                    Activá el filtro <strong className="text-[#91d0b4]">Fetch/XHR</strong> en la barra de Network (esto evita grabar cientos de MB de videos MP4 que causan archivos HAR de 0 bytes).
                  </li>
                  <li>
                    Marcá <strong>Preserve log</strong>, hacé scroll pausado hacia abajo para que carguen las páginas de <code>Bookmarks</code>.
                  </li>
                  <li>
                    Hacé clic en el ícono <strong>Export HAR (sanitized)...</strong> o clic derecho → <strong>&quot;Save all as HAR with content&quot;</strong> y subilo aquí.
                  </li>
                </ol>
              </div>

              <div className="rounded-lg border border-border bg-[#161821] p-4">
                <div className="flex items-center gap-1.5 mb-1.5 font-medium text-foreground">
                  <ShieldCheck className="size-3.5 text-[#91d0b4]" /> Privacidad y Sanitización Automática
                </div>
                <p className="leading-relaxed">
                  Tanto si exportás un HAR sanitizado desde Chrome como uno completo, Atlas elimina automáticamente <code>cookie</code>, <code>set-cookie</code>, <code>authorization</code> y <code>x-csrf-token</code> antes de guardar el respaldo local.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ALTERNATIVA 2: WHATSAPP (MENSAJES PEGADOS O EXPORTACIÓN DE CHAT .TXT / .ZIP) */}
      {activeTab === 'whatsapp' && (
        <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
          <Card className="border-border/80 bg-card/70">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <MessageCircle className="size-4 text-[#91d0b4]" />
                Incorporar Contenido desde WhatsApp
              </CardTitle>
              <CardDescription>
                Pegá mensajes o enlaces compartidos en WhatsApp, o subí un chat exportado (<code>.txt</code> o <code>.zip</code>). Podés previsualizar y elegir qué mensajes importar a la tabla.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                  Opción A: Pegar uno o varios mensajes / enlaces de WhatsApp
                </label>
                <textarea
                  rows={5}
                  value={waTextInput}
                  onChange={e => setWaTextInput(e.target.value)}
                  placeholder={`[4/11/2026, 20:15:00] Nico: Mirá este repositorio de skills para agentes https://github.com/pbakaus/impeccable\n[4/11/2026, 20:18:10] Ana: Esta herramienta sirve para automatizar flujos https://github.com/n8n-io/n8n`}
                  className="w-full rounded-md border border-border bg-[#121319] p-3 font-mono text-xs text-foreground placeholder:text-muted-foreground focus:border-[#7c6cf0] focus:outline-none"
                />
                <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11px] text-muted-foreground">
                    Soporta formato de WhatsApp Web, iOS, Android o texto libre con URLs.
                  </span>
                  <Button
                    size="sm"
                    disabled={isBusy || !waTextInput.trim()}
                    onClick={handlePreviewWhatsAppText}
                    className="bg-[#213b2f] text-xs text-[#91d0b4] hover:bg-[#2a4b3c]"
                  >
                    Previsualizar mensajes ({waTextInput.trim() ? 'Analizar' : '0'})
                  </Button>
                </div>
              </div>

              <div className="border-t border-border pt-4">
                <label className="mb-2 block text-xs font-medium text-muted-foreground">
                  Opción B: Subir archivo de chat exportado de WhatsApp (<code>.txt</code> o <code>.zip</code> sin multimedia)
                </label>
                <div
                  onClick={() => !isBusy && waFileInputRef.current?.click()}
                  className="flex cursor-pointer items-center justify-between rounded-lg border border-dashed border-[#2d5a43] bg-[#121916] p-4 text-xs transition-colors hover:border-[#91d0b4]"
                >
                  <input
                    ref={waFileInputRef}
                    type="file"
                    accept=".txt,.zip"
                    onChange={e => {
                      const f = e.target.files?.[0]
                      if (f) handleUploadWhatsAppFile(f)
                      e.target.value = ''
                    }}
                    className="hidden"
                  />
                  <div className="flex items-center gap-3">
                    <Upload className="size-5 text-[#91d0b4]" />
                    <div>
                      <p className="font-medium text-foreground">Seleccionar archivo .TXT o .ZIP de WhatsApp</p>
                      <p className="text-[11px] text-muted-foreground">
                        En WhatsApp: Menú del chat → Más → Exportar chat → Sin archivos multimedia.
                      </p>
                    </div>
                  </div>
                  <Badge variant="outline" className="border-[#2d5a43] text-[#91d0b4]">
                    Previsualizar
                  </Badge>
                </div>
              </div>

              {/* Opción C: Hidratar enlaces de WhatsApp (x.com / t.co / webs) y Cazar Repositorios Ocultos */}
              <div className="border-t border-border pt-4">
                <div className="rounded-lg border border-[#3d3566] bg-[#1a1829] p-3.5 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-[#dfdcfb]">
                      🕵️ ¿Te mandaste links sueltos de X, Instagram o herramientas por WhatsApp?
                    </span>
                    <Badge className="bg-[#2c2747] text-[#bfb8ff] border-0 text-[10px]">
                      Cazador Profundo
                    </Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Cuando te enviás a tu propio chat de WhatsApp un link suelto de X (<code>x.com/.../status/...</code>) o de una herramienta, el mensaje no trae el texto ni el repositorio. Con este botón Atlas entra a cada link, recupera el posteo completo, inspecciona hilos/páginas y extrae todos los repositorios de GitHub automáticamente sin duplicar.
                  </p>
                  <Button
                    size="sm"
                    disabled={isBusy}
                    onClick={handleHydrateWhatsAppAndHuntRepos}
                    className="w-full bg-[#7c6cf0] text-xs text-white hover:bg-[#6a5ad8]"
                  >
                    <RefreshCw className={`mr-1.5 size-3.5 ${isBusy ? 'animate-spin' : ''}`} />
                    {isBusy
                      ? 'Hidratando enlaces de WhatsApp y cazando repositorios...'
                      : 'Hidratar Links de WhatsApp/X y Cazar Repositorios Ocultos'}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Panel de Previsualización y Selección de Mensajes de WhatsApp */}
          <Card className="border-border/80 bg-card/70">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">
                    Previsualización de Mensajes ({visibleWaMessages.length})
                  </CardTitle>
                  <CardDescription>
                    Seleccioná qué mensajes guardar e investigar en la tabla principal
                  </CardDescription>
                </div>
                {waPreviewMessages.length > 0 && (
                  <label className="flex cursor-pointer items-center gap-1.5 text-xs text-[#91d0b4]">
                    <input
                      type="checkbox"
                      checked={waOnlyLinks}
                      onChange={e => {
                        const next = e.target.checked
                        setWaOnlyLinks(next)
                        const list = next ? waPreviewMessages.filter(m => m.hasLinks) : waPreviewMessages
                        setWaSelectedIds(new Set(list.map(m => m.id)))
                      }}
                      className="accent-[#91d0b4]"
                    />
                    <span>Solo con enlaces</span>
                  </label>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {visibleWaMessages.length === 0 ? (
                <div className="grid min-h-[220px] place-items-center rounded-lg border border-border/60 bg-[#121319] p-6 text-center text-xs text-muted-foreground">
                  Pegá mensajes o subí un archivo <code>.txt</code> / <code>.zip</code> a la izquierda para previsualizar los recursos detectados antes de guardarlos.
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  <div className="max-h-[300px] space-y-2 overflow-y-auto pr-1">
                    {visibleWaMessages.map(msg => {
                      const checked = waSelectedIds.has(msg.id)
                      return (
                        <div
                          key={msg.id}
                          onClick={() => {
                            const next = new Set(waSelectedIds)
                            if (next.has(msg.id)) next.delete(msg.id)
                            else next.add(msg.id)
                            setWaSelectedIds(next)
                          }}
                          className={`flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 text-xs transition-colors ${
                            checked
                              ? 'border-[#2d5a43] bg-[#162620]'
                              : 'border-border bg-[#121319] opacity-70'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {}}
                            className="mt-0.5 accent-[#91d0b4]"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-medium text-[#91d0b4]">{msg.sender}</span>
                              <span className="text-[10px] text-muted-foreground">
                                {msg.urls.length} enlace{msg.urls.length === 1 ? '' : 's'}
                              </span>
                            </div>
                            <p className="mt-1 line-clamp-2 text-foreground">{msg.text}</p>
                            {msg.urls.length > 0 && (
                              <p className="mt-1 truncate font-mono text-[10px] text-[#a59cf5]">
                                {msg.urls.join(' · ')}
                              </p>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  <Button
                    disabled={isBusy || waSelectedIds.size === 0}
                    onClick={handleImportSelectedWhatsApp}
                    className="w-full bg-[#7c6cf0] text-xs text-white hover:bg-[#6f60dc]"
                  >
                    <Check className="mr-1.5 size-3.5" />
                    Importar {waSelectedIds.size} mensaje(s) seleccionado(s) a la Biblioteca
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ALTERNATIVA 3: EN TU NAVEGADOR (SCRIPT 1-CLIC + EXTENSIÓN CHROME/EDGE) */}
      {activeTab === 'browser' && (
        <div className="grid gap-6 xl:grid-cols-2">
          <Card className="border-border/80 bg-card/70">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Code2 className="size-4 text-[#8e83f2]" />
                  Opción A: Script Capturador de 1 Clic (Sin instalar nada)
                </CardTitle>
                <Badge className="border-0 bg-[#283b35] text-[#91d0b4]">Instantáneo</Badge>
              </div>
              <CardDescription>
                Copiá este script, pegalo en la consola (F12 → Console) estando en tus Guardados de X o Instagram, y descargará automáticamente un JSON listo para subir en el Paso 1.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="relative rounded-lg border border-border bg-[#101217] p-3 font-mono text-[11px] text-muted-foreground max-h-[190px] overflow-y-auto">
                <pre className="whitespace-pre-wrap break-all">{CONSOLE_CAPTURE_SNIPPET}</pre>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <Button
                  onClick={copyConsoleSnippet}
                  className="bg-[#7c6cf0] text-xs text-white hover:bg-[#6f60dc]"
                >
                  {copiedSnippet ? (
                    <>
                      <Check className="size-3.5 mr-1.5" /> ¡Script copiado al portapapeles!
                    </>
                  ) : (
                    <>
                      <Copy className="size-3.5 mr-1.5" /> Copiar Script Capturador
                    </>
                  )}
                </Button>

                <a
                  href="https://x.com/i/bookmarks"
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-[#a59cf5] hover:underline inline-flex items-center gap-1"
                >
                  Ir a X Bookmarks <ExternalLink className="size-3" />
                </a>

                <a
                  href="https://www.instagram.com/"
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-[#f2a8d6] hover:underline inline-flex items-center gap-1"
                >
                  Ir a Instagram <ExternalLink className="size-3" />
                </a>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/80 bg-card/70">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Puzzle className="size-4 text-[#8e83f2]" />
                  Opción B: Extensión Local Chrome / Edge (Incluida)
                </CardTitle>
                <Badge variant="outline" className="border-[#49436f] text-[#bfb8ff]">
                  Manifest V3
                </Badge>
              </div>
              <CardDescription>
                La carpeta <code>browser-extension/</code> de este proyecto incluye una extensión con botón de Pausa, Reanudación y Checkpoint local.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 text-xs text-muted-foreground">
              <div className="rounded-lg border border-border bg-[#161821] p-4 space-y-2 leading-relaxed">
                <p className="font-medium text-foreground">Cómo activarla en Chrome o Edge:</p>
                <ol className="list-decimal pl-4 space-y-1.5">
                  <li>Abrí <code>chrome://extensions</code> o <code>edge://extensions</code> en tu navegador.</li>
                  <li>Activá el interruptor <strong>Modo de desarrollador</strong> (arriba a la derecha).</li>
                  <li>Hacé clic en <strong>Cargar descomprimida</strong> y seleccioná la carpeta <code>browser-extension</code> dentro de este proyecto.</li>
                  <li>Entrá a tus guardados de X o Instagram, abrí el ícono de <strong>Atlas Capturador Local</strong> y pulsá <strong>Iniciar / Reanudar</strong>.</li>
                  <li>Cuando termines, pulsá <strong>Descargar JSON capturado</strong> y subilo en la pestaña 1.</li>
                </ol>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ALTERNATIVA 4: VENTANA CONTROLADA PLAYWRIGHT */}
      {activeTab === 'playwright' && (
        <Card className="border-border/80 bg-card/70">
          <CardHeader>
            <CardTitle className="text-base">
              Extractor Automatizado en Ventana Controlada (Playwright + Perfil Persistente)
            </CardTitle>
            <CardDescription>
              Abre una ventana visible de Chromium con perfil local (<code>.atlas_browser_profile</code>). Iniciás sesión una sola vez y el extractor intercepta las respuestas internas de red mientras hace scroll, guardando directo en SQLite.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col justify-between gap-4 rounded-lg border border-border bg-[#181a23] p-5">
                <div className="flex items-start gap-3">
                  <div className="grid size-10 shrink-0 place-items-center rounded-full bg-black text-white">
                    <XIcon className="size-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-foreground">Extractor en Vivo para X / Twitter</h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Abre <code>x.com/i/bookmarks</code>, intercepta los paquetes GraphQL <code>Bookmarks</code> completos (texto largo, fotos, links expandidos) y los inserta en <code>atlas.db</code>.
                    </p>
                  </div>
                </div>
                <Button
                  onClick={() => handleLaunchPlaywright('x')}
                  className="bg-[#7c6cf0] text-xs text-white hover:bg-[#6f60dc]"
                >
                  <Globe className="size-3.5 mr-1.5" /> Abrir Ventana Controlada (X)
                </Button>
              </div>

              <div className="flex flex-col justify-between gap-4 rounded-lg border border-border bg-[#181a23] p-5">
                <div className="flex items-start gap-3">
                  <div className="grid size-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#ee9d6e] via-[#d85c9c] to-[#6e68d9] text-white">
                    <Camera className="size-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-foreground">Extractor en Vivo para Instagram</h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Abre <code>instagram.com</code>. Navegá a tu perfil → Guardados y el extractor capturará los posts y reels que carguen en la sesión.
                    </p>
                  </div>
                </div>
                <Button
                  onClick={() => handleLaunchPlaywright('instagram')}
                  className="bg-[#38212e] text-xs text-[#f2a8d6] hover:bg-[#48283a]"
                >
                  <Globe className="size-3.5 mr-1.5" /> Abrir Ventana Controlada (Instagram)
                </Button>
              </div>
            </div>

            {pwStatus && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#35314f] bg-[#1b1a29] p-4 text-xs">
                <div className="flex items-center gap-2 text-[#bfb8ff]">
                  <Terminal className="size-4 text-[#8e83f2]" />
                  <span>{pwStatus}</span>
                </div>
                <Button
                  size="xs"
                  variant="outline"
                  onClick={onRefresh}
                  className="border-border text-xs"
                >
                  <RefreshCw className="size-3 mr-1" /> Actualizar conteo ({totalCount})
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ALTERNATIVA 5: PEGAR URLS O GUARDADO MANUAL */}
      {activeTab === 'url' && (
        <Card className="border-border/80 bg-card/70">
          <CardHeader>
            <CardTitle className="text-base">
              Importar por Lote de Enlaces (URLs) o Guardado Rápido
            </CardTitle>
            <CardDescription>
              Pegá uno o varios enlaces de X/Twitter o Instagram (uno por línea). Para enlaces de X, Atlas consulta automáticamente el endpoint público oEmbed para extraer el texto y el autor real sin inventar datos.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleUrlImport} className="flex flex-col gap-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                  Enlaces de publicaciones (uno por línea)
                </label>
                <textarea
                  rows={5}
                  value={urlInput}
                  onChange={e => setUrlInput(e.target.value)}
                  placeholder={`https://x.com/beamnxw/status/2103594988550652353\nhttps://www.instagram.com/p/DBkX28aZ441/`}
                  className="w-full rounded-md border border-border bg-[#121319] p-3 font-mono text-xs text-foreground placeholder:text-muted-foreground focus:border-[#7c6cf0] focus:outline-none"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                    Texto / Nota adicional (opcional, si pegás un post privado o de IG)
                  </label>
                  <input
                    type="text"
                    value={manualCaption}
                    onChange={e => setManualCaption(e.target.value)}
                    placeholder="Se extrae automáticamente en X si lo dejás vacío..."
                    className="h-9 w-full rounded-md border border-border bg-[#121319] px-3 text-xs text-foreground placeholder:text-muted-foreground focus:border-[#7c6cf0] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                    Temas forzados separados por coma (opcional)
                  </label>
                  <input
                    type="text"
                    value={manualTopics}
                    onChange={e => setManualTopics(e.target.value)}
                    placeholder="Ej: IA, Programación, Producto (o automático por reglas)"
                    className="h-9 w-full rounded-md border border-border bg-[#121319] px-3 text-xs text-foreground placeholder:text-muted-foreground focus:border-[#7c6cf0] focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <Button
                  type="submit"
                  disabled={isBusy || !urlInput.trim()}
                  className="bg-[#7c6cf0] text-xs text-white hover:bg-[#6f60dc]"
                >
                  <Sparkles className="size-3.5 mr-1.5" />
                  {isBusy ? 'Extrayendo metadatos y guardando...' : 'Procesar e Importar Enlaces'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* PLANILLA INTERACTIVA TIPO EXCEL DE 2 PESTAÑAS (REPOSITORIOS + SKILLS DENTRO DE LOS REPOSITORIOS) DEBAJO DE CAPTURA */}
      <ReposSkillsExcelTable
        bookmarks={bookmarks}
        onSelectRepoDetail={onOpenRepoDetail}
        title="Tabla Interactiva de Repositorios y Skills (2 Pestañas tipo Excel)"
        subtitle="Consultá acá mismo toda la información de tus Repositorios (Pestaña 1) y los Skills que hay adentro de cada uno (Pestaña 2: qué hace, link al repo, estrellas, comentarios, si se recomienda, empresa y para qué proyecto sirve) sin tener que exportarlos."
      />

      {/* Historial real de importaciones (SQLite) */}
      <Card className="border-border/80 bg-card/70">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Historial Auditable de Importaciones y Capturas</CardTitle>
              <CardDescription>
                Registro persistente de lotes procesados en SQLite (<code>import_history</code>)
              </CardDescription>
            </div>
            <Badge variant="outline" className="border-border text-xs text-muted-foreground">
              {history.length} eventos
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">
              Todavía no hay eventos de importación registrados.
            </p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {history.slice(0, 9).map(ev => (
                <div
                  key={ev.event_id}
                  className="flex flex-col justify-between rounded-lg border border-border bg-[#161821] p-3 text-xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-foreground truncate" title={ev.source_file}>
                      {ev.source_file}
                    </span>
                    <Badge variant="secondary" className="bg-[#242632] text-[10px] text-[#bfb8ff]">
                      {ev.kind}
                    </Badge>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>
                      +{ev.added} nuevos · {ev.updated} enr · {ev.duplicates} dup · Total: {ev.total_records}
                    </span>
                    <span>
                      {new Date(ev.created_at).toLocaleDateString('es-AR', {
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
