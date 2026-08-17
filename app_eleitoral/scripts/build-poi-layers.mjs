// Gera public/poi_escolas.json, public/poi_saude.json e public/poi_seguranca.json
// a partir dos CSVs brutos em scripts/data/raw/, atribuindo a RA de cada ponto por
// point-in-polygon contra scripts/data/regioes_administrativas.geojson (mesma fonte
// usada na aba "RAs"), para garantir consistência com o filtro por RA do app.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import proj4 from 'proj4';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RAW_DIR = path.join(__dirname, 'data', 'raw');
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

const SIRGAS_UTM23S = '+proj=utm +zone=23 +south +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs';
const WGS84 = 'EPSG:4326';

// Nomes de RA do shapefile que precisam ser convertidos para a grafia usada em
// public/locais_pontos.json (mesma lógica de RA_NAME_TO_SHAPEFILE em public/app.js,
// invertida) para que o filtro por RA da aba "RAs" encontre os POIs.
const SHAPEFILE_RA_TO_DATA_RA = {
    'SOL NASCENTE E POR DO SOL': 'SOL NASCENTE/PÔR DO SOL',
    'SCIA': 'SCIA/ESTRUTURAL',
    'SOBRADINHO II': 'SOBRADINHO',
    'SIA': 'GUARÁ'
};

// --- CSV parsing (suporta campos entre aspas com vírgulas internas) ---
function parseCSV(text) {
    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (inQuotes) {
            if (c === '"') {
                if (text[i + 1] === '"') { field += '"'; i++; }
                else inQuotes = false;
            } else field += c;
        } else {
            if (c === '"') inQuotes = true;
            else if (c === ',') { row.push(field); field = ''; }
            else if (c === '\r') { /* ignora */ }
            else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
            else field += c;
        }
    }
    if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
    return rows.filter(r => r.length > 1 || (r.length === 1 && r[0] !== ''));
}

function csvToObjects(text) {
    const rows = parseCSV(text);
    const header = rows[0];
    return rows.slice(1).map(r => {
        const obj = {};
        header.forEach((h, i) => { obj[h] = r[i] !== undefined ? r[i] : ''; });
        return obj;
    });
}

function parseMultipoint(geom) {
    const m = geom.match(/\(\(\s*(-?[\d.]+)\s+(-?[\d.]+)\s*\)\)/);
    if (!m) return null;
    return { x: parseFloat(m[1]), y: parseFloat(m[2]) };
}

// --- Point-in-polygon (ray casting), com suporte a buracos (rings extras) ---
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

console.log('📂 Carregando polígonos de RA...');
const raGeojson = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'regioes_administrativas.geojson'), 'utf8'));
console.log(`   ${raGeojson.features.length} RAs carregadas.`);

// ============================================================
// ESCOLAS
// ============================================================
console.log('\n📚 Processando escolas...');

const escolasFull = csvToObjects(fs.readFileSync(path.join(RAW_DIR, 'escolas.csv'), 'utf8'));
const escolasExtra = csvToObjects(fs.readFileSync(path.join(RAW_DIR, 'escolas_extra.csv'), 'utf8'));

const escolasBrutas = [];
for (const row of escolasFull) {
    const geom = parseMultipoint(row.the_geom || '');
    if (!geom) continue;
    escolasBrutas.push({ nome: (row.nome || '').trim(), lon: geom.x, lat: geom.y });
}
for (const row of escolasExtra) {
    const lon = parseFloat(row.lon);
    const lat = parseFloat(row.lat);
    if (isNaN(lon) || isNaN(lat)) continue;
    escolasBrutas.push({ nome: (row.nome || '').trim(), lon, lat });
}

let escolasSemRA = 0;
const poiEscolas = escolasBrutas
    .filter(e => e.nome)
    .map(e => {
        const ra = findRA(e.lon, e.lat, raGeojson.features);
        if (!ra) escolasSemRA++;
        return { nome: e.nome, lat: e.lat, lng: e.lon, ra };
    })
    .filter(e => e.ra); // descarta pontos fora de qualquer polígono de RA (ruído de geocodificação)

console.log(`   ${escolasBrutas.length} escolas lidas, ${poiEscolas.length} com RA atribuída (${escolasSemRA} descartadas sem correspondência).`);

// ============================================================
// SAÚDE
// ============================================================
console.log('\n🏥 Processando saúde...');

const saudeRows = csvToObjects(fs.readFileSync(path.join(RAW_DIR, 'saude_sala_situacao_2.csv'), 'utf8'));
let saudeSemRA = 0;
const poiSaude = saudeRows
    .map(row => {
        const lon = parseFloat(row.longitud0);
        const lat = parseFloat(row.latitude1);
        if (isNaN(lon) || isNaN(lat)) return null;
        const nome = (row.nomecomp5 || row.nome_est4 || '').trim();
        if (!nome) return null;
        const ra = findRA(lon, lat, raGeojson.features);
        if (!ra) { saudeSemRA++; return null; }
        return {
            nome,
            lat,
            lng: lon,
            ra,
            tipo: (row.tipo || '').trim(),
            abertoAoPublico: (row.porta_ab2 || '').trim().toLowerCase() === 'sim'
        };
    })
    .filter(Boolean);

console.log(`   ${saudeRows.length} unidades lidas, ${poiSaude.length} com RA atribuída (${saudeSemRA} descartadas sem correspondência).`);

// ============================================================
// SEGURANÇA
// ============================================================
console.log('\n🚓 Processando segurança pública...');

const segurancaRows = csvToObjects(fs.readFileSync(path.join(RAW_DIR, 'seguranca_2.csv'), 'utf8'));
let segurancaSemRA = 0;
const poiSeguranca = segurancaRows
    .map(row => {
        const geom = parseMultipoint(row.the_geom || '');
        if (!geom) return null;
        const [lon, lat] = proj4(SIRGAS_UTM23S, WGS84, [geom.x, geom.y]);
        const nome = (row.unidade_op || row.sigla || '').trim();
        if (!nome) return null;
        const ra = findRA(lon, lat, raGeojson.features);
        if (!ra) { segurancaSemRA++; return null; }
        return {
            nome,
            lat,
            lng: lon,
            ra,
            orgao: (row.orgao || '').trim(),
            endereco: (row.endereco || '').trim(),
            telefone: (row.telefone || '').trim(),
            tipo: (row.tipo_2 || '').trim()
        };
    })
    .filter(Boolean);

console.log(`   ${segurancaRows.length} unidades lidas, ${poiSeguranca.length} com RA atribuída (${segurancaSemRA} descartadas sem correspondência).`);

// ============================================================
// Grava os JSONs finais
// ============================================================
fs.writeFileSync(path.join(PUBLIC_DIR, 'poi_escolas.json'), JSON.stringify(poiEscolas));
fs.writeFileSync(path.join(PUBLIC_DIR, 'poi_saude.json'), JSON.stringify(poiSaude));
fs.writeFileSync(path.join(PUBLIC_DIR, 'poi_seguranca.json'), JSON.stringify(poiSeguranca));

console.log('\n✅ Arquivos gerados em public/: poi_escolas.json, poi_saude.json, poi_seguranca.json');
