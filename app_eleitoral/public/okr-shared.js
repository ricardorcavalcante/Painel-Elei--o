// okr-shared.js — leitura de OKRs/Equipe/Central de Comando compartilhada
// entre admin.html, okrs.html e candidata.html (Fase 2 da reestruturação
// por papel).
//
// Script clássico (globais), não ES module — mesma razão de auth-shared.js
// não servir aqui: as funções migradas de public/app.js geram HTML com
// onclick="funcao(...)" inline, que só resolve contra funções expostas
// como globais de window, não contra exports de módulo. Carregado ANTES
// do script específico de cada página (admin.js etc.), que só acrescenta
// o que é exclusivo daquele papel (ações de escrita).
//
// candidata.html usa isto tal como está, sem nenhuma ação: renderOKRs()
// aceita { readOnly: true } pra omitir o botão "✏️ Atualizar" (o único
// botão de ação que a função original não condicionava a papel nenhum —
// renderEquipe() já esconde "👤 Atribuir" sozinha, via okrCurrentUser/
// okrUserProductIds, que candidata.html deixa vazios/false).

let okrCurrentUser = null;
let okrUserProductIds = [];
let okrDataCache = { periods: [], activePeriodId: null, products: [], productTeam: [], objectives: [], keyResults: [], artefatos: [], areas: [], areaVolunteers: [] };
let currentOKRFilterLevel = 'all';
let agendaDataCache = { eventos: [] };
let prazosTSECache = [];
let comandoCheckins = [];
let comandoCheckinsError = false;
let comandoExecucao = [];
let comandoExecucaoError = false;

// Stubs inertes: funções copiadas de app.js referenciam contexto de mapa
// que nenhuma destas páginas carrega — os guards (`if (!map) return`) e
// o array vazio fazem o resto ser no-op, sem reescrever quem as chama.
let map;
let areaRectangles = [];

const PRAZO_CATEGORIA_LABEL = {
    partidos: 'Partidos', convencao: 'Convenção', candidatura: 'Candidatura',
    propaganda: 'Propaganda', eleitorado: 'Eleitorado', urnas: 'Urnas',
    financiamento: 'Financiamento', pesquisas: 'Pesquisas',
    administrativo: 'Administrativo', votacao: 'Votação', diplomacao: 'Diplomação'
};

// Memoizado — ver comentário equivalente na primeira versão disto em
// admin.js: criar um GoTrueClient por chamada faz eles brigarem pela
// mesma sessão no cold-start do redirect pós-login (401 esporádico).
let _sbInstance = null;
function initSupabaseClient() {
    if (_sbInstance) return _sbInstance;
    const url = window.SUPABASE_URL;
    const key = window.SUPABASE_ANON_KEY;
    if (!window.supabase || !url || !key || url.indexOf('VITE_SUPABASE_URL') !== -1) {
        return null;
    }
    _sbInstance = window.supabase.createClient(url, key);
    return _sbInstance;
}

// Chamado por cada página logo após guardPage() (auth-shared.js)
// resolver sessão — reaproveita o client que guardPage() já criou em
// vez de deixar initSupabaseClient() criar um segundo aqui.
function seedSupabaseClient(sb) {
    _sbInstance = sb;
}

// Idem para o estado de papel: cada página preenche a partir do ctx que
// guardPage() devolveu. productIds fica vazio pra quem não gerencia
// nenhuma Coordenação (candidata.html) — os `isAdmin || productIds.includes(...)`
// espalhados pelas funções abaixo resolvem sozinhos a visibilidade certa.
function setOkrUser(profile, productIds) {
    okrCurrentUser = profile;
    okrUserProductIds = productIds || [];
}

// Trata candidata como papel "estratégico" nos mesmos pontos onde hoje
// só is_super_admin desbloqueia ação/visibilidade — decisão de produto:
// candidata passa a governar a campanha inteira como super_admin já faz
// (define OKR, registra coordenador, vê atividade de qualquer região),
// mas só nestes pontos específicos. NÃO usar em renderEquipe() — o botão
// "👤 Atribuir" que esse gate libera chama openAtribuirVoluntarioModal(),
// que só existe em admin.js (candidata.html nunca carrega esse script).
function isStrategicUser(profile) {
    return !!(profile && (profile.is_super_admin || profile.is_candidata));
}

// ------------------------------------------
// Dados (OKRs/Equipe/Áreas — mesma query paginada de app.js)
// ------------------------------------------
async function fetchAllRows(sb, table, selectStr, orderCol) {
    const pageSize = 1000;
    let all = [];
    let from = 0;
    while (true) {
        let q = sb.from(table).select(selectStr);
        if (orderCol) q = q.order(orderCol);
        const { data, error } = await q.range(from, from + pageSize - 1);
        if (error) throw error;
        all = all.concat(data || []);
        if (!data || data.length < pageSize) break;
        from += pageSize;
    }
    return all;
}

