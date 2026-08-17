// Vercel Serverless Function: Artefatos e Entregáveis Handler (Nível Tático/Operacional)

let mockArtefatos = [
    {
        id: 'art-1',
        key_result_id: 'kr-103',
        titulo: 'Ata e Foto da Reunião Comunitária na QNJ Taguatinga',
        descricao: 'Comprovante digital com lista de 45 presentes e foto do encontro.',
        arquivo_url: 'https://images.unsplash.com/photo-1517048676732-d65bc937f952?w=600',
        tipo_artefato: 'foto',
        enviado_por: 'Roberto Alves (Taguatinga Centro)',
        status: 'aprovado',
        created_at: '2026-08-15T14:30:00Z'
    },
    {
        id: 'art-2',
        key_result_id: 'kr-102',
        titulo: 'Ficha de Cadastro de 50 Multiplicadores - Ceilândia Norte',
        descricao: 'Documento digitalizado em PDF com formulário e assinaturas.',
        arquivo_url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
        tipo_artefato: 'comprovante',
        enviado_por: 'Marcos Silva (Ceilândia Norte)',
        status: 'pendente',
        created_at: '2026-08-16T18:00:00Z'
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
        if (!body.titulo) {
            return res.status(400).json({ success: false, error: 'Título é obrigatório.' });
        }
        const newArtefato = {
            id: `art-${Date.now()}`,
            key_result_id: body.key_result_id || 'kr-101',
            titulo: body.titulo,
            descricao: body.descricao || '',
            arquivo_url: body.arquivo_url || 'https://via.placeholder.com/300?text=Artefato+Digitalizado',
            tipo_artefato: body.tipo_artefato || 'comprovante',
            enviado_por: body.enviado_por || 'Coordenador Logado',
            status: 'pendente',
            created_at: new Date().toISOString()
        };
        mockArtefatos.push(newArtefato);
        return res.status(201).json({ success: true, data: newArtefato });
    }

    return res.status(200).json({
        success: true,
        artefatos: mockArtefatos
    });
}
