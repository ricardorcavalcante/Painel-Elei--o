// Script único: extrai os locais de votação do KML e geocodifica os endereços
// via Nominatim (OpenStreetMap) para obter coordenadas reais.
// Estratégia em camadas (da mais precisa para a mais genérica):
//   1) endereço completo do KML
//   2) referência de quadra extraída do endereço/nome (ex: "SQS 408")
//   3) nome da Região Administrativa (RA)
// Uso: node geocode-kml.mjs
import { readFileSync, writeFileSync, existsSync } from 'fs';

const KML_PATH = new URL('./kml das secoes.kml', import.meta.url);
const CACHE_PATH = new URL('./geocode_cache.json', import.meta.url);
const OUTPUT_PATH = new URL('./locais_geocoded.json', import.meta.url);

const DF_VIEWBOX = '-48.35,-15.45,-47.30,-16.10'; // lon1,lat1,lon2,lat2 (bounded search no DF)
const USER_AGENT = 'PainelEleitoralDF/1.0 (uso nao-comercial; contato: projeto.claude.ia@gmail.com)';
const DELAY_MS = 1100; // respeita a politica de uso justo do Nominatim (max 1 req/s)
const QUADRA_REGEX = /(SQS|SQN|SGAS|SGAN|SHIS|SHIN|SHCGN|SHIGS|SEPS|SEPN|EQS|EQN|QNM|QNP|QNO|QNQ|QNR|QNJ|QNL|QNG|QNA|QSA|QSB|QSD|QSE|QSF|QUADRA|QI|QL|QE|QR|QN|CA|CL|EQ|AR)\s*\.?\s*(\d{1,3})/i;

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

function buildCandidateQueries(p) {
    const candidates = [];

    // Tier 1: endereço completo (com CEP se houver)
    if (p.endereco && p.endereco.length > 3) {
        const cepPart = p.cep ? `, ${p.cep}` : '';
        candidates.push({ tier: 'endereco', query: `${p.endereco}${cepPart}, Brasília, DF, Brasil` });
    }

    // Tier 2: referência de quadra extraída do endereço ou do nome do local.
    // Inclui a RA na consulta para desambiguar quadras genéricas (ex: "QUADRA 4"
    // existe em várias cidades-satélite) das nomenclaturas do Plano Piloto,
    // que já são específicas o bastante (SQS/SGAS/etc).
    const source = `${p.endereco} ${p.local}`;
    const quadraMatch = source.match(QUADRA_REGEX);
    if (quadraMatch) {
        const prefix = quadraMatch[1].toUpperCase();
        const quadraRef = `${prefix} ${quadraMatch[2]}`;
        const isGeneric = prefix === 'QUADRA' || prefix === 'CA' || prefix === 'CL' || prefix === 'AR';
        const raContext = isGeneric && p.ra ? `${p.ra}, ` : '';
        candidates.push({ tier: 'quadra', query: `${quadraRef}, ${raContext}Brasília, DF, Brasil` });
    }

    // Tier 3: Região Administrativa (fallback de baixa precisão, mas ainda real)
    if (p.ra && p.ra.length > 1) {
        candidates.push({ tier: 'ra', query: `${p.ra}, Distrito Federal, Brasil` });
    }

    return candidates;
}

async function geocodeQuery(query) {
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&countrycodes=br&viewbox=${DF_VIEWBOX}&bounded=1&q=${encodeURIComponent(query)}`;
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data || data.length === 0) return null;

    // Prefere nós (pontos reais) a relações/limites administrativos, cujo
    // centroide pode cair longe do ponto de referência intuitivo (polígono irregular).
    const best = data.find(d => d.osm_type === 'node') || data[0];
    return { lat: parseFloat(best.lat), lng: parseFloat(best.lon), display_name: best.display_name };
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
    const kmlText = readFileSync(KML_PATH, 'utf-8');
    let placemarks = extractPlacemarks(kmlText);
    console.log(`Placemarks extraidos do KML: ${placemarks.length}`);

    const limitArg = process.argv.find(a => a.startsWith('--limit='));
    if (limitArg) {
        const limit = parseInt(limitArg.split('=')[1], 10);
        placemarks = placemarks.slice(0, limit);
        console.log(`(modo teste: limitado a ${limit} placemarks)`);
    }

    const cache = existsSync(CACHE_PATH) ? JSON.parse(readFileSync(CACHE_PATH, 'utf-8')) : {};
    let newQueries = 0;
    let saveCounter = 0;

    const geocoded = [];
    for (let i = 0; i < placemarks.length; i++) {
        const p = placemarks[i];
        const candidates = buildCandidateQueries(p);
        let result = null;
        let usedTier = null;
        let usedQuery = null;

        for (const cand of candidates) {
            if (!(cand.query in cache)) {
                try {
                    cache[cand.query] = await geocodeQuery(cand.query);
                } catch (err) {
                    console.warn(`Falha ao geocodificar "${cand.query}": ${err.message}`);
                    cache[cand.query] = null;
                }
                newQueries++;
                saveCounter++;
                await sleep(DELAY_MS);
                if (saveCounter >= 15) {
                    writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2), 'utf-8');
                    saveCounter = 0;
                    console.log(`Progresso: ${i + 1}/${placemarks.length} locais processados (${newQueries} consultas novas ao Nominatim)...`);
                }
            }
            if (cache[cand.query]) {
                result = cache[cand.query];
                usedTier = cand.tier;
                usedQuery = cand.query;
                break;
            }
        }

        geocoded.push({
            ra: p.ra,
            local: p.local,
            cep: p.cep,
            status: p.status,
            endereco: p.endereco,
            lat: result ? result.lat : null,
            lng: result ? result.lng : null,
            matched: !!result,
            precisao: usedTier,
            query: usedQuery
        });
    }

    writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2), 'utf-8');
    writeFileSync(OUTPUT_PATH, JSON.stringify(geocoded, null, 2), 'utf-8');

    const matchedCount = geocoded.filter(g => g.matched).length;
    const byTier = geocoded.reduce((acc, g) => {
        if (g.precisao) acc[g.precisao] = (acc[g.precisao] || 0) + 1;
        return acc;
    }, {});
    console.log(`Concluido: ${matchedCount}/${geocoded.length} locais geocodificados com sucesso.`);
    console.log(`Por precisao: ${JSON.stringify(byTier)}`);
    console.log(`Arquivo gerado: ${OUTPUT_PATH.pathname}`);
}

main().catch(err => {
    console.error('Erro fatal:', err);
    process.exit(1);
});
