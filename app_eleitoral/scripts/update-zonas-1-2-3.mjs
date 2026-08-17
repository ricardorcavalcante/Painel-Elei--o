// Aplica as coordenadas verificadas das Zonas Eleitorais 1 (Plano Piloto/Asa Sul),
// 2 (Paranoá/Varjão/Itapoã/Lago Norte, incl. Granja do Torto) e 3 (Taguatinga Norte,
// listada com RA "CEILÂNDIA" no CSV de origem — mesma situação administrativa já
// vista em zonas anteriores) — planilhas fornecidas pelo usuário
// (area_1_plus_codes.csv, area_3_e_2_plus_codes.csv), com coordenadas/Plus Codes de
// base geoespacial oficial (catalogo.ipe.df.gov.br) e STATUS_GEOCODIFICACAO por
// linha. "CONFIRMADO" -> confiança alta; "CORRESPONDENCIA"/"REVISAR" (nome
// genérico/histórico, sub-região a conferir, coordenada aproximada por proximidade)
// -> confiança média.
import { readFileSync, writeFileSync } from 'fs';

const PATH = new URL('../public/locais_pontos.json', import.meta.url);

// name -> { lat, lng, plus_code, confianca }
const updatesZona1 = {
    'CEM ELEFANTE BRANCO SGAS 708/908': { lat: -15.80806177, lng: -47.90944752, plus_code: '58PJ53RR+Q6', confianca: 'media' },
    'CEM SETOR LESTE SGAS 611/612': { lat: -15.83104172, lng: -47.90706032, plus_code: '58PJ539V+H5', confianca: 'alta' },
    'CENTRO DE ENSINO FUNDAMENTAL 01 (ANTIGO CENTRO EDUCACIONAL)': { lat: -15.81291456, lng: -47.89754313, plus_code: '58PJ54P2+RX', confianca: 'media' },
    'CENTRO DE ENSINO FUNDAMENTAL 01 DE BRASILIA SQS 106': { lat: -15.81291456, lng: -47.89754313, plus_code: '58PJ54P2+RX', confianca: 'alta' },
    'CENTRO DE ENSINO FUNDAMENTAL 03 DE BRASILIA SQS 103': { lat: -15.80536717, lng: -47.89145584, plus_code: '58PJ54V5+VC', confianca: 'alta' },
    'CENTRO DE ENSINO FUNDAMENTAL 05 DE BRASILIA SQS 408': { lat: -15.82309473, lng: -47.89995055, plus_code: '58PJ54G2+Q2', confianca: 'alta' },
    'CENTRO DE ENSINO FUNDAMENTAL 214 SUL': { lat: -15.83238348, lng: -47.91799441, plus_code: '58PJ539J+2R', confianca: 'alta' },
    'CENTRO DE ENSINO FUNDAMENTAL 405 SUL': { lat: -15.81635013, lng: -47.89236807, plus_code: '58PJ54M5+F3', confianca: 'alta' },
    'CENTRO EDUCACIONAL LA SALLE': { lat: -15.8072318, lng: -47.9056406, plus_code: '58PJ53VV+4P', confianca: 'media' },
    'CENTRO EDUCACIONAL LA SALLE SGAS 906': { lat: -15.8072318, lng: -47.9056406, plus_code: '58PJ53VV+4P', confianca: 'alta' },
    'CESAS - CEJA ASA SUL C.E.S.A.S. SGAS 602': { lat: -15.80989799, lng: -47.88219827, plus_code: '58PJ54R9+24', confianca: 'alta' },
    'CIL - CENTRO INTERESCOLAR DE LÍNGUAS SGAS 907/908': { lat: -15.80814948, lng: -47.90885434, plus_code: '58PJ53RR+PF', confianca: 'alta' },
    'COLEGIO COR JESU SGAS 615': { lat: -15.83852, lng: -47.91791, plus_code: '58PJ536J+HR', confianca: 'alta' },
    'COLEGIO MARISTA DE BRASILIA SGAS 609': { lat: -15.8259065, lng: -47.900008, plus_code: '58PJ53FX+JX', confianca: 'alta' },
    'COLEGIO MARISTA ENSINO MÉDIO SGAS 615': { lat: -15.8370045, lng: -47.91664499, plus_code: '58PJ537M+58', confianca: 'alta' },
    'COLÉGIO ÚNICO 606 SUL': { lat: -15.8201452, lng: -47.8925427, plus_code: '58PJ54H4+WX', confianca: 'alta' },
    'ESCOLA CLASSE 102 SUL': { lat: -15.8029629, lng: -47.8905611, plus_code: '58PJ54W5+RQ', confianca: 'alta' },
    'ESCOLA CLASSE 206 SUL': { lat: -15.8163291, lng: -47.8965918, plus_code: '58PJ54M3+F9', confianca: 'alta' },
    'ESCOLA CLASSE 209 SUL': { lat: -15.8215785, lng: -47.9030536, plus_code: '58PJ53HW+9Q', confianca: 'alta' },
    'ESCOLA CLASSE 305 SUL': { lat: -15.80777933, lng: -47.89852923, plus_code: '58PJ54R2+VH', confianca: 'alta' },
    'ESCOLA CLASSE 316 SUL': { lat: -15.8304045, lng: -47.9271476, plus_code: '58PJ539F+R4', confianca: 'alta' },
    'ESCOLA CLASSE 413 SUL': { lat: -15.8313284, lng: -47.9129472, plus_code: '58PJ539P+FR', confianca: 'alta' },
    'ESCOLA CLASSE 416 SUL': { lat: -15.83765734, lng: -47.92178149, plus_code: '58PJ536H+W7', confianca: 'alta' },
    'ESCOLA PARQUE 313/314 SUL': { lat: -15.83704389, lng: -47.9325664, plus_code: '58PJ5378+5X', confianca: 'alta' },
    'ESCOLA SALESIANA BRASÍLIA': { lat: -15.7996488, lng: -47.8960322, plus_code: '58PJ6423+4H', confianca: 'alta' },
    'UDF SEPS 704/904': { lat: -15.80262, lng: -47.89937, plus_code: '58PJ54W2+X7', confianca: 'media' },
    'UNIP - UNIVERSIDADE PAULISTA SGAS 913': { lat: -15.818, lng: -47.9224, plus_code: '58PJ53JH+R2', confianca: 'alta' },
    'UPIS - UNIAO PIONEIRA DE INTEGRACAO SOCIAL SEPS 712/912': { lat: -15.8177, lng: -47.9196, plus_code: '58PJ53JJ+W5', confianca: 'alta' }
};

