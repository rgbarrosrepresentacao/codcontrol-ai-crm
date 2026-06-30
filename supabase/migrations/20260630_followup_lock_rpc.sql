-- Create PostgreSQL function to lock pending follow-up attempts atomically (SKIP LOCKED)
CREATE OR REPLACE FUNCTION lock_followup_attempts(worker_id TEXT, max_attempts_to_lock INT)
RETURNS SETOF followup_attempts AS $$
DECLARE
  attempt_ids UUID[];
BEGIN
  -- Select and lock attempt IDs using SKIP LOCKED to prevent concurrent workers from processing the same attempts
  SELECT ARRAY(
    SELECT id
    FROM followup_attempts
    WHERE (status = 'pending' AND scheduled_for <= NOW())
       OR (status = 'processing' AND locked_at < NOW() - INTERVAL '5 minutes')
    ORDER BY scheduled_for ASC
    LIMIT max_attempts_to_lock
    FOR UPDATE SKIP LOCKED
  ) INTO attempt_ids;

  -- If no attempts found, return empty
  IF array_length(attempt_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  -- Update status and locking fields for the selected attempts
  RETURN QUERY
  UPDATE followup_attempts
  SET status = 'processing',
      locked_at = NOW(),
      locked_by = worker_id
  WHERE id = ANY(attempt_ids)
  RETURNING *;
END;
$$ LANGUAGE plpgsql;
