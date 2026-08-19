// okrs.js — parte exclusiva de okrs.html: CRUD de Ciclo/Coordenação/
// Objetivo/Key Result, filtro por nível e Artefatos (Fase 2 da
// reestruturação por papel). Única superfície de escrita de OKRs.
//
// A leitura compartilhada com admin.html/candidata.html (lista de
// OKRs, Equipe, cliente Supabase memoizado) fica em okr-shared.js —
// carregado ANTES deste arquivo em okrs.html.

// ------------------------------------------
// Botões de ação — visibilidade conforme papel (super_admin vê tudo;
// coordenador só vê o que afeta a própria Coordenação; a proteção real
// contra escrita não autorizada é a RLS no banco).
// ------------------------------------------
function renderOKRActionButtons() {
    const box = document.getElementById('okr-btn-group');
    if (!box) return;
    if (!okrCurrentUser) {
        box.innerHTML = '';
        return;
    }
    const isAdmin = !!okrCurrentUser.is_super_admin;
    const hasProduct = okrUserProductIds.length > 0;
    let html = '';
    if (isAdmin) {
        html += `<button class="btn-secondary" onclick="openNewPeriodModal()">🗓️ Novo Ciclo</button>`;
        html += `<button class="btn-secondary" onclick="openNewProductModal()">🏷️ Nova Coordenação Regional</button>`;
        html += `<button class="btn-primary" onclick="openNewObjectiveModal('estrategico')">➕ Novo Objetivo Estratégico</button>`;
    }
    if (isAdmin || hasProduct) {
        html += `<button class="btn-primary" onclick="openNewObjectiveModal('tatico')">➕ Novo Objetivo Tático</button>`;
        html += `<button class="btn-secondary" onclick="openNewKRModal()">➕ Novo Key Result</button>`;
        html += `<button class="btn-secondary" onclick="openNewEquipeModal()">👥 Adicionar à Equipe</button>`;
        html += `<button class="btn-secondary" onclick="openArtefatoModal()">📄 Upload de Artefato</button>`;
    }
    box.innerHTML = html;
}

function filterOKRLevel(level) {
    currentOKRFilterLevel = level;
    document.querySelectorAll('.btn-filter-level').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.level === level);
    });
    renderOKRs();
    renderEquipe();
}

function changeOKRPeriod(periodId) {
    okrDataCache.activePeriodId = periodId;
    renderOKRs();
}

// ------------------------------------------
// Criação/edição (via Modal/pickFromList/Toast — Fase 3; a validação
// de permissão real é feita pela RLS)
// ------------------------------------------
async function openNewPeriodModal() {
    const sb = initSupabaseClient();
    if (!sb) return;

    const backdrop = openModal({
        title: 'Novo Ciclo',
        bodyHtml: `
            <div class="app-form-field">
                <label class="app-form-field-label" for="np-nome">Nome do ciclo</label>
                <input type="text" id="np-nome" class="app-form-input" placeholder='ex: "Semana 18-24/08"'>
            </div>
            <div class="app-form-field">
                <label class="app-form-field-label" for="np-tipo">Tipo de ciclo</label>
                <select id="np-tipo" class="app-form-select">
                    <option value="diario">Diário</option>
                    <option value="semanal" selected>Semanal</option>
                    <option value="mensal">Mensal</option>
                </select>
            </div>
            <div class="app-form-field" style="display:flex; gap:10px;">
                <div style="flex:1;">
                    <label class="app-form-field-label" for="np-inicio">Data de início</label>
                    <input type="date" id="np-inicio" class="app-form-input">
                </div>
                <div style="flex:1;">
                    <label class="app-form-field-label" for="np-fim">Data de fim</label>
                    <input type="date" id="np-fim" class="app-form-input">
                    <div class="app-form-hint">Opcional</div>
                </div>
            </div>
        `,
        buttons: [
            { label: 'Cancelar', variant: 'secondary' },
            {
                label: 'Criar', variant: 'primary', closeOnClick: false,
                onClick: async () => {
                    const nome = document.getElementById('np-nome').value.trim();
                    if (!nome) return showToast('Informe o nome do ciclo.', { type: 'warning' });
                    const tipo_ciclo = document.getElementById('np-tipo').value;
                    const data_inicio = document.getElementById('np-inicio').value;
                    if (!data_inicio) return showToast('Informe a data de início.', { type: 'warning' });
                    const data_fim = document.getElementById('np-fim').value || null;

                    const { error } = await sb.from('periods').insert({ nome, tipo_ciclo, data_inicio, data_fim, ativo: true });
                    if (error) return showToast('Erro: ' + error.message, { type: 'danger' });

                    closeModal();
                    showToast('Ciclo criado.', { type: 'success' });
                    await loadOKRData();
                }
            }
        ]
    });
    backdrop.querySelector('#np-inicio').value = new Date().toISOString().slice(0, 10);
}

