// Estado da Aplicação
let currentTab = 'map';
let map;
let markers = [];
let sharedInfoWindow;
let locaisData = {};
let pontosData = []; // Todos os locais de votação (public/locais_pontos.json), fonte única para o detalhamento por RA
let activeZone = null;
let activeRA = null;
let markerMap = {}; // Mapeamento zoneId -> lista de marcadores Google Maps
let markerMapByRA = {}; // Mapeamento ra -> lista de marcadores Google Maps
let raLayer = null; // Camada google.maps.Data com o contorno de cada RA individualmente
let raListItems = {}; // Mapeamento ra -> elemento DOM na coluna "RAs" (evita seletor CSS com nomes acentuados/barras)
let areaRectangles = []; // google.maps.Rectangle por quadrante de voluntário (public.areas)

// Mancha urbana (public/perimetro_urbano.geojson) e área rural a excluir
// (public/area_rural_assentamentos.geojson, proxy de "Assentamentos
// Rurais" — a camada oficial de Concessão ETR exige token e não é
// acessível via script) — usadas por gerarQuadrantesDaRA() pra recortar a
// grade só sobre área urbana e fora de assentamentos rurais, além do
// contorno da RA. urbanPolygon/ruralPolygon são construídos uma vez a
// partir dessas camadas (ver getUrbanPolygon()/getRuralPolygon()).
let urbanLayer = null;
let ruralAreaLayer = null;
let urbanPolygon; // undefined = ainda não construído; null = camada carregou mas sem geometria válida
let ruralPolygon;

// Chave especial de activeRA para a opção "TODOS" (mostra todas as RAs de uma vez, sem filtrar)
const ALL_RA_KEY = '__TODOS__';

// Camadas de POI (Escolas / Saúde / Segurança Pública / Instituições Religiosas) —
// só aparecem com uma RA selecionada (incl. "TODOS") e o checkbox da categoria marcado.
let poiData = { escolas: [], saude: [], seguranca: [], religiao: [] };
let poiMarkers = { escolas: [], saude: [], seguranca: [], religiao: [] };
let activePoiLayers = { escolas: false, saude: false, seguranca: false, religiao: false };

// Estado das camadas da aba Mapa (Zonas Eleitorais)
let activeMapTabLayers = {
    secoes: true,
    zonas: true,
    quadrantes: false,
    escolas: false,
    saude: false,
    seguranca: false,
    religiao: false
};
let mapTabPoiMarkers = { escolas: [], saude: [], seguranca: [], religiao: [] };

// O campo "ra" salvo em cada ponto (public/locais_pontos.json) nem sempre bate
// literalmente com o nome da RA no shapefile (public/regioes_administrativas.geojson)
// — mesma nomenclatura, grafia diferente. Mapeamento só para achar o polígono certo;
// o filtro dos locais continua usando o campo "ra" original do dado.
const RA_NAME_TO_SHAPEFILE = {
    'SOL NASCENTE/PÔR DO SOL': 'SOL NASCENTE E POR DO SOL',
    'SCIA/ESTRUTURAL': 'SCIA'
};

// Estilo leve/minimalista do mapa (aproxima o visual anterior em CartoDB Light)
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

// Configuração de Cores para as Zonas Eleitorais (conforme zonas eleitorais df.png)
const zoneColors = {
    "1": "#63d692", "2": "#869bf0", "3": "#c894e1", "4": "#e15eac",
    "5": "#9a7c64", "6": "#f6eda5", "8": "#f59f8a", "9": "#e47171",
    "10": "#8aaae5", "11": "#c8c1bc", "13": "#9ff1cf", "14": "#68e799",
    "15": "#e7dfcd", "16": "#66cbed", "17": "#e3d274", "18": "#7beddf",
    "19": "#cd9ce4", "20": "#ebabc8", "21": "#e5a7b6"
};

// ==========================================
// TABS E NAVEGAÇÃO (FUSÃO: MAPA & DASHBOARD)
// ==========================================
function switchTab(tab) {
    currentTab = tab;
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tab);
    });

    // Sidebars
    document.getElementById('map-sidebar').style.display = tab === 'map' ? 'block' : 'none';
    document.getElementById('ra-sidebar').style.display = tab === 'ra' ? 'block' : 'none';
    const okrSidebar = document.getElementById('okr-sidebar');
    if (okrSidebar) okrSidebar.style.display = tab === 'okr' ? 'block' : 'none';
    const agendaSidebar = document.getElementById('agenda-sidebar');
    if (agendaSidebar) agendaSidebar.style.display = tab === 'agenda' ? 'block' : 'none';
    const checkinSidebar = document.getElementById('checkin-sidebar');
    if (checkinSidebar) checkinSidebar.style.display = tab === 'checkin' ? 'block' : 'none';
    const comandoSidebar = document.getElementById('comando-sidebar');
    if (comandoSidebar) comandoSidebar.style.display = tab === 'comando' ? 'block' : 'none';
    const coordenadorSidebar = document.getElementById('coordenador-sidebar');
    if (coordenadorSidebar) coordenadorSidebar.style.display = tab === 'coordenador' ? 'block' : 'none';

    // Main Views (o mapa é compartilhado pelas abas "map" e "ra")
    const showMapView = tab === 'map' || tab === 'ra';
    document.getElementById('view-map').style.display = showMapView ? 'block' : 'none';
    const viewOkr = document.getElementById('view-okr');
    if (viewOkr) viewOkr.style.display = tab === 'okr' ? 'block' : 'none';
    const viewAgenda = document.getElementById('view-agenda');
    if (viewAgenda) viewAgenda.style.display = tab === 'agenda' ? 'block' : 'none';
    const viewCheckin = document.getElementById('view-checkin');
    if (viewCheckin) viewCheckin.style.display = tab === 'checkin' ? 'block' : 'none';
    const viewComando = document.getElementById('view-comando');
    if (viewComando) viewComando.style.display = tab === 'comando' ? 'block' : 'none';
    const viewCoordenador = document.getElementById('view-coordenador');
    if (viewCoordenador) viewCoordenador.style.display = tab === 'coordenador' ? 'block' : 'none';

    // Coluna direita: Zonas x Regiões Administrativas
    document.getElementById('zonas-legend').style.display = tab === 'map' ? 'flex' : 'none';
    document.getElementById('ras-legend').style.display = tab === 'ra' ? 'flex' : 'none';

    if (tab === 'okr') {
        initOKRModule();
    }
    if (tab === 'agenda') {
        initAgendaModule();
    }
    if (tab === 'checkin') {
        initCheckinModule();
    }
    if (tab === 'comando') {
        initComandoModule();
    }
    if (tab === 'coordenador') {
        initPainelCoordenadorModule();
    }

    // Cada aba começa "limpa": desfaz seleção/realce anterior de zona ou RA
    if (tab !== 'map' && activeZone) clearZoneSelection();
    if (tab !== 'ra' && activeRA) clearRASelection();

    // Alterna qual camada de contorno fica visível no mapa
    if (map && map.data) map.data.setMap((tab === 'map' && activeMapTabLayers.zonas) ? map : null);
    if (raLayer) raLayer.setMap(tab === 'ra' ? map : null);

    if (tab === 'map') {
        updateMapSecoesVisibility();
        updateMapTabPoiMarkers();
    } else if (tab === 'ra') {
        updatePoiMarkers();
    }

    if (showMapView && map) {
        const currentCenter = map.getCenter();
        setTimeout(() => {
            google.maps.event.trigger(map, 'resize');
            if (currentCenter) map.setCenter(currentCenter);
        }, 100);
    }
}


// ==========================================
// MAPA GEORREFERENCIADO (GOOGLE MAPS + PONTOS COLORIDOS POR ZONA)
// ==========================================
function initMap() {
    map = new google.maps.Map(document.getElementById('map'), {
        center: { lat: -15.793889, lng: -47.882778 },
        zoom: 10,
        styles: LIGHT_MAP_STYLE,
        streetViewControl: false,
        mapTypeControl: false,
        fullscreenControl: false
    });

    sharedInfoWindow = new google.maps.InfoWindow();

    loadData();
    bootstrapComandoSession();
}

// Verifica cedo se já existe uma sessão logada (ex: usuário voltando com
// sessão persistida pelo Supabase Auth), sem depender de o usuário clicar
// antes em OKRs/Agenda/Check-in — é o que permite o botão "🧭 Comando" e o
// auto-redirect em refreshOKRSession() funcionarem já no primeiro load.
async function bootstrapComandoSession() {
    const sb = initSupabaseClient();
    if (!sb) return;
    if (!okrAuthListenerBound) {
        sb.auth.onAuthStateChange(() => refreshOKRSession());
        okrAuthListenerBound = true;
    }
    await refreshOKRSession();
}

async function loadData() {
    try {
        const responseData = await fetch('locais_votacao.json');
        locaisData = await responseData.json();

        // 1. Gerar Coluna de Zonas Eleitorais na Direita
        buildZonasColumn();

        // 2. Carregar e Plotar os Locais de Votação (coordenadas geocodificadas
        // via Google Geocoding API — ver scripts/geocode-google.mjs)
        const pontosResponse = await fetch('locais_pontos.json');
        const pontos = await pontosResponse.json();
        pontosData = pontos;
        plotMarkers(pontos);

        // 3. Carregar e Plotar a camada gráfica de Polígonos de Shapefile (.shp / GeoJSON)
        await loadShapefileLayer();

        // 4. Carregar o contorno individual de cada RA e montar a coluna "RAs"
        await loadRABoundaries();
        buildRAsColumn();

        // 4b. Mancha urbana + área rural (recorte de gerarQuadrantesDaRA())
        await loadUrbanRuralLayers();

        // 5. Carregar as camadas de POI (Escolas / Saúde / Segurança / Instituições Religiosas) da aba "RAs"
        await loadPoiData();

        // 6. Inicializar toggles de camadas da aba Mapa (Zonas Eleitorais)
        initMapTabLayerToggles();

    } catch (error) {
        console.error("Erro ao carregar dados georreferenciados:", error);
    }
}

function makeCircleIcon(color, scale, opacity) {
    return {
        path: google.maps.SymbolPath.CIRCLE,
        scale,
        fillColor: color,
        fillOpacity: opacity,
        strokeColor: '#ffffff',
        strokeWeight: 1.5
    };
}

const LOCATION_TYPE_LABELS = {
    ROOFTOP: 'Endereço exato',
    RANGE_INTERPOLATED: 'Interpolado no trecho da via',
    GEOMETRIC_CENTER: 'Centro geométrico (quadra/área)',
    APPROXIMATE: 'Aproximado'
};

function buildHoverContent(sec) {
    return `
        <div class="kml-hover-tooltip">
            <strong>${sec.local}</strong>
            <div>📍 Endereço: ${sec.endereco || 'N/A'}</div>
            <div>🏘️ Bairro/RA: ${sec.bairro && sec.bairro !== 'N/A' ? sec.bairro : sec.ra || 'N/A'}</div>
            <div>👥 Eleitores: ${sec.eleitorado ? sec.eleitorado.toLocaleString('pt-BR') : 'N/A'}</div>
            <div>🗳️ Seções: ${sec.secoes || 'N/A'}</div>
            ${sec.confianca ? `<div>🎯 Confiança: ${sec.confianca === 'alta' ? 'Alta' : 'Média'}</div>` : ''}
        </div>
    `;
}

// ==========================================
// CAMADAS DE POI (ESCOLAS / SAÚDE / SEGURANÇA PÚBLICA) — ABA "RAs"
// ==========================================
async function loadPoiData() {
    try {
        const [escolas, saude, seguranca, religiao] = await Promise.all([
            fetch('poi_escolas.json').then(r => r.json()),
            fetch('poi_saude.json').then(r => r.json()),
            fetch('poi_seguranca.json').then(r => r.json()),
            fetch('poi_religiao.json').then(r => r.json())
        ]);
        poiData = { escolas, saude, seguranca, religiao };
    } catch (err) {
        console.warn('Erro ao carregar camadas de POI (Escolas/Saúde/Segurança/Religiosas):', err);
    }
}

