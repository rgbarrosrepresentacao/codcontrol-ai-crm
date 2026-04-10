-- ============================================================
-- BLAST (DISPARO INTELIGENTE) - Migration
-- CodControl AI CRM
-- ============================================================

-- Tabela principal de campanhas
CREATE TABLE IF NOT EXISTS blast_campaigns (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    
    -- Mensagem e variações (SPINTAX via array de variações)
    message_variants JSONB NOT NULL DEFAULT '[]', -- [{text: "Oi {{nome}}..."}, {text: "Fala {{nome}}..."}]
    media_url TEXT,          -- URL da mídia (imagem/vídeo/áudio/doc)
    media_type TEXT,         -- 'image' | 'video' | 'audio' | 'document'
    media_caption TEXT,      -- Legenda da mídia (pode ter variáveis)
    
    -- Configuração de instâncias
    instance_ids JSONB NOT NULL DEFAULT '[]', -- UUIDs das instâncias a usar (rotação automática)
    
    -- Controle de delay humanizado (segundos)
    delay_min INTEGER NOT NULL DEFAULT 30,
    delay_max INTEGER NOT NULL DEFAULT 90,
    
    -- Modo de aquecimento (warming)
    warming_enabled BOOLEAN NOT NULL DEFAULT false,
    warming_day INTEGER NOT NULL DEFAULT 1,       -- dia atual do aquecimento
    warming_limit INTEGER NOT NULL DEFAULT 20,    -- limite de msgs no dia atual
    
    -- Status da campanha
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'running', 'paused', 'completed', 'cancelled')),
    
    -- Métricas em tempo real
    total_contacts INTEGER NOT NULL DEFAULT 0,
    sent_count INTEGER NOT NULL DEFAULT 0,
    delivered_count INTEGER NOT NULL DEFAULT 0,
    read_count INTEGER NOT NULL DEFAULT 0,
    failed_count INTEGER NOT NULL DEFAULT 0,
    opted_out_count INTEGER NOT NULL DEFAULT 0,
    
    -- Controle de segurança automático
    auto_pause_on_fail_rate FLOAT NOT NULL DEFAULT 0.15, -- pausa se +15% falhar
    
    -- Timestamps
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tabela de contatos da campanha (importados via CSV ou banco interno)
CREATE TABLE IF NOT EXISTS blast_contacts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    campaign_id UUID NOT NULL REFERENCES blast_campaigns(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    
    -- Dados do contato
    phone TEXT NOT NULL,          -- número no formato: 5511999999999
    name TEXT,                    -- para variável {{nome}}
    variables JSONB DEFAULT '{}', -- variáveis extras: {{empresa}}, {{cidade}}, etc.
    
    -- Opt-in / Opt-out
    opted_in BOOLEAN NOT NULL DEFAULT true,
    opted_out BOOLEAN NOT NULL DEFAULT false,
    opted_out_at TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tabela de fila de envio (o "motor" do sistema)
CREATE TABLE IF NOT EXISTS blast_queue (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    campaign_id UUID NOT NULL REFERENCES blast_campaigns(id) ON DELETE CASCADE,
    contact_id UUID NOT NULL REFERENCES blast_contacts(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    instance_id UUID NOT NULL REFERENCES whatsapp_instances(id) ON DELETE CASCADE,
    
    -- Mensagem resolvida (variáveis já substituídas, variante já escolhida)
    resolved_message TEXT NOT NULL,
    media_url TEXT,
    media_type TEXT,
    media_caption TEXT,
    
    -- Status do item na fila
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'sent', 'failed', 'opted_out', 'skipped')),
    
    -- Controle de retry
    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 3,
    last_error TEXT,
    
    -- Agendamento (para dar suporte a delays)
    scheduled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), -- quando está liberado para envio
    sent_at TIMESTAMPTZ,
    
    -- Rastreio de entrega (via webhook)
    whatsapp_message_id TEXT,  -- ID retornado pela Evolution API
    delivered_at TIMESTAMPTZ,
    read_at TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices de performance para o cron job
CREATE INDEX IF NOT EXISTS idx_blast_queue_status_scheduled 
    ON blast_queue(status, scheduled_at) 
    WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_blast_queue_campaign 
    ON blast_queue(campaign_id, status);

CREATE INDEX IF NOT EXISTS idx_blast_contacts_campaign 
    ON blast_contacts(campaign_id);

CREATE INDEX IF NOT EXISTS idx_blast_campaigns_user 
    ON blast_campaigns(user_id, status);

-- Gatilho para atualizar `updated_at` nas campanhas
CREATE OR REPLACE FUNCTION update_blast_campaign_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_blast_campaign_updated_at
    BEFORE UPDATE ON blast_campaigns
    FOR EACH ROW EXECUTE FUNCTION update_blast_campaign_timestamp();

-- RLS: Somente o admin do sistema acessa (user_id check + is_admin)
ALTER TABLE blast_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE blast_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE blast_queue ENABLE ROW LEVEL SECURITY;

-- Políticas: usuário só vê seus próprios dados
CREATE POLICY "blast_campaigns_owner" ON blast_campaigns
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "blast_contacts_owner" ON blast_contacts
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "blast_queue_owner" ON blast_queue
    FOR ALL USING (auth.uid() = user_id);
