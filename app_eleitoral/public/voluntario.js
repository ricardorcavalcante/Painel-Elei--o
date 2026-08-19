// voluntario.js — parte exclusiva de voluntario.html: check-in
// geolocalizado de campo (Fase 2 da reestruturação por papel).
//
// Extração literal de public/app.js:2380-2590 (módulo de check-in) —
// mesmas funções, mesmos nomes. Reaproveita okr-shared.js (carregado
// antes deste arquivo) pro cliente Supabase memoizado, okrCurrentUser/
// okrDataCache/loadOKRData()/findProduct() (o progresso tático mostrado
// aqui vem do mesmo cache do módulo de OKRs) e formatAgendaDateTime().
//
// Sem dependência de Google Maps — dentro_area é um teste de ponto-em-
// retângulo puramente client-side contra area.lat_min/lat_max/lng_min/
// lng_max, sem biblioteca de geometria nenhuma.

let checkinDataCache = { minhasAreas: [], meusCheckins: [] };

async function loadCheckinData() {
    const sb = initSupabaseClient();
    if (!sb) return;
    try {
        if (!okrDataCache.products.length) {
            await loadOKRData();
        }

        const [areaVolunteersRes, checkinsRes] = await Promise.all([
            sb.from('area_volunteers').select('area_id, areas(*)').eq('user_id', okrCurrentUser.id),
            sb.from('checkins').select('*, okr_artefatos(id, arquivo_url, tipo_artefato)').eq('user_id', okrCurrentUser.id).order('created_at', { ascending: false })
        ]);
        checkinDataCache.minhasAreas = (areaVolunteersRes.data || []).map(v => v.areas).filter(Boolean);
        checkinDataCache.meusCheckins = checkinsRes.data || [];

        renderCheckinProgresso();
        renderMeusQuadrantes();
        renderMeusCheckins();
    } catch (err) {
        console.warn('Erro ao carregar dados de check-in:', err);
    }
}

function renderCheckinProgresso() {
    const section = document.getElementById('checkin-progresso-section');
    const container = document.getElementById('checkin-progresso-container');
    if (!section || !container) return;

    const productIds = [...new Set(checkinDataCache.minhasAreas.map(a => a.product_id))];
    const objetivosTaticos = okrDataCache.objectives.filter(o => o.nivel === 'tatico' && productIds.includes(o.product_id));

    if (!objetivosTaticos.length) {
        section.style.display = 'block';
        container.innerHTML = '<div class="instruction">Nenhum objetivo tático cadastrado para sua Coordenação ainda.</div>';
        return;
    }
    section.style.display = 'block';

    container.innerHTML = objetivosTaticos.map(obj => {
        const produto = findProduct(obj.product_id);
        const krs = okrDataCache.keyResults.filter(kr => kr.objective_id === obj.id);
        const krsHtml = krs.map(kr => {
            const perc = kr.target_value ? Math.min(100, Math.round((kr.current_value / kr.target_value) * 100)) : 0;
            return `
                <div class="okr-kr-row">
                    <div class="okr-kr-row-header"><span>${kr.titulo}</span></div>
                    <div class="okr-progress-bar-container"><div class="okr-progress-bar progress-tatico" style="width: ${perc}%;"></div></div>
                    <div class="okr-card-footer"><span>${kr.current_value} / ${kr.target_value} ${kr.unit || ''}</span><strong>${perc}%</strong></div>
                </div>
            `;
        }).join('');
        return `
            <div class="okr-card okr-card-tatico">
                <div class="okr-card-header">
                    <span class="okr-badge badge-tatico">📌 ${produto ? produto.nome : 'Coordenação Regional'}</span>
                </div>
                <h4>${obj.titulo}</h4>
                <p>${obj.descricao || ''}</p>
                <div class="okr-progress-bar-container"><div class="okr-progress-bar" style="width: ${obj.progresso || 0}%;"></div></div>
                <div class="okr-card-footer"><span>Progresso do Objetivo</span><strong>${Math.round(obj.progresso || 0)}%</strong></div>
                ${krsHtml}
            </div>
        `;
    }).join('');
}

function renderMeusQuadrantes() {
    const section = document.getElementById('checkin-quadrantes-section');
    const container = document.getElementById('checkin-quadrantes-container');
    if (!section || !container) return;
    section.style.display = 'block';

    if (!checkinDataCache.minhasAreas.length) {
        container.innerHTML = '<div class="instruction">Você ainda não foi atribuído a nenhum quadrante. Fale com o coordenador da sua região.</div>';
        return;
    }

    container.innerHTML = checkinDataCache.minhasAreas.map(area => {
        const qtd = checkinDataCache.meusCheckins.filter(c => c.area_id === area.id).length;
        return `
            <div class="okr-card">
                <div class="okr-card-header">
                    <span class="okr-badge badge-tatico">🔲 ${area.codigo}</span>
                    <span class="okr-year">${qtd} check-in(s)</span>
                </div>
                <h4>${area.nome}</h4>
                <p>${area.ra_nome}</p>
                <button class="btn-primary" onclick="fazerCheckin('${area.id}')">📍 Fazer Check-in</button>
            </div>
        `;
    }).join('');
}

