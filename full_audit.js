
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://jzbsutrmprzfuvaripwb.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6YnN1dHJtcHJ6ZnV2YXJpcHdiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjE1MTI3NCwiZXhwIjoyMDg3NzI3Mjc0fQ.y0Pi1AGdlXSuR092lZ8w4VeuPmC4DF2_9DwgsPaVI3U';

const supabase = createClient(supabaseUrl, supabaseKey);

async function auditUsers() {
    console.log('Fetching all users to analyze statuses...');
    const { data: profiles, error } = await supabase
        .from('profiles')
        .select('id, email, name, stripe_subscription_status, is_active, is_admin, trial_ends_at')
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error:', error);
        return;
    }

    const now = new Date();
    
    console.log('Analysis of Users:');
    profiles.forEach(u => {
        const isPaidInDB = u.stripe_subscription_status === 'active';
        const isTrialExpired = u.trial_ends_at && new Date(u.trial_ends_at) < now;
        
        let statusLabel = 'NÃO PAGOU';
        if (isPaidInDB) statusLabel = 'ATIVO (PAGO)';
        if (u.is_admin) statusLabel = 'ADMIN';
        
        console.log(`[${statusLabel}] ${u.email.padEnd(30)} | Stripe Status: ${String(u.stripe_subscription_status).padEnd(10)} | Manual Active: ${u.is_active} | Expires: ${u.trial_ends_at || 'N/A'} ${isTrialExpired ? '(EXPIRED)' : ''}`);
        
        // Se o usuário está como 'active' mas expirou a data, o TrialWall vai bloquear ele.
    });
}

auditUsers();
