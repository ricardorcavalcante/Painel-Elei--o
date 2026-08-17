// Vercel Serverless Function: Objectives & Key Results Handler (Estratégico & Tático)

let mockData = {
    objectives: [
        {
            id: 'obj-1',
            title: '🎯 Consolidar Liderança Eleitoral no Distrito Federal (Eleições 2026)',
            description: 'Objetivo Estratégico Global para todas as 19 Zonas Eleitorais e 35 RAs do DF.',
            target_year: 2026,
            progress: 68.5,
            level: 'estrategico'
        },
        {
            id: 'obj-2',
            title: '📢 Engajamento e Mobilização Comunitária nas RAs de Grande Eleitorado',
            description: 'Mobilizar lideranças em Ceilândia, Samambaia, Taguatinga e Plano Piloto.',
            target_year: 2026,
            progress: 52.0,
            level: 'estrategico'
        }
    ],
    keyResults: [
        {
            id: 'kr-101',
            objective_id: 'obj-1',
            title: 'Asa Sul (Zona 1): Atingir 85% de presença nas seções eleitorais de alta densidade',
            zona_id: '1',
            ra_nome: 'PLANO PILOTO',
            target_value: 100,
            current_value: 85,
            unit: '%',
            coordenadores: ['Carlos Eduardo (Asa Sul)', 'Fernanda Lima (Plano Piloto)']
        },
        {
            id: 'kr-102',
            objective_id: 'obj-1',
            title: 'Ceilândia (Zonas 8, 16 e 20): Cadastrar 500 multiplicadores de campanha',
            zona_id: '8',
            ra_nome: 'CEILÂNDIA',
            target_value: 500,
            current_value: 340,
            unit: 'multiplicadores',
            coordenadores: ['Marcos Silva (Ceilândia Norte)', 'Ana Paula (Ceilândia Sul)']
        },
        {
            id: 'kr-103',
            objective_id: 'obj-2',
            title: 'Taguatinga (Zonas 3 e 19): Realizar 30 reuniões comunitárias validadas com foto/ata',
            zona_id: '3',
            ra_nome: 'TAGUATINGA',
            target_value: 30,
            current_value: 18,
            unit: 'reuniões',
            coordenadores: ['Roberto Alves (Taguatinga Centro)']
        }
    ]
};

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
    );

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method === 'POST') {
        const body = req.body || {};
        if (body.type === 'objective') {
            const newObj = {
                id: `obj-${Date.now()}`,
                title: body.title,
                description: body.description || '',
                target_year: 2026,
                progress: 0,
                level: 'estrategico'
            };
            mockData.objectives.push(newObj);
            return res.status(201).json({ success: true, data: newObj });
        }
        if (body.type === 'key_result') {
            const newKR = {
                id: `kr-${Date.now()}`,
                objective_id: body.objective_id || 'obj-1',
                title: body.title,
                zona_id: body.zona_id || '1',
                ra_nome: body.ra_nome || 'PLANO PILOTO',
                target_value: Number(body.target_value) || 100,
                current_value: Number(body.current_value) || 0,
                unit: body.unit || 'unidades',
                coordenadores: body.coordenadores || ['Coordenador Regional']
            };
            mockData.keyResults.push(newKR);
            return res.status(201).json({ success: true, data: newKR });
        }
    }

    return res.status(200).json({
        success: true,
        objectives: mockData.objectives,
        keyResults: mockData.keyResults
    });
}
