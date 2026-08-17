import { defineConfig } from '@playwright/test';

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
    ],
    webServer: {
        command: 'npm run preview',
        port: 4173,
        reuseExistingServer: true,
        timeout: 15_000,
    },
});
