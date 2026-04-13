-- ============================================================
-- CRM PREMIUM - INTELIGÊNCIA E KANBAN (v2)
-- Adiciona campos para rastreamento de temperatura e comportamento
-- ============================================================

-- Adicionar novos campos na tabela contacts
ALTER TABLE public.contacts 
ADD COLUMN IF NOT EXISTS lead_temperature INTEGER DEFAULT 0,          -- 0-100 (Frio a Quente)
ADD COLUMN IF NOT EXISTS ai_last_action TEXT,                         -- Última ação da IA
ADD COLUMN IF NOT EXISTS last_stage_change_at TIMESTAMPTZ DEFAULT now(), -- Quando mudou de etapa
ADD COLUMN IF NOT EXISTS interaction_count INTEGER DEFAULT 0;         -- Contador de interações

-- Comentários para documentação
COMMENT ON COLUMN public.contacts.lead_temperature IS 'Temperatura do lead baseada em comportamento e intenção (0-100)';
COMMENT ON COLUMN public.contacts.ai_last_action IS 'Descrição curta da última ação executada pela IA para fechar a venda';
COMMENT ON COLUMN public.contacts.last_stage_change_at IS 'Timestamp da última mudança de etapa no funil';
COMMENT ON COLUMN public.contacts.interaction_count IS 'Número total de interações do lead com o sistema';

-- ============================================================
-- NOTA SOBRE A TAG "HUMANO"
-- ============================================================
-- A tag ai_tag = 'HUMANO' já existe na coluna contacts.ai_tag (TEXT).
-- Quando setada, o webhook do WhatsApp (linha 659) para a IA automaticamente.
-- O follow-up também respeita esta tag (HARD_STOP_TAGS).
-- Nenhuma nova coluna de banco é necessária para o Atendimento Humano.
-- ============================================================