async function loadOKRData() {
    const sb = initSupabaseClient();
    if (!sb) return;
    try {
        const [periodsRes, productsRes, teamRes, objectivesRes, keyResultsRes, artefatosRes, areas, areaVolunteersRes] = await Promise.all([
            sb.from('periods').select('*').order('data_inicio', { ascending: false }),
            sb.from('products').select('*').order('nome'),
            sb.from('product_team').select('papel, product_id, user_id, profiles:user_id(full_name, email)'),
            sb.from('objectives').select('*').order('created_at', { ascending: false }),
            sb.from('key_results').select('*'),
            sb.from('okr_artefatos').select('*').order('created_at', { ascending: false }),
            fetchAllRows(sb, 'areas', '*', 'codigo'),
            sb.from('area_volunteers').select('area_id, user_id, profiles:user_id(full_name, email)')
        ]);

        okrDataCache.periods = periodsRes.data || [];
        okrDataCache.products = productsRes.data || [];
        okrDataCache.productTeam = teamRes.data || [];
        okrDataCache.objectives = objectivesRes.data || [];
        okrDataCache.keyResults = keyResultsRes.data || [];
        okrDataCache.artefatos = artefatosRes.data || [];
        okrDataCache.areas = areas || [];
        okrDataCache.areaVolunteers = areaVolunteersRes.data || [];

        if (!okrDataCache.activePeriodId || !okrDataCache.periods.some(p => p.id === okrDataCache.activePeriodId)) {
            const ativo = okrDataCache.periods.find(p => p.ativo) || okrDataCache.periods[0];
            okrDataCache.activePeriodId = ativo ? ativo.id : null;
        }

        renderOKRPeriodSelect();
        renderOKRs();
        renderEquipe();
        renderArtefatos();
        renderAreaRectangles();
        updateMapQuadrantesVisibility();
    } catch (err) {
        console.warn('Erro ao carregar dados de OKRs:', err);
    }
}

function findProduct(productId) {
    return okrDataCache.products.find(p => p.id === productId);
}

function renderOKRPeriodSelect() {
    const sel = document.getElementById('okr-period-select');
    if (!sel) return;
    if (!okrDataCache.periods.length) {
        sel.innerHTML = '<option value="">Nenhum ciclo cadastrado</option>';
        return;
    }
    sel.innerHTML = okrDataCache.periods.map(p =>
        `<option value="${p.id}" ${p.id === okrDataCache.activePeriodId ? 'selected' : ''}>${p.nome} (${p.tipo_ciclo})</option>`
    ).join('');
}

// opts.readOnly omite o botão "✏️ Atualizar" de cada KR — único uso:
// candidata.html, que não tem nenhuma ação (nem essa, que na app.js
// original não era condicionada a papel nenhum, só protegida por RLS).
function renderOKRs(opts) {
    const readOnly = !!(opts && opts.readOnly);
    const container = document.getElementById('okr-list-container');
    if (!container) return;

    const showEstrategico = currentOKRFilterLevel === 'all' || currentOKRFilterLevel === 'estrategico';
    const showTatico = currentOKRFilterLevel === 'all' || currentOKRFilterLevel === 'tatico' || currentOKRFilterLevel === 'operacional';

    const objetivosDoCiclo = okrDataCache.objectives.filter(o => o.period_id === okrDataCache.activePeriodId);

    let html = '';
    objetivosDoCiclo.forEach(obj => {
        if (obj.nivel === 'estrategico' && !showEstrategico) return;
        if (obj.nivel === 'tatico' && !showTatico) return;

        const krs = okrDataCache.keyResults.filter(kr => kr.objective_id === obj.id);
        const produto = obj.nivel === 'tatico' ? findProduct(obj.product_id) : null;
        const badgeLabel = obj.nivel === 'estrategico'
            ? '⭐ Nível Estratégico — Campanha DF 2026'
            : `📌 Nível Tático — ${produto ? produto.nome + ' (' + produto.ra_nome + ')' : 'Coordenação Regional'}`;

        const krsHtml = krs.map(kr => {
            const perc = kr.target_value ? Math.min(100, Math.round((kr.current_value / kr.target_value) * 100)) : 0;
            return `
                <div class="okr-kr-row">
                    <div class="okr-kr-row-header">
                        <span>${kr.titulo}</span>
                        ${readOnly ? '' : `<button class="btn-link" onclick="updateKeyResultProgress('${kr.id}')">✏️ Atualizar</button>`}
                    </div>
                    <div class="okr-progress-bar-container">
                        <div class="okr-progress-bar progress-tatico" style="width: ${perc}%;"></div>
                    </div>
                    <div class="okr-card-footer">
                        <span>${kr.current_value} / ${kr.target_value} ${kr.unit || ''}</span>
                        <strong>${perc}%</strong>
                    </div>
                </div>
            `;
        }).join('');

        html += `
            <div class="okr-card ${obj.nivel === 'estrategico' ? 'okr-card-estrategico' : 'okr-card-tatico'}">
                <div class="okr-card-header">
                    <span class="okr-badge ${obj.nivel === 'estrategico' ? 'badge-estrategico' : 'badge-tatico'}">${badgeLabel}</span>
                </div>
                <h4>${obj.titulo}</h4>
                <p>${obj.descricao || ''}</p>
                <div class="okr-progress-bar-container">
                    <div class="okr-progress-bar" style="width: ${obj.progresso || 0}%;"></div>
                </div>
                <div class="okr-card-footer">
                    <span>Progresso do Objetivo</span>
                    <strong>${Math.round(obj.progresso || 0)}%</strong>
                </div>
                ${krsHtml}
            </div>
        `;
    });

    container.innerHTML = html || '<div class="instruction">Nenhum objetivo cadastrado para o ciclo/nível selecionado.</div>';
}

