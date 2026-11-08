import * as XLSX from 'xlsx'
import { BookmarkItem, GalleryRepository } from './types'
import { evaluateAndClassifyRepository, extractInstallAndSetupSnippets } from './github-gallery'
import { extractAllSkillsFromRepositories, ExtractedRepoSkill } from './repo-skills-extractor'

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
    item.platform === 'x'
      ? 'X'
      : item.platform === 'instagram'
      ? 'Instagram'
      : item.platform === 'github'
      ? 'GitHub'
      : 'WhatsApp'
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
      item.platform === 'x'
        ? 'X / Twitter'
        : item.platform === 'instagram'
        ? 'Instagram'
        : item.platform === 'github'
        ? 'GitHub'
        : 'WhatsApp',
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

export const REPO_MASTER_EXCEL_COLUMNS = [
  'Repositorio',
  'Qué es y para qué sirve (Español)',
  'Tipo de Recurso',
  'Área / Categoría',
  'Empresa / Organización / Autor',
  'Tipo de Creador',
  'Estrellas (★)',
  'Forks',
  'Puntaje Atlas (1-10)',
  'Dictamen de Puntaje',
  'Grado de Seguridad',
  'Análisis de Seguridad y Permisos',
  'Para qué Proyecto Sirve (Casos de Uso)',
  'Nivel de Madurez',
  'Complejidad de Integración',
  'Licencia y Uso Comercial',
  'Lenguaje Principal',
  'Comando de Instalación / 1-Clic',
  'Origen y Estado de Verificación',
  'URL Oficial GitHub',
  'Notas y Contexto en Guardados'
]

export function mapRepoToMasterExcelRow(
  repo: GalleryRepository,
  bookmarks: BookmarkItem[] = []
): Record<string, string | number> {
  const ev = repo.agentEvaluation || evaluateAndClassifyRepository(repo, bookmarks)
  const install = extractInstallAndSetupSnippets(repo)

  const linkedBms = bookmarks.filter(bm => {
    if ((repo.linkedBookmarkIds || []).includes(bm.id)) return true
    return (bm.resources || []).some(
      r => (r.fullName || '').toLowerCase() === (repo.fullName || '').toLowerCase()
    )
  })
  const nonGithubBms = linkedBms.filter(b => b.platform !== 'github')
  const contextSnippet = nonGithubBms
    .map(b => `${b.authorHandle || b.authorName} (${b.platform.toUpperCase()}): ${(b.caption || '').replace(/\s+/g, ' ').slice(0, 140)}`)
    .slice(0, 2)
    .join(' || ')

  const combinedNotes = [repo.notes, contextSnippet].filter(Boolean).join(' — ')

  return {
    Repositorio: sanitizeFormulaCell(repo.fullName || `${repo.owner}/${repo.name}`),
    'Qué es y para qué sirve (Español)': sanitizeFormulaCell(ev.whatIsItEs),
    'Tipo de Recurso': sanitizeFormulaCell(repo.resourceType || 'Librería, framework o SDK'),
    'Área / Categoría': sanitizeFormulaCell(ev.areaCategory),
    'Empresa / Organización / Autor': sanitizeFormulaCell(ev.companyOrAuthor),
    'Tipo de Creador': sanitizeFormulaCell(ev.creatorKind),
    'Estrellas (★)': Number(repo.stars) || 0,
    Forks: Number(repo.forks) || 0,
    'Puntaje Atlas (1-10)': ev.atlasScore,
    'Dictamen de Puntaje': sanitizeFormulaCell(ev.atlasScoreLabel),
    'Grado de Seguridad': sanitizeFormulaCell(ev.securityGrade),
    'Análisis de Seguridad y Permisos': sanitizeFormulaCell(ev.securitySummary),
    'Para qué Proyecto Sirve (Casos de Uso)': sanitizeFormulaCell(ev.projectUseCases),
    'Nivel de Madurez': sanitizeFormulaCell(ev.maturityLevel),
    'Complejidad de Integración': sanitizeFormulaCell(ev.integrationComplexity),
    'Licencia y Uso Comercial': sanitizeFormulaCell(ev.licenseSummary),
    'Lenguaje Principal': sanitizeFormulaCell(repo.primaryLanguage || 'Multi-lenguaje / Docs'),
    'Comando de Instalación / 1-Clic': sanitizeFormulaCell(install.primaryCommand),
    'Origen y Estado de Verificación': sanitizeFormulaCell(`${ev.sourcesSummary} · ${ev.verificationStatusLabel}`),
    'URL Oficial GitHub': repo.url || `https://github.com/${repo.owner}/${repo.name}`,
    'Notas y Contexto en Guardados': sanitizeFormulaCell(combinedNotes)
  }
}

