// admin.js — parte exclusiva de admin.html: gestão de equipe (escrita)
// e aprovação de Agenda (Fase 2 da reestruturação por papel).
//
// A leitura compartilhada com okrs.html/candidata.html (Central de
// Comando, lista de OKRs, Equipe, Artefatos, cliente Supabase
// memoizado) foi extraída pra okr-shared.js — carregado ANTES deste
// arquivo em admin.html, então as funções/globais de lá (okrCurrentUser,
// okrDataCache, initSupabaseClient(), renderEquipe(), loadOKRData()
// etc.) já existem quando este script roda.
//
// Deliberadamente NÃO migrado pra cá (ver decisões da Fase 2, mesmas de
// antes): gerarQuadrantesDaRA() (depende do subsistema de mapa; RAs já
// provisionadas via SQL) e o filtro por nível Todos/Estratégico/Tático/
// Operacional (acoplamento de layout da SPA antiga, sem lista de OKRs
// nesta página pra filtrar junto).

// ------------------------------------------
// Equipe — ações de escrita (leitura/render fica em okr-shared.js)
// ------------------------------------------
async function openNewEquipeModal() {
    const sb = initSupabaseClient();
    if (!sb) return;
    const disponiveis = okrCurrentUser.is_super_admin
        ? okrDataCache.products
        : okrDataCache.products.filter(p => okrUserProductIds.includes(p.id));
    if (!disponiveis.length) return alert('Nenhuma Coordenação Regional disponível para você.');

    const opcoes = disponiveis.map((p, i) => `${i + 1}. ${p.nome} (${p.ra_nome})`).join('\n');
    const escolha = prompt(`Adicionar integrante a qual Coordenação?\n${opcoes}`);
    const idx = parseInt(escolha, 10) - 1;
    const produto = disponiveis[idx];
    if (!produto) return alert('Coordenação inválida.');

    const email = prompt('E-mail do integrante (precisa já ter feito Cadastro no login de OKRs):');
    if (!email) return;
    const papel = (prompt('Papel: coordenador ou operacional', 'operacional') || 'operacional').toLowerCase();

    const { data: perfil, error: perfilErr } = await sb.from('profiles').select('id, full_name').eq('email', email).maybeSingle();
    if (perfilErr || !perfil) return alert('Usuário não encontrado. Ele precisa se cadastrar (aba OKRs > Cadastrar) antes de ser adicionado à equipe.');

    const { error } = await sb.from('product_team').insert({ product_id: produto.id, user_id: perfil.id, papel });
    if (error) return alert('Erro: ' + error.message);
    await loadOKRData();
}

async function openAtribuirVoluntarioModal(areaId) {
    const sb = initSupabaseClient();
    if (!sb) return;
    const area = okrDataCache.areas.find(a => a.id === areaId);
    if (!area) return alert('Quadrante não encontrado.');

    const email = prompt(`Atribuir voluntário ao quadrante ${area.codigo} — e-mail (precisa já ter feito Cadastro no login de OKRs):`);
    if (!email) return;

    const { data: perfil, error: perfilErr } = await sb.from('profiles').select('id, full_name').eq('email', email).maybeSingle();
    if (perfilErr || !perfil) return alert('Usuário não encontrado. Ele precisa se cadastrar (aba OKRs > Cadastrar) antes de ser atribuído.');

    const { error } = await sb.from('area_volunteers').insert({ area_id: area.id, user_id: perfil.id, atribuido_por: okrCurrentUser.id });
    if (error) return alert('Erro: ' + error.message);
    await loadOKRData();
}

// ------------------------------------------
// Agenda — aprovação (nível estratégico)
// ------------------------------------------
async function loadAgendaData() {
    const sb = initSupabaseClient();
    if (!sb) return;
    try {
        const needsProducts = !okrDataCache.products.length;
        const [agendaRes, productsRes] = await Promise.all([
            sb.from('agenda_eventos').select('*').order('data_hora', { ascending: true }),
            needsProducts ? sb.from('products').select('*').order('nome') : Promise.resolve(null)
        ]);
        agendaDataCache.eventos = agendaRes.data || [];
        if (productsRes) okrDataCache.products = productsRes.data || [];

        renderAgendaActionButtons();
        renderSolicitacoesPendentes();
    } catch (err) {
        console.warn('Erro ao carregar agenda:', err);
    }
}

