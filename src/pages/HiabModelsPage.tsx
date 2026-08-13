import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { HiabModel } from '../types/database'

interface HiabModelsPageProps {
  isAdmin: boolean
}

export default function HiabModelsPage({ isAdmin }: HiabModelsPageProps) {
  const [models, setModels] = useState<HiabModel[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  // Create / edit form
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [isActive, setIsActive] = useState(true)

  const load = async () => {
    const { data, error: err } = await supabase
      .from('hiab_models')
      .select('*')
      .order('name')
    if (err) setError(err.message)
    if (data) setModels(data)
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const resetForm = () => {
    setShowForm(false)
    setEditingId(null)
    setName('')
    setIsActive(true)
    setError('')
  }

  const openCreate = () => {
    resetForm()
    setShowForm(true)
  }

  const openEdit = (m: HiabModel) => {
    setEditingId(m.id)
    setName(m.name)
    setIsActive(m.is_active)
    setShowForm(true)
    setError('')
  }

  const save = async () => {
    if (!name.trim()) {
      setError('Le nom du modèle est obligatoire')
      return
    }
    setSaving(true)
    setError('')

    if (editingId) {
      const { error: err } = await supabase
        .from('hiab_models')
        .update({ name: name.trim(), is_active: isActive })
        .eq('id', editingId)
      if (err) {
        setError(err.message.includes('duplicate') ? 'Ce nom de modèle existe déjà' : err.message)
        setSaving(false)
        return
      }
    } else {
      const { error: err } = await supabase.from('hiab_models').insert({
        name: name.trim(),
        is_active: isActive,
      })
      if (err) {
        setError(err.message.includes('duplicate') ? 'Ce nom de modèle existe déjà' : err.message)
        setSaving(false)
        return
      }
    }

    resetForm()
    setSaving(false)
    load()
  }

  const toggleActive = async (m: HiabModel) => {
    await supabase.from('hiab_models').update({ is_active: !m.is_active }).eq('id', m.id)
    load()
  }

  const remove = async (m: HiabModel) => {
    if (!confirm(`Supprimer le modèle « ${m.name} » ?\n\nLes projets qui l'utilisent garderont le nom en texte libre.`)) return
    await supabase.from('hiab_models').delete().eq('id', m.id)
    load()
  }

  if (!isAdmin) {
    return (
      <div className="text-center py-20">
        <p className="text-gray-500 mb-4">Accès réservé aux administrateurs</p>
        <Link to="/" className="text-sm underline">Retour</Link>
      </div>
    )
  }

  if (loading) {
    return <div className="text-center py-20 text-gray-500">Chargement...</div>
  }

  const active = models.filter((m) => m.is_active)
  const inactive = models.filter((m) => !m.is_active)

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <Link to="/" className="text-sm text-gray-500 hover:text-black">← Tableau de bord</Link>
        <h1 className="text-3xl font-black mt-1">Modèles Hiab</h1>
        <p className="text-gray-500 text-sm mt-1">
          Catalogue des modèles de grue (Loader Cranes HIAB). Utilisé dans les fiches projet.
        </p>
      </div>

      {error && (
        <div className="text-red-600 text-sm bg-red-50 p-3 rounded-lg">{error}</div>
      )}

      {!showForm && (
        <button
          onClick={openCreate}
          className="bg-alca-yellow text-alca-black font-black px-4 py-2 rounded-lg text-sm hover:brightness-110"
        >
          + Ajouter un modèle
        </button>
      )}

      {showForm && (
        <div className="bg-white border rounded-xl p-4 space-y-3">
          <h3 className="font-black text-sm">
            {editingId ? 'Modifier le modèle' : 'Nouveau modèle'}
          </h3>
          <div>
            <label className="text-xs text-gray-500">Nom du modèle</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ex. HIAB X-HiPro 302"
              className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-alca-yellow focus:outline-none"
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
            />
            Actif (visible dans les listes déroulantes)
          </label>
          <div className="flex gap-2">
            <button onClick={resetForm} className="border px-4 py-2 rounded-lg text-sm">Annuler</button>
            <button
              onClick={save}
              disabled={saving}
              className="bg-alca-yellow font-black px-4 py-2 rounded-lg text-sm disabled:opacity-50"
            >
              {saving ? '...' : 'Enregistrer'}
            </button>
          </div>
        </div>
      )}

      <div className="bg-white border rounded-xl divide-y">
        <div className="px-4 py-2 text-xs text-gray-500 bg-gray-50 rounded-t-xl">
          Actifs ({active.length})
        </div>
        {active.length === 0 ? (
          <p className="p-6 text-center text-gray-400 text-sm">Aucun modèle actif</p>
        ) : (
          active.map((m) => (
            <div key={m.id} className="flex items-center justify-between px-4 py-2.5 gap-3">
              <button type="button" onClick={() => openEdit(m)} className="text-left flex-1 min-w-0 hover:opacity-80">
                <span className="font-medium text-sm">{m.name}</span>
              </button>
              <div className="flex gap-3 flex-shrink-0 text-xs">
                <button onClick={() => openEdit(m)} className="text-gray-500 hover:text-black">Modifier</button>
                <button onClick={() => toggleActive(m)} className="text-gray-500 hover:text-black">Désactiver</button>
                <button onClick={() => remove(m)} className="text-red-500 hover:underline">Supprimer</button>
              </div>
            </div>
          ))
        )}
      </div>

      {inactive.length > 0 && (
        <div className="bg-white border rounded-xl divide-y opacity-70">
          <div className="px-4 py-2 text-xs text-gray-500 bg-gray-50 rounded-t-xl">
            Inactifs ({inactive.length})
          </div>
          {inactive.map((m) => (
            <div key={m.id} className="flex items-center justify-between px-4 py-2.5 gap-3">
              <span className="font-medium text-sm text-gray-500 line-through">{m.name}</span>
              <div className="flex gap-3 flex-shrink-0 text-xs">
                <button onClick={() => openEdit(m)} className="text-gray-500 hover:text-black">Modifier</button>
                <button onClick={() => toggleActive(m)} className="text-gray-500 hover:text-black">Réactiver</button>
                <button onClick={() => remove(m)} className="text-red-500 hover:underline">Supprimer</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
