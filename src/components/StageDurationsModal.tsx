import { useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Stage } from '../types/database'

interface StageDurationsModalProps {
  stages: Stage[]
  onClose: () => void
  onSaved: (updated: Stage[]) => void
}

export default function StageDurationsModal({ stages, onClose, onSaved }: StageDurationsModalProps) {
  const [local, setLocal] = useState<Record<string, number>>(
    Object.fromEntries(stages.map((s) => [s.id, s.default_duration_days]))
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSave = async () => {
    setSaving(true)
    setError('')

    try {
      const updates = stages.map((s) => {
        const days = local[s.id]
        if (!days || days < 1) throw new Error(`Durée invalide pour ${s.name}`)
        return supabase
          .from('stages')
          .update({ default_duration_days: days })
          .eq('id', s.id)
      })
      const results = await Promise.all(updates)
      const failed = results.find((r) => r.error)
      if (failed?.error) throw new Error(failed.error.message)

      const updated = stages.map((s) => ({
        ...s,
        default_duration_days: local[s.id],
      }))
      onSaved(updated)
      onClose()
    } catch (e: any) {
      setError(e.message || 'Erreur lors de la sauvegarde')
    }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xl font-black">Durées des étapes</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-black text-2xl leading-none">
            ×
          </button>
        </div>

        <p className="text-sm text-gray-500 mb-4">
          Ces durées (en jours ouvrables) sont utilisées par l’algorithme de planification.
          Après modification, tu pourras réoptimiser le calendrier.
        </p>

        <div className="space-y-3 mb-5">
          {stages
            .slice()
            .sort((a, b) => a.sort_order - b.sort_order)
            .map((s) => (
              <div key={s.id} className="flex items-center gap-3">
                <div
                  className="w-3 h-3 rounded-sm flex-shrink-0"
                  style={{ backgroundColor: s.color }}
                />
                <span className="flex-1 text-sm">{s.name}</span>
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={local[s.id] ?? s.default_duration_days}
                  onChange={(e) =>
                    setLocal((prev) => ({
                      ...prev,
                      [s.id]: Math.max(1, parseInt(e.target.value) || 1),
                    }))
                  }
                  className="w-20 border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-alca-yellow"
                />
                <span className="text-xs text-gray-400 w-8">j</span>
              </div>
            ))}
        </div>

        {error && (
          <div className="text-red-600 text-sm bg-red-50 p-2 rounded mb-3">{error}</div>
        )}

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 border border-gray-300 py-2.5 rounded-lg hover:bg-gray-50"
          >
            Annuler
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 bg-alca-yellow text-alca-black font-black py-2.5 rounded-lg hover:brightness-110 disabled:opacity-50"
          >
            {saving ? 'Enregistrement...' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  )
}