const updatesZona2 = {
    'CAIC SANTA PAULINA': { lat: -15.77822092, lng: -47.78460615, plus_code: '58PJ66C8+P5', confianca: 'media' },
    'CENTRO DE ENSINO FUNDAMENTAL 01 DO LAGO NORTE': { lat: -15.73341909, lng: -47.87324163, plus_code: '58PJ748G+JP', confianca: 'alta' },
    'CENTRO DE ENSINO FUNDAMENTAL 01 DO VARJAO': { lat: -15.7092064, lng: -47.8783231, plus_code: '58PJ74RC+8M', confianca: 'alta' },
    'CENTRO DE ENSINO FUNDAMENTAL 02 DO PARANOA': { lat: -15.78313296, lng: -47.77959438, plus_code: '58PJ668C+P5', confianca: 'alta' },
    'CENTRO DE ENSINO FUNDAMENTAL DRA. ZILDA ARNS': { lat: -15.73906901, lng: -47.76206784, plus_code: '58PJ766Q+95', confianca: 'alta' },
    'CENTRO DE ENSINO MÉDIO 01 DO PARANOA': { lat: -15.78294982, lng: -47.77896032, plus_code: '58PJ668C+RC', confianca: 'alta' },
    'CENTRO EDUCACIONAL 03 DO PARANOA (ANTIGO CEF 1)': { lat: -15.7648252, lng: -47.779366, plus_code: '58PJ66PC+37', confianca: 'media' },
    'CENTRO EDUCACIONAL DARCY RIBEIRO': { lat: -15.76275737, lng: -47.78319218, plus_code: '58PJ66P8+VP', confianca: 'alta' },
    'CENTRO EDUCACIONAL DO LAGO NORTE': { lat: -15.7182377, lng: -47.87975165, plus_code: '58PJ74JC+P3', confianca: 'alta' },
    'CENTRO EDUCACIONAL SANTA CARMEN SALLES': { lat: -15.7685552, lng: -47.7847832, plus_code: '58PJ66J8+H3', confianca: 'alta' },
    'CENTRO SOCIAL JOÃO PAULO II': { lat: -15.77982, lng: -47.7846, plus_code: '58PJ66C8+35', confianca: 'media' },
    'CEP - ESCOLA TÉCNICA LESTE SÉRGIO DAMACENO': { lat: -15.78103, lng: -47.78512, plus_code: '58PJ6697+HX', confianca: 'media' },
    'COLEGIO COC LAGO NORTE': { lat: -15.7457308, lng: -47.8412808, plus_code: '58PJ7535+PF', confianca: 'alta' },
    'COLEGIO INDI BIBIA': { lat: -15.7293099, lng: -47.8627706, plus_code: '58PJ74CP+7V', confianca: 'media' },
    'COLÉGIO BARÃO DO RIO BRANCO': { lat: -15.75145992, lng: -47.76044799, plus_code: '58PJ66XQ+CR', confianca: 'alta' },
    'COLÉGIO DO SOL': { lat: -15.71476, lng: -47.88177, plus_code: '58PJ74P9+37', confianca: 'alta' },
    'ESCOLA CLASSE 01 DO ITAPOÃ': { lat: -15.7451952, lng: -47.7695749, plus_code: '58PJ763J+W5', confianca: 'alta' },
    'ESCOLA CLASSE 01 DO PARANOA': { lat: -15.76495341, lng: -47.77866749, plus_code: '58PJ66PC+2G', confianca: 'alta' },
    'ESCOLA CLASSE 02 DO ITAPOÃ': { lat: -15.73982632, lng: -47.76340301, plus_code: '58PJ766P+3J', confianca: 'alta' },
    'ESCOLA CLASSE 02 DO PARANOA': { lat: -15.76368893, lng: -47.77817956, plus_code: '58PJ66PC+GP', confianca: 'alta' },
    'ESCOLA CLASSE 03 DO PARANOA': { lat: -15.7731233, lng: -47.7808808, plus_code: '58PJ66G9+QJ', confianca: 'alta' },
    'ESCOLA CLASSE 04 DO PARANOA': { lat: -15.77324024, lng: -47.77681228, plus_code: '58PJ66GF+P7', confianca: 'alta' },
    'ESCOLA CLASSE 05 DO PARANOA': { lat: -15.7667546, lng: -47.77655238, plus_code: '58PJ66MF+79', confianca: 'alta' },
    'ESCOLA CLASSE 06 DO PARANOA': { lat: -15.757743, lng: -47.7832287, plus_code: '58PJ66R8+WP', confianca: 'alta' },
    'ESCOLA CLASSE ALTO INTERLAGOS': { lat: -15.82661196, lng: -47.74397512, plus_code: '58PJ57F4+9C', confianca: 'alta' },
    'ESCOLA CLASSE CORA CORALINA': { lat: -15.7291325, lng: -47.7495955, plus_code: '58PJ77C2+85', confianca: 'alta' },
    'ESCOLA CLASSE GRANJA DO TORTO': { lat: -15.7052429, lng: -47.9117538, plus_code: '58PJ73VQ+W7', confianca: 'alta' },
    "ESCOLA CLASSE OLHOS D'ÁGUA": { lat: -15.69313868, lng: -47.86405042, plus_code: '58PJ844P+P9', confianca: 'alta' },
    'ESCOLA CLASSE SOBRADINHO DOS MELOS': { lat: -15.796978, lng: -47.6940138, plus_code: '58PJ6834+69', confianca: 'alta' },
    'UNIVERSIDADE DO DISTRITO FEDERAL PROFESSOR JORGE AMAURY MAIA NUNES': { lat: -15.71093, lng: -47.91048, plus_code: '58PJ73QQ+JR', confianca: 'media' }
};

