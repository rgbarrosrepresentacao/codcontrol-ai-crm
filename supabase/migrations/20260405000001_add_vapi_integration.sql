-- Adiciona suporte à integração Vapi.ai (ligações automáticas de IA)
-- Esta coluna é usada apenas internamente pelo admin para teste antes de liberar para usuários

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS vapi_api_key TEXT DEFAULT NULL;

COMMENT ON COLUMN profiles.vapi_api_key IS 'Chave de API da Vapi.ai para chamadas telefônicas automáticas de IA. Exclusivo admin por enquanto.';