const POI_ICON_CONFIG = {
    escolas: { path: 'M -6,-6 6,-6 6,6 -6,6 z', fillColor: '#2E7DD7' },
    saude: { path: 'M -2,-6 2,-6 2,-2 6,-2 6,2 2,2 2,6 -2,6 -2,2 -6,2 -6,-2 -2,-2 z', fillColor: '#D7263D' },
    seguranca: { path: 'M 0,-7 6,0 0,7 -6,0 z', fillColor: '#2B2D42' },
    // Marcador neutro (hexágono) — não representa símbolo de nenhuma religião específica.
    religiao: { path: 'M 6,0 3,5.2 -3,5.2 -6,0 -3,-5.2 3,-5.2 z', fillColor: '#7B5EA7' }
};

function makePoiIcon(category) {
    const cfg = POI_ICON_CONFIG[category];
    return {
        path: cfg.path,
        fillColor: cfg.fillColor,
        fillOpacity: 0.95,
        strokeColor: '#ffffff',
        strokeWeight: 1.3,
        scale: 1
    };
}

function buildEscolaHoverContent(p) {
    return `
        <div class="kml-hover-tooltip">
            <strong>🏫 ${p.nome}</strong>
            <div>🏘️ RA: ${p.ra}</div>
        </div>
    `;
}

function buildSaudeHoverContent(p) {
    return `
        <div class="kml-hover-tooltip">
            <strong>🏥 ${p.nome}</strong>
            <div>🏘️ RA: ${p.ra}</div>
            ${p.tipo ? `<div>🔸 Tipo: ${p.tipo}</div>` : ''}
            <div>${p.abertoAoPublico ? '✅ Aberto ao público' : '⛔ Não aberto ao público'}</div>
        </div>
    `;
}

function buildSegurancaHoverContent(p) {
    return `
        <div class="kml-hover-tooltip">
            <strong>🚓 ${p.nome}</strong>
            <div>🏘️ RA: ${p.ra}</div>
            ${p.orgao ? `<div>🏛️ Órgão: ${p.orgao}</div>` : ''}
            ${p.tipo ? `<div>🔸 Tipo: ${p.tipo}</div>` : ''}
            ${p.endereco ? `<div>📍 ${p.endereco}</div>` : ''}
        </div>
    `;
}

function buildReligiaoHoverContent(p) {
    return `
        <div class="kml-hover-tooltip">
            <strong>⛪ ${p.nome}</strong>
            <div>🏘️ RA: ${p.ra}</div>
            ${p.endereco ? `<div>📍 ${p.endereco}</div>` : ''}
        </div>
    `;
}

const POI_HOVER_BUILDERS = {
    escolas: buildEscolaHoverContent,
    saude: buildSaudeHoverContent,
    seguranca: buildSegurancaHoverContent,
    religiao: buildReligiaoHoverContent
};

const POI_CATEGORIES = ['escolas', 'saude', 'seguranca', 'religiao'];

function clearPoiMarkers(category) {
    const categorias = category ? [category] : POI_CATEGORIES;
    categorias.forEach(cat => {
        (poiMarkers[cat] || []).forEach(m => m.setMap(null));
        poiMarkers[cat] = [];
    });
}

// Recria os marcadores de POI visíveis: só desenha algo se houver uma RA
// selecionada (incl. "TODOS") e a categoria estiver com o checkbox marcado.
function updatePoiMarkers() {
    POI_CATEGORIES.forEach(cat => {
        clearPoiMarkers(cat);
        if (!activeRA || !activePoiLayers[cat]) return;

        const itens = (poiData[cat] || []).filter(p => activeRA === ALL_RA_KEY || p.ra === activeRA);
        itens.forEach(p => {
            const marker = new google.maps.Marker({
                position: { lat: p.lat, lng: p.lng },
                map,
                icon: makePoiIcon(cat),
                zIndex: 500
            });
            marker.addListener('mouseover', () => {
                sharedInfoWindow.setContent(POI_HOVER_BUILDERS[cat](p));
                sharedInfoWindow.open({ map, anchor: marker });
            });
            marker.addListener('mouseout', () => sharedInfoWindow.close());
            poiMarkers[cat].push(marker);
        });
    });
}

POI_CATEGORIES.forEach(cat => {
    const checkbox = document.getElementById(`poi-toggle-${cat}`);
    if (!checkbox) return;
    checkbox.addEventListener('change', () => {
        activePoiLayers[cat] = checkbox.checked;
        updatePoiMarkers();
    });
});

// ==========================================
// CAMADAS E TOGGLES DA ABA MAPA (ZONAS ELEITORAIS)
// ==========================================
function updateMapSecoesVisibility() {
    const showSecoes = activeMapTabLayers.secoes;
    if (!activeZone) {
        markers.forEach(m => {
            m.setMap(showSecoes ? map : null);
            m.setIcon(makeCircleIcon(m._baseColor, 6, 0.9));
            m.setZIndex(1);
        });
    } else {
        Object.entries(markerMap).forEach(([zId, zMarkers]) => {
            const isTarget = zId === activeZone;
            zMarkers.forEach(m => {
                if (showSecoes) {
                    m.setMap(map);
                    if (isTarget) {
                        m.setIcon(makeCircleIcon(m._baseColor, 8, 1.0));
                        m.setZIndex(999);
                    } else {
                        m.setIcon(makeCircleIcon(m._baseColor, 4, 0.25));
                        m.setZIndex(1);
                    }
                } else {
                    m.setMap(null);
                }
            });
        });
    }
}

function updateMapZonasVisibility() {
    if (map && map.data) {
        map.data.setMap(activeMapTabLayers.zonas ? map : null);
    }
}

function updateMapQuadrantesVisibility() {
    areaRectangles.forEach(rect => rect.setMap(activeMapTabLayers.quadrantes ? map : null));
}

// Redesenha os retângulos dos quadrantes a partir de okrDataCache.areas
// (chamada depois de carregar/gerar quadrantes). Visualização somente
// leitura — o desenho em si vem da grade fixa gerada no servidor.
function renderAreaRectangles() {
    if (!map) return;
    areaRectangles.forEach(rect => rect.setMap(null));
    areaRectangles = (okrDataCache.areas || []).map(area => {
        const rect = new google.maps.Rectangle({
            bounds: { north: area.lat_max, south: area.lat_min, east: area.lng_max, west: area.lng_min },
            strokeColor: '#e07b39',
            strokeWeight: 1.5,
            fillColor: '#e07b39',
            fillOpacity: 0.12,
            map: activeMapTabLayers.quadrantes ? map : null
        });
        rect.addListener('mouseover', () => {
            sharedInfoWindow.setContent(`<div class="kml-hover-tooltip"><strong>🔲 ${area.codigo}</strong><div>${area.nome}</div><div>🏘️ ${area.ra_nome}</div></div>`);
            sharedInfoWindow.setPosition({ lat: area.lat_max, lng: (area.lng_min + area.lng_max) / 2 });
            sharedInfoWindow.open(map);
        });
        rect.addListener('mouseout', () => sharedInfoWindow.close());
        return rect;
    });
}

function updateMapTabPoiMarkers() {
    POI_CATEGORIES.forEach(cat => {
        (mapTabPoiMarkers[cat] || []).forEach(m => m.setMap(null));
        mapTabPoiMarkers[cat] = [];

        if (!activeMapTabLayers[cat]) return;

        const itens = (poiData[cat] || []).filter(p => {
            if (!activeZone) return true;
            const zoneInfo = ZONAS_DATA ? ZONAS_DATA[activeZone] : null;
            if (zoneInfo && zoneInfo.ras) {
                return zoneInfo.ras.some(ra => ra.toLowerCase() === (p.ra || '').toLowerCase());
            }
            return true;
        });

        itens.forEach(p => {
            const marker = new google.maps.Marker({
                position: { lat: p.lat, lng: p.lng },
                map,
                icon: makePoiIcon(cat),
                zIndex: 500
            });
            marker.addListener('mouseover', () => {
                sharedInfoWindow.setContent(POI_HOVER_BUILDERS[cat](p));
                sharedInfoWindow.open({ map, anchor: marker });
            });
            marker.addListener('mouseout', () => sharedInfoWindow.close());
            mapTabPoiMarkers[cat].push(marker);
        });
    });
}

function initMapTabLayerToggles() {
    const secoesCheckbox = document.getElementById('map-toggle-secoes');
    if (secoesCheckbox) {
        secoesCheckbox.addEventListener('change', () => {
            activeMapTabLayers.secoes = secoesCheckbox.checked;
            updateMapSecoesVisibility();
        });
    }

    const zonasCheckbox = document.getElementById('map-toggle-zonas');
    if (zonasCheckbox) {
        zonasCheckbox.addEventListener('change', () => {
            activeMapTabLayers.zonas = zonasCheckbox.checked;
            updateMapZonasVisibility();
        });
    }

    const quadrantesCheckbox = document.getElementById('map-toggle-quadrantes');
    if (quadrantesCheckbox) {
        quadrantesCheckbox.addEventListener('change', async () => {
            activeMapTabLayers.quadrantes = quadrantesCheckbox.checked;
            if (activeMapTabLayers.quadrantes && !areaRectangles.length) {
                await ensureAreasLoaded();
                renderAreaRectangles();
            }
            updateMapQuadrantesVisibility();
        });
    }

    POI_CATEGORIES.forEach(cat => {
        const checkbox = document.getElementById(`map-toggle-${cat}`);
        if (!checkbox) return;
        checkbox.addEventListener('change', () => {
            activeMapTabLayers[cat] = checkbox.checked;
            updateMapTabPoiMarkers();
        });
    });
}

// Plotar Marcadores dos Locais de Votação com Coordenadas Reais (Google Geocoding)
function plotMarkers(pontos) {
    markers.forEach(m => m.setMap(null));
    markers = [];
    markerMap = {};
    markerMapByRA = {};

    // Vários locais podem cair na mesma coordenada (mesmo endereço/quadra).
    // Para não empilhar marcadores exatamente um sobre o outro, aplicamos um
    // pequeno leque visual em espiral — a coordenada real não muda, só o
    // ponto de desenho do pino.
    const GOLDEN_ANGLE = 137.508 * (Math.PI / 180);
    const coordOccurrences = {};

    pontos.forEach((sec) => {
        if (sec.lat == null || sec.lng == null) return; // sem coordenada geocodificada

        let lat = sec.lat, lng = sec.lng;
        const coordKey = `${lat.toFixed(5)},${lng.toFixed(5)}`;
        const n = coordOccurrences[coordKey] || 0;
        coordOccurrences[coordKey] = n + 1;
        if (n > 0) {
            const angle = n * GOLDEN_ANGLE;
            const radiusDeg = 0.00035 * Math.sqrt(n); // ~40m por passo da espiral
            lat += Math.cos(angle) * radiusDeg;
            lng += Math.sin(angle) * radiusDeg;
        }

        // Obter a cor exata da Zona Eleitoral
        const markerColor = zoneColors[sec.zona] || '#1F4E78';

        const marker = new google.maps.Marker({
            position: { lat, lng },
            map,
            icon: makeCircleIcon(markerColor, 6, 0.9),
            zIndex: 1
        });
        marker._baseColor = markerColor;

        // HOVER: Local, Endereço, Bairro/RA, Eleitores e Seções
        marker.addListener('mouseover', () => {
            sharedInfoWindow.setContent(buildHoverContent(sec));
            sharedInfoWindow.open({ map, anchor: marker });
        });
        marker.addListener('mouseout', () => {
            sharedInfoWindow.close();
        });

        // Ao clicar no ponto, ativa a Zona Eleitoral correspondente
        marker.addListener('click', () => {
            if (sec.zona && sec.zona !== 'N/A') {
                selectZone(sec.zona);
            }
        });

        markers.push(marker);

        // Guardar referência do marcador por Zona
        if (sec.zona && sec.zona !== 'N/A') {
            if (!markerMap[sec.zona]) markerMap[sec.zona] = [];
            markerMap[sec.zona].push(marker);
        }

        // Guardar referência do marcador por Região Administrativa (campo "ra" do dado)
        if (sec.ra && sec.ra !== 'N/A') {
            if (!markerMapByRA[sec.ra]) markerMapByRA[sec.ra] = [];
            markerMapByRA[sec.ra].push(marker);
        }
    });
}

