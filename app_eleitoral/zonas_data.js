// ==========================================
// DADOS DAS ZONAS ELEITORAIS DO DF
// ==========================================

const ZONAS_DATA = {
    "1": {
        nome: "Zona 1",
        cor: "#63d692",
        ras: ["Brasília — Asa Sul"],
        eleitorado: 79904,
        locais: 27,
        percentual: 3.57
    },
    "2": {
        nome: "Zona 2",
        cor: "#869bf0",
        ras: ["Paranoá", "Varjão", "Itapoã", "Lago Norte"],
        eleitorado: 118044,
        locais: 29,
        percentual: 5.28
    },
    "3": {
        nome: "Zona 3",
        cor: "#c894e1",
        ras: ["Taguatinga (Norte)"],
        eleitorado: 39303,
        locais: 11,
        percentual: 1.76
    },
    "4": {
        nome: "Zona 4",
        cor: "#e15eac",
        ras: ["Santa Maria"],
        eleitorado: 98349,
        locais: 22,
        percentual: 4.40
    },
    "5": {
        nome: "Zona 5",
        cor: "#9a7c64",
        ras: ["Sobradinho", "Sobradinho II", "Fercal"],
        eleitorado: 114897,
        locais: 44,
        percentual: 5.14
    },
    "6": {
        nome: "Zona 6",
        cor: "#f6eda5",
        ras: ["Planaltina", "Arapoanga"],
        eleitorado: 137552,
        locais: 46,
        percentual: 6.15
    },
    "8": {
        nome: "Zona 8",
        cor: "#f59f8a",
        ras: ["Ceilândia Centro"],
        eleitorado: 123314,
        locais: 18,
        percentual: 5.52
    },
    "9": {
        nome: "Zona 9",
        cor: "#e47171",
        ras: ["Guará", "Vicente Pires", "SCIA/Estrutural"],
        eleitorado: 148872,
        locais: 28,
        percentual: 6.66
    },
    "10": {
        nome: "Zona 10",
        cor: "#8aaae5",
        ras: ["Núcleo Bandeirante", "Riacho Fundo", "Park Way", "Candangolândia"],
        eleitorado: 136707,
        locais: 18,
        percentual: 6.11
    },
    "11": {
        nome: "Zona 11",
        cor: "#c8c1bc",
        ras: ["Cruzeiro", "Sudoeste", "Octogonal"],
        eleitorado: 79304,
        locais: 5,
        percentual: 3.55
    },
    "13": {
        nome: "Zona 13",
        cor: "#9ff1cf",
        ras: ["Samambaia"],
        eleitorado: 131356,
        locais: 35,
        percentual: 5.87
    },
    "14": {
        nome: "Zona 14",
        cor: "#68e799",
        ras: ["Brasília — Asa Norte", "Lago Norte"],
        eleitorado: 105345,
        locais: 16,
        percentual: 4.71
    },
    "15": {
        nome: "Zona 15",
        cor: "#e7dfcd",
        ras: ["Águas Claras", "Arniqueira"],
        eleitorado: 172286,
        locais: 16,
        percentual: 7.71
    },
    "16": {
        nome: "Zona 16",
        cor: "#66cbed",
        ras: ["Ceilândia Norte", "Brazlândia"],
        eleitorado: 151130,
        locais: 54,
        percentual: 6.76
    },
    "17": {
        nome: "Zona 17",
        cor: "#e3d274",
        ras: ["Gama"],
        eleitorado: 147137,
        locais: 40,
        percentual: 6.58
    },
    "18": {
        nome: "Zona 18",
        cor: "#7beddf",
        ras: ["Lago Sul", "Jardim Botânico", "São Sebastião"],
        eleitorado: 136226,
        locais: 21,
        percentual: 6.09
    },
    "19": {
        nome: "Zona 19",
        cor: "#cd9ce4",
        ras: ["Taguatinga (Sul)"],
        eleitorado: 107022,
        locais: 10,
        percentual: 4.79
    },
    "20": {
        nome: "Zona 20",
        cor: "#ebabc8",
        ras: ["Ceilândia Sul", "Sol Nascente/Pôr do Sol"],
        eleitorado: 94960,
        locais: 20,
        percentual: 4.25
    },
    "21": {
        nome: "Zona 21",
        cor: "#e5a7b6",
        ras: ["Recanto das Emas", "Riacho Fundo II"],
        eleitorado: 114237,
        locais: 20,
        percentual: 5.11
    }
};

