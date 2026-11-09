import type {
  BookmarkItem,
  GalleryRepository,
  ResourceType
} from './types'
import type { SkillRecommendationVerdict } from './repo-skills-extractor'

const DURABLE_STORAGE_KEY = 'atlas_durable_state_v1'

export interface DurableClientState {
  repoNotes: Record<string, string>
  skillNotes: Record<
    string,
    {
      comments?: string
      recommended?: SkillRecommendationVerdict
      updatedAt: string
    }
  >
  bookmarkOverrides: Record<
    string,
    {
      resourceType?: ResourceType
      topics?: string[]
      manualFields?: string[]
      updatedAt: string
    }
  >
}

function getEmptyState(): DurableClientState {
  return {
    repoNotes: {},
    skillNotes: {},
    bookmarkOverrides: {}
  }
}

export function readDurableClientState(): DurableClientState {
  if (typeof window === 'undefined') return getEmptyState()
  try {
    const raw = window.localStorage.getItem(DURABLE_STORAGE_KEY)
    if (!raw) return getEmptyState()
    const parsed = JSON.parse(raw)
    return {
      repoNotes: parsed?.repoNotes && typeof parsed.repoNotes === 'object' ? parsed.repoNotes : {},
      skillNotes: parsed?.skillNotes && typeof parsed.skillNotes === 'object' ? parsed.skillNotes : {},
      bookmarkOverrides:
        parsed?.bookmarkOverrides && typeof parsed.bookmarkOverrides === 'object'
          ? parsed.bookmarkOverrides
          : {}
    }
  } catch {
    return getEmptyState()
  }
}

function writeDurableClientState(state: DurableClientState): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(DURABLE_STORAGE_KEY, JSON.stringify(state))
  } catch {}
}

export function recordDurableRepoNote(fullName: string, notes: string): void {
  const state = readDurableClientState()
  state.repoNotes[fullName.toLowerCase()] = notes
  writeDurableClientState(state)
}

export function recordDurableSkillNote(
  skillId: string,
  patch: { comments?: string; recommended?: SkillRecommendationVerdict }
): void {
  const state = readDurableClientState()
  const prev = state.skillNotes[skillId] || { updatedAt: new Date().toISOString() }
  state.skillNotes[skillId] = {
    ...prev,
    ...(patch.comments !== undefined ? { comments: patch.comments } : {}),
    ...(patch.recommended !== undefined ? { recommended: patch.recommended } : {}),
    updatedAt: new Date().toISOString()
  }
  writeDurableClientState(state)
}

export function recordDurableBookmarkOverride(
  bookmarkId: string,
  patch: { resourceType?: ResourceType; topics?: string[]; manualFields?: string[] }
): void {
  const state = readDurableClientState()
  state.bookmarkOverrides[bookmarkId] = {
    ...state.bookmarkOverrides[bookmarkId],
    ...patch,
    updatedAt: new Date().toISOString()
  }
  writeDurableClientState(state)
}

/**
 * Fusiona de inmediato el estado durable del navegador sobre los repositorios recibidos del servidor,
 * garantizando que en Vercel (serverless) nunca se pierdan comentarios ni recomendaciones tras un cold start.
 */
export function applyDurableClientStateToRepos(repos: GalleryRepository[]): GalleryRepository[] {
  const state = readDurableClientState()
  const hasRepoNotes = Object.keys(state.repoNotes).length > 0
  if (!hasRepoNotes) return repos

  return repos.map(r => {
    const key = r.fullName.toLowerCase()
    if (key in state.repoNotes && state.repoNotes[key] !== r.notes) {
      return { ...r, notes: state.repoNotes[key] }
    }
    return r
  })
}

/**
 * Fusiona el estado durable del navegador sobre los guardados recibidos del servidor,
 * conservando cualquier separación de "Archivos Separados / Otros Temas" o edición manual.
 */
export function applyDurableClientStateToBookmarks(bookmarks: BookmarkItem[]): BookmarkItem[] {
  const state = readDurableClientState()
  const hasOverrides = Object.keys(state.bookmarkOverrides).length > 0
  if (!hasOverrides) return bookmarks

  return bookmarks.map(bm => {
    const ov = state.bookmarkOverrides[bm.id]
    if (!ov) return bm
    return {
      ...bm,
      ...(ov.resourceType ? { resourceType: ov.resourceType } : {}),
      ...(ov.topics ? { topics: ov.topics } : {}),
      ...(ov.manualFields ? { manualFields: ov.manualFields as any } : {})
    }
  })
}

