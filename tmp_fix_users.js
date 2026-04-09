const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = 'https://jzbsutrmprzfuvaripwb.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6YnN1dHJtcHJ6ZnV2YXJpcHdiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjE1MTI3NCwiZXhwIjoyMDg3NzI3Mjc0fQ.y0Pi1AGdlXSuR092lZ8w4VeuPmC4DF2_9DwgsPaVI3U'

const supabase = createClient(supabaseUrl, supabaseKey)

async function findAndFixUser() {
    console.log('Searching for user Liliany Santos...')
    const { data: users, error } = await supabase
        .from('profiles')
        .select('*')
        .or('name.ilike.%Liliany%,email.ilike.%liliany%')

    if (error) {
        console.error('Error fetching users:', error)
        return
    }

    if (users.length === 0) {
        console.log('User not found.')
        return
    }

    for (const user of users) {
        console.log(`Found user: ${user.name} (${user.email}) - Current status: ${user.stripe_subscription_status}`)
        
        const thirtyDaysFromNow = new Date()
        thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30)

        const { error: updateError } = await supabase
            .from('profiles')
            .update({
                stripe_subscription_status: 'active',
                is_active: true,
                trial_ends_at: thirtyDaysFromNow.toISOString()
            })
            .eq('id', user.id)

        if (updateError) {
            console.error(`Error updating user ${user.email}:`, updateError)
        } else {
            console.log(`Successfully updated user ${user.email} to active status.`)
        }
    }
}

findAndFixUser()
