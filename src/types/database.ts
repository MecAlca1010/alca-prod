export type ProjectStatus = 'en_cours' | 'a_venir' | 'en_preparation' | 'camion_recu'

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
