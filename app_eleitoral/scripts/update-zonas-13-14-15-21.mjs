// Aplica coordenadas verificadas das Zonas Eleitorais 13 (Samambaia), 14
// (Asa Norte), 15 (Águas Claras/Taguatinga Sul) e 21 (Recanto das
// Emas/Samambaia) — planilhas fornecidas pelo usuário. Mesmo padrão das
// zonas anteriores: atualiza TODAS as ocorrências de cada nome dentro da
// zona (dataset com entradas duplicadas herdadas do KML original).
import { readFileSync, writeFileSync } from 'fs';

const PATH = new URL('../public/locais_pontos.json', import.meta.url);

const zone14 = {
    'IFB - INSTITUTO FEDERAL DE BRASILIA': { lat: -15.75327220, lng: -47.87849500, plus_code: '58PJ64WC+MJ', confianca: 'alta' },
    'CEAN - CENTRO DE ENSINO MEDIO ASA NORTE': { lat: -15.76650570, lng: -47.87509570, plus_code: '58PJ64MF+9X', confianca: 'alta' },
    'CENTRO DE EDUCACAO INFANTIL 316 NORTE': { lat: -15.73890960, lng: -47.89661940, plus_code: '58PJ7463+C9', confianca: 'alta' },
    'CENTRO DE ENSINO FUNDAMENTAL 104 NORTE': { lat: -15.77511870, lng: -47.88371720, plus_code: '58PJ64F8+XG', confianca: 'alta' },
    'CENTRO DE ENSINO FUNDAMENTAL 410 NORTE': { lat: -15.75499250, lng: -47.88155470, plus_code: '58PJ64W9+29', confianca: 'alta' },
    'CENTRO DE ENSINO FUNDAMENTAL 7 DE BRASILIA': { lat: -15.75503360, lng: -47.89893930, plus_code: '58PJ64V2+XC', confianca: 'alta' },
    'CENTRO DE ENSINO FUNDAMENTAL GAN': { lat: -15.77606000, lng: -47.87360340, plus_code: '58PJ64FG+HH', confianca: 'alta' },
    'CENTRO DE ENSINO MEDIO PAULO FREIRE': { lat: -15.75593850, lng: -47.87832580, plus_code: '58PJ64VC+JM', confianca: 'alta' },
    'CENTRO EDUCACIONAL GISNO': { lat: -15.76926890, lng: -47.89465400, plus_code: '58PJ64J4+74', confianca: 'alta' },
    'CENTRO EDUCACIONAL LEONARDO DA VINCI': { lat: -15.74661090, lng: -47.90077470, plus_code: '58PJ733X+9M', confianca: 'alta' },
    'CENTRO EDUCACIONAL SIGMA': { lat: -15.75947696, lng: -47.89644928, plus_code: '58PJ64R3+6C', confianca: 'alta' },
    'COLEGIO MADRE CARMEN SALLES': { lat: -15.77479000, lng: -47.87344000, plus_code: '58PJ64GG+3J', confianca: 'alta' },
    'COLEGIO MARISTA JOAO PAULO II': { lat: -15.78188715, lng: -47.88839711, plus_code: '58PJ6496+6J', confianca: 'alta' },
    'COLEGIO SAGRADA FAMILIA': { lat: -15.77160667, lng: -47.89317167, plus_code: '58PJ64H4+9P', confianca: 'alta' },
    'COLEGIO SANTA DOROTEIA': { lat: -15.75742920, lng: -47.90022430, plus_code: '58PJ63VX+2W', confianca: 'alta' },
    'COLÉGIO IDEAL': { lat: -15.74206420, lng: -47.90319970, plus_code: '58PJ735W+5P', confianca: 'media' },
    'ESCOLA CLASSE 113 NORTE': { lat: -15.74735840, lng: -47.89060430, plus_code: '58PJ7435+3Q', confianca: 'alta' },
    'ESCOLA CLASSE 115 NORTE': { lat: -15.74109820, lng: -47.89279600, plus_code: '58PJ7454+HV', confianca: 'alta' },
    'ESCOLA CLASSE 304 NORTE': { lat: -15.77627940, lng: -47.88625910, plus_code: '58PJ64F7+FF', confianca: 'alta' },
    'ESCOLA CLASSE 312 NORTE': { lat: -15.75235730, lng: -47.89287580, plus_code: '58PJ64X4+3R', confianca: 'alta' },
    'ESCOLA CLASSE 403 NORTE': { lat: -15.77743940, lng: -47.87627520, plus_code: '58PJ64FF+2F', confianca: 'alta' },
    'ESCOLA CLASSE 405 NORTE': { lat: -15.77073160, lng: -47.87696030, plus_code: '58PJ64HF+P6', confianca: 'alta' },
    'ESCOLA CLASSE 407 NORTE': { lat: -15.76233238, lng: -47.87846782, plus_code: '58PJ64QC+3J', confianca: 'alta' },
    'ESCOLA CLASSE 411 NORTE': { lat: -15.75282690, lng: -47.88215890, plus_code: '58PJ64W9+V4', confianca: 'alta' },
    'ESCOLA CLASSE 415 NORTE': { lat: -15.73981800, lng: -47.88628860, plus_code: '58PJ7467+3F', confianca: 'alta' },
    'ESCOLA PARQUE 210 NORTE': { lat: -15.75425290, lng: -47.88373780, plus_code: '58PJ64W8+7G', confianca: 'alta' },
    'FUNDACAO LOGOSOFICA': { lat: -15.77660680, lng: -47.89033680, plus_code: '58PJ64F5+9V', confianca: 'alta' },
    'HEAVENLY INTERNATIONAL SCHOOL': { lat: -15.76902593, lng: -47.87415850, plus_code: '58PJ64JG+98', confianca: 'media' },
    'UNB - PAVILHAO JOAO CALMON': { lat: -15.75842000, lng: -47.87025000, plus_code: '58PJ64RH+JW', confianca: 'alta' },
    'UNICEUB': { lat: -15.76647450, lng: -47.89463330, plus_code: '58PJ64M4+C4', confianca: 'media' }
};

