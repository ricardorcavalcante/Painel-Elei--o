// auth-shared.js
// ------------------------------------------------------------
// Ponto único de entrada para sessão/papel do usuário, compartilhado
// por login.html e pelas páginas de destino por papel (admin.html,
// okrs.html, candidata.html, coordenador.html, voluntario.html).
//
// Consolida a lógica hoje espalhada em refreshOKRSession() e
// bootstrapComandoSession() (public/app.js) e substitui as 6
// re-registrations do listener de auth por um único bindAuthListener()
// por carregamento de página. Primeiro ES module do projeto — decisão
// tomada para a Fase 1 (Fundação de autenticação e roteamento); todo
// consumidor precisa carregar isto via <script type="module">.
//
// Papel não é um campo único: super_admin e is_candidata vêm de
// profiles; coordenador/operacional vêm de product_team.papel (N:M);
// voluntário vem só de ter linha em area_volunteers. resolveRoleDestination()
// resolve a precedência entre os quatro que têm página própria nesta
// fase — operacional (product_team sem papel='coordenador') ainda não
// tem página de destino e cai em "pendente" (decisão de produto da
// Fase 1: não reaproveita admin.html).
// ------------------------------------------------------------

export const ROLE_PAGES = Object.freeze({
    superAdmin: 'admin.html',
    coordenador: 'coordenador.html',
    candidata: 'candidata.html',
    voluntario: 'voluntario.html',
});

// Mesma checagem usada hoje em app.js: sem credenciais Supabase
// interpoladas (dev local sem .env, ou build sem as env vars), não dá
// pra seguir — todo consumidor precisa tratar o retorno null.
export function initSupabaseClient() {
    const url = window.SUPABASE_URL;
    const key = window.SUPABASE_ANON_KEY;
    if (!window.supabase || !url || !key || url.indexOf('VITE_SUPABASE_URL') !== -1) {
        return null;
    }
    return window.supabase.createClient(url, key);
}

// Busca sessão + profile + vínculos de papel. ctx.session é null quando
// não há usuário logado; nesse caso os demais campos vêm vazios/default.
export async function loadSessionContext(sb) {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) {
        return { session: null, profile: null, coordProductIds: [], isCoordenador: false, isVoluntario: false };
    }

    const [{ data: profile }, { data: team }, { data: vol }] = await Promise.all([
        sb.from('profiles').select('*').eq('id', session.user.id).maybeSingle(),
        sb.from('product_team').select('product_id, papel').eq('user_id', session.user.id),
        sb.from('area_volunteers').select('area_id').eq('user_id', session.user.id).limit(1),
    ]);

    const coordProductIds = (team || []).filter(t => t.papel === 'coordenador').map(t => t.product_id);

    return {
        session,
        profile: profile || {
            id: session.user.id,
            email: session.user.email,
            full_name: session.user.email,
            is_super_admin: false,
            is_candidata: false,
        },
        coordProductIds,
        isCoordenador: coordProductIds.length > 0,
        isVoluntario: (vol || []).length > 0,
    };
}

// Conjunto dos papéis que o usuário efetivamente tem — um usuário pode
// acumular mais de um (ex.: coordenador de uma Coordenação e também
// voluntário/check-in). Usado por guardPage() para checar acesso a
// páginas que aceitam mais de um papel (ex. okrs.html).
export function activeRoles(ctx) {
    const roles = new Set();
    if (!ctx || !ctx.session) return roles;
    if (ctx.profile.is_super_admin) roles.add('superAdmin');
    if (ctx.isCoordenador) roles.add('coordenador');
    if (ctx.profile.is_candidata) roles.add('candidata');
    if (ctx.isVoluntario) roles.add('voluntario');
    return roles;
}

// Precedência de redirect pós-login, decidida na Fase 1: super_admin >
// coordenador > candidata > voluntário > pendente. Retorna a URL de
// destino, 'pendente' (logado, sem nenhum papel com página própria) ou
// null (não logado).
export function resolveRoleDestination(ctx) {
    if (!ctx || !ctx.session) return null;
    const { profile, isCoordenador, isVoluntario } = ctx;
    if (profile.is_super_admin) return ROLE_PAGES.superAdmin;
    if (isCoordenador) return ROLE_PAGES.coordenador;
    if (profile.is_candidata) return ROLE_PAGES.candidata;
    if (isVoluntario) return ROLE_PAGES.voluntario;
    return 'pendente';
}

