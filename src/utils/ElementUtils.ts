import type { Locator, Page } from '@playwright/test';
import { ConfigManager } from '../config/ConfigManager';
import { DriverManager } from '../driver/DriverManager';
import { WaitStrategy } from '../enums/WaitStrategy';
import { NoSuchElementError, WaitTimeoutError } from '../exceptions/errors';
import { Log } from './Log';
import { MuiUtils } from './MuiUtils';
import { every, first, Target, WaitUtils } from './WaitUtils';

function page(): Page {
    return DriverManager.get();
}

/** True for the errors Playwright raises when an action could not be performed in time. */
function isActionFailure(error: unknown): boolean {
    return error instanceof Error
        && !/has been closed/.test(error.message)
        && (error.name === 'TimeoutError' || /not (visible|enabled|editable|attached)|intercepts pointer events/.test(error.message));
}

let markSequence = 0;

/**
 * Thin, intent-revealing wrapper over raw Playwright calls.
 *
 * Every interaction routes through here so that waiting, scrolling and the
 * scripted-click fallback are applied uniformly. MUI overlays (drawers, dialog
 * backdrops, sticky headers) intercept clicks often enough that retrying
 * through a script is the difference between a stable suite and a flaky one.
 *
 * Playwright already auto-waits before acting, but the app absorbs some
 * clicks without any error at all, so the post-condition checks and the
 * scripted fallback still earn their place.
 */
