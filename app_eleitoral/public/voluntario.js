// voluntario.js — parte exclusiva de voluntario.html: mapa do(s)
// quadrante(s) do voluntário (somente leitura) e o Formulário de Ação
// de Campo (check-in geolocalizado, agora com tipo de ação, métricas,
// captação de contato/liderança pro CRM, percepção da rua e depoimento
// livre — ver SQL_CONSOLIDADO_FALTANTE.sql Parte 12).
//
// Reaproveita okr-shared.js (carregado antes deste arquivo) pro cliente
// Supabase memoizado, okrCurrentUser/okrDataCache/loadOKRData()/
// findProduct() e formatAgendaDateTime().
//
// dentro_area continua um teste de ponto-em-retângulo puramente
// client-side contra area.lat_min/lat_max/lng_min/lng_max — o Maps
// JS API aqui é só pra desenhar o(s) quadrante(s) na tela, não pro
// cálculo de dentro/fora.

let checkinDataCache = { minhasAreas: [], meusCheckins: [] };

const TIPO_ACAO_LABEL = {
    visita_domiciliar: 'Visita Domiciliar / Reunião de Casa em Casa',
    panfletagem: 'Panfletagem / Blitz em Ponto Comercial ou Feira',
    bandeiraco: 'Bandeiraço / Ação de Cruzamento',
    reuniao_quadra: 'Organização / Apoio em Reunião de Quadra',
    abordagem_pesquisa: 'Abordagem / Pesquisa Qualitativa de Rua'
};

const NIVEL_INTERESSE_LABEL = {
    simpatizante: '🟢 Simpatizante / Voto Certo',
    indeciso: '🟡 Indeciso / Receptivo',
    resistente: '🔴 Resistente / Neutro',
    lideranca: '⭐ Potencial Liderança / Multiplicador'
};

const PAUTA_LABEL = {
    saude: 'Saúde', transporte_infra: 'Transporte/Infra', seguranca: 'Segurança',
    educacao: 'Educação', outro: 'Outro'
};

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
        renderVoluntarioMapaEQuadrantes();
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

