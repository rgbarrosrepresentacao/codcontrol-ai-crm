-- Create followup_settings table
CREATE TABLE IF NOT EXISTS followup_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    enabled BOOLEAN NOT NULL DEFAULT false,
    delay_minutes INTEGER NOT NULL DEFAULT 1440,
    max_attempts INTEGER NOT NULL DEFAULT 3,
    allowed_start_time TIME NOT NULL DEFAULT '08:00',
    allowed_end_time TIME NOT NULL DEFAULT '18:00',
    allowed_days INTEGER[] NOT NULL DEFAULT '{1,2,3,4,5}',
    allowed_statuses TEXT[] NOT NULL DEFAULT '{}',
    stop_on_reply BOOLEAN NOT NULL DEFAULT true,
    stop_on_human_takeover BOOLEAN NOT NULL DEFAULT true,
    stop_on_sale BOOLEAN NOT NULL DEFAULT true,
    stop_on_status_change BOOLEAN NOT NULL DEFAULT true,
    strategy TEXT NOT NULL DEFAULT 'consultivo',
    objective TEXT NOT NULL DEFAULT 'recuperar_venda',
    custom_prompt TEXT,
    use_ai BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(user_id),
    CONSTRAINT chk_delay_minutes CHECK (delay_minutes >= 5),
    CONSTRAINT chk_max_attempts CHECK (max_attempts BETWEEN 1 AND 5),
    CONSTRAINT chk_strategy CHECK (strategy IN ('muito_leve', 'leve', 'consultivo', 'persuasivo')),
    CONSTRAINT chk_objective CHECK (objective IN ('recuperar_venda', 'tirar_duvida', 'agendar_atendimento', 'confirmar_pagamento', 'reativar_cliente', 'personalizado'))
);

-- Enable RLS for followup_settings
ALTER TABLE followup_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policy for followup_settings
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'followup_settings' AND policyname = 'Users can access their own followup_settings'
    ) THEN
        CREATE POLICY "Users can access their own followup_settings" ON followup_settings FOR ALL USING (auth.uid() = user_id);
    END IF;
END $$;

-- Create followup_attempts table
CREATE TABLE IF NOT EXISTS followup_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    attempt_number INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    scheduled_for TIMESTAMPTZ,
    sent_at TIMESTAMPTZ,
    message_id UUID REFERENCES messages(id),
    generated_message TEXT,
    reason TEXT,
    silence_reason TEXT,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_status CHECK (status IN ('pending', 'processing', 'sent', 'skipped', 'failed', 'cancelled')),
    CONSTRAINT chk_attempt_number CHECK (attempt_number >= 1)
);

-- Enable RLS for followup_attempts
ALTER TABLE followup_attempts ENABLE ROW LEVEL SECURITY;

-- RLS Policy for followup_attempts
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'followup_attempts' AND policyname = 'Users can access their own followup_attempts'
    ) THEN
        CREATE POLICY "Users can access their own followup_attempts" ON followup_attempts FOR ALL USING (auth.uid() = user_id);
    END IF;
END $$;

-- Indexes for followup_attempts
CREATE INDEX IF NOT EXISTS idx_followup_attempts_user_status_schedule ON followup_attempts(user_id, status, scheduled_for);
CREATE INDEX IF NOT EXISTS idx_followup_attempts_contact_created ON followup_attempts(contact_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_followup_attempts_conv_created ON followup_attempts(conversation_id, created_at DESC);

-- Create followup_events table
CREATE TABLE IF NOT EXISTS followup_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    attempt_id UUID REFERENCES followup_attempts(id) ON DELETE SET NULL,
    event_type TEXT NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS for followup_events
ALTER TABLE followup_events ENABLE ROW LEVEL SECURITY;

-- RLS Policy for followup_events
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'followup_events' AND policyname = 'Users can access their own followup_events'
    ) THEN
        CREATE POLICY "Users can access their own followup_events" ON followup_events FOR ALL USING (auth.uid() = user_id);
    END IF;
END $$;

-- Indexes for followup_events
CREATE INDEX IF NOT EXISTS idx_followup_events_user_created ON followup_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_followup_events_type_created ON followup_events(event_type, created_at DESC);
