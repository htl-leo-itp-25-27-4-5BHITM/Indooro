-- Release gate for the customer market list (change add-store-release-gate).
-- Additive: every existing store stays visible (DEFAULT TRUE). New stores are created with released = false
-- by the application and appear in /api/mobile/stores only after an admin releases them.
ALTER TABLE stores ADD COLUMN released BOOLEAN NOT NULL DEFAULT TRUE;
