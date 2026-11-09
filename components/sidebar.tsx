'use client'

import React from 'react'
import {
  Archive, LayoutDashboard, Library, FolderGit2, Tags, FolderHeart,
  CloudDownload, Zap, Settings2, Table2, Bot, Sliders
} from 'lucide-react'
import { Separator } from '@/components/ui/separator'
import { THEME_ACCENT_PALETTES } from '@/lib/customization-store'
import type { ThemeAccentId } from '@/lib/types'

export interface NavItem {
  id: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  badge?: number
}

const NAV_ITEMS: NavItem[] = [
  { id: 'Resumen', label: 'Resumen', icon: LayoutDashboard },
  { id: 'Biblioteca', label: 'Biblioteca', icon: Library },
  { id: 'Repositorios', label: 'Repositorios GitHub', icon: FolderGit2 },
  { id: 'Temas', label: 'Temas', icon: Tags },
  { id: 'Fuentes', label: 'Fuentes', icon: FolderHeart },
  { id: 'Exportar', label: 'Exportar', icon: CloudDownload },
  { id: 'Captura', label: 'Captura', icon: Zap },
  { id: 'TablaReposSkills', label: 'Tabla Repos & Skills', icon: Table2 },
]

interface SidebarProps {
  active: string
  setActive: (value: string) => void
  totalCount: number
  reposCount?: number
  visibleSections?: string[]
  themeAccent?: ThemeAccentId
  onOpenAgentChat?: () => void
  onOpenCustomization?: () => void
}

export function Sidebar({
  active,
  setActive,
  totalCount,
  reposCount,
  visibleSections,
  themeAccent = 'violet',
  onOpenAgentChat,
  onOpenCustomization
}: SidebarProps) {
  const palette = THEME_ACCENT_PALETTES[themeAccent || 'violet']
  const filteredNavItems =
    Array.isArray(visibleSections) && visibleSections.length > 0
      ? NAV_ITEMS.filter(item => visibleSections.includes(item.id))
      : NAV_ITEMS

  return (
    <aside className="fixed inset-y-0 left-0 z-20 hidden w-[248px] flex-col border-r border-border bg-[#121318] px-4 py-5 lg:flex">
      <div className="flex items-center gap-3 px-3">
        <div
          className="grid size-8 place-items-center rounded-lg text-white shadow-sm"
          style={{ backgroundColor: palette.primary }}
        >
          <Archive className="size-4" />
        </div>
        <span className="font-serif text-[17px] font-medium tracking-[-0.03em] text-[#f3f1f8]">
          Atlas de Guardados
        </span>
      </div>
      
      <p className="mt-2 px-3 text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
        Tu archivo personal
      </p>

      <nav className="mt-6 flex flex-col gap-1">
        {filteredNavItems.map(item => {
          const Icon = item.icon
          const isActive = active === item.id
          return (
            <button
              key={item.id}
              onClick={() => setActive(item.id)}
              style={isActive ? { backgroundColor: palette.badgeBg, color: palette.badgeText } : {}}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-all ${
                isActive
                  ? 'shadow-sm'
                  : 'text-muted-foreground hover:bg-[#1b1d25] hover:text-foreground'
              }`}
            >
              <Icon className="size-[17px] shrink-0" />
              <span>{item.label}</span>
              {item.id === 'Biblioteca' && (
                <span className="ml-auto rounded-full bg-[#1e2029] px-2 py-0.5 text-[11px] text-muted-foreground">
                  {totalCount}
                </span>
              )}
              {item.id === 'Repositorios' && typeof reposCount === 'number' && reposCount > 0 && (
                <span
                  className="ml-auto rounded-full px-2 py-0.5 text-[11px]"
                  style={{ backgroundColor: palette.badgeBg, color: palette.badgeText }}
                >
                  {reposCount}
                </span>
              )}
            </button>
          )
        })}
      </nav>

      <div className="mt-auto flex flex-col gap-1.5">
        {onOpenAgentChat && (
          <button
            onClick={onOpenAgentChat}
            style={{
              backgroundColor: palette.badgeBg,
              color: palette.badgeText,
              borderColor: palette.border
            }}
            className="flex items-center gap-2.5 rounded-lg border px-3 py-2 text-left text-xs font-semibold transition-all hover:opacity-90"
          >
            <Bot className="size-4 shrink-0" />
            <span>Chat Agéntico (Hermes)</span>
            <kbd className="ml-auto rounded bg-black/30 px-1.5 py-0.5 text-[10px]">Ctrl+J</kbd>
          </button>
        )}

        {onOpenCustomization && (
          <button
            onClick={onOpenCustomization}
            className="flex items-center gap-2.5 rounded-md px-3 py-2 text-xs text-muted-foreground hover:bg-[#1b1d25] hover:text-foreground"
          >
            <Sliders className="size-4 shrink-0" />
            <span>Customización & Reglas</span>
          </button>
        )}

        <button
          onClick={() => setActive('Captura')}
          className="flex items-center gap-2.5 rounded-md px-3 py-2 text-xs text-muted-foreground hover:bg-[#1b1d25] hover:text-foreground"
        >
          <Settings2 className="size-4 shrink-0" />
          <span>Ajustes & Conexión</span>
        </button>
        
        <Separator className="my-2 bg-border" />
        
        <div className="flex items-center gap-3 px-3 py-1.5">
          <div className="grid size-7 place-items-center rounded-full bg-[#3e4050] text-xs font-semibold text-white">
            AG
          </div>
          <div className="min-w-0">
            <p className="truncate text-xs font-medium text-foreground">Mi Archivo</p>
            <p className="truncate text-[11px] text-muted-foreground">Hermes · Gemini · Claude · GPT</p>
          </div>
          <div className="ml-auto size-2 rounded-full bg-[#91d0b4]" title="Base de datos activa" />
        </div>
      </div>
    </aside>
  )
}
