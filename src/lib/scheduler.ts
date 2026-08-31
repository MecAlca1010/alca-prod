/**
 * ALCA Prod production scheduler
 * Rules (v2):
 * - Business days only
 * - Priority order of projects
 * - Resources: porte_8 (paint, capacity 1), polyvalente 5+6 (capacity 2),
 *   jig (aluminium, capacity 1), hors_porte (PDI/tests, unlimited)
 * - Dependencies: Acier→Peinture→Grue; Aluminium→Habillage; gros œuvre→PDI→Tests
 * - Acier and Peinture never overlap on same project
 * - Grue/Habillage max overlap: configurable (default 1 business day)
 * - Same project uses at most 1 polyvalente slot at a time (Grue+Habillage same day = 1)
 * - resource_blocks: blocked dates on a resource (e.g. Porte 8 repairs)
 * - Aluminium-only jobs can fill jig gaps (priority still applies)
 */

import { formatDate, nextBusinessDay, isBusinessDay } from './dates'
import type { Project, ProjectStage, Stage } from '../types/database'
import { durationDaysForStage, hoursPerDayForStage, isoWeekKey, DEFAULT_MAX_TECHS } from './labor'

export interface ScheduledStage {
  projectStageId: string
  projectId: string
  stageId: string
  projectNumber: string
  clientName: string
  stageName: string
  stageSlug: string
  color: string
  startDate: string
  endDate: string
  durationDays: number
  isCompleted: boolean
  sortOrder: number
  resourceId?: string
}

export interface ScheduleResult {
  stages: ScheduledStage[]
  estimatedDeliveries: Record<string, string>
}

export type ResourceId = 'porte_8' | 'polyvalente' | 'jig' | 'hors_porte'

export interface ResourceBlock {
  resource_id: string
  start_date: string
  end_date: string
}

export interface ScheduleOptions {
  capacities?: Partial<Record<ResourceId, number>>
  blocks?: ResourceBlock[]
  grueHabillageMaxOverlap?: number
  startFrom?: Date
  /** projectId -> stageSlug -> labor hours */
  laborByProject?: Record<string, Record<string, number>>
  maxTechs?: Record<string, number>
  /** ISO week key -> available shop hours */
  weeklyHourCapacity?: Record<string, number>
  defaultWeeklyHours?: number
}

const DEFAULT_CAPACITY: Record<ResourceId, number> = {
  porte_8: 1,
  polyvalente: 2,
  jig: 1,
  hors_porte: 99,
}

const DEFAULT_STAGE_RESOURCE: Record<string, ResourceId> = {
  acier: 'polyvalente',
  peinture: 'porte_8',
  aluminium: 'jig',
  grue: 'polyvalente',
  habillage: 'polyvalente',
  pdi: 'hors_porte',
  tests: 'hors_porte',
}

function resourceForSlug(slug: string): ResourceId {
  return DEFAULT_STAGE_RESOURCE[slug] || 'polyvalente'
}

type Occupancy = Record<string, Partial<Record<ResourceId, number>>>

function isBlocked(blocks: ResourceBlock[], resource: ResourceId, dateStr: string): boolean {
  return blocks.some(
    (b) => b.resource_id === resource && dateStr >= b.start_date && dateStr <= b.end_date
  )
}

function eachBusinessDay(start: Date, duration: number, fn: (d: Date, key: string) => boolean | void): boolean {
  let current = new Date(start)
  if (!isBusinessDay(current)) current = nextBusinessDay(current)
  for (let i = 0; i < duration; i++) {
    if (!isBusinessDay(current)) current = nextBusinessDay(current)
    const key = formatDate(current)
    if (fn(current, key) === false) return false
    if (i < duration - 1) current = nextBusinessDay(current)
  }
  return true
}

function canPlace(
  occupancy: Occupancy,
  start: Date,
  duration: number,
  resource: ResourceId,
  capacity: number,
  blocks: ResourceBlock[]
): boolean {
  return eachBusinessDay(start, duration, (_d, key) => {
    if (isBlocked(blocks, resource, key)) return false
    const used = occupancy[key]?.[resource] || 0
    if (used >= capacity) return false
  })
}

function occupy(
  occupancy: Occupancy,
  start: Date,
  duration: number,
  resource: ResourceId
): { start: Date; end: Date } {
  let current = new Date(start)
  if (!isBusinessDay(current)) current = nextBusinessDay(current)
  const actualStart = new Date(current)
  for (let i = 0; i < duration; i++) {
    if (!isBusinessDay(current)) current = nextBusinessDay(current)
    const key = formatDate(current)
    if (!occupancy[key]) occupancy[key] = {}
    occupancy[key][resource] = (occupancy[key][resource] || 0) + 1
    if (i < duration - 1) current = nextBusinessDay(current)
  }
  return { start: actualStart, end: new Date(current) }
}

