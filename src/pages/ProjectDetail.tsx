import { useEffect, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { Project, ProjectStage, Stage, ProjectStatus, Component, ProjectComponent, HiabModel } from '../types/database'
import { STAGE_OPTIONS } from '../lib/labor'

interface ProjectDetailProps {
  isAdmin: boolean
}

const statusOptions: { value: ProjectStatus; label: string; color: string }[] = [
  { value: 'en_cours', label: 'En cours', color: 'bg-red-100 text-red-800 border-red-300' },
  { value: 'a_venir', label: 'À venir', color: 'bg-gray-100 text-gray-700 border-gray-300' },
  { value: 'en_preparation', label: 'En préparation', color: 'bg-blue-100 text-blue-800 border-blue-300' },
  { value: 'camion_recu', label: 'Camion reçu', color: 'bg-green-100 text-green-800 border-green-300' },
]

export default function ProjectDetail({ isAdmin }: ProjectDetailProps) {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [project, setProject] = useState<Project | null>(null)
  const [projectStages, setProjectStages] = useState<(ProjectStage & { stage: Stage })[]>([])
  const [allStages, setAllStages] = useState<Stage[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const [clientName, setClientName] = useState('')
  const [projectNumber, setProjectNumber] = useState('')
  const [description, setDescription] = useState('')
  const [hiabModel, setHiabModel] = useState('')
  const [hiabModels, setHiabModels] = useState<HiabModel[]>([])
  const [serialNumber, setSerialNumber] = useState('')
  const [vin, setVin] = useState('')
  const [status, setStatus] = useState<ProjectStatus>('a_venir')
  const [sharepointUrl, setSharepointUrl] = useState('')
  const [editingSharepoint, setEditingSharepoint] = useState(false)

  // Components
  const [allComponents, setAllComponents] = useState<Component[]>([])
  const [projectComponents, setProjectComponents] = useState<(ProjectComponent & { component?: Component })[]>([])
  const [selectedCompIds, setSelectedCompIds] = useState<string[]>([])
  const [selectedCompQty, setSelectedCompQty] = useState<Record<string, number>>({})
  const [showCompPicker, setShowCompPicker] = useState(false)
  const [compSaving, setCompSaving] = useState(false)
  const [pickerQuery, setPickerQuery] = useState('')

  const loadProject = async () => {
    if (!id) return

    const [projectRes, stagesRes, allStagesRes, compsRes, pcRes] = await Promise.all([
      supabase.from('projects').select('*').eq('id', id).single(),
      supabase.from('project_stages').select('*, stage:stages(*)').eq('project_id', id),
      supabase.from('stages').select('*').order('sort_order'),
      supabase.from('components').select('*').order('part_number'),
      supabase.from('project_components').select('*, component:components(*)').eq('project_id', id),
    ])

    if (projectRes.error || !projectRes.data) {
      setLoading(false)
      return
    }

    const p = projectRes.data
    setProject(p)
    setClientName(p.client_name)
    setProjectNumber(p.project_number)
    setDescription(p.description || '')
    setHiabModel(p.hiab_model || '')
    const { data: models } = await supabase.from('hiab_models').select('*').eq('is_active', true).order('name')
    if (models) setHiabModels(models)
    setSerialNumber(p.serial_number || '')
    setVin(p.vin || '')
    setStatus(p.status)
    setSharepointUrl(p.sharepoint_url || '')

    if (stagesRes.data) setProjectStages(stagesRes.data as any)
    if (allStagesRes.data) setAllStages(allStagesRes.data)
    if (compsRes.data) setAllComponents(compsRes.data)
    if (pcRes.data) {
      setProjectComponents(pcRes.data as any)
      setSelectedCompIds((pcRes.data as any[]).map((pc: any) => pc.component_id))
    }
    setLoading(false)
  }

  useEffect(() => { loadProject() }, [id])

  const handleSave = async () => {
    if (!project || !isAdmin) return
    setSaving(true)
    setMessage('')

    const { error } = await supabase.from('projects').update({
      client_name: clientName.trim(),
      project_number: projectNumber.trim(),
      description: description.trim() || null,
      hiab_model: hiabModel.trim() || null,
      serial_number: serialNumber.trim() || null,
      vin: vin.trim() || null,
      status,
      sharepoint_url: sharepointUrl.trim() || null,
    }).eq('id', project.id)

    if (error) {
      setMessage('Erreur: ' + error.message)
    } else {
      setMessage('Enregistré ✓')
      setEditingSharepoint(false)
      setTimeout(() => setMessage(''), 2500)
      loadProject()
    }
    setSaving(false)
  }

  const toggleStageCompleted = async (ps: ProjectStage & { stage: Stage }) => {
    if (!isAdmin) return
    const newValue = !ps.is_completed
    const today = new Date()
    const todayStr = today.toISOString().slice(0, 10)
    if (newValue) {
      if (!confirm(`Terminer « ${ps.stage?.name} » ? L’étape sera barrée et les suivantes du projet avanceront.`)) return
      const start = ps.start_date && ps.start_date < todayStr ? ps.start_date : todayStr
      await supabase
        .from('project_stages')
        .update({
          is_completed: true,
          is_pinned: true,
          end_date: todayStr,
          start_date: start,
        })
        .eq('id', ps.id)
      const later = projectStages.filter(
        (s) => s.stage && ps.stage && s.stage.sort_order > ps.stage.sort_order
      )
      for (const s of later) {
        await supabase.from('project_stages').update({ is_pinned: false }).eq('id', s.id)
      }
      setProjectStages((prev) =>
        prev.map((s) =>
          s.id === ps.id
            ? { ...s, is_completed: true, start_date: start, end_date: todayStr }
            : s.stage && ps.stage && s.stage.sort_order > ps.stage.sort_order
              ? { ...s, is_pinned: false }
              : s
        )
      )
      window.dispatchEvent(new CustomEvent('alca-reoptimize'))
    } else {
      if (!confirm(`Réouvrir « ${ps.stage?.name} » ?`)) return
      await supabase.from('project_stages').update({ is_completed: false, is_pinned: false }).eq('id', ps.id)
      setProjectStages((prev) => prev.map((s) => (s.id === ps.id ? { ...s, is_completed: false } : s)))
      window.dispatchEvent(new CustomEvent('alca-reoptimize'))
    }
  }

  const toggleStageRequired = async (stageId: string, currentlyRequired: boolean) => {
    if (!isAdmin || !project) return
    if (currentlyRequired) {
      const existing = projectStages.find((ps) => ps.stage_id === stageId)
      if (existing) {
        await supabase.from('project_stages').delete().eq('id', existing.id)
        setProjectStages((prev) => prev.filter((ps) => ps.stage_id !== stageId))
      }
    } else {
      const stage = allStages.find((s) => s.id === stageId)
      const { data, error } = await supabase.from('project_stages').insert({
        project_id: project.id,
        stage_id: stageId,
        is_required: true,
        is_completed: false,
        duration_days: stage?.default_duration_days || null,
      }).select('*, stage:stages(*)').single()
      if (!error && data) setProjectStages((prev) => [...prev, data as any])
    }
  }

  const saveProjectComponents = async () => {
    if (!project || !isAdmin) return
    setCompSaving(true)
    await supabase.from('project_components').delete().eq('project_id', project.id)
    if (selectedCompIds.length > 0) {
      await supabase.from('project_components').insert(
        selectedCompIds.map((cid) => {
          let q = Number(selectedCompQty[cid])
          if (!isFinite(q) || q <= 0) q = 1
          q = Math.round(q * 100) / 100
          return {
            project_id: project.id,
            component_id: cid,
            quantity: q,
          }
        })
      )
    }
    const { data } = await supabase
      .from('project_components')
      .select('*, component:components(*)')
      .eq('project_id', project.id)
    if (data) setProjectComponents(data as any)
    setShowCompPicker(false)
    setCompSaving(false)
    setMessage('Composants enregistrés ✓')
    setTimeout(() => setMessage(''), 2500)
  }

  const toggleCompSelect = (id: string) => {
    setSelectedCompIds((prev) => {
      if (prev.includes(id)) {
        setSelectedCompQty((q) => {
          const n = { ...q }
          delete n[id]
          return n
        })
        return prev.filter((x) => x !== id)
      }
      setSelectedCompQty((q) => ({ ...q, [id]: q[id] && q[id] > 0 ? q[id] : 1 }))
      return [...prev, id]
    })
  }

  const updateProjectCompQty = async (pcId: string, raw: number) => {
    if (!isAdmin) return
    let q = Number(raw)
    if (!isFinite(q) || q <= 0) q = 1
    q = Math.round(q * 100) / 100
    const { error } = await supabase.from('project_components').update({ quantity: q }).eq('id', pcId)
    if (!error) {
      setProjectComponents((prev) => prev.map((pc) => (pc.id === pcId ? { ...pc, quantity: q } : pc)))
    }
  }

  const handleClose = async () => {
    if (!project || !isAdmin) return
    if (
      !confirm(
        `Fermer le projet ${project.project_number} — ${project.client_name} ?\nIl ira dans Projets livrés et sortira du calendrier (réoptimisation au prochain chargement).`
      )
    )
      return
    const { error } = await supabase
      .from('projects')
      .update({ is_closed: true, closed_at: new Date().toISOString() })
      .eq('id', project.id)
    if (error) {
      setMessage(
        'Impossible de fermer le projet : ' +
          error.message +
          ' — Exécute sql-labor-and-closed.sql dans Supabase si la colonne is_closed manque.'
      )
      return
    }
    navigate('/')
  }

  const handleReopen = async () => {
    if (!project || !isAdmin) return
    if (!confirm('Réouvrir ce projet et le remettre au calendrier ?')) return
    const { error } = await supabase
      .from('projects')
      .update({ is_closed: false, closed_at: null })
      .eq('id', project.id)
    if (error) {
      setMessage('Impossible de réouvrir : ' + error.message)
      return
    }
    navigate('/')
  }

  const handleDelete = async () => {
    if (!project || !isAdmin) return
    if (!confirm(`Supprimer définitivement le projet ${project.project_number} — ${project.client_name} ?`)) return
    await supabase.from('projects').delete().eq('id', project.id)
    navigate('/')
  }

  if (loading) return <div className="text-center py-20 text-gray-500">Chargement...</div>

  if (!project) {
    return (
      <div className="text-center py-20">
        <p className="text-gray-500 mb-4">Projet introuvable</p>
        <Link to="/" className="text-yellow-600 font-medium underline">Retour au tableau de bord</Link>
      </div>
    )
  }

  const currentStatus = statusOptions.find((s) => s.value === status) || statusOptions[1]

  return (
    <div className="max-w-4xl mx-auto">
      <Link to="/" className="text-sm text-gray-500 hover:text-black mb-4 inline-flex items-center gap-1">
        ← Retour au tableau de bord
      </Link>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-black">{project.project_number} — {project.client_name}</h1>
          <div className="mt-2">
            {isAdmin ? (
              <select value={status} onChange={(e) => setStatus(e.target.value as ProjectStatus)}
                className={`text-sm px-3 py-1 rounded border ${currentStatus.color} font-medium`}>
                {statusOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            ) : (
              <span className={`text-sm px-3 py-1 rounded border ${currentStatus.color}`}>{currentStatus.label}</span>
            )}
          </div>
        </div>

        {isAdmin && (
          <div className="flex gap-2 items-center">
            {message && <span className="text-sm text-green-600">{message}</span>}
            <button onClick={handleSave} disabled={saving}
              className="bg-alca-yellow text-alca-black font-black px-5 py-2 rounded-lg hover:brightness-110 transition disabled:opacity-50">
              {saving ? 'Enregistrement...' : 'Enregistrer'}
            </button>
          </div>
        )}
      </div>

      <div className="space-y-6">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-lg font-black mb-4">Informations</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Client</label>
              {isAdmin ? (
                <input value={clientName} onChange={(e) => setClientName(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-alca-yellow" />
              ) : <p className="font-medium">{project.client_name}</p>}
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Numéro de projet</label>
              {isAdmin ? (
                <input value={projectNumber} onChange={(e) => setProjectNumber(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-alca-yellow" />
              ) : <p className="font-medium">{project.project_number}</p>}
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs text-gray-500 mb-1">Description</label>
              {isAdmin ? (
                <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-alca-yellow" />
              ) : <p>{project.description || '—'}</p>}
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Modèle Hiab</label>
              {isAdmin ? (
                <select
                  value={hiabModel}
                  onChange={(e) => setHiabModel(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-alca-yellow"
                >
                  <option value="">— Sélectionner —</option>
                  {hiabModels.map((m) => (
                    <option key={m.id} value={m.name}>{m.name}</option>
                  ))}
                  {hiabModel && !hiabModels.some((m) => m.name === hiabModel) && (
                    <option value={hiabModel}>{hiabModel} (hors catalogue)</option>
                  )}
                </select>
              ) : <p>{project.hiab_model || '—'}</p>}
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Numéro de série</label>
              {isAdmin ? (
                <input value={serialNumber} onChange={(e) => setSerialNumber(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-alca-yellow" />
              ) : <p>{project.serial_number || '—'}</p>}
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">VIN</label>
              {isAdmin ? (
                <input value={vin} onChange={(e) => setVin(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-alca-yellow" />
              ) : <p>{project.vin || '—'}</p>}
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Date de livraison estimée</label>
              <p className="text-gray-400 text-sm">{project.estimated_delivery_date || 'Sera calculée par le planificateur'}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-lg font-black mb-3">Documents (SharePoint)</h2>
          {isAdmin ? (
            editingSharepoint || !sharepointUrl ? (
              <div className="flex gap-2">
                <input
                  type="url"
                  value={sharepointUrl}
                  onChange={(e) => setSharepointUrl(e.target.value)}
                  placeholder="https://... (lien vers le dossier SharePoint du projet)"
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-alca-yellow"
                />
                {sharepointUrl && (
                  <button
                    type="button"
                    onClick={() => setEditingSharepoint(false)}
                    className="text-sm text-gray-500 hover:text-black px-2"
                  >
                    OK
                  </button>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <a
                  href={sharepointUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 bg-blue-50 text-blue-700 border border-blue-200 px-4 py-2 rounded-lg hover:bg-blue-100 transition text-sm font-medium"
                >
                  Ouvrir le dossier SharePoint →
                </a>
                <button
                  type="button"
                  onClick={() => setEditingSharepoint(true)}
                  className="text-gray-400 hover:text-black p-1.5 rounded hover:bg-gray-100"
                  title="Modifier le lien"
                >
                  ✎
                </button>
              </div>
            )
          ) : sharepointUrl ? (
            <a
              href={sharepointUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 bg-blue-50 text-blue-700 border border-blue-200 px-4 py-2 rounded-lg hover:bg-blue-100 transition text-sm font-medium"
            >
              Ouvrir le dossier SharePoint →
            </a>
          ) : (
            <p className="text-gray-400 text-sm">Aucun lien SharePoint</p>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-lg font-black mb-4">Étapes de production</h2>
          <div className="space-y-2">
            {allStages.map((stage) => {
              const ps = projectStages.find((p) => p.stage_id === stage.id)
              const isRequired = !!ps
              const isCompleted = ps?.is_completed || false
              return (
                <div key={stage.id} className={`flex items-center gap-3 p-3 rounded-lg border ${isRequired ? 'border-gray-200 bg-white' : 'border-dashed border-gray-200 bg-gray-50'}`}>
                  <div className="w-4 h-4 rounded-sm flex-shrink-0" style={{ backgroundColor: stage.color }} />
                  <span className={`flex-1 text-sm ${isCompleted ? 'line-through text-gray-400' : ''}`}>{stage.name}</span>
                  {isAdmin && (
                    <>
                      <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
                        <input type="checkbox" checked={isRequired} onChange={() => toggleStageRequired(stage.id, isRequired)} className="w-3.5 h-3.5" />
                        Requis
                      </label>
                      {isRequired && (
                        <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                          <input type="checkbox" checked={isCompleted} onChange={() => ps && toggleStageCompleted(ps)} className="w-3.5 h-3.5 accent-green-600" />
                          <span className={isCompleted ? 'text-green-600 font-medium' : 'text-gray-500'}>Terminé</span>
                        </label>
                      )}
                    </>
                  )}
                  {!isAdmin && isRequired && (
                    <span className={`text-xs ${isCompleted ? 'text-green-600' : 'text-gray-400'}`}>
                      {isCompleted ? '✓ Terminé' : 'En attente'}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-black">Composants</h2>
            {isAdmin && (
              <button
                onClick={() => {
                  setSelectedCompIds(projectComponents.map((pc) => pc.component_id))
                  const qty: Record<string, number> = {}
                  for (const pc of projectComponents) {
                    qty[pc.component_id] = Number(pc.quantity) || 1
                  }
                  setSelectedCompQty(qty)
                  setShowCompPicker(true)
                }}
                className="text-sm border px-3 py-1.5 rounded-lg hover:bg-gray-50"
              >
                {projectComponents.length > 0 ? 'Modifier' : '+ Ajouter'}
              </button>
            )}
          </div>

          {projectComponents.length === 0 ? (
            <p className="text-gray-400 text-sm">Aucun composant sélectionné pour ce projet.</p>
          ) : (
            <div className="space-y-1">
              {projectComponents.map((pc) => (
                <div key={pc.id} className="flex items-center justify-between gap-3 text-sm py-1.5 border-b border-gray-50 last:border-0">
                  <div className="min-w-0">
                    <span className="font-medium">{pc.component?.part_number}</span>
                    <span className="text-gray-500 ml-2">{pc.component?.description}</span>
                  </div>
                  {isAdmin ? (
                    <label className="flex items-center gap-1 shrink-0 text-xs text-gray-500">
                      Qté
                      <input
                        type="number"
                        min={0.01}
                        step={0.01}
                        defaultValue={pc.quantity}
                        key={`${pc.id}-${pc.quantity}`}
                        onBlur={(e) => updateProjectCompQty(pc.id, parseFloat(e.target.value))}
                        className="w-16 border rounded px-1.5 py-0.5 text-sm text-black"
                      />
                    </label>
                  ) : (
                    <span className="text-gray-400 text-xs">× {pc.quantity}</span>
                  )}
                </div>
              ))}
            </div>
          )}

          {showCompPicker && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col">
                <div className="p-4 border-b flex items-center justify-between">
                  <h3 className="font-black text-lg">Sélectionner les composants</h3>
                  <button onClick={() => setShowCompPicker(false)} className="text-2xl text-gray-400">×</button>
                </div>
                <div className="p-3 border-b">
                  <input
                    type="search"
                    value={pickerQuery}
                    onChange={(e) => setPickerQuery(e.target.value)}
                    placeholder="Rechercher un composant…"
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                <div className="overflow-y-auto p-4 space-y-3 flex-1">
                  {allComponents.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-6">
                      Aucun composant dans le catalogue.{' '}
                      <Link to="/composants" className="underline text-blue-600">Créer des composants</Link>
                    </p>
                  ) : (
                    (() => {
                      const q = pickerQuery.trim().toLowerCase()
                      const filtered = allComponents.filter((c) => {
                        if (!q) return true
                        return (
                          c.part_number.toLowerCase().includes(q) ||
                          (c.description || '').toLowerCase().includes(q)
                        )
                      })
                      const groups = [
                        ...STAGE_OPTIONS.map((s) => ({
                          key: s.slug,
                          label: s.label,
                          items: filtered.filter((c) => c.stage_slug === s.slug),
                        })),
                        {
                          key: 'autre',
                          label: 'Autre',
                          items: filtered.filter((c) => !c.stage_slug || !STAGE_OPTIONS.some((s) => s.slug === c.stage_slug)),
                        },
                      ].filter((g) => g.items.length > 0)
                      if (groups.length === 0) {
                        return <p className="text-sm text-gray-400 text-center py-6">Aucun résultat</p>
                      }
                      const row = (c: Component) => (
                        <label
                          key={c.id}
                          className="flex items-center gap-3 p-2 rounded-lg border border-gray-100 hover:bg-gray-50 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={selectedCompIds.includes(c.id)}
                            onChange={() => toggleCompSelect(c.id)}
                            className="w-4 h-4 accent-alca-yellow"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium">{c.part_number}</div>
                            <div className="text-xs text-gray-500 truncate">{c.description}</div>
                          </div>
                          {selectedCompIds.includes(c.id) && (
                            <input
                              type="number"
                              min={0.01}
                              step={0.01}
                              value={selectedCompQty[c.id] ?? 1}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => {
                                const v = parseFloat(e.target.value)
                                setSelectedCompQty((qty) => ({ ...qty, [c.id]: isNaN(v) ? 0 : v }))
                              }}
                              className="w-16 border rounded px-1.5 py-1 text-sm"
                              title="Quantité"
                            />
                          )}
                        </label>
                      )
                      return groups.map((g) => (
                        <div key={g.key} className="space-y-1">
                          <div className="text-[11px] uppercase tracking-wide text-gray-400 font-medium px-1 pt-1">
                            {g.label}
                          </div>
                          {g.items.map(row)}
                        </div>
                      ))
                    })()
                  )}
                </div>
                <div className="p-4 border-t flex gap-2">
                  <button onClick={() => setShowCompPicker(false)} className="flex-1 border py-2 rounded-lg text-sm">Annuler</button>
                  <button
                    onClick={saveProjectComponents}
                    disabled={compSaving}
                    className="flex-1 bg-alca-yellow font-black py-2 rounded-lg text-sm disabled:opacity-50"
                  >
                    {compSaving ? '...' : 'Enregistrer'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {isAdmin && (
          <div className="pt-4 border-t flex flex-wrap gap-4">
            {project.is_closed ? (
              <button onClick={handleReopen} className="text-sm hover:underline">
                Réouvrir le projet
              </button>
            ) : (
              <button onClick={handleClose} className="text-sm hover:underline">
                Fermer le projet
              </button>
            )}
            <button onClick={handleDelete} className="text-red-600 text-sm hover:underline">
              Supprimer ce projet
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
