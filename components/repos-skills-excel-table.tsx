'use client'

import React, { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Table2,
  FolderGit2,
  Puzzle,
  Star,
  GitFork,
  ExternalLink,
  Search,
  Download,
  Check,
  Copy,
  Sparkles,
  ShieldCheck,
  Building2,
  MessageSquarePlus,
  Filter,
  ArrowUpDown,
  RefreshCw,
  X,
  ThumbsUp,
  AlertTriangle,
  ThumbsDown,
  Compass,
  FolderArchive,
  RotateCcw
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { BookmarkItem, GalleryRepository } from '@/lib/types'
import { evaluateAndClassifyRepository, extractInstallAndSetupSnippets } from '@/lib/github-gallery'
import {
  ExtractedRepoSkill,
  SkillRecommendationVerdict,
  extractAllSkillsFromRepositories
} from '@/lib/repo-skills-extractor'
import { generateRepositoriesExcelFile } from '@/lib/excel-export'
import {
  evaluateBookmarkScopeAndOffTopic,
  skillBuildFallbackReferenceLink
} from '@/lib/web-navigator-agent'
import { classifyGitHubUrl } from '@/lib/resource-investigator'
import {
  applyDurableClientStateToBookmarks,
  applyDurableClientStateToRepos,
  installSkillOrRepoUniversal,
  readDurableClientState,
  recordDurableBookmarkOverride,
  recordDurableRepoNote,
  recordDurableSkillNote,
  replayDurableStateToServer
} from '@/lib/client-persistence'

interface ReposSkillsExcelTableProps {
  bookmarks?: BookmarkItem[]
  initialRepos?: GalleryRepository[]
  initialSkills?: ExtractedRepoSkill[]
  onSelectRepoDetail?: (fullName: string) => void
  onRefreshBookmarks?: () => Promise<void>
  title?: string
  subtitle?: string
  defaultSheet?: 'repos' | 'skills' | 'links' | 'separated'
}

export function ReposSkillsExcelTable({
  bookmarks = [],
  initialRepos,
  initialSkills,
  onSelectRepoDetail,
  onRefreshBookmarks,
  title = 'Planilla Maestra Interactiva (Tipo Excel — Repositorios, Skills, Navegador de Links y Archivos Separados)',
  subtitle = 'Consultá tus Repositorios (Pestaña 1), los Skills dentro de cada repo (Pestaña 2), los Links de Referencia / Búsqueda Asistida para posts sin link directo (Pestaña 3) y los Archivos Separados de otros temas no técnicos (Pestaña 4).',
  defaultSheet = 'repos'
}: ReposSkillsExcelTableProps) {
  const [activeSheet, setActiveSheet] = useState<'repos' | 'skills' | 'links' | 'separated'>(defaultSheet)
  const [repos, setRepos] = useState<GalleryRepository[]>(initialRepos || [])
  const [skills, setSkills] = useState<ExtractedRepoSkill[]>(initialSkills || [])
  const [localBookmarks, setLocalBookmarks] = useState<BookmarkItem[]>(bookmarks)
  const [isLoading, setIsLoading] = useState(!initialRepos || initialRepos.length === 0)
  const [isAgentRunning, setIsAgentRunning] = useState(false)
  const [agentStatusMsg, setAgentStatusMsg] = useState('')

  // Shared & Tab-specific filters
  const [searchQuery, setSearchQuery] = useState('')
  const [areaFilter, setAreaFilter] = useState<string>('all')
  const [recFilter, setRecFilter] = useState<string>('all')
  const [skillKindFilter, setSkillKindFilter] = useState<string>('all')
  const [pricingFilter, setPricingFilter] = useState<string>('all')
  const [loginFilter, setLoginFilter] = useState<string>('all')
  const [securityFilter, setSecurityFilter] = useState<string>('all')
  const [repoFilterForSkills, setRepoFilterForSkills] = useState<string>('all')
  const [onlySubSkills, setOnlySubSkills] = useState<boolean>(false)
  const [sortBy, setSortBy] = useState<'score' | 'stars' | 'name' | 'company'>('score')
  const [pageSize, setPageSize] = useState<number>(50)
  const [currentPage, setCurrentPage] = useState<number>(1)

  // Inline editing states
  const [editingSkillId, setEditingSkillId] = useState<string | null>(null)
  const [editingSkillComment, setEditingSkillComment] = useState<string>('')
  const [editingRepoName, setEditingRepoName] = useState<string | null>(null)
  const [editingRepoNote, setEditingRepoNote] = useState<string>('')
  const [savingId, setSavingId] = useState<string | null>(null)
  const [copiedCmdId, setCopiedCmdId] = useState<string | null>(null)
  const [installingId, setInstallingId] = useState<string | null>(null)

  const applySkillDurableNotes = useCallback((rawSkills: ExtractedRepoSkill[]): ExtractedRepoSkill[] => {
    const durable = readDurableClientState()
    return rawSkills.map(s => {
      const note = durable.skillNotes[s.id]
      if (!note) return s
      return {
        ...s,
        ...(note.comments !== undefined ? { comments: note.comments } : {}),
        ...(note.recommended !== undefined ? { recommended: note.recommended } : {})
      }
    })
  }, [])

  const fetchReposAndSkills = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await fetch('/api/github/repos')
      const data = await res.json().catch(() => null)
      if (res.ok && data?.success) {
        const rawRepos: GalleryRepository[] = data.repositories || []
        const loadedRepos = applyDurableClientStateToRepos(rawRepos)
        setRepos(loadedRepos)
        const baseSkills =
          Array.isArray(data.skills) && data.skills.length > 0
            ? data.skills
            : extractAllSkillsFromRepositories(loadedRepos, bookmarks)
        setSkills(applySkillDurableNotes(baseSkills))
        replayDurableStateToServer(rawRepos, bookmarks).catch(() => {})
      }
    } catch (err) {
      console.error('Error cargando tabla de repositorios y skills:', err)
    } finally {
      setIsLoading(false)
    }
  }, [bookmarks, applySkillDurableNotes])

  useEffect(() => {
    setLocalBookmarks(applyDurableClientStateToBookmarks(bookmarks))
  }, [bookmarks])

  useEffect(() => {
    if (initialRepos && initialRepos.length > 0) {
      const mergedRepos = applyDurableClientStateToRepos(initialRepos)
      setRepos(mergedRepos)
      if (initialSkills && initialSkills.length > 0) {
        setSkills(applySkillDurableNotes(initialSkills))
      } else {
        setSkills(applySkillDurableNotes(extractAllSkillsFromRepositories(mergedRepos, bookmarks)))
      }
      setIsLoading(false)
    } else {
      fetchReposAndSkills()
    }
  }, [initialRepos, initialSkills, bookmarks, fetchReposAndSkills, applySkillDurableNotes])

  // Reset pagination when filters or sheet change
  useEffect(() => {
    setCurrentPage(1)
  }, [activeSheet, searchQuery, areaFilter, recFilter, skillKindFilter, pricingFilter, loginFilter, securityFilter, repoFilterForSkills, onlySubSkills, sortBy])

  // Summary counts for extracted catalog
  const extractedSummaryStats = useMemo(() => {
    let skillsMdCount = 0
    let mcpCount = 0
    let subagentsCount = 0
    let slashCount = 0
    let appsAndToolsCount = 0
    let freeOpenSourceCount = 0
    let noLoginCount = 0
    for (const s of skills) {
      if (s.skillKind === 'Skill (SKILL.md)') skillsMdCount++
      else if (s.skillKind === 'Servidor / Conector MCP') mcpCount++
      else if (s.skillKind === 'Subagente Especializado') subagentsCount++
      else if (s.skillKind === 'Comando Slash (/cmd)') slashCount++
      else appsAndToolsCount++
      if (s.pricingModel === '100% Gratis (Open Source)') freeOpenSourceCount++
      if (s.requiresLogin === 'No (100% Local)') noLoginCount++
    }
    return {
      total: skills.length,
      skillsMdCount,
      mcpCount,
      subagentsCount,
      slashCount,
      appsAndToolsCount,
      freeOpenSourceCount,
      noLoginCount
    }
  }, [skills])

  // Map repo fullName -> number of extracted skills inside it
  const skillsCountByRepo = useMemo(() => {
    const map = new Map<string, number>()
    for (const s of skills) {
      const key = s.repoFullName.toLowerCase()
      map.set(key, (map.get(key) || 0) + 1)
    }
    return map
  }, [skills])

  // Enriched repos with evaluation
  const enrichedRepos = useMemo(() => {
    return repos.map(r => {
      const ev = r.agentEvaluation || evaluateAndClassifyRepository(r, bookmarks)
      const install = extractInstallAndSetupSnippets(r)
      const recommended: SkillRecommendationVerdict =
        ev.securityGrade === 'Precaución' && ev.atlasScore < 6.5
          ? 'Con reservas — Revisar'
          : ev.atlasScore >= 8.4 || ((r.stars || 0) >= 5000 && ev.securityGrade === 'Alto')
          ? 'Sí — Altamente recomendado'
          : ev.atlasScore >= 6.8
          ? 'Sí — Recomendado'
          : 'Con reservas — Revisar'

      const linkedBms = bookmarks.filter(bm => {
        if ((r.linkedBookmarkIds || []).includes(bm.id)) return true
        return (bm.resources || []).some(
          res => (res.fullName || '').toLowerCase() === (r.fullName || '').toLowerCase()
        )
      })
      const contextNotes = linkedBms
        .filter(b => b.platform !== 'github')
        .map(b => `${b.authorHandle || b.authorName} (${b.platform.toUpperCase()}): ${(b.caption || '').replace(/\s+/g, ' ').slice(0, 100)}`)
        .slice(0, 2)
        .join(' | ')

      return {
        repo: r,
        ev,
        installCommand: install.primaryCommand,
        recommended,
        contextNotes,
        skillsCount: skillsCountByRepo.get(r.fullName.toLowerCase()) || 0
      }
    })
  }, [repos, bookmarks, skillsCountByRepo])

  // Available areas for filter dropdown
  const availableAreas = useMemo(() => {
    const set = new Set<string>()
    for (const item of enrichedRepos) {
      if (item.ev.areaCategory) set.add(item.ev.areaCategory)
    }
    return Array.from(set).sort()
  }, [enrichedRepos])

  // Filtered & sorted Repos
  const filteredRepos = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return enrichedRepos
      .filter(item => {
        if (areaFilter !== 'all' && item.ev.areaCategory !== areaFilter) return false
        if (recFilter === 'recommended' && !item.recommended.startsWith('Sí')) return false
        if (recFilter === 'highly' && item.recommended !== 'Sí — Altamente recomendado') return false
        if (recFilter === 'caution' && item.recommended.startsWith('Sí')) return false
        if (!q) return true
        const hay = [
          item.repo.fullName,
          item.ev.whatIsItEs,
          item.ev.areaCategory,
          item.repo.resourceType || '',
          item.ev.companyOrAuthor,
          item.ev.projectUseCases,
          item.repo.notes || '',
          item.contextNotes,
          item.repo.primaryLanguage || ''
        ]
          .join(' ')
          .toLowerCase()
        return hay.includes(q)
      })
      .sort((a, b) => {
        if (sortBy === 'stars') return (b.repo.stars || 0) - (a.repo.stars || 0)
        if (sortBy === 'name') return a.repo.fullName.localeCompare(b.repo.fullName)
        if (sortBy === 'company') return a.ev.companyOrAuthor.localeCompare(b.ev.companyOrAuthor)
        if (b.ev.atlasScore !== a.ev.atlasScore) return b.ev.atlasScore - a.ev.atlasScore
        return (b.repo.stars || 0) - (a.repo.stars || 0)
      })
  }, [enrichedRepos, searchQuery, areaFilter, recFilter, sortBy])

  // Filtered & sorted Skills
  const filteredSkills = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return skills
      .filter(s => {
        if (areaFilter !== 'all' && s.areaCategory !== areaFilter) return false
        if (skillKindFilter !== 'all') {
          if (skillKindFilter === 'apps_tools') {
            if (
              s.skillKind !== 'Aplicación / Herramienta' &&
              s.skillKind !== 'Herramienta / Workflow IA' &&
              s.skillKind !== 'Librería / Framework / SDK' &&
              s.skillKind !== 'Modelo / Dataset IA'
            ) {
              return false
            }
          } else if (s.skillKind !== skillKindFilter) {
            return false
          }
        }
        if (pricingFilter !== 'all' && (s.pricingModel || '100% Gratis (Open Source)') !== pricingFilter) {
          return false
        }
        if (loginFilter !== 'all' && (s.requiresLogin || 'No (100% Local)') !== loginFilter) {
          return false
        }
        if (securityFilter !== 'all' && s.securityGrade !== securityFilter) {
          return false
        }
        if (
          repoFilterForSkills !== 'all' &&
          s.repoFullName.toLowerCase() !== repoFilterForSkills.toLowerCase()
        ) {
          return false
        }
        if (onlySubSkills && !s.isSubSkillFromReadme) return false
        if (recFilter === 'recommended' && !s.recommended.startsWith('Sí')) return false
        if (recFilter === 'highly' && s.recommended !== 'Sí — Altamente recomendado') return false
        if (recFilter === 'caution' && s.recommended.startsWith('Sí')) return false
        if (!q) return true
        const hay = [
          s.skillName,
          s.whatItDoesEs,
          s.capabilitiesEs,
          s.repoFullName,
          s.companyOrAuthor,
          s.projectUseCases,
          s.comments || '',
          s.areaCategory,
          s.skillKind,
          s.openSourceLabel || '',
          s.licenseName || '',
          s.requiresLogin || '',
          s.pricingModel || ''
        ]
          .join(' ')
          .toLowerCase()
        return hay.includes(q)
      })
      .sort((a, b) => {
        if (sortBy === 'stars') return (b.stars || 0) - (a.stars || 0)
        if (sortBy === 'name') return a.skillName.localeCompare(b.skillName)
        if (sortBy === 'company') return a.companyOrAuthor.localeCompare(b.companyOrAuthor)
        if (b.atlasScore !== a.atlasScore) return b.atlasScore - a.atlasScore
        return (b.stars || 0) - (a.stars || 0)
      })
  }, [skills, searchQuery, areaFilter, skillKindFilter, pricingFilter, loginFilter, securityFilter, repoFilterForSkills, onlySubSkills, recFilter, sortBy])

  // Pestaña 3: Links Intermedios & Navegador IA ("El Link de ese Link" para posts técnicos sin GitHub directo)
  const referenceLinkBookmarks = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return localBookmarks
      .filter(bm => {
        if (bm.platform === 'github') return false
        const hasGh =
          (bm.resources || []).some(r => r.kind === 'github_repo') ||
          (bm.outgoingLinks || []).some(u => classifyGitHubUrl(u)?.kind === 'github_repo')
        if (hasGh) return false

        const isExplicitlySeparated =
          bm.resourceType === 'Archivo separado / Otro tema (No técnico)' ||
          (bm.topics || []).includes('Archivos Separados / Otros Temas')
        if (isExplicitlySeparated) return false

        const scope = evaluateBookmarkScopeAndOffTopic({
          caption: bm.caption,
          title: bm.title,
          authorName: bm.authorName,
          authorHandle: bm.authorHandle,
          platform: bm.platform,
          outgoingLinks: bm.outgoingLinks,
          mediaType: bm.mediaType,
          mediaUrls: bm.mediaUrls,
          topics: bm.topics
        })
        if (scope.isOffTopic) return false

        if (!q) return true
        const hay = `${bm.title || ''} ${bm.caption || ''} ${bm.authorHandle || ''} ${bm.authorName || ''} ${(bm.outgoingLinks || []).join(' ')}`.toLowerCase()
        return hay.includes(q)
      })
      .map(bm => {
        const fallback = skillBuildFallbackReferenceLink({
          sourceUrl: bm.sourceUrl,
          platform: bm.platform,
          authorHandle: bm.authorHandle,
          authorName: bm.authorName,
          title: bm.title,
          caption: bm.caption,
          expandedUrls: bm.outgoingLinks || [],
          candidateQueries: []
        })
        return { bm, fallback }
      })
  }, [localBookmarks, searchQuery])

  // Pestaña 4: Archivos Separados (Fotos personales, ocio, deportes, juegos casuales y otros temas fuera del radar técnico)
  const separatedOffTopicBookmarks = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return localBookmarks
      .filter(bm => {
        if (bm.platform === 'github') return false
        const isExplicitlySeparated =
          bm.resourceType === 'Archivo separado / Otro tema (No técnico)' ||
          (bm.topics || []).includes('Archivos Separados / Otros Temas')
        const scope = evaluateBookmarkScopeAndOffTopic({
          caption: bm.caption,
          title: bm.title,
          authorName: bm.authorName,
          authorHandle: bm.authorHandle,
          platform: bm.platform,
          outgoingLinks: bm.outgoingLinks,
          mediaType: bm.mediaType,
          mediaUrls: bm.mediaUrls,
          topics: bm.topics
        })
        if (!isExplicitlySeparated && !scope.isOffTopic) return false
        if (!q) return true
        const hay = `${bm.title || ''} ${bm.caption || ''} ${bm.authorHandle || ''} ${scope.categoryLabel} ${scope.reasonEs}`.toLowerCase()
        return hay.includes(q)
      })
      .map(bm => {
        const scope = evaluateBookmarkScopeAndOffTopic({
          caption: bm.caption,
          title: bm.title,
          authorName: bm.authorName,
          authorHandle: bm.authorHandle,
          platform: bm.platform,
          outgoingLinks: bm.outgoingLinks,
          mediaType: bm.mediaType,
          mediaUrls: bm.mediaUrls,
          topics: bm.topics
        })
        return { bm, scope }
      })
  }, [localBookmarks, searchQuery])

  const activeTotalCount =
    activeSheet === 'repos'
      ? filteredRepos.length
      : activeSheet === 'skills'
      ? filteredSkills.length
      : activeSheet === 'links'
      ? referenceLinkBookmarks.length
      : separatedOffTopicBookmarks.length

  const totalPages = pageSize === 0 ? 1 : Math.max(1, Math.ceil(activeTotalCount / pageSize))
  const visibleRepos = useMemo(() => {
    if (pageSize === 0) return filteredRepos
    const start = (currentPage - 1) * pageSize
    return filteredRepos.slice(start, start + pageSize)
  }, [filteredRepos, currentPage, pageSize])

  const visibleSkills = useMemo(() => {
    if (pageSize === 0) return filteredSkills
    const start = (currentPage - 1) * pageSize
    return filteredSkills.slice(start, start + pageSize)
  }, [filteredSkills, currentPage, pageSize])

  const visibleRefLinks = useMemo(() => {
    if (pageSize === 0) return referenceLinkBookmarks
    const start = (currentPage - 1) * pageSize
    return referenceLinkBookmarks.slice(start, start + pageSize)
  }, [referenceLinkBookmarks, currentPage, pageSize])

  const visibleSeparated = useMemo(() => {
    if (pageSize === 0) return separatedOffTopicBookmarks
    const start = (currentPage - 1) * pageSize
    return separatedOffTopicBookmarks.slice(start, start + pageSize)
  }, [separatedOffTopicBookmarks, currentPage, pageSize])

  const handleRunWebNavigatorAgent = async (bookmarkIds?: string[]) => {
    setIsAgentRunning(true)
    setAgentStatusMsg(
      bookmarkIds && bookmarkIds.length === 1
        ? 'Navegando hilo, comentarios y web con el Agente IA...'
        : 'Ejecutando Agente Navegador IA en hilos, comentarios y páginas intermedias...'
    )
    try {
      const res = await fetch('/api/github/repos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'hunt-missing-repos',
          limit: bookmarkIds ? bookmarkIds.length : 45,
          bookmarkIds
        })
      })
      const data = await res.json().catch(() => null)
      if (res.ok && data?.success) {
        setAgentStatusMsg(
          `✅ Agente Navegador completado: ${data.discoveredReposCount || 0} repositorios ocultos descubiertos (${data.newGalleryReposCount || 0} nuevos en Galería) y links de referencia actualizados.`
        )
        await fetchReposAndSkills()
        await onRefreshBookmarks?.()
      } else {
        setAgentStatusMsg(data?.error || 'No se pudo completar la navegación.')
      }
    } catch {
      setAgentStatusMsg('Error de red al ejecutar el Agente Navegador.')
    } finally {
      setIsAgentRunning(false)
    }
  }

  const handleToggleOffTopicSeparation = async (bm: BookmarkItem, moveToSeparated: boolean) => {
    setSavingId(bm.id)
    const nextResourceType = moveToSeparated
      ? ('Archivo separado / Otro tema (No técnico)' as const)
      : ('Aplicación o herramienta' as const)
    const nextTopics = moveToSeparated
      ? Array.from(new Set(['Archivos Separados / Otros Temas', ...(bm.topics || []).filter(t => t !== 'Sin clasificar')]))
      : (bm.topics || []).filter(t => t !== 'Archivos Separados / Otros Temas')
    const finalTopics = nextTopics.length > 0 ? nextTopics : ['IA']
    const nextManualFields = Array.from(new Set([...(bm.manualFields || []), 'resourceType', 'topics']))

    recordDurableBookmarkOverride(bm.id, {
      resourceType: nextResourceType,
      topics: finalTopics,
      manualFields: nextManualFields
    })

    setLocalBookmarks(prev =>
      prev.map(item =>
        item.id === bm.id
          ? {
              ...item,
              resourceType: nextResourceType,
              topics: finalTopics,
              manualFields: nextManualFields as any
            }
          : item
      )
    )

    try {
      await fetch(`/api/bookmarks/${encodeURIComponent(bm.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resourceType: nextResourceType,
          topics: finalTopics,
          evaluation: moveToSeparated
            ? 'Marcado como Archivo Separado (Fuera del radar técnico) para mantener limpia la biblioteca.'
            : 'Restaurado al Radar Técnico de IA, programación y herramientas.'
        })
      })
      await onRefreshBookmarks?.()
    } catch (err) {
      console.error('Error cambiando clasificación de archivo separado:', err)
    } finally {
      setSavingId(null)
    }
  }

  const handleSaveSkillNote = async (
    skillId: string,
    updates: { comments?: string; recommended?: SkillRecommendationVerdict }
  ) => {
    setSavingId(skillId)
    recordDurableSkillNote(skillId, updates)
    setSkills(prev =>
      prev.map(s => (s.id === skillId ? { ...s, ...updates } : s))
    )
    try {
      await fetch('/api/github/repos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'saveSkillNote',
          skillId,
          ...updates
        })
      })
    } catch (err) {
      console.error('Error guardando nota de skill:', err)
    } finally {
      setSavingId(null)
      setEditingSkillId(null)
    }
  }

  const handleSaveRepoNote = async (fullName: string, notes: string) => {
    setSavingId(fullName)
    recordDurableRepoNote(fullName, notes)
    setRepos(prev =>
      prev.map(r => (r.fullName === fullName ? { ...r, notes } : r))
    )
    try {
      await fetch('/api/github/repos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update-repo',
          fullName,
          notes
        })
      })
    } catch (err) {
      console.error('Error guardando nota de repositorio:', err)
    } finally {
      setSavingId(null)
      setEditingRepoName(null)
    }
  }

  const handleInstallSkillUniversal = async (fullName: string, skillId: string) => {
    setInstallingId(skillId)
    setAgentStatusMsg(`Instalando ${fullName} en 1 clic...`)
    try {
      const res = await installSkillOrRepoUniversal({
        fullName,
        installMode: 'skill_clone'
      })
      setAgentStatusMsg(`✅ ${res.messageEs}`)
    } catch (err: any) {
      setAgentStatusMsg(`⚠️ ${err?.message || 'Error al instalar skill.'}`)
    } finally {
      setInstallingId(null)
    }
  }

  const handleCopyCommand = (id: string, cmd: string) => {
    navigator.clipboard.writeText(cmd)
    setCopiedCmdId(id)
    setTimeout(() => setCopiedCmdId(null), 1800)
  }

  const handleJumpToRepoSkills = (repoFullName: string) => {
    setRepoFilterForSkills(repoFullName)
    setActiveSheet('skills')
  }

  const renderRecommendationBadge = (rec: SkillRecommendationVerdict) => {
    if (rec === 'Sí — Altamente recomendado') {
      return (
        <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/40 bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-300">
          <ThumbsUp className="size-3" /> Sí · Altamente recomendado
        </span>
      )
    }
    if (rec === 'Sí — Recomendado') {
      return (
        <span className="inline-flex items-center gap-1 rounded-md border border-sky-500/40 bg-sky-500/15 px-2 py-0.5 text-[11px] font-medium text-sky-300">
          <Check className="size-3" /> Sí · Recomendado
        </span>
      )
    }
    if (rec === 'No recomendado') {
      return (
        <span className="inline-flex items-center gap-1 rounded-md border border-rose-500/40 bg-rose-500/15 px-2 py-0.5 text-[11px] font-medium text-rose-300">
          <ThumbsDown className="size-3" /> No recomendado
        </span>
      )
    }
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-300">
        <AlertTriangle className="size-3" /> Con reservas · Revisar
      </span>
    )
  }

  return (
    <div className="flex flex-col rounded-xl border border-[#2d3042] bg-[#12141d] shadow-xl overflow-hidden">
      {/* EXCEL TOP HEADER & SHEET SELECTOR */}
      <div className="flex flex-col gap-4 border-b border-[#252838] bg-[#161924] p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
              <Table2 className="size-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base sm:text-lg font-semibold text-foreground">{title}</h2>
                <Badge className="border-0 bg-emerald-500/20 text-emerald-300 text-[11px]">
                  En vivo · Sin necesidad de exportar
                </Badge>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleRunWebNavigatorAgent()}
              disabled={isAgentRunning || isLoading}
              className="border-amber-500/40 bg-amber-500/10 text-xs text-amber-200 hover:bg-amber-500/20"
              title="Ejecuta el Agente Navegador IA: lee hilos/comentarios, navega páginas intermedias, busca en GitHub/Web y separa archivos no técnicos"
            >
              <Compass className={`mr-1.5 size-3.5 ${isAgentRunning ? 'animate-spin' : ''}`} />
              {isAgentRunning ? 'Navegando hilos y web...' : '🕵️ Agente Navegador IA (Hilos y Comentarios)'}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={fetchReposAndSkills}
              disabled={isLoading}
              className="border-border bg-[#12141d] text-xs"
            >
              <RefreshCw className={`mr-1.5 size-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              Actualizar tabla
            </Button>
            <Button
              size="sm"
              onClick={() =>
                generateRepositoriesExcelFile(
                  repos,
                  localBookmarks,
                  `atlas-repositorios-y-skills-${new Date().toISOString().slice(0, 10)}.xlsx`,
                  skills
                )
              }
              className="bg-emerald-600 text-xs text-white hover:bg-emerald-500"
            >
              <Download className="mr-1.5 size-3.5" />
              Descargar este Excel (.xlsx)
            </Button>
          </div>
        </div>

        {agentStatusMsg && (
          <div className="flex items-center justify-between gap-2 rounded-lg border border-amber-500/40 bg-amber-950/30 px-3.5 py-2 text-xs text-amber-200">
            <div className="flex items-center gap-2">
              <Sparkles className="size-3.5 text-amber-400 shrink-0" />
              <span>{agentStatusMsg}</span>
            </div>
            <button
              type="button"
              onClick={() => setAgentStatusMsg('')}
              className="text-amber-300 hover:text-white"
            >
              <X className="size-3.5" />
            </button>
          </div>
        )}

        {/* EXCEL SHEET TABS (TOP) */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div className="flex flex-wrap items-center gap-1 rounded-lg border border-[#2e3247] bg-[#0f1118] p-1">
            <button
              type="button"
              onClick={() => setActiveSheet('repos')}
              className={`flex items-center gap-2 rounded-md px-3.5 py-2 text-xs font-semibold transition-all ${
                activeSheet === 'repos'
                  ? 'bg-[#7c6cf0] text-white shadow-sm'
                  : 'text-muted-foreground hover:bg-[#1a1d29] hover:text-foreground'
              }`}
            >
              <FolderGit2 className="size-4" />
              <span>Pestaña 1: Repositorios</span>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] ${
                  activeSheet === 'repos'
                    ? 'bg-black/25 text-white'
                    : 'bg-[#1e2130] text-muted-foreground'
                }`}
              >
                {filteredRepos.length} / {repos.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveSheet('skills')}
              className={`flex items-center gap-2 rounded-md px-3.5 py-2 text-xs font-semibold transition-all ${
                activeSheet === 'skills'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-muted-foreground hover:bg-[#1a1d29] hover:text-foreground'
              }`}
            >
              <Puzzle className="size-4" />
              <span>Pestaña 2: Skills en Repos</span>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] ${
                  activeSheet === 'skills'
                    ? 'bg-black/25 text-white'
                    : 'bg-[#1e2130] text-muted-foreground'
                }`}
              >
                {filteredSkills.length} / {skills.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveSheet('links')}
              className={`flex items-center gap-2 rounded-md px-3.5 py-2 text-xs font-semibold transition-all ${
                activeSheet === 'links'
                  ? 'bg-amber-600 text-white shadow-sm'
                  : 'text-muted-foreground hover:bg-[#1a1d29] hover:text-foreground'
              }`}
              title="Publicaciones técnicas donde el link no apunta directo a GitHub (está en comentarios o es un link intermedio). Incluye 'el link de ese link' y búsqueda asistida en 1 clic."
            >
              <Compass className="size-4" />
              <span>Pestaña 3: Links Intermedios / En Comentarios</span>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] ${
                  activeSheet === 'links'
                    ? 'bg-black/25 text-white'
                    : 'bg-[#1e2130] text-muted-foreground'
                }`}
              >
                {referenceLinkBookmarks.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveSheet('separated')}
              className={`flex items-center gap-2 rounded-md px-3.5 py-2 text-xs font-semibold transition-all ${
                activeSheet === 'separated'
                  ? 'bg-rose-600 text-white shadow-sm'
                  : 'text-muted-foreground hover:bg-[#1a1d29] hover:text-foreground'
              }`}
              title="Archivos separados automáticamente o manualmente porque son de otros temas no técnicos (fotos personales, deportes, comida, juegos casuales, etc.)."
            >
              <FolderArchive className="size-4" />
              <span>Pestaña 4: Archivos Separados (Otros Temas)</span>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] ${
                  activeSheet === 'separated'
                    ? 'bg-black/25 text-white'
                    : 'bg-[#1e2130] text-muted-foreground'
                }`}
              >
                {separatedOffTopicBookmarks.length}
              </span>
            </button>
          </div>

          {activeSheet === 'skills' && repoFilterForSkills !== 'all' && (
            <div className="flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-200">
              <span>
                Viendo skills dentro de: <strong className="font-mono">{repoFilterForSkills}</strong>
              </span>
              <button
                type="button"
                onClick={() => setRepoFilterForSkills('all')}
                className="rounded p-0.5 hover:bg-emerald-500/20"
                title="Ver skills de todos los repositorios"
              >
                <X className="size-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* FILTER & SEARCH BAR */}
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-5">
          <div className="relative lg:col-span-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder={
                activeSheet === 'repos'
                  ? 'Buscar repositorio, qué hace, empresa, proyecto, lenguaje o nota...'
                  : 'Buscar skill (/grill-me, docx, prisma-cli...), qué hace, empresa, repositorio o proyecto...'
              }
              className="h-9 w-full rounded-md border border-[#2b2e40] bg-[#0f1118] pl-9 pr-8 text-xs text-foreground placeholder:text-muted-foreground focus:border-[#7c6cf0] focus:outline-none"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>

          <select
            value={areaFilter}
            onChange={e => setAreaFilter(e.target.value)}
            className="h-9 rounded-md border border-[#2b2e40] bg-[#0f1118] px-2.5 text-xs text-foreground focus:border-[#7c6cf0] focus:outline-none"
          >
            <option value="all">Todas las Áreas ({availableAreas.length})</option>
            {availableAreas.map(area => (
              <option key={area} value={area}>
                {area}
              </option>
            ))}
          </select>

          <select
            value={recFilter}
            onChange={e => setRecFilter(e.target.value)}
            className="h-9 rounded-md border border-[#2b2e40] bg-[#0f1118] px-2.5 text-xs text-foreground focus:border-[#7c6cf0] focus:outline-none"
          >
            <option value="all">¿Lo recomendás?: Todos</option>
            <option value="highly">🌟 Sí — Altamente recomendados</option>
            <option value="recommended">✅ Todos los Recomendados (Sí)</option>
            <option value="caution">⚠️ Con reservas / No recomendados</option>
          </select>

          <div className="flex items-center gap-2">
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as any)}
              className="h-9 flex-1 rounded-md border border-[#2b2e40] bg-[#0f1118] px-2.5 text-xs text-foreground focus:border-[#7c6cf0] focus:outline-none"
            >
              <option value="score">Ordenar: ★ Puntaje Atlas (1-10)</option>
              <option value="stars">Ordenar: Estrellas GitHub (★)</option>
              <option value="company">Ordenar: Empresa / Autor</option>
              <option value="name">Ordenar: Alfabético (A-Z)</option>
            </select>
          </div>
        </div>

        {/* EXTRA FILTERS FOR SKILLS SHEET */}
        {activeSheet === 'skills' && (
          <div className="flex flex-col gap-2.5 border-t border-[#232636] pt-2.5 text-xs">
            {/* KPI Summary Strip of Extracted Repository Contents */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-950/20 px-3 py-2">
                <p className="text-[10px] uppercase tracking-wider text-emerald-300/80">Total Extraídos</p>
                <p className="mt-0.5 text-base font-bold text-emerald-300">
                  {extractedSummaryStats.total.toLocaleString('es-ES')}
                </p>
                <p className="text-[10px] text-muted-foreground">De los {repos.length} repos guardados</p>
              </div>
              <div className="rounded-lg border border-[#2b2e40] bg-[#10131d] px-3 py-2">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Skills & Comandos</p>
                <p className="mt-0.5 text-base font-bold text-foreground">
                  {(extractedSummaryStats.skillsMdCount + extractedSummaryStats.slashCount).toLocaleString('es-ES')}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {extractedSummaryStats.skillsMdCount} SKILL.md · {extractedSummaryStats.slashCount} /cmd
                </p>
              </div>
              <div className="rounded-lg border border-[#2b2e40] bg-[#10131d] px-3 py-2">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Servidores MCP</p>
                <p className="mt-0.5 text-base font-bold text-sky-300">
                  {extractedSummaryStats.mcpCount.toLocaleString('es-ES')}
                </p>
                <p className="text-[10px] text-muted-foreground">Conectores & tools MCP</p>
              </div>
              <div className="rounded-lg border border-[#2b2e40] bg-[#10131d] px-3 py-2">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Subagentes IA</p>
                <p className="mt-0.5 text-base font-bold text-[#bfb8ff]">
                  {extractedSummaryStats.subagentsCount.toLocaleString('es-ES')}
                </p>
                <p className="text-[10px] text-muted-foreground">Agentes especializados</p>
              </div>
              <div className="rounded-lg border border-[#2b2e40] bg-[#10131d] px-3 py-2">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Apps, SDKs & Modelos</p>
                <p className="mt-0.5 text-base font-bold text-amber-300">
                  {extractedSummaryStats.appsAndToolsCount.toLocaleString('es-ES')}
                </p>
                <p className="text-[10px] text-muted-foreground">Aplicaciones y librerías</p>
              </div>
              <div className="rounded-lg border border-[#2b2e40] bg-[#10131d] px-3 py-2">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Open Source / Local</p>
                <p className="mt-0.5 text-base font-bold text-emerald-400">
                  {extractedSummaryStats.freeOpenSourceCount.toLocaleString('es-ES')} gratis
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {extractedSummaryStats.noLoginCount} sin login (100% local)
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-muted-foreground flex items-center gap-1 mr-1">
                  <Filter className="size-3.5 text-emerald-400" /> Qué hay adentro:
                </span>
                {[
                  { id: 'all', label: `Todos (${skills.length})` },
                  { id: 'Skill (SKILL.md)', label: `Skills SKILL.md (${extractedSummaryStats.skillsMdCount})` },
                  { id: 'Servidor / Conector MCP', label: `Servidores MCP (${extractedSummaryStats.mcpCount})` },
                  { id: 'Subagente Especializado', label: `Subagentes (${extractedSummaryStats.subagentsCount})` },
                  { id: 'Comando Slash (/cmd)', label: `Comandos /cmd (${extractedSummaryStats.slashCount})` },
                  { id: 'apps_tools', label: `Apps, Herramientas, SDKs y Modelos (${extractedSummaryStats.appsAndToolsCount})` }
                ].map(t => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setSkillKindFilter(t.id)}
                    className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
                      skillKindFilter === t.id
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                        : 'bg-[#11131c] text-muted-foreground hover:text-foreground border border-transparent'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={pricingFilter}
                  onChange={e => setPricingFilter(e.target.value)}
                  className="h-8 rounded-md border border-[#2b2e40] bg-[#0f1118] px-2 text-[11px] text-foreground focus:border-emerald-500 focus:outline-none"
                >
                  <option value="all">¿Hay que pagar?: Todos</option>
                  <option value="100% Gratis (Open Source)">🟢 100% Gratis (Open Source)</option>
                  <option value="Gratis + BYOK (Tu API Key)">🔑 Gratis + BYOK (Tu API Key)</option>
                  <option value="Freemium (Local Gratis + Cloud)">☁️ Freemium (Local Gratis + Cloud)</option>
                </select>

                <select
                  value={loginFilter}
                  onChange={e => setLoginFilter(e.target.value)}
                  className="h-8 rounded-md border border-[#2b2e40] bg-[#0f1118] px-2 text-[11px] text-foreground focus:border-emerald-500 focus:outline-none"
                >
                  <option value="all">¿Necesita Login?: Todos</option>
                  <option value="No (100% Local)">🔓 No (100% Local)</option>
                  <option value="Opcional (API / Cloud)">⚡ Opcional (API / Cloud)</option>
                  <option value="Sí (Cuenta / API Key)">🔐 Sí (Cuenta / API Key)</option>
                </select>

                <select
                  value={securityFilter}
                  onChange={e => setSecurityFilter(e.target.value)}
                  className="h-8 rounded-md border border-[#2b2e40] bg-[#0f1118] px-2 text-[11px] text-foreground focus:border-emerald-500 focus:outline-none"
                >
                  <option value="all">Seguridad: Todos</option>
                  <option value="Alto">🛡️ Seguridad Alta</option>
                  <option value="Medio">✅ Seguridad Media</option>
                  <option value="Precaución">⚠️ Precaución</option>
                </select>

                <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-emerald-300">
                  <input
                    type="checkbox"
                    checked={onlySubSkills}
                    onChange={e => setOnlySubSkills(e.target.checked)}
                    className="accent-emerald-500"
                  />
                  <span>Solo desglosados del interior de packs</span>
                </label>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* EXCEL GRID BODY */}
      <div className="relative max-h-[680px] overflow-auto bg-[#0d0f16]">
        {isLoading ? (
          <div className="flex h-64 items-center justify-center gap-2 text-xs text-muted-foreground">
            <RefreshCw className="size-4 animate-spin text-[#7c6cf0]" />
            <span>Cargando planilla de Repositorios y Skills...</span>
          </div>
        ) : activeSheet === 'repos' ? (
          /* ================= PESTAÑA 1: REPOSITORIOS ================= */
          <table className="w-full border-collapse text-left text-xs">
            <thead className="sticky top-0 z-10 bg-[#181b28] text-[11px] font-semibold uppercase tracking-wider text-[#b5bdd6] shadow-sm">
              <tr className="border-b border-[#2b2f42]">
                <th className="border-r border-[#252838] px-3 py-2.5 text-center w-10">#</th>
                <th className="border-r border-[#252838] px-3 py-2.5 min-w-[210px]">Repositorio</th>
                <th className="border-r border-[#252838] px-3 py-2.5 min-w-[290px]">Qué es y para qué sirve</th>
                <th className="border-r border-[#252838] px-3 py-2.5 min-w-[130px] text-center">Skills adentro</th>
                <th className="border-r border-[#252838] px-3 py-2.5 min-w-[130px]">Estrellas / Forks</th>
                <th className="border-r border-[#252838] px-3 py-2.5 min-w-[200px]">¿Lo recomendás? / Puntaje</th>
                <th className="border-r border-[#252838] px-3 py-2.5 min-w-[190px]">Empresa / Desarrollador</th>
                <th className="border-r border-[#252838] px-3 py-2.5 min-w-[190px]">Área & Tipo</th>
                <th className="border-r border-[#252838] px-3 py-2.5 min-w-[260px]">Para qué proyecto podría servir</th>
                <th className="border-r border-[#252838] px-3 py-2.5 min-w-[150px]">Seguridad & Licencia</th>
                <th className="border-r border-[#252838] px-3 py-2.5 min-w-[250px]">Comentarios / Notas (Editable)</th>
                <th className="px-3 py-2.5 min-w-[180px]">Instalación / Link</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1e2130]">
              {visibleRepos.length === 0 ? (
                <tr>
                  <td colSpan={12} className="py-12 text-center text-xs text-muted-foreground">
                    No se encontraron repositorios con los filtros seleccionados.
                  </td>
                </tr>
              ) : (
                visibleRepos.map((item, idx) => {
                  const rowNum = (currentPage - 1) * (pageSize || filteredRepos.length) + idx + 1
                  const { repo, ev, installCommand, recommended, contextNotes, skillsCount } = item
                  const isEditingThisRepo = editingRepoName === repo.fullName

                  return (
                    <tr
                      key={repo.fullName}
                      className="group transition-colors hover:bg-[#161926] odd:bg-[#0f1119] even:bg-[#121520]"
                    >
                      <td className="border-r border-[#1e2130] px-2.5 py-3 text-center font-mono text-[11px] text-muted-foreground">
                        {rowNum}
                      </td>

                      {/* Repositorio */}
                      <td className="border-r border-[#1e2130] px-3 py-3 align-top">
                        <div className="flex items-start gap-2.5">
                          <img
                            src={repo.avatarUrl || `https://github.com/${repo.owner}.png?size=64`}
                            alt={repo.owner}
                            className="mt-0.5 size-6 rounded-md border border-border object-cover shrink-0"
                            loading="lazy"
                          />
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              {onSelectRepoDetail ? (
                                <button
                                  type="button"
                                  onClick={() => onSelectRepoDetail(repo.fullName)}
                                  className="font-semibold text-[#bfb8ff] hover:underline text-left break-all"
                                >
                                  {repo.fullName}
                                </button>
                              ) : (
                                <a
                                  href={repo.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="font-semibold text-[#bfb8ff] hover:underline break-all"
                                >
                                  {repo.fullName}
                                </a>
                              )}
                              <a
                                href={repo.url}
                                target="_blank"
                                rel="noreferrer"
                                title="Abrir en GitHub"
                                className="text-muted-foreground hover:text-foreground shrink-0"
                              >
                                <ExternalLink className="size-3" />
                              </a>
                            </div>
                            {repo.primaryLanguage && (
                              <span className="mt-1 inline-block rounded bg-[#1d2030] px-1.5 py-0.5 text-[10px] text-muted-foreground">
                                {repo.primaryLanguage}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Qué es y para qué sirve */}
                      <td className="border-r border-[#1e2130] px-3 py-3 align-top leading-relaxed text-[#e2e4f0]">
                        {ev.whatIsItEs}
                      </td>

                      {/* Skills adentro */}
                      <td className="border-r border-[#1e2130] px-3 py-3 align-top text-center">
                        {skillsCount > 0 ? (
                          <button
                            type="button"
                            onClick={() => handleJumpToRepoSkills(repo.fullName)}
                            className="inline-flex items-center gap-1 rounded-md border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-1 text-[11px] font-medium text-emerald-300 hover:bg-emerald-500/25 transition-colors"
                            title="Ver los skills de este repositorio en la Pestaña 2"
                          >
                            <Puzzle className="size-3" />
                            <span>{skillsCount} skill{skillsCount === 1 ? '' : 's'}</span>
                          </button>
                        ) : (
                          <span className="text-[11px] text-muted-foreground">—</span>
                        )}
                      </td>

                      {/* Estrellas / Forks */}
                      <td className="border-r border-[#1e2130] px-3 py-3 align-top font-mono">
                        <div className="flex items-center gap-1 font-semibold text-amber-300">
                          <Star className="size-3.5 fill-amber-400 text-amber-400" />
                          <span>{(repo.stars || 0).toLocaleString()}</span>
                        </div>
                        <div className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                          <GitFork className="size-3" />
                          <span>{(repo.forks || 0).toLocaleString()} forks</span>
                        </div>
                      </td>

                      {/* Recomendación / Puntaje */}
                      <td className="border-r border-[#1e2130] px-3 py-3 align-top">
                        <div className="flex flex-col gap-1.5">
                          {renderRecommendationBadge(recommended)}
                          <div className="flex items-center gap-1.5 text-[11px]">
                            <span className="rounded bg-[#252238] px-1.5 py-0.5 font-mono font-bold text-[#bfb8ff]">
                              {ev.atlasScore}/10
                            </span>
                            <span className="text-muted-foreground truncate" title={ev.atlasScoreLabel}>
                              {ev.atlasScoreLabel}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Empresa / Autor */}
                      <td className="border-r border-[#1e2130] px-3 py-3 align-top">
                        <div className="font-medium text-foreground flex items-center gap-1.5">
                          <Building2 className="size-3.5 text-[#8e83f2] shrink-0" />
                          <span>{ev.companyOrAuthor}</span>
                        </div>
                        <span className="mt-1 inline-block text-[11px] text-muted-foreground">
                          {ev.creatorKind}
                        </span>
                      </td>

                      {/* Área & Tipo */}
                      <td className="border-r border-[#1e2130] px-3 py-3 align-top">
                        <div className="font-medium text-[#91d0b4]">{ev.areaCategory}</div>
                        <Badge
                          variant="outline"
                          className="mt-1 border-[#32364a] bg-[#171a26] text-[10px] text-muted-foreground"
                        >
                          {repo.resourceType || 'Repositorio'}
                        </Badge>
                      </td>

                      {/* Para qué proyecto podría servir */}
                      <td className="border-r border-[#1e2130] px-3 py-3 align-top leading-relaxed text-muted-foreground">
                        {ev.projectUseCases}
                      </td>

                      {/* Seguridad & Licencia */}
                      <td className="border-r border-[#1e2130] px-3 py-3 align-top">
                        <div className="flex items-center gap-1">
                          <ShieldCheck
                            className={`size-3.5 ${
                              ev.securityGrade === 'Alto'
                                ? 'text-emerald-400'
                                : ev.securityGrade === 'Medio'
                                ? 'text-sky-400'
                                : 'text-amber-400'
                            }`}
                          />
                          <span className="font-medium text-foreground">Seguridad: {ev.securityGrade}</span>
                        </div>
                        <p className="mt-1 text-[11px] text-muted-foreground line-clamp-2" title={ev.licenseSummary}>
                          {ev.licenseSummary}
                        </p>
                      </td>

                      {/* Comentarios / Notas (Editable) */}
                      <td className="border-r border-[#1e2130] px-3 py-3 align-top">
                        {isEditingThisRepo ? (
                          <div className="flex flex-col gap-1.5">
                            <textarea
                              rows={2}
                              value={editingRepoNote}
                              onChange={e => setEditingRepoNote(e.target.value)}
                              placeholder="Escribí tu comentario o evaluación de este repositorio..."
                              className="w-full rounded border border-[#7c6cf0] bg-[#0b0d13] p-1.5 text-xs text-foreground focus:outline-none"
                            />
                            <div className="flex items-center gap-1.5">
                              <Button
                                size="xs"
                                onClick={() => handleSaveRepoNote(repo.fullName, editingRepoNote)}
                                disabled={savingId === repo.fullName}
                                className="bg-[#7c6cf0] text-[11px] text-white hover:bg-[#6f60dc]"
                              >
                                Guardar
                              </Button>
                              <Button
                                size="xs"
                                variant="ghost"
                                onClick={() => setEditingRepoName(null)}
                                className="text-[11px]"
                              >
                                Cancelar
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div
                            onClick={() => {
                              setEditingRepoName(repo.fullName)
                              setEditingRepoNote(repo.notes || '')
                            }}
                            className="group/note cursor-pointer rounded border border-transparent p-1.5 hover:border-[#2e3247] hover:bg-[#181b28]"
                            title="Hacé clic para editar el comentario como en Excel"
                          >
                            {repo.notes ? (
                              <p className="text-foreground">{repo.notes}</p>
                            ) : (
                              <p className="text-[11px] italic text-muted-foreground flex items-center gap-1">
                                <MessageSquarePlus className="size-3 text-[#7c6cf0]" />
                                Clic para agregar comentario...
                              </p>
                            )}
                            {contextNotes && (
                              <p className="mt-1 text-[10px] text-muted-foreground line-clamp-2">
                                {contextNotes}
                              </p>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Instalación / Link */}
                      <td className="px-3 py-3 align-top">
                        <div className="flex flex-col gap-1.5">
                          <div className="flex items-center gap-1">
                            <code className="truncate rounded bg-[#0b0c12] px-1.5 py-0.5 font-mono text-[10px] text-[#a59cf5] max-w-[130px]" title={installCommand}>
                              {installCommand}
                            </code>
                            <button
                              type="button"
                              onClick={() => handleCopyCommand(`repo-${repo.fullName}`, installCommand)}
                              className="rounded p-1 text-muted-foreground hover:bg-[#232638] hover:text-foreground"
                              title="Copiar comando"
                            >
                              {copiedCmdId === `repo-${repo.fullName}` ? (
                                <Check className="size-3 text-emerald-400" />
                              ) : (
                                <Copy className="size-3" />
                              )}
                            </button>
                          </div>
                          <a
                            href={repo.url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] text-[#8e83f2] hover:underline"
                          >
                            Abrir GitHub <ExternalLink className="size-2.5" />
                          </a>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        ) : activeSheet === 'skills' ? (
          /* ================= PESTAÑA 2: CATÁLOGO EXTRAÍDO (SKILLS, MCPs, SUBAGENTES Y APLICACIONES ADENTRO DE LOS REPOS) ================= */
          <table className="w-full border-collapse text-left text-xs">
            <thead className="sticky top-0 z-10 bg-[#142420] text-[11px] font-semibold uppercase tracking-wider text-emerald-200 shadow-sm">
              <tr className="border-b border-emerald-500/30">
                <th className="border-r border-[#21332d] px-3 py-2.5 text-center w-10">#</th>
                <th className="border-r border-[#21332d] px-3 py-2.5 min-w-[215px]">Skill / MCP / Aplicación</th>
                <th className="border-r border-[#21332d] px-3 py-2.5 min-w-[200px]">Repositorio Padre (★)</th>
                <th className="border-r border-[#21332d] px-3 py-2.5 min-w-[160px]">¿Es Open Source? / Licencia</th>
                <th className="border-r border-[#21332d] px-3 py-2.5 min-w-[160px]">¿Necesita Login?</th>
                <th className="border-r border-[#21332d] px-3 py-2.5 min-w-[180px]">¿Hay que pagar? / Costo</th>
                <th className="border-r border-[#21332d] px-3 py-2.5 min-w-[280px]">Para qué sirve (Español)</th>
                <th className="border-r border-[#21332d] px-3 py-2.5 min-w-[250px]">Características y Capacidades</th>
                <th className="border-r border-[#21332d] px-3 py-2.5 min-w-[240px]">Área / Categoría & Proyecto</th>
                <th className="border-r border-[#21332d] px-3 py-2.5 min-w-[190px]">De qué Empresa / Creador es</th>
                <th className="border-r border-[#21332d] px-3 py-2.5 min-w-[140px]">Grado de Seguridad</th>
                <th className="border-r border-[#21332d] px-3 py-2.5 min-w-[220px]">Puntaje (1-10) & Recomendación</th>
                <th className="border-r border-[#21332d] px-3 py-2.5 min-w-[240px]">Comentarios (Editable)</th>
                <th className="px-3 py-2.5 min-w-[180px]">Instalación rápida</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1e2130]">
              {visibleSkills.length === 0 ? (
                <tr>
                  <td colSpan={14} className="py-12 text-center text-xs text-muted-foreground">
                    No se encontraron skills, MCPs ni aplicaciones con los filtros seleccionados.
                  </td>
                </tr>
              ) : (
                visibleSkills.map((skill, idx) => {
                  const rowNum = (currentPage - 1) * (pageSize || filteredSkills.length) + idx + 1
                  const isEditingThisSkill = editingSkillId === skill.id
                  const openSourceLabel = skill.openSourceLabel || 'Sí · Open Source (GitHub)'
                  const requiresLogin = skill.requiresLogin || 'No (100% Local)'
                  const pricingModel = skill.pricingModel || '100% Gratis (Open Source)'

                  return (
                    <tr
                      key={skill.id}
                      className="group transition-colors hover:bg-[#15211f] odd:bg-[#0f1119] even:bg-[#121520]"
                    >
                      <td className="border-r border-[#1e2130] px-2.5 py-3 text-center font-mono text-[11px] text-muted-foreground">
                        {rowNum}
                      </td>

                      {/* Skill / MCP / Aplicación */}
                      <td className="border-r border-[#1e2130] px-3 py-3 align-top">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-1.5">
                            <a
                              href={skill.skillUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="font-mono text-xs font-bold text-emerald-300 hover:underline break-all"
                              title="Abrir archivo o carpeta del recurso en GitHub"
                            >
                              {skill.skillName}
                            </a>
                            <a
                              href={skill.skillUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-muted-foreground hover:text-emerald-300 shrink-0"
                              title="Ver código en GitHub"
                            >
                              <ExternalLink className="size-3" />
                            </a>
                          </div>
                          <div className="flex flex-wrap items-center gap-1">
                            <span
                              className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                                skill.skillKind === 'Servidor / Conector MCP'
                                  ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                                  : skill.skillKind === 'Subagente Especializado'
                                  ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                                  : skill.skillKind === 'Comando Slash (/cmd)'
                                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                  : skill.skillKind === 'Skill (SKILL.md)'
                                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                  : 'bg-[#1f2437] text-[#bfb8ff] border border-[#323854]'
                              }`}
                            >
                              {skill.skillKind}
                            </span>
                            {skill.isSubSkillFromReadme && (
                              <span className="rounded bg-[#242138] px-1.5 py-0.5 text-[10px] text-[#bfb8ff]">
                                Extraído de adentro del repo
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Repositorio al que pertenece + Estrellas */}
                      <td className="border-r border-[#1e2130] px-3 py-3 align-top">
                        <div className="flex flex-col gap-1">
                          <a
                            href={skill.repoUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 font-semibold text-[#bfb8ff] hover:underline break-all"
                          >
                            <FolderGit2 className="size-3.5 shrink-0 text-[#8e83f2]" />
                            <span>{skill.repoFullName}</span>
                            <ExternalLink className="size-2.5 shrink-0" />
                          </a>
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1 font-mono text-[11px] font-semibold text-amber-300">
                              <Star className="size-3 fill-amber-400 text-amber-400" />
                              <span>{(skill.stars || 0).toLocaleString()}</span>
                            </div>
                            <button
                              type="button"
                              onClick={() =>
                                setRepoFilterForSkills(
                                  repoFilterForSkills === skill.repoFullName ? 'all' : skill.repoFullName
                                )
                              }
                              className="text-[10px] text-muted-foreground hover:text-emerald-300 underline"
                            >
                              {repoFilterForSkills === skill.repoFullName
                                ? 'Ver todos'
                                : 'Filtrar repo'}
                            </button>
                          </div>
                        </div>
                      </td>

                      {/* ¿Es Open Source? & Licencia */}
                      <td className="border-r border-[#1e2130] px-3 py-3 align-top">
                        <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/40 bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-300">
                          <Check className="size-3 shrink-0" />
                          <span>{openSourceLabel}</span>
                        </span>
                        <p className="mt-1 text-[10px] text-muted-foreground">
                          Código auditable en GitHub ({skill.licenseName || 'Open Source'})
                        </p>
                      </td>

                      {/* ¿Necesita Login? */}
                      <td className="border-r border-[#1e2130] px-3 py-3 align-top">
                        <span
                          className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-semibold ${
                            requiresLogin === 'No (100% Local)'
                              ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                              : requiresLogin === 'Opcional (API / Cloud)'
                              ? 'border-sky-500/40 bg-sky-500/15 text-sky-300'
                              : 'border-amber-500/40 bg-amber-500/15 text-amber-300'
                          }`}
                        >
                          {requiresLogin === 'No (100% Local)'
                            ? '🔓 No (100% Local)'
                            : requiresLogin === 'Opcional (API / Cloud)'
                            ? '⚡ Opcional (API / Cloud)'
                            : '🔐 Sí (Cuenta / API Key)'}
                        </span>
                      </td>

                      {/* ¿Hay que pagar? / Costo */}
                      <td className="border-r border-[#1e2130] px-3 py-3 align-top">
                        <span
                          className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-semibold ${
                            pricingModel === '100% Gratis (Open Source)'
                              ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                              : pricingModel === 'Gratis + BYOK (Tu API Key)'
                              ? 'border-[#7c6cf0]/40 bg-[#7c6cf0]/15 text-[#bfb8ff]'
                              : 'border-amber-500/40 bg-amber-500/15 text-amber-300'
                          }`}
                        >
                          {pricingModel === '100% Gratis (Open Source)'
                            ? '🟢 No · 100% Gratis'
                            : pricingModel === 'Gratis + BYOK (Tu API Key)'
                            ? '🔑 Gratis + BYOK (Tu Key)'
                            : '☁️ Freemium (Local Gratis)'}
                        </span>
                      </td>

                      {/* Para qué sirve */}
                      <td className="border-r border-[#1e2130] px-3 py-3 align-top leading-relaxed text-[#e2e4f0]">
                        {skill.whatItDoesEs}
                      </td>

                      {/* Características y Capacidades */}
                      <td className="border-r border-[#1e2130] px-3 py-3 align-top leading-relaxed text-[#91d0b4]">
                        {skill.capabilitiesEs}
                      </td>

                      {/* Área / Categoría & Proyecto */}
                      <td className="border-r border-[#1e2130] px-3 py-3 align-top leading-relaxed text-muted-foreground">
                        <span className="mb-1 inline-block rounded bg-[#181b28] px-1.5 py-0.5 text-[10px] font-medium text-[#bfb8ff]">
                          {skill.areaCategory}
                        </span>
                        <p className="text-[11px]">{skill.projectUseCases}</p>
                      </td>

                      {/* Empresa que lo desarrolló */}
                      <td className="border-r border-[#1e2130] px-3 py-3 align-top">
                        <div className="font-medium text-foreground flex items-center gap-1.5">
                          <Building2 className="size-3.5 text-emerald-400 shrink-0" />
                          <span>{skill.companyOrAuthor}</span>
                        </div>
                        <span className="mt-1 inline-block text-[10px] text-muted-foreground">
                          {skill.creatorKind}
                        </span>
                      </td>

                      {/* Grado de Seguridad */}
                      <td className="border-r border-[#1e2130] px-3 py-3 align-top">
                        <div className="flex items-center gap-1">
                          <ShieldCheck
                            className={`size-3.5 shrink-0 ${
                              skill.securityGrade === 'Alto'
                                ? 'text-emerald-400'
                                : skill.securityGrade === 'Medio'
                                ? 'text-sky-400'
                                : 'text-amber-400'
                            }`}
                          />
                          <span className="font-semibold text-foreground">{skill.securityGrade}</span>
                        </div>
                        <p className="mt-1 text-[10px] text-muted-foreground">
                          {skill.securityGrade === 'Alto'
                            ? 'Organización / repo verificado'
                            : skill.securityGrade === 'Medio'
                            ? 'Open source auditable'
                            : 'Revisar permisos locales'}
                        </p>
                      </td>

                      {/* Puntaje de Importancia (1-10) & ¿Lo recomendás? */}
                      <td className="border-r border-[#1e2130] px-3 py-3 align-top">
                        <div className="flex flex-col gap-1.5">
                          <div className="flex items-center gap-1.5">
                            <span className="rounded bg-[#252238] px-1.5 py-0.5 font-mono text-xs font-bold text-[#bfb8ff]">
                              ★ {skill.atlasScore}/10
                            </span>
                            <span className="text-[10px] text-emerald-300 font-medium">
                              Importancia
                            </span>
                          </div>
                          <select
                            value={skill.recommended}
                            onChange={e =>
                              handleSaveSkillNote(skill.id, {
                                recommended: e.target.value as SkillRecommendationVerdict
                              })
                            }
                            className={`rounded border px-2 py-1 text-[11px] font-semibold focus:outline-none ${
                              skill.recommended === 'Sí — Altamente recomendado'
                                ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                                : skill.recommended === 'Sí — Recomendado'
                                ? 'border-sky-500/40 bg-sky-500/15 text-sky-300'
                                : skill.recommended === 'No recomendado'
                                ? 'border-rose-500/40 bg-rose-500/15 text-rose-300'
                                : 'border-amber-500/40 bg-amber-500/15 text-amber-300'
                            }`}
                          >
                            <option value="Sí — Altamente recomendado" className="bg-[#12141d] text-emerald-300">
                              ✅ Sí — Altamente recomendado
                            </option>
                            <option value="Sí — Recomendado" className="bg-[#12141d] text-sky-300">
                              👍 Sí — Recomendado
                            </option>
                            <option value="Con reservas — Revisar" className="bg-[#12141d] text-amber-300">
                              ⚠️ Con reservas — Revisar
                            </option>
                            <option value="No recomendado" className="bg-[#12141d] text-rose-300">
                              ❌ No recomendado
                            </option>
                          </select>
                          <p className="text-[10px] text-muted-foreground leading-snug">
                            {skill.recommendationReason}
                          </p>
                        </div>
                      </td>

                      {/* Comentarios (Editable) */}
                      <td className="border-r border-[#1e2130] px-3 py-3 align-top">
                        {isEditingThisSkill ? (
                          <div className="flex flex-col gap-1.5">
                            <textarea
                              rows={2}
                              value={editingSkillComment}
                              onChange={e => setEditingSkillComment(e.target.value)}
                              placeholder="Agregá tus comentarios sobre este skill o MCP..."
                              className="w-full rounded border border-emerald-500 bg-[#0b0d13] p-1.5 text-xs text-foreground focus:outline-none"
                            />
                            <div className="flex items-center gap-1.5">
                              <Button
                                size="xs"
                                onClick={() =>
                                  handleSaveSkillNote(skill.id, { comments: editingSkillComment })
                                }
                                disabled={savingId === skill.id}
                                className="bg-emerald-600 text-[11px] text-white hover:bg-emerald-500"
                              >
                                Guardar
                              </Button>
                              <Button
                                size="xs"
                                variant="ghost"
                                onClick={() => setEditingSkillId(null)}
                                className="text-[11px]"
                              >
                                Cancelar
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div
                            onClick={() => {
                              setEditingSkillId(skill.id)
                              setEditingSkillComment(skill.comments || '')
                            }}
                            className="cursor-pointer rounded border border-transparent p-1.5 hover:border-emerald-500/40 hover:bg-[#15211f]"
                            title="Hacé clic para agregar o editar tu comentario"
                          >
                            {skill.comments ? (
                              <p className="text-foreground">{skill.comments}</p>
                            ) : (
                              <p className="text-[11px] italic text-muted-foreground flex items-center gap-1">
                                <MessageSquarePlus className="size-3 text-emerald-400" />
                                Clic para escribir comentario...
                              </p>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Instalación rápida */}
                      <td className="px-3 py-3 align-top">
                        <div className="flex flex-col gap-1.5">
                          <div className="flex items-center gap-1">
                            <code
                              className="truncate rounded bg-[#0b0c12] px-1.5 py-0.5 font-mono text-[10px] text-emerald-300 max-w-[130px]"
                              title={skill.installCommand}
                            >
                              {skill.installCommand}
                            </code>
                            <button
                              type="button"
                              onClick={() => handleCopyCommand(skill.id, skill.installCommand)}
                              className="rounded p-1 text-muted-foreground hover:bg-[#232638] hover:text-foreground"
                              title="Copiar comando de instalación"
                            >
                              {copiedCmdId === skill.id ? (
                                <Check className="size-3 text-emerald-400" />
                              ) : (
                                <Copy className="size-3" />
                              )}
                            </button>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <Button
                              size="xs"
                              variant="outline"
                              disabled={installingId === skill.id}
                              onClick={() => handleInstallSkillUniversal(skill.repoFullName, skill.id)}
                              className="h-6 border-emerald-500/40 bg-emerald-500/10 px-2 text-[10px] text-emerald-300 hover:bg-emerald-500/20"
                              title="Instala en 1 clic en tu PC (vía puente local localhost:3071 o descarga portátil SKILL.md en Vercel)"
                            >
                              <Download className="mr-1 size-2.5" />
                              {installingId === skill.id ? 'Instalando...' : 'Instalar en PC'}
                            </Button>
                            <a
                              href={skill.skillUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-[11px] text-emerald-400 hover:underline"
                            >
                              Ver recurso <ExternalLink className="size-2.5" />
                            </a>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        ) : activeSheet === 'links' ? (
          /* ================= PESTAÑA 3: LINKS INTERMEDIOS / EN COMENTARIOS ("EL LINK DE ESE LINK") ================= */
          <table className="w-full border-collapse text-left text-xs">
            <thead className="sticky top-0 z-10 bg-[#261e12] text-[11px] font-semibold uppercase tracking-wider text-amber-200 shadow-sm">
              <tr className="border-b border-amber-500/30">
                <th className="border-r border-[#33291a] px-3 py-2.5 text-center w-10">#</th>
                <th className="border-r border-[#33291a] px-3 py-2.5 min-w-[230px]">Publicación / Herramienta mencionada</th>
                <th className="border-r border-[#33291a] px-3 py-2.5 min-w-[280px]">Qué dice el post / Para qué sirve</th>
                <th className="border-r border-[#33291a] px-3 py-2.5 min-w-[250px]">
                  El Link de ese Link (Enlace Intermedio o Hilo)
                </th>
                <th className="border-r border-[#33291a] px-3 py-2.5 min-w-[250px]">
                  Búsqueda Asistida en 1 Clic (GitHub / Web)
                </th>
                <th className="border-r border-[#33291a] px-3 py-2.5 min-w-[220px]">Diagnóstico del Agente</th>
                <th className="px-3 py-2.5 min-w-[190px]">Acciones (Navegar / Separar)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1e2130]">
              {visibleRefLinks.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-xs text-muted-foreground">
                    No hay publicaciones técnicas pendientes sin repositorio directo para este filtro.
                  </td>
                </tr>
              ) : (
                visibleRefLinks.map(({ bm, fallback }, idx) => {
                  const rowNum = (currentPage - 1) * (pageSize || referenceLinkBookmarks.length) + idx + 1
                  return (
                    <tr
                      key={bm.id}
                      className="group transition-colors hover:bg-[#221c14] odd:bg-[#0f1119] even:bg-[#121520]"
                    >
                      <td className="border-r border-[#1e2130] px-2.5 py-3 text-center font-mono text-[11px] text-muted-foreground">
                        {rowNum}
                      </td>

                      {/* Publicación / Autor */}
                      <td className="border-r border-[#1e2130] px-3 py-3 align-top">
                        <div className="font-semibold text-amber-200">{bm.title || bm.id}</div>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                          <span className="font-mono text-[#bfb8ff]">
                            {bm.authorHandle || bm.authorName}
                          </span>
                          <span>·</span>
                          <span className="uppercase">{bm.platform}</span>
                          {bm.resourceType && (
                            <Badge variant="outline" className="border-amber-500/30 text-[10px] text-amber-300">
                              {bm.resourceType}
                            </Badge>
                          )}
                        </div>
                      </td>

                      {/* Qué dice el post */}
                      <td className="border-r border-[#1e2130] px-3 py-3 align-top leading-relaxed text-[#e2e4f0]">
                        <p className="line-clamp-3">{bm.purpose || bm.caption}</p>
                      </td>

                      {/* El Link de ese Link */}
                      <td className="border-r border-[#1e2130] px-3 py-3 align-top">
                        <div className="flex flex-col gap-1.5">
                          <a
                            href={fallback.primaryUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/15 px-2.5 py-1.5 text-[11px] font-semibold text-amber-200 hover:bg-amber-500/25 w-fit"
                          >
                            <ExternalLink className="size-3.5 shrink-0" />
                            <span>{fallback.primaryLabel}</span>
                          </a>
                          <span className="font-mono text-[10px] text-muted-foreground break-all">
                            {fallback.primaryUrl}
                          </span>
                        </div>
                      </td>

                      {/* Búsqueda Asistida en 1 Clic */}
                      <td className="border-r border-[#1e2130] px-3 py-3 align-top">
                        <div className="flex flex-col gap-1.5">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <a
                              href={fallback.githubSearchUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 rounded border border-[#7c6cf0]/50 bg-[#7c6cf0]/15 px-2 py-1 text-[11px] font-medium text-[#bfb8ff] hover:bg-[#7c6cf0]/25"
                              title="Buscar el repositorio directamente en GitHub"
                            >
                              <Search className="size-3" />
                              <span>Buscar en GitHub</span>
                            </a>
                            <a
                              href={fallback.webSearchUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 rounded border border-sky-500/40 bg-sky-500/15 px-2 py-1 text-[11px] font-medium text-sky-300 hover:bg-sky-500/25"
                              title="Buscar site:github.com en Google con las palabras clave extraídas"
                            >
                              <ExternalLink className="size-3" />
                              <span>Buscar en Google</span>
                            </a>
                          </div>
                          <span className="text-[10px] text-muted-foreground">
                            Query sugerida: <code className="text-amber-300">{fallback.extractedQuery}</code>
                          </span>
                        </div>
                      </td>

                      {/* Diagnóstico */}
                      <td className="border-r border-[#1e2130] px-3 py-3 align-top text-[11px] text-muted-foreground leading-relaxed">
                        {fallback.reasonEs}
                      </td>

                      {/* Acciones */}
                      <td className="px-3 py-3 align-top">
                        <div className="flex flex-col gap-1.5">
                          <Button
                            size="xs"
                            variant="outline"
                            disabled={isAgentRunning}
                            onClick={() => handleRunWebNavigatorAgent([bm.id])}
                            className="border-amber-500/40 bg-amber-500/10 text-[11px] text-amber-200 hover:bg-amber-500/20 justify-start"
                          >
                            <Compass className="mr-1.5 size-3" />
                            Navegar con Agente IA
                          </Button>
                          <Button
                            size="xs"
                            variant="ghost"
                            disabled={savingId === bm.id}
                            onClick={() => handleToggleOffTopicSeparation(bm, true)}
                            className="text-[11px] text-rose-300 hover:bg-rose-500/15 hover:text-rose-200 justify-start"
                            title="Si este archivo no tiene que ver con los temas que trabajamos acá, movelo a Archivos Separados (Pestaña 4)"
                          >
                            <FolderArchive className="mr-1.5 size-3" />
                            Separar (Es de otro tema)
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        ) : (
          /* ================= PESTAÑA 4: ARCHIVOS SEPARADOS (FOTOS PERSONALES Y OTROS TEMAS NO TÉCNICOS) ================= */
          <table className="w-full border-collapse text-left text-xs">
            <thead className="sticky top-0 z-10 bg-[#28151d] text-[11px] font-semibold uppercase tracking-wider text-rose-200 shadow-sm">
              <tr className="border-b border-rose-500/30">
                <th className="border-r border-[#381d28] px-3 py-2.5 text-center w-10">#</th>
                <th className="border-r border-[#381d28] px-3 py-2.5 min-w-[220px]">Archivo / Publicación Separada</th>
                <th className="border-r border-[#381d28] px-3 py-2.5 min-w-[200px]">Categoría de Otro Tema</th>
                <th className="border-r border-[#381d28] px-3 py-2.5 min-w-[280px]">Por qué se separó del Radar Técnico</th>
                <th className="border-r border-[#381d28] px-3 py-2.5 min-w-[260px]">Contenido / Multimedia</th>
                <th className="border-r border-[#381d28] px-3 py-2.5 min-w-[180px]">Enlace al Archivo</th>
                <th className="px-3 py-2.5 min-w-[180px]">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1e2130]">
              {visibleSeparated.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-xs text-muted-foreground">
                    No hay archivos separados en este momento. Cuando entren fotos personales, deportes, juegos casuales o temas ajenos al trabajo técnico, aparecerán aquí automáticamente.
                  </td>
                </tr>
              ) : (
                visibleSeparated.map(({ bm, scope }, idx) => {
                  const rowNum = (currentPage - 1) * (pageSize || separatedOffTopicBookmarks.length) + idx + 1
                  const primaryLink = (bm.outgoingLinks && bm.outgoingLinks[0]) || bm.sourceUrl
                  return (
                    <tr
                      key={bm.id}
                      className="group transition-colors hover:bg-[#24141b] odd:bg-[#0f1119] even:bg-[#121520]"
                    >
                      <td className="border-r border-[#1e2130] px-2.5 py-3 text-center font-mono text-[11px] text-muted-foreground">
                        {rowNum}
                      </td>

                      <td className="border-r border-[#1e2130] px-3 py-3 align-top">
                        <div className="font-semibold text-rose-200">{bm.title || bm.id}</div>
                        <div className="mt-1 text-[11px] text-muted-foreground">
                          {bm.authorHandle || bm.authorName} · {bm.platform.toUpperCase()}
                        </div>
                      </td>

                      <td className="border-r border-[#1e2130] px-3 py-3 align-top">
                        <Badge className="border border-rose-500/40 bg-rose-500/15 text-[11px] text-rose-200">
                          {scope.categoryLabel}
                        </Badge>
                      </td>

                      <td className="border-r border-[#1e2130] px-3 py-3 align-top leading-relaxed text-muted-foreground">
                        {scope.reasonEs}
                      </td>

                      <td className="border-r border-[#1e2130] px-3 py-3 align-top text-[#e2e4f0]">
                        <p className="line-clamp-2">{bm.caption || 'Archivo multimedia sin texto'}</p>
                        {bm.mediaType !== 'none' && (
                          <span className="mt-1 inline-block rounded bg-[#231820] px-1.5 py-0.5 text-[10px] text-rose-300">
                            Multimedia: {bm.mediaType} ({bm.mediaUrls.length})
                          </span>
                        )}
                      </td>

                      <td className="border-r border-[#1e2130] px-3 py-3 align-top">
                        <a
                          href={primaryLink}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] text-rose-300 hover:underline break-all"
                        >
                          Abrir enlace <ExternalLink className="size-3 shrink-0" />
                        </a>
                      </td>

                      <td className="px-3 py-3 align-top">
                        <Button
                          size="xs"
                          variant="outline"
                          disabled={savingId === bm.id}
                          onClick={() => handleToggleOffTopicSeparation(bm, false)}
                          className="border-border text-[11px] text-muted-foreground hover:text-foreground"
                        >
                          <RotateCcw className="mr-1.5 size-3" />
                          Devolver al Radar Técnico
                        </Button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* EXCEL BOTTOM BAR (SHEET TABS + PAGINATION LIKE MICROSOFT EXCEL) */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#252838] bg-[#141722] px-4 py-2.5 text-xs">
        {/* Bottom Sheet Tabs like Excel */}
        <div className="flex flex-wrap items-center gap-1">
          <button
            type="button"
            onClick={() => setActiveSheet('repos')}
            className={`flex items-center gap-1.5 rounded-t-md border-t-2 px-3 py-1.5 text-xs font-medium transition-colors ${
              activeSheet === 'repos'
                ? 'border-[#7c6cf0] bg-[#1d2030] text-[#bfb8ff]'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <FolderGit2 className="size-3.5" />
            <span>Hoja 1: Repositorios ({filteredRepos.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveSheet('skills')}
            className={`flex items-center gap-1.5 rounded-t-md border-t-2 px-3 py-1.5 text-xs font-medium transition-colors ${
              activeSheet === 'skills'
                ? 'border-emerald-500 bg-[#162823] text-emerald-300'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Puzzle className="size-3.5" />
            <span>Hoja 2: Skills en Repos ({filteredSkills.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveSheet('links')}
            className={`flex items-center gap-1.5 rounded-t-md border-t-2 px-3 py-1.5 text-xs font-medium transition-colors ${
              activeSheet === 'links'
                ? 'border-amber-500 bg-[#282015] text-amber-300'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Compass className="size-3.5" />
            <span>Hoja 3: Links de Referencia / En Comentarios ({referenceLinkBookmarks.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveSheet('separated')}
            className={`flex items-center gap-1.5 rounded-t-md border-t-2 px-3 py-1.5 text-xs font-medium transition-colors ${
              activeSheet === 'separated'
                ? 'border-rose-500 bg-[#28161d] text-rose-300'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <FolderArchive className="size-3.5" />
            <span>Hoja 4: Archivos Separados / Otros Temas ({separatedOffTopicBookmarks.length})</span>
          </button>
        </div>

        {/* Pagination Controls */}
        <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
          <span>
            Filas por página:
          </span>
          <select
            value={pageSize}
            onChange={e => setPageSize(Number(e.target.value))}
            className="rounded border border-[#2b2e40] bg-[#0f1118] px-2 py-1 text-xs text-foreground"
          >
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
            <option value={0}>Ver todas ({activeTotalCount})</option>
          </select>

          {pageSize > 0 && totalPages > 1 && (
            <div className="flex items-center gap-1.5 ml-2">
              <Button
                size="xs"
                variant="outline"
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                className="border-[#2b2e40] text-xs"
              >
                Anterior
              </Button>
              <span className="px-2 font-mono text-[11px] text-foreground">
                Página {currentPage} de {totalPages}
              </span>
              <Button
                size="xs"
                variant="outline"
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                className="border-[#2b2e40] text-xs"
              >
                Siguiente
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
