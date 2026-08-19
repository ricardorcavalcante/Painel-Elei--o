// coordenador.js — parte exclusiva de coordenador.html: Equipe +
// Quadrantes (mapa com seleção por clique/arrasto), Grade Operacional
// (status/export/compartilhamento), KRs sob responsabilidade, Status
// de Agenda da região, Check-ins pendentes e Comparativo entre
// Regiões (Fase 2 da reestruturação por papel).
//
// Extração deliberadamente literal de public/app.js (mesmas funções,
// mesmos nomes) — a única mudança estrutural é o "portão de entrada":
// guardPage() (auth-shared.js) já resolveu sessão + papel antes de
// initCoordenadorPage(sb, ctx) ser chamado, então a parte de
// autenticação/guard de initPainelCoordenadorModule() não foi trazida
// pra cá (só o que vem depois dela).
//
// Reaproveita okr-shared.js (carregado antes deste arquivo): cliente
// Supabase memoizado, okrCurrentUser/okrDataCache/loadOKRData()
// (pra lista de Coordenações), fetchAllRows(), formatAgendaDateTime()
// e agendaTipoLabel() (do módulo de Agenda, usados por renderCoordAgenda
// e renderCoordCheckinsPendentes).
//
// Confirmado por auditoria (ver commit): este módulo NÃO depende do
// subsistema de contornos de RA (raLayer/urbanLayer/ruralAreaLayer) nem
// de google.maps.geometry — só desenha google.maps.Rectangle a partir
// de areas.lat_min/lat_max/lng_min/lng_max e faz interseção de bounds
// (LatLngBounds.intersects). Por isso o script do Maps JS API nesta
// página não carrega libraries=geometry.

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

// app.js instancia isto dentro de initMap() (aba Mapa) — aqui não tem
// #map nenhum, então instanciamos na primeira vez que o mapa do
// Coordenador existir (initCoordMap), antes de qualquer rect usar.
let sharedInfoWindow;

let okrUserCoordProductIds = [];

let coordDataCache = {
    productId: null,
    periodId: null,
    periods: [],
    equipe: [],
    areas: [],
    areaVolunteers: [],
    perimetroStatus: [],
    objectives: [],
    keyResults: [],
    agenda: [],
    checkinsPendentes: [],
    comparativoLiberado: false
};
let coordRequestSeq = 0;
let coordMap = null;
let coordMapRectangles = {};
let coordMapMode = 'atribuir';
let coordSelectedAreaIds = new Set();
let coordMapFiltro = { tipo: null, valor: null };
let coordMapOverlayHelper = null;
let coordDragSelect = { active: false, startPixel: null, boxEl: null };

// ------------------------------------------
// Seleção de Coordenação (admin escolhe entre todas; coordenador só
// entre as que ele mesmo coordena)
// ------------------------------------------
function getCoordProductOptions() {
    if (okrCurrentUser && okrCurrentUser.is_super_admin) return okrDataCache.products;
    return okrDataCache.products.filter(p => okrUserCoordProductIds.includes(p.id));
}

function renderCoordSelector() {
    const box = document.getElementById('coord-selector-box');
    if (!box) return;
    const opcoes = getCoordProductOptions();
    if (opcoes.length <= 1) {
        box.style.display = 'none';
        return;
    }
    box.style.display = 'flex';
    box.innerHTML = `
        <label for="coord-product-select">Coordenação Regional:</label>
        <select id="coord-product-select" onchange="changeCoordProduct(this.value)">
            ${opcoes.map(p => `<option value="${p.id}" ${p.id === coordDataCache.productId ? 'selected' : ''}>${p.nome} (${p.ra_nome})</option>`).join('')}
        </select>
    `;
}

async function changeCoordProduct(productId) {
    coordDataCache.productId = productId;
    await loadCoordenadorData();
}

// ------------------------------------------
// Carregamento de dados da Coordenação selecionada
// ------------------------------------------
function renderCoordSkeleton() {
    ['coord-equipe-container', 'coord-quadrantes-container', 'coord-grade-container', 'coord-kr-container', 'coord-agenda-container', 'coord-checkins-pendentes-container', 'coord-comparativo-container'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = '<div class="instruction">Carregando…</div>';
    });
}

async function loadCoordenadorData() {
    renderCoordSkeleton();
    coordMapFiltro = { tipo: null, valor: null };
    const requestId = ++coordRequestSeq;
    await Promise.allSettled([
        fetchCoordEquipeEAreas(),
        fetchCoordPerimetroStatus(),
        fetchCoordPeriodsEObjetivos(),
        fetchCoordAgenda(),
        fetchCoordCheckinsPendentes(),
        fetchCoordSettings()
    ]);
    if (requestId !== coordRequestSeq) return;
    renderCoordEquipeCobertura();
    renderCoordGradeOperacional();
    renderCoordKRs();
    renderCoordAgenda();
    renderCoordCheckinsPendentes();
    initCoordMap();
    setCoordMapMode(coordMapMode);
    await loadCoordComparativo(requestId);
    const shareBox = document.getElementById('coord-grade-share-box');
    if (shareBox) shareBox.style.display = 'none';
}

async function fetchCoordEquipeEAreas() {
    const sb = initSupabaseClient();
    try {
        const [teamRes, areasRes] = await Promise.all([
            sb.from('product_team').select('papel, user_id, profiles:user_id(full_name, email)').eq('product_id', coordDataCache.productId),
            sb.from('areas').select('id, codigo, nome, grupo_nome, lat_min, lat_max, lng_min, lng_max').eq('product_id', coordDataCache.productId).order('codigo')
        ]);
        coordDataCache.equipe = teamRes.data || [];
        coordDataCache.areas = areasRes.data || [];
        if (!coordDataCache.areas.length) {
            coordDataCache.areaVolunteers = [];
            return;
        }
        const { data: vols, error: volsErr } = await sb.from('area_volunteers')
            .select('area_id, user_id, areas!inner(product_id)')
            .eq('areas.product_id', coordDataCache.productId);
        if (volsErr) throw volsErr;
        coordDataCache.areaVolunteers = vols || [];
    } catch (err) {
        console.warn('Erro ao carregar equipe/quadrantes da Coordenação:', err);
        coordDataCache.equipe = [];
        coordDataCache.areas = [];
        coordDataCache.areaVolunteers = [];
    }
}

