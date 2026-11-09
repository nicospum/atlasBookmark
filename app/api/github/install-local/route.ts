import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { execFileSync } from 'child_process'
import { DATA_DIR } from '@/lib/db'
import { getGalleryRepositoryByFullName } from '@/lib/bookmarks-repository'
import { extractInstallAndSetupSnippets } from '@/lib/github-gallery'
import { auditRepositorySecurityAndHealth } from '@/lib/repo-security-scanner'
import type { GalleryRepository, LocalInstallResult } from '@/lib/types'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-github-token'
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

function resolveWritableInstallBaseDir(): { baseDir: string; isCloudEphemeral: boolean } {
  const cwd = process.cwd()
  try {
    const probe = path.join(cwd, `.install_probe_${process.pid}`)
    fs.writeFileSync(probe, 'ok', 'utf-8')
    fs.rmSync(probe, { force: true })
    return { baseDir: cwd, isCloudEphemeral: false }
  } catch {
    return { baseDir: DATA_DIR, isCloudEphemeral: true }
  }
}

const SAFE_SEGMENT_REGEX = /^[a-zA-Z0-9_.-]+$/

function isValidRepoSegment(segment: string): boolean {
  if (!segment || segment === '.' || segment === '..') return false
  return SAFE_SEGMENT_REGEX.test(segment)
}

function buildFallbackGalleryRepo(
  owner: string,
  name: string,
  partial?: Partial<GalleryRepository>
): GalleryRepository {
  const fullName = `${owner}/${name}`
  const nowIso = new Date().toISOString()
  return {
    id: partial?.id || 0,
    owner,
    name,
    fullName,
    url: partial?.url || `https://github.com/${fullName}`,
    avatarUrl: partial?.avatarUrl || `https://github.com/${owner}.png?size=128`,
    description: partial?.description || `Repositorio ${fullName}`,
    explanation: partial?.explanation || partial?.description || `Repositorio ${fullName}`,
    shortExplanationEs: partial?.shortExplanationEs,
    longExplanationEs: partial?.longExplanationEs,
    readme: partial?.readme || '',
    imageUrl: partial?.imageUrl || null,
    imageSource: partial?.imageSource || 'fallback',
    stars: Number(partial?.stars) || 0,
    forks: Number(partial?.forks) || 0,
    openIssues: Number(partial?.openIssues) || 0,
    primaryLanguage: partial?.primaryLanguage || null,
    languages: partial?.languages || [],
    topics: Array.isArray(partial?.topics) ? partial!.topics : [],
    license: partial?.license || null,
    createdAt: partial?.createdAt || nowIso,
    updatedAt: partial?.updatedAt || nowIso,
    pushedAt: partial?.pushedAt || nowIso,
    latestRelease: partial?.latestRelease || null,
    addedAt: partial?.addedAt || nowIso,
    homepage: partial?.homepage || null,
    defaultBranch: partial?.defaultBranch || 'main',
    resourceType: partial?.resourceType
  }
}

