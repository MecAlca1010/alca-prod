-- Resources & capacity for ALCA Prod scheduling
CREATE TABLE IF NOT EXISTS resources (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  capacity INTEGER NOT NULL DEFAULT 1,
  notes TEXT
);

INSERT INTO resources (id, name, capacity, notes) VALUES
  ('porte_8', 'Porte 8 (Peinture)', 1, 'Peinture uniquement. Peut être bloquée pour réparations.'),
  ('polyvalente', 'Portes 5+6 (polyvalentes)', 2, 'Acier, Grue, Habillage. 1 camion par porte, max 2 au total.'),
  ('jig', 'Jig (plate-forme)', 1, 'Fabrication Aluminium / Plate-forme, une à la fois.'),
  ('hors_porte', 'Hors porte / extérieur', 99, 'PDI, Tests — pas de limite inter-projets.')
ON CONFLICT (id) DO NOTHING;

-- Stage slug -> resource
CREATE TABLE IF NOT EXISTS stage_resources (
  stage_slug TEXT PRIMARY KEY,
  resource_id TEXT NOT NULL REFERENCES resources(id)
);

INSERT INTO stage_resources (stage_slug, resource_id) VALUES
  ('acier', 'polyvalente'),
  ('peinture', 'porte_8'),
  ('aluminium', 'jig'),
  ('grue', 'polyvalente'),
  ('habillage', 'polyvalente'),
  ('pdi', 'hors_porte'),
  ('tests', 'hors_porte')
ON CONFLICT (stage_slug) DO NOTHING;

-- Block a resource for a date range (business use: block Porte 8 for repairs)
CREATE TABLE IF NOT EXISTS resource_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_id TEXT NOT NULL REFERENCES resources(id),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS resource_blocks_resource_dates
  ON resource_blocks (resource_id, start_date, end_date);

-- Editable scheduling parameters
CREATE TABLE IF NOT EXISTS scheduling_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  description TEXT
);

INSERT INTO scheduling_settings (key, value, description) VALUES
  ('grue_habillage_max_overlap_days', '1', 'Chevauchement max (jours ouvrables) Grue / Habillage même projet'),
  ('business_days_only', 'true', 'Planifier uniquement lun–ven')
ON CONFLICT (key) DO NOTHING;

ALTER TABLE resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE stage_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE resource_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduling_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "resources_select" ON resources;
CREATE POLICY "resources_select" ON resources FOR SELECT USING (true);
DROP POLICY IF EXISTS "resources_write" ON resources;
CREATE POLICY "resources_write" ON resources FOR ALL USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "stage_resources_select" ON stage_resources;
CREATE POLICY "stage_resources_select" ON stage_resources FOR SELECT USING (true);
DROP POLICY IF EXISTS "stage_resources_write" ON stage_resources;
CREATE POLICY "stage_resources_write" ON stage_resources FOR ALL USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "resource_blocks_select" ON resource_blocks;
CREATE POLICY "resource_blocks_select" ON resource_blocks FOR SELECT USING (true);
DROP POLICY IF EXISTS "resource_blocks_write" ON resource_blocks;
CREATE POLICY "resource_blocks_write" ON resource_blocks FOR ALL USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "scheduling_settings_select" ON scheduling_settings;
CREATE POLICY "scheduling_settings_select" ON scheduling_settings FOR SELECT USING (true);
DROP POLICY IF EXISTS "scheduling_settings_write" ON scheduling_settings;
CREATE POLICY "scheduling_settings_write" ON scheduling_settings FOR ALL USING (auth.role() = 'authenticated');
