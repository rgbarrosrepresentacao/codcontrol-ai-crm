-- ============================================================
-- BLAST (DISPARO INTELIGENTE) - Meta Templates Migration
-- CodControl AI CRM
-- ============================================================

-- Adiciona colunas para templates oficiais da Meta em blast_campaigns
ALTER TABLE blast_campaigns ADD COLUMN IF NOT EXISTS template_name TEXT;
ALTER TABLE blast_campaigns ADD COLUMN IF NOT EXISTS template_language TEXT DEFAULT 'pt_BR';
ALTER TABLE blast_campaigns ADD COLUMN IF NOT EXISTS template_variable_mappings JSONB DEFAULT '[]';

-- Adiciona colunas para templates oficiais da Meta em blast_queue
ALTER TABLE blast_queue ADD COLUMN IF NOT EXISTS template_name TEXT;
ALTER TABLE blast_queue ADD COLUMN IF NOT EXISTS template_language TEXT DEFAULT 'pt_BR';
ALTER TABLE blast_queue ADD COLUMN IF NOT EXISTS template_variables JSONB DEFAULT '[]';
