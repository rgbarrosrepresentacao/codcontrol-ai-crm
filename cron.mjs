import cron from 'node-cron';

console.log('[CRON-SERVICE] Started background cron job runner.');

cron.schedule('*/5 * * * *', async () => {
    console.log(`[CRON-SERVICE] Triggering Followup API at ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`);
    try {
        const port = process.env.PORT || 3000;
        // Ping internal Next.js route
        const url = `http://127.0.0.1:${port}/api/cron/followup`;
        
        const res = await fetch(url, {
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        const data = await res.text();
        console.log(`[CRON-SERVICE] Response (${res.status}):`, data);
    } catch (error) {
        console.error('[CRON-SERVICE] Error triggering Followup API:', error.message);
    }
});