const updatesZona3 = {
    'CENTRO DE EDUCAÇÃO INFANTIL 03': { lat: -15.8068026, lng: -48.0980797, plus_code: '58PH5WV2+7Q', confianca: 'media' },
    'CENTRO DE EDUCAÇÃO INFANTIL 05': { lat: -15.8155134, lng: -48.0814583, plus_code: '58PH5WM9+QC', confianca: 'media' },
    'CENTRO DE EDUCAÇÃO INFANTIL 06': { lat: -15.8196504, lng: -48.0894056, plus_code: '58PH5WJ6+46', confianca: 'media' },
    'CENTRO DE ENSINO FUNDAMENTAL 04': { lat: -15.82862663, lng: -48.09455768, plus_code: '58PH5WC4+G5', confianca: 'media' },
    'CENTRO DE ENSINO FUNDAMENTAL 16': { lat: -15.80311308, lng: -48.10885491, plus_code: '58PH5VWR+QF', confianca: 'alta' },
    'CENTRO DE ENSINO FUNDAMENTAL 17': { lat: -15.80117312, lng: -48.13992154, plus_code: '58PH5VX6+G2', confianca: 'alta' },
    'CENTRO DE ENSINO FUNDAMENTAL 19': { lat: -15.82667507, lng: -48.11479181, plus_code: '58PH5VFP+83', confianca: 'alta' },
    'CENTRO DE ENSINO MÉDIO 05': { lat: -15.81489649, lng: -48.08769627, plus_code: '58PH5WP6+2W', confianca: 'media' },
    'ESCOLA CLASSE 41': { lat: -15.82449839, lng: -48.0874728, plus_code: '58PH5WG7+62', confianca: 'media' },
    'ESCOLA CLASSE 53': { lat: -15.831577, lng: -48.0884195, plus_code: '58PH5W96+9J', confianca: 'media' },
    'ESCOLA CLASSE 55': { lat: -15.8159096, lng: -48.0943455, plus_code: '58PH5WM4+J7', confianca: 'media' }
};

function applyZone(zoneNum, updates, data) {
    let updated = 0;
    const notFound = new Set(Object.keys(updates));
    data.forEach(p => {
        if (p.zona !== zoneNum) return;
        const u = updates[p.local];
        if (!u) return;
        p.lat = u.lat;
        p.lng = u.lng;
        p.plus_code = u.plus_code;
        p.location_type = 'MANUAL_ESCOLASNOBRASIL';
        p.confianca = u.confianca;
        notFound.delete(p.local);
        updated++;
    });
    console.log(`Pontos atualizados na Zona ${zoneNum}: ${updated}`);
    if (notFound.size > 0) {
        console.log(`Nomes da planilha sem nenhuma correspondência na Zona ${zoneNum}:`);
        notFound.forEach(n => console.log(`  - ${n}`));
    }
}

const data = JSON.parse(readFileSync(PATH, 'utf-8'));

applyZone('1', updatesZona1, data);
applyZone('2', updatesZona2, data);
applyZone('3', updatesZona3, data);

writeFileSync(PATH, JSON.stringify(data, null, 2), 'utf-8');