export async function GET() {
  try {
    const { baseDir, isCloudEphemeral } = resolveWritableInstallBaseDir()
    const skillsDir = path.join(baseDir, 'skills-installed')
    const mcpConfigPath = path.join(DATA_DIR, 'mcp_servers_atlas.json')

    const installedSkills: string[] = []
    if (fs.existsSync(skillsDir)) {
      const entries = fs.readdirSync(skillsDir, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.isDirectory()) installedSkills.push(entry.name)
      }
    }

    let mcpConfig: Record<string, any> = { mcpServers: {} }
    if (fs.existsSync(mcpConfigPath)) {
      try {
        mcpConfig = JSON.parse(fs.readFileSync(mcpConfigPath, 'utf-8'))
      } catch {
        mcpConfig = { mcpServers: {} }
      }
    }

    return NextResponse.json(
      {
        success: true,
        hostPlatform: os.platform(),
        isCloudEphemeral,
        skillsInstalledDir: skillsDir,
        installedSkills,
        mcpConfigPath,
        mcpConfig
      },
      { headers: CORS_HEADERS }
    )
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || 'Error al consultar instalaciones locales.' },
      { status: 500, headers: CORS_HEADERS }
    )
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const installMode: string = body?.installMode || body?.mode || body?.action || 'skill_clone'
    const token: string | null =
      body?.token || request.headers.get('x-github-token') || process.env.GITHUB_TOKEN || null

    // Resolve owner & repo from body.owner/body.repo, body.fullName, or body.repository
    let owner = String(body?.owner || body?.repository?.owner || '').trim()
    let repoName = String(body?.repo || body?.name || body?.repository?.name || '').trim()

    if ((!owner || !repoName) && typeof body?.fullName === 'string' && body.fullName.includes('/')) {
      const parts = body.fullName.trim().split('/')
      owner = owner || parts[0]?.trim() || ''
      repoName = repoName || parts[1]?.trim() || ''
    }

    if (!isValidRepoSegment(owner) || !isValidRepoSegment(repoName)) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Parámetros owner/repo inválidos. Solo se permiten caracteres alfanuméricos, guiones, puntos y guiones bajos.'
        },
        { status: 400 }
      )
    }

    const fullName = `${owner}/${repoName}`
    const storedRepo = getGalleryRepositoryByFullName(fullName)
    const repoObj = storedRepo
      ? { ...storedRepo, ...(body?.repository || {}) }
      : buildFallbackGalleryRepo(owner, repoName, body?.repository || body)

    // MODE 3: Security & Health Audit ('audit')
    if (installMode === 'audit') {
      const audit = await auditRepositorySecurityAndHealth(repoObj, { token })
      return NextResponse.json(
        {
          success: true,
          fullName,
          audit
        },
        { headers: CORS_HEADERS }
      )
    }

    const { baseDir, isCloudEphemeral } = resolveWritableInstallBaseDir()

    // MODE 2: 1-Click MCP Server Local Config ('mcp_config')
    if (installMode === 'mcp_config') {
      const mcpConfigPath = path.join(DATA_DIR, 'mcp_servers_atlas.json')
      fs.mkdirSync(DATA_DIR, { recursive: true })

      let existingConfig: { mcpServers: Record<string, any> } = { mcpServers: {} }
      if (fs.existsSync(mcpConfigPath)) {
        try {
          const parsed = JSON.parse(fs.readFileSync(mcpConfigPath, 'utf-8'))
          if (parsed && typeof parsed === 'object') {
            existingConfig = {
              ...parsed,
              mcpServers:
                parsed.mcpServers && typeof parsed.mcpServers === 'object' ? parsed.mcpServers : {}
            }
          }
        } catch {
          existingConfig = { mcpServers: {} }
        }
      }

      const snippet = extractInstallAndSetupSnippets(repoObj)
      const defaultServerKey = repoName.toLowerCase().replace(/[^a-z0-9_-]/g, '-')
      let newServersMap: Record<string, any> = {}

      const rawMcpJson = body?.mcpConfigJson || snippet.mcpConfigJson
      if (typeof rawMcpJson === 'string' && rawMcpJson.trim()) {
        try {
          const parsedSnippet = JSON.parse(rawMcpJson)
          if (parsedSnippet?.mcpServers && typeof parsedSnippet.mcpServers === 'object') {
            newServersMap = parsedSnippet.mcpServers
          }
        } catch {
          // Fallback below
        }
      }

      if (Object.keys(newServersMap).length === 0) {
        newServersMap = {
          [defaultServerKey]: {
            command: 'npx',
            args: ['-y', `github:${fullName}`]
          }
        }
      }

      existingConfig.mcpServers = {
        ...existingConfig.mcpServers,
        ...newServersMap
      }

      fs.writeFileSync(mcpConfigPath, JSON.stringify(existingConfig, null, 2), 'utf-8')

      const addedKeys = Object.keys(newServersMap).join(', ')
      const result: LocalInstallResult = {
        success: true,
        fullName,
        installMode: 'mcp_config',
        targetPath: mcpConfigPath,
        messageEs: `Configuración MCP para "${addedKeys}" fusionada correctamente en ${mcpConfigPath}.`,
        commandExecuted: snippet.primaryCommand
      }

      return NextResponse.json(
        {
          ...result,
          result,
          isCloudEphemeral,
          mcpConfig: existingConfig,
          portableBundle: {
            fileName: 'mcp_servers_atlas.json',
            content: JSON.stringify(existingConfig, null, 2)
          }
        },
        { headers: CORS_HEADERS }
      )
    }

    // MODE 1: 1-Click Local Skill / Repo Clone ('skill_clone' | 'repo_clone')
    const baseSkillsDir = path.join(baseDir, 'skills-installed')
    const targetPath = path.join(baseSkillsDir, repoName)

    // Strict containment check inside skills-installed
    if (!targetPath.startsWith(baseSkillsDir + path.sep)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Directorio de destino fuera del espacio de trabajo permitido.'
        },
        { status: 400, headers: CORS_HEADERS }
      )
    }

    fs.mkdirSync(baseSkillsDir, { recursive: true })

    const cloneUrl = `https://github.com/${owner}/${repoName}.git`
    const commandExecuted = `git clone --depth 1 ${cloneUrl} "${targetPath}"`
    let clonedWithGit = false
    let gitDetailMessage = ''

    if (!isCloudEphemeral) {
      try {
        if (fs.existsSync(path.join(targetPath, '.git'))) {
          execFileSync('git', ['-C', targetPath, 'pull', '--ff-only'], {
            timeout: 20000,
            stdio: 'pipe'
          })
          clonedWithGit = true
          gitDetailMessage = `Repositorio actualizado (git pull) en ${targetPath}.`
        } else {
          if (fs.existsSync(targetPath) && fs.readdirSync(targetPath).length > 0) {
            clonedWithGit = false
          } else {
            execFileSync('git', ['clone', '--depth', '1', cloneUrl, targetPath], {
              timeout: 25000,
              stdio: 'pipe'
            })
            clonedWithGit = true
            gitDetailMessage = `Skill / Repositorio clonado exitosamente con git en ${targetPath}.`
          }
        }
      } catch {
        clonedWithGit = false
      }
    }

    // Fallback if git fails, is offline, or running in serverless cloud: download SKILL.md / README.md directly
    if (!clonedWithGit) {
      fs.mkdirSync(targetPath, { recursive: true })
      const branch = repoObj.defaultBranch || 'main'
      let downloadedFiles: string[] = []

      for (const candidateFile of ['SKILL.md', 'README.md']) {
        try {
          const rawUrl = `https://raw.githubusercontent.com/${encodeURIComponent(
            owner
          )}/${encodeURIComponent(repoName)}/${encodeURIComponent(branch)}/${candidateFile}`
          const rawRes = await fetch(rawUrl, { signal: AbortSignal.timeout(5000) })
          if (rawRes.ok) {
            const textContent = await rawRes.text()
            if (textContent && textContent.trim()) {
              fs.writeFileSync(path.join(targetPath, candidateFile), textContent, 'utf-8')
              downloadedFiles.push(candidateFile)
            }
          }
        } catch {
          // Ignore individual raw file download failure
        }
      }

      if (downloadedFiles.length === 0) {
        const fallbackReadme =
          repoObj.readme ||
          [
            `# ${repoObj.fullName}`,
            '',
            repoObj.shortExplanationEs || repoObj.description,
            '',
            `- URL original: ${repoObj.url}`,
            `- Instalado desde Atlas de Guardados: ${new Date().toISOString()}`
          ].join('\n')
        fs.writeFileSync(path.join(targetPath, 'README.md'), fallbackReadme, 'utf-8')
        downloadedFiles.push('README.md')
      }

      if (!fs.existsSync(path.join(targetPath, 'SKILL.md'))) {
        const generatedSkillMd = [
          '---',
          `name: ${repoName.toLowerCase().replace(/[^a-z0-9_-]/g, '-')}`,
          `description: ${(repoObj.shortExplanationEs || repoObj.description || fullName).replace(/[\r\n:]+/g, ' ')}`,
          `repository: ${repoObj.url}`,
          '---',
          '',
          `# ${fullName}`,
          '',
          repoObj.longExplanationEs || repoObj.shortExplanationEs || repoObj.description,
          ''
        ].join('\n')
        fs.writeFileSync(path.join(targetPath, 'SKILL.md'), generatedSkillMd, 'utf-8')
        downloadedFiles.push('SKILL.md')
      }

      gitDetailMessage = `Skill instalada en ${targetPath} (${downloadedFiles.join(', ')} listos para tu agente).`
    }

    let skillMdContent = ''
    try {
      const skillMdPath = path.join(targetPath, 'SKILL.md')
      if (fs.existsSync(skillMdPath)) {
        skillMdContent = fs.readFileSync(skillMdPath, 'utf-8')
      }
    } catch {}

    const normalizedMode: LocalInstallResult['installMode'] =
      installMode === 'repo_clone' ? 'repo_clone' : 'skill_clone'

    const result: LocalInstallResult = {
      success: true,
      fullName,
      installMode: normalizedMode,
      targetPath,
      messageEs: gitDetailMessage,
      commandExecuted
    }

    return NextResponse.json(
      {
        ...result,
        result,
        isCloudEphemeral,
        portableBundle: {
          folderName: repoName,
          fileName: 'SKILL.md',
          content: skillMdContent,
          windowsCommand: `git clone --depth 1 https://github.com/${owner}/${repoName}.git "$HOME/.gemini/skills/${repoName}"`
        }
      },
      { headers: CORS_HEADERS }
    )
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error?.message || 'No se pudo completar la instalación o auditoría local.'
      },
      { status: 500, headers: CORS_HEADERS }
    )
  }
}
