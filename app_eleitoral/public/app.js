// Estado da Aplicação
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
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tab);
    });

    // Sidebars
    document.getElementById('map-sidebar').style.display = tab === 'map' ? 'block' : 'none';
    document.getElementById('ra-sidebar').style.display = tab === 'ra' ? 'block' : 'none';
    document.getElementById('dash-sidebar').style.display = tab === 'dashboard' ? 'block' : 'none';
    const okrSidebar = document.getElementById('okr-sidebar');
    if (okrSidebar) okrSidebar.style.display = tab === 'okr' ? 'block' : 'none';

    // Main Views (o mapa é compartilhado pelas abas "map" e "ra")
    const showMapView = tab === 'map' || tab === 'ra';
    document.getElementById('view-map').style.display = showMapView ? 'block' : 'none';
    document.getElementById('view-dashboard').style.display = tab === 'dashboard' ? 'block' : 'none';
    const viewOkr = document.getElementById('view-okr');
    if (viewOkr) viewOkr.style.display = tab === 'okr' ? 'block' : 'none';

    // Coluna direita: Zonas x Regiões Administrativas
    document.getElementById('zonas-legend').style.display = tab === 'map' ? 'flex' : 'none';
    document.getElementById('ras-legend').style.display = tab === 'ra' ? 'flex' : 'none';

    if (tab === 'okr') {
        initOKRModule();
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
    loadDashboardData();
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
// DASHBOARD (CHART.JS)
// ==========================================
async function loadDashboardData() {
    try {
        const response = await fetch('estatisticas.json');
        const stats = await response.json();

        document.getElementById('kpi-eleitores').innerText = stats.total_df.eleitorado.toLocaleString('pt-BR');
        document.getElementById('kpi-locais').innerText = stats.total_df.locais;
        document.getElementById('kpi-media').innerText = stats.total_df.media_geral.toLocaleString('pt-BR');

        new Chart(document.getElementById('chartRA'), {
            type: 'bar',
            data: {
                labels: stats.by_ra.labels.slice(0, 10),
                datasets: [{
                    label: 'Eleitores',
                    data: stats.by_ra.eleitorado.slice(0, 10),
                    backgroundColor: '#1F4E78',
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                plugins: { legend: { display: false } },
                scales: { y: { beginAtZero: true } }
            }
        });

        const bgColors = stats.by_zona.labels.map(z => zoneColors[z] || '#999');
        new Chart(document.getElementById('chartZona'), {
            type: 'doughnut',
            data: {
                labels: stats.by_zona.labels.map(z => 'Zona ' + z),
                datasets: [{
                    data: stats.by_zona.percentual,
                    backgroundColor: bgColors,
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: { position: 'right', labels: { boxWidth: 12 } },
                    tooltip: { callbacks: { label: function(context) { return context.label + ': ' + context.raw + '%'; } } }
                }
            }
        });

        new Chart(document.getElementById('chartLocaisRA'), {
            type: 'line',
            data: {
                labels: stats.by_ra.labels,
                datasets: [{
                    label: 'Quantidade de Locais',
                    data: stats.by_ra.locais,
                    borderColor: '#e47171',
                    backgroundColor: 'rgba(228, 113, 113, 0.2)',
                    fill: true,
                    tension: 0.3
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: { x: { display: false }, y: { beginAtZero: true } }
            }
        });

    } catch (error) {
        console.error("Erro ao carregar Dashboard:", error);
    }
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
let okrDataCache = { periods: [], activePeriodId: null, products: [], productTeam: [], objectives: [], keyResults: [], artefatos: [] };
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
    const { data: { session } } = await sb.auth.getSession();
    if (!session) {
        okrCurrentUser = null;
        okrUserProductIds = [];
        renderOKRAuthBox();
        renderOKRActionButtons();
        return;
    }
    const { data: profile } = await sb.from('profiles').select('*').eq('id', session.user.id).maybeSingle();
    okrCurrentUser = profile || { id: session.user.id, email: session.user.email, full_name: session.user.email, is_super_admin: false };
    const { data: team } = await sb.from('product_team').select('product_id').eq('user_id', session.user.id);
    okrUserProductIds = (team || []).map(t => t.product_id);
    renderOKRAuthBox();
    renderOKRActionButtons();
}

async function loadOKRData() {
    const sb = initSupabaseClient();
    if (!sb) return;
    try {
        const [periodsRes, productsRes, teamRes, objectivesRes, keyResultsRes, artefatosRes] = await Promise.all([
            sb.from('periods').select('*').order('data_inicio', { ascending: false }),
            sb.from('products').select('*').order('nome'),
            sb.from('product_team').select('papel, product_id, user_id, profiles:user_id(full_name, email)'),
            sb.from('objectives').select('*').order('created_at', { ascending: false }),
            sb.from('key_results').select('*'),
            sb.from('okr_artefatos').select('*').order('created_at', { ascending: false })
        ]);

        okrDataCache.periods = periodsRes.data || [];
        okrDataCache.products = productsRes.data || [];
        okrDataCache.productTeam = teamRes.data || [];
        okrDataCache.objectives = objectivesRes.data || [];
        okrDataCache.keyResults = keyResultsRes.data || [];
        okrDataCache.artefatos = artefatosRes.data || [];

        if (!okrDataCache.activePeriodId || !okrDataCache.periods.some(p => p.id === okrDataCache.activePeriodId)) {
            const ativo = okrDataCache.periods.find(p => p.ativo) || okrDataCache.periods[0];
            okrDataCache.activePeriodId = ativo ? ativo.id : null;
        }

        renderOKRPeriodSelect();
        renderOKRs();
        renderEquipe();
        renderArtefatos();
    } catch (err) {
        console.warn('Erro ao carregar dados de OKRs:', err);
    }
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

        html += `
            <div class="equipe-card">
                <div class="okr-card-header">
                    <span class="okr-year">RA: ${produto.ra_nome}${produto.zona_eleitoral ? ' · Zona ' + produto.zona_eleitoral : ''}</span>
                </div>
                <h4>${produto.nome}</h4>
                <p class="okr-coords-list">${membrosHtml}</p>
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

// Iniciar Aplicação
window.onload = initMap;