const zone13 = {
    'CAIC AYRTON SENNA': { lat: -15.8901, lng: -48.112064, plus_code: '58PH4V5Q+X5', confianca: 'alta' },
    'CAIC HELENA REIS': { lat: -15.877029, lng: -48.105655, plus_code: '58PH4VFV+5P', confianca: 'alta' },
    'CCI SÊNIOR': { lat: -15.866686, lng: -48.095899, plus_code: '58PH4WM3+8J', confianca: 'media' },
    'CENTRO DE EDUCAÇÃO INFANTIL 307': { lat: -15.885452, lng: -48.099238, plus_code: '58PH4W72+R8', confianca: 'alta' },
    'CENTRO DE ENSINO 412': { lat: -15.856321, lng: -48.074837, plus_code: '58PH4WVG+F3', confianca: 'alta' },
    'CENTRO DE ENSINO FUNDAMENTAL 120': { lat: -15.869786, lng: -48.059688, plus_code: '58PH4WJR+34', confianca: 'alta' },
    'CENTRO DE ENSINO FUNDAMENTAL 312': { lat: -15.87671, lng: -48.068593, plus_code: '58PH4WFJ+8H', confianca: 'alta' },
    'CENTRO DE ENSINO FUNDAMENTAL 404': { lat: -15.866856, lng: -48.084616, plus_code: '58PH4WM8+75', confianca: 'alta' },
    'CENTRO DE ENSINO FUNDAMENTAL 411': { lat: -15.877313, lng: -48.110368, plus_code: '58PH4VFQ+3V', confianca: 'media' },
    'CENTRO DE ENSINO FUNDAMENTAL 427': { lat: -15.892394, lng: -48.138518, plus_code: '58PH4V56+2H', confianca: 'alta' },
    'CENTRO DE ENSINO FUNDAMENTAL 619': { lat: -15.879167, lng: -48.122247, plus_code: '58PH4VCH+84', confianca: 'alta' },
    'CENTRO DE ENSINO MÉDIO 304': { lat: -15.879465, lng: -48.07927, plus_code: '58PH4WCC+67', confianca: 'alta' },
    'CENTRO DE ENSINO MÉDIO 414': { lat: -15.859326, lng: -48.072231, plus_code: '58PH4WRH+74', confianca: 'alta' },
    'CENTRO EDUCACIONAL MYRIAM ERVILHA': { lat: -15.940657, lng: -48.241822, plus_code: '58PH3Q55+P7', confianca: 'media' },
    'ESCOLA CLASSE 108': { lat: -15.872637, lng: -48.075078, plus_code: '58PH4WGF+WX', confianca: 'alta' },
    'ESCOLA CLASSE 111': { lat: -15.885584, lng: -48.105206, plus_code: '58PH4V7V+QW', confianca: 'alta' },
    'ESCOLA CLASSE 121': { lat: -15.892766, lng: -48.120504, plus_code: '58PH4V4H+VQ', confianca: 'alta' },
    'ESCOLA CLASSE 303': { lat: -15.882181, lng: -48.094449, plus_code: '58PH4W94+46', confianca: 'media' },
    'ESCOLA CLASSE 318': { lat: -15.875455, lng: -48.062435, plus_code: '58PH4WFQ+R2', confianca: 'alta' },
    'ESCOLA CLASSE 325': { lat: -15.896975, lng: -48.123071, plus_code: '58PH4V3G+6Q', confianca: 'alta' },
    'ESCOLA CLASSE 403': { lat: -15.873133, lng: -48.09762, plus_code: '58PH4WG2+PX', confianca: 'alta' },
    'ESCOLA CLASSE 407': { lat: -15.874989, lng: -48.103589, plus_code: '58PH4VGW+2H', confianca: 'alta' },
    'ESCOLA CLASSE 419': { lat: -15.884951, lng: -48.119386, plus_code: '58PH4V8J+26', confianca: 'alta' },
    'ESCOLA CLASSE 431': { lat: -15.895109, lng: -48.143814, plus_code: '58PH4V34+XF', confianca: 'alta' },
    'ESCOLA CLASSE 604': { lat: -15.861072, lng: -48.08684, plus_code: '58PH4WQ7+H7', confianca: 'alta' },
    'ESCOLA CLASSE 614': { lat: -15.853497, lng: -48.074407, plus_code: '58PH4WWG+J6', confianca: 'alta' },
    'ESCOLA CLASSE 831': { lat: -15.888056, lng: -48.147919, plus_code: '58PH4V62+QR', confianca: 'alta' }
};

