// ==========================================
// PARSER DO ARQUIVO KML DAS SEÇÕES ELEITORAIS
// ==========================================

async function loadKmlSecoes(locaisData) {
    try {
        const response = await fetch('kml das secoes.kml');
        if (!response.ok) throw new Error('Não foi possível carregar o arquivo KML');
        const kmlText = await response.text();

        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(kmlText, 'text/xml');
        const placemarks = xmlDoc.getElementsByTagName('Placemark');

        // Mapa auxiliar de consulta a partir do locais_votacao.json
        const lookup = {};
        if (locaisData) {
            Object.entries(locaisData).forEach(([zona, list]) => {
                list.forEach(item => {
                    const key = item.local.trim().toLowerCase();
                    lookup[key] = {
                        zona: zona,
                        secoes: item.secoes_2022 || item.secoes || 0,
                        eleitorado: item.eleitorado || 0,
                        endereco: item.endereco || '',
                        ra: item.ra || '',
                        bairro: item.bairro_2022 || ''
                    };
                });
            });
        }

        const secoesList = [];

        Array.from(placemarks).forEach(pm => {
            const nameEl = pm.getElementsByTagName('name')[0];
            if (!nameEl) return;
            const nameStr = nameEl.textContent.trim();
            if (!nameStr || nameStr.includes('Mapa sem') || nameStr.includes('.csv')) return;

            const parts = nameStr.split(';');
            const ra = (parts[0] || '').trim();
            const localName = (parts[1] || parts[0]).trim();
            const enderecoKml = (parts[4] || '').trim();

            const key = localName.toLowerCase();
            let matchedData = lookup[key];

            if (!matchedData) {
                const foundKey = Object.keys(lookup).find(k => k.includes(key) || key.includes(k));
                if (foundKey) matchedData = lookup[foundKey];
            }

            secoesList.push({
                local: localName,
                ra: ra || (matchedData ? matchedData.ra : ''),
                zona: matchedData ? matchedData.zona : 'N/A',
                secoes: matchedData ? matchedData.secoes : 0,
                eleitorado: matchedData ? matchedData.eleitorado : 0,
                endereco: enderecoKml || (matchedData ? matchedData.endereco : '')
            });
        });

        return secoesList;
    } catch (err) {
        console.warn('Erro ao processar KML das seções:', err);
        return [];
    }
}
