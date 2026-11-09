import type {
  AtlasCustomizationConfig,
  ConfiguredApiKeys,
  LibraryColumnId,
  ThemeAccentId
} from './types'

export const CUSTOMIZATION_STORAGE_KEY = 'atlas_customization_config_v1'
export const API_KEYS_STORAGE_KEY = 'atlas_agent_api_keys_v1'

export const ALL_APP_SECTIONS = [
  'Resumen',
  'Biblioteca',
  'Repositorios',
  'Temas',
  'Fuentes',
  'Exportar',
  'Captura',
  'TablaReposSkills'
]

export const ALL_LIBRARY_COLUMNS: Array<{ id: LibraryColumnId; label: string }> = [
  { id: 'fuente', label: '1. Fuente y Fecha' },
  { id: 'nombre', label: '2. Nombre / Recurso' },
  { id: 'proposito', label: '3. Para qué sirve' },
  { id: 'tipo', label: '4. Tipo' },
  { id: 'temas', label: '5. Tema / Categoría' },
  { id: 'evaluacion', label: '6. Evaluación breve' },
  { id: 'estado', label: '7. Estado' },
  { id: 'links', label: '8. Links y Acciones' }
]

export const THEME_ACCENT_PALETTES: Record<
  ThemeAccentId,
  {
    name: string
    primary: string
    primarySoft: string
    border: string
    badgeBg: string
    badgeText: string
  }
> = {
  violet: {
    name: 'Violeta Atlas (Original)',
    primary: '#7c6cf0',
    primarySoft: '#a59cf5',
    border: '#3d3960',
    badgeBg: '#28263b',
    badgeText: '#bfb8ff'
  },
  emerald: {
    name: 'Esmeralda Hermes OS',
    primary: '#10b981',
    primarySoft: '#34d399',
    border: '#1f513f',
    badgeBg: '#122b24',
    badgeText: '#6ee7b7'
  },
  amber: {
    name: 'Ámbar Solar',
    primary: '#f59e0b',
    primarySoft: '#fbbf24',
    border: '#5c4014',
    badgeBg: '#2b2011',
    badgeText: '#fde68a'
  },
  cyan: {
    name: 'Cian Cyber',
    primary: '#06b6d4',
    primarySoft: '#22d3ee',
    border: '#164e63',
    badgeBg: '#102630',
    badgeText: '#67e8f9'
  }
}

export const DEFAULT_CUSTOMIZATION_CONFIG: AtlasCustomizationConfig = {
  themeAccent: 'violet',
  layoutDensity: 'standard',
  visibleSections: [...ALL_APP_SECTIONS],
  visibleLibraryColumns: [
    'fuente',
    'nombre',
    'proposito',
    'tipo',
    'temas',
    'evaluacion',
    'estado',
    'links'
  ],
  chatDockMode: 'right_drawer',
  toolPermissionMode: 'confirm_sensitive',
  defaultAgentId: 'hermes',
  agentModels: {
    hermes: 'hermes-orchestrator-v2',
    gemini: 'gemini-2.5-flash',
    anthropic: 'claude-3-7-sonnet-latest',
    openai: 'gpt-4o-mini'
  },
  hermesConfig: {
    personaName: 'Hermes',
    gatewayUrl: '',
    backingProvider: 'auto',
    customSystemPrompt:
      'Sos Hermes, el agente principal de Nico en Atlas de Guardados. Tu prioridad es ejecutar acciones reales mediante herramientas (tool calling), mantener separados los archivos no técnicos (fotos, deportes, cocina, memes) en "Archivo separado / Otro tema (No técnico)", navegar hilos/comentarios cuando un post no trae link directo de GitHub y dejar siempre "El Link de ese Link" cuando un repositorio no está explícito.',
    telegramBridgeEnabled: false
  },
  customQuickActions: [
    {
      id: 'qa-hunt-links',
      label: 'Investigar Hilos y Comentarios',
      prompt: 'Ejecutá el agente navegador sobre los guardados sin repo directo y actualizá El Link de ese Link.',
      section: 'all'
    },
    {
      id: 'qa-separate-offtopic',
      label: 'Auditar y Separar Off-Topic',
      prompt: 'Revisá los guardados y separá cualquier archivo no técnico (fotos personales, deportes, juegos casuales) en Archivo separado.',
      section: 'Biblioteca'
    },
    {
      id: 'qa-recommend-stack',
      label: 'Armar Stack para Nuevo Proyecto',
      prompt: 'Recomendame un stack con los mejores repositorios y skills de mi galería para un sistema multi-agente.',
      section: 'Repositorios'
    },
    {
      id: 'qa-export-excel',
      label: 'Exportar Excel Maestro (.xlsx)',
      prompt: 'Exportá todo mi catálogo actualizado a Excel (.xlsx).',
      section: 'all'
    }
  ],
  offTopicCustomKeywords: [
    'fútbol',
    'receta',
    'vacaciones',
    'selfie',
    'comprobante',
    'meme',
    'sorteo'
  ],
  autoLockManualEdits: true
}

