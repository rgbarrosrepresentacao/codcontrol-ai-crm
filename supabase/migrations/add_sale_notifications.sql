-- Migração: Adicionar suporte a alertas de venda por WhatsApp
-- Execute este script no SQL Editor do Supabase

ALTER TABLE profiles
    ADD COLUMN IF NOT EXISTS notification_whatsapp TEXT DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS sale_notifications_enabled BOOLEAN DEFAULT FALSE;

-- Comentários para documentação
COMMENT ON COLUMN profiles.notification_whatsapp IS 'Número WhatsApp do dono da loja para receber alertas de venda (sem +55, apenas dígitos)';
COMMENT ON COLUMN profiles.sale_notifications_enabled IS 'Se true, envia alerta no WhatsApp do dono sempre que um pedido for marcado como FECHADO';