// ==========================================
// CAMADA GRÁFICA DE POLÍGONOS DE SHAPEFILE (.SHP / GEOJSON)
// ==========================================
async function loadShapefileLayer() {
    try {
        const response = await fetch('zonas_shapefile.json');
        if (!response.ok) return;
        const geojson = await response.json();

        // Limpar dados de polígonos anteriores, se houver
        map.data.forEach(feature => map.data.remove(feature));

        map.data.addGeoJson(geojson);

        // Estilização dinâmica da camada de dados por Zona
        updateMapDataStyle();

        // Evento HOVER (mouseover): destaca a borda e abre tooltip com dados do DBF
        map.data.addListener('mouseover', (event) => {
            map.data.overrideStyle(event.feature, {
                fillOpacity: 0.45,
                strokeWeight: 3,
                strokeOpacity: 1.0
            });

            const props = {};
            event.feature.forEachProperty((val, key) => { props[key] = val; });
            const zonaId = props.zona || props.ZONA || props.NR_ZONA || 'N/A';
            const nomeZona = props.nome || props.NOME || props.NM_ZONA || `Zona Eleitoral ${zonaId}`;

            let tooltipHtml = `
                <div class="kml-hover-tooltip">
                    <strong>🗺️ ${nomeZona}</strong>
                    <div>📍 Zona: ${zonaId}</div>
            `;

            // Exibe propriedades adicionais extraídas do .dbf
            Object.keys(props).forEach(key => {
                if (!['zona', 'ZONA', 'NR_ZONA', 'nome', 'NOME', 'color', 'style'].includes(key)) {
                    tooltipHtml += `<div>🔸 <strong>${key}:</strong> ${props[key]}</div>`;
                }
            });
            tooltipHtml += `</div>`;

            sharedInfoWindow.setContent(tooltipHtml);
            sharedInfoWindow.setPosition(event.latLng);
            sharedInfoWindow.open(map);
        });

        // Evento MOUSEOUT: restaura o estilo padrão
        map.data.addListener('mouseout', () => {
            map.data.revertStyle();
            sharedInfoWindow.close();
        });

        // Evento CLICK: Seleciona e destaca a Zona Eleitoral no painel lateral
        map.data.addListener('click', (event) => {
            const zonaId = event.feature.getProperty('zona') || event.feature.getProperty('ZONA') || event.feature.getProperty('NR_ZONA');
            if (zonaId) {
                selectZone(String(zonaId));
            }
        });

        console.log('✅ Camada gráfica Shapefile (GeoJSON) carregada no mapa.');
    } catch (err) {
        console.warn('Erro ao carregar a camada de polígonos Shapefile:', err);
    }
}

function updateMapDataStyle() {
    if (!map || !map.data) return;
    map.data.setStyle((feature) => {
        const zonaId = String(feature.getProperty('zona') || feature.getProperty('ZONA') || feature.getProperty('NR_ZONA') || '');
        const color = zoneColors[zonaId] || feature.getProperty('color') || '#1F4E78';
        const isSelected = activeZone && String(activeZone) === zonaId;

        return {
            fillColor: color,
            fillOpacity: isSelected ? 0.40 : 0.18,
            strokeColor: color,
            strokeWeight: isSelected ? 3 : 1.5,
            strokeOpacity: isSelected ? 1.0 : 0.7
        };
    });
}

// ==========================================
// CAMADA DE CONTORNO POR REGIÃO ADMINISTRATIVA (ABA "RAs")
// ==========================================
async function loadRABoundaries() {
    try {
        const response = await fetch('regioes_administrativas.geojson');
        if (!response.ok) return;
        const geojson = await response.json();

        raLayer = new google.maps.Data({ map: null });
        raLayer.addGeoJson(geojson);
        updateRALayerStyle();

        raLayer.addListener('mouseover', (event) => {
            raLayer.overrideStyle(event.feature, { strokeWeight: 3, strokeOpacity: 1.0 });
            const raNome = event.feature.getProperty('ra_nome');
            sharedInfoWindow.setContent(`<div class="kml-hover-tooltip"><strong>🏛️ ${raNome}</strong></div>`);
            sharedInfoWindow.setPosition(event.latLng);
            sharedInfoWindow.open(map);
        });
        raLayer.addListener('mouseout', () => {
            raLayer.revertStyle();
            sharedInfoWindow.close();
        });
        raLayer.addListener('click', (event) => {
            const raNome = event.feature.getProperty('ra_nome');
            // O nome no shapefile pode diferir do campo "ra" salvo nos locais (ver RA_NAME_TO_SHAPEFILE)
            const dataRaName = Object.keys(RA_NAME_TO_SHAPEFILE).find(k => RA_NAME_TO_SHAPEFILE[k] === raNome) || raNome;
            if (markerMapByRA[dataRaName]) selectRA(dataRaName);
        });

        console.log('✅ Camada de contorno por RA carregada no mapa.');
    } catch (err) {
        console.warn('Erro ao carregar a camada de contorno das RAs:', err);
    }
}

// Carrega as camadas de mancha urbana e área rural (ver comentário acima de
// urbanLayer) — usadas tanto pra desenhar um contexto visual leve no mapa
// quanto, via getUrbanPolygon()/getRuralPolygon(), pra recortar a grade de
// quadrantes em gerarQuadrantesDaRA().
async function loadUrbanRuralLayers() {
    try {
        const [urbanRes, ruralRes] = await Promise.all([
            fetch('perimetro_urbano.geojson'),
            fetch('area_rural_assentamentos.geojson')
        ]);
        if (urbanRes.ok) {
            urbanLayer = new google.maps.Data({ map: null });
            urbanLayer.addGeoJson(await urbanRes.json());
            urbanLayer.setStyle({
                fillColor: '#2e7d32', fillOpacity: 0.10,
                strokeColor: '#2e7d32', strokeWeight: 1, strokeOpacity: 0.5,
                clickable: false
            });
        }
        if (ruralRes.ok) {
            ruralAreaLayer = new google.maps.Data({ map: null });
            ruralAreaLayer.addGeoJson(await ruralRes.json());
            ruralAreaLayer.setStyle({
                fillColor: '#c62828', fillOpacity: 0.18,
                strokeColor: '#c62828', strokeWeight: 1, strokeOpacity: 0.6,
                clickable: false
            });
        }
        console.log('✅ Camadas de mancha urbana + área rural carregadas.');
    } catch (err) {
        console.warn('Erro ao carregar camadas de mancha urbana/área rural:', err);
    }
}

function updateRALayerStyle() {
    if (!raLayer) return;
    raLayer.setStyle((feature) => {
        const raNome = feature.getProperty('ra_nome');
        const targetShapefileName = activeRA ? (RA_NAME_TO_SHAPEFILE[activeRA] || activeRA) : null;
        const isSelected = targetShapefileName === raNome;

        if (activeRA && activeRA !== ALL_RA_KEY) {
            // Uma RA selecionada: evidencia só o contorno dela, o resto fica invisível
            return {
                fillColor: '#1F4E78',
                fillOpacity: isSelected ? 0.28 : 0,
                strokeColor: '#1F4E78',
                strokeWeight: isSelected ? 3 : 0,
                strokeOpacity: isSelected ? 1.0 : 0,
                clickable: isSelected
            };
        }

        // Nenhuma RA selecionada, ou "TODOS": visão geral neutra de todos os contornos
        return {
            fillColor: '#1F4E78',
            fillOpacity: 0.05,
            strokeColor: '#1F4E78',
            strokeWeight: 1,
            strokeOpacity: 0.5
        };
    });
}

function buildRAsColumn() {
    const container = document.getElementById('ras-legend-list');
    if (!container) return;
    container.innerHTML = '';
    raListItems = {};

    const counts = {};
    pontosData.forEach(p => {
        if (!p.ra || p.ra === 'N/A') return;
        counts[p.ra] = (counts[p.ra] || 0) + 1;
    });

    // Item especial "TODOS": mostra todas as RAs de uma vez (locais + POIs), sem filtrar
    const allItem = document.createElement('div');
    allItem.className = 'legend-item';
    allItem.innerHTML = `
        <div class="legend-color" style="background-color: #1F4E78;"></div>
        <div class="legend-text">
            <span class="legend-zona-name">TODOS</span>
            <span class="legend-zona-ras">${pontosData.length} local(is) de votação no DF</span>
        </div>
    `;
    allItem.addEventListener('click', () => selectRA(ALL_RA_KEY));
    container.appendChild(allItem);
    raListItems[ALL_RA_KEY] = allItem;

    Object.keys(counts).sort((a, b) => a.localeCompare(b, 'pt-BR')).forEach(raName => {
        const item = document.createElement('div');
        item.className = 'legend-item';
        item.innerHTML = `
            <div class="legend-color" style="background-color: #1F4E78;"></div>
            <div class="legend-text">
                <span class="legend-zona-name">${raName}</span>
                <span class="legend-zona-ras">${counts[raName]} local(is) de votação</span>
            </div>
        `;
        item.addEventListener('click', () => selectRA(raName));
        container.appendChild(item);
        raListItems[raName] = item;
    });
}

function resetMarkers() {
    markers.forEach(m => {
        m.setIcon(makeCircleIcon(m._baseColor, 6, 0.9));
        m.setZIndex(1);
    });
}

function clearZoneSelection() {
    if (activeZone) {
        const prevItem = document.querySelector(`.legend-item[data-zone="${activeZone}"]`);
        if (prevItem) prevItem.classList.remove('active');
    }
    activeZone = null;
    updateMapSecoesVisibility();
    updateMapDataStyle();
    updateMapTabPoiMarkers();
    document.getElementById('sidebar-content').innerHTML =
        `<div class="instruction">Selecione uma Zona Eleitoral na coluna ao lado para visualizar os detalhes.</div>`;
}

function clearRASelection() {
    if (activeRA && raListItems[activeRA]) raListItems[activeRA].classList.remove('active');
    activeRA = null;
    resetMarkers();
    updateRALayerStyle();
    clearPoiMarkers();
    document.getElementById('ra-sidebar-content').innerHTML =
        `<div class="instruction">Selecione uma Região Administrativa na coluna ao lado para visualizar os detalhes.</div>`;
}

