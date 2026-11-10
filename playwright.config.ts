import { defineConfig, devices, type Project } from '@playwright/test';
import { ConfigManager } from './src/config/ConfigManager';

const viewport = { width: ConfigManager.windowWidth(), height: ConfigManager.windowHeight() };

/** Every browser the suite can run on; `browser` in config.properties picks one. */
const browsers: Project[] = [
  { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport } },
  { name: 'chrome', use: { ...devices['Desktop Chrome'], channel: 'chrome', viewport } },
  { name: 'edge', use: { ...devices['Desktop Edge'], channel: 'msedge', viewport } },
  { name: 'firefox', use: { ...devices['Desktop Firefox'], viewport } },
  { name: 'webkit', use: { ...devices['Desktop Safari'], viewport } },
];

const selected = browsers.filter((project) => project.name === ConfigManager.browser());
if (selected.length === 0) {
  throw new Error(
    `Unsupported browser '${ConfigManager.browser()}'. Use one of: ${browsers.map((p) => p.name).join(', ')}`,
  );
}

/**
 * Replaces the Selenium framework's DriverFactory, TestNG suite XMLs,
 * RetryAnalyzer and ExtentReports listener.
 *
 * Runs strictly one test at a time: the app allows ONE active session per
 * account, so two tests signed in as Admin would log each other out.
 */
export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: ConfigManager.retryCount(),
  timeout: ConfigManager.testTimeout(),
  expect: { timeout: ConfigManager.explicitWait() },
  outputDir: ConfigManager.get('artifacts.dir'),
  reporter: [
    ['list'],
    ['html', { outputFolder: ConfigManager.get('report.dir'), open: 'never' }],
  ],
  use: {
    baseURL: ConfigManager.baseUrl(),
    headless: ConfigManager.headless(),
    locale: 'en-US',
    actionTimeout: ConfigManager.explicitWait(),
    navigationTimeout: ConfigManager.pageLoadTimeout(),
    screenshot: ConfigManager.get('screenshot', 'only-on-failure') as 'on' | 'off' | 'only-on-failure',
    trace: ConfigManager.get('trace', 'retain-on-failure') as 'on' | 'off' | 'retain-on-failure',
    video: ConfigManager.get('video', 'retain-on-failure') as 'on' | 'off' | 'retain-on-failure',
  },
  projects: selected,
});
