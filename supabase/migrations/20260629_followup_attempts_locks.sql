-- Add locking and processing columns to followup_attempts
ALTER TABLE followup_attempts ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ;
ALTER TABLE followup_attempts ADD COLUMN IF NOT EXISTS locked_by TEXT;
ALTER TABLE followup_attempts ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ;
