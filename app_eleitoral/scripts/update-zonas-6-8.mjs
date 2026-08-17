// Aplica as coordenadas verificadas das Zonas Eleitorais 6 (Planaltina/Arapoanga) e
// 8 (Ceilândia) — planilha fornecida pelo usuário (area_6_e_8_plus_codes.csv),
// pesquisada em fontes oficiais (escolasnobrasil.com, infoschools.net) e já
// convertida em Plus Codes, com STATUS_VALIDACAO/OBS_GEOCODIFICACAO por linha.
// "Correspondência direta" -> confiança alta; "Correspondência com ressalva"
// (endereço histórico, coordenada de cadastro alternativo, lat/lng corrigidos etc.)
// -> confiança média. Nomes se repetem dentro da mesma zona (entradas duplicadas
// herdadas do KML original) — a atualização é aplicada a TODAS as ocorrências.
import { readFileSync, writeFileSync } from 'fs';

const PATH = new URL('../public/locais_pontos.json', import.meta.url);

// name -> { lat, lng, plus_code, confianca }
const updatesZona6 = {
    'CAIC ASSIS CHATEAUBRIAND': { lat: -15.618146, lng: -47.6421751, plus_code: '58PJ99J5+P4', confianca: 'alta' },
    'CENTRO DE ENSINO ESPECIAL 01': { lat: -15.6197503, lng: -47.6538433, plus_code: '58PJ98JW+3F', confianca: 'alta' },
    'CENTRO DE ENSINO FUNDAMENTAL 01': { lat: -15.622871, lng: -47.6540972, plus_code: '58PJ98GW+V9', confianca: 'alta' },
    'CENTRO DE ENSINO FUNDAMENTAL 02': { lat: -15.6222356, lng: -47.656871, plus_code: '58PJ98HV+47', confianca: 'alta' },
    'CENTRO DE ENSINO FUNDAMENTAL 02 DO ARAPOANGA': { lat: -15.6363234, lng: -47.6328923, plus_code: '58PJ9978+FR', confianca: 'alta' },
    'CENTRO DE ENSINO FUNDAMENTAL 03': { lat: -15.6160251, lng: -47.6405067, plus_code: '58PJ99M5+HQ', confianca: 'alta' },
    'CENTRO DE ENSINO FUNDAMENTAL 04': { lat: -15.6221644, lng: -47.6518191, plus_code: '58PJ98HX+47', confianca: 'alta' },
    'CENTRO DE ENSINO FUNDAMENTAL 04 (CCMDF)': { lat: -15.6221644, lng: -47.6518191, plus_code: '58PJ98HX+47', confianca: 'alta' },
    'CENTRO DE ENSINO FUNDAMENTAL 08 DE PLANALTINA': { lat: -15.62129534, lng: -47.64563383, plus_code: '58PJ99H3+FP', confianca: 'alta' },
    'CENTRO DE ENSINO FUNDAMENTAL ARAPOANGA': { lat: -15.6405966, lng: -47.6405193, plus_code: '58PJ9955+QQ', confianca: 'alta' },
    'CENTRO DE ENSINO FUNDAMENTAL JK': { lat: -15.6011617, lng: -47.6880214, plus_code: '58PJ98X6+GQ', confianca: 'alta' },
    'CENTRO DE ENSINO FUNDAMENTAL NOSSA SENHORA DE FÁTIMA': { lat: -15.6032041, lng: -47.6579028, plus_code: '58PJ98WR+PR', confianca: 'alta' },
    'CENTRO DE ENSINO FUNDAMENTAL PIPIRIPAU II': { lat: -15.53492859, lng: -47.51211004, plus_code: '58PJFF8Q+25', confianca: 'media' },
    'CENTRO DE ENSINO FUNDAMENTAL RIO PRETO': { lat: -15.7632847, lng: -47.4929167, plus_code: '58PJ6GP4+MR', confianca: 'alta' },
    'CENTRO DE ENSINO FUNDAMENTAL SÃO JOSÉ': { lat: -15.7038426, lng: -47.37368365, plus_code: '58PJ7JWG+FG', confianca: 'alta' },
    'CENTRO DE ENSINO MÉDIO 02': { lat: -15.6217302, lng: -47.6536294, plus_code: '58PJ98HW+8G', confianca: 'alta' },
    'CENTRO EDUCACIONAL 03': { lat: -15.6032036, lng: -47.6500175, plus_code: '58PJ98WX+PX', confianca: 'alta' },
    'CENTRO EDUCACIONAL DELTA': { lat: -15.6135148, lng: -47.6458792, plus_code: '58PJ99P3+HJ', confianca: 'alta' },
    'CENTRO EDUCACIONAL DONA AMÉRICA GUIMARÃES': { lat: -15.6403607, lng: -47.6291661, plus_code: '58PJ995C+V8', confianca: 'alta' },
    'CENTRO EDUCACIONAL ESTÂNCIA III - CCMDF': { lat: -15.6176156, lng: -47.6866518, plus_code: '58PJ98J7+X8', confianca: 'alta' },
    'CENTRO EDUCACIONAL OSORIO BACCHIN': { lat: -15.5268781, lng: -47.6303952, plus_code: '58PJF9F9+6R', confianca: 'alta' },
    'CENTRO EDUCACIONAL POMPILIO MARQUES DE SOUZA': { lat: -15.5989796, lng: -47.6828607, plus_code: '58PJC828+CV', confianca: 'alta' },
    'CENTRO EDUCACIONAL STELLA DOS CHERUBINS GUIMARÃES TROIS': { lat: -15.63040708, lng: -47.65975835, plus_code: '58PJ989R+R3', confianca: 'alta' },
    'CENTRO EDUCACIONAL TAQUARA': { lat: -15.6337783, lng: -47.5222325, plus_code: '58PJ9F8H+F4', confianca: 'alta' },
    'CENTRO EDUCACIONAL VALE DO AMANHECER': { lat: -15.679885, lng: -47.6566495, plus_code: '58PJ88CV+28', confianca: 'alta' },
    'CENTRO EDUCACIONAL VARZEAS': { lat: -15.82102928, lng: -47.57049811, plus_code: '58PJ5CHH+HR', confianca: 'alta' },
    'ESCOLA CLASSE 01': { lat: -15.6259391, lng: -47.6549726, plus_code: '58PJ98FW+J2', confianca: 'alta' },
    'ESCOLA CLASSE 01 DO ARAPOANGA': { lat: -15.6397341, lng: -47.6359024, plus_code: '58PJ9967+4J', confianca: 'alta' },
    'ESCOLA CLASSE 03': { lat: -15.6150309, lng: -47.6462072, plus_code: '58PJ99M3+XG', confianca: 'alta' },
    'ESCOLA CLASSE 04': { lat: -15.621035, lng: -47.646526, plus_code: '58PJ99H3+H9', confianca: 'alta' },
    'ESCOLA CLASSE 05': { lat: -15.63146653, lng: -47.65437177, plus_code: '58PJ989W+C7', confianca: 'alta' },
    'ESCOLA CLASSE 06': { lat: -15.6274384, lng: -47.6468212, plus_code: '58PJ99F3+27', confianca: 'alta' },
    'ESCOLA CLASSE 07': { lat: -15.641802, lng: -47.6636745, plus_code: '58PJ985P+7G', confianca: 'alta' },
    'ESCOLA CLASSE 09': { lat: -15.6105075, lng: -47.6450261, plus_code: '58PJ99Q3+QX', confianca: 'alta' },
    'ESCOLA CLASSE 11': { lat: -15.60322617, lng: -47.64635273, plus_code: '58PJ99W3+PF', confianca: 'media' },
    'ESCOLA CLASSE 13': { lat: -15.6036889, lng: -47.6422817, plus_code: '58PJ99W5+G3', confianca: 'alta' },
    'ESCOLA CLASSE 14': { lat: -15.613655, lng: -47.63229, plus_code: '58PJ99P9+G3', confianca: 'alta' },
    'ESCOLA CLASSE 15': { lat: -15.6186182, lng: -47.685362, plus_code: '58PJ98J7+HV', confianca: 'media' },
    'ESCOLA CLASSE 16': { lat: -15.6198422, lng: -47.6813184, plus_code: '58PJ98J9+3F', confianca: 'alta' },
    'ESCOLA CLASSE ALTAMIR': { lat: -15.6331879, lng: -47.6811619, plus_code: '58PJ9889+PG', confianca: 'alta' },
    'ESCOLA CLASSE APRODARMAS': { lat: -15.6642033, lng: -47.657439, plus_code: '58PJ88PV+82', confianca: 'alta' },
    'ESCOLA CLASSE ESTÂNCIA': { lat: -15.6058471, lng: -47.6700486, plus_code: '58PJ98VH+MX', confianca: 'alta' },
    'ESCOLA CLASSE ETA 44': { lat: -15.5928328, lng: -47.7297677, plus_code: '58PJC74C+V3', confianca: 'alta' },
    "ESCOLA CLASSE MESTRE D'ARMAS": { lat: -15.6724033, lng: -47.6466214, plus_code: '58PJ89H3+29', confianca: 'alta' },
    'ESCOLA CLASSE MONJOLO': { lat: -15.5378285, lng: -47.6862185, plus_code: '58PJF867+VG', confianca: 'alta' },
    'ESCOLA CLASSE PARANA': { lat: -15.6151548, lng: -47.6454829, plus_code: '58PJ99M3+WR', confianca: 'alta' },
    'ESCOLA CLASSE RAJADINHA': { lat: -15.6412941, lng: -47.6387692, plus_code: '58PJ9956+FF', confianca: 'alta' },
    'ESCOLA CLASSE SANTOS DUMONT': { lat: -15.7929555, lng: -47.6404916, plus_code: '58PJ6945+RR', confianca: 'media' },
    'ESCOLA CLASSE VALE DO SOL': { lat: -15.6543435, lng: -47.6512757, plus_code: '58PJ88WX+7F', confianca: 'alta' },
    'ESCOLA TÉCNICA DE SAÚDE DE PLANALTINA': { lat: -15.6249998, lng: -47.6546156, plus_code: '58PJ98GW+25', confianca: 'media' }
};