function renderArtefatos() {
    const container = document.getElementById('artefatos-list-container');
    if (!container) return;

    if (okrDataCache.artefatos.length === 0) {
        container.innerHTML = '<div class="instruction">Nenhum artefato digitalizado postado.</div>';
        return;
    }

    let html = '';
    okrDataCache.artefatos.forEach(art => {
        const isFoto = art.tipo_artefato === 'foto';
        html += `
            <div class="artefato-card">
                <div class="okr-card-header">
                    <span class="okr-badge badge-artefato">📄 ${(art.tipo_artefato || 'outro').toUpperCase()}</span>
                    <span class="status-tag status-${art.status}">${art.status.toUpperCase()}</span>
                </div>
                <h4>${art.titulo}</h4>
                <p>${art.descricao || ''}</p>
                ${isFoto ? `<img src="${art.arquivo_url}" alt="Artefato" class="artefato-preview-img">` : `<a href="${art.arquivo_url}" target="_blank" rel="noopener" class="btn-link">🔗 Visualizar Documento Digitalizado</a>`}
            </div>
        `;
    });

    container.innerHTML = html;
}

function renderAreaRectangles() {
    if (!map) return;
}

function updateMapQuadrantesVisibility() {
    areaRectangles.forEach(rect => rect.setMap(null));
}

function renderEquipe() {
    const container = document.getElementById('equipe-list-container');
    if (!container) return;

    if (!okrDataCache.products.length) {
        container.innerHTML = '<div class="instruction">Nenhuma Coordenação Regional cadastrada.</div>';
        return;
    }

    const isAdmin = !!(okrCurrentUser && okrCurrentUser.is_super_admin);

    let html = '';
    okrDataCache.products.forEach(produto => {
        const membros = okrDataCache.productTeam.filter(t => t.product_id === produto.id);

        const membrosHtml = membros.length
            ? membros.map(m => {
                const badgeClass = m.papel === 'coordenador' ? 'badge-tatico' : 'badge-operacional';
                const roleLabel = m.papel === 'coordenador' ? '📌 Coordenador(a)' : '👥 Operacional';
                const nome = (m.profiles && m.profiles.full_name) || (m.profiles && m.profiles.email) || 'Integrante';
                return `<span class="okr-badge ${badgeClass}">${roleLabel}: ${nome}</span>`;
            }).join(' ')
            : '<span class="instruction" style="margin:0;">Nenhum integrante cadastrado</span>';

        const podeGerenciarQuadrantes = isAdmin || okrUserProductIds.includes(produto.id);
        const quadrantesDoProduto = okrDataCache.areas.filter(a => a.product_id === produto.id);
        const quadrantesHtml = quadrantesDoProduto.length
            ? quadrantesDoProduto.map(area => {
                const voluntarios = okrDataCache.areaVolunteers.filter(v => v.area_id === area.id);
                const voluntariosHtml = voluntarios.length
                    ? voluntarios.map(v => {
                        const nome = (v.profiles && v.profiles.full_name) || (v.profiles && v.profiles.email) || 'Voluntário(a)';
                        return `<span class="okr-badge badge-operacional">👤 ${nome}</span>`;
                    }).join(' ')
                    : '<span class="instruction" style="margin:0;">Sem voluntário atribuído</span>';
                return `
                    <div class="quadrante-row">
                        <div class="quadrante-row-header">
                            <strong>${area.codigo}</strong> — ${area.nome}
                            ${podeGerenciarQuadrantes ? `<button class="btn-link" onclick="openAtribuirVoluntarioModal('${area.id}')">👤 Atribuir</button>` : ''}
                        </div>
                        <p class="okr-coords-list" style="margin:0;">${voluntariosHtml}</p>
                    </div>
                `;
            }).join('')
            : '<span class="instruction" style="margin:0;">Nenhum quadrante gerado ainda</span>';

        html += `
            <div class="equipe-card">
                <div class="okr-card-header">
                    <span class="okr-year">RA: ${produto.ra_nome}${produto.zona_eleitoral ? ' · Zona ' + produto.zona_eleitoral : ''}</span>
                </div>
                <h4>${produto.nome}</h4>
                <p class="okr-coords-list">${membrosHtml}</p>
                <details class="quadrantes-section">
                    <summary>🔲 Quadrantes de Voluntários (${quadrantesDoProduto.length})</summary>
                    ${quadrantesHtml}
                </details>
            </div>
        `;
    });

    container.innerHTML = html || '<div class="instruction">Nenhuma coordenação encontrada para este filtro.</div>';
}

