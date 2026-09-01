/**
 * Constraint checks for manual calendar overrides (ALCA Prod rules)
 */
import type { ScheduledStage } from './scheduler'

export interface ConstraintViolation {
  severity: 'warning' | 'error'
  message: string
}

function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart <= bEnd && aEnd >= bStart
}

/** Resource capacity by stage slug (aligned with scheduler) */
function capacityFor(slug: string): number {
  if (slug === 'peinture' || slug === 'aluminium') return 1
  if (slug === 'pdi' || slug === 'tests') return 99
  // acier, grue, habillage share polyvalente pool — checked separately
  return 2
}

function isPolyvalente(slug: string): boolean {
  return slug === 'acier' || slug === 'grue' || slug === 'habillage'
}

export function checkManualChange(
  changed: ScheduledStage,
  allStages: ScheduledStage[]
): ConstraintViolation[] {
  const violations: ConstraintViolation[] = []
  const seen = new Set<string>()
  const add = (severity: 'warning' | 'error', message: string) => {
    if (seen.has(message)) return
    seen.add(message)
    violations.push({ severity, message })
  }

  if (changed.startDate > changed.endDate) {
    add('error', 'La date de début est après la date de fin.')
    return violations
  }

  const sameProject = allStages.filter(
    (s) => s.projectId === changed.projectId && s.projectStageId !== changed.projectStageId
  )

  const bySlug = (slug: string) => sameProject.find((s) => s.stageSlug === slug)

  // --- Same-project dependencies ---
  if (changed.stageSlug === 'peinture') {
    const acier = bySlug('acier')
    if (acier && overlaps(changed.startDate, changed.endDate, acier.startDate, acier.endDate)) {
      add('warning', `Peinture chevauche Acier/Sous-chassis (${changed.projectNumber}).`)
    }
    if (acier && changed.startDate < acier.endDate) {
      add('warning', `Peinture commence avant la fin de l’Acier (${changed.projectNumber}).`)
    }
  }

  if (changed.stageSlug === 'grue') {
    const peinture = bySlug('peinture')
    if (peinture && changed.startDate <= peinture.endDate) {
      add('warning', `Grue commence avant/pendant la Peinture — la grue doit attendre la sortie peinture (${changed.projectNumber}).`)
    }
  }

  if (changed.stageSlug === 'habillage') {
    const alu = bySlug('aluminium')
    if (alu && changed.startDate <= alu.endDate) {
      add('warning', `Habillage commence avant la fin de l’Aluminium/Plate-forme (${changed.projectNumber}).`)
    }
    const acierH = bySlug('acier')
    if (acierH && changed.startDate <= acierH.endDate) {
      add('warning', `Habillage pendant l’Acier : le camion n’est pas disponible (${changed.projectNumber}).`)
    }
    const peintureH = bySlug('peinture')
    if (peintureH && changed.startDate <= peintureH.endDate) {
      add('warning', `Habillage avant la fin de la Peinture : camion encore en baie (${changed.projectNumber}).`)
    }
    const grue = bySlug('grue')
    if (grue && overlaps(changed.startDate, changed.endDate, grue.startDate, grue.endDate)) {
      // soft: max 1 day overlap preferred — we only warn if overlap spans clearly
      add('warning', `Habillage chevauche la Grue (${changed.projectNumber}). Chevauchement max recommandé : 1 jour.`)
    }
  }

  if (changed.stageSlug === 'pdi') {
    for (const slug of ['acier', 'peinture', 'aluminium', 'grue', 'habillage'] as const) {
      const other = bySlug(slug)
      if (other && changed.startDate <= other.endDate) {
        add(
          'warning',
          `PDI/lavage commence avant la fin de « ${other.stageName} » (${changed.projectNumber}). Le PDI doit suivre le gros œuvre.`
        )
      }
    }
  }

  if (changed.stageSlug === 'tests') {
    const pdi = bySlug('pdi')
    if (pdi && changed.startDate <= pdi.endDate) {
      add('warning', `Tests/livraison commence avant la fin du PDI (${changed.projectNumber}).`)
    }
    for (const slug of ['acier', 'peinture', 'aluminium', 'grue', 'habillage'] as const) {
      const other = bySlug(slug)
      if (other && changed.startDate <= other.endDate) {
        add(
          'warning',
          `Tests commence avant la fin de « ${other.stageName} » (${changed.projectNumber}).`
        )
      }
    }
  }

  // If user moved an EARLIER stage so it ends after a later stage started
  if (['acier', 'peinture', 'aluminium', 'grue', 'habillage'].includes(changed.stageSlug)) {
    const pdi = bySlug('pdi')
    if (pdi && changed.endDate >= pdi.startDate) {
      add(
        'warning',
        `« ${changed.stageName} » chevauche ou dépasse le début du PDI (${changed.projectNumber}).`
      )
    }
  }

  // --- Capacity inter-projets ---
  if (changed.stageSlug === 'peinture' || changed.stageSlug === 'aluminium') {
    const others = allStages.filter(
      (s) =>
        s.stageSlug === changed.stageSlug &&
        s.projectStageId !== changed.projectStageId &&
        overlaps(changed.startDate, changed.endDate, s.startDate, s.endDate)
    )
    if (others.length >= 1) {
      add(
        'warning',
        `Capacité dépassée : plus d’une tâche « ${changed.stageName} » en parallèle (limite 1).`
      )
    }
  }

  if (isPolyvalente(changed.stageSlug)) {
    const otherProjectIds = new Set(
      allStages
        .filter(
          (s) =>
            isPolyvalente(s.stageSlug) &&
            s.projectStageId !== changed.projectStageId &&
            s.projectId !== changed.projectId &&
            overlaps(changed.startDate, changed.endDate, s.startDate, s.endDate)
        )
        .map((s) => s.projectId)
    )
    // 1 camion = 1 projet, même s'il a Acier + Grue + Habillage qui se touchent
    if (otherProjectIds.size >= 2) {
      add(
        'warning',
        `Portes 5+6 saturées : trop de projets polyvalents (Acier/Grue/Habillage) en parallèle (max 2 camions).`
      )
    }
  }

  return violations
}
