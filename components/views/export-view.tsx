'use client'

import React, { useState, useMemo } from 'react'
import {
  FileSpreadsheet, Check, CloudDownload, Server, FileText, FileJson, GitBranch as Github
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { BookmarkItem, ExportHistoryItem } from '@/lib/types'
import {
  generateExcelFile,
  downloadCsvFile,
  downloadJsonBackupFile,
  TABLE_DEFAULT_COLUMNS,
  AVAILABLE_COLUMNS,
  ALL_SHEETS,
  getSheetRows
} from '@/lib/excel-export'

interface ExportViewProps {
  items: BookmarkItem[]
}

export function ExportView({ items }: ExportViewProps) {
  const [selectedSheets, setSelectedSheets] = useState<string[]>([...ALL_SHEETS])
  const [activePreviewSheet, setActivePreviewSheet] = useState<string>('Todos')
  const [selectedColumns, setSelectedColumns] = useState<string[]>([...TABLE_DEFAULT_COLUMNS])
  const [onlyReviewed, setOnlyReviewed] = useState(false)
  const [onlyWithGitHub, setOnlyWithGitHub] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [exportHistory, setExportHistory] = useState<ExportHistoryItem[]>([
    {
      id: 'exp-1',
      filename: 'bookmarks_archive.xlsx',
      date: new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }),
      sheets: [...ALL_SHEETS],
      totalItems: items.length,
      sizeKb: Math.max(12, Math.round(items.length * 1.8))
    }
  ])

  const toggleSheet = (name: string) => {
    if (selectedSheets.includes(name)) {
      if (selectedSheets.length > 1) {
        const remaining = selectedSheets.filter(s => s !== name)
        setSelectedSheets(remaining)
        if (activePreviewSheet === name) {
          setActivePreviewSheet(remaining[0])
        }
      }
    } else {
      setSelectedSheets([...selectedSheets, name])
    }
  }

  const toggleColumn = (col: string) => {
    if (selectedColumns.includes(col)) {
      if (selectedColumns.length > 1) {
        setSelectedColumns(selectedColumns.filter(c => c !== col))
      }
    } else {
      setSelectedColumns([...selectedColumns, col])
    }
  }

  const eligibleItems = useMemo(() => {
    return items.filter(i => {
      if (onlyReviewed && !i.reviewed) return false
      if (onlyWithGitHub) {
        const hasGh =
          i.platform === 'github' ||
          (i.resources || []).some(r => r.kind === 'github_repo') ||
          (i.outgoingLinks || []).some(u => u.toLowerCase().includes('github.com/'))
        if (!hasGh) return false
      }
      return true
    })
  }, [items, onlyReviewed, onlyWithGitHub])

  const previewRows = useMemo(
    () => getSheetRows(eligibleItems, activePreviewSheet, selectedColumns),
    [eligibleItems, activePreviewSheet, selectedColumns]
  )

  const previewKeys = useMemo(
    () => (previewRows.length > 0 ? Object.keys(previewRows[0]) : []),
    [previewRows]
  )

  const recordHistory = (filename: string, sheets: string[]) => {
    const newHistoryItem: ExportHistoryItem = {
      id: `exp-${Date.now()}`,
      filename,
      date: new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }),
      sheets,
      totalItems: eligibleItems.length,
      sizeKb: Math.max(12, Math.round(eligibleItems.length * 1.8))
    }
    setExportHistory(prev => [newHistoryItem, ...prev])
  }

  const handleDownloadExcel = () => {
    setIsExporting(true)
    try {
      const filename = `atlas-guardados-${new Date().toISOString().slice(0, 10)}.xlsx`
      generateExcelFile(eligibleItems, {
        sheets: selectedSheets,
        columns: selectedColumns,
        filename,
        onlyReviewed: false // ya filtrado en eligibleItems
      })
      recordHistory(filename, [...selectedSheets])
    } catch (err) {
      console.error('Error al exportar:', err)
      alert('Error al generar el archivo Excel.')
    } finally {
      setIsExporting(false)
    }
  }

  const handleDownloadCsv = () => {
    try {
      const filename = `atlas-guardados-${new Date().toISOString().slice(0, 10)}.csv`
      downloadCsvFile(eligibleItems, {
        columns: selectedColumns,
        filename
      })
      recordHistory(filename, ['CSV (Tabla principal)'])
    } catch (err) {
      console.error('Error al exportar CSV:', err)
    }
  }

  const handleDownloadJsonBackup = () => {
    try {
      const filename = `atlas-backup-v2-${new Date().toISOString().slice(0, 10)}.json`
      downloadJsonBackupFile(eligibleItems, filename)
      recordHistory(filename, ['JSON Backup v2 (Reimportable)'])
    } catch (err) {
      console.error('Error al exportar respaldo JSON:', err)
    }
  }

  const handleServerExport = () => {
    window.open(`/api/export/xlsx?onlyReviewed=${onlyReviewed}`, '_blank')
  }

  return (
    <div className="flex flex-col gap-7">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="mb-2 text-xs uppercase tracking-[0.16em] text-[#8e83f2]">
            Salida de Datos Coherente con la Tabla (Excel · CSV · Respaldo JSON v2)
          </p>
          <h1 className="font-serif text-3xl sm:text-4xl tracking-[-0.04em] text-foreground">
            Exportar y Respaldar Colección
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Conserva exactamente las mismas columnas visibles en la Biblioteca (<code className="text-[#bfb8ff]">Nombre / recurso</code>,{' '}
            <code className="text-[#bfb8ff]">Para qué sirve</code>, <code className="text-[#bfb8ff]">Tipo</code>,{' '}
            <code className="text-[#bfb8ff]">Enlaces útiles</code>, <code className="text-[#bfb8ff]">Evaluación breve</code>) o genera un respaldo JSON reimportable sin pérdida.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            onClick={() => window.open('/api/export/xlsx?mode=repositories', '_blank')}
            className="bg-emerald-600 text-xs text-white hover:bg-emerald-500 shadow-sm"
          >
            <FileSpreadsheet className="mr-1.5 size-3.5" /> 📊 Descargar Excel Maestro de Repositorios (.xlsx)
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleServerExport}
            className="border-[#35314f] bg-[#1a1b26] text-xs text-[#bfb8ff] hover:bg-[#252438]"
          >
            <Server className="mr-1.5 size-3.5" /> Guardar y descargar Guardados (/exports)
          </Button>
        </div>
      </header>

      {/* Banner Destacado: Excel Maestro de Repositorios y Herramientas Clasificado por Agente */}
      <div className="flex flex-col justify-between gap-4 rounded-xl border border-emerald-500/35 bg-[#121e1b] p-4 sm:flex-row sm:items-center">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Badge className="bg-emerald-600/30 text-emerald-300 border-emerald-500/40 text-[10px]">
              Clasificado por Agente (21 Columnas · 5 Pestañas)
            </Badge>
            <span className="text-sm font-semibold text-white">
              Catálogo Maestro de Repositorios GitHub, Skills, MCPs y Herramientas IA
            </span>
          </div>
          <p className="text-xs text-zinc-300">
            Incluye para cada repositorio: <strong>Qué es y para qué sirve</strong>, <strong>Área / Categoría</strong>, <strong>Empresa u Organización creadora</strong>, <strong>Estrellas</strong>, <strong>Puntaje Atlas (1-10)</strong>, <strong>Grado de Seguridad y Permisos</strong>, <strong>Para qué Proyecto Sirve</strong>, <strong>Madurez</strong>, <strong>Licencia</strong> y <strong>Comando de Instalación</strong>.
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => window.open('/api/export/xlsx?mode=repositories', '_blank')}
          className="bg-emerald-600 text-xs text-white hover:bg-emerald-500 shrink-0"
        >
          <CloudDownload className="mr-1.5 size-4" /> Exportar Excel de Repositorios (.xlsx)
        </Button>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.25fr_1fr]">
        {/* Configuración */}
        <Card className="border-border/80 bg-card/70">
          <CardHeader>
            <CardTitle className="text-base">Configura tu exportación</CardTitle>
            <CardDescription>
              Por defecto coincide con las 8 columnas principales de la tabla en la aplicación
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            {/* Hojas */}
            <div>
              <p className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Hojas incluidas en el libro (.xlsx)
              </p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {ALL_SHEETS.map(name => {
                  const isChecked = selectedSheets.includes(name)
                  return (
                    <button
                      key={name}
                      onClick={() => toggleSheet(name)}
                      className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-xs font-medium transition-all ${
                        isChecked
                          ? 'border-[#7c6cf0] bg-[#28263b] text-foreground shadow-sm'
                          : 'border-border bg-transparent text-muted-foreground hover:bg-[#191b24]'
                      }`}
                    >
                      <div
                        className={`grid size-4 shrink-0 place-items-center rounded border ${
                          isChecked ? 'border-[#7c6cf0] bg-[#7c6cf0] text-white' : 'border-border'
                        }`}
                      >
                        {isChecked && <Check className="size-3" />}
                      </div>
                      <span className="truncate">Hoja “{name}”</span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Columnas */}
            <div>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Columnas incluidas en “Todos” y CSV ({selectedColumns.length} de {AVAILABLE_COLUMNS.length})
                </p>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setSelectedColumns([...TABLE_DEFAULT_COLUMNS])}
                    className="text-[11px] text-[#91d0b4] hover:underline"
                  >
                    8 columnas de la tabla
                  </button>
                  <button
                    onClick={() => setSelectedColumns([...AVAILABLE_COLUMNS])}
                    className="text-[11px] text-[#a59cf5] hover:underline"
                  >
                    Seleccionar todas ({AVAILABLE_COLUMNS.length})
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {AVAILABLE_COLUMNS.map(col => {
                  const active = selectedColumns.includes(col)
                  return (
                    <Badge
                      key={col}
                      variant={active ? 'secondary' : 'outline'}
                      onClick={() => toggleColumn(col)}
                      className={`cursor-pointer gap-1.5 py-1.5 text-xs transition-colors ${
                        active
                          ? 'bg-[#29273f] text-[#bfb8ff] hover:bg-[#343252]'
                          : 'border-border text-muted-foreground hover:border-[#7c6cf0]'
                      }`}
                    >
                      {active && <Check className="size-3 text-[#9b91f5]" />}
                      <span>{col}</span>
                    </Badge>
                  )
                })}
              </div>
            </div>

            {/* Filtros de alcance */}
            <div className="flex flex-col gap-2.5 rounded-md border border-border bg-[#1b1d25] p-3.5 text-xs">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Alcance de registros a incluir
              </p>
              <label className="flex cursor-pointer items-center gap-2.5">
                <input
                  type="checkbox"
                  checked={onlyWithGitHub}
                  onChange={e => setOnlyWithGitHub(e.target.checked)}
                  className="accent-[#7c6cf0]"
                />
                <span className="flex items-center gap-1.5">
                  <Github className="size-3.5 text-[#91d0b4]" />
                  Exportar solo guardados con repositorio de GitHub detectado
                </span>
              </label>
              <label className="flex cursor-pointer items-center gap-2.5">
                <input
                  type="checkbox"
                  checked={onlyReviewed}
                  onChange={e => setOnlyReviewed(e.target.checked)}
                  className="accent-[#7c6cf0]"
                />
                <span>Exportar únicamente elementos marcados como “Revisado”</span>
              </label>
              <p className="text-[11px] text-muted-foreground pt-1 border-t border-border/60">
                Total seleccionado: <strong className="text-foreground">{eligibleItems.length}</strong> de {items.length} guardados ·{' '}
                <strong className="text-foreground">{selectedColumns.length}</strong> columnas
              </p>
            </div>

            {/* Botones de Descarga */}
            <div className="grid gap-2.5 sm:grid-cols-3">
              <Button
                onClick={handleDownloadExcel}
                disabled={isExporting || eligibleItems.length === 0}
                className="bg-[#7c6cf0] py-5 text-xs font-medium text-white shadow-lg shadow-[#7c6cf0]/20 hover:bg-[#6f60dc]"
              >
                <FileSpreadsheet className="size-4 mr-1.5" />
                {isExporting ? 'Generando...' : `Excel .xlsx (${eligibleItems.length})`}
              </Button>

              <Button
                variant="outline"
                onClick={handleDownloadCsv}
                disabled={eligibleItems.length === 0}
                className="border-[#35314f] bg-[#1a1b26] py-5 text-xs text-[#bfb8ff] hover:bg-[#252438]"
              >
                <FileText className="size-4 mr-1.5 text-[#91d0b4]" />
                CSV compatible ({eligibleItems.length})
              </Button>

              <Button
                variant="outline"
                onClick={handleDownloadJsonBackup}
                disabled={eligibleItems.length === 0}
                className="border-[#35314f] bg-[#1a1b26] py-5 text-xs text-[#e3c08d] hover:bg-[#252438]"
              >
                <FileJson className="size-4 mr-1.5 text-[#e3c08d]" />
                Respaldo JSON v2 ({eligibleItems.length})
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Vista previa real de cualquier hoja */}
        <Card className="border-border/80 bg-card/70">
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <div>
                <CardTitle className="text-base">Vista previa en vivo</CardTitle>
                <CardDescription>
                  Previsualizando la pestaña “{activePreviewSheet}” ({previewRows.length} filas)
                </CardDescription>
              </div>

              <select
                value={activePreviewSheet}
                onChange={e => setActivePreviewSheet(e.target.value)}
                className="h-8 rounded border border-border bg-[#101217] px-2.5 text-xs text-foreground focus:outline-none"
              >
                {selectedSheets.map(s => (
                  <option key={s} value={s}>
                    Hoja: {s}
                  </option>
                ))}
              </select>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-md border border-border">
              <Table>
                <TableHeader className="bg-[#121318]">
                  <TableRow className="border-border">
                    {previewKeys.slice(0, 6).map(k => (
                      <TableHead key={k} className="text-xs whitespace-nowrap">
                        {k}
                      </TableHead>
                    ))}
                    {previewKeys.length > 6 && (
                      <TableHead className="text-xs text-muted-foreground whitespace-nowrap">
                        +{previewKeys.length - 6} más
                      </TableHead>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {previewRows.slice(0, 8).map((row, idx) => (
                    <TableRow key={idx} className="border-border">
                      {previewKeys.slice(0, 6).map(k => (
                        <TableCell key={k} className="max-w-[180px] truncate text-xs" title={String(row[k] ?? '')}>
                          {String(row[k] ?? '')}
                        </TableCell>
                      ))}
                      {previewKeys.length > 6 && (
                        <TableCell className="text-[11px] text-muted-foreground">...</TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <p className="mt-3 text-center text-[11px] text-muted-foreground">
              Mostrando {Math.min(8, previewRows.length)} de {previewRows.length} filas en la hoja “{activePreviewSheet}”
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Historial de descargas */}
      <div>
        <h2 className="mb-3 text-sm font-medium text-foreground">Exportaciones generadas</h2>
        <div className="flex flex-col divide-y divide-border rounded-lg border border-border bg-[#16181f]">
          {exportHistory.map(exp => (
            <div key={exp.id} className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <div className="grid size-9 place-items-center rounded-lg bg-[#27253d] text-[#8e83f2]">
                  <FileSpreadsheet className="size-4" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">{exp.filename}</p>
                  <p className="text-xs text-muted-foreground">
                    {exp.date} · {exp.totalItems} guardados · {exp.sheets.join(', ')} · ~{exp.sizeKb} KB
                  </p>
                </div>
              </div>

              <Button
                variant="ghost"
                size="sm"
                onClick={handleDownloadExcel}
                className="text-xs text-[#a59cf5] hover:bg-[#252836]"
              >
                <CloudDownload className="size-3.5 mr-1" /> Re-descargar .xlsx
              </Button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