function renderAgendaActionButtons() {
    const box = document.getElementById('agenda-btn-group');
    if (!box) return;
    if (!okrCurrentUser) {
        box.innerHTML = '';
        return;
    }
    box.innerHTML = `<button class="btn-primary" onclick="openNovoCompromissoOficialModal()">📌 Publicar Compromisso Oficial</button>`;
}

function renderSolicitacoesPendentes() {
    const section = document.getElementById('agenda-pendentes-section');
    const container = document.getElementById('agenda-pendentes-container');
    if (!section || !container) return;

    const pendentes = agendaDataCache.eventos.filter(ev => ev.status === 'pendente');
    section.style.display = 'block';
    if (!pendentes.length) {
        container.innerHTML = '<div class="instruction">Nenhuma solicitação pendente.</div>';
        return;
    }

    container.innerHTML = pendentes.map(ev => {
        const produto = findProduct(ev.product_id);
        return `
        <div class="okr-card">
            <div class="okr-card-header">
                <span class="okr-badge badge-tatico">${agendaTipoLabel(ev.tipo)}</span>
                <span class="okr-year">${produto ? produto.nome + ' (' + produto.ra_nome + ')' : ''}</span>
            </div>
            <h4>${ev.titulo}</h4>
            <p>${ev.descricao || ''}</p>
            <div class="okr-card-footer">
                <span>${formatAgendaDateTime(ev.data_hora)}${ev.local ? ' · ' + ev.local : ''}</span>
            </div>
            <div class="okr-btn-group" style="margin-top: 10px;">
                <button class="btn-primary" onclick="responderSolicitacao('${ev.id}', true)">✅ Aprovar</button>
                <button class="btn-secondary" onclick="responderSolicitacao('${ev.id}', false)">❌ Recusar</button>
            </div>
        </div>
    `;
    }).join('');
}

function parseAgendaDateTimeInput(texto) {
    const d = new Date((texto || '').trim().replace(' ', 'T'));
    return isNaN(d.getTime()) ? null : d;
}

async function openNovoCompromissoOficialModal() {
    const sb = initSupabaseClient();
    if (!sb) return;
    const titulo = prompt('Título do compromisso oficial:');
    if (!titulo) return;
    const local = prompt('Local (endereço ou referência):') || null;
    const ra_nome = (prompt('Região Administrativa (opcional):') || '').toUpperCase() || null;
    const data_hora = parseAgendaDateTimeInput(prompt('Data e hora (AAAA-MM-DD HH:MM):'));
    if (!data_hora) return alert('Data/hora inválida. Use o formato AAAA-MM-DD HH:MM.');
    const descricao = prompt('Descrição (opcional):') || null;

    const { error } = await sb.from('agenda_eventos').insert({
        titulo, descricao, tipo: 'oficial', local, ra_nome,
        data_hora: data_hora.toISOString(),
        status: 'confirmado'
    });
    if (error) return alert('Erro: ' + error.message);
    await loadAgendaData();
}

async function responderSolicitacao(id, aprovar) {
    const sb = initSupabaseClient();
    if (!sb) return;
    const resposta_admin = prompt(aprovar ? 'Observação para o coordenador (opcional):' : 'Motivo da recusa (opcional):') || null;
    const { error } = await sb.from('agenda_eventos').update({
        status: aprovar ? 'confirmado' : 'recusado',
        resposta_admin,
        updated_at: new Date().toISOString()
    }).eq('id', id);
    if (error) return alert('Erro: ' + error.message);
    await loadAgendaData();
}

// ------------------------------------------
// Bootstrap — chamado por admin.html depois que guardPage()
// (auth-shared.js) já confirmou papel super_admin.
// ------------------------------------------
async function initAdminPage(sb, ctx) {
    seedSupabaseClient(sb);
    setOkrUser(ctx.profile, []);
    renderComandoSkeleton();
    await Promise.allSettled([loadOKRData(), loadPrazosTSE(), loadAgendaData(), fetchComandoCheckins()]);
    renderComando();
}