export const ElementUtils = {

    // ------------------------------------------------------------- finding

    async find(target: Target, strategy: WaitStrategy = WaitStrategy.VISIBLE): Promise<Locator> {
        switch (strategy) {
            case WaitStrategy.VISIBLE:
                return WaitUtils.waitForVisible(target);
            case WaitStrategy.CLICKABLE:
                return WaitUtils.waitForClickable(target);
            case WaitStrategy.PRESENT:
                return WaitUtils.waitForPresent(target);
            case WaitStrategy.INVISIBLE:
                throw new Error('INVISIBLE cannot return an element - use WaitUtils.waitForInvisible()');
            case WaitStrategy.NONE: {
                const element = first(target);
                if ((await element.count()) === 0) {
                    throw new NoSuchElementError('No element matches ' + element);
                }
                return element;
            }
        }
    },

    async findAll(target: Target): Promise<Locator[]> {
        return every(target).all();
    },

    async isDisplayed(target: Target): Promise<boolean> {
        try {
            return await first(target).isVisible();
        } catch (e) {
            return false;
        }
    },

    async isPresent(target: Target): Promise<boolean> {
        return (await every(target).count()) > 0;
    },

    async count(target: Target): Promise<number> {
        return every(target).count();
    },

    /**
     * Rendered text of every match, as Selenium's getText() read it: an
     * element that is not displayed reads as "". One round trip for the lot.
     */
    async textsOf(target: Target): Promise<string[]> {
        return every(target).evaluateAll(elements => elements.map(element =>
            element.getClientRects().length > 0 ? ((element as HTMLElement).innerText ?? '').trim() : ''));
    },

    /** An attribute of every match, null where it is absent. */
    async attributesOf(target: Target, attribute: string): Promise<(string | null)[]> {
        return every(target).evaluateAll((elements, name) => elements.map(element => element.getAttribute(name)),
            attribute);
    },

    /**
     * Resolves an element with an in-page script and returns a Locator for it.
     *
     * Some controls - an unlabelled trash icon on a department row - are
     * easiest to find structurally from the DOM. The script returns the
     * element; it is tagged with a one-off attribute so the rest of the
     * framework can address it as an ordinary Locator. If React re-renders
     * the node away, the tag goes with it, as a stale element did in Selenium.
     */
    async locateByScript(finder: (arg: string) => Element | null, arg: string): Promise<Locator | null> {
        const handle = await page().evaluateHandle(finder, arg);
        const element = handle.asElement();
        if (!element) {
            await handle.dispose();
            return null;
        }
        const token = `at-${process.env.TEST_WORKER_INDEX ?? 0}-${++markSequence}`;
        await element.evaluate((node, value) => node.setAttribute('data-at-target', value), token);
        await handle.dispose();
        return page().locator(`[data-at-target="${token}"]`);
    },

    // ------------------------------------------------------------- clicking

    async click(target: Target): Promise<void> {
        const element = await ElementUtils.find(target, WaitStrategy.CLICKABLE);
        await ElementUtils.clickElement(element);
    },

    /** Clicks an element that is already resolved, without waiting for it first. */
    async clickElement(element: Locator): Promise<void> {
        await ElementUtils.scrollIntoView(element);
        try {
            await element.click({ timeout: ConfigManager.nativeClickTimeout() });
        } catch (e) {
            if (!isActionFailure(e)) {
                throw e;
            }
            // A MUI backdrop, sticky app bar or a toast animating out is sitting
            // over the target. A scripted click bypasses hit-testing entirely.
            // The daily check-in reminder is the one overlay that stays put, so
            // close it and retry natively before resorting to a scripted click.
            if (await MuiUtils.dismissCheckInReminderIfShown()) {
                try {
                    await element.click({ timeout: ConfigManager.nativeClickTimeout() });
                    return;
                } catch (stillCovered) {
                    if (!isActionFailure(stillCovered)) {
                        throw stillCovered;
                    }
                    // fall through to the scripted click
                }
            }
            Log.warn('Native click intercepted - falling back to a scripted click');
            await ElementUtils.clickViaScript(element);
        }
    },

    /**
     * Scripted click that emulates the full event sequence a real pointer
     * produces: pointerdown, mousedown, pointerup, mouseup, click.
     *
     * WHY NOT element.click()
     * -----------------------
     * A bare element.click() dispatches ONLY a click event, and several MUI
     * components never see it. MUI's Select opens its menu from onMouseDown,
     * not onClick, so element.click() on a dropdown does nothing at all - no
     * error, no menu, and a test that then waits for the listbox fails
     * twenty-five seconds later for a reason that looks nothing like the
     * cause. Dispatching the whole sequence makes the scripted path behave
     * like the native one for every component in this app.
     */
    async clickViaScript(target: Target): Promise<void> {
        const element = typeof target === 'string'
            ? await ElementUtils.find(target, WaitStrategy.PRESENT)
            : target.first();
        await element.evaluate(node => {
            const rect = node.getBoundingClientRect();
            const x = rect.left + rect.width / 2;
            const y = rect.top + rect.height / 2;
            const options = {
                bubbles: true, cancelable: true, composed: true,
                view: window, button: 0, buttons: 1,
                clientX: x, clientY: y,
            };
            node.dispatchEvent(new PointerEvent('pointerdown', options));
            node.dispatchEvent(new MouseEvent('mousedown', options));
            node.dispatchEvent(new PointerEvent('pointerup', { ...options, buttons: 0 }));
            node.dispatchEvent(new MouseEvent('mouseup', { ...options, buttons: 0 }));
            node.dispatchEvent(new MouseEvent('click', { ...options, buttons: 0 }));
        });
    },

    // -------------------------------------------------------------- typing

    /**
     * Clears and types into a controlled React input, then verifies it took.
     *
     * Two problems this works around, both specific to controlled components:
     *
     *  1. Clearing the DOM value alone is unreliable - React can re-render the
     *     old value straight back. A select-all + delete raises real key
     *     events instead.
     *
     *  2. The click that focuses the field is sometimes absorbed mid-render,
     *     and every subsequent keystroke goes nowhere. Silently typing into
     *     the void turns into a confusing assertion failure several steps
     *     later, so the value is read back and, if it did not stick, set
     *     through React's own value setter.
     */
    async type(target: Target, text: string | null | undefined): Promise<void> {
        const element = await ElementUtils.find(target, WaitStrategy.VISIBLE);
        await ElementUtils.scrollIntoView(element);
        const value = text ?? '';
        const timeout = ConfigManager.nativeClickTimeout();

        try {
            await element.click({ timeout });
            await element.press('ControlOrMeta+a', { timeout });
            await element.press('Delete', { timeout });
            if (value) {
                await element.pressSequentially(value, { timeout });
            }
        } catch (e) {
            if (!isActionFailure(e)) {
                throw e;
            }
            // Intercepted: something is over the field. Not interactable: the
            // field is on screen but refusing keystrokes - a MUI Autocomplete
            // inside a drawer that is still animating in does exactly this.
            // Either way the value can still be delivered through React below.
            Log.warn(`Could not type into the field natively (${(e as Error).name}) - setting its value directly`);
        }

        if (value !== await currentValueOf(element)) {
            Log.warn('Typed text did not register on the field - falling back to a React-safe value assignment');
            await ElementUtils.setValueViaReact(element, value);
        }
    },

    /**
     * Sets an input's value the way React itself does.
     *
     * Assigning element.value directly is invisible to React: it caches the
     * previous value on the DOM node and skips the update. Calling the
     * prototype's native setter and then dispatching a bubbling input event is
     * what makes React's synthetic onChange fire and the component state
     * actually change.
     */
    async setValueViaReact(target: Target, value: string): Promise<void> {
        const element = typeof target === 'string'
            ? await ElementUtils.find(target, WaitStrategy.VISIBLE)
            : target.first();
        await element.evaluate((node, newValue) => {
            const prototype = node.tagName === 'TEXTAREA'
                ? window.HTMLTextAreaElement.prototype
                : window.HTMLInputElement.prototype;
            const setter = Object.getOwnPropertyDescriptor(prototype, 'value')!.set!;
            setter.call(node, newValue);
            node.dispatchEvent(new Event('input', { bubbles: true }));
            node.dispatchEvent(new Event('change', { bubbles: true }));
        }, value);
    },

    /**
     * Sets a native date input.
     *
     * Chrome renders these as mm/dd/yyyy segments, so the happy path types
     * bare digits into the segments. If that does not land - the segment order
     * follows the browser locale, which a CI image may not share with a
     * developer's machine - the value is set directly, where a date input
     * requires the ISO form regardless of how it is displayed.
     *
     * @param mmddyyyy date formatted for the en-US browser locale
     */
    async typeIntoDateField(target: Target, mmddyyyy: string): Promise<void> {
        const element = await ElementUtils.find(target, WaitStrategy.VISIBLE);
        await ElementUtils.scrollIntoView(element);
        const timeout = ConfigManager.nativeClickTimeout();

        try {
            await element.click({ timeout });
            await element.press('ControlOrMeta+a', { timeout });
            await element.pressSequentially(mmddyyyy.replace(/\//g, ''), { timeout });
        } catch (e) {
            if (!isActionFailure(e)) {
                throw e;
            }
            Log.warn(`Could not type into the date field natively (${(e as Error).name})`);
        }

        const expectedIso = toIsoDate(mmddyyyy);
        if (expectedIso !== await currentValueOf(element)) {
            Log.warn(`Date did not register as ${expectedIso} - setting the input value directly`);
            await ElementUtils.setValueViaReact(element, expectedIso);
        }
    },

    async getText(target: Target): Promise<string> {
        const element = await ElementUtils.find(target, WaitStrategy.VISIBLE);
        return (await element.innerText()).trim();
    },

    async getValue(target: Target): Promise<string> {
        const element = await ElementUtils.find(target, WaitStrategy.PRESENT);
        return (await currentValueOf(element)).trim();
    },

    async getAttribute(target: Target, attribute: string): Promise<string | null> {
        const element = await ElementUtils.find(target, WaitStrategy.PRESENT);
        return element.getAttribute(attribute);
    },

    // ------------------------------------------------------------ scrolling

    async scrollIntoView(target: Target): Promise<void> {
        const element = typeof target === 'string'
            ? await ElementUtils.find(target, WaitStrategy.PRESENT)
            : target.first();
        await element.evaluate(node =>
            node.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' }));
    },

    async scrollToTop(): Promise<void> {
        await page().evaluate(() => window.scrollTo(0, 0));
    },

    async hover(target: Target): Promise<void> {
        const element = await ElementUtils.find(target, WaitStrategy.VISIBLE);
        await ElementUtils.scrollIntoView(element);
        await element.hover();
    },

    async pressEscape(): Promise<void> {
        await page().keyboard.press('Escape');
    },

    // -------------------------------------------------------------- page text

    /** Visible text of the main content region, excluding the chrome. */
    async mainContentText(): Promise<string> {
        if (await ElementUtils.isPresent('main')) {
            return (await ElementUtils.find('main', WaitStrategy.PRESENT)).innerText();
        }
        return ElementUtils.bodyText();
    },

    async bodyText(): Promise<string> {
        return page().evaluate(() => document.body?.innerText ?? '');
    },

    async pageContainsText(text: string): Promise<boolean> {
        return (await ElementUtils.bodyText()).includes(text);
    },

    /**
     * Polls for text rather than reading once - the SPA streams sections in,
     * so a single read right after navigation can miss late-arriving content.
     */
    async waitForPageText(text: string, timeoutMillis: number): Promise<boolean> {
        try {
            await WaitUtils.fluently(async () => (await ElementUtils.bodyText()).includes(text),
                timeoutMillis, 'Page never displayed the text: ' + text);
            return true;
        } catch (e) {
            if (e instanceof WaitTimeoutError) {
                return false;
            }
            throw e;
        }
    },
};

async function currentValueOf(element: Locator): Promise<string> {
    const value = await element.evaluate(node => (node as HTMLInputElement).value);
    return value ?? '';
}

/** Converts mm/dd/yyyy to the yyyy-MM-dd a date input stores internally. */
function toIsoDate(mmddyyyy: string): string {
    const parts = mmddyyyy.split('/');
    if (parts.length !== 3) {
        return mmddyyyy;
    }
    return `${parts[2]}-${parts[0]}-${parts[1]}`;
}