function renderMeusCheckins() {
    const section = document.getElementById('checkin-historico-section');
    const container = document.getElementById('checkin-historico-container');
    if (!section || !container) return;
    section.style.display = 'block';

    if (!checkinDataCache.meusCheckins.length) {
        container.innerHTML = '<div class="instruction">Nenhum check-in registrado ainda.</div>';
        return;
    }

    container.innerHTML = checkinDataCache.meusCheckins.map(c => {
        const area = checkinDataCache.minhasAreas.find(a => a.id === c.area_id);
        const artefato = Array.isArray(c.okr_artefatos) ? c.okr_artefatos[0] : c.okr_artefatos;
        const statusLabel = c.status === 'pendente' ? 'PENDENTE DE APROVAÇÃO' : (c.status === 'rejeitado' ? 'REJEITADO' : null);
        return `
            <div class="okr-card">
                <div class="okr-card-header">
                    <span class="okr-badge badge-tatico">🔲 ${area ? area.codigo : ''}</span>
                    <span class="status-tag ${c.dentro_area ? 'status-dentro' : 'status-fora'}">${c.dentro_area ? 'DENTRO DA ÁREA' : 'FORA DA ÁREA'}</span>
                </div>
                ${statusLabel ? `<span class="status-tag status-${c.status}">${statusLabel}</span>` : ''}
                <p>${c.descricao}</p>
                <div class="okr-card-footer"><span>${formatAgendaDateTime(c.created_at)}</span></div>
                ${c.resposta_aprovacao ? `<p><strong>Resposta do coordenador:</strong> ${c.resposta_aprovacao}</p>` : ''}
                ${artefato ? `<a href="${artefato.arquivo_url}" target="_blank" rel="noopener" class="btn-link">🔗 Ver comprovante</a>` : ''}
            </div>
        `;
    }).join('');
}

async function fazerCheckin(areaId) {
    const sb = initSupabaseClient();
    if (!sb) return;
    const area = checkinDataCache.minhasAreas.find(a => a.id === areaId);
    if (!area) return alert('Quadrante não encontrado.');
    if (!navigator.geolocation) return alert('Seu navegador não suporta geolocalização.');

    navigator.geolocation.getCurrentPosition(async (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        const dentro_area = lat >= area.lat_min && lat <= area.lat_max && lng >= area.lng_min && lng <= area.lng_max;

        const descricao = prompt(`Descreva a ação realizada no quadrante ${area.codigo}:`);
        if (!descricao) return;

        const status = dentro_area ? 'aprovado' : 'pendente';
        const { data: checkin, error } = await sb.from('checkins')
            .insert({ area_id: area.id, user_id: okrCurrentUser.id, descricao, lat, lng, dentro_area, status })
            .select().single();
        if (error) return alert('Erro: ' + error.message);

        alert(dentro_area
            ? 'Check-in registrado dentro do quadrante!'
            : 'Check-in registrado fora dos limites do quadrante — fica pendente até o coordenador aprovar.');

        if (confirm('Deseja anexar um arquivo como comprovante (foto, documento)?')) {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/*,application/pdf';
            input.onchange = () => uploadCheckinArtefato(checkin.id, input.files[0]);
            input.click();
        }

        await loadCheckinData();
    }, (err) => {
        alert('Não foi possível obter sua localização: ' + err.message);
    }, { enableHighAccuracy: true, timeout: 10000 });
}

async function uploadCheckinArtefato(checkinId, file) {
    const sb = initSupabaseClient();
    if (!sb || !file) return;
    const titulo = prompt('Título do comprovante:', file.name) || file.name;
    const path = `checkins/${checkinId}/${Date.now()}_${file.name}`;

    const { error: upErr } = await sb.storage.from('artefatos').upload(path, file);
    if (upErr) return alert('Erro no upload (verifique se o bucket "artefatos" existe no Supabase Storage): ' + upErr.message);

    const { data: pub } = sb.storage.from('artefatos').getPublicUrl(path);
    const tipo_artefato = file.type.startsWith('image/') ? 'foto' : 'comprovante';

    const { error } = await sb.from('okr_artefatos').insert({
        checkin_id: checkinId, titulo, arquivo_url: pub.publicUrl, tipo_artefato, enviado_por: okrCurrentUser.id
    });
    if (error) return alert('Erro: ' + error.message);
    await loadCheckinData();
}

// ------------------------------------------
// Bootstrap — chamado por voluntario.html depois que guardPage()
// (auth-shared.js) já confirmou papel voluntário (linha em
// area_volunteers). O app original não restringia esta aba por papel
// nenhum (qualquer usuário logado via — ver initCheckinModule); aqui
// restringimos a 'voluntario' porque é o destino de papel desta
// página, e um usuário sem nenhuma área atribuída não tem o que fazer
// nela (o estado vazio de renderMeusQuadrantes só seria alcançável por
// quem nunca deveria ter chegado até aqui).
// ------------------------------------------
async function initVoluntarioPage(sb, ctx) {
    seedSupabaseClient(sb);
    setOkrUser(ctx.profile, []);
    await loadCheckinData();
}
