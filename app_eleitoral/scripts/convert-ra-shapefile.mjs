// Converte o shapefile de Regiões Administrativas do DF (fornecido pelo usuário em
// C:\Users\hakak\OneDrive\Área de Trabalho\Painel Eleição\regioes_administrativas.*)
// de SIRGAS 2000 / UTM Zone 23S (EPSG:31983) para WGS84 (lat/lng), simplifica os
// polígonos (109k pontos originais são pesados demais para o navegador) e grava em
// scripts/data/regioes_administrativas.geojson — fonte intermediária usada por
// scripts/build-zonas-shapefile.mjs para gerar a camada real exibida no mapa
// (public/zonas_shapefile.json). Não fica em public/: só as RAs referenciadas por
// alguma zona eleitoral são publicadas, e duplicadas por zona quando necessário.
import shapefile from 'shapefile';
import proj4 from 'proj4';
import simplify from '@turf/simplify';
import { writeFileSync, mkdirSync } from 'fs';

const SRC = 'C:/Users/hakak/OneDrive/Área de Trabalho/Painel Eleição/regioes_administrativas.shp';
const DBF = 'C:/Users/hakak/OneDrive/Área de Trabalho/Painel Eleição/regioes_administrativas.dbf';
const OUT = new URL('./data/regioes_administrativas.geojson', import.meta.url);

mkdirSync(new URL('./data', import.meta.url), { recursive: true });

const SIRGAS_UTM23S = '+proj=utm +zone=23 +south +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs';
const WGS84 = 'WGS84';

function reprojectRing(ring) {
    return ring.map(([x, y]) => proj4(SIRGAS_UTM23S, WGS84, [x, y]));
}

function reprojectGeometry(geom) {
    if (geom.type === 'Polygon') {
        return { type: 'Polygon', coordinates: geom.coordinates.map(reprojectRing) };
    }
    if (geom.type === 'MultiPolygon') {
        return { type: 'MultiPolygon', coordinates: geom.coordinates.map(poly => poly.map(reprojectRing)) };
    }
    throw new Error(`Tipo de geometria não suportado: ${geom.type}`);
}

const source = await shapefile.open(SRC, DBF, { encoding: 'utf8' });
const features = [];
let result;
while (!(result = await source.read()).done) {
    const { ra_nome, ra_codigo, ra_cira, ra_areakm2 } = result.value.properties;
    const geometry = reprojectGeometry(result.value.geometry);
    features.push({
        type: 'Feature',
        properties: { ra_nome, ra_codigo, ra_cira, ra_areakm2 },
        geometry
    });
}

const fc = { type: 'FeatureCollection', features };
const simplified = simplify(fc, { tolerance: 0.0006, highQuality: true, mutate: true });

writeFileSync(OUT, JSON.stringify(simplified));

const totalPoints = simplified.features.reduce((sum, f) => {
    const rings = f.geometry.type === 'Polygon' ? f.geometry.coordinates : f.geometry.coordinates.flat();
    return sum + rings.reduce((s, r) => s + r.length, 0);
}, 0);
console.log(`Gravado ${OUT.pathname} com ${simplified.features.length} feições e ${totalPoints} pontos.`);
