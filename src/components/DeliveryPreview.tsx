import type { Project } from '../types/database'

function monthKey(d: string) {
  return d.slice(0, 7)
}

function monthLabel(ym: string) {
  const [y, m] = ym.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('fr-CA', { month: 'long', year: 'numeric' })
}

export default function DeliveryPreview({
  projects,
  onClose,
}: {
  projects: Project[]
  onClose: () => void
}) {
  const now = new Date()
  const cur = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  const open = projects.filter((p) => !p.is_closed)
  const closed = projects.filter((p) => p.is_closed)

  const livrablesMois = open.filter((p) => p.estimated_delivery_date && monthKey(p.estimated_delivery_date) === cur)
  const livresMois = closed.filter((p) => p.closed_at && monthKey(p.closed_at) === cur)

  const byMonth: Record<string, Project[]> = {}
  for (const p of open) {
    if (!p.estimated_delivery_date) continue
    const k = monthKey(p.estimated_delivery_date)
    if (!byMonth[k]) byMonth[k] = []
    byMonth[k].push(p)
  }
  const months = Object.keys(byMonth).sort()

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto p-5">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-black">Aperçu livraisons</h2>
          <button onClick={onClose} className="text-2xl leading-none">×</button>
        </div>
        <section className="mb-4">
          <h3 className="font-medium text-sm mb-1">Livrables du mois en cours ({livrablesMois.length})</h3>
          {livrablesMois.length === 0 && <p className="text-xs text-gray-400">Aucun</p>}
          {livrablesMois.map((p) => (
            <div key={p.id} className="text-sm">{p.project_number} — {p.client_name}</div>
          ))}
        </section>
        <section className="mb-4">
          <h3 className="font-medium text-sm mb-1">Livrés du mois en cours ({livresMois.length})</h3>
          {livresMois.length === 0 && <p className="text-xs text-gray-400">Aucun</p>}
          {livresMois.map((p) => (
            <div key={p.id} className="text-sm">{p.project_number} — {p.client_name}</div>
          ))}
        </section>
        <section>
          <h3 className="font-medium text-sm mb-2">Livrables par mois</h3>
          {months.length === 0 && <p className="text-xs text-gray-400">Pas encore de dates estimées — réoptimiser le calendrier.</p>}
          {months.map((m) => (
            <div key={m} className="mb-3">
              <div className="text-xs font-black uppercase text-gray-500">
                {monthLabel(m)} — {byMonth[m].length} projet{byMonth[m].length > 1 ? 's' : ''}
              </div>
              {byMonth[m].map((p) => (
                <div key={p.id} className="text-sm">{p.project_number} — {p.client_name} ({p.estimated_delivery_date})</div>
              ))}
            </div>
          ))}
        </section>
      </div>
    </div>
  )
}
