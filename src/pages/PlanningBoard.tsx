import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { Project, Stage, ProjectStage } from '../types/database'

function todayISO() {
  const d = new Date()
  const z = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`
}

function isTodayCard(ps: ProjectStage) {
  const t = todayISO()
  if (!ps.start_date || !ps.end_date) return false
  return ps.start_date <= t && ps.end_date >= t
}

export default function PlanningBoard({ isAdmin }: { isAdmin: boolean }) {
  const [stages, setStages] = useState<Stage[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [pStages, setPStages] = useState<(ProjectStage & { stage?: Stage })[]>([])
  const [drag, setDrag] = useState<{ id: string; slug: string } | null>(null)

  const load = async () => {
    const [s, p, ps] = await Promise.all([
      supabase.from('stages').select('*').order('sort_order'),
      supabase.from('projects').select('*').eq('is_closed', false).order('priority_order'),
      supabase.from('project_stages').select('*, stage:stages(*)'),
    ])
    if (s.data) setStages(s.data)
    if (p.data) setProjects((p.data as Project[]).filter((x) => x.on_calendar !== false))
    if (ps.data) setPStages(ps.data as any)
  }

  useEffect(() => {
    load()
  }, [])

  const cardsFor = (slug: string) => {
    const rows = pStages.filter((ps) => ps.stage?.slug === slug && ps.is_required && !ps.is_completed)
    const withP = rows
      .map((ps) => ({ ps, project: projects.find((p) => p.id === ps.project_id) }))
      .filter((x) => x.project)
    withP.sort((a, b) => (a.ps.queue_order || 100) - (b.ps.queue_order || 100))
    return withP as { ps: ProjectStage; project: Project }[]
  }

  const ready = projects.filter((p) => {
    const mine = pStages.filter((ps) => ps.project_id === p.id && ps.is_required)
    return mine.length > 0 && mine.every((ps) => ps.is_completed)
  })

  const onDrop = async (slug: string, targetId: string) => {
    if (!isAdmin || !drag || drag.slug !== slug) {
      setDrag(null)
      return
    }
    const list = cardsFor(slug)
    const from = list.findIndex((c) => c.ps.id === drag.id)
    const to = list.findIndex((c) => c.ps.id === targetId)
    if (from < 0 || to < 0 || from === to) {
      setDrag(null)
      return
    }
    const next = [...list]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    const pinned = next.some((c) => (c.ps as any).is_pinned)
    if (pinned && !confirm('Des étapes sont épinglées au calendrier. Réordonner quand même ?')) {
      setDrag(null)
      return
    }
    await Promise.all(
      next.map((c, i) => supabase.from('project_stages').update({ queue_order: (i + 1) * 10 }).eq('id', c.ps.id))
    )
    setDrag(null)
    if (confirm('Réoptimiser le calendrier selon ce nouvel ordre (douce, épingles conservées) ?')) {
      window.dispatchEvent(new CustomEvent('alca-reoptimize'))
    }
    load()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black">Planning par étape</h1>
          <p className="text-sm text-gray-500">Ordre dans une colonne = priorité pour cette étape.</p>
        </div>
        <Link to="/" className="text-sm border px-3 py-1.5 rounded-lg hover:bg-gray-50">
          Retour calendrier
        </Link>
      </div>
      <div className="overflow-x-auto pb-4">
        <div className="flex gap-3 min-w-max">
          {stages.map((st) => (
            <div key={st.id} className="w-56 shrink-0 bg-white border rounded-xl p-2">
              <div className="text-xs font-black mb-2 px-1 flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: st.color }} />
                {st.name}
              </div>
              <div className="space-y-2 min-h-[120px]">
                {cardsFor(st.slug).map(({ ps, project }) => (
                  <div
                    key={ps.id}
                    draggable={isAdmin}
                    onDragStart={() => setDrag({ id: ps.id, slug: st.slug })}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => onDrop(st.slug, ps.id)}
                    className={`text-xs border rounded-lg px-2 py-1.5 ${
                      isTodayCard(ps)
                        ? 'bg-red-100 text-red-800 border-red-400 font-medium'
                        : 'bg-white text-gray-800 border-gray-200'
                    }`}
                  >
                    <Link to={`/projet/${project.id}`} className="font-medium block">
                      {project.project_number} — {project.client_name}
                    </Link>
                  </div>
                ))}
              </div>
            </div>
          ))}
          <div className="w-56 shrink-0 bg-white border rounded-xl p-2">
            <div className="text-xs font-black mb-2 px-1">Prêt / à livrer</div>
            {ready.map((p) => (
              <div key={p.id} className={`text-xs border rounded-lg px-2 py-1.5 mb-2 ${statusClass[p.status] || ''}`}>
                <Link to={`/projet/${p.id}`}>{p.project_number} — {p.client_name}</Link>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
