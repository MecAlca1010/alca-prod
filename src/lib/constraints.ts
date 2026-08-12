/**
 * Basic constraint checks for manual calendar overrides
 */
import type { ScheduledStage } from './scheduler'

export interface ConstraintViolation {
  severity: 'warning' | 'error'
  message: string
}

export function checkManualChange(
  changed: ScheduledStage,
  allStages: ScheduledStage[]
): ConstraintViolation[] {
  const violations: ConstraintViolation[] = []

  // 1. Start must be <= end
  if (changed.startDate > changed.endDate) {
    violations.push({
      severity: 'error',
      message: 'La date de début est après la date de fin.',
    })
    return violations
  }

  // 2. Same project: stage order roughly respected
  const sameProject = allStages
    .filter((s) => s.projectId === changed.projectId && s.projectStageId !== changed.projectStageId)
    .sort((a, b) => a.sortOrder - b.sortOrder)

  for (const other of sameProject) {
    if (other.sortOrder < changed.sortOrder && other.endDate > changed.startDate) {
      // earlier stage ends after this one starts — possible overlap / order issue
      if (other.stageSlug === 'acier' && changed.stageSlug === 'peinture') {
        violations.push({
          severity: 'warning',
          message: `Acier et Peinture se chevauchent ou sont dans le mauvais ordre pour ${changed.projectNumber}.`,
        })
      } else if (
        ['habillage', 'pdi', 'tests'].includes(changed.stageSlug) &&
        !['aluminium', 'grue'].includes(other.stageSlug) &&
        other.endDate > changed.startDate
      ) {
        violations.push({
          severity: 'warning',
          message: `${changed.stageName} commence avant la fin de ${other.stageName} (${changed.projectNumber}).`,
        })
      }
    }
    if (other.sortOrder > changed.sortOrder && other.startDate < changed.endDate) {
      if (changed.stageSlug === 'acier' && other.stageSlug === 'peinture') {
        violations.push({
          severity: 'warning',
          message: `Peinture chevauche encore Acier pour ${changed.projectNumber}.`,
        })
      }
    }
  }

  // 3. Same resource capacity (simplified: warn if many same-slug stages overlap)
  const sameSlug = allStages.filter(
    (s) =>
      s.stageSlug === changed.stageSlug &&
      s.projectStageId !== changed.projectStageId &&
      s.startDate <= changed.endDate &&
      s.endDate >= changed.startDate
  )

  const capacity =
    changed.stageSlug === 'acier' ||
    changed.stageSlug === 'peinture' ||
    changed.stageSlug === 'aluminium'
      ? 1
      : 2

  if (sameSlug.length >= capacity) {
    violations.push({
      severity: 'warning',
      message: `Capacité dépassée pour l’étape « ${changed.stageName} » (${sameSlug.length + 1} tâches en parallèle, limite ~${capacity}).`,
    })
  }

  return violations
}
