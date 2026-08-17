// Aplica as coordenadas verificadas das Zonas Eleitorais 4 (Santa Maria) e 5
// (Sobradinho/Sobradinho II/Fercal) — planilha fornecida pelo usuário
// (area_5_e_4_plus_codes.csv), com coordenadas/Plus Codes de base geoespacial
// oficial (catalogo.ipe.df.gov.br) e STATUS_GEOCODIFICACAO por linha.
// "CONFIRMADO" -> confiança alta; "CORRESPONDENCIA"/"REVISAR" (nome com
// designação adicional, ponto histórico, ou divergência de sub-região a
// conferir) -> confiança média. Nomes se repetem dentro da mesma zona
// (entradas duplicadas herdadas do KML original) — a atualização é aplicada a
// TODAS as ocorrências.
import { readFileSync, writeFileSync } from 'fs';

const PATH = new URL('../public/locais_pontos.json', import.meta.url);

// name -> { lat, lng, plus_code, confianca }
const updatesZona4 = {
    'CENTRO DE ENSINO FUNDAMENTAL 103 DE SANTA MARIA': { lat: -16.03677775, lng: -48.03754338, plus_code: '58MHXX76+7X', confianca: 'alta' },
    'CENTRO DE ENSINO FUNDAMENTAL 201 DE SANTA MARIA': { lat: -16.04421416, lng: -48.03369282, plus_code: '58MHXX48+8G', confianca: 'alta' },
    'CENTRO DE ENSINO FUNDAMENTAL 209 DE SANTA MARIA': { lat: -16.02166212, lng: -48.02411639, plus_code: '58MHXXHG+89', confianca: 'alta' },
    'CENTRO DE ENSINO FUNDAMENTAL 213 DE SANTA MARIA': { lat: -16.00816516, lng: -48.003175, plus_code: '58MHXXRW+PP', confianca: 'alta' },
    'CENTRO DE ENSINO FUNDAMENTAL 308 DE SANTA MARIA': { lat: -16.02731599, lng: -48.02228029, plus_code: '58MHXXFH+33', confianca: 'alta' },
    'CENTRO DE ENSINO FUNDAMENTAL 316 DE SANTA MARIA': { lat: -16.01142945, lng: -47.99484974, plus_code: '58MJX2Q4+C3', confianca: 'alta' },
    'CENTRO DE ENSINO FUNDAMENTAL 403 DE SANTA MARIA': { lat: -16.0378441, lng: -48.02672291, plus_code: '58MHXX6F+V8', confianca: 'alta' },
    'CENTRO DE ENSINO FUNDAMENTAL 418 DE SANTA MARIA': { lat: -16.01434259, lng: -47.98632458, plus_code: '58MJX2P7+7F', confianca: 'alta' },
    'CENTRO DE ENSINO FUNDAMENTAL SANTOS DUMONT': { lat: -15.993166, lng: -47.9973318, plus_code: '58PJ2243+P3', confianca: 'alta' },
    'CENTRO DE ENSINO GESNER TEIXEIRA': { lat: -16.04890376, lng: -48.04697695, plus_code: '58MHXX23+C6', confianca: 'media' },
    'CENTRO DE ENSINO MEDIO 404 DE SANTA MARIA': { lat: -16.0344157, lng: -48.02658512, plus_code: '58MHXX8F+69', confianca: 'alta' },
    'CENTRO DE ENSINO MEDIO 417 DE SANTA MARIA': { lat: -16.01168936, lng: -47.99120876, plus_code: '58MJX2Q5+8G', confianca: 'alta' },
    'CENTRO EDUCACIONAL 310 DE SANTA MARIA': { lat: -16.02367975, lng: -48.01641284, plus_code: '58MHXXGM+GC', confianca: 'alta' },
    'COLÉGIO PALOMA': { lat: -16.02700549, lng: -48.02580833, plus_code: '58MHXXFF+5M', confianca: 'alta' },
    'ESCOLA CLASSE 01 - PORTO RICO': { lat: -16.03486368, lng: -48.01747364, plus_code: '58MHXX8M+32', confianca: 'alta' },
    'ESCOLA CLASSE 100 DE SANTA MARIA': { lat: -16.04279706, lng: -48.03834795, plus_code: '58MHXX46+VM', confianca: 'alta' },
    'ESCOLA CLASSE 116 DE SANTA MARIA': { lat: -16.00255632, lng: -47.99463463, plus_code: '58MJX2W4+X4', confianca: 'alta' },
    'ESCOLA CLASSE 203': { lat: -16.0379811, lng: -48.03373287, plus_code: '58MHXX68+RG', confianca: 'alta' },
    'ESCOLA CLASSE 206 DE SANTA MARIA': { lat: -16.02645598, lng: -48.03043696, plus_code: '58MHXXF9+CR', confianca: 'alta' },
    'ESCOLA CLASSE 215 DE SANTA MARIA': { lat: -16.00642799, lng: -47.99901339, plus_code: '58MJX2V2+C9', confianca: 'alta' },
    'ESCOLA CLASSE 218 DE SANTA MARIA': { lat: -16.00705723, lng: -47.98781523, plus_code: '58MJX2V6+5V', confianca: 'alta' }
};

