// Aplica as coordenadas verificadas da Zona Eleitoral 17 (Gama) — planilha
// fornecida pelo usuário, pesquisada em páginas específicas de cada escola
// (escolasnobrasil.com) e convertida em Plus Codes. Diferente da Zona 16,
// aqui local names se repetem em locais_pontos.json (entradas duplicadas
// herdadas do KML original com mesmo seções/eleitorado) — por isso a
// atualização é aplicada a TODAS as ocorrências de cada nome na zona 17,
// não só à primeira.
import { readFileSync, writeFileSync } from 'fs';

const PATH = new URL('../public/locais_pontos.json', import.meta.url);

// name -> { lat, lng, plus_code, status }
const updates = {
    'CED 07 - CENTRO EDUCACIONAL 07 DO GAMA': { lat: -16.02012828, lng: -48.06484072, plus_code: '58MHXWHP+W3' },
    'CEF 05 - CENTRO DE ENSINO FUNDAMENTAL 05 DO GAMA': { lat: -16.01576817, lng: -48.07850732, plus_code: '58MHXWMC+MH' },
    'CEF 08 - CENTRO DE ENSINO FUNDAMENTAL 08 DO GAMA': { lat: -16.02568715, lng: -48.07396263, plus_code: '58MHXWFG+PC' },
    'CEF 10 - CENTRO DE ENSINO FUNDAMENTAL 10 DO GAMA': { lat: -16.01421610, lng: -48.07537940, plus_code: '58MHXWPF+8R' },
    'CEF 11 - CENTRO DE ENSINO FUNDAMENTAL 11 DO GAMA': { lat: -16.02818140, lng: -48.06967520, plus_code: '58MHXWCJ+P4' },
    'CED 06 - CENTRO EDUCACIONAL 06 DO GAMA': { lat: -16.00734123, lng: -48.05057005, plus_code: '58MHXWVX+3Q' },
    'CED 08 - CENTRO EDUCACIONAL 08 DO GAMA': { lat: -16.02316460, lng: -48.07831590, plus_code: '58MHXWGC+PM' },
    'CED CASA GRANDE - CENTRO EDUCACIONAL CASA GRANDE': { lat: -15.96401333, lng: -48.09920777, plus_code: '58PH2WP2+98' },
    'CED ENGENHO DAS LAJES - CENTRO EDUCACIONAL ENGENHO DAS LAJES': { lat: -16.04193820, lng: -48.25708150, plus_code: '58MHXP5V+65' },
    'CEF 01 - CENTRO DE ENSINO FUNDAMENTAL 01 DO GAMA': { lat: -16.00706770, lng: -48.06199900, plus_code: '58MHXWVQ+56' },
    'CEF 03 - CENTRO DE ENSINO FUNDAMENTAL 03 DO GAMA': { lat: -16.01095510, lng: -48.05063350, plus_code: '58MHXWQX+JP' },
    'CEF 04 - CENTRO ENSINO FUNDAMENTAL 04 DO GAMA': { lat: -16.02706750, lng: -48.05630850, plus_code: '58MHXWFV+5F' },
    // Duplicado/abreviado no CSV original — mesmo prédio de "CEF 10 DO GAMA"
    'CEF 102 NORTE': { lat: -16.01421610, lng: -48.07537940, plus_code: '58MHXWPF+8R' },
    'CEM 01 - CENTRO DE ENSINO MEDIO 01 DO GAMA': { lat: -16.01882420, lng: -48.05431160, plus_code: '58MHXWJW+F7' },
    'CEM 02 - CENTRO DE ENSINO MEDIO 02 DO GAMA': { lat: -16.01534200, lng: -48.07108920, plus_code: '58MHXWMH+VH' },
    'CEM 03 - CENTRO DE ENSINO MÉDIO 03 DO GAMA': { lat: -16.03672270, lng: -48.06371460, plus_code: '58MHXW7P+8G' },
    'CEMI - CEM INTEGRADO 01 EDUCAÇÃO PROFISSIONAL': { lat: -16.01050897, lng: -48.07495215, plus_code: '58MHXWQG+Q2' },
    'CENTRO DE ENSINO ESPECIAL DO GAMA': { lat: -16.01459400, lng: -48.06345140, plus_code: '58MHXWPP+5J' },
    // Duplicado/abreviado no CSV original — mesmo prédio de "CED 07 DO GAMA"
    'CENTRO EDUCACIONAL 07': { lat: -16.02012828, lng: -48.06484072, plus_code: '58MHXWHP+W3' },
    'CIL - CENTRO INTERESCOLAR DE LINGUAS DO GAMA': { lat: -16.01799450, lng: -48.06798050, plus_code: '58MHXWJJ+RR' },
    'EC 01 - ESCOLA CLASSE 01 DO GAMA': { lat: -16.01755910, lng: -48.05480260, plus_code: '58MHXWJW+X3' },
    'EC 02 - ESCOLA CLASSE 02 DO GAMA': { lat: -16.00520930, lng: -48.07191420, plus_code: '58MHXWVH+W6' },
    'EC 03 - ESCOLA CLASSE 03 DO GAMA': { lat: -16.01438998, lng: -48.05100697, plus_code: '58MHXWPX+6H' },
    'EC 09 - ESCOLA CLASSE 09 DO GAMA': { lat: -16.03050970, lng: -48.06568760, plus_code: '58MHXW9M+QP' },
    'EC 14 - ESCOLA CLASSE 14 DO GAMA': { lat: -16.02695220, lng: -48.05536770, plus_code: '58MHXWFV+6V' },
    'EC 19 - ESCOLA CLASSE 19 DO GAMA': { lat: -16.02533630, lng: -48.05084120, plus_code: '58MHXWFX+VM' },
    'EC 21 - ESCOLA CLASSE 21 DO GAMA': { lat: -15.99935720, lng: -48.05549770, plus_code: '58PH2W2V+7R' },
    'EC 22 - ESCOLA CLASSE 22 DO GAMA': { lat: -16.02234510, lng: -48.06795000, plus_code: '58MHXWHJ+3R' },
    // Duplicado/abreviado no CSV original — mesmo prédio de "EC 02 DO GAMA"
    'ESCOLA CLASSE 02': { lat: -16.00520930, lng: -48.07191420, plus_code: '58MHXWVH+W6' },
    // Duplicado/abreviado no CSV original — mesmo prédio de "EC 09 DO GAMA"
    'ESCOLA CLASSE 09': { lat: -16.03050970, lng: -48.06568760, plus_code: '58MHXW9M+QP' },
    'ESCOLA CLASSE 10': { lat: -16.00804991, lng: -48.07882743, plus_code: '58MHXWRC+QF' },
    'ESCOLA CLASSE 15': { lat: -16.00352640, lng: -48.06098200, plus_code: '58MHXWWQ+HJ' },
    'ESCOLA CLASSE 28': { lat: -16.00720422, lng: -48.08309899, plus_code: '58MHXWV8+4Q' },
    'ESCOLA CLASSE 29': { lat: -16.04039050, lng: -48.05886240, plus_code: '58MHXW5R+RF' },
    'JI 05 - JARDIM DE INFÂNCIA 05 DO GAMA': { lat: -16.02625430, lng: -48.08062060, plus_code: '58MHXWF9+FQ' },
    'UNICEPLAC - CENTRO UNIV. DO PLANALTO CENTRAL APPARECIDO DOS SANTOS': { lat: -16.00140760, lng: -48.05097960, plus_code: '58MHXWXX+CJ' }
};

const data = JSON.parse(readFileSync(PATH, 'utf-8'));

let updated = 0;
const notFound = new Set(Object.keys(updates));

data.forEach(p => {
    if (p.zona !== '17') return;
    const u = updates[p.local];
    if (!u) return;
    p.lat = u.lat;
    p.lng = u.lng;
    p.plus_code = u.plus_code;
    p.location_type = 'MANUAL_ESCOLASNOBRASIL';
    p.confianca = 'alta';
    notFound.delete(p.local);
    updated++;
});

writeFileSync(PATH, JSON.stringify(data, null, 2), 'utf-8');

console.log(`Pontos atualizados na Zona 17: ${updated}`);
if (notFound.size > 0) {
    console.log('Nomes da planilha sem nenhuma correspondência na Zona 17:');
    notFound.forEach(n => console.log(`  - ${n}`));
}
