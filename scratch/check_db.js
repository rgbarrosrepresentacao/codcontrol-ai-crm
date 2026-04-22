const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

async function main() {
  console.log('Checking plans...')
  const { data: plans, error: plansError } = await supabase
    .from('plans')
    .select('*')
  
  if (plansError) {
    console.error('Error fetching plans:', plansError.message)
  } else {
    console.log('Plans found:', plans)
  }

  console.log('\nChecking active profiles count...')
  const { count, error: countError } = await supabase
    .from('profiles')
    .select('*', { count: 'exact', head: true })
  
  if (countError) {
    console.error('Error counting profiles:', countError.message)
  } else {
    console.log('Total profiles:', count)
  }
}

main().catch(console.error)
