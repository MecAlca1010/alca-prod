/**
 * Simple production scheduler for ALCA Prod
 * Places project stages sequentially by priority, respecting:
 * - Business days only
 * - Stage order within a project
 * - Basic resource limits (simplified for v1)
 * - Max durations
 */

import { addBusinessDays, formatDate, nextBusinessDay, parseDate, isBusinessDay } from './dates'
import type { Project, ProjectStage, Stage } from '../types/database'

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
}

export interface ScheduleResult {
  stages: ScheduledStage[]
  estimatedDeliveries: Record<string, string> // projectId -> date
}

/** Resource keys for simplified capacity */
type ResourceKey = 'acier' | 'peinture' | 'aluminium' | 'polyvalente'

function getResourceForStage(slug: string): ResourceKey {
  if (slug === 'acier') return 'acier'
  if (slug === 'peinture') return 'peinture'
  if (slug === 'aluminium') return 'aluminium'
  return 'polyvalente' // grue, habillage, pdi, tests share polyvalente doors
}

/** Capacity: how many concurrent tasks per resource type */
const CAPACITY: Record<ResourceKey, number> = {
  acier: 1,
  peinture: 1,
  aluminium: 1,
  polyvalente: 2,
}

interface Occupancy {
  [date: string]: Partial<Record<ResourceKey, number>>
}

function canPlace(
  occupancy: Occupancy,
  start: Date,
  duration: number,
  resource: ResourceKey
): boolean {
  let current = new Date(start)
  for (let i = 0; i < duration; i++) {
    if (!isBusinessDay(current)) {
      current = nextBusinessDay(current)
    }
    const key = formatDate(current)
    const used = occupancy[key]?.[resource] || 0
    if (used >= CAPACITY[resource]) return false
    current = nextBusinessDay(current)
  }
  return true
}

function occupy(
  occupancy: Occupancy,
  start: Date,
  duration: number,
  resource: ResourceKey
): { start: Date; end: Date } {
  let current = new Date(start)
  // Ensure start is a business day
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

/**
 * Schedule all projects in priority order.
 * For each project, schedule its required stages in order.
 * Aluminium can overlap with most stages (simplified: we still place sequentially for v1 stability,
 * but we allow parallel resources).
 */
export function scheduleProjects(
  projects: Project[],
  projectStages: (ProjectStage & { stage?: Stage })[],
  stages: Stage[],
  startFrom: Date = new Date()
): ScheduleResult {
  // Sort projects by priority
  const sortedProjects = [...projects].sort((a, b) => a.priority_order - b.priority_order)

  const occupancy: Occupancy = {}
  const result: ScheduledStage[] = []
  const estimatedDeliveries: Record<string, string> = {}

  // Start from today or next business day
  let globalCursor = isBusinessDay(startFrom) ? new Date(startFrom) : nextBusinessDay(startFrom)
  globalCursor.setHours(0, 0, 0, 0)

  for (const project of sortedProjects) {
    const pStages = projectStages
      .filter((ps) => ps.project_id === project.id && ps.is_required)
      .map((ps) => {
        const stage = ps.stage || stages.find((s) => s.id === ps.stage_id)
        return { ...ps, stage }
      })
      .filter((ps) => ps.stage)
      .sort((a, b) => (a.stage!.sort_order) - (b.stage!.sort_order))

    if (pStages.length === 0) continue

    let projectCursor = new Date(globalCursor)
    let lastEnd: Date | null = null

    for (const ps of pStages) {
      const stage = ps.stage!
      const duration = ps.duration_days || stage.default_duration_days || 1
      const resource = getResourceForStage(stage.slug)

      // Find first available slot starting from projectCursor
      let tryStart = new Date(projectCursor)
      let placed = false
      let attempts = 0
      const maxAttempts = 120 // ~6 months of business days

      while (!placed && attempts < maxAttempts) {
        if (canPlace(occupancy, tryStart, duration, resource)) {
          const { start, end } = occupy(occupancy, tryStart, duration, resource)
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
          })
          lastEnd = end
          // Next stage starts the business day after this one ends
          // Exception: aluminium can in theory overlap, but for v1 we keep sequential for clarity
          projectCursor = nextBusinessDay(end)
          placed = true
        } else {
          tryStart = nextBusinessDay(tryStart)
          attempts++
        }
      }

      if (!placed) {
        // Fallback: force place far in the future
        const { start, end } = occupy(occupancy, tryStart, duration, resource)
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
        })
        lastEnd = end
        projectCursor = nextBusinessDay(end)
      }
    }

    if (lastEnd) {
      // Estimated delivery = next business day after last stage
      const delivery = nextBusinessDay(lastEnd)
      estimatedDeliveries[project.id] = formatDate(delivery)
    }
  }

  return { stages: result, estimatedDeliveries }
}
