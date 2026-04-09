const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = 'https://jzbsutrmprzfuvaripwb.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6YnN1dHJtcHJ6ZnV2YXJpcHdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxNTEyNzQsImV4cCI6MjA4NzcyNzI3NH0.8nyUrjmmzhzrvLgIuk-odbiDEz27muKxBhFcrD2yhf4'

const supabase = createClient(supabaseUrl, supabaseKey)

async function checkColumns() {
  const columns = ['stripe_subscription_status', 'kiwify_subscription_status', 'subscription_status', 'status', 'active', 'plan_id', 'openai_api_key', 'is_admin', 'trial_ends_at'];
  
  console.log('Testing columns one by one...');
  for (const col of columns) {
    const { data, error } = await supabase.from('profiles').select(col).limit(1);
    if (error) {
      console.log(`❌ ${col}: ${error.message}`);
    } else {
      console.log(`✅ ${col}`);
    }
  }
}

checkColumns();
