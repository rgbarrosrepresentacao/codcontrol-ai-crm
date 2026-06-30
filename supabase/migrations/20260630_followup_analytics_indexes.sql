-- Create performance indexes for the follow-up analytics queries
CREATE INDEX IF NOT EXISTS idx_followup_attempts_user_created ON followup_attempts(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_followup_attempts_user_status_created ON followup_attempts(user_id, status, created_at DESC);
