// Aplica as coordenadas verificadas das Zonas Eleitorais 9 (Guará/Vila Estrutural,
// com algumas entradas cruzadas de Gama/Santa Maria), 10 (Núcleo Bandeirante/Riacho
// Fundo/Candangolândia) e 11 (Cruzeiro/Sudoeste/Octogonal/Setor Militar) — planilhas
// fornecidas pelo usuário, pesquisadas em fontes oficiais (escolasnobrasil.com,
// infoschools.net, IFB, TRE-DF, SEEDF, sites institucionais) e convertidas em Plus
// Codes. Assim como nas zonas anteriores, nomes se repetem dentro da mesma zona
// (entradas duplicadas herdadas do KML original com mesmo seções/eleitorado) — por
// isso a atualização é aplicada a TODAS as ocorrências de cada nome na zona, não só
// à primeira.
//
// Observação Zona 10: "ESCOLA CLASSE 410/42/425/45" foram sinalizadas como ALERTA na
// planilha (a correspondência exata do nome fica fisicamente em Samambaia/Taguatinga,
// fora do eixo Núcleo Bandeirante/Riacho Fundo). Isso é consistente com o que já
// estava nos dados (endereço/bairro dessas entradas na zona 10 já apontava para
// Samambaia/Taguatinga desde a correlação 2022->2026) — mesma situação administrativa
// já vista antes, não um erro de transcrição. Aplicadas com confiança 'media'.
import { readFileSync, writeFileSync } from 'fs';

const PATH = new URL('../public/locais_pontos.json', import.meta.url);

