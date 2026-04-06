-- Adiciona o campo ID do Telefone da Vapi
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS vapi_phone_number_id TEXT DEFAULT NULL;

COMMENT ON COLUMN profiles.vapi_phone_number_id IS 'ID do número de telefone configurado na Vapi para fazer as ligações.';
