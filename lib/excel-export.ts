import * as XLSX from 'xlsx'
import { BookmarkItem } from './types'

export interface ExportOptions {
  sheets: string[]
  columns: string[]
  filename?: string
  onlyReviewed?: boolean
}

export const ALL_SHEETS = ['Resumen', 'Todos', 'Por tema', 'Por fuente', 'Errores', 'Manifest']

export const TABLE_DEFAULT_COLUMNS = [
  'Nombre / recurso',
  'Para qué sirve',
  'Tipo',
  'Área / tema',
  'Enlaces útiles',
  'Evaluación breve',
  'Estado del análisis',
  'Origen'
]

export const AVAILABLE_COLUMNS = [
  'Nombre / recurso',
  'Para qué sirve',
  'Tipo',
  'Área / tema',
  'Enlaces útiles',
  'Repositorios GitHub',
  'Evaluación breve',
  'Estado del análisis',
  'Origen',
  'Autor',
  'Handle / Usuario',
  'Notas',
  'Texto completo',
  'Resumen IA',
  'Colecciones',
  'Entidades',
  'Confianza',
  'Método de análisis',
  'Idioma',
  'Dominio',
  'Fecha publicación',
  'Fecha guardado',
  'Enlaces salientes',
  'Multimedia',
  'URL Original',
  'Estado',
  'ID'
]

export function formatAnalysisStateLabel(state?: BookmarkItem['analysisState']): string {
  switch (state) {
    case 'completed':
      return 'Completado'
    case 'partial':
      return 'Parcial'
    case 'error':
      return 'Error'
    case 'pending':
    default:
      return 'Pendiente'
  }
}

export function formatOriginLabel(item: BookmarkItem): string {
  const plat =
    item.platform === 'x' ? 'X' : item.platform === 'instagram' ? 'Instagram' : 'WhatsApp'
  if (item.sourceUrl && item.sourceUrl.startsWith('http')) {
    return `${plat} (${item.sourceUrl})`
  }
  return plat
}

export function formatUsefulLinks(item: BookmarkItem): string {
  const resources = item.resources || []
  const parts: string[] = []
  for (const r of resources) {
    const target = r.resolvedUrl || r.url
    if (!target) continue
    if (r.kind === 'github_repo') {
      parts.push(`GitHub: ${target}`)
    } else if (r.kind === 'docs') {
      parts.push(`Docs: ${target}`)
    } else if (r.kind === 'article') {
      parts.push(`Artículo: ${target}`)
    } else {
      parts.push(`Sitio: ${target}`)
    }
  }
  if (parts.length === 0 && item.outgoingLinks.length > 0) {
    return item.outgoingLinks.join(' | ')
  }
  return parts.join(' | ')
}

export function formatGitHubRepos(item: BookmarkItem): string {
  const repos = (item.resources || [])
    .filter(r => r.kind === 'github_repo')
    .map(r => r.resolvedUrl || r.url)
  if (repos.length > 0) return Array.from(new Set(repos)).join(' | ')
  const fallback = item.outgoingLinks.filter(u => u.toLowerCase().includes('github.com/'))
  return Array.from(new Set(fallback)).join(' | ')
}

function sanitizeFormulaCell(val: string): string {
  if (/^[=+\-@]/.test(val)) {
    return `'${val}`
  }
  return val
}