export function loadCustomizationConfig(): AtlasCustomizationConfig {
  if (typeof window === 'undefined') return DEFAULT_CUSTOMIZATION_CONFIG
  try {
    const raw = window.localStorage.getItem(CUSTOMIZATION_STORAGE_KEY)
    if (!raw) return DEFAULT_CUSTOMIZATION_CONFIG
    const parsed = JSON.parse(raw)
    return {
      ...DEFAULT_CUSTOMIZATION_CONFIG,
      ...parsed,
      agentModels: {
        ...DEFAULT_CUSTOMIZATION_CONFIG.agentModels,
        ...(parsed.agentModels || {})
      },
      hermesConfig: {
        ...DEFAULT_CUSTOMIZATION_CONFIG.hermesConfig,
        ...(parsed.hermesConfig || {})
      },
      visibleSections:
        Array.isArray(parsed.visibleSections) && parsed.visibleSections.length > 0
          ? parsed.visibleSections
          : DEFAULT_CUSTOMIZATION_CONFIG.visibleSections,
      visibleLibraryColumns:
        Array.isArray(parsed.visibleLibraryColumns) && parsed.visibleLibraryColumns.length > 0
          ? parsed.visibleLibraryColumns
          : DEFAULT_CUSTOMIZATION_CONFIG.visibleLibraryColumns,
      customQuickActions: Array.isArray(parsed.customQuickActions)
        ? parsed.customQuickActions
        : DEFAULT_CUSTOMIZATION_CONFIG.customQuickActions,
      offTopicCustomKeywords: Array.isArray(parsed.offTopicCustomKeywords)
        ? parsed.offTopicCustomKeywords
        : DEFAULT_CUSTOMIZATION_CONFIG.offTopicCustomKeywords
    }
  } catch {
    return DEFAULT_CUSTOMIZATION_CONFIG
  }
}

export function saveCustomizationConfig(config: AtlasCustomizationConfig): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(CUSTOMIZATION_STORAGE_KEY, JSON.stringify(config))
  } catch {
    // Ignore storage quota errors
  }
}

export function applyCustomizationPatch(
  current: AtlasCustomizationConfig,
  patch: Partial<AtlasCustomizationConfig>
): AtlasCustomizationConfig {
  const next: AtlasCustomizationConfig = {
    ...current,
    ...patch,
    agentModels: {
      ...current.agentModels,
      ...(patch.agentModels || {})
    },
    hermesConfig: {
      ...current.hermesConfig,
      ...(patch.hermesConfig || {})
    }
  }
  saveCustomizationConfig(next)
  return next
}

export function loadClientApiKeys(): ConfiguredApiKeys {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(API_KEYS_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return typeof parsed === 'object' && parsed ? parsed : {}
  } catch {
    return {}
  }
}

export function saveClientApiKeys(keys: ConfiguredApiKeys): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(API_KEYS_STORAGE_KEY, JSON.stringify(keys))
  } catch {
    // Ignore quota errors
  }
}
