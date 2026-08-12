import { useEffect, useState, useRef } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { Project, Stage } from '../types/database'
import AddProjectModal from '../components/AddProjectModal'

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
  const [loading, setLoading] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  const savingOrder = useRef(false)

  const loadData = async () => {
    const [projectsRes, stagesRes] = await Promise.all([
      supabase.from('projects').select('*').order('priority_order', { ascending: true }),
      supabase.from('stages').select('*').order('sort_order', { ascending: true }),
    ])
    if (projectsRes.data) setProjects(projectsRes.data)
    if (stagesRes.data) setStages(stagesRes.data)
    setLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [])

  const saveNewOrder = async (newProjects: Project[]) => {
    if (savingOrder.current) return
    savingOrder.current = true

    // Update priority_order for all projects (10, 20, 30...)
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

  const handleDragLeave = () => {
    setDragOverId(null)
  }

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

    setProjects(newProjects)
    setDraggedId(null)
    setDragOverId(null)
    saveNewOrder(newProjects)
  }

  const handleDragEnd = () => {
    setDraggedId(null)
    setDragOverId(null)
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
          <button
            onClick={() => setShowAddModal(true)}
            className="bg-alca-yellow text-alca-black font-black px-5 py-2.5 rounded-lg hover:brightness-110 transition shadow-sm"
          >
            + Ajouter un projet
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Calendar placeholder */}
        <div className="xl:col-span-2 bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-black">Calendrier de production</h2>
            <div className="flex gap-2">
              <button className="px-3 py-1 border rounded text-sm hover:bg-gray-50">←</button>
              <button className="px-3 py-1 border rounded text-sm hover:bg-gray-50">→</button>
              <button className="px-3 py-1 border rounded text-sm hover:bg-gray-50">Agrandir</button>
            </div>
          </div>

          <div className="bg-gray-50 rounded-lg h-64 flex items-center justify-center text-gray-400">
            <div className="text-center">
              <p className="font-medium">Calendrier (4 semaines)</p>
              <p className="text-sm mt-1">Sera implémenté dans la prochaine étape</p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
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
                      className="flex-1 min-w-0 flex items-center justify-between gap-2"
                      onClick={(e) => {
                        // Prevent navigation while dragging
                        if (draggedId) e.preventDefault()
                      }}
                    >
                      <div className="font-medium truncate text-sm">
                        {project.project_number} — {project.client_name}
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded border whitespace-nowrap ${status.color}`}>
                        {status.label}
                      </span>
                    </Link>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
        <h2 className="text-xl font-black mb-2">Prévision de matériel</h2>
        <p className="text-gray-400 text-sm">
          La liste consolidée des composants apparaîtra ici une fois des projets avec composants créés.
        </p>
      </div>

      {showAddModal && (
        <AddProjectModal
          onClose={() => setShowAddModal(false)}
          onCreated={loadData}
        />
      )}
    </div>
  )
}