function weekHoursOk(
  start: Date,
  duration: number,
  hoursPerDay: number,
  weekUsed: Record<string, number>,
  weeklyCap: Record<string, number>,
  defaultWeekly: number
): boolean {
  if (!hoursPerDay || hoursPerDay <= 0) return true
  const add: Record<string, number> = {}
  const ok = eachBusinessDay(start, duration, (d) => {
    const w = isoWeekKey(d)
    add[w] = (add[w] || 0) + hoursPerDay
  })
  if (!ok) return false
  for (const [w, h] of Object.entries(add)) {
    const cap = weeklyCap[w] ?? defaultWeekly
    if ((weekUsed[w] || 0) + h > cap + 0.01) return false
  }
  return true
}

function occupyWeekHours(
  start: Date,
  duration: number,
  hoursPerDay: number,
  weekUsed: Record<string, number>
) {
  if (!hoursPerDay) return
  eachBusinessDay(start, duration, (d) => {
    const w = isoWeekKey(d)
    weekUsed[w] = (weekUsed[w] || 0) + hoursPerDay
  })
}

function findSlot(
  occupancy: Occupancy,
  from: Date,
  duration: number,
  resource: ResourceId,
  capacity: number,
  blocks: ResourceBlock[],
  hoursPerDay: number,
  weekUsed: Record<string, number>,
  weeklyCap: Record<string, number>,
  defaultWeekly: number,
  maxAttempts = 180
): Date | null {
  let tryStart = new Date(from)
  if (!isBusinessDay(tryStart)) tryStart = nextBusinessDay(tryStart)
  for (let a = 0; a < maxAttempts; a++) {
    if (
      canPlace(occupancy, tryStart, duration, resource, capacity, blocks) &&
      weekHoursOk(tryStart, duration, hoursPerDay, weekUsed, weeklyCap, defaultWeekly)
    ) {
      return tryStart
    }
    tryStart = nextBusinessDay(tryStart)
  }
  return null
}

function endOfStage(start: Date, duration: number): Date {
  let current = new Date(start)
  if (!isBusinessDay(current)) current = nextBusinessDay(current)
  for (let i = 1; i < duration; i++) {
    current = nextBusinessDay(current)
  }
  return current
}

/** Business days of overlap between [s1,e1] and [s2,e2] inclusive */
function overlapBusinessDays(s1: Date, e1: Date, s2: Date, e2: Date): number {
  const start = s1 > s2 ? s1 : s2
  const end = e1 < e2 ? e1 : e2
  if (start > end) return 0
  let n = 0
  let c = new Date(start)
  while (c <= end) {
    if (isBusinessDay(c)) n++
    c.setDate(c.getDate() + 1)
  }
  return n
}

interface PS {
  id: string
  project_id: string
  stage_id: string
  is_required: boolean
  is_completed: boolean
  duration_days: number | null
  stage?: Stage
}

