import { useEffect, useState, useRef } from 'react'
import { supabase } from '../lib/supabase'

interface Notif {
  id: string
  title: string
  body: string | null
  is_read: boolean
  created_at: string
}

export default function NotificationBell({ enabled }: { enabled: boolean }) {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<Notif[]>([])
  const wrapRef = useRef<HTMLDivElement>(null)

  const load = async () => {
    if (!enabled) return
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(30)
    setItems((data as Notif[]) || [])
  }

  useEffect(() => {
    load()
    if (!enabled) return
    const t = setInterval(load, 20000)
    return () => clearInterval(t)
  }, [enabled])

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current) return
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  if (!enabled) return null

  const unread = items.filter((n) => !n.is_read).length

  const markAll = async () => {
    const ids = items.filter((n) => !n.is_read).map((n) => n.id)
    if (!ids.length) return
    await supabase.from('notifications').update({ is_read: true }).in('id', ids)
    setItems((prev) => prev.map((n) => ({ ...n, is_read: true })))
  }

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        onClick={() => {
          setOpen((o) => !o)
          if (!open) markAll()
        }}
        className="relative w-9 h-9 flex items-center justify-center bg-alca-gray hover:bg-gray-600 rounded"
        title="Notifications"
        aria-label="Notifications"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] font-black flex items-center justify-center">
            {unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-80 max-h-96 overflow-y-auto bg-white text-alca-black rounded-lg shadow-xl border z-50">
          <div className="px-3 py-2 font-black text-sm border-b">Notifications</div>
          {items.length === 0 && <p className="p-3 text-sm text-gray-500">Aucune notification</p>}
          {items.map((n) => (
            <div key={n.id} className={`px-3 py-2 text-sm border-b ${n.is_read ? '' : 'bg-yellow-50'}`}>
              <div className="font-medium">{n.title}</div>
              {n.body && <div className="text-xs text-gray-600 whitespace-pre-wrap">{n.body}</div>}
              <div className="text-[10px] text-gray-400 mt-1">
                {new Date(n.created_at).toLocaleString('fr-CA')}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
