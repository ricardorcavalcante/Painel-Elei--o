// Aplica as correções manuais de endereço/coordenadas da Zona Eleitoral 16
// (planilha fornecida pelo usuário, verificada no Google Maps) sobre
// public/locais_pontos.json. As 63 linhas abaixo estão na mesma ordem dos
// 63 locais da zona 16 já presentes no JSON (confirmado por nome antes de
// rodar este script).
import { readFileSync, writeFileSync } from 'fs';

const PATH = new URL('../public/locais_pontos.json', import.meta.url);

const updates = [
    { endereco: 'Expansão do St. O QNO 20 - Ceilândia, Brasília - DF, 72265-080', lat: -15.7904274, lng: -48.1421661, plus_code: '58PH6V55+R4', confianca: 'alta' },
    { endereco: 'Ae S/N Praça Do Laço - St. Norte Q 3 - Brazlândia, Brasília - DF, 72705-000', lat: -15.681276, lng: -48.1978264, plus_code: '58PH8R92+FV', confianca: 'alta' },
    { endereco: 'St. M Eqnm 05/07 - Ceilândia, Brasília - DF, 72215-540', lat: -15.8304556, lng: -48.099382, plus_code: '58PH5W92+R6', confianca: 'media' },
    { endereco: 'St. O Eqno 04/06 - Ceilândia, Brasília - DF, 72250-540', lat: -15.790588, lng: -48.1209518, plus_code: '58PH6V5H+QJ', confianca: 'alta' },
    { endereco: 'Ae S/N Praça Do Laço - St. Norte Q 3 - Brazlândia, Brasília - DF, 72705-000', lat: -15.681276, lng: -48.1978264, plus_code: '58PH8R92+FV', confianca: 'alta' },
    { endereco: 'St. N EQNN 5/7 - Ceilândia, Brasília - DF, 72225-540', lat: -15.8080446, lng: -48.1174125, plus_code: '58PH5VRM+Q2', confianca: 'media' },
    { endereco: 'Ae S/N Praça Do Laço - St. Norte Q 3 - Brazlândia, Brasília - DF, 72705-000', lat: -15.681276, lng: -48.1978264, plus_code: '58PH8R92+FV', confianca: 'alta' },
    { endereco: 'St. N EQNN 5/7 - Ceilândia, Brasília - DF, 72225-540', lat: -15.8080446, lng: -48.1174125, plus_code: '58PH5VRM+Q2', confianca: 'media' },
    { endereco: 'St. Tradicional Q 29 Ae 05 - Brazlândia, Brasília - DF, 72720-650', lat: -15.6769977, lng: -48.2032514, plus_code: '58PH8QFW+6M', confianca: 'alta' },
    { endereco: 'Lotes M/N Área Especial 01 Norte - Brazlândia, Brasília - DF, 72710-610', lat: -15.6826774, lng: -48.197193, plus_code: '58PH8R83+W4', confianca: 'media' },
    { endereco: 'Piq Q 05 Lt 01 Setor Veredas - Brazlândia, Brasília - DF, 72726-100', lat: -15.6673712, lng: -48.1989786, plus_code: '58PH8RM2+3C', confianca: 'alta' },
    { endereco: 'Eq 2/4 Lt A - St. Norte - Brazlândia, Brasília - DF, 72710-026', lat: -15.6813714, lng: -48.1914791, plus_code: '58PH8R95+FC', confianca: 'alta' },
    { endereco: 'St. O EQNO 2/4 04 - Ceilândia, Brasília - DF, 72250-530', lat: -15.7962048, lng: -48.1194336, plus_code: '58PH6V3J+G6', confianca: 'media' },
    { endereco: 'St. O EQNO 5/7 07 - Ceilândia, Brasília - DF, 72251-500', lat: -15.7863687, lng: -48.1260804, plus_code: '58PH6V7F+FH', confianca: 'alta' },
    { endereco: 'St. R Qnr 1 - Área Especial QNR 1 - Ceilândia, Brasília - DF, 72275-100', lat: -15.8055217, lng: -48.1511484, plus_code: '58PH5RVX+QG', confianca: 'alta' },
    { endereco: 'SH Sol Nascente QNP 21 - Sol Nascente/Pôr do Sol, Brasília - DF', lat: -15.8115215, lng: -48.1394613, plus_code: '58PH5VQ6+96', confianca: 'alta' },
    { endereco: 'Mod. 7 - Ceilândia, Brasília - DF', lat: -15.7856358, lng: -48.1381689, plus_code: '58PH6V76+PP', confianca: 'alta' },
    { endereco: 'Expansão do St. O Qno 17 - Ceilândia, Brasília - DF, 72260-778', lat: -15.7987058, lng: -48.1346591, plus_code: '58PH6V28+G4', confianca: 'alta' },
    { endereco: 'Expansão do St. O QNO 19 - Ceilândia, Brasília - DF, 72261-000', lat: -15.7941079, lng: -48.1391471, plus_code: '58PH6V46+98', confianca: 'alta' },
    { endereco: 'Br 070 - Df 190 Faz. Cachoeira, Ceilândia Rural - Brasília - DF, 72000-000', lat: -15.827761, lng: -48.2464512, plus_code: '58PH5QC3+VC', confianca: 'media' },
    { endereco: 'Piq - Qd 06 Lt 02 - Setor Veredas - Brazlândia, Brasília - DF, 72726-600', lat: -15.6663453, lng: -48.2010245, plus_code: '58PH8QMX+FH', confianca: 'alta' },
    { endereco: 'Q 12 Ae 5 - St. Norte - Brazlândia, Brasília - DF, 72710-650', lat: -15.6723019, lng: -48.1943325, plus_code: '58PH8RH4+37', confianca: 'alta' },
    { endereco: 'Vila São José Q 22 - Brazlândia, Brasília - DF, 72746-002', lat: -15.6585644, lng: -48.1954134, plus_code: '58PH8RR3+HR', confianca: 'alta' },
    { endereco: 'Df 180 Bsb, BR-251 - Brazlândia, Brasília - DF, 72701-970', lat: -15.6208673, lng: -48.1995508, plus_code: '58PH9RH2+M5', confianca: 'media' },
    { endereco: 'Área Especial 2 - Incra 8 - Brazlândia, Brasília - DF, 72760-014', lat: -15.7435291, lng: -48.1701137, plus_code: '58PH7R4H+HX', confianca: 'alta' },
    { endereco: 'St. P QNP 13 - Ceilândia, Brasília - DF, 72241-300', lat: -15.8094056, lng: -48.129985, plus_code: '58PH5VRC+62', confianca: 'media' },
    { endereco: 'St. Sul Q 4 - Brazlândia, Brasília - DF', lat: -15.687498, lng: -48.1961247, plus_code: '58PH8R73+2H', confianca: 'alta' },
    { endereco: 'St. O EQNO 3/5 05 - Ceilândia, Brasília - DF, 72250-510', lat: -15.7915332, lng: -48.1242418, plus_code: '58PH6V5G+98', confianca: 'alta' },
    { endereco: 'Ae S/N Praça Do Laço - St. Norte Q 3 - Brazlândia, Brasília - DF, 72705-000', lat: -15.681276, lng: -48.1978264, plus_code: '58PH8R92+FV', confianca: 'alta' },
    { endereco: 'Df 180 Km 27, Faz. Curralinho Rural - Brazlândia, Brasília - DF, 72701-970', lat: -15.5340983, lng: -48.1902366, plus_code: '58PHFR85+9W', confianca: 'alta' },
    { endereco: 'St. O EQNO 11/13 - Ceilândia, Brasília - DF, 72255-510', lat: -15.7938299, lng: -48.1295599, plus_code: '58PH6V4C+F5', confianca: 'alta' },
    { endereco: 'St. Q Área Especial - Ceilândia, Brasília - DF', lat: -15.804199, lng: -48.1434035, plus_code: '58PH5VW4+8J', confianca: 'alta' },
    { endereco: 'Incra 09 - Ceilândia, Brasília - DF', lat: -15.7841537, lng: -48.1935384, plus_code: '58PH6R84+8H', confianca: 'media' },
    { endereco: 'DF-430 - Brazlândia, Brasília - DF', lat: -15.675196, lng: -48.1029544, plus_code: '58PH8VFW+WR', confianca: 'alta' },
    { endereco: 'St. M QNM 14 - Ceilândia, Brasília - DF, 72210-140', lat: -15.8071858, lng: -48.1091999, plus_code: '58PH5VVR+48', confianca: 'media' },
    { endereco: 'Ae 07 Lt S/N - St. Tradicional Q 3 - Brazlândia, Brasília - DF, 72701-970', lat: -15.6861167, lng: -48.2019037, plus_code: '58PH8Q7X+H6', confianca: 'alta' },
    { endereco: 'Lotes M/N Área Especial 02 - Brazlândia, Brasília - DF, 72705-620', lat: -15.6725339, lng: -48.1924879, plus_code: '58PH8RG5+X2', confianca: 'alta' },
    { endereco: 'St. M Eqnm 05/07 - Ceilândia, Brasília - DF, 72215-540', lat: -15.8304556, lng: -48.099382, plus_code: '58PH5W92+R6', confianca: 'media' },
    { endereco: 'St. N EQNN 5/7 - Ceilândia, Brasília - DF, 72225-540', lat: -15.8080446, lng: -48.1174125, plus_code: '58PH5VRM+Q2', confianca: 'media' },
    { endereco: 'St. O Eqno 04/06 - Ceilândia, Brasília - DF, 72250-540', lat: -15.790588, lng: -48.1209518, plus_code: '58PH6V5H+QJ', confianca: 'alta' },
    { endereco: 'St. O EQNO 1/3 03 - Ceilândia, Brasília - DF, 72250-500', lat: -15.7973878, lng: -48.1229617, plus_code: '58PH6V3G+2R', confianca: 'alta' },
    { endereco: 'St. O EQNO 9/11 - Ceilândia, Brasília - DF, 72252-093', lat: -15.798964, lng: -48.1274746, plus_code: '58PH6V2F+C2', confianca: 'alta' },
    { endereco: 'St. O EQNO 13/15 - Ceilândia, Brasília - DF, 72255-520', lat: -15.7887614, lng: -48.1314772, plus_code: '58PH6V69+FC', confianca: 'alta' },
    { endereco: 'St. P EQNP 17/13 - Ceilândia, Brasília - DF, 72241-540', lat: -15.8072043, lng: -48.1310588, plus_code: '58PH5VV9+4H', confianca: 'alta' },
    { endereco: 'Setor P Norte EQNP 19/15 - Ceilândia, Brasília - DF, 72241-560', lat: -15.8087033, lng: -48.1352185, plus_code: '58PH5VR7+GW', confianca: 'alta' },
    { endereco: 'Expansão do St. O QNO 20 - Ceilândia, Brasília - DF, 72265-080', lat: -15.7904274, lng: -48.1421661, plus_code: '58PH6V55+R4', confianca: 'alta' },
    { endereco: 'Qno 18 Cj I - St. O QNO 19 - Ceilândia, Brasília - DF, 72260-897', lat: -15.7937943, lng: -48.1368036, plus_code: '58PH6V47+F7', confianca: 'alta' },
    { endereco: 'St. Q Qnq 4 - Ceilândia, Brasília - DF, 72270-400', lat: -15.8051613, lng: -48.1441229, plus_code: '58PH5VV4+W9', confianca: 'alta' },
    { endereco: 'St. Q Qnq 1 - Ceilândia, Brasília - DF, 72270-100', lat: -15.8037767, lng: -48.1393776, plus_code: '58PH5VW6+F6', confianca: 'alta' },
    { endereco: 'QNR 2 Área Especial 4 - St. R - Sol Nascente/Pôr do Sol, Brasília - DF', lat: -15.8063874, lng: -48.1602583, plus_code: '58PH5RVQ+CV', confianca: 'media' },
    { endereco: 'SH Sol Nascente Chácara 203, Conjunto B - Ceilândia, Brasília - DF, 72', lat: -15.8183113, lng: -48.1529195, plus_code: '58PH5RJW+MR', confianca: 'media' },
    { endereco: 'VC-505 - Brazlândia, Brasília - DF', lat: -15.5387871, lng: -48.1687199, plus_code: '58PHFR6J+FG', confianca: 'alta' },
    { endereco: 'Df 415 Km 3, sentido Df 180, Rural - Brazlândia, Brasília - DF, 72701-970', lat: -15.6369857, lng: -48.1695636, plus_code: '58PH9R7J+65', confianca: 'alta' },
    { endereco: 'Eqnp Rua Da Cascalheira - St. P - Sol Nascente/Pôr do Sol, Brasília - DF', lat: -15.8319672, lng: -48.138256, plus_code: '58PH5V96+6M', confianca: 'media' },
    { endereco: 'BR-080, Km 06, em frente ao Pastel do Galo - Brazlândia, Brasília - DF', lat: -15.7286477, lng: -48.1924475, plus_code: '58PH7RC5+G2', confianca: 'alta' },
    { endereco: 'Reserva G, Gleba 3 - Incra 7 Rural - Brazlândia, Brasília - DF, 72701-970', lat: -15.7490692, lng: -48.1149413, plus_code: '58PH7V2P+92', confianca: 'alta' },
    { endereco: 'St. Tradicional Ae 03 - Setor Tradicional - Brazlândia, Brasília - DF, 72701', lat: -15.6815012, lng: -48.2021849, plus_code: '58PH8Q9X+94', confianca: 'alta' },
    { endereco: 'Eq 06/08 Lt A - St. Norte - Brazlândia, Brasília - DF, 72710-067', lat: -15.6768031, lng: -48.1940409, plus_code: '58PH8RF4+79', confianca: 'alta' },
    { endereco: 'Escola Classe 1 do Incra 8 - DF-180 - Brazlândia, Brasília - DF', lat: -15.7404768, lng: -48.1702519, plus_code: '58PH7R5H+RV', confianca: 'alta' },
    { endereco: 'Ae 01 - St. Sul - Brazlândia, Brasília - DF, 72715-610', lat: -15.6875989, lng: -48.1914532, plus_code: '58PH8R65+XC', confianca: 'media' },
    { endereco: 'St. M Eqnm 04/06 - Ceilândia, Brasília - DF, 72210-520', lat: -15.8107986, lng: -48.1107869, plus_code: '58PH5VQQ+MM', confianca: 'media' },
    { endereco: 'Brazlândia, Brasília - DF', lat: -15.6267984, lng: -48.1199563, plus_code: '58PH9VFJ+72', confianca: 'alta' },
    { endereco: 'Df 445 Km 4, Rural - Brazlândia, Brasília - DF, 72701-970', lat: -15.6749943, lng: -48.1517091, plus_code: '58PH8RGX+28', confianca: 'alta' }
];

const data = JSON.parse(readFileSync(PATH, 'utf-8'));
const z16Indices = [];
data.forEach((d, i) => { if (d.zona === '16') z16Indices.push(i); });

if (z16Indices.length !== updates.length) {
    console.error(`Divergência de contagem: ${z16Indices.length} locais na zona 16 vs ${updates.length} atualizações.`);
    process.exit(1);
}

z16Indices.forEach((idx, i) => {
    const u = updates[i];
    data[idx].endereco = u.endereco;
    data[idx].lat = u.lat;
    data[idx].lng = u.lng;
    data[idx].plus_code = u.plus_code;
    data[idx].confianca = u.confianca;
    data[idx].location_type = 'MANUAL_GOOGLE_MAPS';
});

writeFileSync(PATH, JSON.stringify(data, null, 2), 'utf-8');
console.log(`Atualizados ${updates.length} locais da Zona Eleitoral 16.`);
