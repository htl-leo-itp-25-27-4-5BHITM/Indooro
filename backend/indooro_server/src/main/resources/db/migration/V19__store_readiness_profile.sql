-- Coverage profile of the store readiness check (change add-readiness-coverage-profiles).
-- Additive: every existing store keeps the unchanged default rule "market".
ALTER TABLE stores ADD COLUMN readiness_profile VARCHAR(20) NOT NULL DEFAULT 'market';