function attachRepoColumnWidthsAndFilter(ws: XLSX.WorkSheet, rowCount: number) {
  ws['!cols'] = [
    { wch: 28 }, // Repositorio
    { wch: 52 }, // Qué es y para qué sirve
    { wch: 26 }, // Tipo de Recurso
    { wch: 32 }, // Área / Categoría
    { wch: 30 }, // Empresa / Autor
    { wch: 28 }, // Tipo de Creador
    { wch: 14 }, // Estrellas
    { wch: 12 }, // Forks
    { wch: 18 }, // Puntaje Atlas
    { wch: 28 }, // Dictamen de Puntaje
    { wch: 18 }, // Grado de Seguridad
    { wch: 46 }, // Análisis de Seguridad
    { wch: 50 }, // Para qué Proyecto Sirve
    { wch: 24 }, // Nivel de Madurez
    { wch: 26 }, // Complejidad de Integración
    { wch: 36 }, // Licencia
    { wch: 18 }, // Lenguaje Principal
    { wch: 42 }, // Comando de Instalación
    { wch: 38 }, // Origen y Estado
    { wch: 40 }, // URL Oficial GitHub
    { wch: 48 }  // Notas y Contexto
  ]
  if (rowCount > 0 && ws['!ref']) {
    ws['!autofilter'] = { ref: ws['!ref'] }
  }
}

export const SKILL_MASTER_EXCEL_COLUMNS = [
  'Skill',
  'Tipo de Skill / Capacidad',
  'Qué hace (Español)',
  'Qué tipo de cosas puede hacer',
  'Repositorio al que pertenece',
  'Link al Repositorio',
  'Link directo al Skill',
  'Estrellas del Repo (★)',
  '¿Lo recomendás?',
  'Motivo de Recomendación',
  'Puntaje Atlas (1-10)',
  'Empresa / Organización que lo desarrolló',
  'Tipo de Creador',
  'Área / Categoría',
  'Para qué Proyecto podría servir',
  'Grado de Seguridad',
  'Comando de Instalación',
  'Comentarios / Notas'
]

export function mapSkillToExcelRow(skill: ExtractedRepoSkill): Record<string, string | number> {
  return {
    Skill: sanitizeFormulaCell(skill.skillName),
    'Tipo de Skill / Capacidad': sanitizeFormulaCell(skill.skillKind),
    'Qué hace (Español)': sanitizeFormulaCell(skill.whatItDoesEs),
    'Qué tipo de cosas puede hacer': sanitizeFormulaCell(skill.capabilitiesEs),
    'Repositorio al que pertenece': sanitizeFormulaCell(skill.repoFullName),
    'Link al Repositorio': skill.repoUrl,
    'Link directo al Skill': skill.skillUrl,
    'Estrellas del Repo (★)': Number(skill.stars) || 0,
    '¿Lo recomendás?': sanitizeFormulaCell(skill.recommended),
    'Motivo de Recomendación': sanitizeFormulaCell(skill.recommendationReason),
    'Puntaje Atlas (1-10)': skill.atlasScore,
    'Empresa / Organización que lo desarrolló': sanitizeFormulaCell(skill.companyOrAuthor),
    'Tipo de Creador': sanitizeFormulaCell(skill.creatorKind),
    'Área / Categoría': sanitizeFormulaCell(skill.areaCategory),
    'Para qué Proyecto podría servir': sanitizeFormulaCell(skill.projectUseCases),
    'Grado de Seguridad': sanitizeFormulaCell(skill.securityGrade),
    'Comando de Instalación': sanitizeFormulaCell(skill.installCommand),
    'Comentarios / Notas': sanitizeFormulaCell(skill.comments || '')
  }
}

