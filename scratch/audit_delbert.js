const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = 'https://jzbsutrmprzfuvaripwb.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6YnN1dHJtcHJ6ZnV2YXJpcHdiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjE1MTI3NCwiZXhwIjoyMDg3NzI3Mjc0fQ.y0Pi1AGdlXSuR092lZ8w4VeuPmC4DF2_9DwgsPaVI3U'

const supabase = createClient(supabaseUrl, supabaseKey)

async function listUsers() {
    console.log('--- Listagem de Usuários ---')
    const { data: users, error } = await supabase
        .from('profiles')
        .select('name, email, stripe_subscription_status, trial_ends_at, is_active')
        .order('email');

    if (error) {
        console.error('Erro:', error.message);
        return;
    }

    users.forEach(u => {
        const stripeStatus = u.stripe_subscription_status || 'null';
        const isTrialActive = u.trial_ends_at && new Date(u.trial_ends_at) > new Date();
        const status = (stripeStatus === 'active' || stripeStatus === 'paid') ? 'PAGO' : (isTrialActive ? 'TRIAL' : 'EXPIRADO');
        
        if (u.email && u.email.includes('delbert')) {
             console.log(`>>> ${(u.email || 'no-email').padEnd(30)} | status: ${stripeStatus.padEnd(10)} | trial: ${isTrialActive ? 'SIM' : 'NÃO'} | result: ${status} | name: ${u.name}`);
        } else {
             // console.log(`${(u.email || 'no-email').padEnd(30)} | status: ${stripeStatus.padEnd(10)} | trial: ${isTrialActive ? 'SIM' : 'NÃO'} | result: ${status} | name: ${u.name}`);
        }
    });
}

listUsers();
