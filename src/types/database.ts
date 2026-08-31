export type ProjectStatus = 'en_cours' | 'a_venir' | 'en_preparation' | 'camion_recu' | 'livre'

export interface Stage {
  id: string
  name: string
  slug: string
  color: string
  default_duration_days: number
  sort_order: number
}

export interface Project {
  id: string
  project_number: string
  client_name: string
  description: string | null
  hiab_model: string | null
  serial_number: string | null
  vin: string | null
  status: ProjectStatus
  priority_order: number
  sharepoint_url: string | null
  estimated_delivery_date: string | null
  is_closed?: boolean
  closed_at?: string | null
  created_at: string
  updated_at: string
}

export interface ProjectStage {
  id: string
  project_id: string
  stage_id: string
  is_required: boolean
  is_completed: boolean
  start_date: string | null
  end_date: string | null
  duration_days: number | null
  stage?: Stage
}

export interface HiabModel {
  id: string
  name: string
  is_active: boolean
}

export interface SubComponent {
  id: string
  part_number: string
  description: string
  created_at?: string
}

export interface Component {
  id: string
  part_number: string
  description: string
  stage_slug?: string | null
  labor_hours?: number | null
  created_at?: string
}

export interface Technician {
  id: string
  first_name: string
  last_name: string
  hours_per_week: number
  is_active: boolean
}

export interface TechnicianTimeOff {
  id: string
  technician_id: string
  start_date: string
  end_date: string
  reason: string | null
}

export interface ComponentItem {
  id: string
  component_id: string
  sub_component_id: string
  quantity: number
  sub_component?: SubComponent
}

export interface ProjectComponent {
  id: string
  project_id: string
  component_id: string
  quantity: number
  component?: Component
}

export interface MaterialLine {
  part_number: string
  description: string
  total_quantity: number
  sub_component_id: string
}
