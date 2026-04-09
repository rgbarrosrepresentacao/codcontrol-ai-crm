const { createClient } = require('@supabase/supabase-js')

// Using ANON key 
const supabase = createClient(
  'https://jzbsutrmprzfuvaripwb.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6YnN1dHJtcHJ6ZnV2YXJpcHdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxNTEyNzQsImV4cCI6MjA4NzcyNzI3NH0.8nyUrjmmzhzrvLgIuk-odbiDEz27muKxBhFcrD2yhf4'
)

async function main() {
  // Test WITHOUT kiwify column (safe query)
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, stripe_subscription_status, is_admin, trial_ends_at, openai_api_key')
    .limit(5)

  if (error) {
    console.error('Error:', error.message)
    return
  }

  console.log('Profiles:')
  data.forEach(p => {
    const hasKey = p.openai_api_key ? 'SIM' : 'NAO'
    console.log(`  ${p.email}: stripe=${p.stripe_subscription_status}, admin=${p.is_admin}, trial=${p.trial_ends_at}, openai_key=${hasKey}`)
  })
  
  // Test with kiwify column
  console.log('\nTesting kiwify column...')
  const { data: d2, error: e2 } = await supabase
    .from('profiles')
    .select('id, kiwify_subscription_status')
    .limit(3)
  
  if (e2) {
    console.error('kiwify column ERROR:', e2.message)
    console.log('>>> COLUMN DOES NOT EXIST - needs to be created!\n')
  } else {
    console.log('kiwify column EXISTS! Values:', d2.map(p => p.kiwify_subscription_status))
  }
}

main().catch(console.error)
