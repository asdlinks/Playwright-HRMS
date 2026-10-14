import * as fs from 'fs';
import * as path from 'path';
import { FrameworkError } from '../exceptions/errors';

/**
 * Single source of truth for configuration.
 *
 * Resolution order (first hit wins):
 *   1. Environment variable   BROWSER=firefox          (CI / npm scripts)
 *   2. config.properties      browser=chrome           (committed default)
 *
 * The environment variable is the key upper-cased with dots replaced by
 * underscores, so base.url is BASE_URL. That order is what lets one committed
 * config file serve local runs, the "ci" script and a remote run without ever
 * being edited.
 */
export const RESOURCES_DIR = path.resolve(__dirname, '..', '..', 'resources');
const CONFIG_FILE = path.join(RESOURCES_DIR, 'config.properties');

const PROPERTIES: Map<string, string> = load();

function load(): Map<string, string> {
    if (!fs.existsSync(CONFIG_FILE)) {
        throw new FrameworkError(CONFIG_FILE + ' not found');
    }
    const properties = new Map<string, string>();
    for (const rawLine of fs.readFileSync(CONFIG_FILE, 'utf8').split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#') || line.startsWith('!')) {
            continue;
        }
        const separator = line.search(/[=:]/);
        if (separator < 0) {
            continue;
        }
        properties.set(line.substring(0, separator).trim(), line.substring(separator + 1).trim());
    }
    return properties;
}

function resolve(key: string): string | undefined {
    const fromEnv = process.env[key.toUpperCase().replace(/\./g, '_')];
    if (fromEnv !== undefined && fromEnv.trim() !== '') {
        return fromEnv;
    }
    return PROPERTIES.get(key);
}

export const ConfigManager = {

    // ------------------------------------------------------------------ core

    get(key: string, defaultValue?: string): string {
        const value = resolve(key);
        if (value === undefined || value.trim() === '') {
            if (defaultValue !== undefined) {
                return defaultValue;
            }
            throw new FrameworkError(`Config key '${key}' is missing or empty`);
        }
        return value.trim();
    },

    getInt(key: string): number {
        const value = ConfigManager.get(key);
        const parsed = Number(value);
        if (!Number.isInteger(parsed)) {
            throw new FrameworkError(`Config key '${key}' is not a number: ${value}`);
        }
        return parsed;
    },

    getBoolean(key: string): boolean {
        return ConfigManager.get(key).toLowerCase() === 'true';
    },

    /** A value configured in seconds, returned in milliseconds. */
    getSecondsAsMillis(key: string): number {
        return ConfigManager.getInt(key) * 1000;
    },

    // ------------------------------------------------------- typed shortcuts

    baseUrl(): string {
        return ConfigManager.get('base.url');
    },

    loginUrl(): string {
        return ConfigManager.baseUrl() + ConfigManager.get('login.path');
    },

    /** Absolute URL for an in-app route such as /employees. */
    urlFor(route: string): string {
        return ConfigManager.baseUrl() + route;
    },

    tenantCode(): string {
        return ConfigManager.get('tenant.code');
    },

    browser(): string {
        return ConfigManager.get('browser');
    },

    headless(): boolean {
        return ConfigManager.getBoolean('headless');
    },

    /** Explicit wait in milliseconds. */
    explicitWait(): number {
        return ConfigManager.getSecondsAsMillis('explicit.wait');
    },

    spaSettleWait(): number {
        return ConfigManager.getSecondsAsMillis('spa.settle.wait');
    },

    pollingInterval(): number {
        return ConfigManager.getInt('polling.interval.millis');
    },

    pageLoadTimeout(): number {
        return ConfigManager.getSecondsAsMillis('page.load.timeout');
    },

    nativeClickTimeout(): number {
        return ConfigManager.getInt('native.click.timeout.millis');
    },

    retryCount(): number {
        return Number.parseInt(ConfigManager.get('retry.count', '1'), 10);
    },
};
