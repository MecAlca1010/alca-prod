import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { Technician, TechnicianTimeOff } from '../types/database'

interface Props {
  isAdmin: boolean
  onChanged?: () => void
}

export default function TechniciansPage({ isAdmin }: Props) {
  const [techs, setTechs] = useState<Technician[]>([])
  const [offs, setOffs] = useState<TechnicianTimeOff[]>([])
  const [first, setFirst] = useState('')
  const [last, setLast] = useState('')
  const [hours, setHours] = useState('40')
  const [offTech, setOffTech] = useState('')
  const [offStart, setOffStart] = useState('')
  const [offEnd, setOffEnd] = useState('')
  const [offReason, setOffReason] = useState('Vacances')
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  const load = async () => {
    const [t, o] = await Promise.all([
      supabase.from('technicians').select('*').eq('is_active', true).order('last_name'),
      supabase.from('technician_time_off').select('*').order('start_date'),
    ])
    if (t.data) setTechs(t.data as Technician[])
    if (o.data) setOffs(o.data as TechnicianTimeOff[])
  }
  useEffect(() => {
    load()
  }, [])

  const total = techs.reduce((s, t) => s + Number(t.hours_per_week || 0), 0)

  if (!isAdmin) {
    return (
      <div className="text-center py-20 text-gray-500">
        Accès admin.{' '}
        <Link to="/" className="underline">
          Retour
        </Link>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <Link to="/" className="text-sm text-gray-500 hover:text-black">
          ← Tableau de bord
        </Link>
        <h1 className="text-3xl font-black mt-1">Techniciens</h1>
        <p className="text-sm text-gray-500 mt-1">
          Capacité semaine (actifs) : <strong>{total} h</strong>
        </p>
      </div>
      {msg && <div className="text-sm bg-green-50 text-green-800 p-3 rounded-lg">{msg}</div>}
      {err && <div className="text-sm bg-red-50 text-red-700 p-3 rounded-lg">{err}</div>}

      <section className="bg-white border rounded-xl p-4 space-y-3">
        <h2 className="font-black">Ajouter</h2>
        <div className="grid grid-cols-3 gap-2">
          <input placeholder="Prénom" value={first} onChange={(e) => setFirst(e.target.value)} className="border rounded-lg px-3 py-2 text-sm" />
          <input placeholder="Nom" value={last} onChange={(e) => setLast(e.target.value)} className="border rounded-lg px-3 py-2 text-sm" />
          <input type="number" placeholder="H/sem" value={hours} onChange={(e) => setHours(e.target.value)} className="border rounded-lg px-3 py-2 text-sm" />
        </div>
        <button
          className="bg-alca-yellow font-black px-4 py-2 rounded-lg text-sm"
          onClick={async () => {
            setErr('')
            if (!first.trim() || !last.trim()) {
              setErr('Prénom et nom requis')
              return
            }
            const { error } = await supabase.from('technicians').insert({
              first_name: first.trim(),
              last_name: last.trim(),
              hours_per_week: parseFloat(hours) || 40,
            })
            if (error) setErr(error.message)
            else {
              setFirst(''); setLast(''); setHours('40'); setMsg('Technicien ajouté — réoptimisez le calendrier si besoin')
              load()
            }
          }}
        >
          Ajouter
        </button>
      </section>

      <section className="bg-white border rounded-xl divide-y">
        {techs.map((t) => (
          <div key={t.id} className="p-3 flex items-center justify-between gap-2">
            <div>
              <div className="font-medium text-sm">
                {t.first_name} {t.last_name}
              </div>
              <div className="text-xs text-gray-500">{t.hours_per_week} h / sem.</div>
            </div>
            <button
              className="text-red-500 text-xs"
              onClick={async () => {
                if (!confirm(`Retirer ${t.first_name} ${t.last_name} ?`)) return
                await supabase.from('technicians').update({ is_active: false }).eq('id', t.id)
                setMsg('Technicien retiré — réoptimisez le calendrier')
                load()
              }}
            >
              Retirer
            </button>
          </div>
        ))}
        {techs.length === 0 && <p className="p-4 text-sm text-gray-400">Aucun technicien</p>}
      </section>

      <section className="bg-white border rounded-xl p-4 space-y-3">
        <h2 className="font-black">Vacances</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <select value={offTech} onChange={(e) => setOffTech(e.target.value)} className="border rounded-lg px-2 py-2 text-sm">
            <option value="">Technicien…</option>
            {techs.map((t) => (
              <option key={t.id} value={t.id}>
                {t.first_name} {t.last_name}
              </option>
            ))}
          </select>
          <input value={offReason} onChange={(e) => setOffReason(e.target.value)} className="border rounded-lg px-2 py-2 text-sm" />
          <input type="date" value={offStart} onChange={(e) => setOffStart(e.target.value)} className="border rounded-lg px-2 py-2 text-sm" />
          <input type="date" value={offEnd} onChange={(e) => setOffEnd(e.target.value)} className="border rounded-lg px-2 py-2 text-sm" />
        </div>
        <button
          className="bg-alca-yellow font-black px-4 py-2 rounded-lg text-sm"
          onClick={async () => {
            setErr('')
            if (!offTech || !offStart || !offEnd) {
              setErr('Technicien et dates requis')
              return
            }
            const { error } = await supabase.from('technician_time_off').insert({
              technician_id: offTech,
              start_date: offStart,
              end_date: offEnd,
              reason: offReason.trim() || 'Vacances',
            })
            if (error) setErr(error.message)
            else {
              setOffStart(''); setOffEnd(''); setMsg('Vacances enregistrées — réoptimisez le calendrier')
              load()
            }
          }}
        >
          Bloquer ces dates
        </button>
        <div className="divide-y border rounded-lg">
          {offs.map((o) => {
            const t = techs.find((x) => x.id === o.technician_id)
            return (
              <div key={o.id} className="px-3 py-2 text-sm flex justify-between gap-2">
                <span>
                  {t ? `${t.first_name} ${t.last_name}` : o.technician_id} — {o.start_date} → {o.end_date}
                  {o.reason ? ` (${o.reason})` : ''}
                </span>
                <button
                  className="text-red-500 text-xs"
                  onClick={async () => {
                    await supabase.from('technician_time_off').delete().eq('id', o.id)
                    load()
                  }}
                >
                  Supprimer
                </button>
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}
