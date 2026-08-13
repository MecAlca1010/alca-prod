-- Run this in Supabase SQL Editor to allow decimal quantities
ALTER TABLE component_items
  ALTER COLUMN quantity TYPE NUMERIC(12, 4)
  USING quantity::numeric;

ALTER TABLE project_components
  ALTER COLUMN quantity TYPE NUMERIC(12, 4)
  USING quantity::numeric;
