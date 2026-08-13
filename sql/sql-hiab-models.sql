-- Table hiab_models (si pas déjà créée)
CREATE TABLE IF NOT EXISTS hiab_models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE hiab_models ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hiab_models_select_all" ON hiab_models;
CREATE POLICY "hiab_models_select_all" ON hiab_models FOR SELECT USING (true);

DROP POLICY IF EXISTS "hiab_models_write_auth" ON hiab_models;
CREATE POLICY "hiab_models_write_auth" ON hiab_models FOR ALL USING (auth.role() = 'authenticated');

-- Seed modèles (ignore si déjà présents)
INSERT INTO hiab_models (name) VALUES
  -- Légères / compactes
  ('HIAB T-HiDuo 018'),
  ('HIAB T-CLX 023'),
  ('HIAB T-HiDuo 023'),
  ('HIAB T-CLX 029'),
  ('HIAB T-HiDuo 029'),
  ('HIAB T-DUO 029'),
  ('HIAB X-HiDuo 046'),
  ('HIAB X-HiDuo 108'),
  ('HIAB X-HiPro 122'),
  ('HIAB X-CLX 108'),
  ('HIAB X-CLX 112'),
  -- Moyennes
  ('HIAB 128 CLX'),
  ('HIAB X-HiDuo 138'),
  ('HIAB eX.142 HIPRO'),
  ('HIAB 148 CLX'),
  ('HIAB 16 CL'),
  ('HIAB iX.158 HIDUO'),
  ('HIAB X-HiDuo 158'),
  ('HIAB eX.162 HIPRO'),
  ('HIAB X-HiPro 162'),
  ('HIAB 178 CLX'),
  ('HIAB X-HiDuo 188'),
  ('HIAB iX.188 HIDUO'),
  ('HIAB 19 CL'),
  ('HIAB eX.192 HIPRO'),
  ('HIAB X-HiPro 192'),
  ('HIAB 218 CLX'),
  ('HIAB 23 CL'),
  ('HIAB iX.228 HIDUO'),
  ('HIAB X-HiDuo 228'),
  ('HIAB 248 CLX'),
  ('HIAB X-HiPro 232'),
  ('HIAB 288 CLX'),
  ('HIAB X-HiDuo 258'),
  ('HIAB X-HiPro 262'),
  ('HIAB iX.298 HIDUO'),
  ('HIAB X-HiPro 302'),
  -- Lourdes
  ('HIAB X-HiPro 352'),
  ('HIAB X-HiDuo 358'),
  ('HIAB X-HiPro 362'),
  ('HIAB X-HiPro 408'),
  ('HIAB X-HiPro 418'),
  ('HIAB X-HiPro 548'),
  ('HIAB X-HiPro 558'),
  ('HIAB X-HiPro 638'),
  ('HIAB X-HiPro 658'),
  ('HIAB iQ.708 HIPRO'),
  ('HIAB X-HiPro 858'),
  ('HIAB iQ.958 HIPRO'),
  ('HIAB X-HiPro 1058'),
  ('HIAB iQ.1188 HIPRO'),
  -- K-HiPro (drywall / stiff boom)
  ('HIAB K-HiPro 285'),
  ('HIAB K-HiPro 425'),
  ('HIAB K-HiPro 505'),
  ('HIAB K-HiPro 515')
ON CONFLICT (name) DO NOTHING;
