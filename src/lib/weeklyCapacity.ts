import { isBusinessDay } from './dates'
import { isoWeekKey } from './labor'
import type { Technician, TechnicianTimeOff } from '../types/database'

function mondayOfWeek(d: Date): Date {
  const x = new Date(d)
  const day = x.getDay()
  const diff = day === 0 ? -6 : 1 - day
  x.setDate(x.getDate() + diff)
  x.setHours(0, 0, 0, 0)
  return x
}

function techOffOnDay(techId: string, dateStr: string, offs: TechnicianTimeOff[]): boolean {
  return offs.some((o) => o.technician_id === techId && dateStr >= o.start_date && dateStr <= o.end_date)
}

/** Build ISO-week -> available hours for the next ~40 weeks */
export function buildWeeklyHourCapacity(
  techs: Technician[],
  offs: TechnicianTimeOff[],
  from = new Date(),
  weeks = 40
): { weekly: Record<string, number>; defaultWeekly: number } {
  const active = techs.filter((t) => t.is_active)
  const defaultWeekly = active.reduce((s, t) => s + (Number(t.hours_per_week) || 40), 0) || 240

  const weekly: Record<string, number> = {}
  const start = mondayOfWeek(from)
  for (let w = 0; w < weeks; w++) {
    const mon = new Date(start)
    mon.setDate(start.getDate() + w * 7)
    let hours = 0
    for (const t of active) {
      const perDay = (Number(t.hours_per_week) || 40) / 5
      let present = 0
      for (let i = 0; i < 5; i++) {
        const d = new Date(mon)
        d.setDate(mon.getDate() + i)
        if (!isBusinessDay(d)) continue
        const key = d.toISOString().slice(0, 10)
        if (!techOffOnDay(t.id, key, offs)) present++
      }
      hours += perDay * present
    }
    weekly[isoWeekKey(new Date(mon.getTime() + 2 * 86400000))] = Math.round(hours * 10) / 10
  }
  return { weekly, defaultWeekly }
}