// Selecionar RA: filtra os marcadores (pelo campo "ra" do dado), foca o mapa e
// evidencia apenas o contorno daquela RA. raName pode ser ALL_RA_KEY ("TODOS"),
// que exibe todas as RAs de uma vez, sem esmaecer nenhum marcador.
function selectRA(raName) {
    if (activeRA && raListItems[activeRA]) raListItems[activeRA].classList.remove('active');
    activeRA = raName;
    if (raListItems[raName]) {
        raListItems[raName].classList.add('active');
        raListItems[raName].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    const isAll = raName === ALL_RA_KEY;
    const raBounds = new google.maps.LatLngBounds();
    let hasBounds = false;
    Object.entries(markerMapByRA).forEach(([ra, raMarkers]) => {
        const isTarget = isAll || ra === raName;
        raMarkers.forEach(m => {
            if (isTarget) {
                m.setIcon(makeCircleIcon(m._baseColor, isAll ? 6 : 8, isAll ? 0.9 : 1.0));
                m.setZIndex(isAll ? 1 : 999);
                raBounds.extend(m.getPosition());
                hasBounds = true;
            } else {
                m.setIcon(makeCircleIcon(m._baseColor, 4, 0.15));
                m.setZIndex(1);
            }
        });
    });

    if (hasBounds) {
        map.fitBounds(raBounds, 40);
        if (!isAll) {
            google.maps.event.addListenerOnce(map, 'bounds_changed', () => {
                if (map.getZoom() > 14) map.setZoom(14);
            });
        }
    }

    updateRALayerStyle();
    showRAData(raName);
    updatePoiMarkers();
}

function showRAData(raName) {
    const sidebar = document.getElementById('ra-sidebar-content');
    const isAll = raName === ALL_RA_KEY;
    const locais = isAll ? pontosData.filter(p => p.ra && p.ra !== 'N/A') : pontosData.filter(p => p.ra === raName);
    const titulo = isAll ? 'Todas as Regiões Administrativas' : raName;

    if (locais.length === 0) {
        sidebar.innerHTML = `<div class="instruction">Nenhum dado encontrado para ${titulo}.</div>`;
        return;
    }

    let totalEleitores = 0; let totalSecoes = 0;
    const zonasEnvolvidas = new Set();
    locais.forEach(l => {
        totalEleitores += l.eleitorado || 0;
        totalSecoes += l.secoes || 0;
        if (l.zona && l.zona !== 'N/A') zonasEnvolvidas.add(l.zona);
    });
    const zonasTexto = [...zonasEnvolvidas].sort((a, b) => Number(a) - Number(b)).join(', ');

    let html = `
        <div class="zone-info">
            <h3>🏛️ ${titulo}</h3>
            ${zonasTexto ? `<p style="font-size:0.85rem; color:#666; margin-top:-8px; margin-bottom:12px;">Zona(s) Eleitoral(is): ${zonasTexto}</p>` : ''}
            <div class="summary-stats">
                <div class="stat-box"><span>Locais</span><strong>${locais.length}</strong></div>
                <div class="stat-box"><span>Seções</span><strong>${totalSecoes}</strong></div>
                <div class="stat-box"><span>Eleitorado</span><strong>${totalEleitores.toLocaleString('pt-BR')}</strong></div>
            </div>
            <button class="btn-open-table" onclick="openRAModal('${raName.replace(/'/g, "\\'")}')">📋 Ver Tabela Completa</button>
            <h4>Locais de Votação (Amostra):</h4>
            <div style="margin-top: 10px;">
    `;

    locais.slice(0, 5).forEach(l => {
        html += `
            <div class="local-list-item">
                <h4>${l.local}</h4>
                <p><strong>Bairro:</strong> ${l.bairro && l.bairro !== 'N/A' ? l.bairro : l.ra}</p>
                <p><strong>Eleitores:</strong> ${(l.eleitorado || 0).toLocaleString('pt-BR')}</p>
            </div>`;
    });

    if (locais.length > 5) html += `<p style="text-align:center; font-size: 0.8rem; color:#666; margin-top:10px;">+ ${locais.length - 5} locais...</p>`;
    html += `</div></div>`;
    sidebar.innerHTML = html;
}

function openRAModal(raName) {
    const isAll = raName === ALL_RA_KEY;
    const locais = isAll ? pontosData.filter(p => p.ra && p.ra !== 'N/A') : pontosData.filter(p => p.ra === raName);
    if (!locais.length) return;

    document.getElementById("modal-title").innerText = `Tabela de Locais - ${isAll ? 'Todas as RAs' : raName}`;
    const tbody = document.getElementById("table-body");
    tbody.innerHTML = '';

    locais.forEach(l => {
        let tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${l.local}</strong></td>
            <td>${l.endereco || ''}</td>
            <td>${l.ra || ''}</td>
            <td>${l.bairro || ''}</td>
            <td>${l.secoes || 0}</td>
            <td>${(l.eleitorado || 0).toLocaleString('pt-BR')}</td>
        `;
        tbody.appendChild(tr);
    });
    modal.style.display = "block";
}

// ==========================================
// COLUNA DE ZONAS ELEITORAIS (DIREITA)
// ==========================================
function buildZonasColumn() {
    const container = document.getElementById('zonas-legend-list');
    if (!container) return;
    container.innerHTML = '';

    const zoneOrder = ["1","2","3","4","5","6","8","9","10","11","13","14","15","16","17","18","19","20","21"];

    zoneOrder.forEach(zoneId => {
        const zoneInfo = ZONAS_DATA ? ZONAS_DATA[zoneId] : null;
        const color = zoneColors[zoneId] || '#999';
        const nome = zoneInfo ? zoneInfo.nome : `Zona ${zoneId}`;
        const rasText = zoneInfo ? zoneInfo.ras.join(', ') : '';

        const item = document.createElement('div');
        item.className = 'legend-item';
        item.setAttribute('data-zone', zoneId);
        item.innerHTML = `
            <div class="legend-color" style="background-color: ${color};"></div>
            <div class="legend-text">
                <span class="legend-zona-name">${zoneId} — ${zoneInfo ? zoneInfo.ras[0] : ''}</span>
                <span class="legend-zona-ras">${rasText}</span>
            </div>
        `;

        item.addEventListener('click', () => selectZone(zoneId));
        container.appendChild(item);
    });
}

// Selecionar Zona: Filtra os marcadores, foca o mapa e carrega os detalhes na Sidebar
function selectZone(zoneId) {
    // 1. Atualizar classe active na coluna da direita
    if (activeZone) {
        const prevItem = document.querySelector(`.legend-item[data-zone="${activeZone}"]`);
        if (prevItem) prevItem.classList.remove('active');
    }
    activeZone = zoneId;
    const item = document.querySelector(`.legend-item[data-zone="${zoneId}"]`);
    if (item) {
        item.classList.add('active');
        item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    // 2. Destacar marcadores da zona selecionada e esmaecer os outros (se seções ativas)
    const zoneBounds = new google.maps.LatLngBounds();
    let hasBounds = false;
    Object.entries(markerMap).forEach(([zId, zMarkers]) => {
        const isTarget = zId === zoneId;
        zMarkers.forEach(m => {
            if (activeMapTabLayers.secoes) {
                m.setMap(map);
                if (isTarget) {
                    m.setIcon(makeCircleIcon(m._baseColor, 8, 1.0));
                    m.setZIndex(999);
                    zoneBounds.extend(m.getPosition());
                    hasBounds = true;
                } else {
                    m.setIcon(makeCircleIcon(m._baseColor, 4, 0.25));
                    m.setZIndex(1);
                }
            } else {
                m.setMap(null);
                if (isTarget) {
                    zoneBounds.extend(m.getPosition());
                    hasBounds = true;
                }
            }
        });
    });

    // 3. Ajustar zoom do mapa nos marcadores da zona (o Google Maps não tem
    // parâmetro nativo de maxZoom no fitBounds, então capamos manualmente)
    if (hasBounds) {
        map.fitBounds(zoneBounds, 40);
        google.maps.event.addListenerOnce(map, 'bounds_changed', () => {
            if (map.getZoom() > 13) map.setZoom(13);
        });
    }

    // 4. Atualizar o destaque visual do polígono da zona no mapa
    updateMapDataStyle();

    // 5. Atualizar marcadores de POI na aba Mapa para a zona selecionada
    updateMapTabPoiMarkers();

    // 6. Exibir dados e estatísticas da Zona na Sidebar Esquerda
    showZoneData(zoneId);
}

function showZoneData(zoneId) {
    const sidebar = document.getElementById('sidebar-content');
    const locais = locaisData[zoneId];

    if (!locais || locais.length === 0) {
        sidebar.innerHTML = `<div class="instruction">Nenhum dado encontrado para a Zona ${zoneId}.</div>`;
        return;
    }

    let totalEleitores = 0; let totalSecoes = 0;
    locais.forEach(l => { totalEleitores += l.eleitorado; totalSecoes += l.secoes_2022; });

    let html = `
        <div class="zone-info">
            <h3>📍 Zona Eleitoral ${zoneId}</h3>
            <div class="summary-stats">
                <div class="stat-box"><span>Locais</span><strong>${locais.length}</strong></div>
                <div class="stat-box"><span>Seções</span><strong>${totalSecoes}</strong></div>
                <div class="stat-box"><span>Eleitorado</span><strong>${totalEleitores.toLocaleString('pt-BR')}</strong></div>
            </div>
            <button class="btn-open-table" onclick="openModal('${zoneId}')">📋 Ver Tabela Completa</button>
            <h4>Locais de Votação (Amostra):</h4>
            <div style="margin-top: 10px;">
    `;

    const amostra = locais.slice(0, 5);
    amostra.forEach(l => {
        html += `
            <div class="local-list-item">
                <h4>${l.local}</h4>
                <p><strong>Bairro:</strong> ${l.bairro_2022 || l.ra}</p>
                <p><strong>Eleitores:</strong> ${l.eleitorado.toLocaleString('pt-BR')}</p>
            </div>`;
    });

    if (locais.length > 5) html += `<p style="text-align:center; font-size: 0.8rem; color:#666; margin-top:10px;">+ ${locais.length - 5} locais...</p>`;
    html += `</div></div>`;
    sidebar.innerHTML = html;
}

// ==========================================
// MODAL & PESQUISA
// ==========================================
const modal = document.getElementById("data-modal");
const spanClose = document.getElementsByClassName("close-btn")[0];

function openModal(zoneId) {
    const locais = locaisData[zoneId];
    if (!locais) return;

    document.getElementById("modal-title").innerText = `Tabela de Locais - Zona ${zoneId}`;
    const tbody = document.getElementById("table-body");
    tbody.innerHTML = '';

    locais.forEach(l => {
        let tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${l.local}</strong></td>
            <td>${l.endereco}</td>
            <td>${l.ra}</td>
            <td>${l.bairro_2022}</td>
            <td>${l.secoes_2022}</td>
            <td>${l.eleitorado.toLocaleString('pt-BR')}</td>
        `;
        tbody.appendChild(tr);
    });
    modal.style.display = "block";
}

spanClose.onclick = function() { modal.style.display = "none"; }
window.onclick = function(event) { if (event.target == modal) { modal.style.display = "none"; } }

document.getElementById('search-btn').addEventListener('click', performSearch);
document.getElementById('search-input').addEventListener('keypress', function (e) { if (e.key === 'Enter') performSearch(); });

function performSearch() {
    const query = document.getElementById('search-input').value.toLowerCase().trim();
    if (!query) return;

    let foundZones = [];
    for (const [zona, locais] of Object.entries(locaisData)) {
        let match = locais.some(l => 
            l.local.toLowerCase().includes(query) || l.endereco.toLowerCase().includes(query) ||
            l.bairro_2022.toLowerCase().includes(query) || l.ra.toLowerCase().includes(query)
        );
        if (match) foundZones.push(zona);
    }

    const sidebar = document.getElementById('sidebar-content');
    if (foundZones.length === 0) {
        sidebar.innerHTML = `<div class="instruction">Nenhum resultado encontrado.</div>`;
        return;
    }

    let html = `<h3>🔍 Resultados para "${query}"</h3><p style="margin-bottom:15px; font-size:0.9rem;">Encontrado em ${foundZones.length} zona(s):</p>`;
    foundZones.forEach(zona => {
        html += `
            <div class="local-list-item" style="cursor:pointer; border-color:#1F4E78; border-left-width: 4px;" onclick="showZoneData('${zona}')">
                <h4>Zona Eleitoral ${zona}</h4><p>Clique para carregar dados desta zona.</p>
            </div>`;
    });
    sidebar.innerHTML = html;
}

// ==========================================
// MÓDULO DE OKRS — CAMPANHA DF 2026 (SUPABASE DIRETO, SEM API INTERMEDIÁRIA)
// Hierarquia: Campanha (única) -> RA -> Coordenação Regional ("product",
// por Zona Eleitoral) -> Ciclo ("period") -> Objective (estratégico/
// tático) -> Key Result. Leitura aberta a qualquer usuário autenticado
// (transparência); escrita restrita por RLS a super admin ou membros
// da Coordenação Regional responsável (ver supabase/schema.sql).
// ==========================================
let supabaseClient = null;
let okrAuthListenerBound = false;
let okrCurrentUser = null; // linha de public.profiles do usuário logado
let okrUserProductIds = []; // product_id onde o usuário logado é coordenador/operacional
let okrUserCoordProductIds = []; // subconjunto de okrUserProductIds onde o papel é 'coordenador'
let okrDataCache = { periods: [], activePeriodId: null, products: [], productTeam: [], objectives: [], keyResults: [], artefatos: [], areas: [], areaVolunteers: [] };
let currentOKRFilterLevel = 'all';

function initSupabaseClient() {
    if (supabaseClient) return supabaseClient;
    const url = window.SUPABASE_URL;
    const key = window.SUPABASE_ANON_KEY;
    if (!window.supabase || !url || !key || url.indexOf('VITE_SUPABASE_URL') !== -1) {
        return null; // placeholder não substituído: env var não configurada no build
    }
    supabaseClient = window.supabase.createClient(url, key);
    return supabaseClient;
}

async function initOKRModule() {
    const sb = initSupabaseClient();
    if (!sb) {
        const container = document.getElementById('okr-list-container');
        if (container) {
            container.innerHTML = '<div class="instruction">Módulo de OKRs não configurado: defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY (ver README).</div>';
        }
        const authBox = document.getElementById('okr-auth-status');
        if (authBox) {
            authBox.innerHTML = '<p class="okr-auth-hint">Login indisponível: o painel ainda não está conectado a um projeto Supabase.</p>';
        }
        return;
    }
    if (!okrAuthListenerBound) {
        sb.auth.onAuthStateChange(() => refreshOKRSession());
        okrAuthListenerBound = true;
    }
    await refreshOKRSession();
    await loadOKRData();
}

async function refreshOKRSession() {
    const sb = initSupabaseClient();
    if (!sb) return;
    const jaEstavaLogado = !!okrCurrentUser;
    const { data: { session } } = await sb.auth.getSession();
    if (!session) {
        okrCurrentUser = null;
        okrUserProductIds = [];
        okrUserCoordProductIds = [];
        renderOKRAuthBox();
        renderOKRActionButtons();
        updateComandoTabVisibility();
        updateCoordenadorTabVisibility();
        return;
    }
    const { data: profile } = await sb.from('profiles').select('*').eq('id', session.user.id).maybeSingle();
    okrCurrentUser = profile || { id: session.user.id, email: session.user.email, full_name: session.user.email, is_super_admin: false };
    const { data: team } = await sb.from('product_team').select('product_id, papel').eq('user_id', session.user.id);
    okrUserProductIds = (team || []).map(t => t.product_id);
    okrUserCoordProductIds = (team || []).filter(t => t.papel === 'coordenador').map(t => t.product_id);
    renderOKRAuthBox();
    renderOKRActionButtons();
    updateComandoTabVisibility();
    updateCoordenadorTabVisibility();

    // Coordenadores (papel='coordenador') caem direto no Painel do Coordenador;
    // nível estratégico e demais membros de product_team (só operacional) caem
    // na Central de Comando — só na primeira vez que a sessão logada é
    // detectada, em vez de ficar na aba Mapa.
    // Guards extras (document.getElementById(...)) a partir da Fase 2 da
    // reestruturação por papel: view-coordenador/view-comando saíram do
    // index.html (migraram para coordenador.html/admin.html) — sem isso,
    // um coordenador/admin com sessão persistida que caísse aqui trocaria
    // pra uma aba sem view nenhuma, e a checagem `showMapView` de
    // switchTab() apagaria o mapa também, deixando a tela em branco.
    if (!jaEstavaLogado && currentTab !== 'comando' && currentTab !== 'coordenador') {
        if (okrUserCoordProductIds.length > 0 && document.getElementById('view-coordenador')) {
            switchTab('coordenador');
        } else if ((okrCurrentUser.is_super_admin || okrUserProductIds.length > 0) && document.getElementById('view-comando')) {
            switchTab('comando');
        }
    }
}

// Mostra/esconde o botão da aba Central de Comando conforme o papel do
// usuário logado (candidato/admin ou coordenador de alguma Coordenação
// Regional). A proteção real de leitura já é a RLS existente — isto é
// só a apresentação do menu; ver também o guard em initComandoModule().
function updateComandoTabVisibility() {
    const btn = document.getElementById('nav-btn-comando');
    if (!btn) return;
    const temAcesso = !!(okrCurrentUser && (okrCurrentUser.is_super_admin || okrUserProductIds.length > 0));
    btn.style.display = temAcesso ? '' : 'none';
    if (!temAcesso && currentTab === 'comando') {
        switchTab('map');
    }
}

// Mostra/esconde o botão da aba Painel do Coordenador — visível a quem
// tem papel='coordenador' em algum product_team, e a is_super_admin
// (que pode inspecionar qualquer Coordenação Regional). Proteção real
// de leitura é a RLS; isto é só apresentação do menu — ver o guard em
// initPainelCoordenadorModule().
function updateCoordenadorTabVisibility() {
    const btn = document.getElementById('nav-btn-coordenador');
    if (!btn) return;
    const temAcesso = !!(okrCurrentUser && (okrCurrentUser.is_super_admin || okrUserCoordProductIds.length > 0));
    btn.style.display = temAcesso ? '' : 'none';
    if (!temAcesso && currentTab === 'coordenador') {
        switchTab('map');
    }
}

// O PostgREST do Supabase corta cada resposta em no máximo 1000 linhas por
// padrão — inofensivo enquanto só a Ceilândia tinha quadrantes (dezenas a
// poucas centenas), mas com as 37 RAs juntas passamos de 2.700 áreas, então
// um .select() simples devolve só as primeiras 1000. Usado onde a tabela
// "areas" é buscada inteira (sem filtrar por RA/produto).
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

// Usado pela aba Mapa quando o usuário liga o toggle "Quadrantes" antes
// de ter visitado a aba OKRs (que é quem normalmente popula okrDataCache).
async function ensureAreasLoaded() {
    if (okrDataCache.areas.length) return;
    const sb = initSupabaseClient();
    if (!sb) return;
    okrDataCache.areas = await fetchAllRows(sb, 'areas', '*', 'codigo');
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
// Autenticação (Supabase Auth: e-mail/senha + Google OAuth)
// ------------------------------------------
function renderOKRAuthBox() {
    const box = document.getElementById('okr-auth-status');
    if (!box) return;

    if (okrCurrentUser) {
        const roleLabel = okrCurrentUser.is_super_admin
            ? '⭐ Nível Estratégico (Admin)'
            : (okrUserProductIds.length ? '📌 Coordenação Regional' : '👤 Leitura (Transparência)');
        box.innerHTML = `
            <span class="user-badge">${roleLabel}</span>
            <p id="okr-user-name">${okrCurrentUser.full_name || okrCurrentUser.email}</p>
            <button class="btn-secondary-sm" onclick="okrSignOut()">🚪 Sair</button>
        `;
    } else {
        box.innerHTML = `
            <p class="okr-auth-hint">Entre para editar OKRs. A leitura dos objetivos é aberta a todos os usuários autenticados.</p>
            <input type="email" id="okr-login-email" class="okr-login-input" placeholder="e-mail" autocomplete="email">
            <input type="password" id="okr-login-password" class="okr-login-input" placeholder="senha" autocomplete="current-password">
            <div class="okr-login-btn-row">
                <button class="btn-secondary-sm" onclick="okrSignInEmail()">Entrar</button>
                <button class="btn-secondary-sm" onclick="okrSignUpEmail()">Cadastrar</button>
            </div>
            <button class="btn-secondary-sm" onclick="okrSignInGoogle()">🌐 Entrar com Google</button>
        `;
    }
}

async function okrSignInEmail() {
    const sb = initSupabaseClient();
    if (!sb) return;
    const email = (document.getElementById('okr-login-email') || {}).value || '';
    const password = (document.getElementById('okr-login-password') || {}).value || '';
    if (!email || !password) return alert('Informe e-mail e senha.');
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) return alert('Erro ao entrar: ' + error.message);
}

async function okrSignUpEmail() {
    const sb = initSupabaseClient();
    if (!sb) return;
    const email = (document.getElementById('okr-login-email') || {}).value || '';
    const password = (document.getElementById('okr-login-password') || {}).value || '';
    if (!email || !password) return alert('Informe e-mail e senha.');
    if (password.length < 6) return alert('A senha precisa ter ao menos 6 caracteres.');
    const { error } = await sb.auth.signUp({ email, password });
    if (error) return alert('Erro ao cadastrar: ' + error.message);
    alert('Cadastro realizado. Verifique seu e-mail se a confirmação estiver ativada, ou faça login diretamente.');
}

async function okrSignInGoogle() {
    const sb = initSupabaseClient();
    if (!sb) return;
    const { error } = await sb.auth.signInWithOAuth({ provider: 'google' });
    if (error) alert('Erro ao entrar com Google: ' + error.message);
}

async function okrSignOut() {
    const sb = initSupabaseClient();
    if (sb) await sb.auth.signOut();
}

// ------------------------------------------
// Botões de ação (visibilidade conforme papel do usuário logado —
// a proteção real contra escrita não autorizada é a RLS no banco)
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

// ------------------------------------------
// Renderização
// ------------------------------------------
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

function findProduct(productId) {
    return okrDataCache.products.find(p => p.id === productId);
}

function renderOKRs() {
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
                        <button class="btn-link" onclick="updateKeyResultProgress('${kr.id}')">✏️ Atualizar</button>
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
        if (currentOKRFilterLevel === 'operacional' && !membros.some(m => m.papel === 'operacional')) return;
        if (currentOKRFilterLevel === 'estrategico') return;

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
                    ${isAdmin ? `<button class="btn-link" onclick="gerarQuadrantesDaRA('${produto.id}')">➕ Gerar</button>` : ''}
                    ${quadrantesHtml}
                </details>
            </div>
        `;
    });

    container.innerHTML = html || '<div class="instruction">Nenhuma coordenação encontrada para este filtro.</div>';
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

// ------------------------------------------
// Quadrantes de voluntários (grade fixa) — em vez de o admin desenhar
// um polígono livre no mapa, cada quadrante é uma célula retangular
// de tamanho fixo (~500m), gerada automaticamente sobre a caixa
// delimitadora da RA da Coordenação. Ver contexto completo no plano.
// ------------------------------------------
const QUADRANTE_TAMANHO_METROS = 500;
const METROS_POR_GRAU_LAT = 111320;

function metrosParaGrausLat(metros) {
    return metros / METROS_POR_GRAU_LAT;
}
function metrosParaGrausLng(metros, latRef) {
    return metros / (METROS_POR_GRAU_LAT * Math.cos(latRef * Math.PI / 180));
}

// Gera uma sigla curta e (na prática, testado contra as 37 RAs oficiais)
// única por RA: nomes de uma palavra só usam as 3 primeiras letras (ex.:
// Ceilândia -> CEI); nomes com 2+ palavras usam a inicial de cada palavra
// (ex.: Riacho Fundo -> RF, Riacho Fundo II -> RFI) — evita colisões entre
// RAs com o mesmo início (Sobradinho/Sobradinho II, Planaltina/Plano
// Piloto, Paranoá/Park Way etc.) que o esquema antigo (3 primeiras letras
// sempre) causava.
function raSigla(raNome) {
    const limpo = (raNome || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
    const palavras = limpo.split(/[^A-Za-z]+/).filter(Boolean);
    if (palavras.length >= 2) {
        return palavras.map(p => p[0]).join('').toUpperCase().slice(0, 4);
    }
    return ((palavras[0] || '').slice(0, 3) || 'RA').toUpperCase();
}

// Calcula a caixa delimitadora (bounding box) do polígono de uma RA a
// partir da camada raLayer já carregada em loadRABoundaries() — evita
// buscar regioes_administrativas.geojson de novo.
function findRAFeatureBounds(raNomeApp) {
    if (!raLayer) return null;
    const targetShapefileName = RA_NAME_TO_SHAPEFILE[raNomeApp] || raNomeApp;
    let bounds = null;
    raLayer.forEach(feature => {
        if (feature.getProperty('ra_nome') !== targetShapefileName) return;
        if (!bounds) bounds = new google.maps.LatLngBounds();
        feature.getGeometry().forEachLatLng(latLng => bounds.extend(latLng));
    });
    return bounds;
}

// Extrai todos os anéis (contorno externo + buracos, e cada parte
// separada se a geometria for um MultiPolygon) de uma feature de qualquer
// camada google.maps.Data, para montar um único google.maps.Polygon
// multi-caminho. containsLocation() usa a regra par-ímpar, que já resolve
// buracos e partes disjuntas corretamente quando todos os anéis viram
// "paths" — por isso serve tanto pra uma RA quanto pra uma camada
// DF-inteira com várias feições soltas (mancha urbana, assentamentos).
function collectPolygonRings(geometry, out) {
    const tipo = geometry.getType();
    if (tipo === 'Polygon') {
        geometry.getArray().forEach(anel => out.push(anel.getArray()));
    } else if (tipo === 'MultiPolygon' || tipo === 'GeometryCollection') {
        geometry.getArray().forEach(g => collectPolygonRings(g, out));
    }
}

// Monta um único google.maps.Polygon multi-caminho a partir de todas as
// feições de "layer" que passarem em filterFn (ou todas, sem filtro) —
// generaliza findRAFeaturePolygon() pra qualquer camada google.maps.Data.
function buildPolygonFromLayer(layer, filterFn) {
    if (!layer) return null;
    const aneis = [];
    layer.forEach(feature => {
        if (filterFn && !filterFn(feature)) return;
        collectPolygonRings(feature.getGeometry(), aneis);
    });
    return aneis.length ? new google.maps.Polygon({ paths: aneis }) : null;
}

// Monta o contorno real (todas as partes e buracos) de uma RA, para testar
// se um ponto cai dentro dela — usado por gerarQuadrantesDaRA() pra
// recortar a grade pela área inteira da RA, não só pela caixa delimitadora.
function findRAFeaturePolygon(raNomeApp) {
    const targetShapefileName = RA_NAME_TO_SHAPEFILE[raNomeApp] || raNomeApp;
    return buildPolygonFromLayer(raLayer, feature => feature.getProperty('ra_nome') === targetShapefileName);
}

// Polígono único (DF inteiro) da mancha urbana e da área rural a excluir —
// construídos uma vez a partir de urbanLayer/ruralAreaLayer (carregadas em
// loadUrbanRuralLayers()) e reaproveitados pra todas as RAs na mesma sessão.
function getUrbanPolygon() {
    if (urbanPolygon === undefined) urbanPolygon = buildPolygonFromLayer(urbanLayer);
    return urbanPolygon;
}
function getRuralPolygon() {
    if (ruralPolygon === undefined) ruralPolygon = buildPolygonFromLayer(ruralAreaLayer);
    return ruralPolygon;
}

async function gerarQuadrantesDaRA(productId) {
    const sb = initSupabaseClient();
    if (!sb) return;
    const produto = findProduct(productId);
    if (!produto) return alert('Coordenação não encontrada.');

    const bounds = findRAFeatureBounds(produto.ra_nome);
    if (!bounds) return alert(`Não encontrei o contorno da RA "${produto.ra_nome}" no mapa. Abra a aba Mapa antes para carregar os contornos e tente de novo.`);
    const poligono = findRAFeaturePolygon(produto.ra_nome);
    if (!poligono) return alert(`Não consegui montar o contorno de "${produto.ra_nome}" para recortar a grade. Tente novamente após recarregar a aba Mapa.`);
    const poligonoUrbano = getUrbanPolygon();
    if (!poligonoUrbano) return alert('Não consegui carregar a mancha urbana (perimetro_urbano.geojson) para recortar a grade. Tente novamente após recarregar a aba Mapa.');
    const poligonoRural = getRuralPolygon(); // opcional: se não carregar, só não filtra por área rural

    const ne = bounds.getNorthEast(), sw = bounds.getSouthWest();
    const latRef = (ne.lat() + sw.lat()) / 2;
    const cellLat = metrosParaGrausLat(QUADRANTE_TAMANHO_METROS);
    const cellLng = metrosParaGrausLng(QUADRANTE_TAMANHO_METROS, latRef);
    const rows = Math.max(1, Math.ceil((ne.lat() - sw.lat()) / cellLat));
    const cols = Math.max(1, Math.ceil((ne.lng() - sw.lng()) / cellLng));

    // Percorre TODA a grade da caixa delimitadora (não só as bordas) e
    // mantém só as células cujo centro cai dentro do polígono real da RA
    // E dentro da mancha urbana E fora de qualquer assentamento rural —
    // cobre a área inteira, descartando tanto o que sobra fora da forma
    // da RA quanto o que é rural/fora da mancha urbana dela.
    const celulas = [];
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const latMin = sw.lat() + r * cellLat;
            const lngMin = sw.lng() + c * cellLng;
            const latMax = Math.min(latMin + cellLat, ne.lat());
            const lngMax = Math.min(lngMin + cellLng, ne.lng());
            const centro = new google.maps.LatLng((latMin + latMax) / 2, (lngMin + lngMax) / 2);
            if (!google.maps.geometry.poly.containsLocation(centro, poligono)) continue;
            if (!google.maps.geometry.poly.containsLocation(centro, poligonoUrbano)) continue;
            if (poligonoRural && google.maps.geometry.poly.containsLocation(centro, poligonoRural)) continue;
            celulas.push({ latMin, latMax, lngMin, lngMax });
        }
    }

    if (!celulas.length) return alert(`Nenhuma célula da grade caiu dentro da área urbana de "${produto.ra_nome}" — pode ser uma RA sem mancha urbana registrada (ex.: só área rural), ou o contorno pode não ter carregado corretamente na aba Mapa.`);

    if (!confirm(`Gerar ${celulas.length} quadrantes (~${QUADRANTE_TAMANHO_METROS}m cada, recortados pela área real de ${produto.ra_nome} ∩ mancha urbana ∖ área rural, de uma grade de até ${rows * cols} células) para ${produto.ra_nome}?`)) return;

    const sigla = raSigla(produto.ra_nome);
    const existentes = okrDataCache.areas.filter(a => a.ra_nome === produto.ra_nome);
    let proximoNumero = existentes.reduce((max, a) => {
        const m = /-(\d+)$/.exec(a.codigo);
        return m ? Math.max(max, parseInt(m[1], 10)) : max;
    }, 0) + 1;

    const novasAreas = celulas.map(cel => {
        const area = {
            codigo: `${sigla}-${String(proximoNumero).padStart(2, '0')}`,
            nome: `Quadrante ${proximoNumero}`,
            product_id: produto.id,
            ra_nome: produto.ra_nome,
            zona_eleitoral: produto.zona_eleitoral || null,
            lat_min: cel.latMin,
            lat_max: cel.latMax,
            lng_min: cel.lngMin,
            lng_max: cel.lngMax,
            created_by: okrCurrentUser.id
        };
        proximoNumero++;
        return area;
    });

    const { error } = await sb.from('areas').insert(novasAreas);
    if (error) return alert('Erro: ' + error.message);
    alert(`${novasAreas.length} quadrantes gerados para ${produto.ra_nome}.`);
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

// ==========================================
// MÓDULO DE AGENDA PÚBLICA DO CANDIDATO
// Leitura da agenda confirmada é pública (RLS "TO anon" em
// agenda_eventos, ver supabase/schema.sql) — diferente do resto do
// painel, funciona mesmo sem login. Coordenadores Regionais (membros
// de um product) solicitam visita/participação; nível estratégico
// aprova/recusa ou publica compromisso oficial direto. Reaproveita a
// sessão/autenticação já mantida pelo módulo de OKRs (okrCurrentUser,
// okrUserProductIds, okrAuthListenerBound, refreshOKRSession()).
// ==========================================
let agendaDataCache = { eventos: [] };
let prazosTSECache = [];

const PRAZO_CATEGORIA_LABEL = {
    partidos: 'Partidos', convencao: 'Convenção', candidatura: 'Candidatura',
    propaganda: 'Propaganda', eleitorado: 'Eleitorado', urnas: 'Urnas',
    financiamento: 'Financiamento', pesquisas: 'Pesquisas',
    administrativo: 'Administrativo', votacao: 'Votação', diplomacao: 'Diplomação'
};

async function initAgendaModule() {
    const sb = initSupabaseClient();
    if (!sb) {
        const container = document.getElementById('agenda-publica-container');
        if (container) {
            container.innerHTML = '<div class="instruction">Agenda não configurada: defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY (ver README).</div>';
        }
        return;
    }
    if (!okrAuthListenerBound) {
        sb.auth.onAuthStateChange(() => refreshOKRSession());
        okrAuthListenerBound = true;
    }
    await refreshOKRSession();
    await Promise.all([loadAgendaData(), loadPrazosTSE()]);
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

function formatPrazoDate(dataStr) {
    const [ano, mes, dia] = dataStr.split('-');
    return `${dia}/${mes}/${ano}`;
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
        renderAgendaPublica();
        renderMinhasSolicitacoes();
        renderSolicitacoesPendentes();
    } catch (err) {
        console.warn('Erro ao carregar agenda:', err);
    }
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

function renderAgendaActionButtons() {
    const box = document.getElementById('agenda-btn-group');
    if (!box) return;
    if (!okrCurrentUser) {
        box.innerHTML = '<p class="okr-auth-hint">Entre pela aba OKRs para solicitar ou publicar compromissos.</p>';
        return;
    }
    const isAdmin = !!okrCurrentUser.is_super_admin;
    const hasProduct = okrUserProductIds.length > 0;
    let html = '';
    if (isAdmin) {
        html += `<button class="btn-primary" onclick="openNovoCompromissoOficialModal()">📌 Publicar Compromisso Oficial</button>`;
    }
    if (hasProduct) {
        html += `<button class="btn-secondary" onclick="openSolicitarAgendaModal('visita_solicitada')">📅 Solicitar Visita</button>`;
        html += `<button class="btn-secondary" onclick="openSolicitarAgendaModal('participacao_solicitada')">🎤 Solicitar Participação</button>`;
    }
    box.innerHTML = html;
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

function renderMinhasSolicitacoes() {
    const section = document.getElementById('agenda-minhas-solicitacoes-section');
    const container = document.getElementById('agenda-minhas-solicitacoes-container');
    if (!section || !container) return;

    if (!okrCurrentUser || !okrUserProductIds.length) {
        section.style.display = 'none';
        return;
    }

    const minhas = agendaDataCache.eventos.filter(ev => ev.solicitado_por === okrCurrentUser.id);
    section.style.display = 'block';
    if (!minhas.length) {
        container.innerHTML = '<div class="instruction">Você ainda não fez nenhuma solicitação de agenda.</div>';
        return;
    }

    container.innerHTML = minhas.map(ev => `
        <div class="okr-card">
            <div class="okr-card-header">
                <span class="okr-badge badge-tatico">${agendaTipoLabel(ev.tipo)}</span>
                <span class="status-tag status-${ev.status}">${ev.status.toUpperCase()}</span>
            </div>
            <h4>${ev.titulo}</h4>
            <p>${ev.descricao || ''}</p>
            <div class="okr-card-footer">
                <span>${formatAgendaDateTime(ev.data_hora)}${ev.local ? ' · ' + ev.local : ''}</span>
            </div>
            ${ev.resposta_admin ? `<p><strong>Resposta:</strong> ${ev.resposta_admin}</p>` : ''}
            ${ev.status === 'pendente' ? `<button class="btn-link" onclick="cancelarSolicitacao('${ev.id}')">✖️ Cancelar solicitação</button>` : ''}
        </div>
    `).join('');
}

function renderSolicitacoesPendentes() {
    const section = document.getElementById('agenda-pendentes-section');
    const container = document.getElementById('agenda-pendentes-container');
    if (!section || !container) return;

    if (!okrCurrentUser || !okrCurrentUser.is_super_admin) {
        section.style.display = 'none';
        return;
    }

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

async function openSolicitarAgendaModal(tipo) {
    const sb = initSupabaseClient();
    if (!sb) return;

    const disponiveis = okrDataCache.products.filter(p => okrUserProductIds.includes(p.id));
    if (!disponiveis.length) return alert('Você precisa fazer parte de uma Coordenação Regional para solicitar agenda.');

    let produto = disponiveis[0];
    if (disponiveis.length > 1) {
        const opcoes = disponiveis.map((p, i) => `${i + 1}. ${p.nome} (${p.ra_nome})`).join('\n');
        const escolha = prompt(`Solicitar em nome de qual Coordenação?\n${opcoes}`);
        const idx = parseInt(escolha, 10) - 1;
        if (isNaN(idx) || !disponiveis[idx]) return alert('Coordenação inválida.');
        produto = disponiveis[idx];
    }

    const label = tipo === 'visita_solicitada' ? 'Visita do Candidato' : 'Participação do Candidato';
    const titulo = prompt(`Título do pedido de ${label}:`);
    if (!titulo) return;
    const local = prompt('Local (endereço ou referência):') || null;
    const data_hora = parseAgendaDateTimeInput(prompt('Data e hora desejada (AAAA-MM-DD HH:MM):'));
    if (!data_hora) return alert('Data/hora inválida. Use o formato AAAA-MM-DD HH:MM.');
    const descricao = prompt('Descrição / justificativa (opcional):') || null;

    const { error } = await sb.from('agenda_eventos').insert({
        titulo, descricao, tipo, local,
        ra_nome: produto.ra_nome,
        product_id: produto.id,
        data_hora: data_hora.toISOString(),
        status: 'pendente',
        solicitado_por: okrCurrentUser.id
    });
    if (error) return alert('Erro: ' + error.message);
    alert('Solicitação enviada! Acompanhe o status em "Minhas Solicitações".');
    await loadAgendaData();
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

async function cancelarSolicitacao(id) {
    const sb = initSupabaseClient();
    if (!sb) return;
    if (!confirm('Cancelar esta solicitação?')) return;
    const { error } = await sb.from('agenda_eventos').update({ status: 'cancelado' }).eq('id', id);
    if (error) return alert('Erro: ' + error.message);
    await loadAgendaData();
}

// ==========================================
// MÓDULO DE CHECK-IN DE VOLUNTÁRIOS
// "Voluntário" é qualquer usuário com linha em area_volunteers — pode
// não ter nenhuma linha em product_team. Reaproveita a sessão global
// já mantida pelo módulo de OKRs (okrCurrentUser, refreshOKRSession).
// ==========================================
let checkinDataCache = { minhasAreas: [], meusCheckins: [] };

async function initCheckinModule() {
    const sb = initSupabaseClient();
    if (!sb) return;
    if (!okrAuthListenerBound) {
        sb.auth.onAuthStateChange(() => refreshOKRSession());
        okrAuthListenerBound = true;
    }
    await refreshOKRSession();
    await loadCheckinData();
}

async function loadCheckinData() {
    const instrucao = document.getElementById('checkin-login-instruction');
    if (!okrCurrentUser) {
        if (instrucao) instrucao.style.display = 'block';
        ['checkin-progresso-section', 'checkin-quadrantes-section', 'checkin-historico-section'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        });
        return;
    }
    if (instrucao) instrucao.style.display = 'none';

    const sb = initSupabaseClient();
    if (!sb) return;
    try {
        if (!okrDataCache.products.length) {
            await loadOKRData(); // garante objectives/key_results/products/areas carregados
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

// ==========================================
// CENTRAL DE COMANDO (painel executivo, só leitura — nenhuma tabela nova,
// nenhuma escrita. Reaproveita okrDataCache/prazosTSECache/agendaDataCache
// já carregados pelos módulos de OKR/Agenda; só os check-ins agregados dos
// últimos 7 dias têm uma busca própria, ver fetchComandoCheckins.)
// Visível a nível estratégico (is_super_admin) e a coordenadores (membro de
// algum product_team) — voluntários operacionais não veem esta aba.
// ==========================================
let comandoCheckins = [];
let comandoCheckinsError = false;

async function initComandoModule() {
    const sb = initSupabaseClient();
    const permBox = document.getElementById('comando-permission');
    const appBox = document.getElementById('comando-app');
    if (!sb) {
        if (permBox) {
            permBox.style.display = 'block';
            permBox.innerHTML = '<div class="instruction">Central de Comando não configurada: defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY (ver README).</div>';
        }
        if (appBox) appBox.style.display = 'none';
        return;
    }
    if (!okrAuthListenerBound) {
        sb.auth.onAuthStateChange(() => refreshOKRSession());
        okrAuthListenerBound = true;
    }
    await refreshOKRSession();

    const temAcesso = !!(okrCurrentUser && (okrCurrentUser.is_super_admin || okrUserProductIds.length > 0));
    if (!temAcesso) {
        if (permBox) {
            permBox.style.display = 'block';
            permBox.innerHTML = okrCurrentUser
                ? '<div class="instruction">A Central de Comando é reservada ao nível estratégico e às Coordenações Regionais.</div>'
                : '<div class="instruction">Entre pela aba OKRs, Agenda ou Check-in para acessar a Central de Comando.</div>';
        }
        if (appBox) appBox.style.display = 'none';
        return;
    }
    if (permBox) permBox.style.display = 'none';
    if (appBox) appBox.style.display = 'block';

    renderComandoSkeleton();
    await Promise.allSettled([loadOKRData(), loadPrazosTSE(), loadAgendaData(), fetchComandoCheckins()]);
    renderComando();
}

function renderComandoSkeleton() {
    [
        'comando-kpi-semaforo', 'comando-kpi-cobertura', 'comando-kpi-lider', 'comando-kpi-prazo',
        'comando-semaforo-container', 'comando-cobertura-container', 'comando-ranking-container',
        'comando-radar-prazo', 'comando-radar-agenda'
    ].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = '<div class="instruction">Carregando…</div>';
    });
}

// Ciclo semanal ativo prevalece para o semáforo e o ranking desta tela
// quando há mais de um period ativo ao mesmo tempo (decisão de produto).
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

function comandoFaixaCor(progresso) {
    if (progresso >= 70) return { cor: 'verde', label: 'No caminho' };
    if (progresso >= 40) return { cor: 'amarelo', label: 'Atenção' };
    return { cor: 'vermelho', label: 'Crítico' };
}

function renderComando() {
    renderComandoSemaforo();
    renderComandoCobertura();
    renderComandoRanking();
    renderComandoRadar();
}

// Bloco 01 — Semáforo de OKRs Estratégicos
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

// Bloco 02 — Cobertura Territorial
function renderComandoCobertura() {
    const listContainer = document.getElementById('comando-cobertura-container');
    const kpiContainer = document.getElementById('comando-kpi-cobertura');
    if (!listContainer || !kpiContainer) return;

    if (!okrDataCache.areas.length) {
        listContainer.innerHTML = '<div class="instruction">Nenhum quadrante gerado ainda — gere pela aba <strong>🎯 OKRs</strong>.</div>';
        kpiContainer.innerHTML = '<span class="comando-kpi-label">🗺️ Cobertura</span><strong class="comando-kpi-value">—</strong>';
        return;
    }

    const areasComVoluntario = new Set(okrDataCache.areaVolunteers.map(v => v.area_id));
    const porRA = {};
    okrDataCache.areas.forEach(area => {
        if (!porRA[area.ra_nome]) porRA[area.ra_nome] = { total: 0, cobertos: 0 };
        porRA[area.ra_nome].total += 1;
        if (areasComVoluntario.has(area.id)) porRA[area.ra_nome].cobertos += 1;
    });

    const linhas = Object.entries(porRA)
        .map(([ra, v]) => ({ ra, pct: Math.round((v.cobertos / v.total) * 100), cobertos: v.cobertos, total: v.total }))
        .sort((a, b) => a.pct - b.pct);

    const mediaGeral = Math.round(linhas.reduce((s, l) => s + l.pct, 0) / linhas.length);
    kpiContainer.innerHTML = `
        <span class="comando-kpi-label">🗺️ Cobertura</span>
        <strong class="comando-kpi-value">${mediaGeral}%</strong>
        <span class="comando-kpi-sub">${linhas.length} RA${linhas.length !== 1 ? 's' : ''} com quadrante</span>
    `;

    listContainer.innerHTML = linhas.map(l => `
        <div class="comando-item-row">
            <div class="comando-item-header"><span>${l.ra}</span><strong>${l.pct}%</strong></div>
            <div class="okr-progress-bar-container">
                <div class="okr-progress-bar" style="width:${l.pct}%;"></div>
            </div>
            <div class="okr-card-footer"><span>${l.cobertos} de ${l.total} quadrantes com voluntário</span></div>
        </div>
    `).join('');
}

// Bloco 03 — Ranking de Coordenações Regionais
function renderComandoRanking() {
    const listContainer = document.getElementById('comando-ranking-container');
    const kpiContainer = document.getElementById('comando-kpi-lider');
    if (!listContainer || !kpiContainer) return;

    if (!okrDataCache.products.length) {
        listContainer.innerHTML = '<div class="instruction">Nenhuma Coordenação Regional cadastrada ainda.</div>';
        kpiContainer.innerHTML = '<span class="comando-kpi-label">🏆 Líder</span><strong class="comando-kpi-value">—</strong>';
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

    const isAdmin = !!(okrCurrentUser && okrCurrentUser.is_super_admin);

    const ranking = okrDataCache.products.map(produto => {
        const objetivos = okrDataCache.objectives.filter(o => o.nivel === 'tatico' && o.product_id === produto.id && o.period_id === periodId);
        const progresso = objetivos.length
            ? objetivos.reduce((s, o) => s + (o.progresso || 0), 0) / objetivos.length
            : 0;
        // Só admin, ou coordenador da própria Coordenação, enxerga check-ins
        // reais dela (RLS restringe checkins a quem é membro do product_team
        // do quadrante) — pra qualquer outra coordenação, o selo de atividade
        // não é confiável e é mostrado como indisponível, não como "inativo".
        const podeVerAtividade = isAdmin || okrUserProductIds.includes(produto.id);
        const teveCheckin = (checkinsPorProduto[produto.id] || 0) > 0;
        return { produto, progresso, podeVerAtividade, teveCheckin };
    }).sort((a, b) => {
        if (b.progresso !== a.progresso) return b.progresso - a.progresso;
        return (b.podeVerAtividade && b.teveCheckin ? 1 : 0) - (a.podeVerAtividade && a.teveCheckin ? 1 : 0);
    });

    const TOP_N = 5;
    const lider = ranking[0];
    kpiContainer.innerHTML = lider
        ? `<span class="comando-kpi-label">🏆 Líder</span><strong class="comando-kpi-value">${Math.round(lider.progresso)}%</strong><span class="comando-kpi-sub">${lider.produto.nome}</span>`
        : '<span class="comando-kpi-label">🏆 Líder</span><strong class="comando-kpi-value">—</strong>';

    const linhasHtml = ranking.map((r, i) => {
        const posicao = i + 1;
        const selo = !r.podeVerAtividade
            ? '<span class="comando-selo comando-selo-indisponivel" title="Atividade de outras Coordenações não é visível para o seu papel">—</span>'
            : (r.teveCheckin
                ? '<span class="comando-selo" title="Check-in nos últimos 7 dias">🔥</span>'
                : '<span class="comando-selo" title="Sem check-in nos últimos 7 dias">💤</span>');
        const nome = posicao <= TOP_N ? `${posicao}º — ${r.produto.nome} (${r.produto.ra_nome})` : `${posicao}º colocação`;
        return `
            <div class="comando-item-row">
                <div class="comando-item-header"><span>${nome}</span>${selo}</div>
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

// Bloco 04 — Radar de Prazos & Agenda
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

// ==========================================
// PAINEL DO COORDENADOR (consolida Equipe + Cobertura de Quadrantes +
// KRs táticos + status de agenda da própria Coordenação Regional, com
// comparativo opcional entre regiões controlado pela flag
// app_settings.comparativo_regioes_liberado). Visível a coordenadores
// (papel='coordenador' em product_team) e a is_super_admin, que pode
// escolher qualquer Coordenação Regional para inspecionar.
// ==========================================
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
let coordRequestSeq = 0; // descarta respostas de uma seleção de Coordenação já trocada
let coordMap = null; // instância própria do Google Maps, escopada à aba coordenador
let coordMapRectangles = {}; // areaId -> google.maps.Rectangle
let coordMapMode = 'atribuir'; // 'atribuir' (ação em lote abre painel de equipe) | 'agrupar' (ação em lote nomeia perímetro)
let coordSelectedAreaIds = new Set(); // seleção ativa no mapa — clique ou arrasto acumulam, nos dois modos
let coordMapFiltro = { tipo: null, valor: null }; // tipo: null | 'perimetro' | 'voluntario' — filtra quais quadrantes o mapa desenha
let coordMapOverlayHelper = null; // OverlayView "vazio" só pra expor getProjection() (conversão pixel <-> LatLng)
let coordDragSelect = { active: false, startPixel: null, boxEl: null }; // estado da seleção por arrasto (Shift+drag)

async function initPainelCoordenadorModule() {
    const sb = initSupabaseClient();
    const permBox = document.getElementById('coord-permission');
    const emptyBox = document.getElementById('coord-empty');
    const appBox = document.getElementById('coord-app');
    if (!sb) {
        if (permBox) {
            permBox.style.display = 'block';
            permBox.innerHTML = '<div class="instruction">Painel do Coordenador não configurado: defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY (ver README).</div>';
        }
        if (appBox) appBox.style.display = 'none';
        return;
    }
    if (!okrAuthListenerBound) {
        sb.auth.onAuthStateChange(() => refreshOKRSession());
        okrAuthListenerBound = true;
    }
    await refreshOKRSession();

    const temAcesso = !!(okrCurrentUser && (okrCurrentUser.is_super_admin || okrUserCoordProductIds.length > 0));
    if (!temAcesso) {
        if (permBox) {
            permBox.style.display = 'block';
            permBox.innerHTML = okrCurrentUser
                ? '<div class="instruction">O Painel do Coordenador é reservado às Coordenações Regionais e ao nível estratégico.</div>'
                : '<div class="instruction">Entre pela aba OKRs, Agenda ou Check-in para acessar o Painel do Coordenador.</div>';
        }
        if (emptyBox) emptyBox.style.display = 'none';
        if (appBox) appBox.style.display = 'none';
        return;
    }
    if (permBox) permBox.style.display = 'none';

    if (!okrDataCache.products.length) {
        await loadOKRData();
    }

    const opcoes = getCoordProductOptions();
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

// Admin escolhe entre todas as Coordenações Regionais; coordenador só
// entre as que ele mesmo coordena (papel='coordenador').
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

function renderCoordSkeleton() {
    ['coord-equipe-container', 'coord-quadrantes-container', 'coord-grade-container', 'coord-kr-container', 'coord-agenda-container', 'coord-checkins-pendentes-container', 'coord-comparativo-container'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = '<div class="instruction">Carregando…</div>';
    });
}

async function loadCoordenadorData() {
    renderCoordSkeleton();
    coordMapFiltro = { tipo: null, valor: null }; // evita apontar pra um perímetro/voluntário de outra Coordenação
    const requestId = ++coordRequestSeq;
    await Promise.allSettled([
        fetchCoordEquipeEAreas(),
        fetchCoordPerimetroStatus(),
        fetchCoordPeriodsEObjetivos(),
        fetchCoordAgenda(),
        fetchCoordCheckinsPendentes(),
        fetchCoordSettings()
    ]);
    if (requestId !== coordRequestSeq) return; // seleção trocou de novo antes de terminar
    renderCoordEquipeCobertura();
    renderCoordGradeOperacional();
    renderCoordKRs();
    renderCoordAgenda();
    renderCoordCheckinsPendentes();
    initCoordMap();
    setCoordMapMode(coordMapMode); // sincroniza dica/botões, limpa seleção antiga e redesenha os quadrantes
    await loadCoordComparativo(requestId);
    const shareBox = document.getElementById('coord-grade-share-box');
    if (shareBox) shareBox.style.display = 'none'; // link antigo era de outra Coordenação
}

// Bloco Equipe & Cobertura de Quadrantes
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
        // Filtra por product_id via join em vez de .in('area_id', [...centenas de ids])
        // — uma Coordenação pode ter centenas/milhares de quadrantes, e um .in() com
        // essa quantidade de UUIDs excede o limite de tamanho de URL do PostgREST.
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

// Divide um array em lotes de até `tamanho` itens — usado antes de
// qualquer .in(coluna, [...]) que possa ter centenas/milhares de ids
// (uma Coordenação Regional real pode ter 700+ quadrantes; um .in()
// com todos eles de uma vez excede o limite de tamanho de URL do
// PostgREST e falha em silêncio se o erro não for checado).
function chunkArray(arr, tamanho) {
    const lotes = [];
    for (let i = 0; i < arr.length; i += tamanho) lotes.push(arr.slice(i, i + tamanho));
    return lotes;
}

// Lista de perímetros nomeados (areas.grupo_nome) da Coordenação atual —
// compartilhada pelo filtro "🏷️ Perímetro:" e pela Grade Operacional,
// pra não haver duas fontes divergentes da mesma lista.
function getCoordPerimetros() {
    return [...new Set(coordDataCache.areas.map(a => a.grupo_nome).filter(Boolean))].sort();
}

// Bloco Grade Operacional (status por perímetro)
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

    // Com centenas de quadrantes, uma linha por quadrante é ilegível — em vez
    // disso, dois seletores (perímetro nomeado / voluntário) filtram o que o
    // MAPA desenha, e um resumo compacto substitui a lista.
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

// Aplica o filtro ativo (perímetro OU voluntário, nunca os dois ao mesmo
// tempo) sobre coordDataCache.areas — usado tanto pro mapa quanto pro
// resumo textual em #coord-filtro-detalhe.
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
    // Só um filtro ativo por vez — limpa visualmente o outro seletor.
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

// Mapa clicável de quadrantes — clique ou arrasto (Shift+arrasto) sempre
// ACUMULA na seleção (nunca a substitui), nos dois modos. O que muda por
// modo é a ação em lote disponível pra seleção atual:
// 'atribuir': abre o painel de checkboxes da equipe pros quadrantes selecionados.
// 'agrupar': nomeia um perímetro comum pros quadrantes selecionados
// (planejamento do coordenador junto com o candidato).
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
        // Controle nativo de tipo de mapa do Google não renderiza nesta
        // página — o reset global "* { margin:0; padding:0 }" (style.css)
        // quebra o dimensionamento dos botões dele. Usamos botões próprios
        // (🗺️ Mapa / 🛰️ Satélite, ver setCoordMapTipo) em vez de depurar
        // esse conflito de CSS numa regra que afeta a página inteira.
        mapTypeControl: false,
        fullscreenControl: false
    });
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

