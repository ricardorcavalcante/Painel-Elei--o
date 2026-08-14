// Estado da Aplicação
let map;
let kmlMarkersGroup;
let locaisData = {};
let kmlSecoesList = [];
let activeZone = null;
let markerMap = {}; // Mapeamento zoneId -> lista de marcadores Leaflet

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
        setTimeout(() => { map.invalidateSize(); }, 100);
    }
}


// ==========================================
// MAPA GEORREFERENCIADO (LEAFLET + KML COLORIDO POR ZONA)
// ==========================================
function initMap() {
    map = L.map('map').setView([-15.793889, -47.882778], 10);

    // Mapa claro vetorial (CartoDB Light)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap &copy; CARTO',
        subdomains: 'abcd',
        maxZoom: 20
    }).addTo(map);

    kmlMarkersGroup = L.layerGroup().addTo(map);

    loadData();
    loadDashboardData();
}

async function loadData() {
    try {
        const responseData = await fetch('locais_votacao.json');
        locaisData = await responseData.json();

        // 1. Gerar Coluna de Zonas Eleitorais na Direita
        buildZonasColumn();

        // 2. Carregar e Plotar o KML com as Cores das Zonas
        if (typeof loadKmlSecoes === 'function') {
            kmlSecoesList = await loadKmlSecoes(locaisData);
            plotKmlSecoesMarkers(kmlSecoesList);
        }

    } catch (error) {
        console.error("Erro ao carregar dados georreferenciados:", error);
    }
}

// Plotar Marcadores das Seções do KML com as CORES das Zonas
function plotKmlSecoesMarkers(secoes) {
    if (!kmlMarkersGroup) return;
    kmlMarkersGroup.clearLayers();
    markerMap = {};

    const raCoordinates = {
        "PLANO PILOTO": [-15.793889, -47.882778],
        "VARJÃO": [-15.7198, -47.8860],
        "LAGO NORTE": [-15.7380, -47.8500],
        "PARANOÁ": [-15.7725, -47.7780],
        "ITAPOÃ": [-15.7500, -47.7600],
        "CEILÂNDIA": [-15.8200, -48.1100],
        "SANTA MARIA": [-16.0100, -47.9800],
        "SOBRADINHO": [-15.6500, -47.7900],
        "FERCAL": [-15.6000, -47.8700],
        "TAGUATINGA": [-15.8300, -48.0500],
        "SAMAMBAIA": [-15.8700, -48.0800],
        "GAMA": [-16.0200, -48.0600],
        "RECANTO DAS EMAS": [-15.9100, -48.0600],
        "GUARA": [-15.8200, -47.9700],
        "GUARÁ": [-15.8200, -47.9700],
        "SÃO SEBASTIÃO": [-15.9000, -47.7700],
        "ÁGUAS CLARAS": [-15.8300, -48.0200],
        "VICENTE PIRES": [-15.8000, -48.0200],
        "RIACHO FUNDO": [-15.8800, -47.9900],
        "RIACHO FUNDO II": [-15.9000, -48.0200],
        "BRAZLÂNDIA": [-15.6700, -48.2000],
        "SOL NASCENTE/PÔR DO SOL": [-15.8400, -48.1500],
        "SUDOESTE/OCTOGONAL": [-15.7900, -47.9300],
        "CRUZEIRO": [-15.7800, -47.9400],
        "NÚCLEO BANDEIRANTE": [-15.8700, -47.9600],
        "CANDANGOLÂNDIA": [-15.8500, -47.9500],
        "PARK WAY": [-15.8800, -47.9500],
        "JARDIM BOTÂNICO": [-15.8700, -47.8000],
        "LAGO SUL": [-15.8400, -47.8700]
    };

    secoes.forEach((sec, index) => {
        const baseCoord = raCoordinates[sec.ra] || [-15.793889, -47.882778];
        const lat = baseCoord[0] + ((index % 11) - 5) * 0.0035 + (Math.sin(index) * 0.001);
        const lng = baseCoord[1] + ((index % 13) - 6) * 0.0035 + (Math.cos(index) * 0.001);

        // Obter a cor exata da Zona Eleitoral
        const markerColor = zoneColors[sec.zona] || '#1F4E78';

        const circleMarker = L.circleMarker([lat, lng], {
            radius: 6,
            fillColor: markerColor,
            color: '#ffffff',
            weight: 1.5,
            opacity: 1,
            fillOpacity: 0.9
        });

        // POPUP / TOOLTIP HOVER: Nome, Bairro e Eleitores
        const hoverTooltipContent = `
            <div class="kml-hover-tooltip">
                <strong>${sec.local}</strong>
                <div>📍 Bairro/RA: ${sec.bairro || sec.ra || 'N/A'}</div>
                <div>👥 Eleitores: ${sec.eleitorado ? sec.eleitorado.toLocaleString('pt-BR') : 'N/A'}</div>
            </div>
        `;

        circleMarker.bindTooltip(hoverTooltipContent, {
            className: 'kml-hover-tooltip-container',
            direction: 'top',
            offset: [0, -5]
        });

        circleMarker.bindPopup(`
            <div class="kml-popup">
                <h4>${sec.local}</h4>
                <div class="kml-popup-info">
                    <p><strong>Bairro / RA:</strong> ${sec.bairro || sec.ra || 'N/A'}</p>
                    <p><strong>Seções:</strong> ${sec.secoes || '—'}</p>
                    <p><strong>Eleitorado:</strong> ${sec.eleitorado ? sec.eleitorado.toLocaleString('pt-BR') : '—'}</p>
                    <p><strong>Zona Eleitoral:</strong> ${sec.zona || '—'}</p>
                </div>
            </div>
        `, { className: 'custom-kml-popup' });

        // Ao clicar no ponto, ativa a Zona Eleitoral correspondente
        circleMarker.on('click', () => {
            if (sec.zona && sec.zona !== 'N/A') {
                selectZone(sec.zona);
            }
        });

        kmlMarkersGroup.addLayer(circleMarker);

        // Guardar referência do marcador por Zona
        if (sec.zona && sec.zona !== 'N/A') {
            if (!markerMap[sec.zona]) markerMap[sec.zona] = [];
            markerMap[sec.zona].push(circleMarker);
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

    // 2. Destacar marcadores KML da zona selecionada e esmaecer os outros
    const zoneBounds = [];
    Object.entries(markerMap).forEach(([zId, markers]) => {
        const isTarget = zId === zoneId;
        markers.forEach(m => {
            if (isTarget) {
                m.setStyle({ fillOpacity: 1.0, radius: 8, weight: 2.5 });
                m.bringToFront();
                zoneBounds.push(m.getLatLng());
            } else {
                m.setStyle({ fillOpacity: 0.25, radius: 4, weight: 1.0 });
            }
        });
    });

    // 3. Ajustar zoom do mapa nos marcadores da zona
    if (zoneBounds.length > 0) {
        const bounds = L.latLngBounds(zoneBounds);
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 13 });
    }

    // 4. Exibir dados e estatísticas da Zona na Sidebar Esquerda
    showZoneData(zoneId);
}

function showZoneData(zoneId) {
    const sidebar = document.getElementById('sidebar-content');
    const locais = locaisData[zoneId];
    const zoneInfo = ZONAS_DATA ? ZONAS_DATA[zoneId] : null;

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
