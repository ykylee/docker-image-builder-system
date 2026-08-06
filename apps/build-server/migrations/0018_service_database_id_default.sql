-- Align the SQL migration with the Drizzle schema's defaultRandom() primary key.
ALTER TABLE service_database
  ALTER COLUMN id SET DEFAULT gen_random_uuid();