export function mapItemToRow(
  item: BookmarkItem,
  columns: string[] = AVAILABLE_COLUMNS
): Record<string, string | number> {
  const confidenceStr =
    typeof item.confidence === 'number'
      ? `${Math.round(item.confidence * 100)}%`
      : item.confidence
      ? String(item.confidence)
      : ''

  const all: Record<string, string | number> = {
    'Nombre / recurso': item.title || item.caption.slice(0, 80) || item.authorHandle || item.id,
    'Para qué sirve': item.purpose || item.aiSummary || '',
    'Tipo': item.resourceType || 'Otro / pendiente de clasificar',
    'Área / tema': item.topics.join(', '),
    'Temas': item.topics.join(', '),
    'Enlaces útiles': formatUsefulLinks(item),
    'Repositorios GitHub': formatGitHubRepos(item),
    'Evaluación breve': item.evaluation || '',
    'Estado del análisis': formatAnalysisStateLabel(item.analysisState),
    'Origen': formatOriginLabel(item),
    'Fuente':
      item.platform === 'x' ? 'X / Twitter' : item.platform === 'instagram' ? 'Instagram' : 'WhatsApp',
    'ID': item.id,
    'Texto completo': item.caption || '',
    'Autor': item.authorName || '',
    'Handle / Usuario': item.authorHandle || '',
    'Handle': item.authorHandle || '',
    'Notas': item.notes || '',
    'Dominio': item.domain || '',
    'Fecha publicación': item.publishedAt || '',
    'Fecha guardado': item.savedAt || '',
    'Colecciones': (item.collections || []).join(', '),
    'Entidades': item.entities.join(', '),
    'Resumen IA': item.aiSummary || '',
    'Confianza': confidenceStr,
    'Método de análisis':
      item.analysisMethod === 'gemini'
        ? 'IA Cloud (Gemini)'
        : item.analysisMethod === 'ollama'
        ? 'IA Local (Ollama)'
        : item.analysisMethod === 'investigator'
        ? 'Investigador de enlaces y GitHub'
        : item.classificationStatus === 'manual'
        ? 'Edición Manual'
        : 'Reglas determinísticas locales',
    'Idioma': item.language || '',
    'Enlaces salientes': item.outgoingLinks.join(' | '),
    'Multimedia': item.mediaUrls.join(' | '),
    'URL Original': item.sourceUrl,
    'Estado': item.reviewed ? 'Revisado' : 'Pendiente'
  }

  const row: Record<string, string | number> = {}
  for (const col of columns) {
    if (col in all) {
      row[col] = String(all[col] ?? '').slice(0, 32767)
    }
  }
  return row
}

