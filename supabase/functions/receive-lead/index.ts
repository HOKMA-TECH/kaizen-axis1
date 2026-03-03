import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';

const WEBHOOK_SECRET  = Deno.env.get('LEAD_WEBHOOK_SECRET') || 'kaizen-webhook-secret';
const N8N_WEBHOOK_URL = Deno.env.get('N8N_LEAD_CREATED_WEBHOOK_URL'); // URL do WF-03 n8n

Deno.serve(async (req: Request) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, {
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, x-webhook-secret',
            },
        });
    }

    if (req.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
    }

    const secret = req.headers.get('x-webhook-secret');
    if (secret !== WEBHOOK_SECRET) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    let body: any;
    try {
        body = await req.json();
    } catch {
        return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400 });
    }

    const { name, phone, origin, ai_summary, ai_metadata, directorate_id } = body;

    if (!name || !phone) {
        return new Response(JSON.stringify({ error: 'name and phone are required' }), { status: 422 });
    }

    const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
        { auth: { persistSession: false } }
    );

    try {
        // ── Inserir Lead sem distribuição (n8n assume o controle) ──────────────────
        const { data: newLead, error } = await supabase
            .from('leads')
            .insert([{
                name,
                phone,
                origin: origin || 'whatsapp',
                ai_summary: ai_summary || null,
                ai_metadata: ai_metadata || null,
                directorate_id: directorate_id || null,
                stage: 'novo_lead',
                assigned_to: null,
                distribution_status: 'aguardando_distribuicao',
                interest_level: ai_metadata?.priority === 'alta' ? 'Alto'
                    : ai_metadata?.priority === 'media' ? 'Médio' : 'Baixo',
            }])
            .select()
            .single();

        if (error) throw error;

        // ── Disparar workflow de distribuição no n8n (fire-and-forget) ─────────────
        if (N8N_WEBHOOK_URL) {
            fetch(N8N_WEBHOOK_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    lead_id:        newLead.id,
                    lead_name:      newLead.name,
                    lead_phone:     newLead.phone,
                    directorate_id: newLead.directorate_id,
                }),
            }).catch((err) => console.error('[n8n trigger error]', err.message));
        } else {
            console.warn('N8N_LEAD_CREATED_WEBHOOK_URL não configurada — distribuição não disparada.');
        }

        return new Response(
            JSON.stringify({
                success: true,
                lead_id: newLead.id,
                distribution_status: 'aguardando_distribuicao',
                note: 'Distribuição em andamento via n8n.',
            }),
            { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
        );
    } catch (e: any) {
        console.error('Error inserting lead:', e);
        return new Response(JSON.stringify({ error: e.message || 'Internal error' }), { status: 500 });
    }
});
