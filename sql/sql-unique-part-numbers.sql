-- Ensure unique part numbers (safe if already unique)
CREATE UNIQUE INDEX IF NOT EXISTS sub_components_part_number_uidx ON sub_components (part_number);
CREATE UNIQUE INDEX IF NOT EXISTS components_part_number_uidx ON components (part_number);
