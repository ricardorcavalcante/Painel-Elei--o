// Estado da Aplicação
let map;
let geojsonLayer;
let locaisData = {}; 
let zonasGeoJSON = null;
let activeZone = null;

// Configuração de Cores para as Zonas
const zoneColors = {
    "1": "#63d692", "2": "#869bf0", "3": "#c894e1", "4": "#e15eac",
    "5": "#9a7c64", "6": "#f6eda5", "8": "#f59f8a", "9": "#e47171",
    "10": "#8aaae5", "11": "#c8c1bc", "13": "#9ff1cf", "14": "#68e799",
    "15": "#e7dfcd", "16": "#66cbed", "17": "#e3d274", "18": "#7beddf",
    "19": "#cd9ce4", "20": "#ebabc8", "21": "#e5a7b6"
};

// ==========================================
// TABS E NAVEGAÇÃO
// ==========================================
function switchTab(tab) {
    const btns = document.querySelectorAll('.tab-btn');
    btns[0].classList.toggle('active', tab === 'map');
    btns[1].classList.toggle('active', tab === 'dashboard');
    btns[2].classList.toggle('active', tab === 'zonas');

    // Sidebars
    document.getElementById('map-sidebar').style.display = tab === 'map' ? 'block' : 'none';
    document.getElementById('dash-sidebar').style.display = tab === 'dashboard' ? 'block' : 'none';
    document.getElementById('zonas-sidebar').style.display = tab === 'zonas' ? 'block' : 'none';

    // Main Views
    document.getElementById('view-map').style.display = tab === 'map' ? 'block' : 'none';
    document.getElementById('view-dashboard').style.display = tab === 'dashboard' ? 'block' : 'none';
    document.getElementById('view-zonas').style.display = tab === 'zonas' ? 'flex' : 'none';

    if (tab === 'map' && map) {
        setTimeout(() => { map.invalidateSize(); }, 100);
    }

    if (tab === 'zonas') {
        initZonasMap();
    }
}


// ==========================================
// MAPA (LEAFLET)
// ==========================================
function initMap() {
    map = L.map('map').setView([-15.793889, -47.882778], 10);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap &copy; CARTO',
        subdomains: 'abcd',
        maxZoom: 20
    }).addTo(map);

    loadData();
    loadDashboardData();
}

async function loadData() {
    try {
        const responseData = await fetch('locais_votacao.json');
        locaisData = await responseData.json();

        try {
            const responseGeo = await fetch('df_zonas.geojson');
            if (responseGeo.ok) {
                zonasGeoJSON = await responseGeo.json();
                renderGeoJSON();
            } else {
                document.getElementById('sidebar-content').innerHTML = `
                    <div style="padding:20px; color:red;">
                        <strong>Aviso:</strong> df_zonas.geojson não encontrado.
                    </div>`;
            }
        } catch(e) { console.warn("Erro GeoJSON:", e); }
    } catch (error) { console.error("Erro JSON Locais:", error); }
}

