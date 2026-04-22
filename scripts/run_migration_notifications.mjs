// Script para rodar a migração de notificações de venda
// Execute: node scripts/run_migration_notifications.mjs

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

async function runMigration() {
    console.log('🚀 Iniciando migração: Alertas de Vendas...\n')

    const sql = `
        ALTER TABLE profiles
            ADD COLUMN IF NOT EXISTS notification_whatsapp TEXT DEFAULT NULL,
            ADD COLUMN IF NOT EXISTS sale_notifications_enabled BOOLEAN DEFAULT FALSE;
    `

    let error = null
    try {
        const result = await supabase.rpc('exec_sql', { query: sql })
        error = result.error
    } catch (e) {
        error = { message: 'rpc not available' }
    }

    if (error) {
        // Fallback: tenta via REST API do Supabase
        console.log('RPC não disponível, tentando via API direta...')
        
        // Testa se as colunas já existem fazendo um select
        const { data: testData, error: testError } = await supabase
            .from('profiles')
            .select('notification_whatsapp, sale_notifications_enabled')
            .limit(1)

        if (!testError) {
            console.log('✅ Colunas já existem! Migração não necessária.')
            return
        }

        console.log('❌ As colunas ainda não existem.')
        console.log('\n📋 Por favor, execute o seguinte SQL manualmente no Supabase SQL Editor:')
        console.log('   https://supabase.com/dashboard/project/jzbsutrmprzfuvaripwb/sql/new\n')
        console.log('─'.repeat(60))
        console.log(`ALTER TABLE profiles
    ADD COLUMN IF NOT EXISTS notification_whatsapp TEXT DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS sale_notifications_enabled BOOLEAN DEFAULT FALSE;`)
        console.log('─'.repeat(60))
        return
    }

    // Verifica se funcionou
    const { error: verifyError } = await supabase
        .from('profiles')
        .select('notification_whatsapp, sale_notifications_enabled')
        .limit(1)

    if (!verifyError) {
        console.log('✅ Migração concluída com sucesso!')
        console.log('   ✓ Coluna notification_whatsapp adicionada')
        console.log('   ✓ Coluna sale_notifications_enabled adicionada')
    } else {
        console.log('⚠️  Verificação falhou:', verifyError.message)
    }
}

runMigration().catch(console.error)
