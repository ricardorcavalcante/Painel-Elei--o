import { test, expect } from '@playwright/test';

// Pasta de screenshots
const SCREENSHOTS = './test-results/screenshots';

test.describe('Painel Eleitoral — Verificação Visual das Novas Camadas', () => {

    test.beforeEach(async ({ page }) => {
        // A Google Maps API key pode não estar disponível (build substituiu por vazio),
        // então interceptamos requests de maps.googleapis.com para evitar erros 403/404.
        // O mapa não vai renderizar tiles reais, mas a estrutura DOM e as camadas de dados
        // (polígonos, marcadores, POI) ainda são carregadas.
        await page.goto('/', { waitUntil: 'networkidle', timeout: 30000 });
        // Aguarda o app renderizar (sidebar + zonas-legend deve existir)
        await page.waitForSelector('.sidebar', { timeout: 10000 });
    });

    test('01 — Aba "Mapa" com Zonas Eleitorais carrega corretamente', async ({ page }) => {
        // A aba mapa já vem ativa por padrão
        const mapArea = page.locator('#map');
        await expect(mapArea).toBeVisible();

        // Coluna direita "Zonas Eleitorais" deve estar visível
        const zonasLegend = page.locator('#zonas-legend');
        await expect(zonasLegend).toBeVisible();

        // Deve haver ≥1 item de zona na lista
        const zoneItems = page.locator('#zonas-legend-list .legend-item');
        const count = await zoneItems.count();
        expect(count).toBeGreaterThanOrEqual(1);

        await page.screenshot({ path: `${SCREENSHOTS}/01-mapa-zonas.png`, fullPage: false });
    });

    test('02 — Aba "RAs" exibe coluna de Regiões Administrativas', async ({ page }) => {
        // Clicar na aba RAs
        const raTabBtn = page.locator('.tab-btn[data-tab="ra"]');
        await expect(raTabBtn).toBeVisible();
        await raTabBtn.click();

        // Coluna "ras-legend" deve ficar visível
        const rasLegend = page.locator('#ras-legend');
        await expect(rasLegend).toBeVisible({ timeout: 5000 });

        // Coluna "zonas-legend" deve ficar oculta
        const zonasLegend = page.locator('#zonas-legend');
        await expect(zonasLegend).not.toBeVisible();

        // Deve ter ao menos o item "TODOS" + 1 RA
        const raItems = page.locator('#ras-legend-list .legend-item');
        const count = await raItems.count();
        expect(count).toBeGreaterThanOrEqual(2);

        await page.screenshot({ path: `${SCREENSHOTS}/02-aba-ra-lista.png`, fullPage: false });
    });

    test('03 — Sidebar RA com checkboxes de POI visíveis', async ({ page }) => {
        const raTabBtn = page.locator('.tab-btn[data-tab="ra"]');
        await raTabBtn.click();

        // Sidebar do RA deve estar visível
        const raSidebar = page.locator('#ra-sidebar');
        await expect(raSidebar).toBeVisible({ timeout: 5000 });

        // Checkboxes de camadas de POI
        for (const cat of ['escolas', 'saude', 'seguranca']) {
            const checkbox = page.locator(`#poi-toggle-${cat}`);
            await expect(checkbox).toBeVisible();
            await expect(checkbox).not.toBeChecked();
        }

        await page.screenshot({ path: `${SCREENSHOTS}/03-ra-sidebar-poi-checkboxes.png`, fullPage: false });
    });

    test('04 — Selecionar uma RA atualiza sidebar e destaca locais', async ({ page }) => {
        const raTabBtn = page.locator('.tab-btn[data-tab="ra"]');
        await raTabBtn.click();

        // Espera pelo menos 2 itens na lista de RAs
        const raItems = page.locator('#ras-legend-list .legend-item');
        await expect(raItems.first()).toBeVisible({ timeout: 5000 });

        // Clica no segundo item (index 1), que deve ser a primeira RA real (o index 0 é "TODOS")
        const firstRA = raItems.nth(1);
        await firstRA.click();

        // Sidebar deve mostrar informações da RA (h3 com nome)
        const raSidebarContent = page.locator('#ra-sidebar-content');
        await expect(raSidebarContent).toContainText('Locais', { timeout: 5000 });

        // O item deve ter a classe 'active'
        await expect(firstRA).toHaveClass(/active/);

        await page.screenshot({ path: `${SCREENSHOTS}/04-ra-selecionada.png`, fullPage: false });
    });

    test('05 — Aba Dashboard carrega os gráficos', async ({ page }) => {
        const dashTabBtn = page.locator('.tab-btn[data-tab="dashboard"]');
        await dashTabBtn.click();

        // Container do dashboard deve estar visível
        const dashView = page.locator('#view-dashboard');
        await expect(dashView).toBeVisible({ timeout: 5000 });

        // Os canvas dos gráficos devem existir
        for (const id of ['chartRA', 'chartZona', 'chartLocaisRA']) {
            const canvas = page.locator(`#${id}`);
            await expect(canvas).toBeVisible();
        }

        // KPIs devem ter valores carregados (não "--")
        for (const id of ['kpi-eleitores', 'kpi-locais', 'kpi-media']) {
            const el = page.locator(`#${id}`);
            const text = await el.textContent();
            expect(text).not.toBe('--');
        }

        await page.screenshot({ path: `${SCREENSHOTS}/05-dashboard.png`, fullPage: false });
    });

    test('06 — Transição entre abas preserva estado do mapa', async ({ page }) => {
        // Vai para RAs
        await page.locator('.tab-btn[data-tab="ra"]').click();
        await expect(page.locator('#ras-legend')).toBeVisible({ timeout: 5000 });

        // Volta para Mapa
        await page.locator('.tab-btn[data-tab="map"]').click();
        await expect(page.locator('#zonas-legend')).toBeVisible({ timeout: 5000 });

        // O mapa deve continuar visível
        const mapArea = page.locator('#map');
        await expect(mapArea).toBeVisible();

        await page.screenshot({ path: `${SCREENSHOTS}/06-transicao-abas.png`, fullPage: false });
    });

    test('07 — Selecionar "TODOS" na aba RAs mostra todos os locais', async ({ page }) => {
        await page.locator('.tab-btn[data-tab="ra"]').click();
        const raItems = page.locator('#ras-legend-list .legend-item');
        await expect(raItems.first()).toBeVisible({ timeout: 5000 });

        // Primeiro item deve ser "TODOS"
        const todosItem = raItems.first();
        const todosText = await todosItem.textContent();
        expect(todosText).toContain('TODOS');

        await todosItem.click();

        // Sidebar deve mostrar dados de todas as RAs
        const raSidebarContent = page.locator('#ra-sidebar-content');
        await expect(raSidebarContent).toContainText('Todas as Regiões', { timeout: 5000 });

        await page.screenshot({ path: `${SCREENSHOTS}/07-todos-ra.png`, fullPage: false });
    });

    test('08 — Não há erros de console críticos no carregamento', async ({ page }) => {
        const consoleErrors = [];
        page.on('console', msg => {
            if (msg.type() === 'error') {
                const text = msg.text();
                // Ignorar erros de Google Maps API key (esperado em ambiente de teste)
                if (!text.includes('maps.googleapis') && !text.includes('Google Maps') && !text.includes('gstatic')) {
                    consoleErrors.push(text);
                }
            }
        });

        await page.goto('/', { waitUntil: 'networkidle', timeout: 30000 });
        await page.waitForTimeout(3000); // Espera extra para erros tardios

        // Exibe os erros para depuração (se houver)
        if (consoleErrors.length > 0) {
            console.log('Console errors found:', consoleErrors);
        }
        expect(consoleErrors.length).toBe(0);
    });

    test('09 — Painel de Camadas da aba Zonas com toggles funcionais', async ({ page }) => {
        // Aba Mapa já é default
        const mapSidebar = page.locator('#map-sidebar');
        await expect(mapSidebar).toBeVisible();

        // Checkboxes do painel de camadas da aba Zonas
        const secoesToggle = page.locator('#map-toggle-secoes');
        const zonasToggle = page.locator('#map-toggle-zonas');

        await expect(secoesToggle).toBeVisible();
        await expect(zonasToggle).toBeVisible();
        await expect(secoesToggle).toBeChecked();
        await expect(zonasToggle).toBeChecked();

        // Checkboxes de POIs também devem estar visíveis
        for (const cat of ['escolas', 'saude', 'seguranca']) {
            const checkbox = page.locator(`#map-toggle-${cat}`);
            await expect(checkbox).toBeVisible();
            await expect(checkbox).not.toBeChecked();
        }

        // Alternar o toggle de seções para desmarcado
        await secoesToggle.uncheck();
        await expect(secoesToggle).not.toBeChecked();

        await page.screenshot({ path: `${SCREENSHOTS}/09-mapa-secoes-desmarcado.png`, fullPage: false });
    });

    test('11 — Sidebar e coluna de Zonas viram off-canvas em viewport mobile (Fase 4)', async ({ page }) => {
        await page.setViewportSize({ width: 375, height: 667 });
        // O resize precisa de um instante pra o compositor repintar antes do
        // screenshot — sem isso a captura fica com o layout do viewport antigo.
        await page.waitForTimeout(300);

        const menuToggle = page.locator('.mobile-menu-toggle');
        const zonasToggle = page.locator('.mobile-zonas-toggle');
        await expect(menuToggle).toBeVisible();
        await expect(zonasToggle).toBeVisible();

        // Fechado por padrão: sidebar não deve estar na viewport.
        const sidebar = page.locator('.sidebar');
        await expect(sidebar).not.toHaveClass(/mobile-open/);

        await menuToggle.click();
        await expect(sidebar).toHaveClass(/mobile-open/);
        await expect(page.locator('.mobile-backdrop')).toHaveClass(/active/);
        await page.screenshot({ path: `${SCREENSHOTS}/11-mobile-sidebar-open.png`, fullPage: false });

        // Backdrop fecha o painel.
        await page.locator('.mobile-backdrop').click({ position: { x: 350, y: 300 } });
        await expect(sidebar).not.toHaveClass(/mobile-open/);

        await zonasToggle.click();
        const zonasColumn = page.locator('#zonas-legend');
        await expect(zonasColumn).toHaveClass(/mobile-open/);
        await page.screenshot({ path: `${SCREENSHOTS}/11-mobile-zonas-open.png`, fullPage: false });
    });

    test('10 — Botão "Entrar" e card "Próximos Compromissos" substituem a antiga aba OKR', async ({ page }) => {
        // Fase 2 removeu a aba OKR de index.html (migrou pra okrs.html/admin.html
        // etc. — Fase 1-4 do plano de reestruturação por papel); o teste original
        // (que clicava .tab-btn[data-tab="okr"]) ficou obsoleto porque esse botão
        // não existe mais. Cobre o que ficou no lugar dele em index.html.
        const entrarBtn = page.locator('a.tab-btn[href="login.html"]');
        await expect(entrarBtn).toBeVisible();

        const proximosCard = page.locator('#proximos-compromissos-card');
        await expect(proximosCard).toBeVisible();
        await expect(page.locator('#proximos-compromissos-container')).toBeVisible();

        await page.screenshot({ path: `${SCREENSHOTS}/10-entrar-proximos-compromissos.png`, fullPage: false });
    });

});