const zone15 = {
    'CEF Nº 10': { lat: -15.857178, lng: -48.041062, plus_code: '58PH4XV5+4H', confianca: 'alta' },
    'CEF Nº 15': { lat: -15.834819, lng: -48.05442, plus_code: '58PH5W8W+36', confianca: 'alta' },
    'CEF Nº 3': { lat: -15.840234, lng: -48.049004, plus_code: '58PH5X52+W9', confianca: 'alta' },
    'CEF Nº 8': { lat: -15.817627, lng: -48.05857, plus_code: '58PH5WJR+WH', confianca: 'media' },
    'CEI 02 - CENTRO DE EDUCAÇÃO INFANTIL 02': { lat: -15.800359, lng: -48.057687, plus_code: '58PH5WXR+VW', confianca: 'alta' },
    'CEMAB - CENTRO DE ENSINO MÉDIO AVE BRANCA': { lat: -15.836381, lng: -48.053905, plus_code: '58PH5W7W+CC', confianca: 'alta' },
    'CENTRO DE EDUCAÇÃO INFANTIL 02 - CEI02': { lat: -15.800359, lng: -48.057687, plus_code: '58PH5WXR+VW', confianca: 'alta' },
    'CENTRO DE EDUCAÇÃO INFANTIL ÁGUAS CLARAS': { lat: -15.870693, lng: -48.015114, plus_code: '58PH4XHM+PX', confianca: 'media' },
    'CENTRO DE ENS MÉDIO Nº 3': { lat: -15.859827, lng: -48.039813, plus_code: '58PH4XR6+33', confianca: 'alta' },
    'CENTRO EDUC STELLA MARIS': { lat: -15.83177, lng: -48.056463, plus_code: '58PH5W9V+7C', confianca: 'alta' },
    'CENTRO EDUCACIONAL CATOLICA DE BRASILIA': { lat: -15.862149, lng: -48.03287, plus_code: '58PH4XQ8+4V', confianca: 'alta' },
    'CENTRO EDUCACIONAL Nº 02': { lat: -15.842261, lng: -48.047834, plus_code: '58PH5X52+3V', confianca: 'alta' },
    'CENTRO EDUCACIONAL SIGMA': { lat: -15.838769, lng: -48.019408, plus_code: '58PH5X6J+F6', confianca: 'alta' },
    'CENTRO UNIVERSITARIO EURO AMERICANO - UNIEURO': { lat: -15.831865, lng: -48.037001, plus_code: '58PH5X97+75', confianca: 'alta' },
    'CEUB - ÁGUAS CLARAS': { lat: -15.835506, lng: -48.04591, plus_code: '58PH5X73+QJ', confianca: 'alta' },
    'CILT - CENTRO INTERESCOLAR DE LINGUAS DE TAGUATINGA': { lat: -15.836597, lng: -48.058348, plus_code: '58PH5W7R+9M', confianca: 'alta' },
    'COLEGIO LEONARDO DA VINCI': { lat: -15.847226, lng: -48.041466, plus_code: '58PH5X35+4C', confianca: 'alta' },
    'COLÉGIO ANCHIETA - TAGUATINGA': { lat: -15.843258, lng: -48.052009, plus_code: '58PH5W4X+M5', confianca: 'alta' },
    'COLÉGIO IDEAL': { lat: -15.796906, lng: -48.059256, plus_code: '58PH6W3R+67', confianca: 'media' },
    'COLÉGIO IDEAL - A/E 31': { lat: -15.79656, lng: -48.058819, plus_code: '58PH6W3R+9F', confianca: 'alta' },
    'COLÉGIO IDEAL MANACÁ': { lat: -15.835636, lng: -48.007969, plus_code: '58PH5X7R+PR', confianca: 'alta' },
    'COLÉGIO MARISTA - ÁGUAS CLARAS': { lat: -15.836797, lng: -48.008388, plus_code: '58PH5X7R+7J', confianca: 'alta' },
    'COLÉGIO OBJETIVO - ÁGUAS CLARAS': { lat: -15.836907, lng: -48.025643, plus_code: '58PH5X7F+6P', confianca: 'alta' },
    'COLÉGIO OLIMPO LTDA': { lat: -15.836182, lng: -48.013119, plus_code: '58PH5X7P+GQ', confianca: 'alta' },
    'COLÉGIO VISÃO': { lat: -15.837772, lng: -48.029869, plus_code: '58PH5X6C+V3', confianca: 'alta' },
    'ESCOLA ATUAL': { lat: -15.840853, lng: -48.017969, plus_code: '58PH5X5J+MR', confianca: 'alta' },
    'ESCOLA CLASSE 54 (CEF Nº 18 - ESCOLA NORMAL)': { lat: -15.852982, lng: -48.049113, plus_code: '58PH4XW2+R9', confianca: 'alta' },
    'ESCOLA CLASSE ARNIQUEIRA': { lat: -15.862147, lng: -48.000822, plus_code: '58PH4XQX+4M', confianca: 'alta' },
    'ESCOLA CLASSE N 1': { lat: -15.835668, lng: -48.062185, plus_code: '58PH5W7Q+P4', confianca: 'alta' },
    'ESCOLA CLASSE N 11': { lat: -15.856946, lng: -48.043697, plus_code: '58PH4XV4+6G', confianca: 'alta' },
    'ESCOLA CLASSE VILA AREAL': { lat: -15.85992, lng: -48.025023, plus_code: '58PH4XRF+2X', confianca: 'alta' },
    'ESCOLA LA SALLE': { lat: -15.826959, lng: -48.014024, plus_code: '58PH5XFP+69', confianca: 'alta' },
    'ESCOLA TÉCNICA DE BRASÍLIA': { lat: -15.86159, lng: -48.028035, plus_code: '58PH4XQC+9Q', confianca: 'alta' },
    'FACULDADE PROCESSUS - CAMPUS II': { lat: -15.833716, lng: -48.045509, plus_code: '58PH5X83+GQ', confianca: 'alta' },
    'UNIPLAN -CENTRO UNIVERSITÁRIO PLANALTO DO DISTRITO FEDERAL': { lat: -15.817349, lng: -48.06598, plus_code: '58PH5WMM+3J', confianca: 'alta' }
};