// SVG Path data for each zone (simplified polygons based on the reference map)
// ViewBox: 0 0 1000 700
const ZONAS_PATHS = {
    "16": "M 50,180 L 50,120 L 120,80 L 180,100 L 200,150 L 200,200 L 230,230 L 230,310 L 200,340 L 170,340 L 140,320 L 100,300 L 60,280 L 50,250 Z",
    "5":  "M 200,40 L 320,20 L 420,30 L 460,60 L 480,120 L 470,180 L 420,200 L 380,210 L 340,200 L 300,180 L 280,160 L 240,150 L 200,150 L 180,100 L 200,60 Z",
    "6":  "M 460,60 L 550,40 L 680,30 L 780,50 L 820,80 L 830,150 L 820,240 L 780,280 L 720,300 L 650,310 L 600,280 L 560,240 L 530,200 L 500,160 L 480,120 Z",
    "14": "M 300,180 L 340,200 L 380,210 L 420,200 L 440,220 L 420,260 L 390,280 L 360,290 L 330,280 L 310,260 L 290,240 L 270,220 L 280,200 Z",
    "2":  "M 420,200 L 470,180 L 530,200 L 560,240 L 600,280 L 650,310 L 680,340 L 700,380 L 680,410 L 640,420 L 580,400 L 530,370 L 480,340 L 450,310 L 430,280 L 420,260 Z",
    "11": "M 270,220 L 310,260 L 330,280 L 340,300 L 320,320 L 290,330 L 270,320 L 260,290 L 250,260 Z",
    "3":  "M 170,200 L 200,200 L 230,230 L 250,260 L 240,280 L 220,300 L 200,310 L 180,300 L 160,290 L 150,260 L 150,230 Z",
    "19": "M 150,260 L 180,300 L 200,310 L 220,340 L 210,370 L 190,390 L 160,400 L 140,380 L 130,350 L 120,310 L 130,280 Z",
    "8":  "M 140,220 L 170,200 L 200,200 L 230,230 L 250,260 L 240,280 L 220,300 L 200,310 L 180,300 L 160,290 L 150,260 L 150,230 Z",
    "20": "M 100,300 L 140,320 L 170,340 L 200,340 L 220,340 L 210,370 L 190,390 L 160,400 L 140,420 L 110,430 L 80,420 L 60,390 L 60,350 L 70,320 Z",
    "9":  "M 250,260 L 270,220 L 310,260 L 330,280 L 340,300 L 360,290 L 380,310 L 380,340 L 360,360 L 340,370 L 310,360 L 290,340 L 270,320 L 260,290 Z",
    "1":  "M 330,280 L 360,290 L 390,280 L 420,260 L 430,280 L 420,310 L 400,330 L 380,340 L 380,310 L 360,290 L 340,300 Z",
    "15": "M 220,300 L 250,260 L 270,320 L 290,340 L 310,360 L 290,380 L 260,400 L 240,420 L 220,400 L 210,370 Z",
    "10": "M 290,340 L 310,360 L 340,370 L 380,340 L 400,330 L 420,310 L 450,310 L 470,340 L 460,380 L 440,410 L 410,430 L 380,440 L 350,430 L 320,420 L 290,400 L 270,380 L 260,400 L 290,380 Z",
    "18": "M 450,310 L 480,340 L 530,370 L 580,400 L 640,420 L 680,410 L 700,380 L 710,420 L 700,470 L 670,510 L 620,530 L 560,520 L 500,490 L 460,460 L 440,430 L 440,410 L 460,380 L 470,340 Z",
    "13": "M 130,350 L 160,400 L 190,390 L 220,400 L 240,420 L 230,460 L 200,490 L 170,500 L 140,490 L 110,470 L 100,440 L 110,430 L 130,420 L 140,420 Z",
    "21": "M 140,490 L 170,500 L 200,490 L 230,460 L 250,480 L 260,510 L 250,540 L 220,560 L 190,560 L 160,550 L 140,530 Z",
    "17": "M 190,560 L 220,560 L 250,540 L 260,510 L 290,530 L 320,550 L 340,580 L 320,610 L 290,630 L 250,640 L 210,630 L 190,600 Z",
    "4":  "M 290,530 L 320,550 L 340,580 L 380,560 L 420,550 L 460,560 L 480,540 L 500,490 L 460,460 L 440,430 L 410,430 L 380,440 L 350,430 L 320,420 L 290,400 L 260,400 L 240,420 L 230,460 L 250,480 L 260,510 Z"
};

// Label positions (approximate center of each zone for the number overlay)
const ZONAS_LABELS = {
    "16": { x: 140, y: 220 },
    "5":  { x: 360, y: 120 },
    "6":  { x: 640, y: 170 },
    "14": { x: 350, y: 240 },
    "2":  { x: 560, y: 320 },
    "11": { x: 290, y: 280 },
    "3":  { x: 190, y: 260 },
    "19": { x: 170, y: 340 },
    "8":  { x: 195, y: 245 },
    "20": { x: 140, y: 370 },
    "9":  { x: 310, y: 310 },
    "1":  { x: 380, y: 305 },
    "15": { x: 260, y: 360 },
    "10": { x: 380, y: 380 },
    "18": { x: 560, y: 430 },
    "13": { x: 170, y: 450 },
    "21": { x: 200, y: 520 },
    "17": { x: 280, y: 580 },
    "4":  { x: 380, y: 500 }
};
