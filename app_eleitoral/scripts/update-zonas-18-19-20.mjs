// Aplica coordenadas verificadas das Zonas Eleitorais 18 (Lago Sul/São
// Sebastião), 19 (Taguatinga Norte/Vicente Pires) e 20 (Ceilândia
// Sul/Itapoã) — planilhas fornecidas pelo usuário. Mesmo padrão da Zona 17:
// atualiza TODAS as ocorrências de cada nome dentro da zona (dataset tem
// entradas duplicadas herdadas do KML original).
import { readFileSync, writeFileSync } from 'fs';

const PATH = new URL('../public/locais_pontos.json', import.meta.url);

const zone18 = {
    'CENTRO EDUCACIONAL JARDINS MANGUEIRAL': { lat: -15.89095000, lng: -47.80865000, plus_code: '58PJ455R+JG', confianca: 'media' },
    'INSTITUTO FEDERAL DE BRASÍLIA - IFB SÃO SEBASTIÃO': { lat: -15.89167999, lng: -47.78033946, plus_code: '58PJ4659+8V', confianca: 'alta' },
    'CENTRO DE ENSINO FUNDAMENTAL 06 DE BRASÍLIA': { lat: -15.85604980, lng: -47.87766620, plus_code: '58PJ44VC+HW', confianca: 'alta' },
    'CENTRO DE ENSINO FUNDAMENTAL CERÂMICA SÃO PAULO': { lat: -15.88780220, lng: -47.77905530, plus_code: '58PJ466C+V9', confianca: 'alta' },
    'CENTRO DE ENSINO FUNDAMENTAL DO BOSQUE': { lat: -15.90529620, lng: -47.75639010, plus_code: '58PJ36VV+VC', confianca: 'alta' },
    'CENTRO DE ENSINO FUNDAMENTAL JARDIM II': { lat: -16.01691970, lng: -47.38048840, plus_code: '58MJXJM9+6R', confianca: 'alta' },
    'CENTRO DE ENSINO FUNDAMENTAL MIGUEL ARCANJO': { lat: -15.89259180, lng: -47.78121940, plus_code: '58PJ4649+XG', confianca: 'alta' },
    'CENTRO DE ENSINO FUNDAMENTAL NOVA BETANIA': { lat: -15.94994210, lng: -47.79314290, plus_code: '58PJ3624+2P', confianca: 'media' },
    'CENTRO DE ENSINO MÉDIO 01 - CENTRÃO': { lat: -15.90167065, lng: -47.77937788, plus_code: '58PJ36XC+86', confianca: 'alta' },
    'CENTRO EDUCACIONAL DO LAGO SUL - CEL': { lat: -15.83935000, lng: -47.87605000, plus_code: '58PJ546F+7H', confianca: 'media' },
    'CENTRO EDUCACIONAL DO PAD/DF': { lat: -16.00977280, lng: -47.55718960, plus_code: '58MJXCRV+34', confianca: 'alta' },
    'CENTRO EDUCACIONAL SAO BARTOLOMEU': { lat: -15.89400340, lng: -47.77878380, plus_code: '58PJ464C+9F', confianca: 'alta' },
    'CENTRO EDUCACIONAL SAO JOSE': { lat: -15.91284560, lng: -47.75946610, plus_code: '58PJ36PR+V6', confianca: 'alta' },
    'CENTRO EDUCACIONAL SÃO FRANCISCO - CHICÃO': { lat: -15.91472500, lng: -47.76295000, plus_code: '58PJ36PP+4R', confianca: 'alta' },
    'CIEIC - CENTRO INTEGRADO IRMAOS CARVALHO': { lat: -15.86691306, lng: -47.78657208, plus_code: '58PJ46M7+69', confianca: 'alta' },
    'COLEGIO MARIA IMACULADA': { lat: -15.85257060, lng: -47.89786590, plus_code: '58PJ44W2+XV', confianca: 'alta' },
    'COLÉGIO DIGITAL': { lat: -15.89080008, lng: -47.80878204, plus_code: '58PJ455R+MF', confianca: 'alta' },
    'COLÉGIO DOM JOSÉ': { lat: -15.82405270, lng: -47.80718650, plus_code: '58PJ55GV+94', confianca: 'alta' },
    'COLÉGIO EVEREST': { lat: -15.85570000, lng: -47.86510000, plus_code: '58PJ44VM+PX', confianca: 'media' },
    'COLÉGIO MODELO DE SÃO SEBASTIÃO': { lat: -15.90815000, lng: -47.76070000, plus_code: '58PJ36RQ+PP', confianca: 'media' },
    'COLÉGIO NOSSA SENHORA DO PERPÉTUO SOCORRO': { lat: -15.84254702, lng: -47.89665184, plus_code: '58PJ5443+X8', confianca: 'alta' },
    'COLÉGIO PRESBITERIANO MACKENZIE': { lat: -15.85023190, lng: -47.89588260, plus_code: '58PJ44X3+WJ', confianca: 'alta' },
    'ESCOLA CLASSE 01 SHI SUL - LAGO SUL': { lat: -15.84762330, lng: -47.89310390, plus_code: '58PJ5424+XQ', confianca: 'alta' },
    'ESCOLA CLASSE 104': { lat: -15.89595450, lng: -47.78249410, plus_code: '58PJ4639+J2', confianca: 'alta' },
    'ESCOLA CLASSE 303': { lat: -15.90337070, lng: -47.78202760, plus_code: '58PJ36W9+M5', confianca: 'alta' },
    'ESCOLA CLASSE AGROVILA': { lat: -15.91070941, lng: -47.75881230, plus_code: '58PJ36QR+PF', confianca: 'alta' },
    'ESCOLA CLASSE BELA VISTA': { lat: -15.91335900, lng: -47.75462630, plus_code: '58PJ36PW+M4', confianca: 'alta' },
    'ESCOLA CLASSE CAFÉ SEM TROCO': { lat: -15.91918890, lng: -47.60580720, plus_code: '58PJ39JV+8M', confianca: 'alta' },
    'ESCOLA CLASSE CERAMICA DA BENCAO': { lat: -15.90447399, lng: -47.76963361, plus_code: '58PJ36WJ+64', confianca: 'alta' },
    'ESCOLA CLASSE LAMARÃO': { lat: -15.96549250, lng: -47.50080260, plus_code: '58PJ2FMX+RM', confianca: 'alta' },
    'ESCOLA CLASSE VILA DO BOA': { lat: -15.87769900, lng: -47.79127500, plus_code: '58PJ46C5+WF', confianca: 'alta' },
    'ESCOLA CLASSE VILA NOVA': { lat: -15.91205000, lng: -47.75880000, plus_code: '58PJ36QR+5F', confianca: 'media' },
    'ESCOLA DAS NACOES': { lat: -15.85371000, lng: -47.85075000, plus_code: '58PJ44WX+GM', confianca: 'media' },
    'ESCOLA FRANCESA FRANÇOIS MITTERRAND': { lat: -15.85543000, lng: -47.85253000, plus_code: '58PJ44VW+RX', confianca: 'alta' },
    'KINGDOM SCHOOL': { lat: -15.84759000, lng: -47.88128000, plus_code: '58PJ5429+XF', confianca: 'media' }
};

