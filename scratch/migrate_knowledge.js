
const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = 'https://jzbsutrmprzfuvaripwb.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6YnN1dHJtcHJ6ZnV2YXJpcHdiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjE1MTI3NCwiZXhwIjoyMDg3NzI3Mjc0fQ.y0Pi1AGdlXSuR092lZ8w4VeuPmC4DF2_9DwgsPaVI3U';

const supabase = createClient(supabaseUrl, supabaseKey);

async function migrate() {
    console.log('Adding instance_id to ai_knowledge...');
    const { error } = await supabase.rpc('execute_sql', {
        sql_query: 'ALTER TABLE ai_knowledge ADD COLUMN IF NOT EXISTS instance_id uuid REFERENCES whatsapp_instances(id) ON DELETE CASCADE;'
    });

    if (error) {
        console.error('Error applying migration via RPC:', error);
        console.log('Trying alternative: adding column via direct query if possible...');
        // Note: Supabase service role doesn't always have access to ALTER TABLE via normal API
        // if execute_sql function doesn't exist.
    } else {
        console.log('Migration applied successfully!');
    }
}

migrate();
