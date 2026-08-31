-- Labor, technicians, closed projects
ALTER TABLE projects ADD COLUMN IF NOT EXISTS is_closed BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS projects_is_closed_idx ON projects (is_closed);

ALTER TABLE components ADD COLUMN IF NOT EXISTS stage_slug TEXT;
ALTER TABLE components ADD COLUMN IF NOT EXISTS labor_hours NUMERIC(10,2);

CREATE TABLE IF NOT EXISTS technicians (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  hours_per_week NUMERIC(6,2) NOT NULL DEFAULT 40,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS technician_time_off (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  technician_id UUID NOT NULL REFERENCES technicians(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS technician_time_off_tech_dates
  ON technician_time_off (technician_id, start_date, end_date);

-- Max techs per stage
INSERT INTO scheduling_settings (key, value, description) VALUES
  ('max_techs_acier', '2', 'Techs max Acier/Sous-chassis'),
  ('max_techs_peinture', '1', 'Techs max Peinture'),
  ('max_techs_aluminium', '1', 'Techs max Aluminium/Plate-forme'),
  ('max_techs_grue', '2', 'Techs max Grue/branchements'),
  ('max_techs_habillage', '2', 'Techs max Habillage/accessoires'),
  ('max_techs_pdi', '0', 'PDI hors pool des 6'),
  ('max_techs_tests', '0', 'Tests hors pool des 6'),
  ('hours_per_day', '8', 'Heures par jour ouvrable par tech')
ON CONFLICT (key) DO NOTHING;

-- Fixed stage defaults
UPDATE stages SET default_duration_days = 2 WHERE slug = 'peinture';
UPDATE stages SET default_duration_days = 2 WHERE slug IN ('pdi', 'pdi_lavage');
UPDATE stages SET default_duration_days = 1 WHERE slug IN ('tests', 'tests_livraison');

ALTER TABLE technicians ENABLE ROW LEVEL SECURITY;
ALTER TABLE technician_time_off ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "technicians_select" ON technicians;
CREATE POLICY "technicians_select" ON technicians FOR SELECT USING (true);
DROP POLICY IF EXISTS "technicians_write" ON technicians;
CREATE POLICY "technicians_write" ON technicians FOR ALL USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "technician_time_off_select" ON technician_time_off;
CREATE POLICY "technician_time_off_select" ON technician_time_off FOR SELECT USING (true);
DROP POLICY IF EXISTS "technician_time_off_write" ON technician_time_off;
CREATE POLICY "technician_time_off_write" ON technician_time_off FOR ALL USING (auth.role() = 'authenticated');
