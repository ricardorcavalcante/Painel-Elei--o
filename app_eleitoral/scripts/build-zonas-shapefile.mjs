// Gera public/zonas_shapefile.json — a camada de polígonos exibida no mapa (via
// map.data.addGeoJson em public/app.js) — a partir das RAs reais do DF
// (scripts/data/regioes_administrativas.geojson, gerado por convert-ra-shapefile.mjs)
// e da lista de RAs associadas a cada zona eleitoral (public/zonas_data.js).
//
// Substitui o placeholder anterior (retângulos esquemáticos) por contornos reais.
// Como uma Região Administrativa pode abranger mais de uma zona eleitoral (ex:
// CEILÂNDIA cobre as zonas 3, 8, 16 e 20 — a mesma situação administrativa já
// observada nos dados de locais de votação), o polígono da RA é replicado uma vez
// por zona que a referencia, cada cópia com sua própria cor/zona — é uma aproximação
// pela granularidade disponível (o shapefile só tem RA inteira, não a subdivisão por
// zona eleitoral).
import { readFileSync, writeFileSync } from 'fs';

const RA_GEOJSON_PATH = new URL('./data/regioes_administrativas.geojson', import.meta.url);
const OUT_PATH = new URL('../public/zonas_shapefile.json', import.meta.url);

const zoneColors = {
    "1": "#63d692", "2": "#869bf0", "3": "#c894e1", "4": "#e15eac",
    "5": "#9a7c64", "6": "#f6eda5", "8": "#f59f8a", "9": "#e47171",
    "10": "#8aaae5", "11": "#c8c1bc", "13": "#9ff1cf", "14": "#68e799",
    "15": "#e7dfcd", "16": "#66cbed", "17": "#e3d274", "18": "#7beddf",
    "19": "#cd9ce4", "20": "#ebabc8", "21": "#e5a7b6"
};

// zoneId -> nomes de RA (conforme public/zonas_shapefile de RAs reais) considerados
// naquela zona eleitoral. Baseado na lista `ras` de public/zonas_data.js.
const ZONE_TO_RA = {
    "1": ["PLANO PILOTO"],
    "2": ["PARANOÁ", "VARJÃO", "ITAPOÃ", "LAGO NORTE"],
    "3": ["TAGUATINGA"],
    "4": ["SANTA MARIA"],
    "5": ["SOBRADINHO", "SOBRADINHO II", "FERCAL"],
    "6": ["PLANALTINA", "ARAPOANGA"],
    "8": ["CEILÂNDIA"],
    "9": ["GUARÁ", "VICENTE PIRES", "SCIA"],
    "10": ["NÚCLEO BANDEIRANTE", "RIACHO FUNDO", "PARK WAY", "CANDANGOLÂNDIA"],
    "11": ["CRUZEIRO", "SUDOESTE/OCTOGONAL"],
    "13": ["SAMAMBAIA"],
    "14": ["PLANO PILOTO", "LAGO NORTE"],
    "15": ["ÁGUAS CLARAS", "ARNIQUEIRA"],
    "16": ["CEILÂNDIA", "BRAZLÂNDIA"],
    "17": ["GAMA"],
    "18": ["LAGO SUL", "JARDIM BOTÂNICO", "SÃO SEBASTIÃO"],
    "19": ["TAGUATINGA"],
    "20": ["CEILÂNDIA", "SOL NASCENTE E POR DO SOL"],
    "21": ["RECANTO DAS EMAS", "RIACHO FUNDO II"]
};

const raGeojson = JSON.parse(readFileSync(RA_GEOJSON_PATH, 'utf-8'));
const raByName = new Map(raGeojson.features.map(f => [f.properties.ra_nome, f]));

const features = [];
const notFound = new Set();

for (const [zoneId, raNames] of Object.entries(ZONE_TO_RA)) {
    for (const raName of raNames) {
        const raFeature = raByName.get(raName);
        if (!raFeature) {
            notFound.add(raName);
            continue;
        }
        features.push({
            type: 'Feature',
            properties: {
                zona: zoneId,
                nome: `Zona ${zoneId} — ${raName.charAt(0) + raName.slice(1).toLowerCase()}`,
                color: zoneColors[zoneId] || '#1F4E78'
            },
            geometry: raFeature.geometry
        });
    }
}

const out = { type: 'FeatureCollection', features };
writeFileSync(OUT_PATH, JSON.stringify(out));

console.log(`Gravado ${OUT_PATH.pathname} com ${features.length} feições (${Object.keys(ZONE_TO_RA).length} zonas).`);
if (notFound.size > 0) {
    console.log('Nomes de RA sem correspondência no shapefile:');
    notFound.forEach(n => console.log(`  - ${n}`));
}