// ------------------------------------------
// Mapa (somente leitura) — ajuda o voluntário a confirmar visualmente
// em qual quadrante está, junto com o seletor por código (ex: "SOB-81").
// Sem drag-select nem edição nenhuma, ao contrário do mapa de
// coordenador.html — aqui é só orientação.
// ------------------------------------------
const LIGHT_MAP_STYLE = [
    { elementType: 'geometry', stylers: [{ color: '#f5f5f5' }] },
    { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
    { elementType: 'labels.text.fill', stylers: [{ color: '#616161' }] },
    { elementType: 'labels.text.stroke', stylers: [{ color: '#f5f5f5' }] },
    { featureType: 'administrative.land_parcel', stylers: [{ visibility: 'off' }] },
    { featureType: 'poi', stylers: [{ visibility: 'off' }] },
    { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
    { featureType: 'road.arterial', elementType: 'labels.text.fill', stylers: [{ color: '#757575' }] },
    { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#dadada' }] },
    { featureType: 'transit', stylers: [{ visibility: 'off' }] },
    { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#c9e6f0' }] }
];

let voluntarioMap = null;
let voluntarioMapRectangles = {};
let voluntarioQuadranteSelecionadoId = null;

function initVoluntarioMap() {
    const container = document.getElementById('checkin-map');
    if (!container || voluntarioMap || typeof google === 'undefined') return;
    voluntarioMap = new google.maps.Map(container, {
        center: { lat: -15.793889, lng: -47.882778 },
        zoom: 13,
        styles: LIGHT_MAP_STYLE,
        streetViewControl: false,
        mapTypeControl: false,
        fullscreenControl: false
    });
}

function renderVoluntarioMapaEQuadrantes() {
    const section = document.getElementById('checkin-mapa-section');
    const select = document.getElementById('checkin-quadrante-select');
    if (!section || !select) return;

    if (!checkinDataCache.minhasAreas.length) {
        section.style.display = 'none';
        return;
    }
    section.style.display = 'block';

    select.innerHTML = checkinDataCache.minhasAreas.map(a => `<option value="${a.id}">${a.codigo} — ${a.nome}</option>`).join('');
    if (!voluntarioQuadranteSelecionadoId || !checkinDataCache.minhasAreas.some(a => a.id === voluntarioQuadranteSelecionadoId)) {
        voluntarioQuadranteSelecionadoId = checkinDataCache.minhasAreas[0].id;
    }
    select.value = voluntarioQuadranteSelecionadoId;

    // Sem chave/API bloqueada: o resto da página funciona igual, só o
    // mapa em si fica em branco (mesmo padrão de index.html/coordenador.html).
    if (typeof google === 'undefined') return;
    initVoluntarioMap();
    if (!voluntarioMap) return;

    Object.values(voluntarioMapRectangles).forEach(rect => rect.setMap(null));
    voluntarioMapRectangles = {};

    checkinDataCache.minhasAreas.forEach(area => {
        const selecionado = area.id === voluntarioQuadranteSelecionadoId;
        const rect = new google.maps.Rectangle({
            bounds: { north: area.lat_max, south: area.lat_min, east: area.lng_max, west: area.lng_min },
            map: voluntarioMap,
            strokeColor: selecionado ? '#0F5C5B' : '#8AA6A5',
            strokeWeight: selecionado ? 4 : 2,
            fillColor: selecionado ? '#0F5C5B' : '#8AA6A5',
            fillOpacity: selecionado ? 0.35 : 0.15
        });
        rect.addListener('click', () => selecionarQuadranteNoMapa(area.id));
        voluntarioMapRectangles[area.id] = rect;
    });

    setTimeout(() => google.maps.event.trigger(voluntarioMap, 'resize'), 50);
    centralizarQuadranteSelecionado();
}

function centralizarQuadranteSelecionado() {
    const area = checkinDataCache.minhasAreas.find(a => a.id === voluntarioQuadranteSelecionadoId);
    if (!area || !voluntarioMap) return;
    const bounds = new google.maps.LatLngBounds(
        { lat: area.lat_min, lng: area.lng_min },
        { lat: area.lat_max, lng: area.lng_max }
    );
    voluntarioMap.fitBounds(bounds, 60);
}

function selecionarQuadranteNoMapa(areaId) {
    voluntarioQuadranteSelecionadoId = areaId;
    const select = document.getElementById('checkin-quadrante-select');
    if (select) select.value = areaId;
    Object.entries(voluntarioMapRectangles).forEach(([id, rect]) => {
        const selecionado = id === areaId;
        rect.setOptions({
            strokeColor: selecionado ? '#0F5C5B' : '#8AA6A5',
            strokeWeight: selecionado ? 4 : 2,
            fillColor: selecionado ? '#0F5C5B' : '#8AA6A5',
            fillOpacity: selecionado ? 0.35 : 0.15
        });
    });
    centralizarQuadranteSelecionado();
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
                    <span class="okr-year">${qtd} ação(ões)</span>
                </div>
                <h4>${area.nome}</h4>
                <p>${area.ra_nome}</p>
                <button class="btn-primary" onclick="fazerCheckin('${area.id}')">📍 Registrar Ação de Campo</button>
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
        container.innerHTML = '<div class="instruction">Nenhuma ação de campo registrada ainda.</div>';
        return;
    }

    container.innerHTML = checkinDataCache.meusCheckins.map(c => {
        const area = checkinDataCache.minhasAreas.find(a => a.id === c.area_id);
        const artefatos = Array.isArray(c.okr_artefatos) ? c.okr_artefatos : (c.okr_artefatos ? [c.okr_artefatos] : []);
        const statusLabel = c.status === 'pendente' ? 'PENDENTE DE APROVAÇÃO' : (c.status === 'rejeitado' ? 'REJEITADO' : null);
        return `
            <div class="okr-card">
                <div class="okr-card-header">
                    <span class="okr-badge badge-tatico">🔲 ${area ? area.codigo : ''}</span>
                    <span class="status-tag ${c.dentro_area ? 'status-dentro' : 'status-fora'}">${c.dentro_area ? 'DENTRO DA ÁREA' : 'FORA DA ÁREA'}</span>
                </div>
                ${statusLabel ? `<span class="status-tag status-${c.status}">${statusLabel}</span>` : ''}
                ${c.tipo_acao ? `<p class="okr-coords-list" style="margin: 8px 0 4px;">${TIPO_ACAO_LABEL[c.tipo_acao] || c.tipo_acao}</p>` : ''}
                <p>${c.descricao}</p>
                ${c.pessoas_impactadas != null || c.apoiadores_cadastrados ? `<p class="okr-card-footer" style="display:block;">${c.pessoas_impactadas != null ? `👥 ${c.pessoas_impactadas} impactado(s)` : ''}${c.apoiadores_cadastrados ? ` · ✅ ${c.apoiadores_cadastrados} apoiador(es) cadastrado(s)` : ''}</p>` : ''}
                ${c.receptividade ? `<p style="margin: 4px 0; color: var(--warning, #B15C00);">${'★'.repeat(c.receptividade)}${'☆'.repeat(5 - c.receptividade)}</p>` : ''}
                ${c.pautas_locais && c.pautas_locais.length ? `<p class="okr-coords-list">🗣️ ${c.pautas_locais.map(p => PAUTA_LABEL[p] || p).join(', ')}</p>` : ''}
                ${c.depoimento ? `<p><em>"${c.depoimento}"</em></p>` : ''}
                ${c.contato_nome ? `<p><strong>Contato captado:</strong> ${c.contato_nome}${c.contato_nivel_interesse ? ' — ' + (NIVEL_INTERESSE_LABEL[c.contato_nivel_interesse] || c.contato_nivel_interesse) : ''}</p>` : ''}
                <div class="okr-card-footer"><span>${formatAgendaDateTime(c.created_at)}</span></div>
                ${c.resposta_aprovacao ? `<p><strong>Resposta do coordenador:</strong> ${c.resposta_aprovacao}</p>` : ''}
                ${artefatos.map(art => `<a href="${art.arquivo_url}" target="_blank" rel="noopener" class="btn-link" style="display:block;">🔗 ${art.tipo_artefato === 'foto' ? 'Ver foto/vídeo' : 'Ver comprovante'}</a>`).join('')}
            </div>
        `;
    }).join('');
}

// ------------------------------------------
// Formulário de Ação de Campo / Visita do Voluntário — substitui o
// antigo check-in de descrição livre única. Só Tipo de Ação, Apoiadores
// Cadastrados e a Foto/Vídeo da ação são obrigatórios (o resto é
// contexto opcional) — decisão de usabilidade pra não travar o
// trabalho de rua.
// ------------------------------------------
async function fazerCheckin(areaId) {
    const sb = initSupabaseClient();
    if (!sb) return;
    const area = checkinDataCache.minhasAreas.find(a => a.id === areaId);
    if (!area) return showToast('Quadrante não encontrado.', { type: 'danger' });
    if (!navigator.geolocation) return showToast('Seu navegador não suporta geolocalização.', { type: 'danger' });

    navigator.geolocation.getCurrentPosition(async (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        const dentro_area = lat >= area.lat_min && lat <= area.lat_max && lng >= area.lng_min && lng <= area.lng_max;

        const backdrop = openModal({
            title: `Ação de Campo — quadrante ${area.codigo}`,
            bodyHtml: `
                <p class="app-form-hint" style="margin: 0 0 14px;">📍 ${area.nome} · ${area.ra_nome}</p>

                <h4 style="margin: 0 0 8px; font-size: 0.85rem; color: var(--primary, #0F5C5B);">1. Dados da Ação</h4>
                <div class="app-form-field">
                    <label class="app-form-field-label" for="fc-tipo-acao">Tipo de Ação Realizada *</label>
                    <select id="fc-tipo-acao" class="app-form-select">
                        <option value="">— Selecione —</option>
                        <option value="visita_domiciliar">Visita Domiciliar / Reunião de Casa em Casa</option>
                        <option value="panfletagem">Panfletagem / Blitz em Ponto Comercial ou Feira</option>
                        <option value="bandeiraco">Bandeiraço / Ação de Cruzamento</option>
                        <option value="reuniao_quadra">Organização / Apoio em Reunião de Quadra</option>
                        <option value="abordagem_pesquisa">Abordagem / Pesquisa Qualitativa de Rua</option>
                    </select>
                </div>
                <div class="app-form-field">
                    <label class="app-form-field-label" for="fc-local-exato">Local Exato / Ponto de Referência</label>
                    <input type="text" id="fc-local-exato" class="app-form-input" placeholder="Ex: Feira Central, Quadra 04 Conjunto B">
                </div>

                <h4 style="margin: 18px 0 8px; font-size: 0.85rem; color: var(--primary, #0F5C5B);">2. Métricas da Atividade</h4>
                <div class="app-form-field" style="display:flex; gap:10px;">
                    <div style="flex:1;">
                        <label class="app-form-field-label" for="fc-pessoas">Pessoas Impactadas</label>
                        <input type="number" id="fc-pessoas" class="app-form-input" min="0" inputmode="numeric">
                    </div>
                    <div style="flex:1;">
                        <label class="app-form-field-label" for="fc-panfletos">Panfletos Distribuídos</label>
                        <input type="number" id="fc-panfletos" class="app-form-input" min="0" inputmode="numeric">
                    </div>
                </div>
                <div class="app-form-field">
                    <label class="app-form-field-label" for="fc-apoiadores">Apoiadores Cadastrados no Momento *</label>
                    <input type="number" id="fc-apoiadores" class="app-form-input" min="0" inputmode="numeric">
                </div>

                <h4 style="margin: 18px 0 8px; font-size: 0.85rem; color: var(--primary, #0F5C5B);">3. Contato Novo / Apoiador Destaque</h4>
                <p class="app-form-hint" style="margin: 0 0 10px;">Opcional — preencha se a visita resultou numa nova liderança ou eleitor com alto potencial.</p>
                <div class="app-form-field">
                    <label class="app-form-field-label" for="fc-contato-nome">Nome do Eleitor / Liderança</label>
                    <input type="text" id="fc-contato-nome" class="app-form-input">
                </div>
                <div class="app-form-field">
                    <label class="app-form-field-label" for="fc-contato-whatsapp">WhatsApp de Contato</label>
                    <input type="tel" id="fc-contato-whatsapp" class="app-form-input" placeholder="(61) 90000-0000">
                </div>
                <div class="app-form-field">
                    <label class="app-form-field-label" for="fc-nivel-interesse">Nível de Interesse Demonstrado</label>
                    <select id="fc-nivel-interesse" class="app-form-select">
                        <option value="">—</option>
                        <option value="simpatizante">🟢 Simpatizante / Voto Certo</option>
                        <option value="indeciso">🟡 Indeciso / Receptivo</option>
                        <option value="resistente">🔴 Resistente / Neutro</option>
                        <option value="lideranca">⭐ Potencial Liderança / Multiplicador</option>
                    </select>
                </div>

                <h4 style="margin: 18px 0 8px; font-size: 0.85rem; color: var(--primary, #0F5C5B);">4. Percepção da Rua</h4>
                <div class="app-form-field">
                    <label class="app-form-field-label">Principal assunto/reclamação dos moradores</label>
                    <div class="app-checkbox-list">
                        <label><input type="checkbox" value="saude" class="fc-pauta"> Saúde / Posto de Saúde local</label>
                        <label><input type="checkbox" value="transporte_infra" class="fc-pauta"> Transporte / Iluminação / Infraestrutura</label>
                        <label><input type="checkbox" value="seguranca" class="fc-pauta"> Segurança Pública</label>
                        <label><input type="checkbox" value="educacao" class="fc-pauta"> Educação / Creche</label>
                        <label><input type="checkbox" id="fc-pauta-outro-check"> Outro</label>
                    </div>
                    <input type="text" id="fc-pauta-outro-texto" class="app-form-input" style="margin-top:6px;" placeholder="Qual?">
                </div>
                <div class="app-form-field">
                    <label class="app-form-field-label">Receptividade do candidato na área</label>
                    <div class="app-star-rating" id="fc-receptividade-stars" data-value="0">
                        <span data-star="1">★</span><span data-star="2">★</span><span data-star="3">★</span><span data-star="4">★</span><span data-star="5">★</span>
                    </div>
                </div>
                <div class="app-form-field">
                    <label class="app-form-field-label" for="fc-depoimento">Observação / depoimento marcante da rua</label>
                    <textarea id="fc-depoimento" class="app-form-textarea" placeholder="Opcional — escreva livremente, boas histórias ajudam nas redes sociais"></textarea>
                </div>

                <h4 style="margin: 18px 0 8px; font-size: 0.85rem; color: var(--primary, #0F5C5B);">5. Mídia</h4>
                <div class="app-form-field">
                    <label class="app-form-field-label" for="fc-foto">Foto/Vídeo da Ação *</label>
                    <input type="file" id="fc-foto" class="app-form-input" accept="image/*,video/*" capture="environment">
                </div>
                <div class="app-form-field">
                    <label class="app-form-field-label" for="fc-fichas">Fotos das Fichas de Cadastro Físicas</label>
                    <input type="file" id="fc-fichas" class="app-form-input" accept="image/*" multiple>
                    <div class="app-form-hint">Opcional — se vocês usam ficha de papel.</div>
                </div>
            `,
            buttons: [
                { label: 'Cancelar', variant: 'secondary' },
                {
                    label: 'Registrar', variant: 'primary', closeOnClick: false,
                    onClick: async () => {
                        const tipo_acao = document.getElementById('fc-tipo-acao').value;
                        const apoiadoresVal = document.getElementById('fc-apoiadores').value;
                        const fotoFile = document.getElementById('fc-foto').files[0];
                        if (!tipo_acao) return showToast('Escolha o tipo de ação realizada.', { type: 'warning' });
                        if (apoiadoresVal === '') return showToast('Informe a quantidade de apoiadores cadastrados (pode ser 0).', { type: 'warning' });
                        if (!fotoFile) return showToast('Anexe pelo menos 1 foto ou vídeo da ação.', { type: 'warning' });

                        const local_exato = document.getElementById('fc-local-exato').value.trim() || null;
                        const pessoasVal = document.getElementById('fc-pessoas').value;
                        const panfletosVal = document.getElementById('fc-panfletos').value;
                        const contato_nome = document.getElementById('fc-contato-nome').value.trim() || null;
                        const contato_whatsapp = document.getElementById('fc-contato-whatsapp').value.trim() || null;
                        const contato_nivel_interesse = document.getElementById('fc-nivel-interesse').value || null;
                        const pautas_locais = [...document.querySelectorAll('.fc-pauta:checked')].map(el => el.value);
                        const pautaOutroMarcado = document.getElementById('fc-pauta-outro-check').checked;
                        const pauta_outro = pautaOutroMarcado ? (document.getElementById('fc-pauta-outro-texto').value.trim() || null) : null;
                        if (pautaOutroMarcado) pautas_locais.push('outro');
                        const receptividadeVal = parseInt(document.getElementById('fc-receptividade-stars').dataset.value, 10);
                        const depoimento = document.getElementById('fc-depoimento').value.trim() || null;
                        const fichasFiles = [...document.getElementById('fc-fichas').files];

                        const status = dentro_area ? 'aprovado' : 'pendente';
                        const descricao = `${TIPO_ACAO_LABEL[tipo_acao]}${local_exato ? ' — ' + local_exato : ''}`;
                        const payload = {
                            area_id: area.id, user_id: okrCurrentUser.id, descricao, lat, lng, dentro_area, status,
                            tipo_acao, local_exato,
                            pessoas_impactadas: pessoasVal ? parseInt(pessoasVal, 10) : null,
                            panfletos_distribuidos: panfletosVal ? parseInt(panfletosVal, 10) : null,
                            apoiadores_cadastrados: parseInt(apoiadoresVal, 10) || 0,
                            contato_nome, contato_whatsapp, contato_nivel_interesse,
                            pautas_locais: pautas_locais.length ? pautas_locais : null, pauta_outro,
                            receptividade: receptividadeVal || null, depoimento
                        };

                        closeModal();
                        await enviarOuEnfileirarCheckin(payload, fotoFile, fichasFiles, dentro_area);
                    }
                }
            ]
        });

        const starsEl = backdrop.querySelector('#fc-receptividade-stars');
        starsEl.querySelectorAll('span').forEach(span => {
            span.addEventListener('click', () => {
                const valor = parseInt(span.dataset.star, 10);
                starsEl.dataset.value = String(valor);
                starsEl.querySelectorAll('span').forEach(s => s.classList.toggle('active', parseInt(s.dataset.star, 10) <= valor));
            });
        });
    }, (err) => {
        showToast('Não foi possível obter sua localização: ' + err.message, { type: 'danger' });
    }, { enableHighAccuracy: true, timeout: 10000 });
}

async function enviarArtefato(sb, checkinId, file, tipo_artefato, titulo) {
    const path = `checkins/${checkinId}/${Date.now()}_${file.name}`;
    const { error: upErr } = await sb.storage.from('artefatos').upload(path, file);
    if (upErr) throw upErr;
    const { data: pub } = sb.storage.from('artefatos').getPublicUrl(path);
    const { error } = await sb.from('okr_artefatos').insert({
        checkin_id: checkinId, titulo, arquivo_url: pub.publicUrl, tipo_artefato, enviado_por: okrCurrentUser.id
    });
    if (error) throw error;
}

function isNetworkError(err) {
    if (!navigator.onLine) return true;
    const msg = (err && err.message) ? String(err.message) : '';
    return /fetch|network/i.test(msg);
}

async function enviarOuEnfileirarCheckin(payload, fotoFile, fichasFiles, dentro_area) {
    const sb = initSupabaseClient();
    try {
        const { data: checkin, error } = await sb.from('checkins').insert(payload).select().single();
        if (error) throw error;

        await enviarArtefato(sb, checkin.id, fotoFile, 'foto', 'Foto/vídeo da ação');
        for (const f of fichasFiles) {
            await enviarArtefato(sb, checkin.id, f, 'comprovante', 'Ficha de cadastro');
        }

        showToast(dentro_area
            ? 'Ação de campo registrada!'
            : 'Registrado fora dos limites do quadrante — fica pendente até o coordenador aprovar.',
            { type: dentro_area ? 'success' : 'warning', duration: 6000 });
        await loadCheckinData();
    } catch (err) {
        if (isNetworkError(err)) {
            await enfileirarCheckinOffline(payload, fotoFile, fichasFiles);
            showToast('Sem conexão agora — a ação foi salva neste aparelho e será enviada automaticamente quando a internet voltar.', { type: 'warning', duration: 8000 });
        } else {
            showToast('Erro: ' + err.message, { type: 'danger' });
        }
    }
}

// ------------------------------------------
// Fila offline — não é um Service Worker/PWA completo (a página em si
// ainda precisa ter carregado com internet uma vez), mas cobre o caso
// real descrito: internet oscila NO MEIO da ação de campo. Guarda o
// payload + os arquivos (como data URL, já que localStorage não segura
// Blob) em localStorage; tenta reenviar sozinho quando o navegador
// dispara o evento 'online', e também uma vez no carregamento da página.
// ------------------------------------------
const CHECKIN_FILA_OFFLINE_KEY = 'painel_checkin_fila_offline';

function lerFilaCheckinOffline() {
    try { return JSON.parse(localStorage.getItem(CHECKIN_FILA_OFFLINE_KEY) || '[]'); }
    catch { return []; }
}

function salvarFilaCheckinOffline(fila) {
    try { localStorage.setItem(CHECKIN_FILA_OFFLINE_KEY, JSON.stringify(fila)); }
    catch (err) { console.warn('Não foi possível salvar a fila offline (armazenamento cheio?):', err); }
}

function arquivoParaDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
    });
}