// name -> { lat, lng, plus_code, confianca }
const updatesZona9 = {
    'CENTRO DE ENSINO ESPECIAL 1': { lat: -15.81906310, lng: -47.98589200, plus_code: '58PJ52J7+9J', confianca: 'alta' },
    'CENTRO DE ENSINO FUNDAMENTAL 02 - VILA ESTRUTURAL': { lat: -15.78614280, lng: -47.98940400, plus_code: '58PJ6276+G6', confianca: 'alta' },
    'CENTRO DE ENSINO FUNDAMENTAL 1': { lat: -15.81259640, lng: -47.98844410, plus_code: '58PJ52P6+XJ', confianca: 'alta' },
    'CENTRO DE ENSINO FUNDAMENTAL 10': { lat: -15.85089400, lng: -47.96256390, plus_code: '58PJ42XP+JX', confianca: 'alta' },
    'CENTRO DE ENSINO FUNDAMENTAL 2': { lat: -15.81531320, lng: -47.97836730, plus_code: '58PJ52MC+VM', confianca: 'alta' },
    'CENTRO DE ENSINO FUNDAMENTAL 4': { lat: -15.81878530, lng: -47.98779230, plus_code: '58PJ52J6+FV', confianca: 'alta' },
    'CENTRO DE ENSINO FUNDAMENTAL 5': { lat: -15.84336555, lng: -47.97387072, plus_code: '58PJ524G+MF', confianca: 'alta' },
    'CENTRO DE ENSINO FUNDAMENTAL 8': { lat: -15.82775398, lng: -47.97860601, plus_code: '58PJ52CC+VH', confianca: 'alta' },
    'CENTRO EDUCACIONAL 1': { lat: -15.84311015, lng: -47.96853893, plus_code: '58PJ524J+QH', confianca: 'alta' },
    'CENTRO EDUCACIONAL 3': { lat: -15.83886190, lng: -47.97558350, plus_code: '58PJ526F+FQ', confianca: 'alta' },
    'CENTRO EDUCACIONAL 4': { lat: -15.82112549, lng: -47.97507028, plus_code: '58PJ52HF+GX', confianca: 'alta' },
    'CENTRO EDUCACIONAL 416 DE SANTA MARIA': { lat: -16.01624020, lng: -47.99314640, plus_code: '58MJX2M4+GP', confianca: 'alta' },
    'CENTRO EDUCACIONAL INFANTIL 01 DA VILA ESTRUTURAL': { lat: -15.77903480, lng: -47.99428790, plus_code: '58PJ62C4+97', confianca: 'alta' },
    'CENTRO ENSINO EDUCACIONAL 01 - VILA ESTRUTURAL(MILITAR)': { lat: -15.78304970, lng: -47.99709040, plus_code: '58PJ6283+Q5', confianca: 'alta' },
    'CENTRO ENSINO MEDIO 01 DO GUARA - CEM (GG)': { lat: -15.81829640, lng: -47.98092310, plus_code: '58PJ52J9+MJ', confianca: 'alta' },
    'CILG -CENTRO INTERESCOLAR DE LINGUAS': { lat: -15.81583000, lng: -47.97849500, plus_code: '58PJ52MC+MJ', confianca: 'alta' },
    'COLEGIO ELITE (ANTIGO JK)': { lat: -15.81846000, lng: -47.98593000, plus_code: '58PJ52J7+JJ', confianca: 'media' },
    'COLEGIO LICEU GUARA': { lat: -15.84291000, lng: -47.98271000, plus_code: '58PJ5248+RW', confianca: 'media' },
    'COLEGIO OBJETIVO DO GUARA': { lat: -15.84646000, lng: -47.97075000, plus_code: '58PJ523H+CM', confianca: 'alta' },
    'COLEGIO PROJEÇÃO': { lat: -15.82073700, lng: -47.98125600, plus_code: '58PJ52H9+PF', confianca: 'media' },
    'COLEGIO ROGACIONISTA': { lat: -15.84638000, lng: -47.97129000, plus_code: '58PJ523H+CF', confianca: 'alta' },
    'COLEGIO ROGACIONISTA - INFANTIL NUCLEO 01': { lat: -15.84225000, lng: -47.97434000, plus_code: '58PJ525G+37', confianca: 'media' },
    'EC 10 - ESCOLA CLASSE 10 DO GAMA': { lat: -16.00804991, lng: -48.07882743, plus_code: '58MHXWRC+QF', confianca: 'alta' },
    'EC 15 - ESCOLA CLASSE 15 DO GAMA': { lat: -16.00352640, lng: -48.06098200, plus_code: '58MHXWWQ+HJ', confianca: 'alta' },
    'EC 28 - ESCOLA CLASSE 28 DO GAMA': { lat: -16.00720422, lng: -48.08309899, plus_code: '58MHXWV8+4Q', confianca: 'alta' },
    'EC 29 - ESCOLA CLASSE 29 DO GAMA': { lat: -16.04039050, lng: -48.05886240, plus_code: '58MHXW5R+RF', confianca: 'alta' },
    'ESCOLA CLASSE 02 - VILA ESTRUTURAL': { lat: -15.78251900, lng: -47.99867160, plus_code: '58PJ6282+XG', confianca: 'alta' },
    'ESCOLA CLASSE 03 (ANTIGO PADRE DI FRANCIA)': { lat: -15.84664710, lng: -47.96695640, plus_code: '58PJ523M+86', confianca: 'media' },
    'ESCOLA CLASSE 08 (ANTIGO CEF 07)': { lat: -15.83929406, lng: -47.98100978, plus_code: '58PJ5269+7H', confianca: 'alta' },
    'ESCOLA CLASSE 1 - 9ª ZE - BRASÍLIA': { lat: -15.81437354, lng: -47.97478521, plus_code: '58PJ52PG+73', confianca: 'alta' },
    'ESCOLA CLASSE 2': { lat: -15.81437333, lng: -47.98377833, plus_code: '58PJ52P8+7F', confianca: 'alta' },
    'ESCOLA CLASSE 3': { lat: -15.81945360, lng: -47.97948680, plus_code: '58PJ52JC+66', confianca: 'alta' },
    'ESCOLA CLASSE 5': { lat: -15.82297456, lng: -47.98178011, plus_code: '58PJ52G9+R7', confianca: 'alta' },
    'ESCOLA CLASSE 6': { lat: -15.82994770, lng: -47.98474020, plus_code: '58PJ52C8+24', confianca: 'alta' },
    'ESCOLA CLASSE 7': { lat: -15.84790644, lng: -47.96983536, plus_code: '58PJ522J+R3', confianca: 'alta' },
    'ESCOLA CLASSE VILA ESTRUTURAL': { lat: -15.78127634, lng: -47.99758156, plus_code: '58PJ6292+FX', confianca: 'alta' },
    'ESCOLA TÉCNICA DO GUARÁ - CEPAG / GUARÁ II': { lat: -15.83918970, lng: -47.97657680, plus_code: '58PJ526F+89', confianca: 'alta' },
    'FACULDADE PROJEÇÃO- PERTO TERMINAL RODOVIARIO GUARA II': { lat: -15.83156000, lng: -47.98748000, plus_code: '58PJ5297+92', confianca: 'media' }
};