const updatesZona5 = {
    'CAIC JULIA KUBITSCHEK': { lat: -15.64333732, lng: -47.82318243, plus_code: '58PJ954G+MP', confianca: 'alta' },
    'CENTRO DE EDUCAÇÃO INFANTIL 01': { lat: -15.66026651, lng: -47.80547756, plus_code: '58PJ85QV+VR', confianca: 'alta' },
    'CENTRO DE EDUCAÇÃO INFANTIL 03': { lat: -15.64724107, lng: -47.77411529, plus_code: '58PJ963G+49', confianca: 'alta' },
    'CENTRO DE EDUCAÇÃO NERY LACERDA - CENEL': { lat: -15.63697286, lng: -47.84451874, plus_code: '58PJ9574+65', confianca: 'alta' },
    'CENTRO DE ENSINO ESPECIAL Nº 01': { lat: -15.65028297, lng: -47.77905355, plus_code: '58PJ86XC+V9', confianca: 'alta' },
    'CENTRO DE ENSINO FUNDAMENTAL 01': { lat: -15.6575504, lng: -47.79268285, plus_code: '58PJ86R4+XW', confianca: 'alta' },
    'CENTRO DE ENSINO FUNDAMENTAL 03': { lat: -15.65071779, lng: -47.79915134, plus_code: '58PJ86X2+P8', confianca: 'alta' },
    'CENTRO DE ENSINO FUNDAMENTAL 04': { lat: -15.64580425, lng: -47.77767121, plus_code: '58PJ963C+MW', confianca: 'alta' },
    'CENTRO DE ENSINO FUNDAMENTAL 05': { lat: -15.64346197, lng: -47.79769509, plus_code: '58PJ9642+JW', confianca: 'alta' },
    'CENTRO DE ENSINO FUNDAMENTAL 07': { lat: -15.64383908, lng: -47.8248469, plus_code: '58PJ954G+F3', confianca: 'alta' },
    'CENTRO DE ENSINO FUNDAMENTAL 08': { lat: -15.63935023, lng: -47.82807707, plus_code: '58PJ956C+7Q', confianca: 'alta' },
    'CENTRO DE ENSINO FUNDAMENTAL 09 - ANTIGO COER': { lat: -15.6427267, lng: -47.8207278, plus_code: '58PJ954H+WP', confianca: 'alta' },
    'CENTRO DE ENSINO FUNDAMENTAL PROF CARLOS MOTA': { lat: -15.61772512, lng: -47.95074132, plus_code: '58PJ92JX+WP', confianca: 'media' },
    'CENTRO DE ENSINO FUNDAMENTAL QUEIMA LENÇOL': { lat: -15.5890238, lng: -47.8432782, plus_code: '58PJC564+9M', confianca: 'alta' },
    'CENTRO DE ENSINO MEDIO 01 - GINÁSIO': { lat: -15.65351386, lng: -47.79859283, plus_code: '58PJ86W2+HH', confianca: 'alta' },
    'CENTRO DE ENSINO SANTA RITA DE CASSIA': { lat: -15.64272278, lng: -47.80268901, plus_code: '58PJ954W+WW', confianca: 'alta' },
    'CENTRO EDUCACIONAL 02': { lat: -15.64861926, lng: -47.78618302, plus_code: '58PJ9627+HG', confianca: 'alta' },
    'CENTRO EDUCACIONAL 03': { lat: -15.64934451, lng: -47.81214068, plus_code: '58PJ952Q+74', confianca: 'alta' },
    'CENTRO EDUCACIONAL 03 - CCM': { lat: -15.64934451, lng: -47.81214068, plus_code: '58PJ952Q+74', confianca: 'media' },
    'CENTRO EDUCACIONAL FERCAL': { lat: -15.59087239, lng: -47.88102139, plus_code: '58PJC459+MH', confianca: 'alta' },
    'CENTRO EDUCACIONAL LA SALLE': { lat: -15.65112963, lng: -47.78181509, plus_code: '58PJ86X9+G7', confianca: 'alta' },
    'CENTRO INTERESCOLAR DE LINGUAS -CIL': { lat: -15.64447235, lng: -47.78836488, plus_code: '58PJ9646+6M', confianca: 'alta' },
    'EDUCANDÁRIO - INSTITUTO VITÓRIA-RÉGIA': { lat: -15.65490441, lng: -47.79640922, plus_code: '58PJ86W3+2C', confianca: 'media' },
    'ESCOLA CLASSE 01': { lat: -15.64961887, lng: -47.79900011, plus_code: '58PJ9622+59', confianca: 'alta' },
    'ESCOLA CLASSE 04': { lat: -15.64585312, lng: -47.7776779, plus_code: '58PJ963C+MW', confianca: 'alta' },
    'ESCOLA CLASSE 05': { lat: -15.64061543, lng: -47.80215471, plus_code: '58PJ955X+Q4', confianca: 'alta' },
    'ESCOLA CLASSE 10': { lat: -15.65887884, lng: -47.79715485, plus_code: '58PJ86R3+C4', confianca: 'alta' },
    'ESCOLA CLASSE 11': { lat: -15.64516324, lng: -47.78859523, plus_code: '58PJ9636+WH', confianca: 'alta' },
    'ESCOLA CLASSE 12': { lat: -15.66024535, lng: -47.8081233, plus_code: '58PJ85QR+WQ', confianca: 'alta' },
    'ESCOLA CLASSE 13 AR 05': { lat: -15.63971731, lng: -47.82450474, plus_code: '58PJ956G+45', confianca: 'alta' },
    'ESCOLA CLASSE 14': { lat: -15.6437623, lng: -47.81647895, plus_code: '58PJ954M+FC', confianca: 'alta' },
    'ESCOLA CLASSE 15': { lat: -15.65240767, lng: -47.80924631, plus_code: '58PJ85XR+28', confianca: 'alta' },
    'ESCOLA CLASSE 16 DE SOBRADINHO - NOVA COLINA': { lat: -15.6491087, lng: -47.754718, plus_code: '58PJ962W+94', confianca: 'media' },
    'ESCOLA CLASSE 17 VILA RABELO': { lat: -15.62348353, lng: -47.84732035, plus_code: '58PJ95G3+J3', confianca: 'media' },
    'ESCOLA CLASSE BASEVI': { lat: -15.64598517, lng: -47.88960235, plus_code: '58PJ9436+J5', confianca: 'alta' },
    'ESCOLA CLASSE BOA VISTA': { lat: -15.58862436, lng: -47.92256134, plus_code: '58PJC36G+HX', confianca: 'alta' },
    'ESCOLA CLASSE CATINGUEIRO': { lat: -15.5635756, lng: -47.9353969, plus_code: '58PJC3P7+HR', confianca: 'alta' },
    'ESCOLA CLASSE CORREGO DO ARROZAL': { lat: -15.6454241, lng: -47.7349011, plus_code: '58PJ9738+R2', confianca: 'alta' },
    'ESCOLA CLASSE CORREGO DO OURO': { lat: -15.5133017, lng: -47.9228869, plus_code: '58PJF3PG+MR', confianca: 'alta' },
    'ESCOLA CLASSE ENGENHO VELHO': { lat: -15.60173526, lng: -47.86925662, plus_code: '58PJ94XJ+87', confianca: 'alta' },
    'ESCOLA CLASSE MORRO DO SANSAO': { lat: -15.61952467, lng: -47.82345305, plus_code: '58PJ95JG+5J', confianca: 'alta' },
    'ESCOLA CLASSE RUA DO MATO': { lat: -15.61119947, lng: -47.87725677, plus_code: '58PJ94QF+G3', confianca: 'alta' },
    'ESCOLA CLASSE SANTA HELENA': { lat: -15.70656257, lng: -47.79893341, plus_code: '58PJ76V2+9C', confianca: 'alta' },
    'INSTITUTO EDUCACIONAL SANTO ELIAS': { lat: -15.64559236, lng: -47.78767234, plus_code: '58PJ9636+QW', confianca: 'alta' },
    'INSTITUTO PEDAGOGICO CRESCER': { lat: -15.64285149, lng: -47.80191953, plus_code: '58PJ954X+V6', confianca: 'media' },
    'UNIPROJEÇÃO': { lat: -15.656189, lng: -47.804615, plus_code: '58PJ85VW+G5', confianca: 'media' }
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

applyZone('4', updatesZona4, data);
applyZone('5', updatesZona5, data);

writeFileSync(PATH, JSON.stringify(data, null, 2), 'utf-8');
