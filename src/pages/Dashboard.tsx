import { useEffect, useState, useRef, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { Project, Stage, ProjectStage } from '../types/database'
import AddProjectModal from '../components/AddProjectModal'
import ProductionCalendar from '../components/ProductionCalendar'
import ConfirmModal from '../components/ConfirmModal'
import StageDurationsModal from '../components/StageDurationsModal'
import { scheduleProjects, type ScheduledStage } from '../lib/scheduler'

interface DashboardProps {
  isAdmin: boolean
}

const statusLabels: Record<string, { label: string; color: string }> = {
  en_cours: { label: 'En cours', color: 'bg-red-100 text-red-800 border-red-300' },
  a_venir: { label: 'À venir', color: 'bg-gray-100 text-gray-700 border-gray-300' },
  en_preparation: { label: 'En préparation', color: 'bg-blue-100 text-blue-800 border-blue-300' },
  camion_recu: { label: 'Camion reçu', color: 'bg-green-100 text-green-800 border-green-300' },
}

export default function Dashboard({ isAdmin }: DashboardProps) {
  const [projects, setProjects] = useState<Project[]>([])
  const [stages, setStages] = useState<Stage[]>([])
  const [projectStages, setProjectStages] = useState<(ProjectStage & { stage?: Stage })[]>([])
  const [scheduledStages, setScheduledStages] = useState<ScheduledStage[]>([])
  const [materialLines, setMaterialLines] = useState<{ part_number: string; description: string; total_quantity: number }[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [showDurationsModal, setShowDurationsModal] = useState(false)
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  const [isOptimizing, setIsOptimizing] = useState(false)

  // Confirmation modal state
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [pendingProjects, setPendingProjects] = useState<Project[] | null>(null)
  const [confirmMessage, setConfirmMessage] = useState('')

  const savingOrder = useRef(false)

  const loadData = useCallback(async () => {
    const [projectsRes, stagesRes, psRes] = await Promise.all([
      supabase.from('projects').select('*').order('priority_order', { ascending: true }),
      supabase.from('stages').select('*').order('sort_order', { ascending: true }),
      supabase.from('project_stages').select('*, stage:stages(*)'),
    ])

    const projs = projectsRes.data || []
    const stgs = stagesRes.data || []
    const pStages = (psRes.data || []) as (ProjectStage & { stage?: Stage })[]

    setProjects(projs)
    setStages(stgs)
    setProjectStages(pStages)
    setLoading(false)

    // Auto-schedule if we have data
    if (projs.length > 0 && pStages.length > 0) {
      runSchedule(projs, pStages, stgs)
    } else {
      setScheduledStages([])
    }

    // Material forecast: aggregate sub-components across all projects
    {
      const { data: pcs } = await supabase
        .from('project_components')
        .select('quantity, component_id')

      if (!pcs || pcs.length === 0) {
        setMaterialLines([])
      } else {
        const compQty: Record<string, number> = {}
        for (const pc of pcs) {
          compQty[pc.component_id] = (compQty[pc.component_id] || 0) + (pc.quantity || 1)
        }
        const compIds = Object.keys(compQty)
        const { data: items } = await supabase
          .from('component_items')
          .select('component_id, quantity, sub_component:sub_components(part_number, description, id)')
          .in('component_id', compIds)

        if (!items) {
          setMaterialLines([])
        } else {
          const totals: Record<string, { part_number: string; description: string; total_quantity: number }> = {}
          for (const item of items as any[]) {
            const sub = item.sub_component
            if (!sub) continue
            const mult = compQty[item.component_id] || 1
            const qty = (item.quantity || 1) * mult
            if (!totals[sub.id]) {
              totals[sub.id] = {
                part_number: sub.part_number,
                description: sub.description,
                total_quantity: 0,
              }
            }
            totals[sub.id].total_quantity += qty
          }
          setMaterialLines(Object.values(totals).sort((a, b) => a.part_number.localeCompare(b.part_number)))
        }
      }
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const runSchedule = async (
    projs: Project[],
    pStages: (ProjectStage & { stage?: Stage })[],
    stgs: Stage[]
  ) => {
    setIsOptimizing(true)
    try {
      const result = scheduleProjects(projs, pStages, stgs)

      // Persist dates to project_stages
      const updates = result.stages.map((s) =>
        supabase
          .from('project_stages')
          .update({
            start_date: s.startDate,
            end_date: s.endDate,
            duration_days: s.durationDays,
          })
          .eq('id', s.projectStageId)
      )
      await Promise.all(updates)

      // Persist estimated delivery dates
      const deliveryUpdates = Object.entries(result.estimatedDeliveries).map(
        ([projectId, date]) =>
          supabase
            .from('projects')
            .update({ estimated_delivery_date: date })
            .eq('id', projectId)
      )
      await Promise.all(deliveryUpdates)

      setScheduledStages(result.stages)
    } catch (err) {
      console.error('Schedule error:', err)
    }
    setIsOptimizing(false)
  }

  const handleReoptimize = () => {
    if (projects.length === 0) return
    runSchedule(projects, projectStages, stages)
  }

  const handleStageDatesChange = async (stage: ScheduledStage) => {
    // Persist manual override to DB
    await supabase
      .from('project_stages')
      .update({
        start_date: stage.startDate,
        end_date: stage.endDate,
        duration_days: stage.durationDays,
      })
      .eq('id', stage.projectStageId)

    // Update local scheduled stages
    setScheduledStages((prev) =>
      prev.map((s) => (s.projectStageId === stage.projectStageId ? stage : s))
    )

    // Recalculate estimated delivery for this project
    const projectStagesForProj = scheduledStages
      .filter((s) => s.projectId === stage.projectId)
      .map((s) => (s.projectStageId === stage.projectStageId ? stage : s))

    if (projectStagesForProj.length > 0) {
      const lastEnd = projectStagesForProj.reduce((max, s) =>
        s.endDate > max ? s.endDate : max, projectStagesForProj[0].endDate)
      // next business day approx: just store last end for now; full recalc on reoptimize
      await supabase
        .from('projects')
        .update({ estimated_delivery_date: lastEnd })
        .eq('id', stage.projectId)
      setProjects((prev) =>
        prev.map((p) =>
          p.id === stage.projectId ? { ...p, estimated_delivery_date: lastEnd } : p
        )
      )
    }
  }

  const handleDurationsSaved = (updated: Stage[]) => {
    setStages(updated)
    // Ask to reoptimize
    setConfirmMessage(
      'Les durées des étapes ont été modifiées.\n\nVoulez-vous réoptimiser le calendrier avec les nouvelles durées ?'
    )
    setPendingProjects(projects) // reuse confirm flow for reoptimize
    setConfirmOpen(true)
  }

  // --- Drag & drop with confirmation ---
  const saveNewOrder = async (newProjects: Project[]) => {
    if (savingOrder.current) return
    savingOrder.current = true

    const updates = newProjects.map((p, index) =>
      supabase
        .from('projects')
        .update({ priority_order: (index + 1) * 10 })
        .eq('id', p.id)
    )
    await Promise.all(updates)
    savingOrder.current = false
  }

  const handleDragStart = (e: React.DragEvent, id: string) => {
    if (!isAdmin) return
    setDraggedId(id)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault()
    if (!isAdmin || !draggedId || draggedId === id) return
    setDragOverId(id)
  }

  const handleDragLeave = () => setDragOverId(null)

  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault()
    if (!isAdmin || !draggedId || draggedId === targetId) {
      setDraggedId(null)
      setDragOverId(null)
      return
    }

    const oldIndex = projects.findIndex((p) => p.id === draggedId)
    const newIndex = projects.findIndex((p) => p.id === targetId)
    if (oldIndex === -1 || newIndex === -1) return

    const newProjects = [...projects]
    const [moved] = newProjects.splice(oldIndex, 1)
    newProjects.splice(newIndex, 0, moved)

    // Show confirmation before applying + reoptimizing
    setPendingProjects(newProjects)
    setConfirmMessage(
      `Vous avez changé l'ordre de priorité des projets.\n\nVoulez-vous que l'algorithme réorganise automatiquement le calendrier de production selon ce nouvel ordre ?`
    )
    setConfirmOpen(true)

    setDraggedId(null)
    setDragOverId(null)
  }

  const handleDragEnd = () => {
    setDraggedId(null)
    setDragOverId(null)
  }

  const handleConfirmReorder = async () => {
    if (!pendingProjects) return
    setConfirmOpen(false)
    // If projects order actually changed in UI already differently handled;
    // For durations save we pass current projects and just reoptimize
    const orderChanged = pendingProjects.some((p, i) => projects[i]?.id !== p.id)
    if (orderChanged) {
      setProjects(pendingProjects)
      await saveNewOrder(pendingProjects)
      await runSchedule(pendingProjects, projectStages, stages)
    } else {
      // durations change → just reoptimize with current order
      await runSchedule(projects, projectStages, stages)
    }
    setPendingProjects(null)
  }

  const handleCancelReorder = () => {
    setConfirmOpen(false)
    setPendingProjects(null)
  }

  if (loading) {
    return <div className="text-center py-20 text-gray-500">Chargement...</div>
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black">Tableau de bord</h1>
          <p className="text-gray-500 mt-1">Planification de production</p>
        </div>

        {isAdmin && (
          <div className="flex gap-2">
            <Link
              to="/composants"
              className="border border-gray-300 px-4 py-2.5 rounded-lg text-sm hover:bg-gray-50 transition inline-flex items-center"
            >
              Composants
            </Link>
            <button
              onClick={() => setShowDurationsModal(true)}
              className="border border-gray-300 px-4 py-2.5 rounded-lg text-sm hover:bg-gray-50 transition"
            >
              Durées des étapes
            </button>
            <button
              onClick={() => setShowAddModal(true)}
              className="bg-alca-yellow text-alca-black font-black px-5 py-2.5 rounded-lg hover:brightness-110 transition shadow-sm"
            >
              + Ajouter un projet
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Calendar */}
        <div className="xl:col-span-2">
          <ProductionCalendar
            scheduledStages={scheduledStages}
            isAdmin={isAdmin}
            onReoptimize={handleReoptimize}
            isOptimizing={isOptimizing}
            onStageDatesChange={handleStageDatesChange}
          />

          {/* Legend */}
          <div className="mt-3 flex flex-wrap gap-3 px-1">
            {stages.map((stage) => (
              <div key={stage.id} className="flex items-center gap-1.5 text-xs">
                <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: stage.color }} />
                <span>{stage.name}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Projects list with drag & drop */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-black">Projets</h2>
            {isAdmin && projects.length > 1 && (
              <span className="text-xs text-gray-400">Glisser pour réordonner</span>
            )}
          </div>

          {projects.length === 0 ? (
            <div className="text-center py-10 text-gray-400 text-sm">
              Aucun projet pour le moment
            </div>
          ) : (
            <div className="space-y-1.5">
              {projects.map((project) => {
                const status = statusLabels[project.status] || statusLabels.a_venir
                const isDragging = draggedId === project.id
                const isDragOver = dragOverId === project.id
                const delivery = project.estimated_delivery_date

                return (
                  <div
                    key={project.id}
                    draggable={isAdmin}
                    onDragStart={(e) => handleDragStart(e, project.id)}
                    onDragOver={(e) => handleDragOver(e, project.id)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, project.id)}
                    onDragEnd={handleDragEnd}
                    className={`
                      relative flex items-center gap-2 p-2.5 rounded-lg border transition
                      ${isAdmin ? 'cursor-grab active:cursor-grabbing' : ''}
                      ${isDragging ? 'opacity-40 border-dashed' : 'border-gray-100'}
                      ${isDragOver ? 'border-alca-yellow bg-yellow-50' : 'hover:border-gray-200 hover:bg-gray-50'}
                    `}
                  >
                    {isAdmin && (
                      <div className="text-gray-300 text-sm select-none px-0.5" title="Glisser pour réordonner">
                        ⋮⋮
                      </div>
                    )}

                    <Link
                      to={`/projet/${project.id}`}
                      className="flex-1 min-w-0"
                      onClick={(e) => {
                        if (draggedId) e.preventDefault()
                      }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-medium truncate text-sm">
                          {project.project_number} — {project.client_name}
                        </div>
                        <span className={`text-xs px-2 py-0.5 rounded border whitespace-nowrap ${status.color}`}>
                          {status.label}
                        </span>
                      </div>
                      {delivery && (
                        <div className="text-[11px] text-gray-400 mt-0.5">
                          Livraison est. : {delivery}
                        </div>
                      )}
                    </Link>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xl font-black">Prévision de matériel</h2>
          {isAdmin && (
            <Link to="/composants" className="text-sm border px-3 py-1.5 rounded-lg hover:bg-gray-50">
              Gérer le catalogue
            </Link>
          )}
        </div>
        {materialLines.length === 0 ? (
          <p className="text-gray-400 text-sm">
            Aucun matériel à prévoir. Ajoutez des composants aux projets pour voir la consolidation ici.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b">
                  <th className="pb-2 font-medium">N° pièce</th>
                  <th className="pb-2 font-medium">Description</th>
                  <th className="pb-2 font-medium text-right">Qté totale</th>
                </tr>
              </thead>
              <tbody>
                {materialLines.map((line) => (
                  <tr key={line.part_number} className="border-b border-gray-50">
                    <td className="py-2 font-medium">{line.part_number}</td>
                    <td className="py-2 text-gray-600">{line.description}</td>
                    <td className="py-2 text-right font-black">{line.total_quantity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showAddModal && (
        <AddProjectModal
          onClose={() => setShowAddModal(false)}
          onCreated={loadData}
        />
      )}

      {showDurationsModal && (
        <StageDurationsModal
          stages={stages}
          onClose={() => setShowDurationsModal(false)}
          onSaved={handleDurationsSaved}
        />
      )}

      {confirmOpen && (
        <ConfirmModal
          title="Réorganiser le calendrier ?"
          message={confirmMessage}
          confirmLabel="Oui, réoptimiser"
          cancelLabel="Non, garder l'ordre actuel"
          onConfirm={handleConfirmReorder}
          onCancel={handleCancelReorder}
        />
      )}
    </div>
  )
}
