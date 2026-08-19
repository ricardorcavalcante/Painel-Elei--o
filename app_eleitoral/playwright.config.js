import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
    testDir: './tests',
    timeout: 60_000,
    retries: 0,
    reporter: [['list']],
    use: {
        headless: true,
        viewport: { width: 1440, height: 900 },
        baseURL: 'http://localhost:4173',
        screenshot: 'on',
    },
    projects: [
        { name: 'chromium', use: { browserName: 'chromium' } },
        // Fase 4 (responsividade) — cobre as páginas novas também em
        // viewport mobile; navigator.geolocation vem pré-autorizado
        // (fixado no Plano Piloto/DF) pra fluxos como voluntario.html
        // não travarem esperando um prompt que o headless nunca mostra.
        // Só roda new-pages-responsive.spec.js: visual-layers.spec.js
        // (exceto o teste 11, que já troca de viewport sozinho) assume
        // a sidebar/coluna de zonas sempre visíveis — o comportamento
        // off-canvas de telas estreitas faria vários desses testes
        // falharem por motivo errado (elemento fora da viewport, não
        // um bug real).
        {
            name: 'mobile',
            testMatch: /new-pages-responsive\.spec\.js/,
            use: {
                ...devices['iPhone 13'],
                geolocation: { latitude: -15.7801, longitude: -47.9292 },
                permissions: ['geolocation'],
            },
        },
    ],
    webServer: {
        command: 'npm run preview',
        port: 4173,
        reuseExistingServer: true,
        timeout: 15_000,
    },
});