export function getSheetRows(
  items: BookmarkItem[],
  sheet: string,
  columns: string[] = AVAILABLE_COLUMNS
): Record<string, any>[] {
  if (sheet === 'Resumen') {
    const totalX = items.filter(i => i.platform === 'x').length
    const totalIg = items.filter(i => i.platform === 'instagram').length
    const totalWa = items.filter(i => i.platform === 'whatsapp').length
    const reviewedCount = items.filter(i => i.reviewed).length
    const withMedia = items.filter(i => i.mediaType !== 'none' && i.mediaUrls.length > 0).length
    const withGitHub = items.filter(i => Boolean(formatGitHubRepos(i))).length
    const linkOnly = items.filter(i => !i.caption).length

    const topicMap: Record<string, number> = {}
    const typeMap: Record<string, number> = {}
    items.forEach(i => {
      i.topics.forEach(t => {
        topicMap[t] = (topicMap[t] || 0) + 1
      })
      const rt = i.resourceType || 'Otro / pendiente de clasificar'
      typeMap[rt] = (typeMap[rt] || 0) + 1
    })

    return [
      { Métrica: 'Reporte generado (ISO UTC)', Valor: new Date().toISOString() },
      { Métrica: 'Total de guardados únicos', Valor: items.length },
      { Métrica: 'Guardados de X / Twitter', Valor: totalX },
      { Métrica: 'Guardados de Instagram', Valor: totalIg },
      { Métrica: 'Guardados de WhatsApp', Valor: totalWa },
      { Métrica: 'Con repositorios de GitHub detectados', Valor: withGitHub },
      { Métrica: 'Con multimedia detectada', Valor: withMedia },
      { Métrica: 'Elementos revisados', Valor: reviewedCount },
      { Métrica: 'Elementos pendientes de revisión', Valor: items.length - reviewedCount },
      { Métrica: 'Solo enlace (sin texto)', Valor: linkOnly },
      { Métrica: '--- DESGLOSE POR TIPO DE RECURSO ---', Valor: '--- CANTIDAD ---' },
      ...Object.entries(typeMap)
        .sort((a, b) => b[1] - a[1])
        .map(([rtype, count]) => ({
          Métrica: rtype,
          Valor: count
        })),
      { Métrica: '--- DESGLOSE POR ÁREA / TEMA ---', Valor: '--- CANTIDAD ---' },
      ...Object.entries(topicMap)
        .sort((a, b) => b[1] - a[1])
        .map(([topic, count]) => ({
          Métrica: topic,
          Valor: count
        }))
    ]
  }

  if (sheet === 'Por tema') {
    return items
      .flatMap(item => {
        const topics = item.topics.length ? item.topics : ['Sin clasificar']
        return topics.map(t => ({
          Tema: t,
          ...mapItemToRow(item, columns)
        }))
      })
      .sort((a, b) => String(a.Tema).localeCompare(String(b.Tema)))
  }

  if (sheet === 'Por fuente') {
    const sorted = [...items].sort(
      (a, b) =>
        a.platform.localeCompare(b.platform) ||
        (a.authorHandle || a.authorName).localeCompare(b.authorHandle || b.authorName)
    )
    return sorted.map(i => mapItemToRow(i, columns))
  }

  if (sheet === 'Errores') {
    const errItems = items.filter(i => i.error || i.analysisState === 'error')
    if (errItems.length === 0) {
      return [{ ID: '', Archivo: '', Estado: 'OK', Detalle: 'Sin errores registrados en el archivo actual' }]
    }
    return errItems.map(i => ({
      ID: i.id,
      Archivo: i.provenance || '',
      Estado: 'Error',
      Detalle: i.error || 'Error en análisis'
    }))
  }

  if (sheet === 'Manifest') {
    const sources = Array.from(new Set(items.map(i => i.provenance || i.captureSource || 'local').filter(Boolean)))
    return [
      { Campo: 'schema', Valor: 'atlas-unified-legacy-v2' },
      { Campo: 'exported_at', Valor: new Date().toISOString() },
      { Campo: 'workbook_total_records', Valor: items.length },
      { Campo: 'x_records', Valor: items.filter(i => i.platform === 'x').length },
      { Campo: 'instagram_records', Valor: items.filter(i => i.platform === 'instagram').length },
      { Campo: 'whatsapp_records', Valor: items.filter(i => i.platform === 'whatsapp').length },
      { Campo: 'with_github_repos', Valor: items.filter(i => Boolean(formatGitHubRepos(i))).length },
      { Campo: 'manual_classifications', Valor: items.filter(i => i.classificationStatus === 'manual').length },
      { Campo: 'capture_sources', Valor: sources.join(' | ') },
      { Campo: 'archive_verified', Valor: 'yes' }
    ]
  }

  // Default: 'Todos'
  return items.map(i => mapItemToRow(i, columns))
}

export function buildWorkbook(items: BookmarkItem[], options: ExportOptions) {
  const wb = XLSX.utils.book_new()
  const eligible = options.onlyReviewed ? items.filter(i => i.reviewed) : items
  const sheetsToInclude = options.sheets.length > 0 ? options.sheets : ALL_SHEETS
  const activeCols = options.columns && options.columns.length > 0 ? options.columns : TABLE_DEFAULT_COLUMNS

  for (const sheetName of sheetsToInclude) {
    if (!ALL_SHEETS.includes(sheetName)) {
      throw new Error(`Hoja de Excel no válida: "${sheetName}"`)
    }
    const rows = getSheetRows(eligible, sheetName, activeCols)
    const ws = XLSX.utils.json_to_sheet(rows)

    // Ensure no cell is interpreted as a formula (prevent formula injection)
    for (const [key, cell] of Object.entries(ws)) {
      if (key.startsWith('!')) continue
      if (cell && typeof cell === 'object') {
        if ('f' in cell) {
          delete (cell as any).f
          ;(cell as any).t = 's'
        }
        if (typeof (cell as any).v === 'string') {
          ;(cell as any).v = sanitizeFormulaCell((cell as any).v)
        }
      }
    }

    const keys = Object.keys(rows[0] || {})
    ws['!cols'] = keys.map(h => ({
      wch: /Para qué sirve|Evaluación|Texto|Resumen|Enlaces|Repositorios|Multimedia|Detalle/.test(h)
        ? 52
        : /Nombre|Tipo|Área|Origen|Fecha|URL|Campo|Métrica/.test(h)
        ? 30
        : 20
    }))
    if (rows.length > 0 && ws['!ref']) {
      ws['!autofilter'] = { ref: ws['!ref'] }
    }
    XLSX.utils.book_append_sheet(wb, ws, sheetName)
  }

  return wb
}

