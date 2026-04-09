const https = require('https');

const supabaseUrl = 'https://jzbsutrmprzfuvaripwb.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6YnN1dHJtcHJ6ZnV2YXJpcHdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxNTEyNzQsImV4cCI6MjA4NzcyNzI3NH0.8nyUrjmmzhzrvLgIuk-odbiDEz27muKxBhFcrD2yhf4';

const url = `${supabaseUrl}/rest/v1/profiles?select=id,email,kiwify_subscription_status,stripe_subscription_status,is_active`;

const options = {
  headers: {
    'apikey': supabaseKey,
    'Authorization': `Bearer ${supabaseKey}`
  }
};

https.get(url, options, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    console.log('All Users:');
    try {
        const json = JSON.parse(data);
        console.log(JSON.stringify(json, null, 2));
    } catch (e) {
        console.log('Raw output:', data);
    }
  });
}).on('error', (err) => {
  console.error('Error:', err.message);
});
