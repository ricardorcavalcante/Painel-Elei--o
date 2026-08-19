// agenda.js — agenda.html: leitura pública (sem login) dos compromissos
// confirmados do candidato + calendário oficial do TSE (Fase 2 da
// reestruturação por papel).
//
// Deliberadamente independente de okr-shared.js/auth-shared.js: esta
// página não tem sessão nenhuma (agenda_eventos.status='confirmado' e
// prazos_eleitorais são de leitura aberta a "anon" via RLS, ver
// supabase/schema.sql), então não faz sentido carregar o módulo de
// sessão/OKR inteiro só pra duas leituras públicas. Extração literal
// de public/app.js — mesmas funções, mesmos nomes.

let agendaDataCache = { eventos: [] };
let prazosTSECache = [];

const PRAZO_CATEGORIA_LABEL = {
    partidos: 'Partidos', convencao: 'Convenção', candidatura: 'Candidatura',
    propaganda: 'Propaganda', eleitorado: 'Eleitorado', urnas: 'Urnas',
    financiamento: 'Financiamento', pesquisas: 'Pesquisas',
    administrativo: 'Administrativo', votacao: 'Votação', diplomacao: 'Diplomação'
};

function initSupabaseClient() {
    const url = window.SUPABASE_URL;
    const key = window.SUPABASE_ANON_KEY;
    if (!window.supabase || !url || !key || url.indexOf('VITE_SUPABASE_URL') !== -1) {
        return null;
    }
    return window.supabase.createClient(url, key);
}

function formatPrazoDate(dataStr) {
    const [ano, mes, dia] = dataStr.split('-');
    return `${dia}/${mes}/${ano}`;
}

function formatAgendaDateTime(iso) {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function agendaTipoLabel(tipo) {
    if (tipo === 'oficial') return '📌 Compromisso Oficial';
    if (tipo === 'visita_solicitada') return '📅 Visita Solicitada';
    if (tipo === 'participacao_solicitada') return '🎤 Participação Solicitada';
    return tipo;
}

async function loadAgendaPublica() {
    const sb = initSupabaseClient();
    if (!sb) {
        const container = document.getElementById('agenda-publica-container');
        if (container) container.innerHTML = '<div class="instruction">Agenda não configurada: defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.</div>';
        return;
    }
    try {
        const { data, error } = await sb.from('agenda_eventos').select('*').eq('status', 'confirmado').order('data_hora', { ascending: true });
        if (error) throw error;
        agendaDataCache.eventos = data || [];
        renderAgendaPublica();
    } catch (err) {
        console.warn('Erro ao carregar agenda:', err);
    }
}

function renderAgendaPublica() {
    const container = document.getElementById('agenda-publica-container');
    if (!container) return;

    const confirmados = agendaDataCache.eventos.filter(ev => ev.status === 'confirmado');
    if (!confirmados.length) {
        container.innerHTML = '<div class="instruction">Nenhum compromisso confirmado no momento.</div>';
        return;
    }

    container.innerHTML = confirmados.map(ev => `
        <div class="okr-card">
            <div class="okr-card-header">
                <span class="okr-badge badge-tatico">${agendaTipoLabel(ev.tipo)}</span>
                <span class="okr-year">${formatAgendaDateTime(ev.data_hora)}</span>
            </div>
            <h4>${ev.titulo}</h4>
            <p>${ev.descricao || ''}</p>
            <div class="okr-card-footer">
                <span>${[ev.local, ev.ra_nome].filter(Boolean).join(' · ')}</span>
            </div>
        </div>
    `).join('');
}

async function loadPrazosTSE() {
    const sb = initSupabaseClient();
    if (!sb) return;
    try {
        const { data, error } = await sb.from('prazos_eleitorais').select('*').order('data', { ascending: true });
        if (error) throw error;
        prazosTSECache = data || [];
        renderPrazosTSE();
    } catch (err) {
        console.warn('Erro ao carregar calendário do TSE:', err);
    }
}

function renderPrazosTSE() {
    const tbody = document.getElementById('prazos-tse-tbody');
    if (!tbody) return;
    if (!prazosTSECache.length) {
        tbody.innerHTML = '<tr><td colspan="3" class="instruction">Calendário do TSE indisponível no momento.</td></tr>';
        return;
    }
    const hoje = new Date().toISOString().slice(0, 10);
    tbody.innerHTML = prazosTSECache.map(p => {
        const passado = p.data < hoje;
        const style = passado ? 'opacity: 0.55;' : (p.destaque ? 'font-weight: 700;' : '');
        const descricaoEscapada = (p.descricao || '').replace(/"/g, '&quot;');
        return `
            <tr style="${style}" title="${descricaoEscapada}">
                <td>${formatPrazoDate(p.data)}</td>
                <td>${p.titulo}</td>
                <td>${PRAZO_CATEGORIA_LABEL[p.categoria] || p.categoria}</td>
            </tr>
        `;
    }).join('');
}

Promise.all([loadAgendaPublica(), loadPrazosTSE()]);
