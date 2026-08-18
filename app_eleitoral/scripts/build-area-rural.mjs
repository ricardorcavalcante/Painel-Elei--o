// Gera a camada de área rural usada para EXCLUIR território da grade de
// quadrantes de voluntários. A camada oficial "Concessão ETR" (Terracap)
// exige token de autenticação e não é acessível via script — por decisão
// de produto, usamos como proxy a camada pública "Assentamentos Rurais"
// (GeoPortal/SEDUH, sem token), que mapeia lotes/assentamentos rurais
// reais no DF. Fonte: ArcGIS REST FeatureServer, camada 0 do serviço
// CONTROLE_RURAL. Mantém as propriedades originais (lote/tipo/assentamento)
// para facilitar depuração visual. Grava public/area_rural_assentamentos.geojson.
import { writeFileSync } from 'fs';

const SERVICE_URL = 'https://www.geoservicos.ide.df.gov.br/arcgis/rest/services/Publico/CONTROLE_RURAL/MapServer/0/query';
const PAGE_SIZE = 100;

const OUT = new URL('../public/area_rural_assentamentos.geojson', import.meta.url);

async function fetchAllFeatures() {
    const features = [];
    let offset = 0;
    while (true) {
        const params = new URLSearchParams({
            where: '1=1',
            outFields: 'objectid,lote,tipo,assentamento,area_ha',
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

const features = await fetchAllFeatures();
console.log(`Buscadas ${features.length} feições de "Assentamentos Rurais".`);

const out = {
    type: 'FeatureCollection',
    features: features.map(f => ({
        type: 'Feature',
        properties: { lote: f.properties.lote, tipo: f.properties.tipo, assentamento: f.properties.assentamento },
        geometry: f.geometry
    }))
};

writeFileSync(OUT, JSON.stringify(out));
console.log(`Gravado ${OUT.pathname} com ${out.features.length} feições.`);