// OverlayView "vazio" (não desenha nada) só pra ter acesso a
// getProjection() — é o jeito documentado de converter pixel da tela
// em LatLng fora dos eventos de clique nativos do Maps.
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

// Seleção por arrasto: Shift + arrastar no mapa desenha uma caixa e
// seleciona todos os quadrantes cujo retângulo cruza a área arrastada.
// Sem Shift, o arrasto continua sendo o pan normal do mapa.
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
    if (pxMaxX - pxMinX < 4 && pxMaxY - pxMinY < 4) return; // arrasto minúsculo — provável clique acidental

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
        // Conta atribuições do quadrante: cada voluntário conta 1, e pertencer
        // a um perímetro nomeado também conta 1. 0 = sem nenhuma (vermelho),
        // 1 = uma só, pessoa OU perímetro (verde), 2+ = sobreposição — mais de
        // um voluntário, ou voluntário(s) + perímetro (azul).
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

// Clique sempre acumula na seleção (nunca abre painel direto) — é a
// ação em lote (botão na barra de seleção) que decide o que fazer com
// os quadrantes selecionados, conforme o modo ativo.
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

    // Se algum quadrante selecionado já pertence a um perímetro diferente que
    // já tem status registrado, o status/histórico do nome antigo fica órfão
    // (a chave é o texto grupo_nome, sem FK) — avisa antes de confirmar.
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

