// Calcula os quadrantes de voluntários (grade fixa 500m, recortada por
// RA ∩ mancha urbana ∖ área rural — mesmo algoritmo de gerarQuadrantesDaRA()
// em public/app.js, replicado aqui em Node com turf em vez de
// google.maps.geometry) para as 37 RAs oficiais do DF, e gera um .sql
// idempotente (get-or-create Coordenação Regional + wipe/regenera os
// quadrantes) pronto pra colar no SQL Editor do Supabase — mesmo fluxo
// já usado em SQL_CONSOLIDADO_FALTANTE.sql, já que não há aqui uma
// service-role key pra escrever direto no banco.
import { readFileSync, writeFileSync } from 'fs';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import bbox from '@turf/bbox';
import { point } from '@turf/helpers';

const QUADRANTE_TAMANHO_METROS = 500;
const METROS_POR_GRAU_LAT = 111320;
const metrosParaGrausLat = m => m / METROS_POR_GRAU_LAT;
const metrosParaGrausLng = (m, latRef) => m / (METROS_POR_GRAU_LAT * Math.cos(latRef * Math.PI / 180));

// Idêntico a raSigla() em public/app.js (testado sem colisão nas 37 RAs).
function raSigla(raNome) {
    const limpo = (raNome || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
    const palavras = limpo.split(/[^A-Za-z]+/).filter(Boolean);
    if (palavras.length >= 2) return palavras.map(p => p[0]).join('').toUpperCase().slice(0, 4);
    return ((palavras[0] || '').slice(0, 3) || 'RA').toUpperCase();
}

// Reconciliação nome-do-shapefile -> nome canônico do app (inverso de
// RA_NAME_TO_SHAPEFILE em public/app.js) — só as 2 exceções conhecidas;
// as outras 35 RAs usam o nome do shapefile igual em ambos os lados.
const SHAPEFILE_NAME_TO_APP = {
    'SOL NASCENTE E POR DO SOL': 'SOL NASCENTE/PÔR DO SOL',
    'SCIA': 'SCIA/ESTRUTURAL'
};

function sqlEscape(str) {
    return String(str).replace(/'/g, "''");
}
function sqlNum(n) {
    return Number(n).toFixed(6);
}

const raGeojson = JSON.parse(readFileSync(new URL('../public/regioes_administrativas.geojson', import.meta.url), 'utf-8'));
const urbanGeojson = JSON.parse(readFileSync(new URL('../public/perimetro_urbano.geojson', import.meta.url), 'utf-8'));
const ruralGeojson = JSON.parse(readFileSync(new URL('../public/area_rural_assentamentos.geojson', import.meta.url), 'utf-8'));
const pontos = JSON.parse(readFileSync(new URL('../public/locais_pontos.json', import.meta.url), 'utf-8'));

const urbanFeature = urbanGeojson.features[0];
const ruralFeatures = ruralGeojson.features;

function estaDentroDaMalhaRural(pt) {
    return ruralFeatures.some(f => {
        try { return booleanPointInPolygon(pt, f); } catch { return false; }
    });
}

// Zona(s) eleitoral(is) de uma RA: junção espacial dos pontos reais de
// votação (public/locais_pontos.json, lat/lng + zona) contra o polígono
// da RA — não usa o campo "ra" do próprio ponto (que não cobre as RAs mais
// novas: SIA, Sobradinho II, Água Quente, Ponte Alta, 26 de Setembro),
// então funciona igual pras 37 RAs, inclusive essas 5.
function zonasEleitoraisDaRA(raFeature) {
    const zonas = new Set();
    for (const p of pontos) {
        if (typeof p.lat !== 'number' || typeof p.lng !== 'number') continue;
        if (!/^\d+$/.test(String(p.zona))) continue; // descarta "N/A" e afins
        const pt = point([p.lng, p.lat]);
        if (booleanPointInPolygon(pt, raFeature)) zonas.add(p.zona);
    }
    return [...zonas].sort((a, b) => parseInt(a, 10) - parseInt(b, 10)).join(', ') || null;
}

function gerarCelulas(raFeature) {
    const [minLng, minLat, maxLng, maxLat] = bbox(raFeature);
    const latRef = (minLat + maxLat) / 2;
    const cellLat = metrosParaGrausLat(QUADRANTE_TAMANHO_METROS);
    const cellLng = metrosParaGrausLng(QUADRANTE_TAMANHO_METROS, latRef);
    const rows = Math.max(1, Math.ceil((maxLat - minLat) / cellLat));
    const cols = Math.max(1, Math.ceil((maxLng - minLng) / cellLng));

    const celulas = [];
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const latMin = minLat + r * cellLat;
            const lngMin = minLng + c * cellLng;
            const latMax = Math.min(latMin + cellLat, maxLat);
            const lngMax = Math.min(lngMin + cellLng, maxLng);
            const centro = point([(lngMin + lngMax) / 2, (latMin + latMax) / 2]);
            if (!booleanPointInPolygon(centro, raFeature)) continue;
            if (!booleanPointInPolygon(centro, urbanFeature)) continue;
            if (estaDentroDaMalhaRural(centro)) continue;
            celulas.push({ latMin, latMax, lngMin, lngMax });
        }
    }
    return celulas;
}

