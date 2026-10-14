import { defineConfig, devices, PlaywrightTestConfig } from '@playwright/test';
import * as os from 'os';
import { ConfigManager } from './src/config/ConfigManager';
import { FrameworkError } from './src/exceptions/errors';

/**
 * Browser selection, driven by the `browser` config key (or BROWSER env var).
 *
 * Playwright downloads and pins its own browser builds, so - as with Selenium
 * Manager before - there is nothing to keep in sync when Chrome auto-updates.
 * "chrome" and "edge" use the installed branded browsers, the same ones the
 * Selenium suite drove; remote-* connect to a Playwright server at grid.url
 * (npx playwright run-server), Playwright's equivalent of a Selenium Grid.
 */
function browserOptions(): PlaywrightTestConfig['use'] {
    const browser = ConfigManager.browser().toLowerCase().trim();
    // A predictable viewport keeps MUI responsive breakpoints stable: below
    // ~900px the app collapses its side rail into a drawer and the nav
    // locators would legitimately stop matching.
    const viewport = {
        width: ConfigManager.getInt('browser.width'),
        height: ConfigManager.getInt('browser.height'),
    };
    const chromiumArgs = [
        '--disable-notifications',
        '--disable-popup-blocking',
        '--disable-features=PasswordLeakDetection,AutofillServerCommunication',
    ];
    switch (browser) {
        case 'chrome':
            return { ...devices['Desktop Chrome'], channel: 'chrome', viewport, launchOptions: { args: chromiumArgs } };
        case 'chromium':
            return { ...devices['Desktop Chrome'], viewport, launchOptions: { args: chromiumArgs } };
        case 'edge':
            return { ...devices['Desktop Edge'], channel: 'msedge', viewport, launchOptions: { args: chromiumArgs } };
        case 'firefox':
            return {
                ...devices['Desktop Firefox'], viewport,
                launchOptions: { firefoxUserPrefs: { 'dom.webnotifications.enabled': false, 'signon.rememberSignons': false } },
            };
        case 'webkit':
            return { ...devices['Desktop Safari'], viewport };
        case 'remote-chrome':
            return { ...devices['Desktop Chrome'], viewport, connectOptions: { wsEndpoint: ConfigManager.get('grid.url') } };
        case 'remote-firefox':
            return { ...devices['Desktop Firefox'], viewport, connectOptions: { wsEndpoint: ConfigManager.get('grid.url') } };
        default:
            throw new FrameworkError(`Unsupported browser '${browser}'. Use chrome, chromium, firefox, edge, `
                + 'webkit, remote-chrome or remote-firefox.');
    }
}

const reportDir = ConfigManager.get('report.dir');

export default defineConfig({
    testDir: './tests',
    // One persona sweep signs in, visits a dozen modules and screenshots each
    // soft check, so the default 30s per test is nowhere near enough.
    timeout: ConfigManager.getInt('test.timeout.minutes') * 60_000,
    expect: { timeout: ConfigManager.explicitWait() },

    // The application allows ONE active session per user account, so two
    // tests signing in as the same persona at once log each other out. The
    // framework is parallel-ready (each worker has its own page and no shared
    // state), but the accounts are not: workers stays at 1 until each worker
    // has its own Admin and HR login. See README "One constraint".
    workers: 1,
    fullyParallel: false,
    forbidOnly: !!process.env.CI,

    globalSetup: require.resolve('./src/reporting/globalSetup'),
    outputDir: 'test-output/test-results',
    reporter: [
        ['list'],
        ['html', { outputFolder: `${reportDir}/html`, open: 'never' }],
        ['junit', { outputFile: `${reportDir}/junit-results.xml` }],
    ],

    // Environment block shown at the top of the HTML report.
    metadata: {
        'Application': ConfigManager.baseUrl(),
        'Tenant / Company Code': ConfigManager.tenantCode(),
        'Browser': ConfigManager.browser(),
        'Headless': String(ConfigManager.headless()),
        'Node': process.version,
        'OS': `${os.type()} ${os.release()}`,
        'Executed By': os.userInfo().username,
    },

    use: {
        ...browserOptions(),
        baseURL: ConfigManager.baseUrl(),
        headless: ConfigManager.headless(),
        navigationTimeout: ConfigManager.pageLoadTimeout(),
        actionTimeout: ConfigManager.explicitWait(),
        // Screenshots are taken by the BaseTest fixture once the screen has
        // settled, so Playwright's own capture is off. A trace is kept for
        // failures - it replays every step, which a screenshot cannot.
        screenshot: 'off',
        trace: 'retain-on-failure',
        locale: 'en-US',
    },

    projects: [
        {
            // The real suite: every spec except the healing/flaky demo set.
            // Files run in folder order - auth, navigation, RBAC, configuration,
            // employee, leave, inter-module - the same order as smoke.xml:
            // nothing else can pass if sign-in is broken, and the inter-module
            // checks are the slowest and depend most on everything before them.
            name: 'hrms',
            testIgnore: /demo[\\/]/,
            retries: ConfigManager.retryCount(),
        },
        {
            // The healing / flaky-detection demo - see FLAKY_HEALING_DEMO.md.
            // No retries, so every failure shows on the first attempt instead
            // of being hidden by a retry.
            name: 'demo',
            testMatch: /demo[\\/].*\.spec\.ts/,
            retries: 0,
        },
    ],
});