const updatesZona8 = {
    'CENTRO DE ENSINO 10': { lat: -15.8053003, lng: -48.124978, plus_code: '58PH5VVG+V2', confianca: 'alta' },
    'CENTRO DE ENSINO 16': { lat: -15.80319282, lng: -48.10868446, plus_code: '58PH5VWR+PG', confianca: 'alta' },
    'CENTRO DE ENSINO 20': { lat: -15.8014028, lng: -48.1163932, plus_code: '58PH5VXM+CC', confianca: 'alta' },
    'CENTRO DE ENSINO 23-(CENTRO EDUCACIONAL 11)': { lat: -15.8229, lng: -48.12534333, plus_code: '58PH5VGF+RV', confianca: 'media' },
    'CENTRO DE ENSINO FUNDAMENTAL 02': { lat: -15.8210584, lng: -48.1047487, plus_code: '58PH5VHW+H4', confianca: 'alta' },
    'CENTRO DE ENSINO FUNDAMENTAL 04': { lat: -15.82855043, lng: -48.09460129, plus_code: '58PH5WC4+H5', confianca: 'alta' },
    'CENTRO DE ENSINO FUNDAMENTAL 07': { lat: -15.8305753, lng: -48.0995371, plus_code: '58PH5W92+Q5', confianca: 'alta' },
    'CENTRO DE ENSINO MARIA DO ROSARIO G.SILVA': { lat: -15.81004903, lng: -48.12210102, plus_code: '58PH5VQH+X5', confianca: 'alta' },
    'CENTRO DE ENSINO MEDIO 03': { lat: -15.8264073, lng: -48.0986998, plus_code: '58PH5WF2+CG', confianca: 'alta' },
    'CENTRO EDUCACIONAL 02': { lat: -15.8074959, lng: -48.1090515, plus_code: '58PH5VVR+29', confianca: 'media' },
    'CENTRO EDUCACIONAL 05-(CEF 25)': { lat: -15.8149906, lng: -48.128232, plus_code: '58PH5VPC+2P', confianca: 'alta' },
    'CENTRO EDUCACIONAL 07': { lat: -15.8122191, lng: -48.1183118, plus_code: '58PH5VQJ+4M', confianca: 'alta' },
    'ESCOLA CLASSE 01': { lat: -15.8336116, lng: -48.0919606, plus_code: '58PH5W85+H6', confianca: 'alta' },
    'ESCOLA CLASSE 02': { lat: -15.82314407, lng: -48.09589458, plus_code: '58PH5WG3+PJ', confianca: 'alta' },
    'ESCOLA CLASSE 03': { lat: -15.8120955, lng: -48.10158628, plus_code: '58PH5VQX+59', confianca: 'alta' },
    'ESCOLA CLASSE 06': { lat: -15.8108333, lng: -48.1105948, plus_code: '58PH5VQQ+MQ', confianca: 'alta' },
    'ESCOLA CLASSE 07 ( CEF 35 )': { lat: -15.8178683, lng: -48.1121325, plus_code: '58PH5VJQ+V4', confianca: 'media' },
    'ESCOLA CLASSE 08': { lat: -15.808091, lng: -48.1173543, plus_code: '58PH5VRM+Q3', confianca: 'alta' },
    'ESCOLA CLASSE 10': { lat: -15.8155416, lng: -48.10768029, plus_code: '58PH5VMR+QW', confianca: 'alta' },
    'ESCOLA CLASSE 11': { lat: -15.80586113, lng: -48.11301884, plus_code: '58PH5VVP+MQ', confianca: 'alta' },
    'ESCOLA CLASSE 12': { lat: -15.8075535, lng: -48.1053208, plus_code: '58PH5VRV+XV', confianca: 'alta' },
    'ESCOLA CLASSE 13': { lat: -15.7983535, lng: -48.1117514, plus_code: '58PH6V2Q+M7', confianca: 'alta' },
    'ESCOLA CLASSE 15': { lat: -15.8375246, lng: -48.10028606, plus_code: '58PH5V6X+XV', confianca: 'alta' },
    'ESCOLA CLASSE 18': { lat: -15.8259826, lng: -48.1023253, plus_code: '58PH5VFX+J3', confianca: 'alta' },
    'ESCOLA CLASSE 19': { lat: -15.8356934, lng: -48.096939, plus_code: '58PH5W73+P6', confianca: 'alta' },
    'ESCOLA CLASSE 20': { lat: -15.8231534, lng: -48.1092267, plus_code: '58PH5VGR+P8', confianca: 'alta' },
    'ESCOLA CLASSE 21': { lat: -15.8276187, lng: -48.1056563, plus_code: '58PH5VCV+XP', confianca: 'alta' },
    'ESCOLA CLASSE 22': { lat: -15.8329135, lng: -48.1038561, plus_code: '58PH5V8W+RF', confianca: 'alta' },
    'ESCOLA CLASSE 26': { lat: -15.81272, lng: -48.11422, plus_code: '58PH5VPP+W8', confianca: 'alta' },
    'ESCOLA CLASSE 27': { lat: -15.8030239, lng: -48.1199917, plus_code: '58PH5VWJ+Q2', confianca: 'alta' },
    'ESCOLA CLASSE 28': { lat: -15.8205575, lng: -48.1181874, plus_code: '58PH5VHJ+QP', confianca: 'alta' },
    'ESCOLA CLASSE 29': { lat: -15.81559, lng: -48.12074, plus_code: '58PH5VMH+QP', confianca: 'alta' },
    'ESCOLA CLASSE 35': { lat: -15.8126078, lng: -48.1289459, plus_code: '58PH5VPC+XC', confianca: 'alta' },
    'ESCOLA CLASSE 36': { lat: -15.81719861, lng: -48.12707934, plus_code: '58PH5VMF+45', confianca: 'media' },
    'ESCOLA CLASSE 39': { lat: -15.8141074, lng: -48.133196, plus_code: '58PH5VP8+9P', confianca: 'alta' },
    'ESCOLA CLASSE 40': { lat: -15.8187995, lng: -48.1308487, plus_code: '58PH5VJ9+FM', confianca: 'alta' },
    'ESCOLA NORMAL DE CEILANDIA': { lat: -15.8181837, lng: -48.0989074, plus_code: '58PH5WJ2+PC', confianca: 'media' },
    'INSTITUTO DE ENSINO SUPERIOR DE BRASÃLIA-IESB': { lat: -15.80984862, lng: -48.12562023, plus_code: '58PH5VRF+3Q', confianca: 'media' },
    'INSTITUTO DE ENSINO SUPERIOR DE BRASÍLIA-IESB': { lat: -15.80984862, lng: -48.12562023, plus_code: '58PH5VRF+3Q', confianca: 'media' }
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

applyZone('6', updatesZona6, data);
applyZone('8', updatesZona8, data);

writeFileSync(PATH, JSON.stringify(data, null, 2), 'utf-8');
