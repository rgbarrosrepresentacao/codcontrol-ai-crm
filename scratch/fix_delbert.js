const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = 'https://jzbsutrmprzfuvaripwb.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6YnN1dHJtcHJ6ZnV2YXJpcHdiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjE1MTI3NCwiZXhwIjoyMDg3NzI3Mjc0fQ.y0Pi1AGdlXSuR092lZ8w4VeuPmC4DF2_9DwgsPaVI3U'

const supabase = createClient(supabaseUrl, supabaseKey)
const email = 'delbertvendas@gmail.com';

async function fixUser() {
    console.log(`Liberando acesso para: ${email}`);
    
    const { data: user, error: fetchError } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', email)
        .single();

    if (fetchError) {
        console.error('Usuário não encontrado:', fetchError.message);
        return;
    }

    const { error: updateError } = await supabase
        .from('profiles')
        .update({
            stripe_subscription_status: 'active',
            is_active: true
        })
        .eq('id', user.id);

    if (updateError) {
        console.error('Erro ao atualizar:', updateError.message);
    } else {
        console.log('✅ Usuário liberado com sucesso!');
    }
}

fixUser();
