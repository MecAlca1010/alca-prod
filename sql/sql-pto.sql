INSERT INTO stages (name, slug, color, default_duration_days, sort_order)
SELECT 'PTO', 'pto', '#E8A090', 1, 5
WHERE NOT EXISTS (SELECT 1 FROM stages WHERE slug = 'pto');

UPDATE stages SET sort_order = 5, color = '#E8A090', name = 'PTO', default_duration_days = 1
WHERE slug = 'pto';

INSERT INTO stage_resources (stage_slug, resource_id)
VALUES ('pto', 'hors_porte')
ON CONFLICT (stage_slug) DO UPDATE SET resource_id = 'hors_porte';
