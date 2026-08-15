// Estado da Aplicação
let map;
let markers = [];
let sharedInfoWindow;
let locaisData = {};
let activeZone = null;
let markerMap = {}; // Mapeamento zoneId -> lista de marcadores Google Maps

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
    const btns = document.querySelectorAll('.tab-btn');
    btns[0].classList.toggle('active', tab === 'map');
    btns[1].classList.toggle('active', tab === 'dashboard');

    // Sidebars
    document.getElementById('map-sidebar').style.display = tab === 'map' ? 'block' : 'none';
    document.getElementById('dash-sidebar').style.display = tab === 'dashboard' ? 'block' : 'none';

    // Main Views
    document.getElementById('view-map').style.display = tab === 'map' ? 'block' : 'none';
    document.getElementById('view-dashboard').style.display = tab === 'dashboard' ? 'block' : 'none';

    if (tab === 'map' && map) {
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
        plotMarkers(pontos);

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

// Plotar Marcadores dos Locais de Votação com Coordenadas Reais (Google Geocoding)
function plotMarkers(pontos) {
    markers.forEach(m => m.setMap(null));
    markers = [];
    markerMap = {};

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
    });
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

    // 4. Exibir dados e estatísticas da Zona na Sidebar Esquerda
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

// Iniciar Aplicação
window.onload = initMap;
