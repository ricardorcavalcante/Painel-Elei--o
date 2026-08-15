// Script único: extrai os locais de votação do KML, junta com locais_votacao.json
// (zona/seções/eleitorado) e geocodifica os endereços via Google Geocoding API.
// Uso: GOOGLE_MAPS_API_KEY=xxx node scripts/geocode-google.mjs
import { readFileSync, writeFileSync, existsSync } from 'fs';

const ROOT = new URL('../', import.meta.url);
const KML_PATH = new URL('./kml das secoes.kml', ROOT);
const VOTACAO_PATH = new URL('./public/locais_votacao.json', ROOT);
const CACHE_PATH = new URL('./geocode_cache_google.json', ROOT);
const OUTPUT_PATH = new URL('./public/locais_pontos.json', ROOT);

const API_KEY = process.env.GOOGLE_MAPS_API_KEY;
if (!API_KEY) {
    console.error('Defina GOOGLE_MAPS_API_KEY no ambiente antes de rodar este script.');
    process.exit(1);
}

// Caixa delimitadora do DF (sudoeste|nordeste) para viés de busca (bounds é uma
// preferência, não uma restrição rígida — por isso também usamos components).
const DF_BOUNDS = '-16.10,-48.35|-15.45,-47.30';

function decodeXmlEntities(str) {
    return str
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)));
}

function extractPlacemarks(kmlText) {
    const blocks = kmlText.match(/<Placemark>[\s\S]*?<\/Placemark>/g) || [];
    const placemarks = [];

    blocks.forEach(block => {
        const nameMatch = block.match(/<name>([\s\S]*?)<\/name>/);
        if (!nameMatch) return;
        const nameStr = decodeXmlEntities(nameMatch[1].trim());
        if (!nameStr || nameStr.includes('Mapa sem') || nameStr.includes('.csv')) return;

        const parts = nameStr.split(';');
        const ra = (parts[0] || '').trim();
        const local = (parts[1] || parts[0] || '').trim();
        const cep = (parts[2] || '').trim();
        const status = (parts[3] || '').trim();
        const endereco = (parts[4] || '').trim();

        placemarks.push({ ra, local, cep, status, endereco });
    });

    return placemarks;
}

// Idêntico ao matching por substring usado em public/kmlParser.js, para que a
// atribuição de zona/seções/eleitorado por local não fique diferente do que já
// estava em produção.
function buildVotacaoLookup(votacaoData) {
    const lookup = {};
    Object.entries(votacaoData).forEach(([zona, list]) => {
        list.forEach(item => {
            const key = item.local.trim().toLowerCase();
            lookup[key] = {
                zona,
                secoes: item.secoes_2022 || item.secoes || 0,
                eleitorado: item.eleitorado || 0,
                endereco: item.endereco || '',
                ra: item.ra || '',
                bairro: item.bairro_2022 || ''
            };
        });
    });
    return lookup;
}

function matchVotacao(lookup, localName) {
    const key = localName.toLowerCase();
    let matched = lookup[key];
    if (!matched) {
        const foundKey = Object.keys(lookup).find(k => k.includes(key) || key.includes(k));
        if (foundKey) matched = lookup[foundKey];
    }
    return matched;
}

async function geocodeAddress(query) {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&region=br&bounds=${encodeURIComponent(DF_BOUNDS)}&components=${encodeURIComponent('country:BR')}&key=${API_KEY}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.status !== 'OK' || !data.results || data.results.length === 0) {
        return { status: data.status, result: null };
    }
    const best = data.results[0];
    return {
        status: data.status,
        result: {
            lat: best.geometry.location.lat,
            lng: best.geometry.location.lng,
            location_type: best.geometry.location_type,
            formatted_address: best.formatted_address
        }
    };
}

async function main() {
    const kmlText = readFileSync(KML_PATH, 'utf-8');
    const placemarks = extractPlacemarks(kmlText);
    console.log(`Placemarks extraidos do KML: ${placemarks.length}`);

    const votacaoData = JSON.parse(readFileSync(VOTACAO_PATH, 'utf-8'));
    const votacaoLookup = buildVotacaoLookup(votacaoData);

    const cache = existsSync(CACHE_PATH) ? JSON.parse(readFileSync(CACHE_PATH, 'utf-8')) : {};
    let newQueries = 0;
    let saveCounter = 0;

    const pontos = [];
    let semCoordenada = 0;

    for (let i = 0; i < placemarks.length; i++) {
        const p = placemarks[i];
        const matched = matchVotacao(votacaoLookup, p.local);

        const enderecoBase = p.endereco || (matched ? matched.endereco : '');
        const query = enderecoBase
            ? `${enderecoBase}, Brasília, DF, Brasil`
            : `${p.local}, ${p.ra}, Brasília, DF, Brasil`;

        if (!(query in cache)) {
            try {
                cache[query] = await geocodeAddress(query);
            } catch (err) {
                console.warn(`Falha ao geocodificar "${query}": ${err.message}`);
                cache[query] = { status: 'ERROR', result: null };
            }
            newQueries++;
            saveCounter++;
            if (saveCounter >= 20) {
                writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2), 'utf-8');
                saveCounter = 0;
                console.log(`Progresso: ${i + 1}/${placemarks.length} (${newQueries} consultas novas ao Google)...`);
            }
        }

        const cached = cache[query];
        const geo = cached && cached.result;
        if (!geo) semCoordenada++;

        pontos.push({
            local: p.local,
            endereco: enderecoBase,
            ra: p.ra || (matched ? matched.ra : ''),
            bairro: matched ? matched.bairro : '',
            zona: matched ? matched.zona : 'N/A',
            secoes: matched ? matched.secoes : 0,
            eleitorado: matched ? matched.eleitorado : 0,
            lat: geo ? geo.lat : null,
            lng: geo ? geo.lng : null,
            location_type: geo ? geo.location_type : null
        });
    }

    writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2), 'utf-8');
    writeFileSync(OUTPUT_PATH, JSON.stringify(pontos, null, 2), 'utf-8');

    const byType = pontos.reduce((acc, p) => {
        if (p.location_type) acc[p.location_type] = (acc[p.location_type] || 0) + 1;
        return acc;
    }, {});
    console.log(`Concluido: ${pontos.length - semCoordenada}/${pontos.length} locais geocodificados.`);
    console.log(`Sem coordenada: ${semCoordenada}`);
    console.log(`Por location_type: ${JSON.stringify(byType)}`);
    console.log(`Arquivo gerado: ${OUTPUT_PATH.pathname}`);
}

main().catch(err => {
    console.error('Erro fatal:', err);
    process.exit(1);
});
