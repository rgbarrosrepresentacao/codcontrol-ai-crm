import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { generateSpeech } from '@/lib/openai-tts';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Cache em memória para os áudios de preview (para reduzir custos de API e latência)
const previewCache = new Map<string, string>();

const TEST_TEXT = "Olá! Eu sou a assistente virtual do CodControl AI CRM. Este é um teste de voz em português do Brasil. Meu objetivo é falar de forma clara, natural e humana. Vou pronunciar algumas palavras comuns do atendimento: WhatsApp, Pix, boleto, CPF, CNPJ, CEP, instalação, suporte técnico, fibra óptica, roteador e velocidade de internet. Agora alguns números: pedido número 1.589, valor de R$ 249,90, protocolo 2026-001 e CEP 01310-100. Se esta voz parecer agradável, você pode selecioná-la para atender seus clientes com mais naturalidade.";

export async function POST(req: NextRequest) {
    try {
        const supabaseAuth = await createSupabaseServerClient();
        const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json().catch(() => ({}));
        const { voiceId } = body;

        if (!voiceId) {
            return NextResponse.json({ error: 'Parâmetro voiceId é obrigatório' }, { status: 400 });
        }

        // 1. Verificar se já existe no cache
        const cachedAudio = previewCache.get(voiceId);
        if (cachedAudio) {
            console.log(`[TTS_PREVIEW_CACHE_HIT] Retornando áudio em cache para voz: ${voiceId}`);
            return NextResponse.json({ success: true, audioB64: cachedAudio });
        }

        // 2. Buscar a chave OpenAI do usuário
        const supabase = getSupabaseAdmin();
        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('openai_api_key')
            .eq('id', user.id)
            .single();

        if (profileError || !profile || !profile.openai_api_key) {
            return NextResponse.json({ 
                error: 'Sua chave de API da OpenAI não está configurada. Por favor, salve a sua chave da OpenAI primeiro nas configurações.' 
            }, { status: 400 });
        }

        // 3. Gerar o áudio do preview com fallback e logs automáticos
        console.log(`[TTS_PREVIEW_CACHE_MISS] Gerando áudio de teste para voz: ${voiceId}`);
        const audioB64 = await generateSpeech(TEST_TEXT, voiceId, profile.openai_api_key, 'mp3');

        // Salvar no cache
        previewCache.set(voiceId, audioB64);

        return NextResponse.json({ success: true, audioB64 });

    } catch (err: any) {
        console.error('[TTS_PREVIEW_ERROR]', err.message || err);
        return NextResponse.json({ 
            error: err.message || 'Erro interno ao gerar a amostra de voz.' 
        }, { status: 500 });
    }
}
