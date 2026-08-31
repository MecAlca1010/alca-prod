import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { parseCSV } from '../lib/csvImport'

interface Props {
  onClose: () => void
  onDone: () => void
}

export default function ImportLaborModal({ onClose, onDone }: Props) {
  const [log, setLog] = useState<string[]>([])
  const [busy, setBusy] = useState(false)

  const run = async (text: string) => {
    setBusy(true)
    const rows = parseCSV(text)
    if (rows.length < 2) {
      setLog(['Fichier vide'])
      setBusy(false)
      return
    }
    const headers = rows[0].map((h) => h.toLowerCase().trim())
    const partIdx = headers.findIndex((h) => h.includes('numero') || h.includes('piece') || h.includes('n°') || h === 'part')
    const hoursIdx = headers.findIndex((h) => h.includes('heure') || h.includes('hour') || h.includes('mo'))
    const stageIdx = headers.findIndex((h) => h.includes('etape') || h.includes('étape') || h.includes('stage'))
    const descIdx = headers.findIndex((h) => h.includes('desc'))
    if (partIdx < 0 || hoursIdx < 0) {
      setLog(['Colonnes requises : numero_piece + heures'])
      setBusy(false)
      return
    }
    const notes: string[] = []
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i]
      const part = (r[partIdx] || '').trim()
      if (!part) continue
      const hoursRaw = (r[hoursIdx] || '').replace(',', '.')
      const hours = parseFloat(hoursRaw)
      const stage = stageIdx >= 0 ? (r[stageIdx] || '').trim().toLowerCase() : ''
      const desc = descIdx >= 0 ? (r[descIdx] || '').trim() : part

      const { data: existing } = await supabase.from('components').select('id, labor_hours').eq('part_number', part).maybeSingle()
      if (!existing) {
        if (!confirm(`Le composant « ${part} » n'existe pas. Le créer ?`)) {
          notes.push(`${part} : ignoré (inexistant)`)
          continue
        }
        const { error } = await supabase.from('components').insert({
          part_number: part,
          description: desc || part,
          labor_hours: isFinite(hours) ? hours : null,
          stage_slug: stage || null,
        })
        notes.push(error ? `${part} : erreur ${error.message}` : `${part} : créé`)
        continue
      }
      if (existing.labor_hours != null && Number(existing.labor_hours) > 0) {
        if (!confirm(`${part} a déjà ${existing.labor_hours} h. Écraser ?`)) {
          notes.push(`${part} : conservé`)
          continue
        }
      }
      const patch: any = { labor_hours: isFinite(hours) ? Math.round(hours * 100) / 100 : null }
      if (stage) patch.stage_slug = stage
      const { error } = await supabase.from('components').update(patch).eq('id', existing.id)
      notes.push(error ? `${part} : ${error.message}` : `${part} : heures à jour`)
    }
    setLog(notes)
    setBusy(false)
    onDone()
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl max-w-lg w-full p-5 space-y-3">
        <h3 className="font-black">Import heures (CSV / XLSX en CSV)</h3>
        <p className="text-xs text-gray-500">Colonnes : numero_piece, heures, optionnel etape, description</p>
        <input
          type="file"
          accept=".csv,text/csv"
          disabled={busy}
          onChange={async (e) => {
            const f = e.target.files?.[0]
            if (!f) return
            run(await f.text())
          }}
        />
        {log.length > 0 && (
          <pre className="text-xs bg-gray-50 p-2 rounded max-h-40 overflow-auto">{log.join('\n')}</pre>
        )}
        <button onClick={onClose} className="border w-full py-2 rounded-lg text-sm">
          Fermer
        </button>
      </div>
    </div>
  )
}
