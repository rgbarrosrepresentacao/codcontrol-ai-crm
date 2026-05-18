import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'
export const maxDuration = 300 // 5 minutes
export const revalidate = 0

export async function GET(req: NextRequest) {
    const authHeader = req.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    // Verifica o secret se estiver configurado
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
        console.error('[Cleanup] 🚫 Acesso não autorizado negado.');
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('[CRON_CLEANUP] Starting cleanup routine...')
    const supabase = getSupabaseAdmin()
    
    try {
        // Calcula a data de 60 dias atrás
        const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();

        // Busca mensagens de mídia antigas
        const { data: messages, error } = await supabase
            .from('messages')
            .select('id, payload, content, type')
            .in('type', ['audio', 'image', 'video'])
            .lt('created_at', sixtyDaysAgo);

        if (error) {
            console.error('[CRON_CLEANUP] Error fetching messages:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        if (!messages || messages.length === 0) {
            return NextResponse.json({ success: true, deleted: 0, message: 'Nenhuma mídia antiga encontrada.' });
        }

        console.log(`[CRON_CLEANUP] Found ${messages.length} messages with media to clean up.`);

        let deletedCount = 0;

        for (const msg of messages) {
            let fileUrl = '';
            
            // Tenta pegar a URL do payload primeiro (como fizemos para os áudios)
            if (msg.payload && typeof msg.payload === 'object') {
                fileUrl = (msg.payload as any).audioUrl || '';
            }
            
            // Se não tiver no payload, tenta pegar do content (para imagens/vídeos que salvam a URL no content)
            if (!fileUrl && msg.content && (msg.content.startsWith('http') || msg.content.startsWith('https'))) {
                fileUrl = msg.content;
            }

            if (fileUrl) {
                // Extrai o caminho do arquivo da URL do Supabase Storage
                // Exemplo de URL: https://.../storage/v1/object/public/chat-media/received-audios/...
                const match = fileUrl.match(/\/public\/chat-media\/(.+)$/);
                if (match) {
                    const filePath = match[1];
                    console.log(`[CRON_CLEANUP] Deleting file from storage: ${filePath}`);
                    
                    const { error: deleteError } = await supabase.storage
                        .from('chat-media')
                        .remove([filePath]);

                    if (deleteError) {
                        console.error(`[CRON_CLEANUP] Error deleting file ${filePath}:`, deleteError);
                    } else {
                        deletedCount++;
                        
                        // Atualiza a mensagem no banco para remover a referência ou marcar como expirada
                        const updates: any = {};
                        
                        if (msg.payload && (msg.payload as any).audioUrl) {
                            updates.payload = { ...(msg.payload as any), audioUrl: null, expired: true };
                        }
                        
                        if (msg.type === 'image' || msg.type === 'video') {
                            if (msg.content === fileUrl) {
                                updates.content = `[${msg.type === 'image' ? 'Imagem' : 'Vídeo'} expirada para economizar espaço]`;
                            }
                        }

                        if (Object.keys(updates).length > 0) {
                            await supabase
                                .from('messages')
                                .update(updates)
                                .eq('id', msg.id);
                        }
                    }
                }
            }
        }

        return NextResponse.json({ success: true, deleted: deletedCount, total_processed: messages.length });

    } catch (err: any) {
        console.error('[CRON_CLEANUP] Fatal Error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