/**
 * Re-sincroniza silenciosamente hacia el servidor cualquier cambio guardado en el navegador
 * si la instancia serverless de Vercel se reinició.
 */
export async function replayDurableStateToServer(
  serverRepos: GalleryRepository[],
  serverBookmarks: BookmarkItem[]
): Promise<void> {
  if (typeof window === 'undefined') return
  const state = readDurableClientState()

  for (const r of serverRepos) {
    const key = r.fullName.toLowerCase()
    if (key in state.repoNotes && state.repoNotes[key] !== (r.notes || '')) {
      fetch('/api/github/repos', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: r.id, notes: state.repoNotes[key] })
      }).catch(() => {})
    }
  }

  for (const [skillId, note] of Object.entries(state.skillNotes)) {
    fetch('/api/github/repos', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        skillNote: {
          skillId,
          comments: note.comments,
          recommended: note.recommended
        }
      })
    }).catch(() => {})
  }

  for (const bm of serverBookmarks) {
    const ov = state.bookmarkOverrides[bm.id]
    if (ov && (ov.resourceType !== bm.resourceType || JSON.stringify(ov.topics) !== JSON.stringify(bm.topics))) {
      fetch(`/api/bookmarks/${encodeURIComponent(bm.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resourceType: ov.resourceType,
          topics: ov.topics
        })
      }).catch(() => {})
    }
  }
}

/**
 * Instalador Universal de Skills en 1 Clic (Funciona tanto en localhost:3071 como en Vercel):
 * 1. Si estás en Vercel (`vercel.app`), intenta primero conectarse al puente local `http://localhost:3071/api/github/install-local`
 *    para clonar directamente en tu disco local (`skills-installed/`).
 * 2. Si el servidor local no está prendido, ejecuta en la nube y descarga automáticamente el archivo `SKILL.md`
 *    listo para usar en tu PC + copia el comando de instalación al portapapeles.
 */
export async function installSkillOrRepoUniversal(params: {
  fullName: string
  installMode?: 'skill_clone' | 'repo_clone' | 'mcp_config'
  repository?: Partial<GalleryRepository>
}): Promise<{
  success: boolean
  messageEs: string
  installedOnLocalDisk: boolean
  downloadedPortableFile?: boolean
}> {
  const isRemoteHost =
    typeof window !== 'undefined' &&
    window.location.hostname !== 'localhost' &&
    window.location.hostname !== '127.0.0.1'

  const payload = {
    fullName: params.fullName,
    installMode: params.installMode || 'skill_clone',
    repository: params.repository
  }

  // 1. Si estamos en Vercel, probar primero puente directo con tu servidor local en puerto 3071
  if (isRemoteHost) {
    try {
      const localBridgeRes = await fetch('http://localhost:3071/api/github/install-local', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(4500)
      })
      if (localBridgeRes.ok) {
        const localData = await localBridgeRes.json()
        if (localData?.success) {
          return {
            success: true,
            messageEs: `${localData.messageEs} (Instalado directamente en tu PC vía puente local localhost:3071)`,
            installedOnLocalDisk: true
          }
        }
      }
    } catch {
      // Local server not running on 3071; continue to cloud + portable file download
    }
  }

  // 2. Llamar al endpoint del servidor actual
  const res = await fetch('/api/github/install-local', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  const data = await res.json()
  if (!res.ok || !data?.success) {
    throw new Error(data?.error || 'No se pudo completar la instalación.')
  }

  // Si corrió en la nube (Vercel) y devolvió portableBundle, descargar automáticamente el SKILL.md / config a la PC del usuario
  if (data.isCloudEphemeral && data.portableBundle?.content && typeof window !== 'undefined') {
    const safeName = (params.fullName.split('/')[1] || 'skill').replace(/[^a-zA-Z0-9_-]/g, '-')
    const downloadFileName =
      params.installMode === 'mcp_config'
        ? `mcp_servers_${safeName}.json`
        : `${safeName}-SKILL.md`

    const blob = new Blob([data.portableBundle.content], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = downloadFileName
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)

    if (data.portableBundle.windowsCommand && navigator.clipboard) {
      navigator.clipboard.writeText(data.portableBundle.windowsCommand).catch(() => {})
    }

    return {
      success: true,
      messageEs: `Descargado "${downloadFileName}" directamente a tu PC y copiado el comando de instalación al portapapeles.`,
      installedOnLocalDisk: false,
      downloadedPortableFile: true
    }
  }

  return {
    success: true,
    messageEs: data.messageEs || `Instalado correctamente (${params.fullName}).`,
    installedOnLocalDisk: true
  }
}
