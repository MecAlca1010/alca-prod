import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { Component, SubComponent, ComponentItem } from '../types/database'

interface ComponentsPageProps {
  isAdmin: boolean
}

export default function ComponentsPage({ isAdmin }: ComponentsPageProps) {
  const [components, setComponents] = useState<Component[]>([])
  const [subComponents, setSubComponents] = useState<SubComponent[]>([])
  const [componentItems, setComponentItems] = useState<(ComponentItem & { sub_component?: SubComponent })[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'components' | 'subs'>('components')

  // Sub form (create or edit)
  const [showSubForm, setShowSubForm] = useState(false)
  const [editingSubId, setEditingSubId] = useState<string | null>(null)
  const [subPart, setSubPart] = useState('')
  const [subDesc, setSubDesc] = useState('')

  // Component form (create or edit)
  const [showCompForm, setShowCompForm] = useState(false)
  const [editingCompId, setEditingCompId] = useState<string | null>(null)
  const [compPart, setCompPart] = useState('')
  const [compDesc, setCompDesc] = useState('')
  const [compSubs, setCompSubs] = useState<{ subId: string; qty: number }[]>([])

  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const load = async () => {
    const [c, s, ci] = await Promise.all([
      supabase.from('components').select('*').order('part_number'),
      supabase.from('sub_components').select('*').order('part_number'),
      supabase.from('component_items').select('*, sub_component:sub_components(*)'),
    ])
    if (c.data) setComponents(c.data)
    if (s.data) setSubComponents(s.data)
    if (ci.data) setComponentItems(ci.data as any)
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const resetSubForm = () => {
    setShowSubForm(false)
    setEditingSubId(null)
    setSubPart('')
    setSubDesc('')
    setError('')
  }

  const resetCompForm = () => {
    setShowCompForm(false)
    setEditingCompId(null)
    setCompPart('')
    setCompDesc('')
    setCompSubs([])
    setError('')
  }

  const openEditSub = (s: SubComponent) => {
    setEditingSubId(s.id)
    setSubPart(s.part_number)
    setSubDesc(s.description)
    setShowSubForm(true)
    setError('')
  }

  const openEditComp = (c: Component) => {
    setEditingCompId(c.id)
    setCompPart(c.part_number)
    setCompDesc(c.description)
    const items = componentItems.filter((ci) => ci.component_id === c.id)
    setCompSubs(
      items.map((ci) => ({
        subId: ci.sub_component_id,
        qty: ci.quantity,
      }))
    )
    setShowCompForm(true)
    setError('')
  }

  const saveSub = async () => {
    if (!subPart.trim() || !subDesc.trim()) {
      setError('Numéro de pièce et description obligatoires')
      return
    }
    setSaving(true)
    setError('')

    if (editingSubId) {
      const { error: err } = await supabase
        .from('sub_components')
        .update({ part_number: subPart.trim(), description: subDesc.trim() })
        .eq('id', editingSubId)
      if (err) {
        setError(err.message.includes('duplicate') ? 'Ce numéro de pièce existe déjà' : err.message)
        setSaving(false)
        return
      }
    } else {
      const { error: err } = await supabase.from('sub_components').insert({
        part_number: subPart.trim(),
        description: subDesc.trim(),
      })
      if (err) {
        setError(err.message.includes('duplicate') ? 'Ce numéro de pièce existe déjà' : err.message)
        setSaving(false)
        return
      }
    }

    resetSubForm()
    setSaving(false)
    load()
  }

  const saveComp = async () => {
    if (!compPart.trim() || !compDesc.trim()) {
      setError('Numéro de pièce et description obligatoires')
      return
    }
    setSaving(true)
    setError('')

    let compId = editingCompId

    if (editingCompId) {
      const { error: err } = await supabase
        .from('components')
        .update({ part_number: compPart.trim(), description: compDesc.trim() })
        .eq('id', editingCompId)
      if (err) {
        setError(err.message.includes('duplicate') ? 'Ce numéro de pièce existe déjà' : err.message)
        setSaving(false)
        return
      }
      // Replace component_items
      await supabase.from('component_items').delete().eq('component_id', editingCompId)
    } else {
      const { data, error: err } = await supabase
        .from('components')
        .insert({ part_number: compPart.trim(), description: compDesc.trim() })
        .select()
        .single()
      if (err || !data) {
        setError(err?.message.includes('duplicate') ? 'Ce numéro de pièce existe déjà' : err?.message || 'Erreur')
        setSaving(false)
        return
      }
      compId = data.id
    }

    const rows = compSubs.filter((x) => x.subId && x.qty > 0)
    if (rows.length > 0 && compId) {
      await supabase.from('component_items').insert(
        rows.map((x) => ({
          component_id: compId!,
          sub_component_id: x.subId,
          quantity: x.qty,
        }))
      )
    }

    resetCompForm()
    setSaving(false)
    load()
  }

  const deleteSub = async (id: string) => {
    if (!confirm('Supprimer ce sous-composant ?')) return
    await supabase.from('sub_components').delete().eq('id', id)
    load()
  }

  const deleteComp = async (id: string) => {
    if (!confirm('Supprimer ce composant ?')) return
    await supabase.from('components').delete().eq('id', id)
    load()
  }

  const itemsFor = (compId: string) =>
    componentItems.filter((ci) => ci.component_id === compId)

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

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <Link to="/" className="text-sm text-gray-500 hover:text-black">← Tableau de bord</Link>
        <h1 className="text-3xl font-black mt-1">Composants</h1>
        <p className="text-gray-500 text-sm mt-1">Catalogue composants et sous-composants</p>
      </div>

      <div className="flex gap-2 border-b border-gray-200">
        <button
          onClick={() => setTab('components')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
            tab === 'components' ? 'border-alca-yellow text-black' : 'border-transparent text-gray-500'
          }`}
        >
          Composants ({components.length})
        </button>
        <button
          onClick={() => setTab('subs')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
            tab === 'subs' ? 'border-alca-yellow text-black' : 'border-transparent text-gray-500'
          }`}
        >
          Sous-composants ({subComponents.length})
        </button>
      </div>

      {error && (
        <div className="text-red-600 text-sm bg-red-50 p-3 rounded-lg">{error}</div>
      )}

      {/* SUB-COMPONENTS */}
      {tab === 'subs' && (
        <div className="space-y-4">
          {!showSubForm && (
            <button
              onClick={() => { resetSubForm(); setShowSubForm(true) }}
              className="bg-alca-yellow text-alca-black font-black px-4 py-2 rounded-lg text-sm hover:brightness-110"
            >
              + Créer un sous-composant
            </button>
          )}

          {showSubForm && (
            <div className="bg-white border rounded-xl p-4 space-y-3">
              <h3 className="font-black text-sm">
                {editingSubId ? 'Modifier le sous-composant' : 'Nouveau sous-composant'}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500">Numéro de pièce</label>
                  <input value={subPart} onChange={(e) => setSubPart(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-alca-yellow focus:outline-none" />
                </div>
                <div>
                  <label className="text-xs text-gray-500">Description</label>
                  <input value={subDesc} onChange={(e) => setSubDesc(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-alca-yellow focus:outline-none" />
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={resetSubForm} className="border px-4 py-2 rounded-lg text-sm">Annuler</button>
                <button onClick={saveSub} disabled={saving}
                  className="bg-alca-yellow font-black px-4 py-2 rounded-lg text-sm disabled:opacity-50">
                  {saving ? '...' : 'Enregistrer'}
                </button>
              </div>
            </div>
          )}

          <div className="bg-white border rounded-xl divide-y">
            {subComponents.length === 0 ? (
              <p className="p-6 text-center text-gray-400 text-sm">Aucun sous-composant</p>
            ) : (
              subComponents.map((s) => (
                <div key={s.id} className="flex items-center justify-between px-4 py-3 gap-3">
                  <button type="button" onClick={() => openEditSub(s)} className="min-w-0 text-left flex-1 hover:opacity-80">
                    <div className="font-medium text-sm">{s.part_number}</div>
                    <div className="text-xs text-gray-500 truncate">{s.description}</div>
                  </button>
                  <div className="flex gap-3 flex-shrink-0">
                    <button onClick={() => openEditSub(s)} className="text-xs text-gray-500 hover:text-black">Modifier</button>
                    <button onClick={() => deleteSub(s.id)} className="text-red-500 text-xs hover:underline">Supprimer</button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* COMPONENTS */}
      {tab === 'components' && (
        <div className="space-y-4">
          {!showCompForm && (
            <button
              onClick={() => { resetCompForm(); setShowCompForm(true) }}
              className="bg-alca-yellow text-alca-black font-black px-4 py-2 rounded-lg text-sm hover:brightness-110"
            >
              + Créer un composant
            </button>
          )}

          {showCompForm && (
            <div className="bg-white border rounded-xl p-4 space-y-3">
              <h3 className="font-black text-sm">
                {editingCompId ? 'Modifier le composant' : 'Nouveau composant'}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500">Numéro de pièce</label>
                  <input value={compPart} onChange={(e) => setCompPart(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-alca-yellow focus:outline-none" />
                </div>
                <div>
                  <label className="text-xs text-gray-500">Description</label>
                  <input value={compDesc} onChange={(e) => setCompDesc(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-alca-yellow focus:outline-none" />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs text-gray-500">Sous-composants inclus</label>
                  <button
                    type="button"
                    onClick={() => setCompSubs((p) => [...p, { subId: '', qty: 1 }])}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    + Ajouter une ligne
                  </button>
                </div>
                {compSubs.map((row, idx) => (
                  <div key={idx} className="flex gap-2 mb-2">
                    <select
                      value={row.subId}
                      onChange={(e) => {
                        const next = [...compSubs]
                        next[idx] = { ...next[idx], subId: e.target.value }
                        setCompSubs(next)
                      }}
                      className="flex-1 border rounded-lg px-2 py-1.5 text-sm"
                    >
                      <option value="">— Choisir —</option>
                      {subComponents.map((s) => (
                        <option key={s.id} value={s.id}>{s.part_number} — {s.description}</option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min={1}
                      value={row.qty}
                      onChange={(e) => {
                        const next = [...compSubs]
                        next[idx] = { ...next[idx], qty: Math.max(1, parseInt(e.target.value) || 1) }
                        setCompSubs(next)
                      }}
                      className="w-20 border rounded-lg px-2 py-1.5 text-sm text-center"
                    />
                    <button
                      type="button"
                      onClick={() => setCompSubs((p) => p.filter((_, i) => i !== idx))}
                      className="text-red-500 text-sm px-1"
                    >
                      ×
                    </button>
                  </div>
                ))}
                {subComponents.length === 0 && (
                  <p className="text-xs text-gray-400">Crée d’abord des sous-composants dans l’autre onglet.</p>
                )}
              </div>

              <div className="flex gap-2">
                <button onClick={resetCompForm} className="border px-4 py-2 rounded-lg text-sm">Annuler</button>
                <button onClick={saveComp} disabled={saving}
                  className="bg-alca-yellow font-black px-4 py-2 rounded-lg text-sm disabled:opacity-50">
                  {saving ? '...' : 'Enregistrer'}
                </button>
              </div>
            </div>
          )}

          <div className="bg-white border rounded-xl divide-y">
            {components.length === 0 ? (
              <p className="p-6 text-center text-gray-400 text-sm">Aucun composant</p>
            ) : (
              components.map((c) => {
                const items = itemsFor(c.id)
                const open = expandedId === c.id
                return (
                  <div key={c.id}>
                    <div className="flex items-center justify-between px-4 py-3 gap-3">
                      <button
                        type="button"
                        onClick={() => setExpandedId(open ? null : c.id)}
                        className="min-w-0 text-left flex-1"
                      >
                        <div className="font-medium text-sm">{c.part_number}</div>
                        <div className="text-xs text-gray-500 truncate">{c.description}</div>
                        <div className="text-[11px] text-gray-400 mt-0.5">
                          {items.length} sous-composant{items.length !== 1 ? 's' : ''}
                        </div>
                      </button>
                      <div className="flex gap-3 flex-shrink-0">
                        <button onClick={() => openEditComp(c)} className="text-xs text-gray-500 hover:text-black">Modifier</button>
                        <button onClick={() => deleteComp(c.id)} className="text-red-500 text-xs hover:underline">Supprimer</button>
                      </div>
                    </div>
                    {open && items.length > 0 && (
                      <div className="bg-gray-50 px-4 py-2 border-t border-gray-100">
                        {items.map((ci) => (
                          <div key={ci.id} className="flex justify-between text-xs py-1 text-gray-600">
                            <span>
                              {ci.sub_component?.part_number} — {ci.sub_component?.description}
                            </span>
                            <span className="font-medium">× {ci.quantity}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
