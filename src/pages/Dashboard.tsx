import { useEffect, useState } from 'react'
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

  const loadData = async () => {
    const [projectsRes, stagesRes] = await Promise.all([
      supabase
        .from('projects')
        .select('*')
        .order('priority_order', { ascending: true }),
      supabase
        .from('stages')
        .select('*')
        .order('sort_order', { ascending: true }),
    ])

    if (projectsRes.data) setProjects(projectsRes.data)
    if (stagesRes.data) setStages(stagesRes.data)
    setLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [])

  if (loading) {
    return <div className="text-center py-20 text-gray-500">Chargement...</div>
  }

  return (
    <div className="space-y-8">
      {/* Header section */}
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

          {/* Legend */}
          <div className="mt-4 flex flex-wrap gap-3">
            {stages.map((stage) => (
              <div key={stage.id} className="flex items-center gap-1.5 text-xs">
                <div
                  className="w-3 h-3 rounded-sm"
                  style={{ backgroundColor: stage.color }}
                />
                <span>{stage.name}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Projects list */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <h2 className="text-xl font-black mb-4">Projets</h2>

          {projects.length === 0 ? (
            <div className="text-center py-10 text-gray-400 text-sm">
              Aucun projet pour le moment
            </div>
          ) : (
            <div className="space-y-2">
              {projects.map((project) => {
                const status = statusLabels[project.status] || statusLabels.a_venir
                return (
                  <Link
                    key={project.id}
                    to={`/projet/${project.id}`}
                    className="block p-3 rounded-lg border border-gray-100 hover:border-alca-yellow hover:bg-yellow-50/50 transition"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-medium truncate">
                          {project.project_number} — {project.client_name}
                        </div>
                      </div>
                      <span
                        className={`text-xs px-2 py-0.5 rounded border whitespace-nowrap ${status.color}`}
                      >
                        {status.label}
                      </span>
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Material forecast placeholder */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
        <h2 className="text-xl font-black mb-2">Prévision de matériel</h2>
        <p className="text-gray-400 text-sm">
          La liste consolidée des composants apparaîtra ici une fois des projets avec composants créés.
        </p>
      </div>

      {/* Add Project Modal */}
      {showAddModal && (
        <AddProjectModal
          onClose={() => setShowAddModal(false)}
          onCreated={loadData}
        />
      )}
    </div>
  )
}
