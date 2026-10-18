-- Demo-Zugaenge aus V4 und V5 nur in dev/test aktiv lassen.
-- Flyway-Platzhalter demoAccess: %dev und %test = true (no-op), Standard = false (deaktiviert).
UPDATE user_access_assignments
SET status = 'DISABLED', updated_at = now()
WHERE '${demoAccess}' = 'false'
  AND keycloak_subject IN (
    '11111111-1111-1111-1111-111111111111',
    '22222222-2222-2222-2222-222222222222',
    '33333333-3333-3333-3333-333333333333'
  )
  AND status = 'ACTIVE';
