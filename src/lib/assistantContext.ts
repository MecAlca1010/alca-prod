import { supabase } from './supabase'

/** Build a compact text context for the production assistant */
export async function buildAssistantContext(): Promise<string> {
  const [projects, stages, ps, blocks, resources] = await Promise.all([
    supabase.from('projects').select('id, project_number, client_name, status, priority_order, estimated_delivery_date, hiab_model').order('priority_order'),
    supabase.from('stages').select('id, name, slug, sort_order, default_duration_days').order('sort_order'),
    supabase
      .from('project_stages')
      .select('project_id, stage_id, is_required, is_completed, start_date, end_date, duration_days'),
    supabase.from('resource_blocks').select('resource_id, start_date, end_date, reason').order('start_date'),
    supabase.from('resources').select('id, name, capacity'),
  ])

  const stageById = new Map((stages.data || []).map((s) => [s.id, s]))
  const lines: string[] = []

  lines.push(`Date du jour: ${new Date().toISOString().slice(0, 10)}`)
  lines.push('')

  if (resources.data?.length) {
    lines.push('Ressources / capacités:')
    for (const r of resources.data) {
      lines.push(`- ${r.id}: ${r.name} (capacité ${r.capacity})`)
    }
    lines.push('')
  }

  if (blocks.data?.length) {
    lines.push('Blocages ressources:')
    for (const b of blocks.data) {
      lines.push(`- ${b.resource_id}: ${b.start_date} → ${b.end_date}${b.reason ? ` (${b.reason})` : ''}`)
    }
    lines.push('')
  } else {
    lines.push('Blocages ressources: aucun')
    lines.push('')
  }

  lines.push('Projets (par priorité):')
  for (const p of projects.data || []) {
    lines.push(
      `- [${p.priority_order}] ${p.project_number} | ${p.client_name} | statut=${p.status}` +
        (p.hiab_model ? ` | Hiab=${p.hiab_model}` : '') +
        (p.estimated_delivery_date ? ` | livraison estimée=${p.estimated_delivery_date}` : '')
    )
    const stagesForP = (ps.data || []).filter((x) => x.project_id === p.id && x.is_required)
    for (const s of stagesForP) {
      const st = stageById.get(s.stage_id)
      const name = st?.name || s.stage_id
      lines.push(
        `    • ${name}: ${s.start_date || '?'} → ${s.end_date || '?'} (${s.duration_days ?? st?.default_duration_days ?? '?'} j)` +
          (s.is_completed ? ' [TERMINÉ]' : '')
      )
    }
  }

  if (!projects.data?.length) {
    lines.push('(aucun projet)')
  }

  return lines.join('\n')
}
