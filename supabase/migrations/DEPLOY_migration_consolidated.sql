-- ============================================================
-- CODCONTROL AI CRM — SCRIPT CONSOLIDADO DE MIGRATIONS
-- Blocos 1–7 (Pós-desenvolvimento)
-- ============================================================
-- INSTRUÇÕES:
--   1. Executar INTEIRO de uma só vez no Supabase SQL Editor
--   2. Usar opção "Run" (não "Run selected")
--   3. Aguardar conclusão antes de fazer o deploy
--   4. Se ocorrer erro em qualquer etapa, reportar antes de continuar
--
-- SEGURANÇA: Todas as operações usam IF NOT EXISTS / OR REPLACE
--            Não há risco de perda de dados existentes.
-- ============================================================


-- ============================================================
-- BLOCO 1: COLUNAS PARA BLAST COM TEMPLATES OFICIAIS DA META
-- Fonte: 20260520_blast_meta_template.sql
-- ============================================================

-- Adiciona colunas de template à tabela de campanhas
ALTER TABLE blast_campaigns ADD COLUMN IF NOT EXISTS template_name TEXT;
ALTER TABLE blast_campaigns ADD COLUMN IF NOT EXISTS template_language TEXT DEFAULT 'pt_BR';
ALTER TABLE blast_campaigns ADD COLUMN IF NOT EXISTS template_variable_mappings JSONB DEFAULT '[]';

-- Adiciona colunas de template à fila de envio
ALTER TABLE blast_queue ADD COLUMN IF NOT EXISTS template_name TEXT;
ALTER TABLE blast_queue ADD COLUMN IF NOT EXISTS template_language TEXT DEFAULT 'pt_BR';
ALTER TABLE blast_queue ADD COLUMN IF NOT EXISTS template_variables JSONB DEFAULT '[]';


-- ============================================================
-- BLOCO 2: ÍNDICES DE PERFORMANCE + RLS EM TABELAS CRÍTICAS
-- Fonte: 20260520_indexes_and_rls.sql
-- ============================================================

-- Índices da tabela messages
CREATE INDEX IF NOT EXISTS idx_messages_contact_id      ON messages(contact_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_user_id         ON messages(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at      ON messages(created_at DESC);

-- Índices da tabela conversations
CREATE INDEX IF NOT EXISTS idx_conversations_user_id         ON conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_instance_id     ON conversations(instance_id);
CREATE INDEX IF NOT EXISTS idx_conversations_last_message_at ON conversations(last_message_at DESC);

-- Índices da tabela contacts
CREATE INDEX IF NOT EXISTS idx_contacts_user_id      ON contacts(user_id);
CREATE INDEX IF NOT EXISTS idx_contacts_instance_id  ON contacts(instance_id);
CREATE INDEX IF NOT EXISTS idx_contacts_whatsapp_id  ON contacts(whatsapp_id);

-- Índices da tabela whatsapp_instances
CREATE INDEX IF NOT EXISTS idx_whatsapp_instances_user_id ON whatsapp_instances(user_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_instances_status  ON whatsapp_instances(status);

-- Habilitar RLS nas tabelas críticas (idempotente — seguro rodar mesmo se já estiver ativo)
ALTER TABLE messages           ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations      ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts           ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE meta_message_logs  ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_configurations  ENABLE ROW LEVEL SECURITY;

-- Criar policies de acesso (ignoradas se já existirem)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'messages' AND policyname = 'Users can access their own messages'
    ) THEN
        CREATE POLICY "Users can access their own messages" ON messages FOR ALL USING (auth.uid() = user_id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'conversations' AND policyname = 'Users can access their own conversations'
    ) THEN
        CREATE POLICY "Users can access their own conversations" ON conversations FOR ALL USING (auth.uid() = user_id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'contacts' AND policyname = 'Users can access their own contacts'
    ) THEN
        CREATE POLICY "Users can access their own contacts" ON contacts FOR ALL USING (auth.uid() = user_id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'whatsapp_instances' AND policyname = 'Users can access their own whatsapp_instances'
    ) THEN
        CREATE POLICY "Users can access their own whatsapp_instances" ON whatsapp_instances FOR ALL USING (auth.uid() = user_id);
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'whatsapp_templates' AND policyname = 'Users can access their own whatsapp_templates'
    ) THEN
        CREATE POLICY "Users can access their own whatsapp_templates" ON whatsapp_templates FOR ALL USING (auth.uid() = user_id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'meta_message_logs' AND policyname = 'Users can access their own meta logs'
    ) THEN
        CREATE POLICY "Users can access their own meta logs" ON meta_message_logs FOR ALL USING (auth.uid() = user_id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'ai_configurations' AND policyname = 'Users can access their own ai config'
    ) THEN
        CREATE POLICY "Users can access their own ai config" ON ai_configurations FOR ALL USING (auth.uid() = user_id);
    END IF;
END $$;


-- ============================================================
-- BLOCO 3: TABELA webhook_jobs + LOCK ATÔMICO (RPC)
-- Fonte: 20260520_webhook_jobs.sql
-- ============================================================

-- Tabela da fila de jobs de webhook (processamento assíncrono)
CREATE TABLE IF NOT EXISTS webhook_jobs (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  correlation_id    TEXT        NOT NULL,
  provider          TEXT        NOT NULL,           -- 'evolution' | 'meta'
  instance_name     TEXT,                           -- nome da instância
  event_type        TEXT        NOT NULL,           -- 'messages.upsert', 'messages.update', etc.
  provider_event_id TEXT,                           -- ID da mensagem/evento no provedor (chave de dedup)
  payload           JSONB       NOT NULL,           -- payload completo recebido
  status            TEXT        NOT NULL DEFAULT 'pending', -- pending | processing | done | failed
  attempts          INTEGER     NOT NULL DEFAULT 0,
  max_attempts      INTEGER     NOT NULL DEFAULT 3,
  locked_at         TIMESTAMPTZ,
  locked_by         TEXT,
  last_error        TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at      TIMESTAMPTZ,

  -- Idempotência: mesmo evento do mesmo provedor não é inserido duas vezes
  UNIQUE (provider, provider_event_id)
);

-- Índices para otimização do worker
CREATE INDEX IF NOT EXISTS idx_webhook_jobs_status_created
  ON webhook_jobs(status, created_at)
  WHERE status IN ('pending', 'processing');

CREATE INDEX IF NOT EXISTS idx_webhook_jobs_created_at 
  ON webhook_jobs(created_at);

-- Índice na tabela de deduplicação legada (só cria se a tabela existir)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'webhook_deduplication'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_webhook_dedup_created_at ON webhook_deduplication(created_at)';
  END IF;
END $$;

-- RLS na tabela de jobs (acesso apenas via service_role nos workers)
ALTER TABLE webhook_jobs ENABLE ROW LEVEL SECURITY;

-- Função PostgreSQL para lock atômico concorrente (FOR UPDATE SKIP LOCKED)
-- Garante que dois workers nunca processem o mesmo job simultaneamente.
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
  SET status     = 'processing',
      locked_at  = NOW(),
      locked_by  = worker_id,
      attempts   = attempts + 1
  WHERE id = ANY(job_ids)
  RETURNING *;
END;
$$ LANGUAGE plpgsql;


-- ============================================================
-- VERIFICAÇÃO FINAL (executar após o script para confirmar)
-- ============================================================
-- SELECT table_name FROM information_schema.tables WHERE table_name = 'webhook_jobs';
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'blast_queue' AND column_name LIKE 'template%';
-- SELECT proname FROM pg_proc WHERE proname = 'lock_webhook_jobs';
