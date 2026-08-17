// Gera public/regioes_administrativas.geojson — uma camada com o contorno de CADA
// Região Administrativa individualmente (sem duplicar por zona, ao contrário de
// public/zonas_shapefile.json), usada pela nova aba "RAs" para exibir apenas o
// contorno da RA selecionada. Fonte: scripts/data/regioes_administrativas.geojson
// (gerado por convert-ra-shapefile.mjs).
import { readFileSync, writeFileSync } from 'fs';

const SRC = new URL('./data/regioes_administrativas.geojson', import.meta.url);
const OUT = new URL('../public/regioes_administrativas.geojson', import.meta.url);

const raGeojson = JSON.parse(readFileSync(SRC, 'utf-8'));

const out = {
    type: 'FeatureCollection',
    features: raGeojson.features.map(f => ({
        type: 'Feature',
        properties: { ra_nome: f.properties.ra_nome },
        geometry: f.geometry
    }))
};

writeFileSync(OUT, JSON.stringify(out));
console.log(`Gravado ${OUT.pathname} com ${out.features.length} RAs.`);