export function scheduleProjects(
  projects: Project[],
  projectStages: (ProjectStage & { stage?: Stage })[],
  stages: Stage[],
  options: ScheduleOptions = {}
): ScheduleResult {
  const capacities = { ...DEFAULT_CAPACITY, ...options.capacities }
  const blocks = options.blocks || []
  const maxGHOverlap = options.grueHabillageMaxOverlap ?? 1
  const startFrom = options.startFrom || new Date()
  const laborByProject = options.laborByProject || {}
  const maxTechs = { ...DEFAULT_MAX_TECHS, ...options.maxTechs }
  const weeklyCap = options.weeklyHourCapacity || {}
  const defaultWeekly = options.defaultWeeklyHours ?? 240
  const weekUsed: Record<string, number> = {}

  const sortedProjects = [...projects]
    .filter((p) => !(p as Project & { is_closed?: boolean }).is_closed)
    .sort((a, b) => a.priority_order - b.priority_order)
  const occupancy: Occupancy = {}
  const result: ScheduledStage[] = []
  const estimatedDeliveries: Record<string, string> = {}

  let globalCursor = isBusinessDay(startFrom) ? new Date(startFrom) : nextBusinessDay(startFrom)
  globalCursor.setHours(0, 0, 0, 0)

  for (const project of sortedProjects) {
    const pStages = (projectStages as PS[])
      .filter((ps) => ps.project_id === project.id && ps.is_required)
      .map((ps) => {
        const stage = ps.stage || stages.find((s) => s.id === ps.stage_id)
        return { ...ps, stage }
      })
      .filter((ps) => ps.stage)
      .sort((a, b) => a.stage!.sort_order - b.stage!.sort_order)

    if (pStages.length === 0) continue

    const bySlug: Record<string, PS & { stage: Stage }> = {}
    for (const ps of pStages) {
      bySlug[ps.stage!.slug] = ps as PS & { stage: Stage }
    }

    const placed: Record<string, { start: Date; end: Date }> = {}

    const placeOne = (ps: PS & { stage: Stage }, notBefore: Date): boolean => {
      const stage = ps.stage
      const laborH = laborByProject[project.id]?.[stage.slug] || 0
      const mt = maxTechs[stage.slug] ?? 1
      const duration = durationDaysForStage({
        slug: stage.slug,
        defaultDays: stage.default_duration_days || 1,
        laborHours: laborH,
        maxTechs: mt,
      })
      const hpd = hoursPerDayForStage(stage.slug, laborH, mt, duration)
      const resource = resourceForSlug(stage.slug)
      const capacity = capacities[resource]

      const slot = findSlot(
        occupancy,
        notBefore,
        duration,
        resource,
        capacity,
        blocks,
        hpd,
        weekUsed,
        weeklyCap,
        defaultWeekly
      )
      if (!slot) return false

      const { start, end } = occupy(occupancy, slot, duration, resource)
      occupyWeekHours(slot, duration, hpd, weekUsed)
      placed[stage.slug] = { start, end }
      result.push({
        projectStageId: ps.id,
        projectId: project.id,
        stageId: stage.id,
        projectNumber: project.project_number,
        clientName: project.client_name,
        stageName: stage.name,
        stageSlug: stage.slug,
        color: stage.color,
        startDate: formatDate(start),
        endDate: formatDate(end),
        durationDays: duration,
        isCompleted: ps.is_completed,
        sortOrder: stage.sort_order,
        resourceId: resource,
      })
      return true
    }

    // 1) Acier
    if (bySlug.acier) {
      placeOne(bySlug.acier, new Date(globalCursor))
    }

    // 2) Peinture after acier end (or global if no acier)
    if (bySlug.peinture) {
      const after = placed.acier ? nextBusinessDay(placed.acier.end) : new Date(globalCursor)
      placeOne(bySlug.peinture, after)
    }

    // 3) Aluminium on jig — can start from globalCursor (parallel), try early to finish near paint exit
    if (bySlug.aluminium) {
      placeOne(bySlug.aluminium, new Date(globalCursor))
    }

    // 4) Grue after peinture (or after acier/global)
    if (bySlug.grue) {
      let after = new Date(globalCursor)
      if (placed.peinture) after = nextBusinessDay(placed.peinture.end)
      else if (placed.acier) after = nextBusinessDay(placed.acier.end)
      placeOne(bySlug.grue, after)
    }

    // 5) Habillage after aluminium end; respect max overlap with grue
    if (bySlug.habillage) {
      let after = new Date(globalCursor)
      if (placed.aluminium) after = nextBusinessDay(placed.aluminium.end)

      // If grue exists, ensure overlap ≤ maxGHOverlap
      if (placed.grue) {
        const laborH = laborByProject[project.id]?.habillage || 0
        const mt = maxTechs.habillage ?? 2
        const duration = durationDaysForStage({
          slug: 'habillage',
          defaultDays: bySlug.habillage.stage.default_duration_days || 1,
          laborHours: laborH,
          maxTechs: mt,
        })
        const hpd = hoursPerDayForStage('habillage', laborH, mt, duration)
        const resource = resourceForSlug('habillage')
        const capacity = capacities[resource]
        let tryStart = new Date(after)
        let ok = false
        for (let a = 0; a < 180; a++) {
          if (
            canPlace(occupancy, tryStart, duration, resource, capacity, blocks) &&
            weekHoursOk(tryStart, duration, hpd, weekUsed, weeklyCap, defaultWeekly)
          ) {
            const tryEnd = endOfStage(tryStart, duration)
            const ov = overlapBusinessDays(placed.grue.start, placed.grue.end, tryStart, tryEnd)
            if (ov <= maxGHOverlap) {
              const { start, end } = occupy(occupancy, tryStart, duration, resource)
              occupyWeekHours(tryStart, duration, hpd, weekUsed)
              placed.habillage = { start, end }
              result.push({
                projectStageId: bySlug.habillage.id,
                projectId: project.id,
                stageId: bySlug.habillage.stage.id,
                projectNumber: project.project_number,
                clientName: project.client_name,
                stageName: bySlug.habillage.stage.name,
                stageSlug: 'habillage',
                color: bySlug.habillage.stage.color,
                startDate: formatDate(start),
                endDate: formatDate(end),
                durationDays: duration,
                isCompleted: bySlug.habillage.is_completed,
                sortOrder: bySlug.habillage.stage.sort_order,
                resourceId: resource,
              })
              ok = true
              break
            }
          }
          tryStart = nextBusinessDay(tryStart)
        }
        if (!ok) placeOne(bySlug.habillage, after)
      } else {
        placeOne(bySlug.habillage, after)
      }
    }

    // 6) PDI after all workshop stages present
    if (bySlug.pdi) {
      let after = new Date(globalCursor)
      for (const slug of ['acier', 'peinture', 'aluminium', 'grue', 'habillage'] as const) {
        if (placed[slug]) {
          const n = nextBusinessDay(placed[slug].end)
          if (n > after) after = n
        }
      }
      placeOne(bySlug.pdi, after)
    }

    // 7) Tests after PDI
    if (bySlug.tests) {
      const after = placed.pdi ? nextBusinessDay(placed.pdi.end) : new Date(globalCursor)
      placeOne(bySlug.tests, after)
    }

    // Delivery = day after last stage
    let last: Date | null = null
    for (const p of Object.values(placed)) {
      if (!last || p.end > last) last = p.end
    }
    if (last) {
      estimatedDeliveries[project.id] = formatDate(nextBusinessDay(last))
    }
  }

  return { stages: result, estimatedDeliveries }
}