async function fetchCoordPerimetroStatus() {
    const sb = initSupabaseClient();
    try {
        const { data, error } = await sb.from('perimetro_status')
            .select('grupo_nome, status, updated_at, updated_by, profiles:updated_by(full_name, email)')
            .eq('product_id', coordDataCache.productId);
        if (error) throw error;
        coordDataCache.perimetroStatus = data || [];
    } catch (err) {
        console.warn('Erro ao carregar status dos perímetros:', err);
        coordDataCache.perimetroStatus = [];
    }
}

async function fetchCoordPeriodsEObjetivos() {
    const sb = initSupabaseClient();
    try {
        const { data, error } = await sb.from('periods').select('*').eq('ativo', true).order('data_inicio', { ascending: false });
        if (error) throw error;
        coordDataCache.periods = data || [];
        if (!coordDataCache.periodId || !coordDataCache.periods.some(p => p.id === coordDataCache.periodId)) {
            const preferido = okrDataCache.activePeriodId && coordDataCache.periods.some(p => p.id === okrDataCache.activePeriodId)
                ? okrDataCache.activePeriodId
                : (coordDataCache.periods[0] ? coordDataCache.periods[0].id : null);
            coordDataCache.periodId = preferido;
        }
        await fetchCoordObjectives();
    } catch (err) {
        console.warn('Erro ao carregar ciclos ativos:', err);
        coordDataCache.periods = [];
        coordDataCache.periodId = null;
        coordDataCache.objectives = [];
        coordDataCache.keyResults = [];
    }
}

async function fetchCoordObjectives() {
    const sb = initSupabaseClient();
    if (!coordDataCache.periodId) {
        coordDataCache.objectives = [];
        coordDataCache.keyResults = [];
        return;
    }
    try {
        const { data: objs, error } = await sb.from('objectives').select('*')
            .eq('nivel', 'tatico').eq('product_id', coordDataCache.productId).eq('period_id', coordDataCache.periodId);
        if (error) throw error;
        coordDataCache.objectives = objs || [];
        const objIds = coordDataCache.objectives.map(o => o.id);
        if (!objIds.length) {
            coordDataCache.keyResults = [];
            return;
        }
        const { data: krs } = await sb.from('key_results').select('*').in('objective_id', objIds);
        coordDataCache.keyResults = krs || [];
    } catch (err) {
        console.warn('Erro ao carregar KRs sob responsabilidade:', err);
        coordDataCache.objectives = [];
        coordDataCache.keyResults = [];
    }
}

async function changeCoordPeriod(periodId) {
    coordDataCache.periodId = periodId;
    const container = document.getElementById('coord-kr-container');
    if (container) container.innerHTML = '<div class="instruction">Carregando…</div>';
    await fetchCoordObjectives();
    renderCoordKRs();
}

async function fetchCoordAgenda() {
    const sb = initSupabaseClient();
    try {
        const { data, error } = await sb.from('agenda_eventos').select('*').eq('product_id', coordDataCache.productId).order('data_hora', { ascending: false });
        if (error) throw error;
        coordDataCache.agenda = data || [];
    } catch (err) {
        console.warn('Erro ao carregar agenda da região:', err);
        coordDataCache.agenda = [];
    }
}

async function fetchCoordCheckinsPendentes() {
    const sb = initSupabaseClient();
    try {
        const { data, error } = await sb.from('checkins')
            .select('*, profiles:user_id(full_name, email), areas!inner(codigo, nome, product_id)')
            .eq('status', 'pendente')
            .eq('areas.product_id', coordDataCache.productId)
            .order('created_at', { ascending: false });
        if (error) throw error;
        coordDataCache.checkinsPendentes = data || [];
    } catch (err) {
        console.warn('Erro ao carregar check-ins pendentes:', err);
        coordDataCache.checkinsPendentes = [];
    }
}

async function fetchCoordSettings() {
    const sb = initSupabaseClient();
    try {
        const { data, error } = await sb.from('app_settings').select('comparativo_regioes_liberado').eq('id', true).maybeSingle();
        if (error) throw error;
        coordDataCache.comparativoLiberado = !!(data && data.comparativo_regioes_liberado);
    } catch (err) {
        console.warn('Erro ao carregar configuração de comparativo entre regiões:', err);
        coordDataCache.comparativoLiberado = false;
    }
}

// ------------------------------------------
// Equipe + Quadrantes (resumo + filtros que alimentam o mapa)
// ------------------------------------------
function chunkArray(arr, tamanho) {
    const lotes = [];
    for (let i = 0; i < arr.length; i += tamanho) lotes.push(arr.slice(i, i + tamanho));
    return lotes;
}

function getCoordPerimetros() {
    return [...new Set(coordDataCache.areas.map(a => a.grupo_nome).filter(Boolean))].sort();
}

function getCoordAreasFiltradas() {
    if (!coordMapFiltro.tipo) return coordDataCache.areas;
    if (coordMapFiltro.tipo === 'perimetro') {
        if (coordMapFiltro.valor === '__sem_grupo__') return coordDataCache.areas.filter(a => !a.grupo_nome);
        return coordDataCache.areas.filter(a => a.grupo_nome === coordMapFiltro.valor);
    }
    const idsComVoluntario = new Set(coordDataCache.areaVolunteers.filter(v => v.user_id === coordMapFiltro.valor).map(v => v.area_id));
    return coordDataCache.areas.filter(a => idsComVoluntario.has(a.id));
}

