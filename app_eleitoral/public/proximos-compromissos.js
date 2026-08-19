// proximos-compromissos.js — card "Próximos Compromissos" da index.html
// (Fase 2 da reestruturação por papel; renderização passou a usar o
// componente compartilhado agenda-component.js na Fase 3 — mesma
// implementação de agenda.html/admin.html/coordenador.html). Script
// independente de app.js: só lê agenda_eventos confirmados dos
// próximos 7 dias (mesma leitura pública aberta a "anon" que
// agenda.html usa) — não precisa de sessão, de okrDataCache nem de
// nenhum outro estado do mapa.

function initSupabaseClientProximosCompromissos() {
    const url = window.SUPABASE_URL;
    const key = window.SUPABASE_ANON_KEY;
    if (!window.supabase || !url || !key || url.indexOf('VITE_SUPABASE_URL') !== -1) {
        return null;
    }
    return window.supabase.createClient(url, key);
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
        const { data, error } = await sb.from('agenda_eventos').select('titulo, data_hora, local, ra_nome, tipo')
            .eq('status', 'confirmado')
            .gte('data_hora', agoraISO)
            .lte('data_hora', limite7DiasISO)
            .order('data_hora', { ascending: true });
        if (error) throw error;

        renderAgendaCompact(container, data || [], {
            emptyMessage: '<div class="instruction" style="font-size: 0.85rem;">Nenhum compromisso confirmado nos próximos 7 dias.</div>'
        });
    } catch (err) {
        console.warn('Erro ao carregar próximos compromissos:', err);
        container.innerHTML = '';
    }
}

loadProximosCompromissos();