const zone19 = {
    'CEF Nº 11': { lat: -15.808641, lng: -48.062733, plus_code: '58PH5WRP+GW', confianca: 'alta' },
    'CEF Nº 14': { lat: -15.818822, lng: -48.063776, plus_code: '58PH5WJP+FF', confianca: 'alta' },
    'CENTRO DE EDUCAÇÃO INFANTIL Nº 02 (ESCOLA CLASSE Nº 30)': { lat: -15.800359, lng: -48.057687, plus_code: '58PH5WXR+VW', confianca: 'alta' },
    'CENTRO DE ENSINO DO SESI': { lat: -15.81307, lng: -48.072287, plus_code: '58PH5WPH+Q3', confianca: 'alta' },
    'CENTRO DE ENSINO FUNDAMENTAL N 12': { lat: -15.803467, lng: -48.072486, plus_code: '58PH5WWH+J2', confianca: 'alta' },
    'CENTRO DE ENSINO MEDIO TAGUATINGA NORTE': { lat: -15.819403, lng: -48.066301, plus_code: '58PH5WJM+6F', confianca: 'alta' },
    'CENTRO EDUCACIONAL N 4': { lat: -15.795521, lng: -48.057607, plus_code: '58PH6W3R+QX', confianca: 'alta' },
    'CENTRO ENS MÉDIO EIT': { lat: -15.832881, lng: -48.058564, plus_code: '58PH5W8R+RH', confianca: 'alta' },
    'COLEGIO JESUS MARIA JOSE': { lat: -15.803748, lng: -48.073338, plus_code: '58PH5WWG+GM', confianca: 'alta' },
    'COLÉGIO BIÂNGULO - RUA 07/10': { lat: -15.813876, lng: -48.083484, plus_code: '58PH5WP8+CJ', confianca: 'media' },
    'COLÉGIO DJ': { lat: -15.80329, lng: -48.041799, plus_code: '58PH5XW5+M7', confianca: 'media' },
    'COLÉGIO IDEAL': { lat: -15.796906, lng: -48.059256, plus_code: '58PH6W3R+67', confianca: 'media' },
    'COLÉGIO KAIRÓS (ANTIGO INSTITUTO EDUCACIONAL SAGARANA': { lat: -15.808619, lng: -48.041682, plus_code: '58PH5XR5+H8', confianca: 'alta' },
    'COLÉGIO LICEU': { lat: -15.808629, lng: -48.04037, plus_code: '58PH5XR5+GV', confianca: 'media' },
    'COLÉGIO OBJETIVO - RUA 03': { lat: -15.813103, lng: -48.012141, plus_code: '58PH5XPQ+Q4', confianca: 'alta' },
    'COLÉGIO VITÓRIA RÉGIA - UNIDADE 1': { lat: -15.791174, lng: -48.012228, plus_code: '58PH6X5Q+G4', confianca: 'media' },
    'COLÉGIO VITÓRIA RÉGIA UNIDADE 4 (ANTIGO COLÉGIO MAXIMUS)': { lat: -15.809014, lng: -48.024469, plus_code: '58PH5XRG+96', confianca: 'alta' },
    'ESCOLA BILINGUE LIBRAS (ANTIGA ESCOLA CLASSE N 21)': { lat: -15.802234, lng: -48.07689, plus_code: '58PH5WXF+46', confianca: 'alta' },
    'ESCOLA CLASSE 02': { lat: -15.800855, lng: -48.04877, plus_code: '58PH5XX2+MF', confianca: 'media' },
    'ESCOLA CLASSE N 12': { lat: -15.806099, lng: -48.079704, plus_code: '58PH5WVC+H4', confianca: 'alta' },
    'ESCOLA CLASSE N 15': { lat: -15.806018, lng: -48.059031, plus_code: '58PH5WVR+H9', confianca: 'alta' },
    'ESCOLA CLASSE N 16': { lat: -15.79625, lng: -48.060199, plus_code: '58PH6W3Q+FW', confianca: 'alta' },
    'ESCOLA CLASSE N 18': { lat: -15.812479, lng: -48.059397, plus_code: '58PH5WQR+26', confianca: 'alta' },
    'ESCOLA CLASSE N 27': { lat: -15.813191, lng: -48.068806, plus_code: '58PH5WPJ+PF', confianca: 'alta' },
    'ESCOLA CLASSE N 39': { lat: -15.825211, lng: -48.067649, plus_code: '58PH5WFJ+WW', confianca: 'media' },
    'ESCOLA CLASSE N 6': { lat: -15.81986, lng: -48.062463, plus_code: '58PH5WJQ+32', confianca: 'alta' },
    'ESCOLA CLASSE N 8': { lat: -15.8012, lng: -48.065616, plus_code: '58PH5WXM+GC', confianca: 'alta' },
    'ESCOLA CLASSE VICENTE PIRES': { lat: -15.813069, lng: -48.014674, plus_code: '58PH5XPP+Q4', confianca: 'alta' },
    'FACULDADE PROJECAO': { lat: -15.820363, lng: -48.065347, plus_code: '58PH5WHM+VV', confianca: 'alta' },
    'INSTITUTO EDUCACIONAL MONTESQUIEU': { lat: -15.797595, lng: -48.045543, plus_code: '58PH6X23+XQ', confianca: 'alta' }
};