function changeCoordMapFiltro(tipo, valor) {
    coordMapFiltro = valor ? { tipo, valor } : { tipo: null, valor: null };
    const outroId = tipo === 'perimetro' ? 'coord-filtro-voluntario' : 'coord-filtro-perimetro';
    const outroEl = document.getElementById(outroId);
    if (outroEl && valor) outroEl.value = '';
    renderCoordFiltroDetalhe();
    renderCoordMapRectangles();
}

function renderCoordFiltroDetalhe() {
    const detalhe = document.getElementById('coord-filtro-detalhe');
    if (!detalhe) return;
    if (!coordMapFiltro.tipo) { detalhe.textContent = ''; return; }
    const areasFiltradas = getCoordAreasFiltradas();
    if (coordMapFiltro.tipo === 'perimetro') {
        const nomeGrupo = coordMapFiltro.valor === '__sem_grupo__' ? 'sem perímetro definido' : coordMapFiltro.valor;
        detalhe.textContent = `Mostrando ${areasFiltradas.length} quadrante(s) do perímetro "${nomeGrupo}" no mapa.`;
        return;
    }
    const membro = coordDataCache.equipe.find(m => m.user_id === coordMapFiltro.valor);
    const nome = membro ? ((membro.profiles && membro.profiles.full_name) || (membro.profiles && membro.profiles.email)) : 'Integrante';
    if (!areasFiltradas.length) {
        detalhe.textContent = `${nome} ainda não está atribuído a nenhum quadrante.`;
        return;
    }
    const codigos = areasFiltradas.map(a => a.codigo);
    const resumo = codigos.length > 20 ? codigos.slice(0, 20).join(', ') + ` e mais ${codigos.length - 20}` : codigos.join(', ');
    detalhe.textContent = `${nome} está atribuído a ${areasFiltradas.length} quadrante(s): ${resumo}`;
}

