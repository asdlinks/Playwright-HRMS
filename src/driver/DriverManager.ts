import type { Page } from '@playwright/test';
import { FrameworkError } from '../exceptions/errors';

/**
 * Holder for the active Playwright Page.
 *
 * Page objects and utilities pull the page from here instead of receiving it
 * through constructors, which keeps page-object signatures clean - the same
 * design as the Selenium framework's ThreadLocal driver. It is safe because a
 * Playwright worker is its own process and runs one test at a time, so a
 * module-level slot is per-test in exactly the way a ThreadLocal was.
 *
 * The BaseTest fixture binds the page before each test and clears it after.
 */
let current: Page | undefined;

export const DriverManager = {

    get(): Page {
        if (!current) {
            throw new FrameworkError(
                `No Page bound to worker ${process.env.TEST_WORKER_INDEX ?? '?'}. `
                + 'A page object was used before the BaseTest fixture started the browser.');
        }
        return current;
    },

    set(page: Page): void {
        current = page;
    },

    isInitialised(): boolean {
        return current !== undefined && !current.isClosed();
    },

    /**
     * Clears the slot. Playwright closes the page and its context itself; the
     * clear matters as much as the close did in Selenium, or the next test on
     * this worker would see a reference to a dead page.
     */
    clear(): void {
        current = undefined;
    },
};
