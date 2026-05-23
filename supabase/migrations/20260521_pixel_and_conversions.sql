-- Supabase Local SQL Migration: Pixel & Conversões

-- 1. Criar tabela facebook_tracking_settings
CREATE TABLE IF NOT EXISTS public.facebook_tracking_settings (
    id UUID PRIMARY KEY DEFAULT public.gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    pixel_id TEXT NOT NULL,
    capi_token_encrypted TEXT NOT NULL,
    test_event_code TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id)
);

-- 2. Criar tabela crm_sales
CREATE TABLE IF NOT EXISTS public.crm_sales (
    id UUID PRIMARY KEY DEFAULT public.gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
    conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
    campaign_id UUID REFERENCES public.campaigns(id) ON DELETE SET NULL,
    product_name TEXT NOT NULL,
    value NUMERIC(10, 2) NOT NULL,
    currency TEXT NOT NULL DEFAULT 'BRL',
    payment_method TEXT NOT NULL CHECK (payment_method IN ('pix', 'cartao', 'entrega', 'boleto')),
    status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'created', 'waiting_delivery')),
    event_id TEXT, -- ID de deduplicação único por venda
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Criar tabela conversion_events
CREATE TABLE IF NOT EXISTS public.conversion_events (
    id UUID PRIMARY KEY DEFAULT public.gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    sale_id UUID REFERENCES public.crm_sales(id) ON DELETE SET NULL,
    contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
    conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
    event_name TEXT NOT NULL, -- e.g. 'Lead' ou 'Purchase'
    pixel_id TEXT, -- pixel_id associado ao envio
    event_id TEXT NOT NULL, -- ID de deduplicação enviado para o Facebook
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('sent', 'pending', 'failed', 'duplicate')),
    error_message TEXT,
    payload JSONB,
    response JSONB,
    sent_at TIMESTAMPTZ, -- Data/Hora de envio efetivo
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Habilitar RLS em todas as tabelas
ALTER TABLE public.facebook_tracking_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversion_events ENABLE ROW LEVEL SECURITY;

-- 5. Criar políticas de acesso (RLS) seguras baseadas em user_id = auth.uid()
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'facebook_tracking_settings' AND policyname = 'Users can access their own facebook_tracking_settings'
    ) THEN
        CREATE POLICY "Users can access their own facebook_tracking_settings" ON public.facebook_tracking_settings FOR ALL USING (auth.uid() = user_id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'crm_sales' AND policyname = 'Users can access their own crm_sales'
    ) THEN
        CREATE POLICY "Users can access their own crm_sales" ON public.crm_sales FOR ALL USING (auth.uid() = user_id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'conversion_events' AND policyname = 'Users can access their own conversion_events'
    ) THEN
        CREATE POLICY "Users can access their own conversion_events" ON public.conversion_events FOR ALL USING (auth.uid() = user_id);
    END IF;
END $$;

-- 6. Índices para performance
CREATE INDEX IF NOT EXISTS idx_crm_sales_user_id ON crm_sales(user_id);
CREATE INDEX IF NOT EXISTS idx_crm_sales_contact_id ON crm_sales(contact_id);
CREATE INDEX IF NOT EXISTS idx_conversion_events_user_id ON conversion_events(user_id);
CREATE INDEX IF NOT EXISTS idx_conversion_events_event_id ON conversion_events(event_id);
