const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = 'https://jzbsutrmprzfuvaripwb.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6YnN1dHJtcHJ6ZnV2YXJpcHdiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjE1MTI3NCwiZXhwIjoyMDg3NzI3Mjc0fQ.y0Pi1AGdlXSuR092lZ8w4VeuPmC4DF2_9DwgsPaVI3U'

const supabase = createClient(supabaseUrl, supabaseKey)

async function auditUsers() {
    console.log('Auditing users with inactive status...')
    const { data: users, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('stripe_subscription_status', 'inactive')

    if (error) {
        console.error('Error fetching users:', error)
        return
    }

    if (users.length === 0) {
        console.log('No inactive users found.')
        return
    }

    console.log(`Found ${users.length} inactive users. Checking for potential Kiwify buyers...`)
    for (const user of users) {
        console.log(`User: ${user.name} (${user.email}) - Trial Ends: ${user.trial_ends_at}`)
    }
}

auditUsers()