// Painel de checkboxes da equipe pros quadrantes selecionados (1 ou
// vários). Um integrante só aparece marcado se já estiver atribuído a
// TODOS os quadrantes do lote; se estiver em só parte deles, mostra
// "(em X de Y)" — marcar o checkbox nesse estado completa a atribuição
// pros que faltam, sem remover dos que já tinha.
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

// Bloco KRs sob Responsabilidade (todos os ciclos ativos, com seletor)
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

// Bloco Status de Agenda da Região (somente leitura — aprovação continua
// exclusiva do nível estratégico, na aba Agenda)
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

// Bloco Check-ins Pendentes de Aprovação (check-in fora dos limites do
// quadrante atribuído nasce 'pendente' — ver fazerCheckin()). Aprovar ou
// rejeitar é permitido ao coordenador da própria Coordenação ou ao admin
// (RLS: checkins_update_coordenador / checkins_write_admin).
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

// Bloco Comparativo entre Regiões (condicional à flag
// app_settings.comparativo_regioes_liberado) + toggle exclusivo do admin
async function fetchCoordSettings() {
    const sb = initSupabaseClient();
    try {
        const { data, error } = await sb.from('app_settings').select('comparativo_regioes_liberado').eq('id', true).maybeSingle();
        if (error) throw error;
        coordDataCache.comparativoLiberado = !!(data && data.comparativo_regioes_liberado);
    } catch (err) {
        console.warn('Erro ao carregar configuração de comparativo entre regiões:', err);
        coordDataCache.comparativoLiberado = false; // fail-closed
    }
}

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
        if (requestId !== coordRequestSeq) return; // seleção trocou durante o fetch

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