function renderCoordEquipeCobertura() {
    const equipeContainer = document.getElementById('coord-equipe-container');
    const quadContainer = document.getElementById('coord-quadrantes-container');
    if (!equipeContainer || !quadContainer) return;

    equipeContainer.innerHTML = coordDataCache.equipe.length
        ? coordDataCache.equipe.map(m => {
            const badgeClass = m.papel === 'coordenador' ? 'badge-tatico' : 'badge-operacional';
            const roleLabel = m.papel === 'coordenador' ? '📌 Coordenador(a)' : '👥 Operacional';
            const nome = (m.profiles && m.profiles.full_name) || (m.profiles && m.profiles.email) || 'Integrante';
            return `<span class="okr-badge ${badgeClass}" style="margin: 3px 4px 3px 0; display: inline-block;">${roleLabel}: ${nome}</span>`;
        }).join('')
        : '<div class="instruction">Nenhum integrante nesta Coordenação ainda.</div>';

    if (!coordDataCache.areas.length) {
        quadContainer.innerHTML = '<div class="instruction">Nenhum quadrante gerado para esta Coordenação — gere pela aba <strong>🎯 OKRs</strong>.</div>';
        return;
    }

    const qtdPorArea = {};
    coordDataCache.areaVolunteers.forEach(v => { qtdPorArea[v.area_id] = (qtdPorArea[v.area_id] || 0) + 1; });
    const cobertos = coordDataCache.areas.filter(a => qtdPorArea[a.id] > 0).length;
    const total = coordDataCache.areas.length;
    const pct = Math.round((cobertos / total) * 100);

    const grupos = getCoordPerimetros();
    const filtroAtualPerimetro = coordMapFiltro.tipo === 'perimetro' ? coordMapFiltro.valor : '';
    const filtroAtualVoluntario = coordMapFiltro.tipo === 'voluntario' ? coordMapFiltro.valor : '';

    quadContainer.innerHTML = `
        <div class="comando-item-row">
            <div class="comando-item-header"><span>Cobertura</span><strong>${pct}%</strong></div>
            <div class="okr-progress-bar-container"><div class="okr-progress-bar" style="width:${pct}%;"></div></div>
            <div class="okr-card-footer"><span>${cobertos} de ${total} quadrantes com voluntário</span></div>
        </div>
        <div class="okr-period-bar" style="margin-top: 12px; flex-wrap: wrap;">
            <label for="coord-filtro-perimetro">🏷️ Perímetro:</label>
            <select id="coord-filtro-perimetro" onchange="changeCoordMapFiltro('perimetro', this.value)">
                <option value="">Todos os quadrantes</option>
                ${grupos.map(g => `<option value="${(g || '').replace(/"/g, '&quot;')}" ${filtroAtualPerimetro === g ? 'selected' : ''}>${g}</option>`).join('')}
                <option value="__sem_grupo__" ${filtroAtualPerimetro === '__sem_grupo__' ? 'selected' : ''}>Sem perímetro definido</option>
            </select>
        </div>
        <div class="okr-period-bar" style="margin-top: 8px; flex-wrap: wrap;">
            <label for="coord-filtro-voluntario">👤 Voluntário:</label>
            <select id="coord-filtro-voluntario" onchange="changeCoordMapFiltro('voluntario', this.value)">
                <option value="">Todos os quadrantes</option>
                ${coordDataCache.equipe.map(m => {
                    const nome = (m.profiles && m.profiles.full_name) || (m.profiles && m.profiles.email) || 'Integrante';
                    return `<option value="${m.user_id}" ${filtroAtualVoluntario === m.user_id ? 'selected' : ''}>${nome}</option>`;
                }).join('')}
            </select>
        </div>
        <div id="coord-filtro-detalhe" class="instruction" style="margin-top: 8px;"></div>
    `;
    renderCoordFiltroDetalhe();
}

// ------------------------------------------
// Mapa de Quadrantes (clique / Shift+arrasto seleciona; ação em lote
// depende do modo ativo — atribuir equipe ou nomear perímetro)
// ------------------------------------------
function setCoordMapMode(mode) {
    coordMapMode = mode;
    coordSelectedAreaIds.clear();
    const btnAtribuir = document.getElementById('coord-map-mode-atribuir');
    const btnAgrupar = document.getElementById('coord-map-mode-agrupar');
    const hint = document.getElementById('coord-map-hint');
    const selectionBar = document.getElementById('coord-map-selection-bar');
    const selectionCount = document.getElementById('coord-map-selection-count');
    const selectionAction = document.getElementById('coord-map-selection-action');
    const assignPanel = document.getElementById('coord-assign-panel');
    if (btnAtribuir) btnAtribuir.classList.toggle('active', mode === 'atribuir');
    if (btnAgrupar) btnAgrupar.classList.toggle('active', mode === 'agrupar');
    if (hint) hint.textContent = mode === 'atribuir'
        ? 'Clique num quadrante (ou segure Shift e arraste pra selecionar vários de uma vez) e depois atribua a equipe aos selecionados.'
        : 'Clique em vários quadrantes (ou segure Shift e arraste) e dê um nome ao perímetro selecionado — planejamento junto com o candidato; a atribuição de voluntários continua separada, no outro modo.';
    if (selectionBar) selectionBar.style.display = 'flex';
    if (selectionCount) selectionCount.textContent = '0 quadrante(s) selecionado(s)';
    if (selectionAction) {
        selectionAction.innerHTML = mode === 'atribuir'
            ? '<button class="btn-primary" onclick="abrirAtribuicaoEmLote()">👤 Atribuir equipe aos selecionados</button>'
            : '<button class="btn-primary" onclick="nomearGrupoSelecionado()">🏷️ Nomear grupo selecionado</button>';
    }
    if (assignPanel) assignPanel.innerHTML = '';
    renderCoordMapRectangles();
}

function initCoordMap() {
    const container = document.getElementById('coord-map');
    if (!container || coordMap) {
        if (coordMap) setTimeout(() => google.maps.event.trigger(coordMap, 'resize'), 50);
        return;
    }
    coordMap = new google.maps.Map(container, {
        center: { lat: -15.793889, lng: -47.882778 },
        zoom: 12,
        styles: LIGHT_MAP_STYLE,
        streetViewControl: false,
        mapTypeControl: false,
        fullscreenControl: false
    });
    if (!sharedInfoWindow) sharedInfoWindow = new google.maps.InfoWindow();
    ensureCoordMapOverlayHelper();
    setupCoordMapDragSelect();
}

function setCoordMapTipo(tipo) {
    if (!coordMap) return;
    coordMap.setMapTypeId(tipo);
    const btnRoadmap = document.getElementById('coord-map-tipo-roadmap');
    const btnSatellite = document.getElementById('coord-map-tipo-satellite');
    if (btnRoadmap) btnRoadmap.classList.toggle('active', tipo === 'roadmap');
    if (btnSatellite) btnSatellite.classList.toggle('active', tipo === 'satellite');
}

function ensureCoordMapOverlayHelper() {
    if (coordMapOverlayHelper || !coordMap) return;
    function Helper() {}
    Helper.prototype = new google.maps.OverlayView();
    Helper.prototype.onAdd = function () {};
    Helper.prototype.draw = function () {};
    Helper.prototype.onRemove = function () {};
    coordMapOverlayHelper = new Helper();
    coordMapOverlayHelper.setMap(coordMap);
}

function setupCoordMapDragSelect() {
    if (!coordMap || coordMap.__dragSelectBound) return;
    coordMap.__dragSelectBound = true;
    const mapDiv = coordMap.getDiv();

    const atualizarCaixa = (curX, curY) => {
        const box = coordDragSelect.boxEl;
        if (!box || !coordDragSelect.startPixel) return;
        const x = Math.min(coordDragSelect.startPixel.x, curX);
        const y = Math.min(coordDragSelect.startPixel.y, curY);
        box.style.left = x + 'px';
        box.style.top = y + 'px';
        box.style.width = Math.abs(curX - coordDragSelect.startPixel.x) + 'px';
        box.style.height = Math.abs(curY - coordDragSelect.startPixel.y) + 'px';
    };

    google.maps.event.addDomListener(mapDiv, 'mousedown', (e) => {
        if (!e.shiftKey) return;
        e.preventDefault();
        e.stopPropagation();
        const rectDiv = mapDiv.getBoundingClientRect();
        const startX = e.clientX - rectDiv.left;
        const startY = e.clientY - rectDiv.top;
        coordDragSelect.active = true;
        coordDragSelect.startPixel = { x: startX, y: startY };
        coordMap.setOptions({ draggable: false });

        const boxEl = document.createElement('div');
        boxEl.style.position = 'absolute';
        boxEl.style.border = '2px dashed #1f4e78';
        boxEl.style.background = 'rgba(31, 78, 120, 0.15)';
        boxEl.style.zIndex = '1000';
        boxEl.style.pointerEvents = 'none';
        mapDiv.appendChild(boxEl);
        coordDragSelect.boxEl = boxEl;
        atualizarCaixa(startX, startY);

        const onMouseMove = (moveEvt) => atualizarCaixa(moveEvt.clientX - rectDiv.left, moveEvt.clientY - rectDiv.top);
        const onMouseUp = (upEvt) => {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            finishCoordDragSelect(startX, startY, upEvt.clientX - rectDiv.left, upEvt.clientY - rectDiv.top);
        };
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    });
}

function finishCoordDragSelect(x1, y1, x2, y2) {
    coordMap.setOptions({ draggable: true });
    if (coordDragSelect.boxEl) {
        coordDragSelect.boxEl.remove();
        coordDragSelect.boxEl = null;
    }
    coordDragSelect.active = false;

    const pxMinX = Math.min(x1, x2), pxMaxX = Math.max(x1, x2);
    const pxMinY = Math.min(y1, y2), pxMaxY = Math.max(y1, y2);
    if (pxMaxX - pxMinX < 4 && pxMaxY - pxMinY < 4) return;

    const projection = coordMapOverlayHelper && coordMapOverlayHelper.getProjection();
    if (!projection) return;
    const swLatLng = projection.fromContainerPixelToLatLng(new google.maps.Point(pxMinX, pxMaxY));
    const neLatLng = projection.fromContainerPixelToLatLng(new google.maps.Point(pxMaxX, pxMinY));
    if (!swLatLng || !neLatLng) return;
    const dragBounds = new google.maps.LatLngBounds(swLatLng, neLatLng);

    let mudou = false;
    getCoordAreasFiltradas().forEach(area => {
        const areaBounds = new google.maps.LatLngBounds(
            { lat: area.lat_min, lng: area.lng_min },
            { lat: area.lat_max, lng: area.lng_max }
        );
        if (dragBounds.intersects(areaBounds) && !coordSelectedAreaIds.has(area.id)) {
            coordSelectedAreaIds.add(area.id);
            mudou = true;
        }
    });
    if (mudou) {
        const selectionCount = document.getElementById('coord-map-selection-count');
        if (selectionCount) selectionCount.textContent = `${coordSelectedAreaIds.size} quadrante(s) selecionado(s)`;
        renderCoordMapRectangles();
    }
}

function renderCoordMapRectangles() {
    if (!coordMap) return;
    Object.values(coordMapRectangles).forEach(rect => rect.setMap(null));
    coordMapRectangles = {};
    const areasParaExibir = getCoordAreasFiltradas();
    if (!areasParaExibir.length) return;

    const qtdPorArea = {};
    coordDataCache.areaVolunteers.forEach(v => { qtdPorArea[v.area_id] = (qtdPorArea[v.area_id] || 0) + 1; });

    const bounds = new google.maps.LatLngBounds();
    areasParaExibir.forEach(area => {
        bounds.extend({ lat: area.lat_max, lng: area.lng_max });
        bounds.extend({ lat: area.lat_min, lng: area.lng_min });
        const numAtribuicoes = (qtdPorArea[area.id] || 0) + (area.grupo_nome ? 1 : 0);
        const cor = numAtribuicoes === 0 ? '#c62828' : (numAtribuicoes === 1 ? '#28a745' : '#1565c0');
        const selecionado = coordSelectedAreaIds.has(area.id);
        const rect = new google.maps.Rectangle({
            bounds: { north: area.lat_max, south: area.lat_min, east: area.lng_max, west: area.lng_min },
            map: coordMap,
            strokeColor: selecionado ? '#f5a623' : cor,
            strokeWeight: selecionado ? 4 : 1.5,
            fillColor: cor,
            fillOpacity: selecionado ? 0.5 : 0.25
        });
        rect.addListener('click', () => onCoordMapAreaClick(area.id));
        rect.addListener('mouseover', () => {
            sharedInfoWindow.setContent(`<div class="kml-hover-tooltip"><strong>🔲 ${area.codigo}</strong>${area.grupo_nome ? `<div>🏷️ ${area.grupo_nome}</div>` : ''}</div>`);
            sharedInfoWindow.setPosition({ lat: area.lat_max, lng: (area.lng_min + area.lng_max) / 2 });
            sharedInfoWindow.open(coordMap);
        });
        rect.addListener('mouseout', () => sharedInfoWindow.close());
        coordMapRectangles[area.id] = rect;
    });
    if (!bounds.isEmpty()) coordMap.fitBounds(bounds);
}

function onCoordMapAreaClick(areaId) {
    if (coordSelectedAreaIds.has(areaId)) coordSelectedAreaIds.delete(areaId);
    else coordSelectedAreaIds.add(areaId);
    const selectionCount = document.getElementById('coord-map-selection-count');
    if (selectionCount) selectionCount.textContent = `${coordSelectedAreaIds.size} quadrante(s) selecionado(s)`;
    renderCoordMapRectangles();
}

function limparSelecaoCoordMap() {
    coordSelectedAreaIds.clear();
    const selectionCount = document.getElementById('coord-map-selection-count');
    if (selectionCount) selectionCount.textContent = '0 quadrante(s) selecionado(s)';
    renderCoordMapRectangles();
}

async function nomearGrupoSelecionado() {
    if (!coordSelectedAreaIds.size) return alert('Selecione ao menos um quadrante no mapa (clique ou Shift+arraste).');
    const nome = prompt(`Nome do perímetro para os ${coordSelectedAreaIds.size} quadrantes selecionados:`);
    if (!nome) return;

    const nomesAntigosComStatus = new Set(
        [...coordSelectedAreaIds]
            .map(id => coordDataCache.areas.find(a => a.id === id))
            .filter(a => a && a.grupo_nome && a.grupo_nome !== nome)
            .map(a => a.grupo_nome)
            .filter(g => coordDataCache.perimetroStatus.some(p => p.grupo_nome === g))
    );
    if (nomesAntigosComStatus.size) {
        const lista = [...nomesAntigosComStatus].join(', ');
        if (!confirm(`Alguns quadrantes já pertencem a "${lista}", que já tem status registrado na Grade Operacional. Renomear para "${nome}" NÃO migra esse status/histórico — "${lista}" ficará com o status antigo (órfão) e "${nome}" começa em "não iniciado". Continuar?`)) return;
    }

    const sb = initSupabaseClient();
    const ids = [...coordSelectedAreaIds];
    try {
        for (const lote of chunkArray(ids, 100)) {
            const { error } = await sb.from('areas').update({ grupo_nome: nome }).in('id', lote);
            if (error) throw error;
        }
    } catch (err) {
        return alert('Erro: ' + err.message);
    }
    coordSelectedAreaIds.clear();
    await fetchCoordEquipeEAreas();
    renderCoordEquipeCobertura();
    renderCoordGradeOperacional();
    renderCoordMapRectangles();
    const selectionCount = document.getElementById('coord-map-selection-count');
    if (selectionCount) selectionCount.textContent = '0 quadrante(s) selecionado(s)';
}

function abrirAtribuicaoEmLote() {
    if (!coordSelectedAreaIds.size) return alert('Selecione ao menos um quadrante no mapa (clique ou Shift+arraste).');
    openCoordAssignPanel([...coordSelectedAreaIds]);
}

function openCoordAssignPanel(areaIds) {
    const ids = Array.isArray(areaIds) ? areaIds : [areaIds];
    const panel = document.getElementById('coord-assign-panel');
    if (!ids.length || !panel) return;
    const areasSelecionadas = coordDataCache.areas.filter(a => ids.includes(a.id));
    if (!areasSelecionadas.length) return;

    const contagem = {};
    coordDataCache.areaVolunteers.forEach(v => {
        if (ids.includes(v.area_id)) contagem[v.user_id] = (contagem[v.user_id] || 0) + 1;
    });
    const titulo = areasSelecionadas.length === 1
        ? `${areasSelecionadas[0].codigo}${areasSelecionadas[0].grupo_nome ? ' · 🏷️ ' + areasSelecionadas[0].grupo_nome : ''}`
        : `${areasSelecionadas.length} quadrantes selecionados`;

    panel.innerHTML = `
        <div class="comando-panel" style="margin-top: 10px;">
            <h3>👤 Atribuir equipe — ${titulo}</h3>
            ${coordDataCache.equipe.length ? coordDataCache.equipe.map(m => {
                const nome = (m.profiles && m.profiles.full_name) || (m.profiles && m.profiles.email) || 'Integrante';
                const qtd = contagem[m.user_id] || 0;
                const marcado = qtd === ids.length;
                const parcial = qtd > 0 && qtd < ids.length;
                return `
                    <label style="display:flex; align-items:center; gap:8px; padding:6px 0; font-size:0.9rem;">
                        <input type="checkbox" ${marcado ? 'checked' : ''} data-area-ids='${JSON.stringify(ids)}' onchange="toggleCoordAreaVolunteer('${m.user_id}', this.checked, this)">
                        ${nome} ${m.papel === 'coordenador' ? '📌' : '👥'}${parcial ? ` <span class="instruction" style="margin:0;">(em ${qtd} de ${ids.length})</span>` : ''}
                    </label>
                `;
            }).join('') : '<div class="instruction">Nenhum integrante nesta Coordenação ainda — adicione pela aba OKR.</div>'}
        </div>
    `;
}

async function toggleCoordAreaVolunteer(userId, atribuir, checkboxEl) {
    const sb = initSupabaseClient();
    const areaIds = JSON.parse(checkboxEl.dataset.areaIds);
    try {
        if (atribuir) {
            for (const lote of chunkArray(areaIds, 100)) {
                const rows = lote.map(area_id => ({ area_id, user_id: userId, atribuido_por: okrCurrentUser.id }));
                const { error } = await sb.from('area_volunteers').upsert(rows, { onConflict: 'area_id,user_id', ignoreDuplicates: true });
                if (error) throw error;
            }
        } else {
            for (const lote of chunkArray(areaIds, 100)) {
                const { error } = await sb.from('area_volunteers').delete().eq('user_id', userId).in('area_id', lote);
                if (error) throw error;
            }
        }
    } catch (err) {
        return alert('Erro: ' + err.message);
    }
    await fetchCoordEquipeEAreas();
    renderCoordEquipeCobertura();
    renderCoordMapRectangles();
    openCoordAssignPanel(areaIds);
}

// ------------------------------------------
// Grade Operacional (status por perímetro + export/print + link
// de compartilhamento somente-leitura)
// ------------------------------------------
const PROXIMO_STATUS_PERIMETRO = { nao_iniciado: 'em_andamento', em_andamento: 'concluido', concluido: 'nao_iniciado' };
const LABEL_STATUS_PERIMETRO = { nao_iniciado: 'Não iniciado', em_andamento: 'Em andamento', concluido: 'Concluído' };

function renderCoordGradeOperacional() {
    const container = document.getElementById('coord-grade-container');
    if (!container) return;
    const perimetros = getCoordPerimetros();
    if (!perimetros.length) {
        container.innerHTML = '<div class="instruction">Nenhum perímetro nomeado ainda — use "🏷️ Nomear perímetro" no mapa acima pra criar o primeiro (ex: "AR 01").</div>';
        return;
    }
    container.innerHTML = perimetros.map(nome => {
        const linha = coordDataCache.perimetroStatus.find(p => p.grupo_nome === nome);
        const status = linha ? linha.status : 'nao_iniciado';
        return `
            <div class="comando-panel" style="padding: 12px 14px;">
                <div class="comando-item-header" style="margin-bottom: 0;">
                    <span title="Clique no círculo pra avançar o status">${nome}</span>
                    <span class="status-circle status-${status}" style="cursor: pointer;" onclick="ciclarStatusPerimetro('${nome.replace(/'/g, "\\'")}')" title="${LABEL_STATUS_PERIMETRO[status]} — clique para avançar"></span>
                </div>
            </div>
        `;
    }).join('');
}

async function ciclarStatusPerimetro(grupoNome) {
    const sb = initSupabaseClient();
    const atual = coordDataCache.perimetroStatus.find(p => p.grupo_nome === grupoNome);
    const statusAtual = atual ? atual.status : 'nao_iniciado';
    const novoStatus = PROXIMO_STATUS_PERIMETRO[statusAtual];
    try {
        const { error } = await sb.from('perimetro_status')
            .upsert({ product_id: coordDataCache.productId, grupo_nome: grupoNome, status: novoStatus, updated_by: okrCurrentUser.id }, { onConflict: 'product_id,grupo_nome' });
        if (error) throw error;
    } catch (err) {
        return alert('Erro: ' + err.message);
    }
    if (atual) atual.status = novoStatus;
    else coordDataCache.perimetroStatus.push({ grupo_nome: grupoNome, status: novoStatus, updated_by: okrCurrentUser.id, updated_at: new Date().toISOString() });
    renderCoordGradeOperacional();
}

function exportarGradeOperacional() {
    document.body.classList.add('printing-grade');
    window.print();
}
window.onafterprint = () => document.body.classList.remove('printing-grade');

async function gerarLinkCompartilhamentoGrade() {
    const sb = initSupabaseClient();
    const box = document.getElementById('coord-grade-share-box');
    try {
        const { data: existente } = await sb.from('grade_share_links')
            .select('token').eq('product_id', coordDataCache.productId).eq('revogado', false).limit(1).maybeSingle();
        let token = existente && existente.token;
        if (!token) {
            const { data, error } = await sb.from('grade_share_links')
                .insert({ product_id: coordDataCache.productId, criado_por: okrCurrentUser.id })
                .select('token').single();
            if (error) throw error;
            token = data.token;
        }
        const url = `${window.location.origin}/grade-publica.html?token=${token}`;
        if (box) {
            box.style.display = 'block';
            box.innerHTML = `🔗 Link somente-leitura (sem login): <a href="${url}" target="_blank" rel="noopener">${url}</a>`;
        }
    } catch (err) {
        alert('Erro ao gerar link: ' + err.message);
    }
}

// ------------------------------------------
// KRs sob responsabilidade (somente leitura nesta página — a
// atualização de progresso é exclusiva de okrs.html)
// ------------------------------------------
function renderCoordKRs() {
    const periodBar = document.getElementById('coord-period-bar');
    const selectBox = document.getElementById('coord-period-select');
    const container = document.getElementById('coord-kr-container');
    if (!periodBar || !selectBox || !container) return;

    if (!coordDataCache.periods.length) {
        periodBar.style.display = 'none';
        container.innerHTML = '<div class="instruction">Nenhum ciclo ativo no momento.</div>';
        return;
    }
    periodBar.style.display = 'flex';
    selectBox.innerHTML = coordDataCache.periods.map(p =>
        `<option value="${p.id}" ${p.id === coordDataCache.periodId ? 'selected' : ''}>${p.nome} (${p.tipo_ciclo})</option>`
    ).join('');

    if (!coordDataCache.objectives.length) {
        container.innerHTML = '<div class="instruction">Nenhum objetivo tático definido para este ciclo.</div>';
        return;
    }

    container.innerHTML = coordDataCache.objectives.map(obj => {
        const krs = coordDataCache.keyResults.filter(kr => kr.objective_id === obj.id);
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
// Status de Agenda da região (somente leitura — aprovação continua
// exclusiva de admin.html)
// ------------------------------------------
function renderCoordAgenda() {
    const container = document.getElementById('coord-agenda-container');
    if (!container) return;
    if (!coordDataCache.agenda.length) {
        container.innerHTML = '<div class="instruction">Nenhuma solicitação de agenda registrada para esta região.</div>';
        return;
    }
    container.innerHTML = coordDataCache.agenda.map(ev => `
        <div class="okr-card">
            <div class="okr-card-header">
                <span class="okr-badge badge-tatico">${agendaTipoLabel(ev.tipo)}</span>
                <span class="status-tag status-${ev.status}">${ev.status.toUpperCase()}</span>
            </div>
            <h4>${ev.titulo}</h4>
            <p>${ev.descricao || ''}</p>
            <div class="okr-card-footer"><span>${formatAgendaDateTime(ev.data_hora)}${ev.local ? ' · ' + ev.local : ''}</span></div>
            ${ev.resposta_admin ? `<p><strong>Resposta:</strong> ${ev.resposta_admin}</p>` : ''}
        </div>
    `).join('');
}

// ------------------------------------------
// Check-ins pendentes de aprovação (check-in fora dos limites do
// quadrante atribuído)
// ------------------------------------------
function renderCoordCheckinsPendentes() {
    const container = document.getElementById('coord-checkins-pendentes-container');
    if (!container) return;
    if (!coordDataCache.checkinsPendentes.length) {
        container.innerHTML = '<div class="instruction">Nenhum check-in pendente de aprovação.</div>';
        return;
    }
    container.innerHTML = coordDataCache.checkinsPendentes.map(c => {
        const nome = (c.profiles && c.profiles.full_name) || (c.profiles && c.profiles.email) || 'Voluntário(a)';
        return `
        <div class="okr-card">
            <div class="okr-card-header">
                <span class="okr-badge badge-operacional">👤 ${nome}</span>
                <span class="status-tag status-fora">🔲 ${c.areas ? c.areas.codigo : ''} · FORA DA ÁREA</span>
            </div>
            <p>${c.descricao}</p>
            <div class="okr-card-footer"><span>${formatAgendaDateTime(c.created_at)}</span></div>
            <div class="okr-btn-group" style="margin-top: 10px;">
                <button class="btn-primary" onclick="responderCheckinCoord('${c.id}', true)">✅ Aprovar</button>
                <button class="btn-secondary" onclick="responderCheckinCoord('${c.id}', false)">❌ Rejeitar</button>
            </div>
        </div>
        `;
    }).join('');
}

async function responderCheckinCoord(id, aprovar) {
    const sb = initSupabaseClient();
    const resposta_aprovacao = prompt(aprovar ? 'Observação para o voluntário (opcional):' : 'Motivo da rejeição (opcional):') || null;
    const { error } = await sb.from('checkins').update({
        status: aprovar ? 'aprovado' : 'rejeitado',
        resposta_aprovacao
    }).eq('id', id);
    if (error) return alert('Erro: ' + error.message);
    await fetchCoordCheckinsPendentes();
    renderCoordCheckinsPendentes();
}

// ------------------------------------------
// Comparativo entre Regiões (controlado por app_settings, toggle só
// pra super_admin)
// ------------------------------------------
async function loadCoordComparativo(requestId) {
    const toggleBox = document.getElementById('coord-comparativo-toggle-box');
    const toggleInput = document.getElementById('coord-comparativo-toggle');
    const isAdmin = !!(okrCurrentUser && okrCurrentUser.is_super_admin);
    if (toggleBox) toggleBox.style.display = isAdmin ? 'flex' : 'none';
    if (toggleInput) toggleInput.checked = coordDataCache.comparativoLiberado;

    const container = document.getElementById('coord-comparativo-container');
    if (!container) return;

    if (!coordDataCache.comparativoLiberado) {
        container.innerHTML = '<div class="instruction">Comparativo desativado pelo nível estratégico.</div>';
        return;
    }

    try {
        const sb = initSupabaseClient();
        const periodIds = coordDataCache.periods.map(p => p.id);
        const [productsRes, objectivesRes, areas, volsRes] = await Promise.all([
            sb.from('products').select('id, nome, ra_nome'),
            periodIds.length
                ? sb.from('objectives').select('product_id, progresso').eq('nivel', 'tatico').in('period_id', periodIds)
                : Promise.resolve({ data: [] }),
            fetchAllRows(sb, 'areas', 'id, product_id'),
            sb.from('area_volunteers').select('area_id')
        ]);
        if (requestId !== coordRequestSeq) return;

        const produtos = productsRes.data || [];
        const objetivos = objectivesRes.data || [];
        const idsComVoluntario = new Set((volsRes.data || []).map(v => v.area_id));

        if (!produtos.length) {
            container.innerHTML = '<div class="instruction">Nenhuma Coordenação Regional cadastrada ainda.</div>';
            return;
        }

        const linhas = produtos.map(p => {
            const objs = objetivos.filter(o => o.product_id === p.id);
            const progresso = objs.length ? objs.reduce((s, o) => s + (o.progresso || 0), 0) / objs.length : 0;
            const areasDoProduto = areas.filter(a => a.product_id === p.id);
            const cobertos = areasDoProduto.filter(a => idsComVoluntario.has(a.id)).length;
            const pctCobertura = areasDoProduto.length ? Math.round((cobertos / areasDoProduto.length) * 100) : null;
            return { produto: p, progresso, pctCobertura };
        }).sort((a, b) => b.progresso - a.progresso);

        container.innerHTML = `
            <div class="table-container">
                <table>
                    <thead><tr><th>Coordenação</th><th>Progresso tático</th><th>Cobertura de quadrantes</th></tr></thead>
                    <tbody>
                        ${linhas.map(l => `
                            <tr class="${l.produto.id === coordDataCache.productId ? 'coord-comparativo-linha-atual' : ''}">
                                <td>${l.produto.nome} (${l.produto.ra_nome})</td>
                                <td>${Math.round(l.progresso)}%</td>
                                <td>${l.pctCobertura === null ? '—' : l.pctCobertura + '%'}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    } catch (err) {
        console.warn('Erro ao carregar comparativo entre regiões:', err);
        container.innerHTML = '<div class="instruction">Não foi possível carregar o comparativo agora.</div>';
    }
}

async function toggleComparativoRegioes(checked) {
    const sb = initSupabaseClient();
    const checkboxEl = document.getElementById('coord-comparativo-toggle');
    const valorAnterior = coordDataCache.comparativoLiberado;
    const { error } = await sb.from('app_settings')
        .update({ comparativo_regioes_liberado: checked, updated_at: new Date().toISOString() })
        .eq('id', true);
    if (error) {
        alert('Erro ao atualizar o comparativo: ' + error.message);
        if (checkboxEl) checkboxEl.checked = valorAnterior;
        return;
    }
    coordDataCache.comparativoLiberado = checked;
    await loadCoordComparativo(coordRequestSeq);
}

// ------------------------------------------
// Bootstrap — chamado por coordenador.html depois que guardPage()
// (auth-shared.js) já confirmou papel coordenador ou super_admin.
// ------------------------------------------
async function initCoordenadorPage(sb, ctx) {
    seedSupabaseClient(sb);
    setOkrUser(ctx.profile, ctx.coordProductIds);
    okrUserCoordProductIds = ctx.coordProductIds || [];

    if (!okrDataCache.products.length) {
        await loadOKRData();
    }

    const opcoes = getCoordProductOptions();
    const emptyBox = document.getElementById('coord-empty');
    const appBox = document.getElementById('coord-app');
    if (!opcoes.length) {
        if (emptyBox) emptyBox.style.display = 'block';
        if (appBox) appBox.style.display = 'none';
        return;
    }
    if (emptyBox) emptyBox.style.display = 'none';
    if (appBox) appBox.style.display = 'block';

    if (!coordDataCache.productId || !opcoes.some(p => p.id === coordDataCache.productId)) {
        coordDataCache.productId = opcoes[0].id;
    }
    renderCoordSelector();
    await loadCoordenadorData();
}
