-- Up Migration: 20260630_followup_adaptive_learning.sql

-- 1. Tabela de Perfis de Aprendizado
CREATE TABLE IF NOT EXISTS public.followup_learning_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    best_strategy TEXT,
    best_objective TEXT,
    best_hour INTEGER,
    best_day INTEGER,
    best_attempt_number INTEGER,
    dominant_silence_reason TEXT,
    average_reply_rate NUMERIC(5,2) DEFAULT 0.00,
    total_sent INTEGER DEFAULT 0,
    total_replied INTEGER DEFAULT 0,
    total_sales_recovered INTEGER DEFAULT 0,
    confidence_score INTEGER DEFAULT 0,
    learning_summary TEXT,
    recommendations JSONB NOT NULL DEFAULT '[]'::jsonb,
    message_patterns JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT followup_learning_profiles_user_id_key UNIQUE (user_id)
);

-- Habilitar RLS em followup_learning_profiles
ALTER TABLE public.followup_learning_profiles ENABLE ROW LEVEL SECURITY;

-- Criar políticas RLS
CREATE POLICY "Users can view their own learning profile"
    ON public.followup_learning_profiles
    FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own learning profile"
    ON public.followup_learning_profiles
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own learning profile"
    ON public.followup_learning_profiles
    FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own learning profile"
    ON public.followup_learning_profiles
    FOR DELETE
    USING (auth.uid() = user_id);

-- Índices para followup_learning_profiles
CREATE INDEX IF NOT EXISTS idx_followup_learning_profiles_user_id ON public.followup_learning_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_followup_learning_profiles_updated_at ON public.followup_learning_profiles(updated_at DESC);


-- 2. Tabela de Performance de Mensagens
CREATE TABLE IF NOT EXISTS public.followup_message_performance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    attempt_id UUID REFERENCES public.followup_attempts(id) ON DELETE CASCADE,
    conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE,
    contact_id UUID REFERENCES public.contacts(id) ON DELETE CASCADE,
    attempt_number INTEGER,
    silence_reason TEXT,
    strategy TEXT,
    objective TEXT,
    message_hash TEXT,
    message_length INTEGER,
    sent_at TIMESTAMPTZ,
    replied BOOLEAN NOT NULL DEFAULT false,
    reply_at TIMESTAMPTZ,
    converted BOOLEAN NOT NULL DEFAULT false,
    converted_at TIMESTAMPTZ,
    reply_time_minutes INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Habilitar RLS em followup_message_performance
ALTER TABLE public.followup_message_performance ENABLE ROW LEVEL SECURITY;

-- Criar políticas RLS
CREATE POLICY "Users can view their own message performance"
    ON public.followup_message_performance
    FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own message performance"
    ON public.followup_message_performance
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own message performance"
    ON public.followup_message_performance
    FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own message performance"
    ON public.followup_message_performance
    FOR DELETE
    USING (auth.uid() = user_id);

-- Índices para followup_message_performance
CREATE INDEX IF NOT EXISTS idx_followup_msg_perf_user_sent ON public.followup_message_performance(user_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_followup_msg_perf_user_replied ON public.followup_message_performance(user_id, replied, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_followup_msg_perf_user_converted ON public.followup_message_performance(user_id, converted, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_followup_msg_perf_attempt_id ON public.followup_message_performance(attempt_id);