// Navegação entre páginas de papel (dropdown no topbar) — só entra em
// jogo pra quem realmente tem mais de um destino acessível: super_admin
// (admin/okrs/coordenador) e coordenador (coordenador/okrs, já que
// okrs.html aceita os dois — mesmos allowedRoles usados em cada
// guardPage()). candidata.html/voluntario.html não entram aqui: cada
// papel ali só tem uma página própria, nenhuma navegação a oferecer.
const PAGE_NAV_ENTRIES = [
    { role: 'superAdmin', href: 'admin.html', label: '🧭 Central de Comando' },
    { role: 'coordenador', href: 'coordenador.html', label: '🧑‍💼 Painel do Coordenador' },
    { anyOf: ['superAdmin', 'coordenador'], href: 'okrs.html', label: '🎯 OKRs & Coordenações' },
];

// Renderiza o dropdown de navegação em #page-nav-slot (se a página tiver
// esse elemento) com os destinos que o papel do usuário permite. Não
// renderiza nada se sobrar só 1 destino (nada pra navegar). currentHref
// é o nome do próprio arquivo (ex. 'admin.html'), pra marcar o item
// ativo e não linkar pra própria página.
export function renderPageNav(ctx, currentHref) {
    const container = document.getElementById('page-nav-slot');
    if (!container) return;

    const roles = activeRoles(ctx);
    const entries = PAGE_NAV_ENTRIES.filter(e =>
        e.role ? roles.has(e.role) : e.anyOf.some(r => roles.has(r))
    );
    if (entries.length < 2) return;

    container.innerHTML = `
        <div class="page-nav">
            <button type="button" class="page-nav-toggle" aria-haspopup="true" aria-expanded="false">☰ Navegar ▾</button>
            <div class="page-nav-menu">
                ${entries.map(e => `<a href="${e.href}" class="page-nav-item${e.href === currentHref ? ' active' : ''}">${e.label}</a>`).join('')}
            </div>
        </div>
    `;

    const toggle = container.querySelector('.page-nav-toggle');
    const menu = container.querySelector('.page-nav-menu');
    toggle.addEventListener('click', (evt) => {
        evt.stopPropagation();
        const open = menu.classList.toggle('open');
        toggle.setAttribute('aria-expanded', String(open));
    });
    document.addEventListener('click', () => {
        menu.classList.remove('open');
        toggle.setAttribute('aria-expanded', 'false');
    });
}

let authListenerBound = false;

// Registra o listener de auth uma única vez por carregamento de
// página — substitui as 6 chamadas redundantes de
// sb.auth.onAuthStateChange(() => refreshOKRSession()) hoje espalhadas
// em app.js (uma por módulo que inicializa sessão).
export function bindAuthListener(sb, callback) {
    if (authListenerBound) return;
    authListenerBound = true;
    sb.auth.onAuthStateChange(() => callback());
}

export async function signInEmail(sb, email, password) {
    if (!email || !password) return { error: { message: 'Informe e-mail e senha.' } };
    return sb.auth.signInWithPassword({ email, password });
}

export async function signInGoogle(sb) {
    return sb.auth.signInWithOAuth({ provider: 'google' });
}

export async function signOut(sb) {
    return sb.auth.signOut();
}

function renderFullPageMessage(html) {
    document.body.innerHTML = `<div style="max-width:480px;margin:15vh auto;padding:0 24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;text-align:center;color:#333;">${html}</div>`;
}

// Guarda de página para os destinos autenticados (admin.html,
// okrs.html, candidata.html, coordenador.html, voluntario.html):
// - sem sessão → manda pro login.
// - sessão sem nenhum papel de allowedRoles → manda pro destino real
//   do usuário (ou pendente/login se ele não tiver nenhum destino).
// - papel ok → liga o listener de auth (uma vez) e devolve {sb, ctx}
//   pra página usar.
export async function guardPage({ allowedRoles }) {
    const sb = initSupabaseClient();
    if (!sb) {
        renderFullPageMessage('<p>Painel não configurado: defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.</p>');
        return null;
    }

    const ctx = await loadSessionContext(sb);
    if (!ctx.session) {
        window.location.href = 'login.html';
        return null;
    }

    const roles = activeRoles(ctx);
    const allowed = allowedRoles.some(r => roles.has(r));
    if (!allowed) {
        const dest = resolveRoleDestination(ctx);
        if (dest && dest !== 'pendente') {
            window.location.href = dest;
        } else {
            renderFullPageMessage('<p>🕓 Acesso pendente: sua conta ainda não tem papel atribuído.</p><p>Fale com o administrador da campanha para liberar seu acesso.</p><p><button onclick="window.location.href=\'login.html\'" style="margin-top:12px;padding:8px 16px;cursor:pointer;">Voltar ao login</button></p>');
        }
        return null;
    }

    bindAuthListener(sb, async () => {
        const fresh = await loadSessionContext(sb);
        if (!fresh.session) window.location.href = 'login.html';
    });

    return { sb, ctx };
}
