ALTER TABLE projects ADD COLUMN IF NOT EXISTS truck_model TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS truck_received_date DATE;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS equipment_received_date DATE;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS contact_name TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS contact_email TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS contact_phone TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS on_calendar BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS accessories JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE project_stages ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN NOT NULL DEFAULT false;

UPDATE stages SET name = 'PDI / Tests' WHERE slug = 'pdi';
UPDATE stages SET name = 'Lavage / Livraison' WHERE slug = 'tests';