function renderGeoJSON() {
    if (!zonasGeoJSON) return;

    geojsonLayer = L.geoJSON(zonasGeoJSON, {
        style: function(feature) {
            let zoneId = feature.properties.ZONA || feature.properties.zona; 
            return {
                fillColor: zoneColors[zoneId] || '#cccccc',
                weight: 2, opacity: 1, color: 'white',
                dashArray: '3', fillOpacity: 0.7
            };
        },
        onEachFeature: function(feature, layer) {
            let zoneId = feature.properties.ZONA || feature.properties.zona;
            layer.on({
                mouseover: function(e) {
                    let l = e.target;
                    l.setStyle({ weight: 4, color: '#333', fillOpacity: 0.9 });
                    l.bringToFront();
                },
                mouseout: function(e) { geojsonLayer.resetStyle(e.target); },
                click: function(e) {
                    map.fitBounds(e.target.getBounds());
                    showZoneData(zoneId);
                }
            });
            layer.bindTooltip(`Zona Eleitoral ${zoneId}`, { className: 'custom-tooltip', sticky: true });
        }
    }).addTo(map);
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
            <button class="btn-open-table" onclick="openModal('${zoneId}')">Ver Tabela Completa</button>
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
// ZONAS ELEITORAIS — SVG INTERATIVO
// ==========================================
let zonasMapInitialized = false;

function initZonasMap() {
    if (zonasMapInitialized) return;
    zonasMapInitialized = true;

    const wrapper = document.getElementById('zonas-svg-wrapper');
    const legendContainer = document.getElementById('zonas-legend');

    // Build SVG
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 850 680');
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

    // Draw zones
    const zoneOrder = ["16","5","6","2","14","11","3","19","8","20","9","1","15","10","18","13","21","17","4"];

    zoneOrder.forEach((zoneId, index) => {
        const pathData = ZONAS_PATHS[zoneId];
        const zoneInfo = ZONAS_DATA[zoneId];
        if (!pathData || !zoneInfo) return;

        // Create polygon path
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', pathData);
        path.setAttribute('fill', zoneInfo.cor);
        path.setAttribute('class', 'zona-path');
        path.setAttribute('data-zone', zoneId);
        path.style.animationDelay = `${index * 0.05}s`;

        // Hover events
        path.addEventListener('mouseenter', (e) => {
            showZonaTooltip(e, zoneId);
            highlightLegendItem(zoneId, true);
        });
        path.addEventListener('mousemove', (e) => moveZonaTooltip(e));
        path.addEventListener('mouseleave', () => {
            hideZonaTooltip();
            highlightLegendItem(zoneId, false);
        });
        path.addEventListener('click', () => selectZone(zoneId));

        svg.appendChild(path);

        // Create label
        const labelPos = ZONAS_LABELS[zoneId];
        if (labelPos) {
            const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            text.setAttribute('x', labelPos.x);
            text.setAttribute('y', labelPos.y);
            text.setAttribute('class', 'zona-label');
            text.textContent = zoneId;
            svg.appendChild(text);
        }
    });

    wrapper.appendChild(svg);

    // Build legend
    buildZonasLegend(legendContainer);
}

function buildZonasLegend(container) {
    const zoneOrder = ["1","2","3","4","5","6","8","9","10","11","13","14","15","16","17","18","19","20","21"];

    zoneOrder.forEach(zoneId => {
        const zoneInfo = ZONAS_DATA[zoneId];
        if (!zoneInfo) return;

        const item = document.createElement('div');
        item.className = 'legend-item';
        item.setAttribute('data-zone', zoneId);
        item.innerHTML = `
            <div class="legend-color" style="background-color: ${zoneInfo.cor};"></div>
            <div class="legend-text">
                <span class="legend-zona-name">${zoneId} — ${zoneInfo.ras[0]}</span>
                <span class="legend-zona-ras">${zoneInfo.ras.length > 1 ? zoneInfo.ras.slice(1).join(', ') : ''}</span>
            </div>
        `;

        // Legend item hover → highlight zone on map
        item.addEventListener('mouseenter', () => {
            const path = document.querySelector(`.zona-path[data-zone="${zoneId}"]`);
            if (path) path.classList.add('active');
        });
        item.addEventListener('mouseleave', () => {
            const path = document.querySelector(`.zona-path[data-zone="${zoneId}"]`);
            if (path && activeZone !== zoneId) path.classList.remove('active');
        });
        item.addEventListener('click', () => selectZone(zoneId));

        container.appendChild(item);
    });
}

function showZonaTooltip(e, zoneId) {
    const tooltip = document.getElementById('zonas-tooltip');
    const zoneInfo = ZONAS_DATA[zoneId];
    if (!zoneInfo) return;

    tooltip.innerHTML = `
        <div class="tooltip-title">Zona ${zoneId}</div>
        <div class="tooltip-ras">${zoneInfo.ras.join(', ')}</div>
        <div style="margin-top:4px; font-size:0.8rem;">${zoneInfo.eleitorado.toLocaleString('pt-BR')} eleitores</div>
    `;
    tooltip.style.display = 'block';
    moveZonaTooltip(e);
}

function moveZonaTooltip(e) {
    const tooltip = document.getElementById('zonas-tooltip');
    const mapArea = document.querySelector('.zonas-map-area');
    const rect = mapArea.getBoundingClientRect();
    tooltip.style.left = (e.clientX - rect.left + 15) + 'px';
    tooltip.style.top = (e.clientY - rect.top - 10) + 'px';
}

function hideZonaTooltip() {
    document.getElementById('zonas-tooltip').style.display = 'none';
}

function highlightLegendItem(zoneId, active) {
    const item = document.querySelector(`.legend-item[data-zone="${zoneId}"]`);
    if (item) {
        if (active) {
            item.style.background = 'rgba(255,255,255,0.1)';
        } else if (activeZone !== zoneId) {
            item.style.background = '';
        }
    }
}

function selectZone(zoneId) {
    // Remove previous active
    if (activeZone) {
        const prevPath = document.querySelector(`.zona-path[data-zone="${activeZone}"]`);
        if (prevPath) prevPath.classList.remove('active');
        const prevLegend = document.querySelector(`.legend-item[data-zone="${activeZone}"]`);
        if (prevLegend) prevLegend.classList.remove('active');
    }

    activeZone = zoneId;

    // Activate new
    const path = document.querySelector(`.zona-path[data-zone="${zoneId}"]`);
    if (path) path.classList.add('active');
    const legendItem = document.querySelector(`.legend-item[data-zone="${zoneId}"]`);
    if (legendItem) {
        legendItem.classList.add('active');
        legendItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    // Show detail panel in sidebar
    showZonasDetail(zoneId);
}

function showZonasDetail(zoneId) {
    const panel = document.getElementById('zonas-detail-panel');
    const zoneInfo = ZONAS_DATA[zoneId];
    if (!zoneInfo) return;

    const locais = locaisData[zoneId];
    const totalLocais = locais ? locais.length : zoneInfo.locais;
    let totalSecoes = 0;
    if (locais) locais.forEach(l => { totalSecoes += l.secoes_2022; });

    panel.innerHTML = `
        <div class="zonas-detail-card">
            <div class="detail-header">
                <div class="detail-color-badge" style="background-color: ${zoneInfo.cor};"></div>
                <div>
                    <h3>${zoneInfo.nome}</h3>
                    <p>${zoneInfo.percentual}% do eleitorado do DF</p>
                </div>
            </div>

            <div class="detail-kpis">
                <div class="detail-kpi">
                    <span>Eleitorado</span>
                    <strong>${zoneInfo.eleitorado.toLocaleString('pt-BR')}</strong>
                </div>
                <div class="detail-kpi">
                    <span>Locais</span>
                    <strong>${totalLocais}</strong>
                </div>
                <div class="detail-kpi">
                    <span>Seções</span>
                    <strong>${totalSecoes || '—'}</strong>
                </div>
                <div class="detail-kpi">
                    <span>Média/Local</span>
                    <strong>${totalLocais > 0 ? Math.round(zoneInfo.eleitorado / totalLocais).toLocaleString('pt-BR') : '—'}</strong>
                </div>
            </div>

            <div class="detail-ras-list">
                <h4>Regiões Administrativas:</h4>
                ${zoneInfo.ras.map(ra => `<span class="ra-tag">${ra}</span>`).join('')}
            </div>

            ${locais ? `<button class="detail-locais-btn" onclick="openModal('${zoneId}')">📋 Ver Locais de Votação</button>` : ''}
        </div>
    `;
}


// Iniciar Aplicação
window.onload = initMap;