// Compartilhado entre admin.html e okrs.html: o botão "👥 Adicionar à
// Equipe" (renderOKRActionButtons, mais abaixo em okrs.js) é liberado
// tanto pra super_admin quanto pra coordenador (hasProduct), então essa
// ação não é exclusiva de nenhuma das duas páginas.
async function openNewEquipeModal() {
    const sb = initSupabaseClient();
    if (!sb) return;
    const disponiveis = isStrategicUser(okrCurrentUser)
        ? okrDataCache.products
        : okrDataCache.products.filter(p => okrUserProductIds.includes(p.id));
    if (!disponiveis.length) return showToast('Nenhuma Coordenação Regional disponível para você.', { type: 'warning' });

    const produto = await pickFromList('Adicionar integrante a qual Coordenação?', disponiveis, p => `${p.nome} (${p.ra_nome})`);
    if (!produto) return;

    openModal({
        title: `Adicionar integrante — ${produto.nome}`,
        bodyHtml: `
            <div class="app-form-field">
                <label class="app-form-field-label" for="ne-email">E-mail do integrante</label>
                <input type="email" id="ne-email" class="app-form-input" placeholder="nome@exemplo.com">
                <div class="app-form-hint">Precisa já ter criado conta em convite.html (link de "📲 Convidar pelo WhatsApp") — sem conta, use o próprio convite em vez deste formulário.</div>
            </div>
            <div class="app-form-field">
                <label class="app-form-field-label" for="ne-papel">Papel</label>
                <select id="ne-papel" class="app-form-select">
                    <option value="operacional" selected>Operacional</option>
                    <option value="coordenador">Coordenador</option>
                </select>
            </div>
        `,
        buttons: [
            { label: 'Cancelar', variant: 'secondary' },
            {
                label: 'Adicionar', variant: 'primary', closeOnClick: false,
                onClick: async () => {
                    const email = document.getElementById('ne-email').value.trim();
                    if (!email) return showToast('Informe o e-mail do integrante.', { type: 'warning' });
                    const papel = document.getElementById('ne-papel').value;

                    const { data: perfil, error: perfilErr } = await sb.from('profiles').select('id, full_name').eq('email', email).maybeSingle();
                    if (perfilErr || !perfil) return showToast('Usuário não encontrado. Envie o link de convite (📲 Convidar pelo WhatsApp) pra ele criar a conta antes de ser adicionado à equipe.', { type: 'danger' });

                    const { error } = await sb.from('product_team').insert({ product_id: produto.id, user_id: perfil.id, papel });
                    if (error) return showToast('Erro: ' + error.message, { type: 'danger' });

                    closeModal();
                    showToast('Integrante adicionado à equipe.', { type: 'success' });
                    await loadOKRData();
                }
            }
        ]
    });
}

