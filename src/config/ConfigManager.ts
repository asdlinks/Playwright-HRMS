import * as fs from 'fs';
import * as path from 'path';
import { FrameworkException } from '../exceptions/FrameworkException';

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const RESOURCES_DIR = path.join(PROJECT_ROOT, 'tests', 'resources');
const CONFIG_FILE = path.join(RESOURCES_DIR, 'config.properties');

function load(): Map<string, string> {
  if (!fs.existsSync(CONFIG_FILE)) {
    throw new FrameworkException(`${CONFIG_FILE} not found`);
  }
  const properties = new Map<string, string>();
  for (const raw of fs.readFileSync(CONFIG_FILE, 'utf-8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || line.startsWith('!')) {
      continue;
    }
    const separator = line.indexOf('=');
    if (separator > 0) {
      properties.set(line.slice(0, separator).trim(), line.slice(separator + 1).trim());
    }
  }
  return properties;
}

/**
 * Single source of truth for configuration.
 *
 * Resolution order (first hit wins):
 *   1. Environment variable   BROWSER=firefox     (CI, containers, one-off runs)
 *   2. config.properties      browser=chromium    (committed default)
 *
 * The variable name is the key upper-cased with dots replaced by underscores
 * (base.url -> BASE_URL). That order lets one committed config file serve
 * local runs, CI and a different environment without ever being edited.
 *
 * Durations are returned in MILLISECONDS - Playwright's unit - even though
 * the file keeps the Selenium framework's seconds.
 */
export class ConfigManager {
  private static readonly properties = load();

  private constructor() {}

  // ------------------------------------------------------------------ core

  static get(key: string, defaultValue?: string): string {
    const value = ConfigManager.resolve(key);
    if (value === undefined || value.trim() === '') {
      if (defaultValue !== undefined) {
        return defaultValue;
      }
      throw new FrameworkException(`Config key '${key}' is missing or empty`);
    }
    return value.trim();
  }

  static getInt(key: string, defaultValue?: number): number {
    const raw = ConfigManager.get(key, defaultValue === undefined ? undefined : String(defaultValue));
    const value = Number.parseInt(raw, 10);
    if (Number.isNaN(value)) {
      throw new FrameworkException(`Config key '${key}' is not a number: ${raw}`);
    }
    return value;
  }

  static getBoolean(key: string, defaultValue = false): boolean {
    return ConfigManager.get(key, String(defaultValue)).toLowerCase() === 'true';
  }

  /** A value stored in seconds, returned in milliseconds. */
  static getSeconds(key: string): number {
    return ConfigManager.getInt(key) * 1000;
  }

  private static resolve(key: string): string | undefined {
    const fromEnv = process.env[key.toUpperCase().replace(/\./g, '_')];
    if (fromEnv !== undefined && fromEnv.trim() !== '') {
      return fromEnv;
    }
    return ConfigManager.properties.get(key);
  }

  // ------------------------------------------------------- typed shortcuts

  static projectRoot(): string {
    return PROJECT_ROOT;
  }

  static resourcesDir(): string {
    return RESOURCES_DIR;
  }

  static baseUrl(): string {
    return ConfigManager.get('base.url');
  }

  static loginUrl(): string {
    return ConfigManager.baseUrl() + ConfigManager.get('login.path');
  }

  /** Absolute URL for an in-app route such as /employees. */
  static urlFor(route: string): string {
    return ConfigManager.baseUrl() + route;
  }

  static tenantCode(): string {
    return ConfigManager.get('tenant.code');
  }

  static browser(): string {
    return ConfigManager.get('browser', 'chromium').toLowerCase();
  }

  /** Headless when configured, and always on CI. */
  static headless(): boolean {
    return ConfigManager.getBoolean('headless') || !!process.env.CI;
  }

  static windowWidth(): number {
    return ConfigManager.getInt('browser.width', 1920);
  }

  static windowHeight(): number {
    return ConfigManager.getInt('browser.height', 1080);
  }

  static explicitWait(): number {
    return ConfigManager.getSeconds('explicit.wait');
  }

  static spaSettleWait(): number {
    return ConfigManager.getSeconds('spa.settle.wait');
  }

  static dataSettleWait(): number {
    return ConfigManager.getSeconds('data.settle.wait');
  }

  static pageLoadTimeout(): number {
    return ConfigManager.getSeconds('page.load.timeout');
  }

  static pollingInterval(): number {
    return ConfigManager.getInt('polling.interval.millis', 300);
  }

  static testTimeout(): number {
    return ConfigManager.getSeconds('test.timeout');
  }

  /** Retries per failed test; CI gets two, like the Selenium "ci" profile. */
  static retryCount(): number {
    return process.env.CI ? ConfigManager.getInt('retry.count.ci', 2) : ConfigManager.getInt('retry.count', 1);
  }
}