const resultados = raGeojson.features.map(raFeature => {
    const raNomeShapefile = raFeature.properties.ra_nome;
    const raNomeApp = SHAPEFILE_NAME_TO_APP[raNomeShapefile] || raNomeShapefile;
    const sigla = raSigla(raNomeApp);
    const zonaEleitoral = zonasEleitoraisDaRA(raFeature);
    const celulas = gerarCelulas(raFeature);
    return { raNomeApp, sigla, zonaEleitoral, celulas };
});

console.log('RA'.padEnd(28), 'sigla'.padEnd(6), 'zonas'.padEnd(24), 'quadrantes');
let totalQuadrantes = 0;
for (const r of resultados) {
    console.log(r.raNomeApp.padEnd(28), r.sigla.padEnd(6), (r.zonaEleitoral || '(nenhuma)').padEnd(24), r.celulas.length);
    totalQuadrantes += r.celulas.length;
}
console.log(`\nTotal: ${resultados.length} RAs, ${totalQuadrantes} quadrantes.`);

// ------------------------------------------------------------------
// Geração do SQL — um bloco DO $$ ... $$ por RA: obtém (ou cria) a
// Coordenação Regional pelo ra_nome, apaga check-ins/atribuições/
// quadrantes antigos dela (se houver) e insere a grade recém-calculada.
// Idempotente: pode rodar mais de uma vez sem duplicar nada.
// ------------------------------------------------------------------
let sql = `-- ============================================================
-- ROLLOUT_QUADRANTES_37_RAS.sql — gera/regenera os quadrantes de
-- voluntários (grade fixa 500m, recortada por RA ∩ mancha urbana ∖
-- área rural) para as 37 RAs oficiais do DF, uma Coordenação Regional
-- por RA. Gerado por scripts/gerar-rollout-quadrantes.mjs a partir de:
--   public/regioes_administrativas.geojson (limites oficiais das 37 RAs)
--   public/perimetro_urbano.geojson (mancha urbana, união de "Evolução
--     das Ocupações", GeoPortal/SEDUH)
--   public/area_rural_assentamentos.geojson (proxy de área rural —
--     Assentamentos Rurais, GeoPortal/SEDUH; a camada oficial de
--     Concessão ETR exige token e não é acessível via script)
--   public/locais_pontos.json (zona eleitoral de cada RA, por junção
--     espacial com os pontos de votação reais)
--
-- Idempotente: get-or-create por ra_nome + apaga e regenera os
-- quadrantes de cada RA (inclusive Ceilândia, cujos quadrantes de teste
-- também são regenerados com a nova máscara). Só precisa estar logado
-- no dashboard do Supabase e colar isto no SQL Editor.
-- ============================================================

`;

for (const r of resultados) {
    sql += `-- ------------------------------------------------------------\n`;
    sql += `-- ${r.raNomeApp} (${r.sigla}) — ${r.celulas.length} quadrante(s)${r.celulas.length === 0 ? ' [RA sem mancha urbana detectada — sem quadrantes]' : ''}\n`;
    sql += `-- ------------------------------------------------------------\n`;
    sql += `DO $$\nDECLARE\n    v_product_id UUID;\nBEGIN\n`;
    sql += `    SELECT id INTO v_product_id FROM public.products WHERE ra_nome = '${sqlEscape(r.raNomeApp)}' LIMIT 1;\n`;
    sql += `    IF v_product_id IS NULL THEN\n`;
    sql += `        INSERT INTO public.products (nome, ra_nome, zona_eleitoral)\n`;
    sql += `            VALUES ('Coordenação Regional — ${sqlEscape(r.raNomeApp)}', '${sqlEscape(r.raNomeApp)}', ${r.zonaEleitoral ? `'${sqlEscape(r.zonaEleitoral)}'` : 'NULL'})\n`;
    sql += `            RETURNING id INTO v_product_id;\n`;
    sql += `    END IF;\n\n`;
    sql += `    DELETE FROM public.checkins WHERE area_id IN (SELECT id FROM public.areas WHERE product_id = v_product_id);\n`;
    sql += `    DELETE FROM public.area_volunteers WHERE area_id IN (SELECT id FROM public.areas WHERE product_id = v_product_id);\n`;
    sql += `    DELETE FROM public.areas WHERE product_id = v_product_id;\n`;

    if (r.celulas.length) {
        sql += `\n    INSERT INTO public.areas (codigo, nome, product_id, ra_nome, zona_eleitoral, lat_min, lat_max, lng_min, lng_max) VALUES\n`;
        const linhas = r.celulas.map((cel, i) => {
            const n = i + 1;
            const codigo = `${r.sigla}-${String(n).padStart(2, '0')}`;
            return `        ('${sqlEscape(codigo)}', 'Quadrante ${n}', v_product_id, '${sqlEscape(r.raNomeApp)}', ${r.zonaEleitoral ? `'${sqlEscape(r.zonaEleitoral)}'` : 'NULL'}, ${sqlNum(cel.latMin)}, ${sqlNum(cel.latMax)}, ${sqlNum(cel.lngMin)}, ${sqlNum(cel.lngMax)})`;
        });
        sql += linhas.join(',\n') + ';\n';
    }

    sql += `END $$;\n\n`;
}

const OUT = new URL('../ROLLOUT_QUADRANTES_37_RAS.sql', import.meta.url);
writeFileSync(OUT, sql);
console.log(`\nGravado ${OUT.pathname} (${(sql.length / 1024).toFixed(0)} KB).`);
