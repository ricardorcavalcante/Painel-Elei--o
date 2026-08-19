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
// Criação/edição (formulários simples via prompt(), consistente com o
// resto do painel — a validação de permissão real é feita pela RLS)
// ------------------------------------------
async function openNewPeriodModal() {
    const sb = initSupabaseClient();
    if (!sb) return;
    const nome = prompt('Nome do ciclo (ex: "Semana 18-24/08"):');
    if (!nome) return;
    const tipo_ciclo = (prompt('Tipo de ciclo: diario, semanal ou mensal', 'semanal') || 'semanal').toLowerCase();
    const data_inicio = prompt('Data de início (AAAA-MM-DD):', new Date().toISOString().slice(0, 10));
    if (!data_inicio) return;
    const data_fim = prompt('Data de fim (AAAA-MM-DD, opcional):') || null;
    const { error } = await sb.from('periods').insert({ nome, tipo_ciclo, data_inicio, data_fim, ativo: true });
    if (error) return alert('Erro: ' + error.message);
    await loadOKRData();
}

async function openNewProductModal() {
    const sb = initSupabaseClient();
    if (!sb) return;
    const nome = prompt('Nome da Coordenação Regional (ex: "Coordenação Ceilândia Norte"):');
    if (!nome) return;
    const ra_nome = (prompt('Região Administrativa (ex: CEILÂNDIA):') || '').toUpperCase();
    if (!ra_nome) return alert('RA é obrigatória.');
    const zona_eleitoral = prompt('Zona Eleitoral (ex: 8):') || null;
    const { error } = await sb.from('products').insert({ nome, ra_nome, zona_eleitoral });
    if (error) return alert('Erro: ' + error.message);
    await loadOKRData();
}

async function openNewObjectiveModal(nivel) {
    const sb = initSupabaseClient();
    if (!sb) return;
    if (!okrDataCache.activePeriodId) return alert('Cadastre e selecione um ciclo antes.');

    const titulo = prompt(`Título do Objetivo ${nivel === 'estrategico' ? 'Estratégico' : 'Tático'}:`);
    if (!titulo) return;
    const descricao = prompt('Descrição (opcional):') || null;

    let product_id = null;
    if (nivel === 'tatico') {
        const disponiveis = okrCurrentUser.is_super_admin
            ? okrDataCache.products
            : okrDataCache.products.filter(p => okrUserProductIds.includes(p.id));
        if (!disponiveis.length) return alert('Nenhuma Coordenação Regional disponível para você.');
        const opcoes = disponiveis.map((p, i) => `${i + 1}. ${p.nome} (${p.ra_nome})`).join('\n');
        const escolha = prompt(`Escolha a Coordenação Regional:\n${opcoes}`);
        const idx = parseInt(escolha, 10) - 1;
        if (isNaN(idx) || !disponiveis[idx]) return alert('Coordenação inválida.');
        product_id = disponiveis[idx].id;
    }

    const { error } = await sb.from('objectives').insert({
        titulo, descricao, nivel, product_id,
        period_id: okrDataCache.activePeriodId,
        created_by: okrCurrentUser.id
    });
    if (error) return alert('Erro: ' + error.message);
    await loadOKRData();
}

async function openNewKRModal() {
    const sb = initSupabaseClient();
    if (!sb) return;
    if (!okrDataCache.objectives.length) return alert('Cadastre um objetivo antes.');

    const opcoes = okrDataCache.objectives.map((o, i) => `${i + 1}. [${o.nivel}] ${o.titulo}`).join('\n');
    const escolha = prompt(`Vincular a qual Objetivo?\n${opcoes}`);
    const idx = parseInt(escolha, 10) - 1;
    const objective = okrDataCache.objectives[idx];
    if (!objective) return alert('Objetivo inválido.');

    const titulo = prompt('Título do Key Result:');
    if (!titulo) return;
    const target_value = parseFloat(prompt('Valor alvo (meta):', '100')) || 100;
    const unit = prompt('Unidade (ex: %, pessoas, reuniões):', 'unidades') || 'unidades';

    const { error } = await sb.from('key_results').insert({
        objective_id: objective.id, titulo, target_value, current_value: 0, unit
    });
    if (error) return alert('Erro: ' + error.message);
    await loadOKRData();
}

async function updateKeyResultProgress(keyResultId) {
    const sb = initSupabaseClient();
    if (!sb) return;
    const novo = prompt('Novo valor atual:');
    if (novo === null || novo === '') return;
    const { error } = await sb.from('key_results').update({ current_value: parseFloat(novo) || 0 }).eq('id', keyResultId);
    if (error) return alert('Erro: ' + error.message);
    await loadOKRData();
}

function openArtefatoModal() {
    if (!okrDataCache.keyResults.length) return alert('Cadastre um Key Result antes.');
    const opcoes = okrDataCache.keyResults.map((kr, i) => `${i + 1}. ${kr.titulo}`).join('\n');
    const escolha = prompt(`Vincular artefato a qual Key Result?\n${opcoes}`);
    const idx = parseInt(escolha, 10) - 1;
    const kr = okrDataCache.keyResults[idx];
    if (!kr) return alert('Key Result inválido.');

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,application/pdf';
    input.onchange = () => uploadArtefato(kr.id, input.files[0]);
    input.click();
}

async function uploadArtefato(keyResultId, file) {
    const sb = initSupabaseClient();
    if (!sb || !file) return;
    const titulo = prompt('Título do artefato:', file.name) || file.name;
    const descricao = prompt('Descrição (opcional):') || null;
    const path = `${keyResultId}/${Date.now()}_${file.name}`;

    const { error: upErr } = await sb.storage.from('artefatos').upload(path, file);
    if (upErr) return alert('Erro no upload (verifique se o bucket "artefatos" existe no Supabase Storage): ' + upErr.message);

    const { data: pub } = sb.storage.from('artefatos').getPublicUrl(path);
    const tipo_artefato = file.type.startsWith('image/') ? 'foto' : 'comprovante';

    const { error } = await sb.from('okr_artefatos').insert({
        key_result_id: keyResultId, titulo, descricao,
        arquivo_url: pub.publicUrl, tipo_artefato, enviado_por: okrCurrentUser.id
    });
    if (error) return alert('Erro: ' + error.message);
    await loadOKRData();
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
