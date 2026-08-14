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

// Algoritmo de Georreferenciamento de Precisão por Endereço, Quadra e RA
function getAccurateLocationCoordinates(sec, index) {
    const addr = ((sec.endereco || '') + ' ' + (sec.local || '') + ' ' + (sec.bairro || '')).toUpperCase();
    const ra = (sec.ra || '').toUpperCase();

    // 1. PLANO PILOTO - ASA SUL
    if (addr.includes('ASA SUL') || addr.includes('SQS') || addr.includes('SGAS') || addr.includes('SEPS') || addr.includes('SHIGS') || addr.includes('EQS') || addr.includes('504 SUL') || addr.includes('214 SUL') || addr.includes('405 SUL') || addr.includes('413 SUL') || addr.includes('416 SUL') || addr.includes('102 SUL') || addr.includes('206 SUL') || addr.includes('209 SUL') || addr.includes('305 SUL') || addr.includes('316 SUL')) {
        let quadraNum = 100;
        const match = addr.match(/(?:SQS|SGAS|SEPS|EQS|SHIGS|SUL)\s*(\d{3})/);
        if (match) quadraNum = parseInt(match[1]);
        
        const axisOffset = (quadraNum % 100) * 0.0018;
        const lat = -15.800 - axisOffset;
        let lng = -47.895;
        if (quadraNum >= 600) lng = -47.920;
        else if (quadraNum >= 400) lng = -47.885;
        else if (quadraNum >= 200) lng = -47.892;
        else if (quadraNum >= 100) lng = -47.900;

        return [lat, lng];
    }

    // 2. PLANO PILOTO - ASA NORTE
    if (addr.includes('ASA NORTE') || addr.includes('SQN') || addr.includes('SGN') || addr.includes('SEPN') || addr.includes('SHCGN') || addr.includes('EQN') || addr.includes('NORTE')) {
        let quadraNum = 100;
        const match = addr.match(/(?:SQN|SGN|SEPN|EQN|SHCGN|NORTE)\s*(\d{3})/);
        if (match) quadraNum = parseInt(match[1]);
        
        const axisOffset = (quadraNum % 100) * 0.0018;
        const lat = -15.785 + axisOffset;
        let lng = -47.885;
        if (quadraNum >= 600) lng = -47.905;
        else if (quadraNum >= 400) lng = -47.875;
        else if (quadraNum >= 200) lng = -47.882;
        else if (quadraNum >= 100) lng = -47.890;

        return [lat, lng];
    }

    // 3. LAGO NORTE
    if (ra.includes('LAGO NORTE') || addr.includes('LAGO NORTE') || addr.includes('SHIN') || addr.includes('CA ')) {
        let lat = -15.735, lng = -47.855;
        if (addr.includes('CA ')) { lat = -15.725; lng = -47.870; }
        else if (addr.includes('QI ') || addr.includes('QL ')) {
            const match = addr.match(/(?:QI|QL)\s*(\d+)/);
            const q = match ? parseInt(match[1]) : 5;
            lat = -15.730 - (q * 0.002);
            lng = -47.860 + (q * 0.001);
        }
        return [lat, lng];
    }

    // 4. VARJÃO / GRANJA DO TORTO / ESTRUTURAL
    if (ra.includes('VARJÃO') || addr.includes('VARJÃO')) return [-15.719, -47.884 + (index % 5) * 0.001];
    if (ra.includes('GRANJA DO TORTO') || addr.includes('GRANJA DO TORTO')) return [-15.735, -47.915 + (index % 5) * 0.001];
    if (ra.includes('ESTRUTURAL') || addr.includes('SCIA') || addr.includes('ESTRUTURAL')) return [-15.782, -47.985 + (index % 5) * 0.001];

    // 5. SUDOESTE / CRUZEIRO / OCTOGONAL
    if (ra.includes('SUDOESTE') || ra.includes('CRUZEIRO') || addr.includes('SUDOESTE') || addr.includes('CRUZEIRO') || addr.includes('OCTOGONAL')) {
        if (addr.includes('CRUZEIRO')) return [-15.782, -47.942 + (index % 4) * 0.001];
        if (addr.includes('OCTOGONAL')) return [-15.798, -47.935 + (index % 4) * 0.001];
        return [-15.792, -47.925 + (index % 4) * 0.001];
    }

    // 6. GUARÁ
    if (ra.includes('GUARÁ') || addr.includes('GUARÁ') || addr.includes('QE ')) {
        let q = 15;
        const match = addr.match(/QE\s*(\d+)/);
        if (match) q = parseInt(match[1]);
        const lat = -15.818 - (q > 20 ? 0.008 : 0);
        const lng = -47.982 + ((q % 20) * 0.0015);
        return [lat, lng];
    }

    // 7. VICENTE PIRES / ARNIQUEIRA / ÁGUAS CLARAS
    if (ra.includes('VICENTE PIRES') || addr.includes('VICENTE PIRES')) return [-15.805, -48.025 + (index % 5) * 0.0015];
    if (ra.includes('ARNIQUEIRA') || addr.includes('ARNIQUEIRA')) return [-15.855, -48.015 + (index % 5) * 0.0015];
    if (ra.includes('ÁGUAS CLARAS') || addr.includes('ÁGUAS CLARAS')) return [-15.838, -48.028 + (index % 5) * 0.0015];

    // 8. TAGUATINGA NORTE / SUL / CENTRO
    if (ra.includes('TAGUATINGA') || addr.includes('TAGUATINGA') || addr.includes('QNG') || addr.includes('QNJ') || addr.includes('QNL') || addr.includes('QNM') || addr.includes('QNA') || addr.includes('QSA') || addr.includes('QSD') || addr.includes('CSB')) {
        if (addr.includes('QNJ') || addr.includes('QNL') || addr.includes('QNG') || addr.includes('NORTE')) return [-15.812, -48.068 + (index % 6) * 0.0015];
        if (addr.includes('QSA') || addr.includes('QSB') || addr.includes('QSD') || addr.includes('SUL')) return [-15.845, -48.052 + (index % 6) * 0.0015];
        return [-15.830, -48.058 + (index % 6) * 0.0015];
    }

    // 9. CEILÂNDIA NORTE / CENTRO / SUL / SOL NASCENTE
    if (ra.includes('CEILÂNDIA') || addr.includes('CEILÂNDIA') || ra.includes('SOL NASCENTE') || addr.includes('SOL NASCENTE') || addr.includes('QNO') || addr.includes('QNN') || addr.includes('QNP') || addr.includes('EQNP')) {
        if (addr.includes('QNO') || addr.includes('QNR') || addr.includes('NORTE')) return [-15.800, -48.132 + (index % 6) * 0.0015];
        if (addr.includes('QNP') || addr.includes('EQNP') || addr.includes('SOL NASCENTE') || addr.includes('SUL')) return [-15.848, -48.145 + (index % 6) * 0.0015];
        return [-15.820, -48.112 + (index % 6) * 0.0015];
    }

    // 10. SAMAMBAIA
    if (ra.includes('SAMAMBAIA') || addr.includes('SAMAMBAIA') || addr.includes('QN') || addr.includes('QR')) {
        let q = 300;
        const match = addr.match(/(?:QN|QR)\s*(\d{3})/);
        if (match) q = parseInt(match[1]);
        const isNorte = q < 400 || q >= 600;
        const lat = isNorte ? -15.865 : -15.885;
        const lng = -48.095 + ((q % 100) * 0.0008);
        return [lat, lng];
    }

    // 11. RECANTO DAS EMAS & RIACHO FUNDO II
    if (ra.includes('RECANTO DAS EMAS') || addr.includes('RECANTO DAS EMAS')) {
        let q = 100;
        const match = addr.match(/(?:QD|QUADRA|QR)\s*(\d{3})/);
        if (match) q = parseInt(match[1]);
        const lat = -15.905 - ((q / 100) * 0.003);
        const lng = -48.075 + ((q % 10) * 0.002);
        return [lat, lng];
    }
    if (ra.includes('RIACHO FUNDO II') || addr.includes('RIACHO FUNDO II')) return [-15.900, -48.025 + (index % 4) * 0.0015];
    if (ra.includes('RIACHO FUNDO') || addr.includes('RIACHO FUNDO')) return [-15.880, -47.995 + (index % 4) * 0.0015];

    // 12. NÚCLEO BANDEIRANTE / CANDANGOLÂNDIA / PARK WAY
    if (ra.includes('NÚCLEO BANDEIRANTE') || addr.includes('NÚCLEO BANDEIRANTE')) return [-15.868, -47.962 + (index % 4) * 0.001];
    if (ra.includes('CANDANGOLÂNDIA') || addr.includes('CANDANGOLÂNDIA')) return [-15.852, -47.950 + (index % 4) * 0.001];
    if (ra.includes('PARK WAY') || addr.includes('PARK WAY')) return [-15.885, -47.955 + (index % 4) * 0.001];

    // 13. GAMA
    if (ra.includes('GAMA') || addr.includes('GAMA')) {
        let sectorOffset = 0;
        if (addr.includes('LESTE')) sectorOffset = 0.005;
        if (addr.includes('OESTE')) sectorOffset = -0.005;
        if (addr.includes('SUL')) sectorOffset -= 0.008;
        return [-16.020 + sectorOffset, -48.060 + (sectorOffset * 0.5) + (index % 5) * 0.001];
    }

    // 14. SANTA MARIA & DVO & SANTOS DUMONT
    if (ra.includes('SANTA MARIA') || addr.includes('SANTA MARIA')) {
        if (addr.includes('SANTOS DUMONT')) return [-16.002, -47.952 + (index % 4) * 0.001];
        if (addr.includes('DVO') || addr.includes('PORTO RICO')) return [-16.035, -47.985 + (index % 4) * 0.001];
        let q = 100;
        const match = addr.match(/(?:CL|QR|EQ)\s*(\d{3})/);
        if (match) q = parseInt(match[1]);
        const lat = -16.012 - ((q / 100) * 0.004);
        const lng = -47.990 + ((q % 10) * 0.002);
        return [lat, lng];
    }

    // 15. SOBRADINHO & SOBRADINHO II & FERCAL
    if (ra.includes('SOBRADINHO') || addr.includes('SOBRADINHO') || ra.includes('FERCAL') || addr.includes('FERCAL')) {
        if (ra.includes('FERCAL') || addr.includes('FERCAL')) return [-15.600, -47.875 + (index % 4) * 0.0015];
        if (addr.includes('NOVA COLINA') || addr.includes('RABELO')) return [-15.632, -47.765 + (index % 4) * 0.0015];
        let q = 5;
        const match = addr.match(/(?:QUADRA|AR)\s*(\d+)/);
        if (match) q = parseInt(match[1]);
        return [-15.650 - (q * 0.001), -47.788 + (q * 0.0008)];
    }

    // 16. PLANALTINA & ARAPOANGA
    if (ra.includes('PLANALTINA') || addr.includes('PLANALTINA') || ra.includes('ARAPOANGA') || addr.includes('ARAPOANGA')) {
        if (addr.includes('ARAPOANGA')) return [-15.642, -47.615 + (index % 5) * 0.0015];
        return [-15.618, -47.652 + (index % 5) * 0.0015];
    }

    // 17. LAGO SUL / JARDIM BOTÂNICO / SÃO SEBASTIÃO
    if (ra.includes('LAGO SUL') || addr.includes('LAGO SUL') || addr.includes('SHIS')) return [-15.845, -47.875 + (index % 5) * 0.0015];
    if (ra.includes('JARDIM BOTÂNICO') || addr.includes('JARDIM BOTÂNICO')) return [-15.875, -47.795 + (index % 5) * 0.0015];
    if (ra.includes('SÃO SEBASTIÃO') || addr.includes('SÃO SEBASTIÃO')) return [-15.905, -47.772 + (index % 5) * 0.0015];

    // Fallback por RA genérico ou centro
    return [-15.793889 + (index % 10) * 0.005, -47.882778 + (index % 10) * 0.005];
}

