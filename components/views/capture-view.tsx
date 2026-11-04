'use client'

import React, { useState, useEffect, useRef } from 'react'
import {
  Zap, Check, RefreshCw, Upload, Terminal, X as XIcon, Camera,
  FileJson, Globe, Sparkles, Copy, ExternalLink, FolderArchive,
  CheckCircle2, AlertCircle, Database, Code2, Puzzle
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ImportHistoryEntry, ImportResult } from '@/lib/types'

interface CaptureViewProps {
  onRefresh: () => Promise<void>
  onNavigateLibrary: () => void
  totalCount: number
  history: ImportHistoryEntry[]
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
  history
}: CaptureViewProps) {
  const [activeTab, setActiveTab] = useState<'file' | 'browser' | 'playwright' | 'url'>('file')
  const [isBusy, setIsBusy] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const [lastResult, setLastResult] = useState<ImportResult | null>(null)
  const [copiedSnippet, setCopiedSnippet] = useState(false)

  // URL Batch & Manual input state
  const [urlInput, setUrlInput] = useState('')
  const [manualCaption, setManualCaption] = useState('')
  const [manualTopics, setManualTopics] = useState('')

  // Playwright live logs
  const [pwStatus, setPwStatus] = useState<string>('')

  const fileInputRef = useRef<HTMLInputElement>(null)

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
        `Archivo "${file.name}" procesado: ${data.added} nuevos, ${data.updated} enriquecidos, ${data.duplicates} duplicados ignorados.`
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
        throw new Error(data.error || 'No se pudo sincronizar el archivo HAR local.')
      }
      setLastResult(data)
      setSuccessMsg(
        `Sincronización de HAR local (x.com.initial.har) completada: ${data.total} guardados únicos en base de datos (${data.added} nuevos, ${data.duplicates} ya existentes).`
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

  return (
    <div className="flex flex-col gap-7">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="mb-2 text-xs uppercase tracking-[0.16em] text-[#8e83f2]">
            4 Alternativas Reales · Local-First
          </p>
          <h1 className="font-serif text-3xl sm:text-4xl tracking-[-0.04em] text-foreground">
            Captura e Importación
          </h1>
          <p className="mt-2 text-sm text-muted-foreground max-w-3xl">
            Elegí el método más simple según lo que tengas a mano: archivo de red (<code>.HAR</code>), exportación oficial (<code>.JSON</code> / <code>.ZIP</code>), script de 1 clic o extensión para tu navegador, ventana automática o enlaces directos.
          </p>
        </div>

        <Badge variant="outline" className="border-[#35314f] bg-[#161822] px-3 py-1.5 text-xs text-[#a59cf5]">
          <Database className="size-3.5 mr-1.5 text-[#91d0b4]" />
          {totalCount} guardados únicos en archivo
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
              Ver en Biblioteca
            </Button>
            <button onClick={() => setSuccessMsg('')} className="ml-1 text-muted-foreground hover:text-white">
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Resumen numérico de última operación */}
      {lastResult && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[
            { label: 'Nuevos agregados', value: lastResult.added, color: 'text-[#91d0b4]' },
            { label: 'Enriquecidos / Merge', value: lastResult.updated, color: 'text-[#bfb8ff]' },
            { label: 'Duplicados omitidos', value: lastResult.duplicates, color: 'text-muted-foreground' },
            { label: 'Errores de formato', value: lastResult.errors, color: 'text-[#f0c982]' },
            { label: 'Total en base local', value: lastResult.total, color: 'text-foreground' }
          ].map(stat => (
            <div
              key={stat.label}
              className="rounded-lg border border-border bg-[#16181f] p-3.5"
            >
              <p className={`text-2xl font-semibold ${stat.color}`}>{stat.value}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">{stat.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Selector de las 4 Alternativas */}
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
            Recomendado
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
          <span>2. En tu Navegador (Script 1-Clic / Extensión)</span>
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
          <span>3. Ventana Controlada (Playwright Live)</span>
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
          <span>4. Pegar URLs / Guardado Rápido</span>
        </button>
      </div>

      {/* ALTERNATIVA 1: SUBIR ARCHIVO UNIVERSAL (.HAR, .JSON, .ZIP, .CSV, .TXT) */}
      {activeTab === 'file' && (
        <div className="grid gap-6 xl:grid-cols-[1.35fr_1fr]">
          <Card className="border-border/80 bg-card/70">
            <CardHeader>
              <CardTitle className="text-base">
                Importador Universal de Archivos (100% Local y Sin Riesgo de Bloqueo)
              </CardTitle>
              <CardDescription>
                Acepta capturas <code>.HAR</code> de Chrome/Edge, exportaciones oficiales de Instagram (<code>.ZIP</code>, <code>saved_posts.json</code>), archivos de X (<code>bookmarks.js</code>), JSON de la extensión Atlas, CSV o TXT.
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
                className={`grid min-h-[210px] cursor-pointer place-items-center rounded-xl border-2 border-dashed border-[#49436f] bg-[#121319] p-6 text-center transition-all hover:border-[#7c6cf0] hover:bg-[#161822] ${
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
                      ? 'Procesando, deduplicando y clasificando archivo...'
                      : 'Arrastrá tu archivo aquí o hacé clic para elegirlo'}
                  </p>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    Soporta: <code className="text-[#bfb8ff]">.har</code> (X / IG DevTools) ·{' '}
                    <code className="text-[#bfb8ff]">.zip / .json</code> (Instagram / X) ·{' '}
                    <code className="text-[#bfb8ff]">.csv</code> · <code className="text-[#bfb8ff]">.txt</code>
                  </p>
                </div>
              </div>

              {/* Botón rápido para re-verificar / sincronizar el HAR real local */}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#35314f] bg-[#1b1a29] p-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-foreground">
                      Captura HAR local detectada: <code>data/raw/x/x.com.initial.har</code>
                    </span>
                    <Badge className="border-0 bg-[#283b35] text-[10px] text-[#91d0b4]">
                      20 guardados reales
                    </Badge>
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Podés volver a sincronizar el archivo HAR local en cualquier momento sin duplicar registros ni perder tus ediciones manuales.
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
                  Sincronizar HAR local
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Guía rápida paso a paso para HAR e Instagram */}
          <Card className="border-border/80 bg-card/70">
            <CardHeader>
              <CardTitle className="text-base">¿Cómo exportar tus guardados en 30 segundos?</CardTitle>
              <CardDescription>
                Las dos vías más limpias sin pagar API ni exponer tu cuenta
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 text-xs text-muted-foreground">
              <div className="rounded-lg border border-border bg-[#161821] p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-foreground flex items-center gap-1.5">
                    <XIcon className="size-3.5 text-[#8e83f2]" /> En X / Twitter (vía archivo .HAR)
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
                  <li>Abrí <code>x.com/i/bookmarks</code> en tu navegador y presioná <strong>F12</strong> (pestaña <strong>Red / Network</strong>).</li>
                  <li>Hacé scroll hacia abajo por tus guardados para que carguen en pantalla.</li>
                  <li>Hacé clic derecho en la lista de Red → <strong>&quot;Save all as HAR with content&quot;</strong> y soltá ese archivo <code>.har</code> aquí.</li>
                </ol>
              </div>

              <div className="rounded-lg border border-border bg-[#161821] p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-foreground flex items-center gap-1.5">
                    <Camera className="size-3.5 text-[#f2a8d6]" /> En Instagram (Export oficial ZIP / JSON)
                  </span>
                  <a
                    href="https://accountscenter.instagram.com/info_and_permissions/"
                    target="_blank"
                    rel="noreferrer"
                    className="text-[#f2a8d6] hover:underline inline-flex items-center gap-1"
                  >
                    Centro de Cuentas <ExternalLink className="size-3" />
                  </a>
                </div>
                <ol className="list-decimal pl-4 space-y-1.5 leading-relaxed">
                  <li>En Centro de cuentas de Meta → <strong>Tu información y permisos</strong> → <strong>Descargar tu información</strong>.</li>
                  <li>Elegí formato <strong>JSON</strong> y subí directamente el archivo <code>.zip</code> o <code>saved_posts.json</code> aquí.</li>
                  <li>Atlas conserva automáticamente los nombres de tus <strong>Colecciones</strong>.</li>
                </ol>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ALTERNATIVA 2: EN TU NAVEGADOR (SCRIPT 1-CLIC + EXTENSIÓN CHROME/EDGE) */}
      {activeTab === 'browser' && (
        <div className="grid gap-6 xl:grid-cols-2">
          {/* Opción 2A: Script de Consola 1-Clic (Sin instalar nada) */}
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

          {/* Opción 2B: Extensión de Navegador Chrome/Edge incluida */}
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

      {/* ALTERNATIVA 3: VENTANA CONTROLADA PLAYWRIGHT */}
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

      {/* ALTERNATIVA 4: PEGAR URLS O GUARDADO MANUAL */}
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

      {/* Historial real de importaciones (SQLite) */}
      <Card className="border-border/80 bg-card/70">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Historial de Importaciones y Capturas</CardTitle>
              <CardDescription>
                Registro auditable de lotes importados en tu base de datos local
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
                      +{ev.added} nuevos · {ev.duplicates} dup · Total: {ev.total_records}
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
