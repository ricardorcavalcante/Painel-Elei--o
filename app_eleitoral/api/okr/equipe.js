// Vercel Serverless Function: Equipe e Coordenadores Handler (Tático & Operacional)

let mockEquipe = [
    {
        id: 'eq-1',
        full_name: 'Carlos Eduardo',
        email: 'carlos.asa@campanha.com.br',
        phone: '(61) 99111-2233',
        ra_nome: 'PLANO PILOTO',
        zona_id: '1',
        role: 'tatico',
        funcao: 'Coordenador Regional (Asa Sul)'
    },
    {
        id: 'eq-2',
        full_name: 'Fernanda Lima',
        email: 'fernanda.norte@campanha.com.br',
        phone: '(61) 99222-3344',
        ra_nome: 'PLANO PILOTO',
        zona_id: '14',
        role: 'tatico',
        funcao: 'Coordenadora Regional (Asa Norte)'
    },
    {
        id: 'eq-3',
        full_name: 'Marcos Silva',
        email: 'marcos.ceilandia@campanha.com.br',
        phone: '(61) 99333-4455',
        ra_nome: 'CEILÂNDIA',
        zona_id: '8',
        role: 'tatico',
        funcao: 'Coordenador Regional (Ceilândia Norte)'
    },
    {
        id: 'eq-4',
        full_name: 'Ana Paula',
        email: 'anapaula.ceilandia@campanha.com.br',
        phone: '(61) 99444-5566',
        ra_nome: 'CEILÂNDIA',
        zona_id: '16',
        role: 'tatico',
        funcao: 'Coordenadora Regional (Ceilândia Sul)'
    },
    {
        id: 'eq-5',
        full_name: 'João Vitor Santos',
        email: 'joao.campo@campanha.com.br',
        phone: '(61) 98888-1122',
        ra_nome: 'PLANO PILOTO',
        zona_id: '1',
        role: 'operacional',
        funcao: 'Agente de Campo - Quadras SQS 100'
    },
    {
        id: 'eq-6',
        full_name: 'Maria Clara Souza',
        email: 'maria.campo@campanha.com.br',
        phone: '(61) 98777-2233',
        ra_nome: 'CEILÂNDIA',
        zona_id: '8',
        role: 'operacional',
        funcao: 'Liderança de Bairro - QNO/QNN'
    }
];

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
        if (!body.full_name || !body.ra_nome) {
            return res.status(400).json({ success: false, error: 'Nome e RA são obrigatórios.' });
        }
        const newMember = {
            id: `eq-${Date.now()}`,
            full_name: body.full_name,
            email: body.email || '',
            phone: body.phone || '',
            ra_nome: body.ra_nome,
            zona_id: body.zona_id || '1',
            role: body.role || 'operacional',
            funcao: body.funcao || 'Agente de Campo'
        };
        mockEquipe.push(newMember);
        return res.status(201).json({ success: true, data: newMember });
    }

    return res.status(200).json({
        success: true,
        equipe: mockEquipe
    });
}