async function openNewProductModal() {
    const sb = initSupabaseClient();
    if (!sb) return;

    openModal({
        title: 'Nova Coordenação Regional',
        bodyHtml: `
            <div class="app-form-field">
                <label class="app-form-field-label" for="npr-nome">Nome</label>
                <input type="text" id="npr-nome" class="app-form-input" placeholder='ex: "Coordenação Ceilândia Norte"'>
            </div>
            <div class="app-form-field">
                <label class="app-form-field-label" for="npr-ra">Região Administrativa</label>
                <input type="text" id="npr-ra" class="app-form-input" placeholder="ex: CEILÂNDIA">
            </div>
            <div class="app-form-field">
                <label class="app-form-field-label" for="npr-zona">Zona Eleitoral</label>
                <input type="text" id="npr-zona" class="app-form-input" placeholder="ex: 8">
                <div class="app-form-hint">Opcional</div>
            </div>
        `,
        buttons: [
            { label: 'Cancelar', variant: 'secondary' },
            {
                label: 'Criar', variant: 'primary', closeOnClick: false,
                onClick: async () => {
                    const nome = document.getElementById('npr-nome').value.trim();
                    if (!nome) return showToast('Informe o nome da Coordenação.', { type: 'warning' });
                    const ra_nome = document.getElementById('npr-ra').value.trim().toUpperCase();
                    if (!ra_nome) return showToast('RA é obrigatória.', { type: 'warning' });
                    const zona_eleitoral = document.getElementById('npr-zona').value.trim() || null;

                    const { error } = await sb.from('products').insert({ nome, ra_nome, zona_eleitoral });
                    if (error) return showToast('Erro: ' + error.message, { type: 'danger' });

                    closeModal();
                    showToast('Coordenação Regional criada.', { type: 'success' });
                    await loadOKRData();
                }
            }
        ]
    });
}

async function openNewObjectiveModal(nivel) {
    const sb = initSupabaseClient();
    if (!sb) return;
    if (!okrDataCache.activePeriodId) return showToast('Cadastre e selecione um ciclo antes.', { type: 'warning' });

    let product_id = null;
    if (nivel === 'tatico') {
        const disponiveis = okrCurrentUser.is_super_admin
            ? okrDataCache.products
            : okrDataCache.products.filter(p => okrUserProductIds.includes(p.id));
        if (!disponiveis.length) return showToast('Nenhuma Coordenação Regional disponível para você.', { type: 'warning' });
        const produto = await pickFromList('Escolha a Coordenação Regional', disponiveis, p => `${p.nome} (${p.ra_nome})`);
        if (!produto) return;
        product_id = produto.id;
    }

    openModal({
        title: `Novo Objetivo ${nivel === 'estrategico' ? 'Estratégico' : 'Tático'}`,
        bodyHtml: `
            <div class="app-form-field">
                <label class="app-form-field-label" for="no-titulo">Título</label>
                <input type="text" id="no-titulo" class="app-form-input">
            </div>
            <div class="app-form-field">
                <label class="app-form-field-label" for="no-descricao">Descrição</label>
                <textarea id="no-descricao" class="app-form-textarea" placeholder="Opcional"></textarea>
            </div>
        `,
        buttons: [
            { label: 'Cancelar', variant: 'secondary' },
            {
                label: 'Criar', variant: 'primary', closeOnClick: false,
                onClick: async () => {
                    const titulo = document.getElementById('no-titulo').value.trim();
                    if (!titulo) return showToast('Informe o título do objetivo.', { type: 'warning' });
                    const descricao = document.getElementById('no-descricao').value.trim() || null;

                    const { error } = await sb.from('objectives').insert({
                        titulo, descricao, nivel, product_id,
                        period_id: okrDataCache.activePeriodId,
                        created_by: okrCurrentUser.id
                    });
                    if (error) return showToast('Erro: ' + error.message, { type: 'danger' });

                    closeModal();
                    showToast('Objetivo criado.', { type: 'success' });
                    await loadOKRData();
                }
            }
        ]
    });
}

