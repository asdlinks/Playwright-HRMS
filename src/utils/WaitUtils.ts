import type { Locator, Page } from '@playwright/test';
import { ConfigManager } from '../config/ConfigManager';
import { DriverManager } from '../driver/DriverManager';
import { WaitTimeoutError } from '../exceptions/errors';
import { Log } from './Log';

/** A selector string (CSS, or "xpath=..." from MuiUtils.xpath) or a Locator. */
export type Target = string | Locator;

/** Text shown by the pre-React bootstrap splash. */
const SPLASH_TEXT = 'Loading Mywe HRMS';

const LOADERS = '.MuiSkeleton-root, .MuiCircularProgress-root, .MuiLinearProgress-root';

function page(): Page {
    return DriverManager.get();
}

/** The first element a target matches - what Selenium's findElement returned. */
export function first(target: Target): Locator {
    return typeof target === 'string' ? page().locator(target).first() : target.first();
}

/** Every element a target matches. */
export function every(target: Target): Locator {
    return typeof target === 'string' ? page().locator(target) : target;
}

function isClosedPageError(error: unknown): boolean {
    return error instanceof Error && /has been closed/.test(error.message);
}

function sleep(millis: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, millis));
}

/**
 * Wait helpers tuned for this specific SPA.
 *
 * Two app behaviours drive everything here:
 *
 *  1. A full page load paints a "Loading Mywe HRMS..." splash before React
 *     mounts. Asserting on content before that clears gives false negatives,
 *     so every navigation funnels through waitForAppShell().
 *
 *  2. Route changes are client-side. The URL updates immediately while the new
 *     view is still fetching, so "URL changed" is never sufficient proof that
 *     a page loaded - content must be asserted too.
 */
export const WaitUtils = {

    /**
     * Polls a condition until it returns a value other than null, undefined
     * or false - the FluentWait the Selenium framework was built on.
     *
     * Errors thrown while the condition runs are swallowed and the poll
     * continues, because a re-rendering React tree (or a navigation that
     * destroys the execution context) throws routinely while a view settles.
     * A closed page is the exception: nothing will change, so it is rethrown.
     */
    async fluently<T>(condition: () => Promise<T | null | undefined | false>,
                      timeoutMillis: number, description: string): Promise<T> {
        const deadline = Date.now() + timeoutMillis;
        let lastError: unknown;
        for (;;) {
            try {
                const result = await condition();
                if (result !== null && result !== undefined && result !== false) {
                    return result;
                }
            } catch (e) {
                if (isClosedPageError(e)) {
                    throw e;
                }
                lastError = e;
            }
            if (Date.now() >= deadline) {
                throw new WaitTimeoutError(
                    `${description} (tried for ${Math.round(timeoutMillis / 1000)}s)`,
                    { cause: lastError });
            }
            await sleep(ConfigManager.pollingInterval());
        }
    },

    // ----------------------------------------------------------- app readiness

    /**
     * Blocks until document.readyState is complete AND the bootstrap splash has
     * been replaced by the real application shell.
     */
    async waitForAppShell(): Promise<void> {
        await WaitUtils.waitForDocumentReady();
        await WaitUtils.waitForSplashToClear();
    },

    async waitForDocumentReady(): Promise<void> {
        try {
            await WaitUtils.fluently(
                async () => (await page().evaluate(() => document.readyState)) === 'complete',
                ConfigManager.pageLoadTimeout(),
                "document.readyState never reached 'complete'");
        } catch (e) {
            if (!(e instanceof WaitTimeoutError)) {
                throw e;
            }
            Log.warn("document.readyState did not reach 'complete' - continuing anyway");
        }
    },

    async waitForSplashToClear(): Promise<void> {
        try {
            await WaitUtils.fluently(
                async () => !(await page().evaluate(() => document.body?.innerText ?? '')).includes(SPLASH_TEXT),
                ConfigManager.spaSettleWait(),
                `Bootstrap splash '${SPLASH_TEXT}' never cleared`);
        } catch (e) {
            if (!(e instanceof WaitTimeoutError)) {
                throw e;
            }
            throw new WaitTimeoutError(
                `The application never finished booting - the '${SPLASH_TEXT}' splash was still on screen after `
                + `${ConfigManager.spaSettleWait() / 1000}s.`, { cause: e });
        }
    },

    /**
     * Waits for MUI skeleton placeholders and progress bars to disappear.
     * Used after triggering a data fetch inside an already-mounted view.
     */
    async waitForDataToSettle(timeoutMillis: number = ConfigManager.getSecondsAsMillis('data.settle.wait')): Promise<void> {
        try {
            await WaitUtils.fluently(
                async () => (await page().locator(LOADERS).filter({ visible: true }).count()) === 0,
                timeoutMillis,
                'Loading indicators never cleared');
        } catch (e) {
            if (!(e instanceof WaitTimeoutError)) {
                throw e;
            }
            // Deliberately non-fatal and deliberately short. This is an
            // optimisation that lets the following assertion read settled
            // content, not a correctness gate - the assertions do their own
            // polling. Some charts keep a shimmer mounted for good, and paying
            // the full explicit wait here on every navigation would add minutes
            // to the suite without catching anything.
            Log.warn(`Loading indicators still visible after ${Math.round(timeoutMillis / 1000)}s - continuing`);
        }
    },

    // ------------------------------------------------------------- conditions

    async waitForVisible(target: Target, timeoutMillis: number = ConfigManager.explicitWait()): Promise<Locator> {
        const element = first(target);
        await element.waitFor({ state: 'visible', timeout: timeoutMillis });
        return element;
    },

    async waitForPresent(target: Target, timeoutMillis: number = ConfigManager.explicitWait()): Promise<Locator> {
        const element = first(target);
        await element.waitFor({ state: 'attached', timeout: timeoutMillis });
        return element;
    },

    async waitForClickable(target: Target, timeoutMillis: number = ConfigManager.explicitWait()): Promise<Locator> {
        const element = first(target);
        await WaitUtils.fluently(
            async () => (await element.isVisible()) && (await element.isEnabled()),
            timeoutMillis,
            'Element never became clickable: ' + element);
        return element;
    },

    async waitForInvisible(target: Target, timeoutMillis: number = ConfigManager.explicitWait()): Promise<void> {
        await first(target).waitFor({ state: 'hidden', timeout: timeoutMillis });
    },

    async waitForUrlContains(fragment: string): Promise<void> {
        await WaitUtils.fluently(async () => page().url().includes(fragment),
            ConfigManager.explicitWait(), `URL never contained '${fragment}'`);
    },

    /**
     * True when the element shows up inside the timeout, false when it does
     * not. Never throws - this is the primitive negative assertions are built
     * on, where "absent" is the expected outcome rather than a failure.
     */
    async isVisibleWithin(target: Target, timeoutMillis: number): Promise<boolean> {
        try {
            await first(target).waitFor({ state: 'visible', timeout: timeoutMillis });
            return true;
        } catch (e) {
            if (isClosedPageError(e)) {
                throw e;
            }
            return false;
        }
    },

    /**
     * True when the element goes away inside the timeout, false when it does
     * not. The non-throwing counterpart of waitForInvisible(), for callers
     * that want to handle the timeout themselves.
     */
    async waitForInvisibleQuietly(target: Target, timeoutMillis: number): Promise<boolean> {
        try {
            await first(target).waitFor({ state: 'hidden', timeout: timeoutMillis });
            return true;
        } catch (e) {
            if (isClosedPageError(e)) {
                throw e;
            }
            return false;
        }
    },

    async sleepQuietly(millis: number): Promise<void> {
        await sleep(millis);
    },
};
