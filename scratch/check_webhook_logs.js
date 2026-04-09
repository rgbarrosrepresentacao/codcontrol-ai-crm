const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = 'https://jzbsutrmprzfuvaripwb.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6YnN1dHJtcHJ6ZnV2YXJpcHdiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjE1MTI3NCwiZXhwIjoyMDg3NzI3Mjc0fQ.y0Pi1AGdlXSuR092lZ8w4VeuPmC4DF2_9DwgsPaVI3U'

const supabase = createClient(supabaseUrl, supabaseKey)

async function checkLogs() {
    console.log('--- Verificando Webhook Logs ---')
    const { data, error } = await supabase
        .from('webhook_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);

    if (error) {
        console.error('Erro ao acessar webhook_logs:', error.message);
        return;
    }

    console.log('Últimos logs:', JSON.stringify(data, null, 2));
}

checkLogs();
