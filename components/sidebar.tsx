'use client'

import React from 'react'
import {
  Archive, LayoutDashboard, Library, FolderGit2, Tags, FolderHeart,
  CloudDownload, Zap, Settings2, Table2
} from 'lucide-react'
import { Separator } from '@/components/ui/separator'

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
}

export function Sidebar({ active, setActive, totalCount, reposCount }: SidebarProps) {
  return (
    <aside className="fixed inset-y-0 left-0 z-20 hidden w-[248px] flex-col border-r border-border bg-[#121318] px-4 py-5 lg:flex">
      <div className="flex items-center gap-3 px-3">
        <div className="grid size-8 place-items-center rounded-lg bg-[#7c6cf0] text-white shadow-sm shadow-[#7c6cf0]/20">
          <Archive className="size-4" />
        </div>
        <span className="font-serif text-[17px] font-medium tracking-[-0.03em] text-[#f3f1f8]">
          Atlas de Guardados
        </span>
      </div>
      
      <p className="mt-2 px-3 text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
        Tu archivo personal
      </p>

      <nav className="mt-8 flex flex-col gap-1">
        {NAV_ITEMS.map(item => {
          const Icon = item.icon
          const isActive = active === item.id
          return (
            <button
              key={item.id}
              onClick={() => setActive(item.id)}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-all ${
                isActive
                  ? 'bg-[#28263b] text-[#bfb8ff] shadow-sm'
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
                <span className="ml-auto rounded-full bg-[#242138] px-2 py-0.5 text-[11px] text-[#bfb8ff]">
                  {reposCount}
                </span>
              )}
            </button>
          )
        })}
      </nav>

      <div className="mt-auto flex flex-col gap-1">
        <button
          onClick={() => setActive('Captura')}
          className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm text-muted-foreground hover:bg-[#1b1d25] hover:text-foreground"
        >
          <Settings2 className="size-[17px]" />
          <span>Ajustes & Conexión</span>
        </button>
        
        <Separator className="my-3 bg-border" />
        
        <div className="flex items-center gap-3 px-3 py-2">
          <div className="grid size-7 place-items-center rounded-full bg-[#3e4050] text-xs font-semibold text-white">
            AG
          </div>
          <div className="min-w-0">
            <p className="truncate text-xs font-medium text-foreground">Mi Archivo</p>
            <p className="truncate text-[11px] text-muted-foreground">X · IG · WA · GitHub</p>
          </div>
          <div className="ml-auto size-2 rounded-full bg-[#91d0b4]" title="Base de datos activa" />
        </div>
      </div>
    </aside>
  )
}
