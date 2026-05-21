-- messages
CREATE INDEX IF NOT EXISTS idx_messages_contact_id ON messages(contact_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_user_id ON messages(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at DESC);

-- conversations  
CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_instance_id ON conversations(instance_id);
CREATE INDEX IF NOT EXISTS idx_conversations_last_message_at ON conversations(last_message_at DESC);

-- contacts
CREATE INDEX IF NOT EXISTS idx_contacts_user_id ON contacts(user_id);
CREATE INDEX IF NOT EXISTS idx_contacts_instance_id ON contacts(instance_id);
CREATE INDEX IF NOT EXISTS idx_contacts_whatsapp_id ON contacts(whatsapp_id);

-- whatsapp_instances
CREATE INDEX IF NOT EXISTS idx_whatsapp_instances_user_id ON whatsapp_instances(user_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_instances_status ON whatsapp_instances(status);

-- Ensure RLS is enabled
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE meta_message_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_configurations ENABLE ROW LEVEL SECURITY;

-- Creating policies safely
DO $$ 
BEGIN
    -- Messages
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'messages' AND policyname = 'Users can access their own messages'
    ) THEN
        CREATE POLICY "Users can access their own messages" ON messages FOR ALL USING (auth.uid() = user_id);
    END IF;

    -- Conversations
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'conversations' AND policyname = 'Users can access their own conversations'
    ) THEN
        CREATE POLICY "Users can access their own conversations" ON conversations FOR ALL USING (auth.uid() = user_id);
    END IF;

    -- Contacts
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'contacts' AND policyname = 'Users can access their own contacts'
    ) THEN
        CREATE POLICY "Users can access their own contacts" ON contacts FOR ALL USING (auth.uid() = user_id);
    END IF;

    -- Whatsapp instances
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'whatsapp_instances' AND policyname = 'Users can access their own whatsapp_instances'
    ) THEN
        CREATE POLICY "Users can access their own whatsapp_instances" ON whatsapp_instances FOR ALL USING (auth.uid() = user_id);
    END IF;
    
    -- Whatsapp templates
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'whatsapp_templates' AND policyname = 'Users can access their own whatsapp_templates'
    ) THEN
        CREATE POLICY "Users can access their own whatsapp_templates" ON whatsapp_templates FOR ALL USING (auth.uid() = user_id);
    END IF;

    -- Meta message logs
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'meta_message_logs' AND policyname = 'Users can access their own meta logs'
    ) THEN
        CREATE POLICY "Users can access their own meta logs" ON meta_message_logs FOR ALL USING (auth.uid() = user_id);
    END IF;

    -- AI configurations
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'ai_configurations' AND policyname = 'Users can access their own ai config'
    ) THEN
        CREATE POLICY "Users can access their own ai config" ON ai_configurations FOR ALL USING (auth.uid() = user_id);
    END IF;
END $$;
