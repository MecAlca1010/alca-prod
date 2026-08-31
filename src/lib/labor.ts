import type { Component, ProjectComponent, Stage } from '../types/database'

export const FIXED_STAGE_DAYS: Record<string, number> = {
  peinture: 2,
  pdi: 2,
  tests: 1,
}

export const STAGE_OPTIONS: { slug: string; label: string }[] = [
  { slug: 'acier', label: 'Acier / Sous-chassis' },
  { slug: 'peinture', label: 'Peinture' },
  { slug: 'aluminium', label: 'Aluminium / Plate-forme' },
  { slug: 'grue', label: 'Grue / branchements' },
  { slug: 'habillage', label: 'Habillage / accessoires' },
  { slug: 'pdi', label: 'PDI / lavage' },
  { slug: 'tests', label: 'Tests / livraison' },
]

export const DEFAULT_MAX_TECHS: Record<string, number> = {
  acier: 2,
  peinture: 1,
  aluminium: 1,
  grue: 2,
  habillage: 2,
  pdi: 0,
  tests: 0,
}

const HOURS_PER_DAY = 8

export function isFixedDurationStage(slug: string): boolean {
  return slug in FIXED_STAGE_DAYS
}

/** Duration in business days for a project stage */
export function durationDaysForStage(opts: {
  slug: string
  defaultDays: number
  laborHours: number
  maxTechs: number
}): number {
  const { slug, defaultDays, laborHours, maxTechs } = opts
  if (isFixedDurationStage(slug)) {
    return FIXED_STAGE_DAYS[slug] ?? defaultDays ?? 1
  }
  if (!laborHours || laborHours <= 0) {
    return Math.max(1, defaultDays || 1)
  }
  const techs = Math.max(1, maxTechs || 1)
  return Math.max(1, Math.ceil(laborHours / (techs * HOURS_PER_DAY)))
}

export function laborHoursForProjectStage(
  slug: string,
  projectComponents: (ProjectComponent & { component?: Component })[]
): number {
  let sum = 0
  for (const pc of projectComponents) {
    const c = pc.component
    if (!c || c.stage_slug !== slug) continue
    const h = Number(c.labor_hours)
    if (!h || h <= 0) continue
    const q = Number(pc.quantity) || 1
    sum += h * q
  }
  return Math.round(sum * 100) / 100
}

export function hoursPerDayForStage(slug: string, laborHours: number, maxTechs: number, durationDays: number): number {
  if (isFixedDurationStage(slug) || maxTechs <= 0) return 0
  if (!laborHours || laborHours <= 0) return 0
  const cap = maxTechs * HOURS_PER_DAY
  return Math.min(cap, laborHours / Math.max(1, durationDays))
}

export function isoWeekKey(d: Date): string {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const day = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}