// Expor funções globais para manipuladores de evento HTML
window.switchTab = switchTab;
window.openModal = openModal;
window.performSearch = performSearch;
window.showZoneData = showZoneData;
window.selectZone = selectZone;
window.selectRA = selectRA;
window.openRAModal = openRAModal;
window.filterOKRLevel = filterOKRLevel;
window.changeOKRPeriod = changeOKRPeriod;
window.okrSignInEmail = okrSignInEmail;
window.okrSignUpEmail = okrSignUpEmail;
window.okrSignInGoogle = okrSignInGoogle;
window.okrSignOut = okrSignOut;
window.openNewPeriodModal = openNewPeriodModal;
window.openNewProductModal = openNewProductModal;
window.openNewObjectiveModal = openNewObjectiveModal;
window.openNewKRModal = openNewKRModal;
window.updateKeyResultProgress = updateKeyResultProgress;
window.openNewEquipeModal = openNewEquipeModal;
window.openArtefatoModal = openArtefatoModal;
window.openSolicitarAgendaModal = openSolicitarAgendaModal;
window.openNovoCompromissoOficialModal = openNovoCompromissoOficialModal;
window.responderSolicitacao = responderSolicitacao;
window.cancelarSolicitacao = cancelarSolicitacao;
window.gerarQuadrantesDaRA = gerarQuadrantesDaRA;
window.openAtribuirVoluntarioModal = openAtribuirVoluntarioModal;
window.fazerCheckin = fazerCheckin;
window.changeCoordProduct = changeCoordProduct;
window.changeCoordPeriod = changeCoordPeriod;
window.toggleComparativoRegioes = toggleComparativoRegioes;
window.setCoordMapMode = setCoordMapMode;
window.limparSelecaoCoordMap = limparSelecaoCoordMap;
window.nomearGrupoSelecionado = nomearGrupoSelecionado;
window.toggleCoordAreaVolunteer = toggleCoordAreaVolunteer;
window.changeCoordMapFiltro = changeCoordMapFiltro;
window.abrirAtribuicaoEmLote = abrirAtribuicaoEmLote;
window.setCoordMapTipo = setCoordMapTipo;
window.responderCheckinCoord = responderCheckinCoord;

// Iniciar Aplicação
window.onload = initMap;

