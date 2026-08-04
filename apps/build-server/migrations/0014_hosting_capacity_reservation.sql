-- Aggregate hosting admission reservations. A row is held for each accepted
-- build/service and released when the build fails or the hosted service stops
-- or is removed.
CREATE TABLE IF NOT EXISTS hosting_capacity_reservation (
  build_id UUID PRIMARY KEY,
  app_name TEXT NOT NULL,
  tier TEXT NOT NULL,
  cpu_millicores INTEGER NOT NULL,
  memory_mi INTEGER NOT NULL,
  replicas INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS hosting_capacity_reservation_tier_idx
  ON hosting_capacity_reservation (tier);
