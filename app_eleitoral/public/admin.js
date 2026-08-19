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
// Equipe — só o "Atribuir voluntário a quadrante" fica aqui:
// openNewEquipeModal() mora em okr-shared.js porque tanto admin.html
// quanto okrs.html mostram o botão "👥 Adicionar à Equipe" (o
// renderOKRActionButtons original já liberava essa ação pra
// coordenador, não só pra super_admin).
// ------------------------------------------
async function openAtribuirVoluntarioModal(areaId) {
    const sb = initSupabaseClient();
    if (!sb) return;
    const area = okrDataCache.areas.find(a => a.id === areaId);
    if (!area) return showToast('Quadrante não encontrado.', { type: 'danger' });

    openModal({
        title: `Atribuir voluntário — quadrante ${area.codigo}`,
        bodyHtml: `
            <div class="app-form-field">
                <label class="app-form-field-label" for="af-email">E-mail do voluntário</label>
                <input type="email" id="af-email" class="app-form-input" placeholder="nome@exemplo.com">
                <div class="app-form-hint">Precisa já ter feito Cadastro no login de OKRs.</div>
            </div>
        `,
        buttons: [
            { label: 'Cancelar', variant: 'secondary' },
            {
                label: 'Atribuir', variant: 'primary', closeOnClick: false,
                onClick: async () => {
                    const email = document.getElementById('af-email').value.trim();
                    if (!email) return showToast('Informe o e-mail do voluntário.', { type: 'warning' });

                    const { data: perfil, error: perfilErr } = await sb.from('profiles').select('id, full_name').eq('email', email).maybeSingle();
                    if (perfilErr || !perfil) return showToast('Usuário não encontrado. Ele precisa se cadastrar (aba OKRs > Cadastrar) antes de ser atribuído.', { type: 'danger' });

                    const { error } = await sb.from('area_volunteers').insert({ area_id: area.id, user_id: perfil.id, atribuido_por: okrCurrentUser.id });
                    if (error) return showToast('Erro: ' + error.message, { type: 'danger' });

                    closeModal();
                    showToast('Voluntário atribuído.', { type: 'success' });
                    await loadOKRData();
                }
            }
        ]
    });
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

// Renderização via agenda-component.js (Fase 3) — mesma implementação
// de cartão usada em agenda.html/index.html/coordenador.js; só o que é
// genuinamente diferente aqui (cabeçalho com a Coordenação de origem,
// botões de Aprovar/Recusar) vem por option.
function renderSolicitacoesPendentes() {
    const section = document.getElementById('agenda-pendentes-section');
    const container = document.getElementById('agenda-pendentes-container');
    if (!section || !container) return;

    const pendentes = agendaDataCache.eventos.filter(ev => ev.status === 'pendente');
    section.style.display = 'block';
    renderAgendaCards(container, pendentes, {
        emptyMessage: '<div class="instruction">Nenhuma solicitação pendente.</div>',
        headerRight: ev => {
            const produto = findProduct(ev.product_id);
            return produto ? produto.nome + ' (' + produto.ra_nome + ')' : '';
        },
        actions: ev => `
            <div class="okr-btn-group" style="margin-top: 10px;">
                <button class="btn-primary" onclick="responderSolicitacao('${ev.id}', true)">✅ Aprovar</button>
                <button class="btn-secondary" onclick="responderSolicitacao('${ev.id}', false)">❌ Recusar</button>
            </div>
        `
    });
}

async function openNovoCompromissoOficialModal() {
    const sb = initSupabaseClient();
    if (!sb) return;

    openModal({
        title: 'Publicar Compromisso Oficial',
        bodyHtml: `
            <div class="app-form-field">
                <label class="app-form-field-label" for="nco-titulo">Título</label>
                <input type="text" id="nco-titulo" class="app-form-input">
            </div>
            <div class="app-form-field">
                <label class="app-form-field-label" for="nco-local">Local</label>
                <input type="text" id="nco-local" class="app-form-input" placeholder="Endereço ou referência">
            </div>
            <div class="app-form-field">
                <label class="app-form-field-label" for="nco-ra">Região Administrativa</label>
                <input type="text" id="nco-ra" class="app-form-input" placeholder="Opcional">
            </div>
            <div class="app-form-field" style="display:flex; gap:10px;">
                <div style="flex:1;">
                    <label class="app-form-field-label" for="nco-data">Data</label>
                    <input type="date" id="nco-data" class="app-form-input">
                </div>
                <div style="flex:1;">
                    <label class="app-form-field-label" for="nco-hora">Hora</label>
                    <input type="time" id="nco-hora" class="app-form-input">
                </div>
            </div>
            <div class="app-form-field">
                <label class="app-form-field-label" for="nco-descricao">Descrição</label>
                <textarea id="nco-descricao" class="app-form-textarea" placeholder="Opcional"></textarea>
            </div>
        `,
        buttons: [
            { label: 'Cancelar', variant: 'secondary' },
            {
                label: 'Publicar', variant: 'primary', closeOnClick: false,
                onClick: async () => {
                    const titulo = document.getElementById('nco-titulo').value.trim();
                    if (!titulo) return showToast('Título é obrigatório.', { type: 'warning' });
                    const local = document.getElementById('nco-local').value.trim() || null;
                    const ra_nome = document.getElementById('nco-ra').value.trim().toUpperCase() || null;
                    const dataVal = document.getElementById('nco-data').value;
                    const horaVal = document.getElementById('nco-hora').value;
                    if (!dataVal || !horaVal) return showToast('Informe data e hora.', { type: 'warning' });
                    const data_hora = new Date(`${dataVal}T${horaVal}`);
                    if (isNaN(data_hora.getTime())) return showToast('Data/hora inválida.', { type: 'warning' });
                    const descricao = document.getElementById('nco-descricao').value.trim() || null;

                    const { error } = await sb.from('agenda_eventos').insert({
                        titulo, descricao, tipo: 'oficial', local, ra_nome,
                        data_hora: data_hora.toISOString(),
                        status: 'confirmado'
                    });
                    if (error) return showToast('Erro: ' + error.message, { type: 'danger' });

                    closeModal();
                    showToast('Compromisso publicado.', { type: 'success' });
                    await loadAgendaData();
                }
            }
        ]
    });
}

async function responderSolicitacao(id, aprovar) {
    const sb = initSupabaseClient();
    if (!sb) return;

    openModal({
        title: aprovar ? 'Aprovar solicitação' : 'Recusar solicitação',
        bodyHtml: `
            <div class="app-form-field">
                <label class="app-form-field-label" for="rs-resposta">${aprovar ? 'Observação para o coordenador' : 'Motivo da recusa'}</label>
                <textarea id="rs-resposta" class="app-form-textarea" placeholder="Opcional"></textarea>
            </div>
        `,
        buttons: [
            { label: 'Cancelar', variant: 'secondary' },
            {
                label: aprovar ? 'Aprovar' : 'Recusar', variant: 'primary', closeOnClick: false,
                onClick: async () => {
                    const resposta_admin = document.getElementById('rs-resposta').value.trim() || null;
                    const { error } = await sb.from('agenda_eventos').update({
                        status: aprovar ? 'confirmado' : 'recusado',
                        resposta_admin,
                        updated_at: new Date().toISOString()
                    }).eq('id', id);
                    if (error) return showToast('Erro: ' + error.message, { type: 'danger' });

                    closeModal();
                    showToast(aprovar ? 'Solicitação aprovada.' : 'Solicitação recusada.', { type: 'success' });
                    await loadAgendaData();
                }
            }
        ]
    });
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
