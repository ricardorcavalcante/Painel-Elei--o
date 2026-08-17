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

// Camadas de POI (Escolas / Saúde / Segurança Pública) — só aparecem com uma RA
// selecionada (incl. "TODOS") e o checkbox da categoria marcado.
let poiData = { escolas: [], saude: [], seguranca: [] };
let poiMarkers = { escolas: [], saude: [], seguranca: [] };
let activePoiLayers = { escolas: false, saude: false, seguranca: false };

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

    // Main Views (o mapa é compartilhado pelas abas "map" e "ra")
    const showMapView = tab === 'map' || tab === 'ra';
    document.getElementById('view-map').style.display = showMapView ? 'block' : 'none';
    document.getElementById('view-dashboard').style.display = tab === 'dashboard' ? 'block' : 'none';

    // Coluna direita: Zonas x Regiões Administrativas
    document.getElementById('zonas-legend').style.display = tab === 'map' ? 'flex' : 'none';
    document.getElementById('ras-legend').style.display = tab === 'ra' ? 'flex' : 'none';

    // Cada aba começa "limpa": desfaz seleção/realce anterior de zona ou RA
    if (tab !== 'map' && activeZone) clearZoneSelection();
    if (tab !== 'ra' && activeRA) clearRASelection();

    // Alterna qual camada de contorno fica visível no mapa
    if (map && map.data) map.data.setMap(tab === 'map' ? map : null);
    if (raLayer) raLayer.setMap(tab === 'ra' ? map : null);

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

        // 5. Carregar as camadas de POI (Escolas / Saúde / Segurança) da aba "RAs"
        await loadPoiData();

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
        const [escolas, saude, seguranca] = await Promise.all([
            fetch('poi_escolas.json').then(r => r.json()),
            fetch('poi_saude.json').then(r => r.json()),
            fetch('poi_seguranca.json').then(r => r.json())
        ]);
        poiData = { escolas, saude, seguranca };
    } catch (err) {
        console.warn('Erro ao carregar camadas de POI (Escolas/Saúde/Segurança):', err);
    }
}

const POI_ICON_CONFIG = {
    escolas: { path: 'M -6,-6 6,-6 6,6 -6,6 z', fillColor: '#2E7DD7' },
    saude: { path: 'M -2,-6 2,-6 2,-2 6,-2 6,2 2,2 2,6 -2,6 -2,2 -6,2 -6,-2 -2,-2 z', fillColor: '#D7263D' },
    seguranca: { path: 'M 0,-7 6,0 0,7 -6,0 z', fillColor: '#2B2D42' }
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

const POI_HOVER_BUILDERS = {
    escolas: buildEscolaHoverContent,
    saude: buildSaudeHoverContent,
    seguranca: buildSegurancaHoverContent
};

function clearPoiMarkers(category) {
    const categorias = category ? [category] : ['escolas', 'saude', 'seguranca'];
    categorias.forEach(cat => {
        (poiMarkers[cat] || []).forEach(m => m.setMap(null));
        poiMarkers[cat] = [];
    });
}

// Recria os marcadores de POI visíveis: só desenha algo se houver uma RA
// selecionada (incl. "TODOS") e a categoria estiver com o checkbox marcado.
function updatePoiMarkers() {
    ['escolas', 'saude', 'seguranca'].forEach(cat => {
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

['escolas', 'saude', 'seguranca'].forEach(cat => {
    const checkbox = document.getElementById(`poi-toggle-${cat}`);
    if (!checkbox) return;
    checkbox.addEventListener('change', () => {
        activePoiLayers[cat] = checkbox.checked;
        updatePoiMarkers();
    });
});

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
    resetMarkers();
    updateMapDataStyle();
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

    // 2. Destacar marcadores da zona selecionada e esmaecer os outros
    const zoneBounds = new google.maps.LatLngBounds();
    let hasBounds = false;
    Object.entries(markerMap).forEach(([zId, zMarkers]) => {
        const isTarget = zId === zoneId;
        zMarkers.forEach(m => {
            if (isTarget) {
                m.setIcon(makeCircleIcon(m._baseColor, 8, 1.0));
                m.setZIndex(999);
                zoneBounds.extend(m.getPosition());
                hasBounds = true;
            } else {
                m.setIcon(makeCircleIcon(m._baseColor, 4, 0.25));
                m.setZIndex(1);
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

    // 5. Exibir dados e estatísticas da Zona na Sidebar Esquerda
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

// Expor funções globais para manipuladores de evento HTML
window.switchTab = switchTab;
window.openModal = openModal;
window.performSearch = performSearch;
window.showZoneData = showZoneData;
window.selectZone = selectZone;
window.selectRA = selectRA;
window.openRAModal = openRAModal;

// Iniciar Aplicação
window.onload = initMap;