const updatesZona10 = {
    'CAIC JUSCELINO KUBITSCHEK DO NUCLEO BANDEIRANTE': { lat: -15.87737170, lng: -47.96266550, plus_code: '58PJ42FP+3W', confianca: 'alta' },
    'CENTRO DE EDUCACAO INFANTIL DO NÚCLEO BANDEIRANTE': { lat: -15.87014780, lng: -47.97100990, plus_code: '58PJ42HH+WH', confianca: 'alta' },
    'CENTRO DE EDUCACAO INFANTIL DO RIACHO FUNDO II': { lat: -15.89580540, lng: -48.05104020, plus_code: '58PH4W3X+MH', confianca: 'alta' },
    'CENTRO DE EDUCAÇÃO INFANTIL 01 - RF I': { lat: -15.87979090, lng: -48.02196260, plus_code: '58PH4XCH+36', confianca: 'alta' },
    'CENTRO DE ENSINO FUNDAMENTAL 01 DO RIACHO FUNDO II': { lat: -15.90212600, lng: -48.04805110, plus_code: '58PH3XX2+4Q', confianca: 'alta' },
    'CENTRO DE ENSINO FUNDAMENTAL 1': { lat: -15.87710060, lng: -47.97642290, plus_code: '58PJ42FF+5C', confianca: 'media' },
    'CENTRO DE ENSINO FUNDAMENTAL LOBO GUARA': { lat: -15.93809920, lng: -48.03884610, plus_code: '58PH3X66+QF', confianca: 'alta' },
    'CENTRO DE ENSINO FUNDAMENTAL METROPOLITANA': { lat: -15.88170630, lng: -47.97512020, plus_code: '58PJ429F+8X', confianca: 'alta' },
    'CENTRO DE ENSINO MÉDIO - JULIA KUBITSCHEK': { lat: -15.85310380, lng: -47.94620360, plus_code: '58PJ43W3+QG', confianca: 'alta' },
    'CENTRO DE ENSINO MÉDIO 1 DO RIACHO FUNDO I': { lat: -15.88814096, lng: -48.01430702, plus_code: '58PH4X6P+P7', confianca: 'alta' },
    'CENTRO DE ENSINO MÉDIO URSO BRANCO': { lat: -15.87239560, lng: -47.96904370, plus_code: '58PJ42HJ+29', confianca: 'alta' },
    'CENTRO DE ENSINO TELEBRASILIA': { lat: -15.87989460, lng: -48.00591990, plus_code: '58PH4XCV+2J', confianca: 'alta' },
    'CENTRO EDUCACIONAL 02 RIACHO FUNDO I': { lat: -15.88344390, lng: -48.01972200, plus_code: '58PH4X8J+J4', confianca: 'alta' },
    'CENTRO EDUCACIONAL AGROURBANO IPÊ': { lat: -15.94749120, lng: -48.01495270, plus_code: '58PH3X3P+22', confianca: 'alta' },
    'CENTRO EDUCACIONAL INFANTIL DA CANDANGOLANDIA': { lat: -15.85576750, lng: -47.95191230, plus_code: '58PJ42VX+M6', confianca: 'alta' },
    'CENTRO EDUCACIONAL VARGEM BONITA': { lat: -15.93441320, lng: -47.94076570, plus_code: '58PJ3385+6M', confianca: 'alta' },
    'CENTRO EDUCATIVO PASSIONISTA MÃE DA SANTA ESPERANÇA': { lat: -15.87934780, lng: -48.01786840, plus_code: '58PH4XCJ+7V', confianca: 'alta' },
    'CENTRO ENSINO MEDIO 01 RFII (ANTIGO CED 01 RFII)': { lat: -15.94884270, lng: -48.03248660, plus_code: '58PH3X29+F2', confianca: 'alta' },
    'CIL-CENTRO INTERESCOLAR DE LINGUAS DO RIACHO FUNDO I': { lat: -15.88443335, lng: -48.01455181, plus_code: '58PH4X8P+65', confianca: 'alta' },
    'COLEGIO ISAAC NEWTON': { lat: -15.88088870, lng: -48.02097180, plus_code: '58PH4X9H+JJ', confianca: 'alta' },
    'COLEGIO LA SALLE': { lat: -15.86886570, lng: -47.96726420, plus_code: '58PJ42JM+F3', confianca: 'alta' },
    'COLÉGIO EDUCANDÁRIO DE FÁTIMA': { lat: -15.89803660, lng: -48.04885000, plus_code: '58PH4X22+QG', confianca: 'alta' },
    'ESCOLA CLASSE 02 DA CANDANGOLÂNDIA (ANTIGA ZOOBOTANICA)': { lat: -15.85207910, lng: -47.95165360, plus_code: '58PJ42XX+58', confianca: 'alta' },
    'ESCOLA CLASSE 02 DO RIACHO FUNDO I': { lat: -15.88172030, lng: -48.01576250, plus_code: '58PH4X9M+8M', confianca: 'alta' },
    'ESCOLA CLASSE 1 CANDANGOLANDIA': { lat: -15.84811290, lng: -47.95118410, plus_code: '58PJ522X+QG', confianca: 'alta' },
    'ESCOLA CLASSE 1 DO RIACHO FUNDO II': { lat: -15.91517140, lng: -48.04633530, plus_code: '58PH3XM3+WF', confianca: 'alta' },
    'ESCOLA CLASSE 2 DO RIACHO FUNDO II': { lat: -15.89657180, lng: -48.04959670, plus_code: '58PH4X32+95', confianca: 'alta' },
    'ESCOLA CLASSE 4': { lat: -15.86762040, lng: -47.96544870, plus_code: '58PJ42JM+XR', confianca: 'media' },
    'ESCOLA CLASSE 410': { lat: -15.85886030, lng: -48.07994550, plus_code: '58PH4WRC+F2', confianca: 'media' },
    'ESCOLA CLASSE 42': { lat: -15.80756440, lng: -48.09569200, plus_code: '58PH5WR3+XP', confianca: 'media' },
    'ESCOLA CLASSE 425': { lat: -15.86120140, lng: -48.08536175, plus_code: '58PH4WQ7+GV', confianca: 'media' },
    'ESCOLA CLASSE 45': { lat: -15.79459170, lng: -48.10699830, plus_code: '58PH6V4V+56', confianca: 'media' },
    'ESCOLA CLASSE 5': { lat: -15.87285010, lng: -47.97620440, plus_code: '58PJ42GF+VG', confianca: 'media' },
    'ESCOLA CLASSE AGROVILA II': { lat: -15.93942540, lng: -48.03478220, plus_code: '58PH3X68+63', confianca: 'alta' },
    'ESCOLA CLASSE VERDE DO RIACHO FUNDO I': { lat: -15.88460200, lng: -48.01440290, plus_code: '58PH4X8P+56', confianca: 'alta' },
    'ESCOLA SALESIANA SAO DOMINGOS SAVIO': { lat: -15.87288598, lng: -47.97048249, plus_code: '58PJ42GH+RR', confianca: 'alta' },
    'INSTITUTO FEDERAL DE BRASÍLIA - CAMPUS RIACHO FUNDO': { lat: -15.88157238, lng: -48.00915479, plus_code: '58PH4X9R+98', confianca: 'alta' },
    'JARDIM DE INFANCIA 1 DO RIACHO FUNDO II': { lat: -15.90209020, lng: -48.04463540, plus_code: '58PH3XX4+54', confianca: 'alta' }
};

