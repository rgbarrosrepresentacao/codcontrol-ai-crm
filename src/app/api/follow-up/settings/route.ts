import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const DEFAULT_SETTINGS = {
    enabled: false,
    delay_minutes: 1440,
    max_attempts: 3,
    allowed_start_time: '08:00',
    allowed_end_time: '18:00',
    allowed_days: [1, 2, 3, 4, 5],
    allowed_statuses: [],
    stop_on_reply: true,
    stop_on_human_takeover: true,
    stop_on_sale: true,
    stop_on_status_change: true,
    strategy: 'consultivo',
    objective: 'recuperar_venda',
    custom_prompt: '',
    use_ai: true
};

const VALID_STRATEGIES = ['muito_leve', 'leve', 'consultivo', 'persuasivo'];
const VALID_OBJECTIVES = ['recuperar_venda', 'tirar_duvida', 'agendar_atendimento', 'confirmar_pagamento', 'reativar_cliente', 'personalizado'];
const TIME_REGEX = /^(0[0-9]|1[0-9]|2[0-3]):[0-5][0-9]$/;

/**
 * GET: Obtém as configurações de follow-up do usuário
 */
export async function GET(req: NextRequest) {
    console.log('[FOLLOWUP_SETTINGS_GET] Iniciando busca de configurações...');
    try {
        const supabaseAuth = await createSupabaseServerClient();
        const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();

        if (authError || !user) {
            console.error('[FOLLOWUP_SETTINGS_ERROR] Usuário não autenticado.');
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const supabase = getSupabaseAdmin();
        const { data: settings, error } = await supabase
            .from('followup_settings')
            .select('*')
            .eq('user_id', user.id)
            .maybeSingle();

        if (error) {
            console.error('[FOLLOWUP_SETTINGS_ERROR] Erro ao buscar configurações no banco:', error.message);
            return NextResponse.json({ error: 'Erro ao buscar configurações' }, { status: 500 });
        }

        if (!settings) {
            console.log('[FOLLOWUP_SETTINGS_GET] Nenhuma configuração encontrada. Retornando defaults.');
            return NextResponse.json({ ...DEFAULT_SETTINGS, user_id: user.id });
        }

        return NextResponse.json(settings);
    } catch (err: any) {
        console.error('[FOLLOWUP_SETTINGS_ERROR] Erro fatal no GET:', err.message || err);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

/**
 * POST: Cria ou atualiza as configurações de follow-up do usuário
 */
export async function POST(req: NextRequest) {
    console.log('[FOLLOWUP_SETTINGS_SAVE] Iniciando salvamento de configurações...');
    try {
        const supabaseAuth = await createSupabaseServerClient();
        const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();

        if (authError || !user) {
            console.error('[FOLLOWUP_SETTINGS_ERROR] Usuário não autenticado para salvar.');
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();

        // ── Validações do Payload ──
        const enabled = typeof body.enabled === 'boolean' ? body.enabled : false;
        const delay_minutes = parseInt(body.delay_minutes, 10);
        const max_attempts = parseInt(body.max_attempts, 10);
        const allowed_start_time = body.allowed_start_time || '08:00';
        const allowed_end_time = body.allowed_end_time || '18:00';
        const allowed_days = Array.isArray(body.allowed_days) ? body.allowed_days.map((d: any) => parseInt(d, 10)) : [1, 2, 3, 4, 5];
        const allowed_statuses = Array.isArray(body.allowed_statuses) ? body.allowed_statuses.map((s: any) => String(s)) : [];
        const stop_on_reply = typeof body.stop_on_reply === 'boolean' ? body.stop_on_reply : true;
        const stop_on_human_takeover = typeof body.stop_on_human_takeover === 'boolean' ? body.stop_on_human_takeover : true;
        const stop_on_sale = typeof body.stop_on_sale === 'boolean' ? body.stop_on_sale : true;
        const stop_on_status_change = typeof body.stop_on_status_change === 'boolean' ? body.stop_on_status_change : true;
        const strategy = body.strategy || 'consultivo';
        const objective = body.objective || 'recuperar_venda';
        const custom_prompt = body.custom_prompt !== undefined ? String(body.custom_prompt).slice(0, 3000) : '';
        const use_ai = typeof body.use_ai === 'boolean' ? body.use_ai : true;

        if (isNaN(delay_minutes) || delay_minutes < 5) {
            return NextResponse.json({ error: 'Tempo sem resposta inválido (mínimo de 5 minutos)' }, { status: 400 });
        }

        if (isNaN(max_attempts) || max_attempts < 1 || max_attempts > 5) {
            return NextResponse.json({ error: 'Máximo de tentativas deve ser entre 1 e 5' }, { status: 400 });
        }

        if (!TIME_REGEX.test(allowed_start_time) || !TIME_REGEX.test(allowed_end_time)) {
            return NextResponse.json({ error: 'Formato de horário permitido deve ser HH:mm' }, { status: 400 });
        }

        if (allowed_days.some((d: number) => isNaN(d) || d < 0 || d > 6)) {
            return NextResponse.json({ error: 'Dias permitidos inválidos (devem ser entre 0 e 6)' }, { status: 400 });
        }

        if (!VALID_STRATEGIES.includes(strategy)) {
            return NextResponse.json({ error: 'Estratégia inválida' }, { status: 400 });
        }

        if (!VALID_OBJECTIVES.includes(objective)) {
            return NextResponse.json({ error: 'Objetivo inválido' }, { status: 400 });
        }

        const supabase = getSupabaseAdmin();
        
        // Upsert por user_id garantindo que apenas o id do usuário logado seja afetado
        const { data: savedSettings, error } = await supabase
            .from('followup_settings')
            .upsert({
                user_id: user.id,
                enabled,
                delay_minutes,
                max_attempts,
                allowed_start_time,
                allowed_end_time,
                allowed_days,
                allowed_statuses,
                stop_on_reply,
                stop_on_human_takeover,
                stop_on_sale,
                stop_on_status_change,
                strategy,
                objective,
                custom_prompt,
                use_ai,
                updated_at: new Date().toISOString()
            }, { onConflict: 'user_id' })
            .select('*')
            .single();

        if (error) {
            console.error('[FOLLOWUP_SETTINGS_ERROR] Erro ao salvar configurações no banco:', error.message);
            return NextResponse.json({ error: 'Erro ao salvar configurações' }, { status: 500 });
        }

        console.log('[FOLLOWUP_SETTINGS_SAVE] Configurações salvas com sucesso para o usuário:', user.id);
        return NextResponse.json(savedSettings);
    } catch (err: any) {
        console.error('[FOLLOWUP_SETTINGS_ERROR] Erro fatal no POST:', err.message || err);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
