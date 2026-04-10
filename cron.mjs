import cron from 'node-cron';

console.log('[CRON-SERVICE] Started background cron job runner.');

// ── Follow-up (IA de resgate) — roda a cada 5 minutos ────────────────────────
cron.schedule('*/5 * * * *', async () => {
    console.log(`[CRON-FOLLOWUP] Triggering at ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`);
    try {
        const port = process.env.PORT || 3000;
        const res = await fetch(`http://127.0.0.1:${port}/api/cron/followup`, {
            headers: { 'Content-Type': 'application/json' }
        });
        const data = await res.text();
        console.log(`[CRON-FOLLOWUP] Response (${res.status}):`, data);
    } catch (error) {
        console.error('[CRON-FOLLOWUP] Error:', error.message);
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
            headers: { 'Content-Type': 'application/json' }
        });
        const data = await res.text();
        console.log(`[CRON-BLAST] Response (${res.status}):`, data);
    } catch (error) {
        console.error('[CRON-BLAST] Error:', error.message);
    }
});
