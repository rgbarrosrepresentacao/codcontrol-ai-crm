const https = require('https');

const supabaseUrl = 'https://jzbsutrmprzfuvaripwb.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6YnN1dHJtcHJ6ZnV2YXJpcHdiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjE1MTI3NCwiZXhwIjoyMDg3NzI3Mjc0fQ.y0Pi1AGdlXSuR092lZ8w4VeuPmC4DF2_9DwgsPaVI3U';
const email = 'delbertvendas@gmail.com';

const url = `${supabaseUrl}/rest/v1/profiles?email=eq.${email}&select=*`;

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
    console.log('User Profile Data (Admin):');
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
