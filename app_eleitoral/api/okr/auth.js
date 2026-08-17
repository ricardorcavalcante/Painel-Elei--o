// Vercel Serverless Function: Auth Handler (JWT / E-mail / Google OAuth Mock/Supabase)
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
        const { email, password, provider, action } = req.body || {};

        if (action === 'google_login') {
            // Callback / Mock de autenticação Google OAuth
            return res.status(200).json({
                success: true,
                user: {
                    id: 'google-user-demo-id',
                    email: email || 'usuario.google@campanha.com.br',
                    full_name: 'Coordenador Google OAuth',
                    role: 'tatico',
                    avatar_url: 'https://lh3.googleusercontent.com/a/default-user'
                },
                token: 'mock-jwt-token-google-oauth-2026'
            });
        }

        if (action === 'login' || action === 'register') {
            if (!email) {
                return res.status(400).json({ success: false, error: 'E-mail é obrigatório.' });
            }
            return res.status(200).json({
                success: true,
                user: {
                    id: 'user-demo-id-123',
                    email,
                    full_name: email.split('@')[0].toUpperCase(),
                    role: email.includes('admin') ? 'estrategico' : 'tatico'
                },
                token: 'jwt-session-token-eleitoral-2026'
            });
        }
    }

    return res.status(200).json({ status: 'ok', service: 'OKRs Auth Service Vercel' });
}
