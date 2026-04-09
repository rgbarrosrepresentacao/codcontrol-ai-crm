const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  'https://jzbsutrmprzfuvaripwb.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6YnN1dHJtcHJ6ZnV2YXJpcHdiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0MTAxOTg0MSwiZXhwIjoyMDU2NTk1ODQxfQ.7Rd6NMBkCyVRdlnMTkFj2JRioMgNa_cU0JJxvnGjWgI'
)

async function main() {
  // Get all profiles with their subscription fields
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, stripe_subscription_status, subscription_status, kiwify_subscription_status, is_admin, trial_ends_at')
    .limit(20)

  if (error) {
    console.error('Error:', error.message)
    // Try without kiwify column
    const { data: data2, error: err2 } = await supabase
      .from('profiles')
      .select('id, email, stripe_subscription_status, subscription_status, is_admin, trial_ends_at')
      .limit(20)
    
    if (err2) {
      console.error('Error2:', err2.message)
      return
    }
    console.log('Profiles (without kiwify):', JSON.stringify(data2, null, 2))
    return
  }

  console.log('All profiles:')
  data.forEach(p => {
    console.log(`  ${p.email}: stripe=${p.stripe_subscription_status}, sub=${p.subscription_status}, kiwify=${p.kiwify_subscription_status}, admin=${p.is_admin}, trial=${p.trial_ends_at}`)
  })
}

main().catch(console.error)
