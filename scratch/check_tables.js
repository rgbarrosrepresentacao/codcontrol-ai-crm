
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://jzbsutrmprzfuvaripwb.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6YnN1dHJtcHJ6ZnV2YXJpcHdiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjE1MTI3NCwiZXhwIjoyMDg3NzI3Mjc0fQ.y0Pi1AGdlXSuR092lZ8w4VeuPmC4DF2_9DwgsPaVI3U';

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing env vars');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkSchema() {
    console.log('--- ai_knowledge ---');
    const { data: knowledge, error: kErr } = await supabase.from('ai_knowledge').select('*').limit(1);
    if (kErr) console.error(kErr);
    else if (knowledge && knowledge.length > 0) console.log(Object.keys(knowledge[0]));
    else console.log('Empty');

    console.log('\n--- campaigns ---');
    const { data: campaigns, error: cErr } = await supabase.from('campaigns').select('*').limit(1);
    if (cErr) console.error(cErr);
    else if (campaigns && campaigns.length > 0) console.log(Object.keys(campaigns[0]));
    else console.log('Empty');
    
    console.log('\n--- profiles ---');
    const { data: profiles, error: pErr } = await supabase.from('profiles').select('*').limit(1);
    if (pErr) console.error(pErr);
    else if (profiles && profiles.length > 0) console.log(Object.keys(profiles[0]));
}

checkSchema();
