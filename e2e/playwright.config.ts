/**
 * Browser tests of a built edition.
 *
 * The edition is whatever `dist/<edition>/` holds, so build it first (`npm run build:edition -- --profile psg` in the
 * builder root); `E2E_EDITION` picks another one.
 * @package    epicurrents/builder
 * @copyright  2026 Sampsa Lohi
 * @license    Apache-2.0
 */
import { defineConfig, devices } from '@playwright/test'

const edition = process.env.E2E_EDITION || 'psg'
const port = Number(process.env.E2E_PORT || 4173)

export default defineConfig({
    testDir: './tests',
    globalSetup: './global-setup.ts',
    outputDir: './test-results',
    fullyParallel: false,
    forbidOnly: !!process.env.CI,
    retries: 0,
    timeout: 60_000,
    reporter: [['list'], ['html', { open: 'never', outputFolder: './playwright-report' }]],
    use: {
        baseURL: `http://127.0.0.1:${port}/`,
        screenshot: 'only-on-failure',
        trace: 'retain-on-failure',
        viewport: { width: 1600, height: 900 },
    },
    // Full Chromium in new headless mode rather than the headless shell: the interface admits a browser by
    // `window.chrome`, which the shell does not define, and the `?override` escape hatch would test a path no
    // supported browser takes.
    projects: [{
        name: 'chromium',
        use: { ...devices['Desktop Chrome'], channel: 'chromium', viewport: { width: 1600, height: 900 } },
    }],
    webServer: {
        command: `node server.mjs ${edition} ${port}`,
        url: `http://127.0.0.1:${port}/`,
        reuseExistingServer: !process.env.CI,
        stdout: 'pipe',
    },
})
