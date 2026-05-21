import cron from 'node-cron';

console.log('[CRON-SERVICE] Started background cron job runner.');

// ── Webhook Jobs (processador da fila principal) — roda a cada 1 minuto ───────
// CRÍTICO: é este cron que consome a fila webhook_jobs e faz a IA responder.
// Usa lock atômico FOR UPDATE SKIP LOCKED no Postgres — seguro contra duplicidade.
cron.schedule('*/1 * * * *', async () => {
    console.log(`[CRON-WEBHOOK-JOBS] Triggering at ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`);
    try {
        const port = process.env.PORT || 3000;
        const res = await fetch(`http://127.0.0.1:${port}/api/cron/webhook-jobs`, {
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.CRON_SECRET}`
            }
        });
        const data = await res.text();
        console.log(`[CRON-WEBHOOK-JOBS] Response (${res.status}):`, data);
    } catch (error) {
        console.error('[CRON-WEBHOOK-JOBS] Error:', error.message);
    }
});

// ── Blast Inteligente — roda a cada 2 minutos ─────────────────────────────────
// O delay real entre mensagens é controlado pelo scheduled_at de cada item.
// Esse ciclo apenas "acorda" e processa o que já passou do horário agendado.
cron.schedule('*/2 * * * *', async () => {
    console.log(`[CRON-BLAST] Triggering at ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`);
    try {
        const port = process.env.PORT || 3000;
        const res = await fetch(`http://127.0.0.1:${port}/api/cron/blast`, {
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.CRON_SECRET}`
            }
        });
        const data = await res.text();
        console.log(`[CRON-BLAST] Response (${res.status}):`, data);
    } catch (error) {
        console.error('[CRON-BLAST] Error:', error.message);
    }
});

// ── Follow-up (IA de resgate) — roda a cada 5 minutos ────────────────────────
cron.schedule('*/5 * * * *', async () => {
    console.log(`[CRON-FOLLOWUP] Triggering at ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`);
    try {
        const port = process.env.PORT || 3000;
        const res = await fetch(`http://127.0.0.1:${port}/api/cron/followup`, {
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.CRON_SECRET}`
            }
        });
        const data = await res.text();
        console.log(`[CRON-FOLLOWUP] Response (${res.status}):`, data);
    } catch (error) {
        console.error('[CRON-FOLLOWUP] Error:', error.message);
    }
});

// ── Cleanup de mídias antigas — roda 1 vez por dia às 3h da manhã ────────────
// Remove do Supabase Storage mídias com mais de 60 dias para economizar espaço.
cron.schedule('0 3 * * *', async () => {
    console.log(`[CRON-CLEANUP] Triggering at ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`);
    try {
        const port = process.env.PORT || 3000;
        const res = await fetch(`http://127.0.0.1:${port}/api/cron/cleanup`, {
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.CRON_SECRET}`
            }
        });
        const data = await res.text();
        console.log(`[CRON-CLEANUP] Response (${res.status}):`, data);
    } catch (error) {
        console.error('[CRON-CLEANUP] Error:', error.message);
    }
});
