-- 1. Adicionar coluna de status específica para Kiwify na tabela profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS kiwify_subscription_status text;

-- 2. Criar tabela de logs para webhooks (Segurança e Auditoria)
CREATE TABLE IF NOT EXISTS public.webhook_logs (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at timestamp with time zone DEFAULT now(),
    provider text not null, -- 'stripe' ou 'kiwify'
    payload jsonb not null,
    user_id uuid, -- pode ser nulo se o usuário não existir no momento
    user_email text,
    status text,
    event_type text
);

-- 3. Habilitar RLS para webhook_logs (opcional, mas seguro)
ALTER TABLE public.webhook_logs ENABLE ROW LEVEL SECURITY;

-- 4. Criar política para permitir que o admin (service_role) insira logs
-- Nota: O service_role ignora RLS por padrão, então isso é mais para documentação.

-- COMENTÁRIO: Execute este script no SQL Editor do seu Dashboard do Supabase.
