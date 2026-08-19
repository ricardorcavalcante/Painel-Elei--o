import { test, expect } from '@playwright/test';

// Fase 4 (Formulários reais + responsividade) — cobertura das 7 páginas
// novas da reestruturação por papel (Fases 1-3) em pelo menos 2 viewports
// (desktop + mobile) cada, conforme critério de aceite da Fase 4. Este
// arquivo roda uma vez por projeto do playwright.config.js: "chromium"
// (1440x900) e "mobile" (iPhone 13) — sem loop manual de viewport aqui,
// é a matriz de projetos que faz a cobertura dupla.
// Contas de teste (mesma senha pra todas): ver .claude/skills/run-app-eleitoral.
const SCREENSHOTS = './test-results/screenshots';
const SENHA = 'Teste@2026';

async function login(page, email) {
    await page.goto('/login.html', { waitUntil: 'domcontentloaded' });
    await page.fill('#login-email', email);
    await page.fill('#login-password', SENHA);
    await page.click('button:has-text("Entrar")');
    await page.waitForSelector('.page-user', { timeout: 15000 });
}

test.describe('Páginas novas (Fase 1-3) — responsividade', () => {
    test('agenda.html — leitura pública sem login', async ({ page }, testInfo) => {
        await page.goto('/agenda.html', { waitUntil: 'domcontentloaded' });
        await expect(page.locator('#agenda-publica-container')).toBeVisible({ timeout: 10000 });
        await expect(page.locator('#prazos-tse-table')).toBeVisible();
        // Tabela larga precisa rolar horizontalmente, nunca vazar a página.
        await expect(page.locator('.table-container').first()).toHaveCSS('overflow-x', 'auto');
        await page.screenshot({ path: `${SCREENSHOTS}/novas-${testInfo.project.name}-agenda.png` });
    });

    test('login.html — formulário carrega e não estoura a viewport', async ({ page }, testInfo) => {
        await page.goto('/login.html', { waitUntil: 'domcontentloaded' });
        await expect(page.locator('#login-email')).toBeVisible();
        await expect(page.locator('#login-password')).toBeVisible();
        const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
        const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
        expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
        await page.screenshot({ path: `${SCREENSHOTS}/novas-${testInfo.project.name}-login.png` });
    });

    test('admin.html — Central de Comando carrega após login de super_admin', async ({ page }, testInfo) => {
        await login(page, 'admin.teste@example.com');
        await expect(page).toHaveURL(/admin\.html/);
        await expect(page.locator('.comando-kpis')).toBeVisible({ timeout: 10000 });
        await page.screenshot({ path: `${SCREENSHOTS}/novas-${testInfo.project.name}-admin.png` });
    });

    test('okrs.html — botões de ação carregam após login de super_admin', async ({ page }, testInfo) => {
        await login(page, 'admin.teste@example.com');
        await page.goto('/okrs.html', { waitUntil: 'domcontentloaded' });
        await expect(page.locator('#okr-btn-group')).toBeVisible({ timeout: 10000 });
        await expect(page.locator('#okr-btn-group button, #okr-btn-group a').first()).toBeVisible();
        await page.screenshot({ path: `${SCREENSHOTS}/novas-${testInfo.project.name}-okrs.png` });
    });

    test('coordenador.html — Equipe e Quadrantes carregam após login de coordenador', async ({ page }, testInfo) => {
        await login(page, 'coordenador.teste@example.com');
        await expect(page).toHaveURL(/coordenador\.html/);
        await expect(page.locator('#coord-app')).toBeVisible({ timeout: 10000 });
        await expect(page.locator('#coord-equipe-container')).toBeVisible();
        await page.screenshot({ path: `${SCREENSHOTS}/novas-${testInfo.project.name}-coordenador.png` });
    });

    test('voluntario.html — Meus Quadrantes carrega após login de voluntário', async ({ page }, testInfo) => {
        await login(page, 'voluntario1.teste@example.com');
        await expect(page).toHaveURL(/voluntario\.html/);
        await expect(page.locator('#checkin-quadrantes-container')).toBeVisible({ timeout: 10000 });
        await page.screenshot({ path: `${SCREENSHOTS}/novas-${testInfo.project.name}-voluntario.png` });
    });

    test('candidata.html — sem sessão redireciona para login (guardPage)', async ({ page }) => {
        // Sem conta de teste com is_candidata=true disponível neste ambiente;
        // cobre o que dá pra verificar sem credenciais — a guarda de acesso
        // funciona igual nas 5 páginas autenticadas.
        await page.goto('/candidata.html', { waitUntil: 'domcontentloaded' });
        await page.waitForURL(/login\.html/, { timeout: 10000 });
        await expect(page.locator('#login-email')).toBeVisible();
    });
});
