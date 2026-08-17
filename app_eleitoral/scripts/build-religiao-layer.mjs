// Gera public/poi_religiao.json a partir da Overpass API (OpenStreetMap), atribuindo
// a RA de cada instituição religiosa por point-in-polygon contra
// scripts/data/regioes_administrativas.geojson (mesma fonte usada nas demais camadas
// de POI), para garantir consistência com o filtro por RA do app.
//
// A resposta bruta da Overpass é armazenada em scripts/data/raw/religiao_overpass.json
// para rastreabilidade e reprocessamento offline. Use --refresh para forçar uma nova
// consulta em vez de reaproveitar o cache.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RAW_DIR = path.join(__dirname, 'data', 'raw');
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const RAW_CACHE_PATH = path.join(RAW_DIR, 'religiao_overpass.json');

const REFRESH = process.argv.includes('--refresh');

// Bounding box do DF calculado a partir de scripts/data/regioes_administrativas.geojson
const BBOX = { south: -16.06, west: -48.29, north: -15.49, east: -47.30 };

const OVERPASS_QUERY = `[out:json][timeout:180];
(
  nwr["amenity"="place_of_worship"](${BBOX.south},${BBOX.west},${BBOX.north},${BBOX.east});
  nwr["building"~"^(church|mosque|synagogue|temple)$"](${BBOX.south},${BBOX.west},${BBOX.north},${BBOX.east});
);
out center tags;`;

// Mesmo mapeamento de grafia usado em build-poi-layers.mjs, para bater com o campo
// "ra" salvo em public/locais_pontos.json.
const SHAPEFILE_RA_TO_DATA_RA = {
    'SOL NASCENTE E POR DO SOL': 'SOL NASCENTE/PÔR DO SOL',
    'SCIA': 'SCIA/ESTRUTURAL',
    'SOBRADINHO II': 'SOBRADINHO',
    'SIA': 'GUARÁ'
};

function pointInRing(x, y, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const xi = ring[i][0], yi = ring[i][1];
        const xj = ring[j][0], yj = ring[j][1];
        const intersect = ((yi > y) !== (yj > y)) &&
            (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

function pointInPolygonGeom(x, y, geometry) {
    if (geometry.type === 'Polygon') {
        const rings = geometry.coordinates;
        if (!pointInRing(x, y, rings[0])) return false;
        for (let i = 1; i < rings.length; i++) if (pointInRing(x, y, rings[i])) return false;
        return true;
    }
    if (geometry.type === 'MultiPolygon') {
        return geometry.coordinates.some(poly => pointInPolygonGeom(x, y, { type: 'Polygon', coordinates: poly }));
    }
    return false;
}

function findRA(lon, lat, raFeatures) {
    for (const f of raFeatures) {
        if (pointInPolygonGeom(lon, lat, f.geometry)) {
            const shapefileName = f.properties.ra_nome;
            return SHAPEFILE_RA_TO_DATA_RA[shapefileName] || shapefileName;
        }
    }
    return null;
}

function normalizeName(nome) {
    return nome
        .toLowerCase()
        .normalize('NFD').replace(/\p{Diacritic}/gu, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function haversineMeters(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const toRad = d => d * Math.PI / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
}

function buildEndereco(tags) {
    const partes = [];
    if (tags['addr:street']) {
        let via = tags['addr:street'];
        if (tags['addr:housenumber']) via += `, ${tags['addr:housenumber']}`;
        partes.push(via);
    }
    if (tags['addr:suburb'] && tags['addr:suburb'] !== tags['addr:city']) partes.push(tags['addr:suburb']);
    if (tags['addr:postcode']) partes.push(tags['addr:postcode']);
    return partes.join(' - ');
}

async function fetchOverpass() {
    if (!REFRESH && fs.existsSync(RAW_CACHE_PATH)) {
        console.log(`📂 Reaproveitando cache bruto: ${path.relative(process.cwd(), RAW_CACHE_PATH)} (use --refresh para forçar nova consulta)`);
        return JSON.parse(fs.readFileSync(RAW_CACHE_PATH, 'utf8'));
    }
    console.log('🌐 Consultando Overpass API (amenity=place_of_worship + building religiosos no DF)...');
    const res = await fetch('https://overpass-api.de/api/interpreter', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'painel-eleitoral-df/1.0 (script de mapeamento de instituicoes religiosas)'
        },
        body: new URLSearchParams({ data: OVERPASS_QUERY })
    });
    if (!res.ok) throw new Error(`Overpass API respondeu HTTP ${res.status}`);
    const json = await res.json();
    fs.mkdirSync(RAW_DIR, { recursive: true });
    fs.writeFileSync(RAW_CACHE_PATH, JSON.stringify(json, null, 2));
    console.log(`   Resposta bruta salva em ${path.relative(process.cwd(), RAW_CACHE_PATH)} (${json.elements.length} elementos).`);
    return json;
}

console.log('📂 Carregando polígonos de RA...');
const raGeojson = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'regioes_administrativas.geojson'), 'utf8'));
console.log(`   ${raGeojson.features.length} RAs carregadas.`);

console.log('\n⛪ Processando instituições religiosas...');
const overpassJson = await fetchOverpass();

const candidatos = [];
for (const el of overpassJson.elements) {
    const tags = el.tags || {};
    let lat, lon;
    if (el.type === 'node') { lat = el.lat; lon = el.lon; }
    else if (el.center) { lat = el.center.lat; lon = el.center.lon; }
    else continue;

    candidatos.push({
        nome: (tags.name || '').trim(),
        endereco: buildEndereco(tags),
        lat,
        lon,
        tipoObjetoFonte: el.type,
        idObjetoFonte: el.id
    });
}

let semRA = 0;
const comRA = [];
for (const c of candidatos) {
    const ra = findRA(c.lon, c.lat, raGeojson.features);
    if (!ra) { semRA++; continue; }
    comRA.push({ ...c, ra });
}

// Dedup: candidatos a até 30m um do outro com nome equivalente (ou um deles sem nome)
// são tratados como o mesmo local físico — mantém-se apenas o primeiro.
const finais = [];
let duplicados = 0;
for (const c of comRA) {
    const normC = c.nome ? normalizeName(c.nome) : '';
    const jaExiste = finais.some(f => {
        const dist = haversineMeters(c.lat, c.lon, f.lat, f.lon);
        if (dist > 30) return false;
        const normF = f.nome ? normalizeName(f.nome) : '';
        return normC === normF || !normC || !normF;
    });
    if (jaExiste) { duplicados++; continue; }
    finais.push(c);
}

let semNome = 0;
const poiReligiao = finais.map(c => {
    const nome = c.nome || 'Instituição religiosa (nome não identificado)';
    if (!c.nome) semNome++;
    return {
        nome,
        lat: c.lat,
        lng: c.lon,
        ra: c.ra,
        endereco: c.endereco
    };
});

fs.writeFileSync(path.join(PUBLIC_DIR, 'poi_religiao.json'), JSON.stringify(poiReligiao));

console.log(`   ${candidatos.length} candidatos extraídos da Overpass.`);
console.log(`   ${semRA} descartados sem correspondência de RA (fora do polígono do DF).`);
console.log(`   ${duplicados} duplicidades consolidadas (≤30m e nome equivalente).`);
console.log(`   ${semNome} registros publicados sem nome identificado.`);
console.log(`   ${poiReligiao.length} registros publicados no total.`);
console.log('\n✅ Arquivo gerado em public/poi_religiao.json');
