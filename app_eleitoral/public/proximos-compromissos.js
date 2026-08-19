// proximos-compromissos.js — card "Próximos Compromissos" da index.html
// (Fase 2 da reestruturação por papel). Script independente de app.js:
// só lê agenda_eventos confirmados dos próximos 7 dias (mesma leitura
// pública aberta a "anon" que agenda.html usa) — não precisa de sessão,
// de okrDataCache nem de nenhum outro estado do mapa.

function initSupabaseClientProximosCompromissos() {
    const url = window.SUPABASE_URL;
    const key = window.SUPABASE_ANON_KEY;
    if (!window.supabase || !url || !key || url.indexOf('VITE_SUPABASE_URL') !== -1) {
        return null;
    }
    return window.supabase.createClient(url, key);
}

function formatProximoCompromissoData(iso) {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' · ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

async function loadProximosCompromissos() {
    const container = document.getElementById('proximos-compromissos-container');
    if (!container) return;
    const sb = initSupabaseClientProximosCompromissos();
    if (!sb) {
        container.innerHTML = '';
        return;
    }
    try {
        const agoraISO = new Date().toISOString();
        const limite7DiasISO = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
        const { data, error } = await sb.from('agenda_eventos').select('titulo, data_hora, local, ra_nome')
            .eq('status', 'confirmado')
            .gte('data_hora', agoraISO)
            .lte('data_hora', limite7DiasISO)
            .order('data_hora', { ascending: true });
        if (error) throw error;

        if (!data || !data.length) {
            container.innerHTML = '<div class="instruction" style="font-size: 0.85rem;">Nenhum compromisso confirmado nos próximos 7 dias.</div>';
            return;
        }
        container.innerHTML = data.map(ev => `
            <div style="padding: 8px 0; border-bottom: 1px solid var(--border-color, #e0e0e0); font-size: 0.85rem;">
                <strong>${ev.titulo}</strong>
                <div style="color: var(--text-secondary, #666);">${formatProximoCompromissoData(ev.data_hora)}${ev.local ? ' · ' + ev.local : ''}</div>
            </div>
        `).join('');
    } catch (err) {
        console.warn('Erro ao carregar próximos compromissos:', err);
        container.innerHTML = '';
    }
}

loadProximosCompromissos();