function attachSkillColumnWidthsAndFilter(ws: XLSX.WorkSheet, rowCount: number) {
  ws['!cols'] = [
    { wch: 28 }, // Skill
    { wch: 26 }, // Tipo de Skill
    { wch: 54 }, // Qué hace
    { wch: 46 }, // Qué tipo de cosas puede hacer
    { wch: 30 }, // Repositorio
    { wch: 40 }, // Link al Repo
    { wch: 44 }, // Link directo al Skill
    { wch: 16 }, // Estrellas
    { wch: 28 }, // ¿Lo recomendás?
    { wch: 46 }, // Motivo
    { wch: 16 }, // Puntaje
    { wch: 32 }, // Empresa
    { wch: 26 }, // Tipo de Creador
    { wch: 32 }, // Área
    { wch: 48 }, // Para qué Proyecto podría servir
    { wch: 18 }, // Seguridad
    { wch: 42 }, // Comando
    { wch: 48 }  // Comentarios
  ]
  if (rowCount > 0 && ws['!ref']) {
    ws['!autofilter'] = { ref: ws['!ref'] }
  }
}

export function buildRepositoriesWorkbook(
  repos: GalleryRepository[],
  bookmarks: BookmarkItem[] = [],
  preExtractedSkills?: ExtractedRepoSkill[]
): XLSX.WorkBook {
  const wb = XLSX.utils.book_new()

  const enriched = repos.map(r => ({
    ...r,
    agentEvaluation: r.agentEvaluation || evaluateAndClassifyRepository(r, bookmarks)
  }))

  // Sort master list by Atlas Score desc, then Stars desc
  const sortedMaster = [...enriched].sort((a, b) => {
    const scoreDiff = (b.agentEvaluation?.atlasScore || 0) - (a.agentEvaluation?.atlasScore || 0)
    if (Math.abs(scoreDiff) >= 0.2) return scoreDiff
    return (b.stars || 0) - (a.stars || 0)
  })

  // 1. Sheet: Repositorios (Catálogo Maestro)
  const masterRows = sortedMaster.map(r => mapRepoToMasterExcelRow(r, bookmarks))
  const wsMaster = XLSX.utils.json_to_sheet(masterRows, { header: REPO_MASTER_EXCEL_COLUMNS })
  attachRepoColumnWidthsAndFilter(wsMaster, masterRows.length)
  XLSX.utils.book_append_sheet(wb, wsMaster, 'Catálogo Maestro')

  // 2. Sheet: Skills en Repositorios (Desglose individual de cada Skill adentro de los repos)
  const allSkills = preExtractedSkills || extractAllSkillsFromRepositories(sortedMaster, bookmarks)
  const skillRows = allSkills.map(s => mapSkillToExcelRow(s))
  const wsSkills = XLSX.utils.json_to_sheet(skillRows, { header: SKILL_MASTER_EXCEL_COLUMNS })
  attachSkillColumnWidthsAndFilter(wsSkills, skillRows.length)
  XLSX.utils.book_append_sheet(wb, wsSkills, 'Skills en Repositorios')

  // 2. Sheet: Skills, MCPs y Agentes
  const agenticRepos = sortedMaster.filter(
    r =>
      r.resourceType === 'Skill' ||
      r.resourceType === 'Servidor MCP o conector' ||
      r.resourceType === 'Agente o workflow' ||
      r.agentEvaluation?.areaCategory === 'Agentes Autónomos, Skills & MCP'
  )
  const agenticRows = agenticRepos.map(r => mapRepoToMasterExcelRow(r, bookmarks))
  const wsAgentic = XLSX.utils.json_to_sheet(agenticRows, { header: REPO_MASTER_EXCEL_COLUMNS })
  attachRepoColumnWidthsAndFilter(wsAgentic, agenticRows.length)
  XLSX.utils.book_append_sheet(wb, wsAgentic, 'Skills, MCPs y Agentes')

  // 3. Sheet: Por Área y Proyecto
  const sortedByArea = [...sortedMaster].sort((a, b) => {
    const areaCmp = (a.agentEvaluation?.areaCategory || '').localeCompare(
      b.agentEvaluation?.areaCategory || ''
    )
    if (areaCmp !== 0) return areaCmp
    return (b.agentEvaluation?.atlasScore || 0) - (a.agentEvaluation?.atlasScore || 0)
  })
  const areaRows = sortedByArea.map(r => mapRepoToMasterExcelRow(r, bookmarks))
  const wsArea = XLSX.utils.json_to_sheet(areaRows, { header: REPO_MASTER_EXCEL_COLUMNS })
  attachRepoColumnWidthsAndFilter(wsArea, areaRows.length)
  XLSX.utils.book_append_sheet(wb, wsArea, 'Por Área y Proyecto')

  // 4. Sheet: Top Puntaje y Seguridad
  const topTrusted = sortedMaster.filter(
    r =>
      (r.agentEvaluation?.atlasScore || 0) >= 7.5 &&
      r.agentEvaluation?.securityGrade !== 'Precaución'
  )
  const topRows = topTrusted.map(r => mapRepoToMasterExcelRow(r, bookmarks))
  const wsTop = XLSX.utils.json_to_sheet(topRows, { header: REPO_MASTER_EXCEL_COLUMNS })
  attachRepoColumnWidthsAndFilter(wsTop, topRows.length)
  XLSX.utils.book_append_sheet(wb, wsTop, 'Top Puntaje y Seguridad')

  // 5. Sheet: Resumen Ejecutivo
  const areaCounts: Record<string, number> = {}
  const typeCounts: Record<string, number> = {}
  const secCounts: Record<string, number> = {}
  const creatorCounts: Record<string, number> = {}

  for (const r of sortedMaster) {
    const area = r.agentEvaluation?.areaCategory || 'Otros'
    const rt = r.resourceType || 'Otro'
    const sec = r.agentEvaluation?.securityGrade || 'Medio'
    const ck = r.agentEvaluation?.creatorKind || 'Autor / Comunidad Independiente'
    areaCounts[area] = (areaCounts[area] || 0) + 1
    typeCounts[rt] = (typeCounts[rt] || 0) + 1
    secCounts[sec] = (secCounts[sec] || 0) + 1
    creatorCounts[ck] = (creatorCounts[ck] || 0) + 1
  }

  const summaryRows: Array<{ Categoría: string; Detalle: string; Cantidad: number | string }> = [
    { Categoría: 'Métrica General', Detalle: 'Total de Repositorios y Herramientas Clasificados', Cantidad: sortedMaster.length },
    { Categoría: 'Métrica General', Detalle: 'Skills, Servidores MCP y Agentes Autónomos', Cantidad: agenticRepos.length },
    {
      Categoría: 'Métrica General',
      Detalle: 'Puntaje Promedio Atlas (1-10)',
      Cantidad:
        sortedMaster.length > 0
          ? Number(
              (
                sortedMaster.reduce((acc, r) => acc + (r.agentEvaluation?.atlasScore || 7), 0) /
                sortedMaster.length
              ).toFixed(2)
            )
          : 0
    },
    ...Object.entries(areaCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => ({ Categoría: 'Por Área / Dominio', Detalle: k, Cantidad: v })),
    ...Object.entries(typeCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => ({ Categoría: 'Por Tipo de Recurso', Detalle: k, Cantidad: v })),
    ...Object.entries(secCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => ({ Categoría: 'Por Grado de Seguridad', Detalle: k, Cantidad: v })),
    ...Object.entries(creatorCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => ({ Categoría: 'Por Tipo de Creador / Empresa', Detalle: k, Cantidad: v }))
  ]

  const wsSummary = XLSX.utils.json_to_sheet(summaryRows)
  wsSummary['!cols'] = [{ wch: 30 }, { wch: 50 }, { wch: 16 }]
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Resumen Ejecutivo')

  return wb
}