function dataUrlParaArquivo(dataUrl, nome) {
    const [meta, base64] = dataUrl.split(',');
    const mimeMatch = meta.match(/:(.*?);/);
    const mime = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
    const bin = atob(base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new File([bytes], nome, { type: mime });
}

async function enfileirarCheckinOffline(payload, fotoFile, fichasFiles) {
    const fotoDataUrl = await arquivoParaDataUrl(fotoFile);
    const fichas = await Promise.all(fichasFiles.map(async f => ({ nome: f.name, dataUrl: await arquivoParaDataUrl(f) })));
    const fila = lerFilaCheckinOffline();
    fila.push({ payload, fotoNome: fotoFile.name, fotoDataUrl, fichas, enfileiradoEm: new Date().toISOString() });
    salvarFilaCheckinOffline(fila);
    renderFilaOfflineIndicador();
}

function renderFilaOfflineIndicador() {
    const el = document.getElementById('checkin-fila-offline');
    if (!el) return;
    const fila = lerFilaCheckinOffline();
    if (!fila.length) {
        el.style.display = 'none';
        return;
    }
    el.style.display = 'block';
    el.textContent = `📥 ${fila.length} ${fila.length > 1 ? 'ações de campo pendentes' : 'ação de campo pendente'} de envio — ${fila.length > 1 ? 'serão sincronizadas' : 'será sincronizada'} automaticamente quando a internet voltar.`;
}

async function tentarSincronizarFilaCheckinOffline() {
    const fila = lerFilaCheckinOffline();
    if (!fila.length || !navigator.onLine) return;
    const sb = initSupabaseClient();
    if (!sb) return;

    const restantes = [];
    let sincronizados = 0;
    for (const item of fila) {
        try {
            const { data: checkin, error } = await sb.from('checkins').insert(item.payload).select().single();
            if (error) throw error;
            await enviarArtefato(sb, checkin.id, dataUrlParaArquivo(item.fotoDataUrl, item.fotoNome), 'foto', 'Foto/vídeo da ação');
            for (const f of (item.fichas || [])) {
                await enviarArtefato(sb, checkin.id, dataUrlParaArquivo(f.dataUrl, f.nome), 'comprovante', 'Ficha de cadastro');
            }
            sincronizados++;
        } catch (err) {
            console.warn('Falha ao sincronizar ação de campo da fila offline, mantendo na fila:', err);
            restantes.push(item);
        }
    }
    salvarFilaCheckinOffline(restantes);
    renderFilaOfflineIndicador();
    if (sincronizados > 0) {
        showToast(`${sincronizados} ${sincronizados > 1 ? 'ações de campo sincronizadas' : 'ação de campo sincronizada'}.`, { type: 'success' });
        await loadCheckinData();
    }
}

window.addEventListener('online', tentarSincronizarFilaCheckinOffline);

// ------------------------------------------
// Bootstrap — chamado por voluntario.html depois que guardPage()
// (auth-shared.js) já confirmou papel voluntário (linha em
// area_volunteers).
// ------------------------------------------
async function initVoluntarioPage(sb, ctx) {
    seedSupabaseClient(sb);
    setOkrUser(ctx.profile, []);
    renderFilaOfflineIndicador();
    await loadCheckinData();
    await tentarSincronizarFilaCheckinOffline();
}