async function openNewKRModal() {
    const sb = initSupabaseClient();
    if (!sb) return;
    if (!okrDataCache.objectives.length) return showToast('Cadastre um objetivo antes.', { type: 'warning' });

    const objective = await pickFromList('Vincular a qual Objetivo?', okrDataCache.objectives, o => `[${o.nivel}] ${o.titulo}`);
    if (!objective) return;

    const backdrop = openModal({
        title: 'Novo Key Result',
        bodyHtml: `
            <div class="app-form-field">
                <label class="app-form-field-label" for="nkr-titulo">Título</label>
                <input type="text" id="nkr-titulo" class="app-form-input">
            </div>
            <div class="app-form-field" style="display:flex; gap:10px;">
                <div style="flex:1;">
                    <label class="app-form-field-label" for="nkr-meta">Valor alvo (meta)</label>
                    <input type="number" id="nkr-meta" class="app-form-input">
                </div>
                <div style="flex:1;">
                    <label class="app-form-field-label" for="nkr-unit">Unidade</label>
                    <input type="text" id="nkr-unit" class="app-form-input" placeholder="ex: %, pessoas, reuniões">
                </div>
            </div>
        `,
        buttons: [
            { label: 'Cancelar', variant: 'secondary' },
            {
                label: 'Criar', variant: 'primary', closeOnClick: false,
                onClick: async () => {
                    const titulo = document.getElementById('nkr-titulo').value.trim();
                    if (!titulo) return showToast('Informe o título do Key Result.', { type: 'warning' });
                    const target_value = parseFloat(document.getElementById('nkr-meta').value) || 100;
                    const unit = document.getElementById('nkr-unit').value.trim() || 'unidades';

                    const { error } = await sb.from('key_results').insert({
                        objective_id: objective.id, titulo, target_value, current_value: 0, unit
                    });
                    if (error) return showToast('Erro: ' + error.message, { type: 'danger' });

                    closeModal();
                    showToast('Key Result criado.', { type: 'success' });
                    await loadOKRData();
                }
            }
        ]
    });
    backdrop.querySelector('#nkr-meta').value = '100';
    backdrop.querySelector('#nkr-unit').value = 'unidades';
}

async function updateKeyResultProgress(keyResultId) {
    const sb = initSupabaseClient();
    if (!sb) return;

    openModal({
        title: 'Atualizar valor atual',
        bodyHtml: `
            <div class="app-form-field">
                <label class="app-form-field-label" for="ukr-valor">Novo valor atual</label>
                <input type="number" id="ukr-valor" class="app-form-input">
            </div>
        `,
        buttons: [
            { label: 'Cancelar', variant: 'secondary' },
            {
                label: 'Salvar', variant: 'primary', closeOnClick: false,
                onClick: async () => {
                    const novo = document.getElementById('ukr-valor').value;
                    if (novo === '') return showToast('Informe o novo valor.', { type: 'warning' });
                    const { error } = await sb.from('key_results').update({ current_value: parseFloat(novo) || 0 }).eq('id', keyResultId);
                    if (error) return showToast('Erro: ' + error.message, { type: 'danger' });

                    closeModal();
                    showToast('Valor atualizado.', { type: 'success' });
                    await loadOKRData();
                }
            }
        ]
    });
}

async function openArtefatoModal() {
    if (!okrDataCache.keyResults.length) return showToast('Cadastre um Key Result antes.', { type: 'warning' });
    const kr = await pickFromList('Vincular artefato a qual Key Result?', okrDataCache.keyResults, kr => kr.titulo);
    if (!kr) return;

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,application/pdf';
    input.onchange = () => uploadArtefato(kr.id, input.files[0]);
    input.click();
}

async function uploadArtefato(keyResultId, file) {
    const sb = initSupabaseClient();
    if (!sb || !file) return;

    const backdrop = openModal({
        title: 'Upload de Artefato',
        bodyHtml: `
            <div class="app-form-field">
                <label class="app-form-field-label" for="ua-titulo">Título</label>
                <input type="text" id="ua-titulo" class="app-form-input">
            </div>
            <div class="app-form-field">
                <label class="app-form-field-label" for="ua-descricao">Descrição</label>
                <textarea id="ua-descricao" class="app-form-textarea" placeholder="Opcional"></textarea>
            </div>
        `,
        buttons: [
            { label: 'Cancelar', variant: 'secondary' },
            {
                label: 'Enviar', variant: 'primary', closeOnClick: false,
                onClick: async () => {
                    const titulo = document.getElementById('ua-titulo').value.trim() || file.name;
                    const descricao = document.getElementById('ua-descricao').value.trim() || null;
                    const path = `${keyResultId}/${Date.now()}_${file.name}`;

                    const { error: upErr } = await sb.storage.from('artefatos').upload(path, file);
                    if (upErr) return showToast('Erro no upload (verifique se o bucket "artefatos" existe no Supabase Storage): ' + upErr.message, { type: 'danger' });

                    const { data: pub } = sb.storage.from('artefatos').getPublicUrl(path);
                    const tipo_artefato = file.type.startsWith('image/') ? 'foto' : 'comprovante';

                    const { error } = await sb.from('okr_artefatos').insert({
                        key_result_id: keyResultId, titulo, descricao,
                        arquivo_url: pub.publicUrl, tipo_artefato, enviado_por: okrCurrentUser.id
                    });
                    if (error) return showToast('Erro: ' + error.message, { type: 'danger' });

                    closeModal();
                    showToast('Artefato enviado.', { type: 'success' });
                    await loadOKRData();
                }
            }
        ]
    });
    backdrop.querySelector('#ua-titulo').value = file.name;
}

// ------------------------------------------
// Bootstrap — chamado por okrs.html depois que guardPage()
// (auth-shared.js) já confirmou papel super_admin ou coordenador.
// ------------------------------------------
async function initOkrsPage(sb, ctx) {
    seedSupabaseClient(sb);
    setOkrUser(ctx.profile, ctx.coordProductIds);
    renderOKRActionButtons();
    await loadOKRData();
}
