import * as XLSX from 'xlsx'
import { BookmarkItem } from './types'

export interface ExportOptions {
  sheets: string[]
  columns: string[]
  filename?: string
  onlyReviewed?: boolean
}

export const ALL_SHEETS = ['Resumen', 'Todos', 'Por tema', 'Por fuente', 'Errores', 'Manifest']

export const AVAILABLE_COLUMNS = [
  'ID',
  'Texto completo',
  'Autor',
  'Handle / Usuario',
  'Fuente',
  'Dominio',
  'Fecha publicación',
  'Fecha guardado',
  'Temas',
  'Colecciones',
  'Entidades',
  'Resumen IA',
  'Confianza',
  'Método de análisis',
  'Idioma',
  'Enlaces salientes',
  'Multimedia',
  'URL Original',
  'Estado'
]

export function mapItemToRow(item: BookmarkItem, columns: string[] = AVAILABLE_COLUMNS): Record<string, string | number> {
  const confidenceStr =
    typeof item.confidence === 'number'
      ? `${Math.round(item.confidence * 100)}%`
      : item.confidence
      ? String(item.confidence)
      : ''

  const all: Record<string, string | number> = {
    'ID': item.id,
    'Texto completo': item.caption || '',
    'Autor': item.authorName || '',
    'Handle / Usuario': item.authorHandle || '',
    'Handle': item.authorHandle || '',
    'Fuente': item.platform === 'x' ? 'X / Twitter' : 'Instagram',
    'Dominio': item.domain || '',
    'Fecha publicación': item.publishedAt || '',
    'Fecha guardado': item.savedAt || '',
    'Temas': item.topics.join(', '),
    'Colecciones': (item.collections || []).join(', '),
    'Entidades': item.entities.join(', '),
    'Resumen IA': item.aiSummary || '',
    'Confianza': confidenceStr,
    'Método de análisis':
      item.analysisMethod === 'gemini'
        ? 'IA Cloud (Gemini)'
        : item.analysisMethod === 'ollama'
        ? 'IA Local (Ollama)'
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

export function getSheetRows(items: BookmarkItem[], sheet: string, columns: string[] = AVAILABLE_COLUMNS): Record<string, any>[] {
  if (sheet === 'Resumen') {
    const totalX = items.filter(i => i.platform === 'x').length
    const totalIg = items.filter(i => i.platform === 'instagram').length
    const reviewedCount = items.filter(i => i.reviewed).length
    const withMedia = items.filter(i => i.mediaType !== 'none' && i.mediaUrls.length > 0).length
    const linkOnly = items.filter(i => !i.caption).length

    const topicMap: Record<string, number> = {}
    items.forEach(i => {
      i.topics.forEach(t => {
        topicMap[t] = (topicMap[t] || 0) + 1
      })
    })

    return [
      { Métrica: 'Reporte generado (ISO UTC)', Valor: new Date().toISOString() },
      { Métrica: 'Total de guardados únicos', Valor: items.length },
      { Métrica: 'Guardados de X / Twitter', Valor: totalX },
      { Métrica: 'Guardados de Instagram', Valor: totalIg },
      { Métrica: 'Con multimedia detectada', Valor: withMedia },
      { Métrica: 'Elementos revisados', Valor: reviewedCount },
      { Métrica: 'Elementos pendientes de revisión', Valor: items.length - reviewedCount },
      { Métrica: 'Solo enlace (sin texto)', Valor: linkOnly },
      { Métrica: '--- DESGLOSE POR TEMA ---', Valor: '--- GUARDADOS ---' },
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
    const errItems = items.filter(i => i.error)
    if (errItems.length === 0) {
      return [{ ID: '', Archivo: '', Estado: 'OK', Detalle: 'Sin errores registrados en el archivo actual' }]
    }
    return errItems.map(i => ({
      ID: i.id,
      Archivo: i.provenance || '',
      Estado: 'Error',
      Detalle: i.error || ''
    }))
  }

  if (sheet === 'Manifest') {
    const sources = Array.from(new Set(items.map(i => i.provenance || i.captureSource || 'local').filter(Boolean)))
    return [
      { Campo: 'schema', Valor: 'atlas-unified-legacy-mvp-v1' },
      { Campo: 'exported_at', Valor: new Date().toISOString() },
      { Campo: 'workbook_total_records', Valor: items.length },
      { Campo: 'x_records', Valor: items.filter(i => i.platform === 'x').length },
      { Campo: 'instagram_records', Valor: items.filter(i => i.platform === 'instagram').length },
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

  for (const sheetName of sheetsToInclude) {
    if (!ALL_SHEETS.includes(sheetName)) {
      throw new Error(`Hoja de Excel no válida: "${sheetName}"`)
    }
    const rows = getSheetRows(eligible, sheetName, options.columns)
    const ws = XLSX.utils.json_to_sheet(rows)

    // Ensure no cell is interpreted as a formula (prevent formula injection)
    for (const [key, cell] of Object.entries(ws)) {
      if (key.startsWith('!')) continue
      if (cell && typeof cell === 'object' && 'f' in cell) {
        delete (cell as any).f
        ;(cell as any).t = 's'
      }
    }

    const keys = Object.keys(rows[0] || {})
    ws['!cols'] = keys.map(h => ({
      wch: /Texto|Resumen|Enlaces|Multimedia|Detalle/.test(h)
        ? 60
        : /Fecha|URL|Campo|Métrica/.test(h)
        ? 30
        : 22
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
