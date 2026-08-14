import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

interface Resource {
  id: string
  name: string
  capacity: number
  notes: string | null
}

interface ResourceBlock {
  id: string
  resource_id: string
  start_date: string
  end_date: string
  reason: string | null
}

interface RulesPageProps {
  isAdmin: boolean
}

export default function RulesPage({ isAdmin }: RulesPageProps) {
  const [resources, setResources] = useState<Resource[]>([])
  const [blocks, setBlocks] = useState<ResourceBlock[]>([])
  const [overlap, setOverlap] = useState('1')
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  // New block form
  const [blockStart, setBlockStart] = useState('')
  const [blockEnd, setBlockEnd] = useState('')
  const [blockReason, setBlockReason] = useState('Réparations grues')

  const load = async () => {
    const [r, b, s] = await Promise.all([
      supabase.from('resources').select('*').order('name'),
      supabase.from('resource_blocks').select('*').order('start_date'),
      supabase.from('scheduling_settings').select('*').eq('key', 'grue_habillage_max_overlap_days').maybeSingle(),
    ])
    if (r.data) setResources(r.data)
    if (b.data) setBlocks(b.data)
    if (s.data?.value) setOverlap(s.data.value)
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const saveCapacity = async (id: string, capacity: number) => {
    setError('')
    const { error: err } = await supabase.from('resources').update({ capacity }).eq('id', id)
    if (err) setError(err.message)
    else {
      setMessage('Capacité enregistrée')
      load()
    }
  }

  const saveOverlap = async () => {
    setError('')
    const { error: err } = await supabase.from('scheduling_settings').upsert({
      key: 'grue_habillage_max_overlap_days',
      value: String(Math.max(0, parseInt(overlap) || 0)),
      description: 'Chevauchement max (jours ouvrables) Grue / Habillage même projet',
    })
    if (err) setError(err.message)
    else setMessage('Chevauchement Grue/Habillage enregistré')
  }

  const addBlock = async () => {
    if (!blockStart || !blockEnd) {
      setError('Dates de début et fin obligatoires')
      return
    }
    if (blockEnd < blockStart) {
      setError('La fin doit être après le début')
      return
    }
    setError('')
    const { error: err } = await supabase.from('resource_blocks').insert({
      resource_id: 'porte_8',
      start_date: blockStart,
      end_date: blockEnd,
      reason: blockReason.trim() || null,
    })
    if (err) setError(err.message)
    else {
      setBlockStart('')
      setBlockEnd('')
      setMessage('Blocage Porte 8 ajouté — réoptimisez le calendrier sur le tableau de bord')
      load()
    }
  }

  const deleteBlock = async (id: string) => {
    if (!confirm('Supprimer ce blocage ?')) return
    await supabase.from('resource_blocks').delete().eq('id', id)
    load()
  }

  if (!isAdmin) {
    return (
      <div className="text-center py-20 text-gray-500">
        Accès réservé aux administrateurs.{' '}
        <Link to="/" className="underline">
          Retour
        </Link>
      </div>
    )
  }

  if (loading) return <div className="text-center py-20 text-gray-500">Chargement…</div>

  const porte8Blocks = blocks.filter((b) => b.resource_id === 'porte_8')

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <div>
        <Link to="/" className="text-sm text-gray-500 hover:text-black">
          ← Tableau de bord
        </Link>
        <h1 className="text-3xl font-black mt-1">Règles de planification</h1>
        <p className="text-gray-500 text-sm mt-1">
          Capacités des portes, blocages Porte 8, paramètres métier.
        </p>
      </div>

      {message && <div className="text-sm bg-green-50 text-green-800 p-3 rounded-lg">{message}</div>}
      {error && <div className="text-sm bg-red-50 text-red-700 p-3 rounded-lg">{error}</div>}

      {/* Fixed rules summary */}
      <section className="bg-white border rounded-xl p-4 space-y-2 text-sm">
        <h2 className="font-black text-base">Règles fixes (métier)</h2>
        <ul className="list-disc pl-5 space-y-1 text-gray-700">
          <li>Jours ouvrables uniquement (lun–ven)</li>
          <li>Acier → Peinture (pas de chevauchement) → Grue après sortie peinture</li>
          <li>Aluminium (Jig) peut avancer en parallèle ; Habillage après Alu terminé</li>
          <li>Grue + Habillage : chevauchement max configurable (même porte = 1 slot)</li>
          <li>PDI puis Tests après le gros œuvre ; hors porte (pas de limite inter-projets)</li>
          <li>Priorité projet en cas de conflit de ressource</li>
          <li>Projets alu seuls peuvent remplir les trous du Jig</li>
        </ul>
      </section>

      {/* Capacities */}
      <section className="bg-white border rounded-xl p-4 space-y-3">
        <h2 className="font-black text-base">Capacités</h2>
        {resources.map((r) => (
          <div key={r.id} className="flex flex-wrap items-center gap-3 border-b border-gray-100 pb-3 last:border-0">
            <div className="flex-1 min-w-[200px]">
              <div className="font-medium text-sm">{r.name}</div>
              <div className="text-xs text-gray-500">{r.notes}</div>
            </div>
            <label className="text-xs text-gray-500">
              Capacité
              <input
                type="number"
                min={1}
                max={99}
                defaultValue={r.capacity}
                onBlur={(e) => {
                  const v = Math.max(1, parseInt(e.target.value) || 1)
                  if (v !== r.capacity) saveCapacity(r.id, v)
                }}
                className="ml-2 w-16 border rounded px-2 py-1 text-sm"
              />
            </label>
          </div>
        ))}
      </section>

      {/* Overlap */}
      <section className="bg-white border rounded-xl p-4 space-y-3">
        <h2 className="font-black text-base">Chevauchement Grue / Habillage</h2>
        <p className="text-xs text-gray-500">
          Nombre max de jours ouvrables où Grue et Habillage du même projet peuvent se chevaucher (même porte).
        </p>
        <div className="flex gap-2 items-center">
          <input
            type="number"
            min={0}
            max={10}
            value={overlap}
            onChange={(e) => setOverlap(e.target.value)}
            className="w-20 border rounded-lg px-3 py-2 text-sm"
          />
          <button onClick={saveOverlap} className="bg-alca-yellow font-black px-4 py-2 rounded-lg text-sm">
            Enregistrer
          </button>
        </div>
      </section>

      {/* Porte 8 blocks */}
      <section className="bg-white border rounded-xl p-4 space-y-3">
        <h2 className="font-black text-base">Bloquer la Porte 8</h2>
        <p className="text-xs text-gray-500">
          Ex. département réparations de grue. Aucune peinture ne sera planifiée sur ces dates.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <label className="text-xs">
            Début
            <input
              type="date"
              value={blockStart}
              onChange={(e) => setBlockStart(e.target.value)}
              className="block w-full border rounded-lg px-2 py-1.5 mt-0.5 text-sm"
            />
          </label>
          <label className="text-xs">
            Fin
            <input
              type="date"
              value={blockEnd}
              onChange={(e) => setBlockEnd(e.target.value)}
              className="block w-full border rounded-lg px-2 py-1.5 mt-0.5 text-sm"
            />
          </label>
          <label className="text-xs">
            Raison
            <input
              value={blockReason}
              onChange={(e) => setBlockReason(e.target.value)}
              className="block w-full border rounded-lg px-2 py-1.5 mt-0.5 text-sm"
            />
          </label>
        </div>
        <button onClick={addBlock} className="bg-alca-yellow font-black px-4 py-2 rounded-lg text-sm">
          Ajouter un blocage
        </button>

        <div className="divide-y border rounded-lg mt-2">
          {porte8Blocks.length === 0 ? (
            <p className="p-3 text-sm text-gray-400">Aucun blocage</p>
          ) : (
            porte8Blocks.map((b) => (
              <div key={b.id} className="flex items-center justify-between px-3 py-2 text-sm gap-2">
                <div>
                  <span className="font-medium">
                    {b.start_date} → {b.end_date}
                  </span>
                  {b.reason && <span className="text-gray-500 ml-2">{b.reason}</span>}
                </div>
                <button onClick={() => deleteBlock(b.id)} className="text-red-500 text-xs hover:underline">
                  Supprimer
                </button>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  )
}
