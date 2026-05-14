import { evolutionApi } from '@/lib/evolution';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export class NotificationService {
    /**
     * Envia alerta de venda para o dono da loja
     */
    static async sendSaleNotification(
        instanceName: string,
        orderData: any,
        customerPhone: string,
        ownerPhone: string
    ) {
        try {
            const remoteJid = ownerPhone.includes('@') ? ownerPhone : `${ownerPhone.replace(/\D/g, '')}@s.whatsapp.net`;
            
            const message = `
🎯 *NOVA VENDA DETECTADA!* 🎯

📦 *Produto:* ${orderData.produto || 'Não identificado'}
👤 *Cliente:* ${orderData.nome || 'Não informado'}
📱 *WhatsApp:* ${customerPhone}

📍 *Endereço:*
${orderData.rua || ''}, ${orderData.numero || ''}
${orderData.bairro || ''}
${orderData.cidade || ''}/${orderData.estado || ''}
CEP: ${orderData.cep || ''}
CPF: ${orderData.cpf || ''}

🚀 *A IA já encerrou o atendimento.*
`;

            await evolutionApi.sendTextMessage(instanceName, remoteJid, message);
            console.log(`[Notification] ✅ Alerta de venda enviado para ${ownerPhone}`);
            return true;
        } catch (err) {
            console.error('[Notification] ❌ Erro ao enviar alerta de venda:', err);
            return false;
        }
    }
}
