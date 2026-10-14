import type { Locator } from '@playwright/test';
import { NoSuchElementError } from '../exceptions/errors';
import { DriverManager } from './DriverManager';

/**
 * Selenium-style element lookup with no waiting at all.
 *
 * Used only by the healing / flaky demo specs, which were written against raw
 * driver.findElement with the implicit wait at zero. Playwright locators wait
 * for their element; these do not - a missing element fails at once with
 * "no such element", which is what the demo tests are meant to show and what
 * a self-healing tool looks for.
 */
function describe(selector: string): string {
    const [method, value] = selector.startsWith('xpath=')
        ? ['xpath', selector.substring('xpath='.length)]
        : ['css selector', selector];
    return JSON.stringify({ method, selector: value });
}

export const RawDriver = {

    /** The first match, or NoSuchElementError straight away. */
    async findElement(selector: string): Promise<Locator> {
        const element = DriverManager.get().locator(selector).first();
        if ((await element.count()) === 0) {
            throw new NoSuchElementError('no such element: Unable to locate element: ' + describe(selector));
        }
        return element;
    },

    /** Every match at this instant - possibly none. */
    async findElements(selector: string): Promise<Locator[]> {
        return DriverManager.get().locator(selector).all();
    },
};