// Compartilhado entre admin.html (super_admin/candidata — publica
// direto, tipo='oficial'/status='confirmado') e coordenador.html
// (coordenador — vira solicitação pendente, tipo='visita_solicitada'/
// 'participacao_solicitada', amarrada à Coordenação que ele está vendo
// no momento; aprovação continua exclusiva de admin/candidata em
// admin.js). Mesmo formulário nos dois casos — só muda o que a
// submissão grava, decidido por isStrategicUser(okrCurrentUser), não
// por qual página chamou.
async function openAgendaFormModal() {
    const sb = initSupabaseClient();
    if (!sb) return;

    const podePublicarDireto = isStrategicUser(okrCurrentUser);
    let product_id = null;
    let produtoSelecionado = null;

    if (!podePublicarDireto) {
        if (typeof coordDataCache !== 'undefined' && coordDataCache.productId) {
            product_id = coordDataCache.productId;
            produtoSelecionado = findProduct(product_id);
        } else if (okrUserProductIds.length === 1) {
            product_id = okrUserProductIds[0];
            produtoSelecionado = findProduct(product_id);
        } else if (okrUserProductIds.length > 1) {
            produtoSelecionado = await pickFromList('Solicitar compromisso pra qual Coordenação?', okrDataCache.products.filter(p => okrUserProductIds.includes(p.id)), p => `${p.nome} (${p.ra_nome})`);
            if (!produtoSelecionado) return;
            product_id = produtoSelecionado.id;
        } else {
            return showToast('Você não está vinculado a nenhuma Coordenação Regional.', { type: 'warning' });
        }
    }

    const backdrop = openModal({
        title: podePublicarDireto ? 'Publicar Compromisso Oficial' : 'Solicitar Compromisso de Agenda',
        bodyHtml: `
            ${podePublicarDireto ? '' : `
            <div class="app-form-field">
                <label class="app-form-field-label" for="nco-tipo">Tipo de solicitação</label>
                <select id="nco-tipo" class="app-form-select">
                    <option value="visita_solicitada" selected>Visita da candidata</option>
                    <option value="participacao_solicitada">Participação em evento</option>
                </select>
            </div>
            `}
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
                label: podePublicarDireto ? 'Publicar' : 'Solicitar', variant: 'primary', closeOnClick: false,
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

                    const payload = { titulo, descricao, local, ra_nome, data_hora: data_hora.toISOString() };
                    if (podePublicarDireto) {
                        payload.tipo = 'oficial';
                        payload.status = 'confirmado';
                    } else {
                        payload.tipo = document.getElementById('nco-tipo').value;
                        payload.status = 'pendente';
                        payload.product_id = product_id;
                        payload.solicitado_por = okrCurrentUser.id;
                    }

                    const { error } = await sb.from('agenda_eventos').insert(payload);
                    if (error) return showToast('Erro: ' + error.message, { type: 'danger' });

                    closeModal();
                    showToast(podePublicarDireto ? 'Compromisso publicado.' : 'Solicitação enviada — aguardando aprovação de admin/candidata.', { type: 'success' });
                    if (typeof loadAgendaData === 'function' && document.getElementById('agenda-pendentes-container')) await loadAgendaData();
                    if (typeof fetchCoordAgenda === 'function' && document.getElementById('coord-agenda-container')) { await fetchCoordAgenda(); renderCoordAgenda(); }
                }
            }
        ]
    });
    if (!podePublicarDireto && produtoSelecionado) {
        backdrop.querySelector('#nco-ra').value = produtoSelecionado.ra_nome || '';
    }
}

// ------------------------------------------
// Calendário do TSE + Agenda (leitura básica — populate agendaDataCache
// pro painel "Agenda dos Próximos 3 Dias" da Central de Comando; a
// aprovação de solicitações em si é exclusiva de admin.js — ver
// responderSolicitacao)
// ------------------------------------------
function formatPrazoDate(dataStr) {
    const [ano, mes, dia] = dataStr.split('-');
    return `${dia}/${mes}/${ano}`;
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

// Versão enxuta de loadAgendaData() (app.js) — só popula
// agendaDataCache.eventos pro radar da Central de Comando, sem chamar
// as renderizações de aprovação/solicitação (admin.js-only).
async function loadAgendaEventosBasico() {
    const sb = initSupabaseClient();
    if (!sb) return;
    try {
        const { data, error } = await sb.from('agenda_eventos').select('*').order('data_hora', { ascending: true });
        if (error) throw error;
        agendaDataCache.eventos = data || [];
    } catch (err) {
        console.warn('Erro ao carregar agenda:', err);
    }
}

// ------------------------------------------
// Central de Comando (KPIs + 4 painéis) — admin.html e candidata.html
// ------------------------------------------
function renderComandoSkeleton() {
    [
        'comando-kpi-semaforo', 'comando-kpi-cobertura', 'comando-kpi-execucao', 'comando-kpi-lider', 'comando-kpi-prazo',
        'comando-semaforo-container', 'comando-cobertura-container', 'comando-ranking-container',
        'comando-radar-prazo', 'comando-radar-agenda', 'comando-consolidado-container'
    ].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = '<div class="instruction">Carregando…</div>';
    });
}

function getComandoPeriodId() {
    const semanaisAtivos = okrDataCache.periods
        .filter(p => p.tipo_ciclo === 'semanal' && p.ativo)
        .sort((a, b) => (b.data_inicio || '').localeCompare(a.data_inicio || ''));
    return semanaisAtivos.length ? semanaisAtivos[0].id : null;
}

async function fetchComandoCheckins() {
    const sb = initSupabaseClient();
    if (!sb) return;
    try {
        const seteDiasAtras = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        const { data, error } = await sb.from('checkins').select('area_id, created_at').gte('created_at', seteDiasAtras);
        if (error) throw error;
        comandoCheckins = data || [];
        comandoCheckinsError = false;
    } catch (err) {
        console.warn('Erro ao carregar atividade recente (check-ins):', err);
        comandoCheckins = [];
        comandoCheckinsError = true;
    }
}

// "Execução" (Fase seguinte à reestruturação por papel) — distinta de
// "cobertura" (planejamento: quadrante TEM voluntário atribuído).
// Execução é quadrante com pelo menos 1 check-in aprovado — visita de
// campo de fato confirmada. Busca sem filtro de data (evita depender de
// okrDataCache.periods já estar carregado neste ponto do bootstrap); o
// recorte pelo ciclo semanal ativo é aplicado em renderComandoCobertura(),
// na hora de renderizar.
async function fetchComandoExecucao() {
    const sb = initSupabaseClient();
    if (!sb) return;
    try {
        const { data, error } = await sb.from('checkins').select('area_id, created_at').eq('status', 'aprovado');
        if (error) throw error;
        comandoExecucao = data || [];
        comandoExecucaoError = false;
    } catch (err) {
        console.warn('Erro ao carregar execução territorial (check-ins aprovados):', err);
        comandoExecucao = [];
        comandoExecucaoError = true;
    }
}

function comandoFaixaCor(progresso) {
    if (progresso >= 70) return { cor: 'verde', label: 'No caminho' };
    if (progresso >= 40) return { cor: 'amarelo', label: 'Atenção' };
    return { cor: 'vermelho', label: 'Crítico' };
}

function renderComando() {
    renderComandoSemaforo();
    renderComandoCobertura();
    renderComandoRanking();
    renderComandoConsolidado();
    renderComandoRadar();
}

function renderComandoSemaforo() {
    const listContainer = document.getElementById('comando-semaforo-container');
    const kpiContainer = document.getElementById('comando-kpi-semaforo');
    if (!listContainer || !kpiContainer) return;

    const periodId = getComandoPeriodId();
    if (!periodId) {
        listContainer.innerHTML = '<div class="instruction">Nenhum ciclo semanal ativo no momento.</div>';
        kpiContainer.innerHTML = '<span class="comando-kpi-label">📊 Semáforo</span><strong class="comando-kpi-value">—</strong>';
        return;
    }

    const objetivos = okrDataCache.objectives.filter(o => o.nivel === 'estrategico' && o.period_id === periodId);
    if (!objetivos.length) {
        listContainer.innerHTML = '<div class="instruction">Nenhum OKR estratégico definido para este ciclo.</div>';
        kpiContainer.innerHTML = '<span class="comando-kpi-label">📊 Semáforo</span><strong class="comando-kpi-value">—</strong>';
        return;
    }

    const media = objetivos.reduce((soma, o) => soma + (o.progresso || 0), 0) / objetivos.length;
    const faixaMedia = comandoFaixaCor(media);
    kpiContainer.innerHTML = `
        <span class="comando-kpi-label">📊 Semáforo</span>
        <strong class="comando-kpi-value txt-${faixaMedia.cor}">${Math.round(media)}%</strong>
        <span class="comando-kpi-sub">${faixaMedia.label}</span>
    `;

    listContainer.innerHTML = objetivos.map(o => {
        const faixa = comandoFaixaCor(o.progresso || 0);
        return `
            <div class="comando-item-row">
                <div class="comando-item-header">
                    <span><span class="comando-dot dot-${faixa.cor}"></span>${o.titulo}</span>
                    <strong class="txt-${faixa.cor}">${Math.round(o.progresso || 0)}%</strong>
                </div>
                <div class="okr-progress-bar-container">
                    <div class="okr-progress-bar" style="width:${Math.round(o.progresso || 0)}%;"></div>
                </div>
                <div class="okr-card-footer"><span>${faixa.label}</span></div>
            </div>
        `;
    }).join('');
}

function renderComandoCobertura() {
    const listContainer = document.getElementById('comando-cobertura-container');
    const kpiContainer = document.getElementById('comando-kpi-cobertura');
    const execKpiContainer = document.getElementById('comando-kpi-execucao');
    if (!listContainer || !kpiContainer) return;

    if (!okrDataCache.areas.length) {
        listContainer.innerHTML = '<div class="instruction">Nenhum quadrante gerado ainda.</div>';
        kpiContainer.innerHTML = '<span class="comando-kpi-label">📋 Planejamento</span><strong class="comando-kpi-value">—</strong>';
        if (execKpiContainer) execKpiContainer.innerHTML = '<span class="comando-kpi-label">✅ Execução</span><strong class="comando-kpi-value">—</strong>';
        return;
    }

    // Execução = check-in aprovado dentro do ciclo semanal ativo (mesmo
    // recorte que o semáforo de OKR já usa) — distinto de cobertura
    // (planejamento: só precisa ter voluntário atribuído, sem visita
    // confirmada nenhuma).
    const periodoAtivo = okrDataCache.periods.find(p => p.id === getComandoPeriodId());
    const execucaoNoCiclo = periodoAtivo
        ? comandoExecucao.filter(c => {
            if (periodoAtivo.data_inicio && c.created_at < periodoAtivo.data_inicio) return false;
            if (periodoAtivo.data_fim && c.created_at > periodoAtivo.data_fim + 'T23:59:59') return false;
            return true;
        })
        : [];

    const areasComVoluntario = new Set(okrDataCache.areaVolunteers.map(v => v.area_id));
    const areasComExecucao = new Set(execucaoNoCiclo.map(c => c.area_id));
    const porRA = {};
    okrDataCache.areas.forEach(area => {
        if (!porRA[area.ra_nome]) porRA[area.ra_nome] = { total: 0, cobertos: 0, executados: 0 };
        porRA[area.ra_nome].total += 1;
        if (areasComVoluntario.has(area.id)) porRA[area.ra_nome].cobertos += 1;
        if (areasComExecucao.has(area.id)) porRA[area.ra_nome].executados += 1;
    });

    const linhas = Object.entries(porRA)
        .map(([ra, v]) => ({
            ra,
            pctCobertura: Math.round((v.cobertos / v.total) * 100),
            pctExecucao: Math.round((v.executados / v.total) * 100),
            ...v
        }))
        .sort((a, b) => a.pctExecucao - b.pctExecucao);

    const mediaCobertura = Math.round(linhas.reduce((s, l) => s + l.pctCobertura, 0) / linhas.length);
    const mediaExecucao = Math.round(linhas.reduce((s, l) => s + l.pctExecucao, 0) / linhas.length);

    kpiContainer.innerHTML = `
        <span class="comando-kpi-label">📋 Planejamento</span>
        <strong class="comando-kpi-value">${mediaCobertura}%</strong>
        <span class="comando-kpi-sub">${linhas.length} RA${linhas.length !== 1 ? 's' : ''} com quadrante</span>
    `;
    if (execKpiContainer) {
        const faixaExec = comandoFaixaCor(mediaExecucao);
        execKpiContainer.innerHTML = periodoAtivo ? `
            <span class="comando-kpi-label">✅ Execução</span>
            <strong class="comando-kpi-value txt-${faixaExec.cor}">${mediaExecucao}%</strong>
            <span class="comando-kpi-sub">${faixaExec.label} · ciclo atual</span>
        ` : `
            <span class="comando-kpi-label">✅ Execução</span>
            <strong class="comando-kpi-value">—</strong>
            <span class="comando-kpi-sub">Sem ciclo semanal ativo</span>
        `;
    }

    listContainer.innerHTML = linhas.map(l => `
        <div class="comando-item-row">
            <div class="comando-item-header"><span>${l.ra}</span></div>
            <div class="comando-item-sub">📋 Planejamento</div>
            <div class="okr-progress-bar-container">
                <div class="okr-progress-bar" style="width:${l.pctCobertura}%;"></div>
            </div>
            <div class="okr-card-footer"><span>${l.cobertos} de ${l.total} quadrantes com voluntário</span><strong>${l.pctCobertura}%</strong></div>
            <div class="comando-item-sub" style="margin-top:6px;">✅ Execução</div>
            <div class="okr-progress-bar-container">
                <div class="okr-progress-bar" style="width:${l.pctExecucao}%;"></div>
            </div>
            <div class="okr-card-footer"><span>${l.executados} de ${l.total} quadrantes com check-in aprovado</span><strong>${l.pctExecucao}%</strong></div>
        </div>
    `).join('') + (comandoExecucaoError
        ? '<div class="instruction">Não foi possível carregar a execução territorial agora — os números de "✅ Execução" podem estar incompletos.</div>'
        : '');
}

// Cache do último ranking calculado — reaproveitado por
// renderComandoConsolidado() (chamada logo em seguida, em renderComando())
// pra listar TODAS as Coordenações sem recalcular progresso/atividade.
let comandoRankingCache = [];

function renderComandoRanking() {
    const listContainer = document.getElementById('comando-ranking-container');
    const kpiContainer = document.getElementById('comando-kpi-lider');
    if (!listContainer || !kpiContainer) return;

    if (!okrDataCache.products.length) {
        listContainer.innerHTML = '<div class="instruction">Nenhuma Coordenação Regional cadastrada ainda.</div>';
        kpiContainer.innerHTML = '<span class="comando-kpi-label">🏆 Líder</span><strong class="comando-kpi-value">—</strong>';
        comandoRankingCache = [];
        return;
    }

    const periodId = getComandoPeriodId();
    const areaParaProduto = {};
    okrDataCache.areas.forEach(a => { areaParaProduto[a.id] = a.product_id; });

    const checkinsPorProduto = {};
    comandoCheckins.forEach(c => {
        const productId = areaParaProduto[c.area_id];
        if (!productId) return;
        checkinsPorProduto[productId] = (checkinsPorProduto[productId] || 0) + 1;
    });

    const isAdmin = isStrategicUser(okrCurrentUser);

    const ranking = okrDataCache.products.map(produto => {
        const objetivos = okrDataCache.objectives.filter(o => o.nivel === 'tatico' && o.product_id === produto.id && o.period_id === periodId);
        const progresso = objetivos.length
            ? objetivos.reduce((s, o) => s + (o.progresso || 0), 0) / objetivos.length
            : 0;
        const podeVerAtividade = isAdmin || okrUserProductIds.includes(produto.id);
        const teveCheckin = (checkinsPorProduto[produto.id] || 0) > 0;
        return { produto, progresso, podeVerAtividade, teveCheckin };
    }).sort((a, b) => {
        if (b.progresso !== a.progresso) return b.progresso - a.progresso;
        return (b.podeVerAtividade && b.teveCheckin ? 1 : 0) - (a.podeVerAtividade && a.teveCheckin ? 1 : 0);
    });

    comandoRankingCache = ranking;

    const lider = ranking[0];
    kpiContainer.innerHTML = lider
        ? `<span class="comando-kpi-label">🏆 Líder</span><strong class="comando-kpi-value">${Math.round(lider.progresso)}%</strong><span class="comando-kpi-sub">${lider.produto.nome}</span>`
        : '<span class="comando-kpi-label">🏆 Líder</span><strong class="comando-kpi-value">—</strong>';

    // Painel de destaque mostra só o top 3 — visão completa de todas as
    // Coordenações fica em renderComandoConsolidado() (tabela abaixo).
    const linhasHtml = ranking.slice(0, 3).map((r, i) => {
        const posicao = i + 1;
        const selo = !r.podeVerAtividade
            ? '<span class="comando-selo comando-selo-indisponivel" title="Atividade de outras Coordenações não é visível para o seu papel">—</span>'
            : (r.teveCheckin
                ? '<span class="comando-selo" title="Check-in nos últimos 7 dias">🔥</span>'
                : '<span class="comando-selo" title="Sem check-in nos últimos 7 dias">💤</span>');
        return `
            <div class="comando-item-row">
                <div class="comando-item-header"><span>${posicao}º — ${r.produto.nome} (${r.produto.ra_nome})</span>${selo}</div>
                <div class="okr-progress-bar-container">
                    <div class="okr-progress-bar" style="width:${Math.round(r.progresso)}%;"></div>
                </div>
                <div class="okr-card-footer"><span>Progresso tático médio</span><strong>${Math.round(r.progresso)}%</strong></div>
            </div>
        `;
    }).join('');

    listContainer.innerHTML = linhasHtml + (comandoCheckinsError
        ? '<div class="instruction">Não foi possível carregar a atividade recente agora — os selos 🔥/💤 podem estar incompletos.</div>'
        : '');
}

// Tabela com TODAS as Coordenações Regionais consolidadas — o ranking
// acima já mostra só o top 3; esta tabela é a visão completa, no mesmo
// espírito da lista de RAs em renderComandoCobertura(). Reaproveita
// comandoRankingCache (progresso tático) e os mesmos sets de
// cobertura/execução computados em renderComandoCobertura() — sem query nova.
function renderComandoConsolidado() {
    const container = document.getElementById('comando-consolidado-container');
    if (!container) return;

    if (!comandoRankingCache.length) {
        container.innerHTML = '<div class="instruction">Nenhuma Coordenação Regional cadastrada ainda.</div>';
        return;
    }

    const areasComVoluntario = new Set(okrDataCache.areaVolunteers.map(v => v.area_id));
    const periodoAtivo = okrDataCache.periods.find(p => p.id === getComandoPeriodId());
    const execucaoNoCiclo = periodoAtivo
        ? comandoExecucao.filter(c => {
            if (periodoAtivo.data_inicio && c.created_at < periodoAtivo.data_inicio) return false;
            if (periodoAtivo.data_fim && c.created_at > periodoAtivo.data_fim + 'T23:59:59') return false;
            return true;
        })
        : [];
    const areasComExecucao = new Set(execucaoNoCiclo.map(c => c.area_id));

    const linhas = comandoRankingCache.map(r => {
        const quadrantesDoProduto = okrDataCache.areas.filter(a => a.product_id === r.produto.id);
        const total = quadrantesDoProduto.length;
        const cobertos = quadrantesDoProduto.filter(a => areasComVoluntario.has(a.id)).length;
        const executados = quadrantesDoProduto.filter(a => areasComExecucao.has(a.id)).length;
        return {
            produto: r.produto,
            progresso: Math.round(r.progresso),
            pctCobertura: total ? Math.round((cobertos / total) * 100) : 0,
            pctExecucao: total ? Math.round((executados / total) * 100) : 0
        };
    });

    container.innerHTML = `
        <div class="table-container">
            <table>
                <thead>
                    <tr><th>Coordenação</th><th>RA</th><th>Progresso tático</th><th>Planejamento</th><th>Execução</th></tr>
                </thead>
                <tbody>
                    ${linhas.map(l => `
                        <tr>
                            <td>${l.produto.nome}</td>
                            <td>${l.produto.ra_nome}</td>
                            <td>${l.progresso}%</td>
                            <td>${l.pctCobertura}%</td>
                            <td>${l.pctExecucao}%</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
}

function renderComandoRadar() {
    const prazoContainer = document.getElementById('comando-radar-prazo');
    const agendaContainer = document.getElementById('comando-radar-agenda');
    const kpiContainer = document.getElementById('comando-kpi-prazo');
    if (!prazoContainer || !agendaContainer || !kpiContainer) return;

    const agora = new Date();
    const hojeISO = agora.toISOString().slice(0, 10);
    const futuros = prazosTSECache
        .filter(p => p.data >= hojeISO)
        .sort((a, b) => a.data.localeCompare(b.data))
        .slice(0, 5);
    const destaque = futuros.find(p => p.destaque) || futuros[0] || null;

    if (!destaque) {
        prazoContainer.innerHTML = '<div class="instruction">Nenhum prazo futuro no calendário do TSE.</div>';
        kpiContainer.innerHTML = '<span class="comando-kpi-label">⏳ Próximo prazo</span><strong class="comando-kpi-value">—</strong>';
    } else {
        const dias = Math.max(0, Math.round((new Date(destaque.data + 'T00:00:00') - new Date(hojeISO + 'T00:00:00')) / (24 * 60 * 60 * 1000)));
        kpiContainer.innerHTML = `
            <span class="comando-kpi-label">⏳ Próximo prazo</span>
            <strong class="comando-kpi-value">${dias}d</strong>
            <span class="comando-kpi-sub">${destaque.titulo}</span>
        `;
        prazoContainer.innerHTML = `
            <div class="comando-destaque-prazo">
                <strong class="comando-destaque-dias">${dias} dia${dias !== 1 ? 's' : ''}</strong>
                <span>${destaque.titulo}</span>
                <span class="comando-item-sub">${formatPrazoDate(destaque.data)} · ${PRAZO_CATEGORIA_LABEL[destaque.categoria] || destaque.categoria}</span>
            </div>
        `;
    }

    const limite3Dias = new Date(agora.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString();
    const agoraISO = agora.toISOString();
    const proximos = agendaDataCache.eventos
        .filter(ev => ev.status === 'confirmado' && ev.data_hora >= agoraISO && ev.data_hora <= limite3Dias)
        .sort((a, b) => a.data_hora.localeCompare(b.data_hora));

    agendaContainer.innerHTML = proximos.length
        ? proximos.map(ev => `
            <div class="comando-item-row">
                <div class="comando-item-header"><span>${ev.titulo}</span><span class="comando-item-sub">${formatAgendaDateTime(ev.data_hora)}</span></div>
                <div class="okr-card-footer"><span>${[ev.local, ev.ra_nome].filter(Boolean).join(' · ')}</span></div>
            </div>
        `).join('')
        : '<div class="instruction">Nenhum compromisso confirmado nos próximos dias.</div>';
}
