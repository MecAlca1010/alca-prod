import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { buildAssistantContext } from '../lib/assistantContext'

interface Msg {
  role: 'user' | 'assistant'
  content: string
}

interface PendingAction {
  type: string
  start_date?: string
  end_date?: string
  reason?: string
}

interface AssistantPanelProps {
  open: boolean
  onClose: () => void
  isAdmin: boolean
}

export default function AssistantPanel({ open, onClose, isAdmin }: AssistantPanelProps) {
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: 'assistant',
      content:
        'Bonjour — je suis l’assistant ALCA Prod. Pose-moi une question sur le calendrier, les projets, la Porte 8, le Jig, etc. En mode admin, je peux aussi proposer des actions (ex. bloquer la Porte 8) avec ta confirmation.',
    },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null)
  const [pendingOptions, setPendingOptions] = useState<any[]>([])
  const [actionMsg, setActionMsg] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, open, pendingAction])

  if (!open) return null

  const send = async () => {
    const text = input.trim()
    if (!text || loading) return
    setInput('')
    setError('')
    setActionMsg('')
    setPendingAction(null)
    setPendingOptions([])
    const next: Msg[] = [...messages, { role: 'user', content: text }]
    setMessages(next)
    setLoading(true)

    try {
      const context = await buildAssistantContext()
      const res = await fetch('/.netlify/functions/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: next.map((m) => ({ role: m.role, content: m.content })),
          context,
        }),
      })
      const raw = await res.text()
      let data: any = {}
      try {
        data = JSON.parse(raw)
      } catch {
        throw new Error(raw.slice(0, 200) || `Erreur ${res.status}`)
      }
      if (!res.ok) throw new Error(data.error || data.message || `Erreur ${res.status}`)

      setMessages((prev) => [...prev, { role: 'assistant', content: data.reply || '(réponse vide)' }])
      if (data.action && isAdmin) setPendingAction(data.action)
      if (Array.isArray(data.options) && data.options.length && isAdmin) setPendingOptions(data.options)
    } catch (e: any) {
      setError(e.message || 'Erreur de communication avec l’assistant')
    }
    setLoading(false)
  }

  const confirmAction = async () => {
    if (!pendingAction || !isAdmin) return
    setActionMsg('')
    try {
      if (pendingAction.type === 'block_porte_8') {
        if (!pendingAction.start_date || !pendingAction.end_date) {
          throw new Error('Dates manquantes dans l’action')
        }
        const { error: err } = await supabase.from('resource_blocks').insert({
          resource_id: 'porte_8',
          start_date: pendingAction.start_date,
          end_date: pendingAction.end_date,
          reason: pendingAction.reason || 'Via assistant',
        })
        if (err) throw err
        setActionMsg(
          `Porte 8 bloquée du ${pendingAction.start_date} au ${pendingAction.end_date}. Va sur le tableau de bord et clique Réoptimiser si besoin.`
        )
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: `Action appliquée : Porte 8 bloquée (${pendingAction.start_date} → ${pendingAction.end_date}). Pense à réoptimiser le calendrier.`,
          },
        ])
      } else if (pendingAction.type === 'reoptimize') {
        window.dispatchEvent(new CustomEvent('alca-reoptimize'))
        setActionMsg('Réoptimisation demandée.')
      } else {
        setActionMsg(`Type d’action non supporté encore: ${pendingAction.type}`)
      }
    } catch (e: any) {
      setActionMsg(e.message || 'Échec de l’action')
    }
    setPendingAction(null)
  }

  const applyOption = async (opt: any) => {
    if (!isAdmin) return
    setActionMsg('')
    try {
      const actions = opt.actions || []
      for (const act of actions) {
        if (act.type === 'pin_stage') {
          const { data: proj } = await supabase
            .from('projects')
            .select('id')
            .eq('project_number', String(act.project_number))
            .maybeSingle()
          if (!proj) throw new Error(`Projet ${act.project_number} introuvable`)
          const { data: st } = await supabase.from('stages').select('id').eq('slug', act.stage_slug).maybeSingle()
          if (!st) throw new Error(`Étape ${act.stage_slug} introuvable`)
          const { error } = await supabase
            .from('project_stages')
            .update({ start_date: act.start_date, is_pinned: true })
            .eq('project_id', proj.id)
            .eq('stage_id', st.id)
          if (error) throw error
        } else if (act.type === 'block_porte_8') {
          const { error } = await supabase.from('resource_blocks').insert({
            resource_id: 'porte_8',
            start_date: act.start_date,
            end_date: act.end_date,
            reason: act.reason || 'Via assistant',
          })
          if (error) throw error
        }
      }
      window.dispatchEvent(new CustomEvent('alca-reoptimize'))
      setPendingOptions([])
      setActionMsg('Option appliquée. Le calendrier se réoptimise.')
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `Option retenue : ${opt.title || 'changement appliqué'}. Calendrier en cours de mise à jour.` },
      ])
    } catch (e: any) {
      setActionMsg(e.message || 'Échec')
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full max-w-md h-full bg-white shadow-2xl flex flex-col">
        <div className="bg-alca-black text-white px-4 py-3 flex items-center justify-between">
          <div>
            <div className="font-black">Assistant ALCA</div>
            <div className="text-[11px] text-gray-400">Basé sur ton calendrier & tes règles</div>
          </div>
          <button onClick={onClose} className="text-2xl leading-none text-gray-400 hover:text-white">
            ×
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.map((m, i) => (
            <div
              key={i}
              className={`text-sm rounded-lg px-3 py-2 whitespace-pre-wrap ${
                m.role === 'user' ? 'bg-alca-yellow/30 ml-8' : 'bg-gray-100 mr-4'
              }`}
            >
              {m.content}
            </div>
          ))}
          {loading && <div className="text-xs text-gray-400">Réflexion…</div>}
          {error && <div className="text-sm text-red-600 bg-red-50 p-2 rounded">{error}</div>}
          {actionMsg && <div className="text-sm text-green-800 bg-green-50 p-2 rounded">{actionMsg}</div>}
          {pendingOptions.length > 0 && (
            <div className="space-y-2">
              {pendingOptions.map((opt, i) => (
                <div key={i} className="border border-amber-300 bg-amber-50 rounded-lg p-3 text-sm space-y-2">
                  <div className="font-medium">{opt.title || `Option ${i + 1}`}</div>
                  {opt.detail && <p className="text-xs text-gray-600 whitespace-pre-wrap">{opt.detail}</p>}
                  <button
                    onClick={() => applyOption(opt)}
                    className="w-full bg-alca-yellow font-black py-1.5 rounded-lg text-sm"
                  >
                    Poursuivre cette option
                  </button>
                </div>
              ))}
              <button onClick={() => setPendingOptions([])} className="w-full border py-1.5 rounded-lg text-sm">
                Aucune de ces options
              </button>
            </div>
          )}
          {pendingAction && (
            <div className="border border-amber-300 bg-amber-50 rounded-lg p-3 text-sm space-y-2">
              <div className="font-medium">Confirmation requise</div>
              <pre className="text-xs bg-white/80 p-2 rounded overflow-x-auto">
                {JSON.stringify(pendingAction, null, 2)}
              </pre>
              <div className="flex gap-2">
                <button
                  onClick={() => setPendingAction(null)}
                  className="flex-1 border py-1.5 rounded-lg text-sm"
                >
                  Non
                </button>
                <button
                  onClick={confirmAction}
                  className="flex-1 bg-alca-yellow font-black py-1.5 rounded-lg text-sm"
                >
                  Oui, appliquer
                </button>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <div className="border-t p-3 flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && send()}
            placeholder="Ex: Quand livrer le projet… ?"
            className="flex-1 border rounded-lg px-3 py-2 text-sm"
            disabled={loading}
          />
          <button
            onClick={send}
            disabled={loading || !input.trim()}
            className="bg-alca-yellow font-black px-4 rounded-lg text-sm disabled:opacity-50"
          >
            Envoyer
          </button>
        </div>
      </div>
    </div>
  )
}