// Plotar Marcadores das Seções do KML com Georreferenciamento de Precisão
function plotKmlSecoesMarkers(secoes) {
    if (!kmlMarkersGroup) return;
    kmlMarkersGroup.clearLayers();
    markerMap = {};

    // Vários locais podem cair na mesma coordenada (ex: mesma quadra ou,
    // no pior caso, mesmo centro de RA quando não há endereço geocodificável).
    // Para não empilhar marcadores exatamente um sobre o outro, aplicamos um
    // pequeno leque visual em espiral — a coordenada real (e a exibida no
    // popup/precisão) não muda, só o ponto de desenho do pino.
    const GOLDEN_ANGLE = 137.508 * (Math.PI / 180);
    const coordOccurrences = {};

    secoes.forEach((sec, index) => {
        // Prioriza a coordenada real obtida por geocodificação (locais_geocoded.json).
        // Só recorre à estimativa heurística por endereço quando a geocodificação falhou.
        let lat, lng, precisao;
        if (sec.lat != null && sec.lng != null) {
            [lat, lng] = [sec.lat, sec.lng];
            precisao = sec.precisao;
        } else {
            [lat, lng] = getAccurateLocationCoordinates(sec, index);
            precisao = 'estimado';
        }

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

        const precisaoLabels = {
            endereco: 'Endereço geocodificado',
            quadra: 'Quadra/Setor geocodificado',
            ra: 'Aproximado (centro da RA)',
            estimado: 'Estimado (endereço não localizado)'
        };

        circleMarker.bindPopup(`
            <div class="kml-popup">
                <h4>${sec.local}</h4>
                <div class="kml-popup-info">
                    <p><strong>Bairro / RA:</strong> ${sec.bairro || sec.ra || 'N/A'}</p>
                    <p><strong>Seções:</strong> ${sec.secoes || '—'}</p>
                    <p><strong>Eleitorado:</strong> ${sec.eleitorado ? sec.eleitorado.toLocaleString('pt-BR') : '—'}</p>
                    <p><strong>Zona Eleitoral:</strong> ${sec.zona || '—'}</p>
                    <p class="kml-popup-precisao"><strong>Localização:</strong> ${precisaoLabels[precisao] || precisao}</p>
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
