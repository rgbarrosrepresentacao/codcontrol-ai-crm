
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://jzbsutrmprzfuvaripwb.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6YnN1dHJtcHJ6ZnV2YXJpcHdiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjE1MTI3NCwiZXhwIjoyMDg3NzI3Mjc0fQ.y0Pi1AGdlXSuR092lZ8w4VeuPmC4DF2_9DwgsPaVI3U';

const supabase = createClient(supabaseUrl, supabaseKey);

async function audit() {
    console.log('Auditing profiles for payment status issues...');
    
    const { data: profiles, error } = await supabase
        .from('profiles')
        .select('id, email, name, stripe_subscription_status, kiwify_subscription_status, is_admin, trial_ends_at')
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching profiles:', error);
        return;
    }

    console.log(`Total profiles found: ${profiles.length}`);
    
    const issues = profiles.filter(u => {
        // Lógica do AdminPanel:
        const isPaid = u.stripe_subscription_status === 'active' || u.kiwify_subscription_status === 'active';
        const isNoPayment = !isPaid && !u.is_admin;
        
        // Se o usuário reclama que pagou mas está como "NÃO PAGOU",
        // queremos ver todos que estão como isNoPayment.
        return isNoPayment;
    });

    console.log(`\nUsers marked as "NÃO PAGOU": ${issues.length}`);
    issues.slice(0, 10).forEach(u => {
        console.log(`- ${u.email} (${u.name || 'N/A'}): Stripe: ${u.stripe_subscription_status} | Kiwify: ${u.kiwify_subscription_status} | Trial ends: ${u.trial_ends_at}`);
    });

    const activeKiwify = profiles.filter(u => u.kiwify_subscription_status === 'active');
    console.log(`\nUsers with kiwify_subscription_status = 'active': ${activeKiwify.length}`);
    
    const activeStripe = profiles.filter(u => u.stripe_subscription_status === 'active');
    console.log(`Users with stripe_subscription_status = 'active': ${activeStripe.length}`);
}

audit();
