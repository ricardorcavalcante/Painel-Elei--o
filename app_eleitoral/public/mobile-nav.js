// mobile-nav.js — abre/fecha .sidebar e .zonas-column como painéis
// off-canvas em telas <=860px (Fase 4, responsividade). Só alterna
// classes CSS (ver style.css) — qual .zonas-column está ativa
// (mapa vs RA) continua 100% controlado por switchTab() em app.js;
// aqui só decide se a coluna ativa fica visível ou escondida fora
// da tela.

function toggleMobileSidebar() {
    document.querySelector('.sidebar').classList.toggle('mobile-open');
    closeMobileZonas();
    syncMobileBackdrop();
}

function toggleMobileZonas() {
    document.querySelectorAll('.zonas-column').forEach(el => el.classList.toggle('mobile-open'));
    closeMobileSidebar();
    syncMobileBackdrop();
}

function closeMobileSidebar() {
    const sidebar = document.querySelector('.sidebar');
    if (sidebar) sidebar.classList.remove('mobile-open');
}

function closeMobileZonas() {
    document.querySelectorAll('.zonas-column').forEach(el => el.classList.remove('mobile-open'));
}

function closeAllMobilePanels() {
    closeMobileSidebar();
    closeMobileZonas();
    syncMobileBackdrop();
}

function syncMobileBackdrop() {
    const backdrop = document.querySelector('.mobile-backdrop');
    if (!backdrop) return;
    const sidebarOpen = document.querySelector('.sidebar')?.classList.contains('mobile-open');
    const zonasOpen = [...document.querySelectorAll('.zonas-column')].some(el => el.classList.contains('mobile-open'));
    backdrop.classList.toggle('active', !!(sidebarOpen || zonasOpen));
}
