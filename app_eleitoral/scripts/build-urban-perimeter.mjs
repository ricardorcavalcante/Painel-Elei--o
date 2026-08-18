// Gera a "mancha urbana" do DF a partir da camada pública "Evolução das
// Ocupações" (GeoPortal/SEDUH, sem necessidade de token) — usada para
// recortar a grade de quadrantes de voluntários só sobre área urbana,
// excluindo o restante rural da RA. Fonte: ArcGIS REST FeatureServer,
// camada 13 do serviço CONTROLE_URBANO. Une todos os polígonos (um por
// ano de ocupação, 1960-2019) num único (Multi)Polygon com @turf/union,
// simplifica com a mesma tolerância usada em convert-ra-shapefile.mjs, e
// grava scripts/data/perimetro_urbano.geojson (fonte intermediária, com
// propriedades originais) e public/perimetro_urbano.geojson (versão
// publicada, só com a geometria final).
import { writeFileSync, mkdirSync } from 'fs';
import { union } from '@turf/union';
import simplify from '@turf/simplify';

const SERVICE_URL = 'https://www.geoservicos.ide.df.gov.br/arcgis/rest/services/Publico/CONTROLE_URBANO/MapServer/13/query';
const PAGE_SIZE = 20;

const RAW_OUT = new URL('./data/perimetro_urbano.geojson', import.meta.url);
const OUT = new URL('../public/perimetro_urbano.geojson', import.meta.url);

async function fetchAllFeatures() {
    const features = [];
    let offset = 0;
    while (true) {
        const params = new URLSearchParams({
            where: '1=1',
            outFields: 'objectid,ano,area_km2',
            returnGeometry: 'true',
            resultOffset: String(offset),
            resultRecordCount: String(PAGE_SIZE),
            f: 'geojson'
        });
        const res = await fetch(`${SERVICE_URL}?${params}`);
        if (!res.ok) throw new Error(`Falha na busca (offset ${offset}): HTTP ${res.status}`);
        const fc = await res.json();
        if (fc.error) throw new Error(`Erro da API ArcGIS (offset ${offset}): ${JSON.stringify(fc.error)}`);
        const batch = fc.features || [];
        features.push(...batch);
        if (batch.length < PAGE_SIZE) break;
        offset += PAGE_SIZE;
    }
    return features;
}

mkdirSync(new URL('./data', import.meta.url), { recursive: true });

const features = await fetchAllFeatures();
console.log(`Buscadas ${features.length} feições de "Evolução das Ocupações".`);

const rawFc = { type: 'FeatureCollection', features };
writeFileSync(RAW_OUT, JSON.stringify(rawFc));
console.log(`Gravado ${RAW_OUT.pathname} (fonte intermediária, com propriedades originais).`);

// Só Polygon/MultiPolygon entram na união (descarta feições sem geometria válida).
const polygonFeatures = features.filter(f => f.geometry && (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon'));
if (polygonFeatures.length < 2) throw new Error(`Só ${polygonFeatures.length} polígono(s) válido(s) — não dá pra unir.`);

const unioned = union({ type: 'FeatureCollection', features: polygonFeatures });
if (!unioned) throw new Error('União retornou vazio — confira as geometrias de origem.');

const simplified = simplify(unioned, { tolerance: 0.0006, highQuality: true });

const out = {
    type: 'FeatureCollection',
    features: [{ type: 'Feature', properties: { nome: 'Mancha Urbana DF (Evolução das Ocupações, unido)' }, geometry: simplified.geometry }]
};

writeFileSync(OUT, JSON.stringify(out));
const rings = out.features[0].geometry.type === 'Polygon' ? out.features[0].geometry.coordinates : out.features[0].geometry.coordinates.flat();
const totalPoints = rings.reduce((s, r) => s + r.length, 0);
console.log(`Gravado ${OUT.pathname} com 1 feição (${out.features[0].geometry.type}) e ${totalPoints} pontos.`);
