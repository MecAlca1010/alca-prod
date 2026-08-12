import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import type { Stage, HiabModel } from '../types/database'

interface AddProjectModalProps {
  onClose: () => void
  onCreated: () => void
}

export default function AddProjectModal({ onClose, onCreated }: AddProjectModalProps) {
  const [clientName, setClientName] = useState('')
  const [projectNumber, setProjectNumber] = useState('')
  const [description, setDescription] = useState('')
  const [hiabModel, setHiabModel] = useState('')
  const [serialNumber, setSerialNumber] = useState('')
  const [vin, setVin] = useState('')
  const [selectedStages, setSelectedStages] = useState<string[]>([])
  const [stages, setStages] = useState<Stage[]>([])
  const [hiabModels, setHiabModels] = useState<HiabModel[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showNewModel, setShowNewModel] = useState(false)
  const [newModelName, setNewModelName] = useState('')

  useEffect(() => {
    async function load() {
      const [stagesRes, modelsRes] = await Promise.all([
        supabase.from('stages').select('*').order('sort_order'),
        supabase.from('hiab_models').select('*').eq('is_active', true).order('name'),
      ])
      if (stagesRes.data) setStages(stagesRes.data)
      if (modelsRes.data) setHiabModels(modelsRes.data)
    }
    load()
  }, [])

  const toggleStage = (stageId: string) => {
    setSelectedStages((prev) =>
      prev.includes(stageId) ? prev.filter((id) => id !== stageId) : [...prev, stageId]
    )
  }

  const handleAddNewModel = async () => {
    if (!newModelName.trim()) return
    const { data, error } = await supabase
      .from('hiab_models')
      .insert({ name: newModelName.trim() })
      .select()
      .single()

    if (error) {
      setError('Erreur lors de l\'ajout du modèle: ' + error.message)
      return
    }
    if (data) {
      setHiabModels((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)))
      setHiabModel(data.name)
      setNewModelName('')
      setShowNewModel(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!clientName.trim() || !projectNumber.trim()) {
      setError('Le nom du client et le numéro de projet sont obligatoires.')
      return
    }

    setLoading(true)

    // 1. Create the project
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .insert({
        client_name: clientName.trim(),
        project_number: projectNumber.trim(),
        description: description.trim() || null,
        hiab_model: hiabModel || null,
        serial_number: serialNumber.trim() || null,
        vin: vin.trim() || null,
        status: 'a_venir',
        priority_order: 1000, // will be adjusted later
      })
      .select()
      .single()

    if (projectError || !project) {
      setError(projectError?.message || 'Erreur lors de la création du projet')
      setLoading(false)
      return
    }

    // 2. Create project_stages for selected stages
    if (selectedStages.length > 0) {
      const stageRows = selectedStages.map((stageId) => {
        const stage = stages.find((s) => s.id === stageId)
        return {
          project_id: project.id,
          stage_id: stageId,
          is_required: true,
          is_completed: false,
          duration_days: stage?.default_duration_days || null,
        }
      })

      const { error: stagesError } = await supabase.from('project_stages').insert(stageRows)
      if (stagesError) {
        console.error('Error creating stages:', stagesError)
      }
    }

    setLoading(false)
    onCreated()
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl my-8">
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="text-2xl font-black">Ajouter un projet</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-black text-2xl leading-none"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-5">
          {/* Client + Project number */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">
                Client <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-alca-yellow"
                placeholder="Nom du client"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                Numéro de projet <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={projectNumber}
                onChange={(e) => setProjectNumber(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-alca-yellow"
                placeholder="ex: 2026-042"
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-alca-yellow"
              placeholder="Description optionnelle..."
            />
          </div>

          {/* Hiab model */}
          <div>
            <label className="block text-sm font-medium mb-1">Modèle d'équipement (Hiab)</label>
            <div className="flex gap-2">
              <select
                value={hiabModel}
                onChange={(e) => {
                  if (e.target.value === '__new__') {
                    setShowNewModel(true)
                  } else {
                    setHiabModel(e.target.value)
                  }
                }}
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-alca-yellow"
              >
                <option value="">— Sélectionner —</option>
                {hiabModels.map((m) => (
                  <option key={m.id} value={m.name}>
                    {m.name}
                  </option>
                ))}
                <option value="__new__">+ Ajouter un modèle manuellement</option>
              </select>
            </div>

            {showNewModel && (
              <div className="mt-2 flex gap-2">
                <input
                  type="text"
                  value={newModelName}
                  onChange={(e) => setNewModelName(e.target.value)}
                  placeholder="Nom du nouveau modèle"
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-alca-yellow"
                />
                <button
                  type="button"
                  onClick={handleAddNewModel}
                  className="bg-alca-gray text-white px-4 rounded-lg hover:bg-gray-700"
                >
                  Ajouter
                </button>
                <button
                  type="button"
                  onClick={() => setShowNewModel(false)}
                  className="text-gray-500 px-2"
                >
                  Annuler
                </button>
              </div>
            )}
          </div>

          {/* Serial + VIN */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Numéro de série</label>
              <input
                type="text"
                value={serialNumber}
                onChange={(e) => setSerialNumber(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-alca-yellow"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">VIN du camion</label>
              <input
                type="text"
                value={vin}
                onChange={(e) => setVin(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-alca-yellow"
              />
            </div>
          </div>

          {/* Stages checkboxes */}
          <div>
            <label className="block text-sm font-medium mb-2">
              Étapes de production requises
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {stages.map((stage) => (
                <label
                  key={stage.id}
                  className="flex items-center gap-2 p-2 rounded-lg border border-gray-200 hover:bg-gray-50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selectedStages.includes(stage.id)}
                    onChange={() => toggleStage(stage.id)}
                    className="w-4 h-4 accent-alca-yellow"
                  />
                  <span
                    className="w-3 h-3 rounded-sm flex-shrink-0"
                    style={{ backgroundColor: stage.color }}
                  />
                  <span className="text-sm">{stage.name}</span>
                </label>
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-1">
              Tu pourras modifier les étapes plus tard dans la fiche projet.
            </p>
          </div>

          {error && (
            <div className="text-red-600 text-sm bg-red-50 p-3 rounded-lg">{error}</div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2 border-t">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 border border-gray-300 py-2.5 rounded-lg hover:bg-gray-50 transition"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-alca-yellow text-alca-black font-black py-2.5 rounded-lg hover:brightness-110 transition disabled:opacity-50"
            >
              {loading ? 'Création...' : 'Ajouter le projet'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
