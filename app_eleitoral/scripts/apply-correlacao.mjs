// Aplica a planilha de correlação 2022->2026 (scripts/correlacao_2026.json) sobre
// public/locais_pontos.json: atualiza endereço/ra/bairro/seções/eleitorado por
// local+zona, re-geocodifica só o que mudou, e nunca toca a Zona 16 (já corrigida
// manualmente com dados verificados no Google Maps).
// Uso: GOOGLE_MAPS_API_KEY=xxx node scripts/apply-correlacao.mjs
import { readFileSync, writeFileSync } from 'fs';

const ROOT = new URL('../', import.meta.url);
const PONTOS_PATH = new URL('./public/locais_pontos.json', ROOT);
const CORRELACAO_PATH = new URL('./scripts/correlacao_2026.json', ROOT);
const CACHE_PATH = new URL('./geocode_cache_google.json', ROOT);

const API_KEY = process.env.GOOGLE_MAPS_API_KEY;
if (!API_KEY) {
    console.error('Defina GOOGLE_MAPS_API_KEY no ambiente antes de rodar este script.');
    process.exit(1);
}

const DF_BOUNDS = '-16.10,-48.35|-15.45,-47.30';

const APPLY_STATUSES = new Set([
    'Correlação exata (2022)',
    'Correlação aproximada (2022) - conferir',
    'OK - Endereço e zona confirmados',
    'Pesquisado no QEdu/fonte oficial',
    'Ambíguo - melhor zona única identificada'
]);
const APPLY_WITH_ESTIMATE_STATUS = 'Ambíguo - eleitorado DIVIDIDO entre zonas';
const IGNORE_STATUSES = new Set(['ADICIONADO - zona de 2022 ausente em 2026']);
const SKIP_REPORT_STATUSES = new Set(['REQUER DECISÃO - múltiplas unidades possíveis']);

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
            location_type: best.geometry.location_type
        }
    };
}

function matchPonto(pontos, row) {
    // 1) Nome exato dentro da mesma zona (evita colisão entre zonas com
    // nomes genéricos repetidos, ex: "CENTRO EDUCACIONAL 02").
    let idx = pontos.findIndex(p => p.zona === row.zona && p.local === row.local);
    if (idx !== -1) return idx;

    // 2) Fallback por substring, ainda restrito à mesma zona (mesma lógica de
    // public/kmlParser.js / scripts/geocode-google.mjs).
    const key = row.local.toLowerCase();
    idx = pontos.findIndex(p => p.zona === row.zona && (p.local.toLowerCase().includes(key) || key.includes(p.local.toLowerCase())));
    return idx;
}

async function main() {
    const pontos = JSON.parse(readFileSync(PONTOS_PATH, 'utf-8'));
    const correlacao = JSON.parse(readFileSync(CORRELACAO_PATH, 'utf-8'));
    const cache = JSON.parse(readFileSync(CACHE_PATH, 'utf-8'));

    const stats = { atualizados: 0, estimados: 0, ignorados: 0, semCorrespondencia: [], requerDecisao: [] };
    const toGeocode = [];

    for (const row of correlacao) {
        if (row.zona === '16') continue; // nunca mexe na Zona 16

        if (IGNORE_STATUSES.has(row.status)) {
            stats.ignorados++;
            continue;
        }
        if (SKIP_REPORT_STATUSES.has(row.status) || row.zona === null) {
            stats.requerDecisao.push({ local: row.local, bairro: row.bairro, eleitorado: row.eleitorado, motivo: row.status });
            continue;
        }
        if (!APPLY_STATUSES.has(row.status) && row.status !== APPLY_WITH_ESTIMATE_STATUS) {
            // status inesperado (não deveria acontecer, mas não aplica por segurança)
            stats.semCorrespondencia.push({ local: row.local, zona: row.zona, motivo: `status desconhecido: ${row.status}` });
            continue;
        }

        const idx = matchPonto(pontos, row);
        if (idx === -1) {
            stats.semCorrespondencia.push({ local: row.local, zona: row.zona, motivo: 'nenhum ponto correspondente encontrado na zona' });
            continue;
        }

        const ponto = pontos[idx];
        const enderecoMudou = ponto.endereco !== row.endereco;

        ponto.endereco = row.endereco;
        if (row.ra) ponto.ra = ponto.ra || row.ra;
        if (row.bairro) ponto.bairro = row.bairro;
        if (row.secoes != null) ponto.secoes = row.secoes;
        if (row.eleitorado != null) ponto.eleitorado = row.eleitorado;

        if (row.status === APPLY_WITH_ESTIMATE_STATUS) {
            ponto.eleitorado_estimado = true;
            stats.estimados++;
        } else {
            delete ponto.eleitorado_estimado;
        }

        stats.atualizados++;

        if (enderecoMudou) {
            const query = `${row.endereco}, Brasília, DF, Brasil`;
            toGeocode.push({ idx, query });
        }
    }

    console.log(`Endereços a re-geocodificar: ${toGeocode.length}`);
    let newQueries = 0;
    let saveCounter = 0;
    for (let i = 0; i < toGeocode.length; i++) {
        const { idx, query } = toGeocode[i];
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
                console.log(`Progresso geocodificação: ${i + 1}/${toGeocode.length} (${newQueries} consultas novas)...`);
            }
        }
        const geo = cache[query] && cache[query].result;
        if (geo) {
            pontos[idx].lat = geo.lat;
            pontos[idx].lng = geo.lng;
            pontos[idx].location_type = geo.location_type;
        } else {
            stats.semCorrespondencia.push({ local: pontos[idx].local, zona: pontos[idx].zona, motivo: `geocodificação falhou para "${query}"` });
        }
    }

    writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2), 'utf-8');
    writeFileSync(PONTOS_PATH, JSON.stringify(pontos, null, 2), 'utf-8');

    console.log('\n=== RELATÓRIO ===');
    console.log(`Locais atualizados (endereço/dados): ${stats.atualizados}`);
    console.log(`  dos quais com eleitorado estimado (dividido entre zonas): ${stats.estimados}`);
    console.log(`Linhas ignoradas (ADICIONADO - ausente em 2026): ${stats.ignorados}`);
    console.log(`\nLinhas REQUER DECISÃO (${stats.requerDecisao.length}):`);
    stats.requerDecisao.forEach(r => console.log(`  - ${r.local} (${r.bairro || 's/bairro'}, eleitorado ${r.eleitorado ?? '?'}) — ${r.motivo}`));
    console.log(`\nSem correspondência / falhas (${stats.semCorrespondencia.length}):`);
    stats.semCorrespondencia.forEach(r => console.log(`  - [zona ${r.zona}] ${r.local} — ${r.motivo}`));
}

main().catch(err => {
    console.error('Erro fatal:', err);
    process.exit(1);
});
