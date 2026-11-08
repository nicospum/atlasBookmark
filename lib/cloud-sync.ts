import type { BookmarkItem, GalleryRepository, ProjectBlueprint } from './types'

export const CLOUD_SYNC_GIST_FILENAME = 'atlas-bookmark-cloud-sync.json'

export interface CloudSyncBundle {
  version: '2.0'
  app: string
  syncedAt: string
  exportedAt: string
  counts: {
    bookmarks: number
    repositories: number
    blueprints: number
  }
  bookmarks: BookmarkItem[]
  repositories: GalleryRepository[]
  blueprints: ProjectBlueprint[]
}

export function normalizeGistId(input: string | undefined | null): string {
  if (!input || typeof input !== 'string') return ''
  const trimmed = input.trim().replace(/\/+$/, '')
  if (!trimmed) return ''

  // Handle full URLs like https://gist.github.com/username/0123456789abcdef
  const urlMatch = trimmed.match(/gist\.github\.com\/(?:[^/]+\/)?([a-fA-F0-9]{8,64})/i)
  if (urlMatch) return urlMatch[1]

  const clean = trimmed.split('/').pop() || ''
  return clean.replace(/[^a-zA-Z0-9_-]/g, '')
}

export function buildCloudSyncBundle(params: {
  bookmarks: BookmarkItem[]
  repositories: GalleryRepository[]
  blueprints: ProjectBlueprint[]
}): CloudSyncBundle {
  const bookmarks = Array.isArray(params.bookmarks) ? params.bookmarks : []
  const repositories = Array.isArray(params.repositories) ? params.repositories : []
  const blueprints = Array.isArray(params.blueprints) ? params.blueprints : []
  const now = new Date().toISOString()

  return {
    version: '2.0',
    app: 'Atlas de Guardados & GitHub Visual Gallery',
    syncedAt: now,
    exportedAt: now,
    counts: {
      bookmarks: bookmarks.length,
      repositories: repositories.length,
      blueprints: blueprints.length
    },
    bookmarks,
    repositories,
    blueprints
  }
}

export async function pushSyncBundleToGitHubGist(params: {
  token: string
  gistId?: string
  bundle: any
}): Promise<{ gistId: string; htmlUrl: string; updatedAt: string }> {
  const cleanToken = (params.token || process.env.GITHUB_TOKEN || '').trim()
  if (!cleanToken) {
    throw new Error(
      'Se requiere un Personal Access Token de GitHub (con permiso "gist") para sincronizar en la nube.'
    )
  }

  const cleanGistId = normalizeGistId(params.gistId)
  const serialized = JSON.stringify(params.bundle ?? {}, null, 2)
  const timestampLabel = new Date().toISOString().slice(0, 19).replace('T', ' ')

  const payload = {
    description: `Atlas de Guardados & GitHub Visual Gallery — Cloud Sync (${timestampLabel} UTC)`,
    public: false,
    files: {
      [CLOUD_SYNC_GIST_FILENAME]: {
        content: serialized
      }
    }
  }

  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
    Authorization: `Bearer ${cleanToken}`,
    'Content-Type': 'application/json',
    'User-Agent': 'Atlas-Bookmark-Cloud-Sync/2.0'
  }

  let res: Response | null = null

  if (cleanGistId) {
    res = await fetch(`https://api.github.com/gists/${cleanGistId}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(20000)
    })

    // If the provided Gist ID no longer exists, create a new private Gist
    if (res.status === 404) {
      res = null
    }
  }

  if (!res) {
    res = await fetch('https://api.github.com/gists', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(20000)
    })
  }

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new Error(
        'GitHub rechazó el token al guardar el Gist (HTTP ' +
          res.status +
          '). Verificá que tu Personal Access Token tenga el permiso "gist" habilitado.'
      )
    }
    throw new Error(`Error al guardar el snapshot en GitHub Gist (HTTP ${res.status}).`)
  }

  const data = await res.json()
  return {
    gistId: String(data.id || cleanGistId),
    htmlUrl: String(data.html_url || `https://gist.github.com/${data.id || cleanGistId}`),
    updatedAt: String(data.updated_at || new Date().toISOString())
  }
}

export async function pullSyncBundleFromGitHubGist(params: {
  token?: string
  gistId: string
}): Promise<any> {
  const cleanGistId = normalizeGistId(params.gistId)
  if (!cleanGistId) {
    throw new Error('Ingresá un Gist ID o URL de GitHub Gist válido para restaurar.')
  }

  const cleanToken = (params.token || process.env.GITHUB_TOKEN || '').trim()
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'Atlas-Bookmark-Cloud-Sync/2.0'
  }
  if (cleanToken) {
    headers.Authorization = `Bearer ${cleanToken}`
  }

  const res = await fetch(`https://api.github.com/gists/${cleanGistId}`, {
    headers,
    signal: AbortSignal.timeout(15000)
  })

  if (!res.ok) {
    if (res.status === 404) {
      throw new Error(
        `No se encontró el Gist "${cleanGistId}" o es privado y requiere un GitHub Token.`
      )
    }
    throw new Error(`Error al descargar el Gist desde GitHub (HTTP ${res.status}).`)
  }

  const data = await res.json()
  const files: Record<string, any> = data?.files || {}
  const targetFile =
    files[CLOUD_SYNC_GIST_FILENAME] ||
    Object.values(files).find(
      (f: any) => f && typeof f.filename === 'string' && f.filename.endsWith('.json')
    ) ||
    Object.values(files)[0]

  if (!targetFile) {
    throw new Error('El Gist no contiene el archivo atlas-bookmark-cloud-sync.json.')
  }

  let rawJsonText = typeof targetFile.content === 'string' ? targetFile.content : ''

  if ((targetFile.truncated || !rawJsonText) && targetFile.raw_url) {
    const rawRes = await fetch(String(targetFile.raw_url), {
      headers: cleanToken ? { Authorization: `Bearer ${cleanToken}` } : undefined,
      signal: AbortSignal.timeout(20000)
    })
    if (rawRes.ok) {
      rawJsonText = await rawRes.text()
    }
  }

  if (!rawJsonText) {
    throw new Error('El archivo de sincronización en el Gist está vacío.')
  }

  const parsed = JSON.parse(rawJsonText)
  return {
    ...parsed,
    bookmarks: Array.isArray(parsed?.bookmarks) ? parsed.bookmarks : [],
    repositories: Array.isArray(parsed?.repositories) ? parsed.repositories : [],
    blueprints: Array.isArray(parsed?.blueprints) ? parsed.blueprints : []
  }
}
