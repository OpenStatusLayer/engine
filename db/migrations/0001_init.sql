-- OpenStatusLayer initial schema
-- Core idea: services form a directed dependency graph. Health checks feed
-- per-service status; the engine propagates degradation across edges to derive
-- impacted-service status (blast radius).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE systems (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key         text NOT NULL UNIQUE,
  name        text NOT NULL,
  description text,
  is_public   boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE services (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  system_id   uuid REFERENCES systems(id) ON DELETE SET NULL,
  key         text NOT NULL UNIQUE,
  name        text NOT NULL,
  description text,
  check_url   text,
  check_type  text NOT NULL DEFAULT 'http' CHECK (check_type IN ('http','tcp','push')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Directed edge: service_id depends on depends_on_id.
CREATE TABLE dependencies (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id    uuid NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  depends_on_id uuid NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  kind          text NOT NULL DEFAULT 'hard' CHECK (kind IN ('hard','soft')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT no_self_dependency CHECK (service_id <> depends_on_id),
  UNIQUE (service_id, depends_on_id)
);
CREATE INDEX idx_dependencies_service ON dependencies(service_id);
CREATE INDEX idx_dependencies_depends_on ON dependencies(depends_on_id);

CREATE TABLE check_results (
  id          bigserial PRIMARY KEY,
  service_id  uuid NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  source      text NOT NULL DEFAULT 'synthetic' CHECK (source IN ('synthetic','push')),
  status      text NOT NULL CHECK (status IN ('operational','degraded','down')),
  latency_ms  integer,
  detail      jsonb NOT NULL DEFAULT '{}'::jsonb,
  observed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_check_results_service_time ON check_results(service_id, observed_at DESC);

CREATE TABLE status_events (
  id            bigserial PRIMARY KEY,
  service_id    uuid NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  direct_status text NOT NULL CHECK (direct_status IN ('operational','degraded','down')),
  derived_status text NOT NULL CHECK (derived_status IN ('operational','degraded','down')),
  reason        text,
  blast_radius  jsonb NOT NULL DEFAULT '[]'::jsonb,
  computed_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_status_events_service_time ON status_events(service_id, computed_at DESC);

CREATE TABLE incidents (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  system_id   uuid REFERENCES systems(id) ON DELETE SET NULL,
  title       text NOT NULL,
  body        text,
  severity    text NOT NULL DEFAULT 'minor' CHECK (severity IN ('minor','major','critical')),
  status      text NOT NULL DEFAULT 'investigating' CHECK (status IN ('investigating','identified','monitoring','resolved')),
  started_at  timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
CREATE INDEX idx_incidents_system ON incidents(system_id, started_at DESC);