export function generateRepositoriesExcelFile(
  repos: GalleryRepository[],
  bookmarks: BookmarkItem[] = [],
  filename?: string,
  preExtractedSkills?: ExtractedRepoSkill[]
): string {
  const wb = buildRepositoriesWorkbook(repos, bookmarks, preExtractedSkills)
  const finalName =
    filename || `atlas-catalogo-repositorios-ia-${new Date().toISOString().slice(0, 10)}.xlsx`
  XLSX.writeFile(wb, finalName)
  return finalName
}

export function downloadRepositoriesCsvFile(
  repos: GalleryRepository[],
  bookmarks: BookmarkItem[] = [],
  filename?: string
): string {
  const rows = repos.map(r => mapRepoToMasterExcelRow(r, bookmarks))
  const escapeCsv = (val: unknown): string => {
    const s = sanitizeFormulaCell(String(val ?? '').replace(/\r?\n/g, ' '))
    if (s.includes(',') || s.includes('"') || s.includes(';') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`
    }
    return s
  }
  const headerLine = REPO_MASTER_EXCEL_COLUMNS.map(escapeCsv).join(',')
  const dataLines = rows.map(row =>
    REPO_MASTER_EXCEL_COLUMNS.map(col => escapeCsv(row[col] ?? '')).join(',')
  )
  const csvContent = `\uFEFF${[headerLine, ...dataLines].join('\r\n')}\r\n`
  const finalName =
    filename || `atlas-catalogo-repositorios-ia-${new Date().toISOString().slice(0, 10)}.csv`
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
