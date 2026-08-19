// candidata.js — bootstrap de candidata.html: espelho somente-leitura
// de admin.html (Central de Comando + Equipe) e okrs.html (lista de
// OKRs + Artefatos), reaproveitando okr-shared.js inteiro. Não define
// nenhuma ação própria — não há prompt()/confirm() nem botão de
// escrita nesta página por decisão de arquitetura da Fase 1
// (renderOKRActionButtons nunca é chamado aqui).

async function initCandidataPage(sb, ctx) {
    seedSupabaseClient(sb);
    setOkrUser(ctx.profile, []);
    renderComandoSkeleton();
    await Promise.allSettled([loadOKRData(), loadPrazosTSE(), loadAgendaEventosBasico(), fetchComandoCheckins()]);
    renderComando();
    renderOKRs({ readOnly: true });
}
