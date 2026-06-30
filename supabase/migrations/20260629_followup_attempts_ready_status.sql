-- Drop old check constraint if it exists
ALTER TABLE followup_attempts DROP CONSTRAINT IF EXISTS chk_status;

-- Re-add check constraint including 'ready'
ALTER TABLE followup_attempts ADD CONSTRAINT chk_status CHECK (status IN ('pending', 'processing', 'ready', 'sent', 'skipped', 'failed', 'cancelled'));