const zone20 = {
    'CENTRO DE ENSINO ESPECIAL 01': { lat: -15.83986080, lng: -48.11389020, plus_code: '58PH5V6P+3C', confianca: 'alta' },
    'CENTRO DE ENSINO FUNDAMENTAL 11': { lat: -15.83992060, lng: -48.10445220, plus_code: '58PH5V6W+26', confianca: 'alta' },
    'CENTRO DE ENSINO FUNDAMENTAL 13': { lat: -15.84943220, lng: -48.11764000, plus_code: '58PH5V2J+6W', confianca: 'alta' },
    'CENTRO DE ENSINO FUNDAMENTAL 14': { lat: -15.84728910, lng: -48.12434430, plus_code: '58PH5V3G+37', confianca: 'alta' },
    'CENTRO DE ENSINO FUNDAMENTAL 18': { lat: -15.83746250, lng: -48.11564020, plus_code: '58PH5V7M+2P', confianca: 'alta' },
    'CENTRO DE ENSINO FUNDAMENTAL 19': { lat: -15.82634969, lng: -48.11453668, plus_code: '58PH5VFP+F5', confianca: 'alta' },
    'CENTRO DE ENSINO FUNDAMENTAL 32 (ANTIGA E.C. 67)': { lat: -15.85772730, lng: -48.12378370, plus_code: '58PH4VRG+WF', confianca: 'alta' },
    'CENTRO DE ENSINO FUNDAMENTAL 33 (ANTIGA E.C. 44)': { lat: -15.84001440, lng: -48.11896250, plus_code: '58PH5V5J+XC', confianca: 'alta' },
    'CENTRO DE ENSINO MEDIO 04': { lat: -15.83115333, lng: -48.10788167, plus_code: '58PH5V9R+GR', confianca: 'alta' },
    'CENTRO EDUCACIONAL 06': { lat: -15.84451050, lng: -48.11558890, plus_code: '58PH5V4M+5Q', confianca: 'alta' },
    'ESCOLA CLASSE 24': { lat: -15.83148833, lng: -48.11198000, plus_code: '58PH5V9Q+C6', confianca: 'alta' },
    'ESCOLA CLASSE 25': { lat: -15.83544460, lng: -48.10779460, plus_code: '58PH5V7R+RV', confianca: 'alta' },
    'ESCOLA CLASSE 43': { lat: -15.84432600, lng: -48.11034170, plus_code: '58PH5V4Q+7V', confianca: 'alta' },
    'ESCOLA CLASSE 46': { lat: -15.84672625, lng: -48.11388967, plus_code: '58PH5V3P+8C', confianca: 'alta' },
    'ESCOLA CLASSE 47': { lat: -15.84041040, lng: -48.12439120, plus_code: '58PH5V5G+R6', confianca: 'alta' },
    'ESCOLA CLASSE 48': { lat: -15.84454920, lng: -48.12087160, plus_code: '58PH5V4H+5M', confianca: 'alta' },
    'ESCOLA CLASSE 50': { lat: -15.84288325, lng: -48.12784233, plus_code: '58PH5V4C+RV', confianca: 'alta' },
    'ESCOLA CLASSE 502 DO ITAPOÃ': { lat: -15.73306250, lng: -47.78043750, plus_code: '58PJ7689+QR', confianca: 'alta' },
    'ESCOLA CLASSE 52': { lat: -15.85220330, lng: -48.12050000, plus_code: '58PH4VXH+4R', confianca: 'alta' }
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

applyZone('18', zone18);
applyZone('19', zone19);
applyZone('20', zone20);

writeFileSync(PATH, JSON.stringify(data, null, 2), 'utf-8');
