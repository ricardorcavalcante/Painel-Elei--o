// candidata.js — bootstrap de candidata.html: painel-resumo somente-
// leitura (Central de Comando + Equipe + lista de OKRs + Artefatos),
// reaproveitando okr-shared.js inteiro. A própria candidata.html não
// tem nenhum botão de escrita (renderOKRActionButtons nunca é chamado
// aqui) — as ações de fato (definir OKR, aprovar agenda, registrar
// coordenador, mapa de quadrantes) ficam em admin.html/okrs.html/
// coordenador.html, hoje também acessíveis à candidata (guardPage
// allowedRoles + RLS is_candidata()), navegáveis pelo dropdown
// "Navegar" no topbar (auth-shared.js renderPageNav()).

async function initCandidataPage(sb, ctx) {
    seedSupabaseClient(sb);
    setOkrUser(ctx.profile, []);
    renderComandoSkeleton();
    await Promise.allSettled([loadOKRData(), loadPrazosTSE(), loadAgendaEventosBasico(), fetchComandoCheckins(), fetchComandoExecucao()]);
    renderComando();
    renderOKRs({ readOnly: true });
}
