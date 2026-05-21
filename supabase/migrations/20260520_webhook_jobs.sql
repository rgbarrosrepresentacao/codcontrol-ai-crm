CREATE TABLE IF NOT EXISTS webhook_jobs (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  correlation_id  TEXT        NOT NULL,
  provider        TEXT        NOT NULL,           -- 'evolution' | 'meta'
  instance_name   TEXT,                           -- nome da instância
  event_type      TEXT        NOT NULL,           -- 'messages.upsert', 'messages.update', etc.
  provider_event_id TEXT,                         -- ID da mensagem/evento no provedor (chave de dedup)
  payload         JSONB       NOT NULL,           -- payload completo recebido
  status          TEXT        NOT NULL DEFAULT 'pending', -- pending | processing | done | failed
  attempts        INTEGER     NOT NULL DEFAULT 0,
  max_attempts    INTEGER     NOT NULL DEFAULT 3,
  locked_at       TIMESTAMPTZ,
  locked_by       TEXT,
  last_error      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at    TIMESTAMPTZ,

  -- Idempotência: mesmo evento do mesmo provedor não é inserido duas vezes
  UNIQUE (provider, provider_event_id)
);

-- Índices para otimização do worker
CREATE INDEX IF NOT EXISTS idx_webhook_jobs_status_created
  ON webhook_jobs(status, created_at)
  WHERE status IN ('pending', 'processing');

CREATE INDEX IF NOT EXISTS idx_webhook_jobs_created_at 
  ON webhook_jobs(created_at);

-- Otimização e limpeza da tabela de deduplicação antiga
CREATE INDEX IF NOT EXISTS idx_webhook_dedup_created_at
  ON webhook_deduplication(created_at);

-- Habilita RLS por segurança
ALTER TABLE webhook_jobs ENABLE ROW LEVEL SECURITY;

-- Função PostgreSQL para lock atômico concorrente (SKIP LOCKED)
CREATE OR REPLACE FUNCTION lock_webhook_jobs(worker_id TEXT, max_jobs INT)
RETURNS SETOF webhook_jobs AS $$
DECLARE
  job_ids UUID[];
BEGIN
  -- Seleciona e trava os IDs dos jobs usando SKIP LOCKED para evitar concorrência
  SELECT ARRAY(
    SELECT id
    FROM webhook_jobs
    WHERE (status = 'pending' AND attempts < max_attempts)
       OR (status = 'processing' AND locked_at < NOW() - INTERVAL '5 minutes' AND attempts < max_attempts)
    ORDER BY created_at ASC
    LIMIT max_jobs
    FOR UPDATE SKIP LOCKED
  ) INTO job_ids;

  -- Se não achou nenhum job, retorna vazio
  IF array_length(job_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  -- Atualiza o status e os campos de lock para os jobs selecionados
  RETURN QUERY
  UPDATE webhook_jobs
  SET status = 'processing',
      locked_at = NOW(),
      locked_by = worker_id,
      attempts = attempts + 1
  WHERE id = ANY(job_ids)
  RETURNING *;
END;
$$ LANGUAGE plpgsql;
