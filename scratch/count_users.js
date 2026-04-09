const https = require('https');

const supabaseUrl = 'https://jzbsutrmprzfuvaripwb.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6YnN1dHJtcHJ6ZnV2YXJpcHdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxNTEyNzQsImV4cCI6MjA4NzcyNzI3NH0.8nyUrjmmzhzrvLgIuk-odbiDEz27muKxBhFcrD2yhf4';

const url = `${supabaseUrl}/rest/v1/profiles?select=count`;

const options = {
  headers: {
    'apikey': supabaseKey,
    'Authorization': `Bearer ${supabaseKey}`,
    'Prefer': 'count=exact'
  }
};

https.get(url, options, (res) => {
  console.log('Status Code:', res.statusCode);
  console.log('Headers:', JSON.stringify(res.headers, null, 2));
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    console.log('Count Response:', data);
  });
}).on('error', (err) => {
  console.error('Error:', err.message);
});
