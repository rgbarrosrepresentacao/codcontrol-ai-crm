-- Create a partial unique index to guarantee idempotency (at most one pending/processing attempt per conversation)
CREATE UNIQUE INDEX IF NOT EXISTS idx_followup_attempts_unique_active 
ON followup_attempts(user_id, conversation_id) 
WHERE status IN ('pending', 'processing');
