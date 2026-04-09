const { createClient } = require('@supabase/supabase-js')

// Using ANON key from .env.local
const supabase = createClient(
  'https://jzbsutrmprzfuvaripwb.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6YnN1dHJtcHJ6ZnV2YXJpcHdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxNTEyNzQsImV4cCI6MjA4NzcyNzI3NH0.8nyUrjmmzhzrvLgIuk-odbiDEz27muKxBhFcrD2yhf4'
)

async function main() {
  // Try to discover columns by selecting with a weird column (will get an error listing real ones)
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, stripe_subscription_status, subscription_status, is_admin, trial_ends_at')
    .limit(10)

  if (error) {
    console.error('Error (anon key):', error.message, error.details || '')
    return
  }

  console.log('Profiles (first 10):')
  data.forEach(p => {
    console.log(`  ${p.email}: stripe=${p.stripe_subscription_status}, sub=${p.subscription_status}, admin=${p.is_admin}, trial=${p.trial_ends_at}`)
  })
}

main().catch(console.error)
