const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  'https://jzbsutrmprzfuvaripwb.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6YnN1dHJtcHJ6ZnV2YXJpcHdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxNTEyNzQsImV4cCI6MjA4NzcyNzI3NH0.8nyUrjmmzhzrvLgIuk-odbiDEz27muKxBhFcrD2yhf4'
)

async function main() {
  console.log('Checking whatsapp_instances...')
  // Since we don't have a user_id, let's just see if ANY instances exist
  const { data, error } = await supabase
    .from('whatsapp_instances')
    .select('id, instance_name, display_name, user_id')
    .limit(10)
  
  if (error) {
    console.error('Error:', error.message)
  } else {
    console.log('Instances found:', data.length)
    data.forEach(i => {
      console.log(`- ${i.display_name || i.instance_name} (User: ${i.user_id})`)
    })
  }
}

main().catch(console.error)