const zone21 = {
    'CENTRO DE ENSINO FUNDAMENTAL 101 DO RECANTO DAS EMAS': { lat: -15.90027234, lng: -48.05687432, plus_code: '58PH3WXV+V7', confianca: 'media' },
    'CENTRO DE ENSINO FUNDAMENTAL 106 DO RECANTO DAS EMAS': { lat: -15.90534780, lng: -48.08208430, plus_code: '58PH3WV9+V5', confianca: 'alta' },
    'CENTRO DE ENSINO FUNDAMENTAL 113 DO RECANTO DAS EMAS': { lat: -15.91824212, lng: -48.10281784, plus_code: '58PH3VJW+PV', confianca: 'alta' },
    'CENTRO DE ENSINO FUNDAMENTAL 115 DO RECANTO DAS EMAS': { lat: -15.92550880, lng: -48.10757940, plus_code: '58PH3VFR+QX', confianca: 'alta' },
    'CENTRO DE ENSINO FUNDAMENTAL 206 DO RECANTO DAS EMAS': { lat: -15.90604667, lng: -48.06898000, plus_code: '58PH3WVJ+HC', confianca: 'alta' },
    'CENTRO DE ENSINO FUNDAMENTAL 301 DO RECANTO DAS EMAS': { lat: -15.90899750, lng: -48.08497610, plus_code: '58PH3WR8+C2', confianca: 'alta' },
    'CENTRO DE ENSINO FUNDAMENTAL 306 DO RECANTO DAS EMAS': { lat: -15.91872750, lng: -48.09714630, plus_code: '58PH3WJ3+G4', confianca: 'alta' },
    'CENTRO DE ENSINO FUNDAMENTAL 405 DO RECANTO DAS EMAS': { lat: -15.91310038, lng: -48.06567974, plus_code: '58PH3WPM+QP', confianca: 'alta' },
    'CENTRO DE ENSINO FUNDAMENTAL 504 DE SAMAMBAIA': { lat: -15.88227510, lng: -48.07817210, plus_code: '58PH4W9C+3P', confianca: 'alta' },
    'CENTRO DE ENSINO FUNDAMENTAL 507 DE SAMAMBAIA': { lat: -15.89104200, lng: -48.09747270, plus_code: '58PH4W53+H2', confianca: 'alta' },
    'CENTRO DE ENSINO FUNDAMENTAL 519 DE SAMAMBAIA': { lat: -15.89703520, lng: -48.11525360, plus_code: '58PH4V3M+5V', confianca: 'alta' },
    'CENTRO DE ENSINO FUNDAMENTAL 602 DO RECANTO DAS EMAS': { lat: -15.91543230, lng: -48.05452100, plus_code: '58PH3WMW+R5', confianca: 'alta' },
    'CENTRO DE ENSINO FUNDAMENTAL 801 DO RECANTO DAS EMAS': { lat: -15.91875422, lng: -48.05213714, plus_code: '58PH3WJX+F4', confianca: 'alta' },
    'CENTRO DE ENSINO MÉDIO 111 DO RECANTO DAS EMAS': { lat: -15.91249740, lng: -48.09856230, plus_code: '58PH3WQ2+2H', confianca: 'alta' },
    'CENTRO DE ENSINO MÉDIO 804 DO RECANTO DAS EMAS': { lat: -15.92042922, lng: -48.05815391, plus_code: '58PH3WHR+RP', confianca: 'alta' },
    'CENTRO EDUCACIONAL 104 DO RECANTO DAS EMAS': { lat: -15.90066873, lng: -48.07115617, plus_code: '58PH3WXH+PG', confianca: 'alta' },
    'CENTRO EDUCACIONAL 308 DO RECANTO DAS EMAS': { lat: -15.92341140, lng: -48.10134810, plus_code: '58PH3VGX+JF', confianca: 'alta' },
    'ESCOLA CLASSE 102 DO RECANTO DAS EMAS': { lat: -15.90194270, lng: -48.06153460, plus_code: '58PH3WXQ+69', confianca: 'alta' },
    'ESCOLA CLASSE 203 / REGIONAL DE ENSINO - RECANTO DAS EMAS': { lat: -15.90459080, lng: -48.06500680, plus_code: '58PH3WWM+5X', confianca: 'alta' },
    'ESCOLA CLASSE 317 DE SAMAMBAIA': { lat: -15.89108580, lng: -48.11096130, plus_code: '58PH4V5Q+HJ', confianca: 'alta' },
    'ESCOLA CLASSE 401 DO RECANTO DAS EMAS': { lat: -15.90911420, lng: -48.05622290, plus_code: '58PH3WRV+9G', confianca: 'alta' },
    'ESCOLA CLASSE 404 DO RECANTO DAS EMAS': { lat: -15.91254450, lng: -48.06138710, plus_code: '58PH3WPQ+XC', confianca: 'alta' },
    'ESCOLA CLASSE 501 DE SAMAMBAIA': { lat: -15.88597200, lng: -48.08689840, plus_code: '58PH4W77+J6', confianca: 'alta' },
    'ESCOLA CLASSE 510 DE SAMAMBAIA': { lat: -15.88076120, lng: -48.07193780, plus_code: '58PH4W9H+M6', confianca: 'alta' },
    'ESCOLA CLASSE 510 DO RECANTO DAS EMAS / CENTRO DE ENSINO FUNDAMENT 511': { lat: -15.90979500, lng: -48.06944810, plus_code: '58PH3WRJ+36', confianca: 'alta' },
    'ESCOLA CLASSE 511 DE SAMAMBAIA': { lat: -15.86939950, lng: -48.06995520, plus_code: '58PH4WJJ+62', confianca: 'alta' },
    'ESCOLA CLASSE 512 DE SAMAMBAIA': { lat: -15.87884380, lng: -48.06818110, plus_code: '58PH4WCJ+FP', confianca: 'alta' },
    'ESCOLA CLASSE 803 DO RECANTO DAS EMAS': { lat: -15.92319050, lng: -48.05432560, plus_code: '58PH3WGW+P7', confianca: 'alta' }
};

const data = JSON.parse(readFileSync(PATH, 'utf-8'));

function applyZone(zoneNum, updates) {
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
    console.log(`Zona ${zoneNum}: ${updated} pontos atualizados.`);
    if (notFound.size > 0) {
        console.log(`  Nomes sem correspondência na Zona ${zoneNum}:`);
        notFound.forEach(n => console.log(`    - ${n}`));
    }
}

applyZone('13', zone13);
applyZone('14', zone14);
applyZone('15', zone15);
applyZone('21', zone21);

writeFileSync(PATH, JSON.stringify(data, null, 2), 'utf-8');