export function generateExcelFile(items: BookmarkItem[], options: ExportOptions) {
  const wb = buildWorkbook(items, options)
  const filename = options.filename || `atlas-guardados-${new Date().toISOString().slice(0, 10)}.xlsx`
  XLSX.writeFile(wb, filename)
  return filename
}

export function generateCsvString(
  items: BookmarkItem[],
  columnsOrOpts: string[] | { columns?: string[] } = TABLE_DEFAULT_COLUMNS
): string {
  const columns = Array.isArray(columnsOrOpts)
    ? columnsOrOpts
    : columnsOrOpts?.columns || TABLE_DEFAULT_COLUMNS
  const activeCols = columns.length > 0 ? columns : TABLE_DEFAULT_COLUMNS
  const escapeCsvCell = (val: unknown): string => {
    const s = sanitizeFormulaCell(String(val ?? '').replace(/\r?\n/g, ' '))
    if (s.includes(',') || s.includes('"') || s.includes(';') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`
    }
    return s
  }

  const headerLine = activeCols.map(escapeCsvCell).join(',')
  const dataLines = items.map(item => {
    const row = mapItemToRow(item, activeCols)
    return activeCols.map(col => escapeCsvCell(row[col] ?? '')).join(',')
  })

  return `\uFEFF${[headerLine, ...dataLines].join('\r\n')}\r\n`
}

export function downloadCsvFile(
  items: BookmarkItem[],
  columnsOrOpts: string[] | { columns?: string[]; filename?: string } = TABLE_DEFAULT_COLUMNS,
  filename?: string
): string {
  const columns = Array.isArray(columnsOrOpts)
    ? columnsOrOpts
    : columnsOrOpts?.columns || TABLE_DEFAULT_COLUMNS
  const resolvedFilename =
    filename || (!Array.isArray(columnsOrOpts) ? columnsOrOpts?.filename : undefined)
  const csvContent = generateCsvString(items, columns)
  const finalName = resolvedFilename || `atlas-tabla-${new Date().toISOString().slice(0, 10)}.csv`
  if (typeof window !== 'undefined') {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = finalName
    a.click()
    URL.revokeObjectURL(url)
  }
  return finalName
}

export function buildJsonBackupV2(items: BookmarkItem[]) {
  return {
    schema: 'atlas-backup-v2',
    version: 2,
    exportedAt: new Date().toISOString(),
    count: items.length,
    items: items.map(item => ({
      id: item.id,
      platform: item.platform,
      sourceUrl: item.sourceUrl,
      authorName: item.authorName,
      authorHandle: item.authorHandle,
      authorAvatar: item.authorAvatar,
      domain: item.domain,
      publishedAt: item.publishedAt,
      savedAt: item.savedAt,
      importedAt: item.importedAt,
      caption: item.caption,
      title: item.title,
      purpose: item.purpose,
      resourceType: item.resourceType,
      evaluation: item.evaluation,
      analysisState: item.analysisState,
      notes: item.notes,
      resources: item.resources || [],
      manualFields: item.manualFields || [],
      collections: item.collections || [],
      topics: item.topics,
      entities: item.entities,
      aiSummary: item.aiSummary,
      language: item.language,
      outgoingLinks: item.outgoingLinks,
      mediaType: item.mediaType,
      mediaUrls: item.mediaUrls,
      mediaPaths: item.mediaPaths || [],
      mediaStatus: item.mediaStatus,
      reviewed: item.reviewed,
      analysisMethod: item.analysisMethod,
      analyzedAt: item.analyzedAt,
      classificationStatus: item.classificationStatus,
      confidence: item.confidence,
      captureSource: item.captureSource,
      provenance: item.provenance
    }))
  }
}

export function downloadJsonBackupFile(items: BookmarkItem[], filename?: string): string {
  const payload = buildJsonBackupV2(items)
  const finalName = filename || `atlas-backup-v2-${new Date().toISOString().slice(0, 10)}.json`
  if (typeof window !== 'undefined') {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = finalName
    a.click()
    URL.revokeObjectURL(url)
  }
  return finalName
}
