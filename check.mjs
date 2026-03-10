import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://jzbsutrmprzfuvaripwb.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6YnN1dHJtcHJ6ZnV2YXJpcHdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxNTEyNzQsImV4cCI6MjA4NzcyNzI3NH0.8nyUrjmmzhzrvLgIuk-odbiDEz27muKxBhFcrD2yhf4'
const supabase = createClient(supabaseUrl, supabaseKey)

async function testFetch() {
    const { data, error } = await supabase
        .from('ai_configurations')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1)

    console.log('Result:', data)
    console.log('Error:', error)
}

testFetch()
