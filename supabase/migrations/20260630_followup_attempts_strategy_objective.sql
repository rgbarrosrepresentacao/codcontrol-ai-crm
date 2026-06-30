-- Add strategy and objective columns to followup_attempts
ALTER TABLE followup_attempts ADD COLUMN IF NOT EXISTS strategy TEXT;
ALTER TABLE followup_attempts ADD COLUMN IF NOT EXISTS objective TEXT;

-- Drop constraints if they exist to avoid duplication
ALTER TABLE followup_attempts DROP CONSTRAINT IF EXISTS chk_followup_attempts_strategy;
ALTER TABLE followup_attempts DROP CONSTRAINT IF EXISTS chk_followup_attempts_objective;

-- Add constraints
ALTER TABLE followup_attempts ADD CONSTRAINT chk_followup_attempts_strategy CHECK (strategy IN ('muito_leve', 'leve', 'consultivo', 'persuasivo'));
ALTER TABLE followup_attempts ADD CONSTRAINT chk_followup_attempts_objective CHECK (objective IN ('recuperar_venda', 'tirar_duvida', 'agendar_atendimento', 'confirmar_pagamento', 'reativar_cliente', 'personalizado'));
