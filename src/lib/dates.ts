/** Business day helpers (Mon-Fri only) */

export function isBusinessDay(date: Date): boolean {
  const day = date.getDay()
  return day !== 0 && day !== 6 // not Sunday (0) or Saturday (6)
}

export function addBusinessDays(start: Date, days: number): Date {
  const result = new Date(start)
  let added = 0
  while (added < days) {
    result.setDate(result.getDate() + 1)
    if (isBusinessDay(result)) added++
  }
  return result
}

export function nextBusinessDay(date: Date): Date {
  const result = new Date(date)
  do {
    result.setDate(result.getDate() + 1)
  } while (!isBusinessDay(result))
  return result
}

export function startOfWeek(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day // Monday
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}

export function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export function parseDate(str: string): Date {
  const d = new Date(str + 'T00:00:00')
  return d
}

export function getBusinessDaysInRange(start: Date, end: Date): Date[] {
  const days: Date[] = []
  const current = new Date(start)
  while (current <= end) {
    if (isBusinessDay(current)) {
      days.push(new Date(current))
    }
    current.setDate(current.getDate() + 1)
  }
  return days
}

export function getWeekDays(weekStart: Date): Date[] {
  const days: Date[] = []
  for (let i = 0; i < 5; i++) { // Mon-Fri
    const d = new Date(weekStart)
    d.setDate(weekStart.getDate() + i)
    days.push(d)
  }
  return days
}

export function formatDayLabel(date: Date): string {
  return date.toLocaleDateString('fr-CA', { weekday: 'short', day: 'numeric', month: 'short' })
}

export function formatWeekRange(weekStart: Date): string {
  const end = new Date(weekStart)
  end.setDate(weekStart.getDate() + 4)
  return `${weekStart.toLocaleDateString('fr-CA', { day: 'numeric', month: 'short' })} – ${end.toLocaleDateString('fr-CA', { day: 'numeric', month: 'short', year: 'numeric' })}`
}
