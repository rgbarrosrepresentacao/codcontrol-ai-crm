const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

// Carregar variáveis de ambiente
dotenv.config({ path: path.resolve(__dirname, '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Variáveis de ambiente do Supabase não encontradas.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkUser(email) {
  console.log(`Verificando usuário: ${email}`);
  
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('email', email)
    .single();

  if (error) {
    console.error('Erro ao buscar perfil:', error.message);
    return;
  }

  console.log('Perfil encontrado:');
  console.log(JSON.stringify(profile, null, 2));
}

const emailToCheck = 'delbertvendas@gmail.com';
checkUser(emailToCheck);