const updatesZona11 = {
    'CASA THOMAS JEFFERSON': { lat: -15.79650000, lng: -47.92330000, plus_code: '58PJ633G+CM', confianca: 'alta' },
    'CENTRO DE ENSINO FUNDAMENTAL 01': { lat: -15.78462090, lng: -47.93652310, plus_code: '58PJ6387+59', confianca: 'alta' },
    'CENTRO DE ENSINO FUNDAMENTAL ATHOS BULCÃO': { lat: -15.79365650, lng: -47.94159670, plus_code: '58PJ6345+G9', confianca: 'alta' },
    'CENTRO DE ENSINO MÉDIO INTEGRADO DO CRUZEIRO - CEMI DO CRUZEIRO': { lat: -15.78325430, lng: -47.93851560, plus_code: '58PJ6386+MH', confianca: 'alta' },
    'CENTRO EDUCACIONAL 02': { lat: -15.79579210, lng: -47.93814370, plus_code: '58PJ6336+MP', confianca: 'alta' },
    'COLEGIO CIMAN': { lat: -15.80818600, lng: -47.94017050, plus_code: '58PJ53R5+PW', confianca: 'alta' },
    'COLEGIO IN-NOVA ( ANTIGO COC )': { lat: -15.80013040, lng: -47.93128090, plus_code: '58PJ53X9+WF', confianca: 'media' },
    'COLEGIO SOMA': { lat: -15.79323822, lng: -47.93916899, plus_code: '58PJ6346+P8', confianca: 'alta' },
    'COLÉGIO DROMOS': { lat: -15.79979040, lng: -47.92861100, plus_code: '58PJ632C+3H', confianca: 'alta' },
    'ESCOLA CANADENSE DE BRASÍLIA ( ANTIGA MAPLE BEAR )': { lat: -15.79621800, lng: -47.91483650, plus_code: '58PJ633P+G3', confianca: 'alta' },
    'ESCOLA CLASSE 04': { lat: -15.79597060, lng: -47.94151570, plus_code: '58PJ6335+J9', confianca: 'alta' },
    'ESCOLA CLASSE 05': { lat: -15.79852990, lng: -47.94355260, plus_code: '58PJ6324+HH', confianca: 'alta' },
    'ESCOLA CLASSE 06': { lat: -15.79443930, lng: -47.93766930, plus_code: '58PJ6346+6W', confianca: 'alta' },
    'ESCOLA CLASSE 08': { lat: -15.80390990, lng: -47.94543560, plus_code: '58PJ53W3+CR', confianca: 'alta' },
    'ESCOLA CLASSE DA VILA DO RCG': { lat: -15.76258424, lng: -47.95000043, plus_code: '58PJ62PX+XX', confianca: 'alta' },
    'ESCOLA CLASSE SMU': { lat: -15.77494220, lng: -47.93094700, plus_code: '58PJ63G9+2J', confianca: 'alta' },
    'MAPLE BEAR ( ANTIGO CANDANGUINHO - CECAN )': { lat: -15.80036200, lng: -47.92820010, plus_code: '58PJ53XC+VP', confianca: 'alta' }
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

applyZone('9', updatesZona9, data);
applyZone('10', updatesZona10, data);
applyZone('11', updatesZona11, data);

writeFileSync(PATH, JSON.stringify(data, null, 2), 'utf-8');
