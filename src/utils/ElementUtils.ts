import { errors, type Locator, type Page } from '@playwright/test';
import { ConfigManager } from '../config/ConfigManager';
import { WaitStrategy } from '../enums/WaitStrategy';
import { FrameworkException } from '../exceptions/FrameworkException';
import { DateUtils } from './DateUtils';
import { Log } from './Log';
import { MuiUtils } from './MuiUtils';
import { WaitUtils } from './WaitUtils';

/** How long a native click / fill may try before the scripted fallback is used. */
const NATIVE_ATTEMPT_MS = 5_000;

let markerSequence = 0;

/**
 * Thin, intent-revealing wrapper over raw Playwright calls.
 *
 * Every interaction routes through here so that the first-match rule, the
 * read-back checks and the scripted fallbacks are applied uniformly.
 *
 * FIRST MATCH, ON PURPOSE
 * -----------------------
 * Playwright locators are strict: an action on a locator that matches two
 * elements throws. Selenium's findElement silently took the first. The page
 * objects were written against first-match semantics, and the MUI markup
 * (portals, nested cards) often yields several matches, so the helpers here
 * act on `locator.first()`.
 *
 * WHY A SCRIPTED FALLBACK AT ALL
 * ------------------------------
 * Playwright refuses to click an element another element covers and waits
 * instead. MUI overlays (backdrops, the daily check-in reminder, a toast
 * animating out) cover targets often enough that, after a short native
 * attempt, the click is dispatched straight at the element.
 */
export class ElementUtils {
  private constructor() {}

  // ------------------------------------------------------------- finding

  /** Waits according to the strategy and returns the first match. */
  static async find(
    locator: Locator,
    strategy: WaitStrategy = WaitStrategy.VISIBLE,
    timeoutMs: number = ConfigManager.explicitWait(),
  ): Promise<Locator> {
    const target = locator.first();
    switch (strategy) {
      case WaitStrategy.VISIBLE:
      case WaitStrategy.CLICKABLE:
        await target.waitFor({ state: 'visible', timeout: timeoutMs });
        break;
      case WaitStrategy.PRESENT:
        await target.waitFor({ state: 'attached', timeout: timeoutMs });
        break;
      case WaitStrategy.INVISIBLE:
        throw new FrameworkException('INVISIBLE cannot return an element - use WaitUtils.waitForInvisible()');
      case WaitStrategy.NONE:
        break;
    }
    return target;
  }

  /** True when the first match is visible right now. Never waits, never throws. */
  static async isDisplayed(locator: Locator): Promise<boolean> {
    try {
      return await locator.first().isVisible();
    } catch {
      return false;
    }
  }

  /** True when anything matches right now, visible or not. */
  static async isPresent(locator: Locator): Promise<boolean> {
    return (await locator.count()) > 0;
  }

  static async count(locator: Locator): Promise<number> {
    return locator.count();
  }

  /** Trimmed, non-empty, de-duplicated text of every match, in DOM order. */
  static async distinctTexts(locator: Locator): Promise<string[]> {
    const texts = (await locator.allInnerTexts()).map((t) => t.trim()).filter((t) => t.length > 0);
    return [...new Set(texts)];
  }

  /**
   * Resolves an element with a script - for elements found by walking the DOM
   * (the trash button on a department row, the action on one employee card)
   * rather than by a selector - and returns it as a normal Locator.
   *
   * The script returns an Element or null. The element is tagged with a
   * unique data attribute so the result is an ordinary, auto-waiting Locator
   * instead of a raw ElementHandle.
   *
   * @return the locator, or null when the script found nothing
   */
  static async locateByScript(
    page: Page,
    finder: (args: string[]) => Element | null,
    args: string[],
  ): Promise<Locator | null> {
    const handle = await page.evaluateHandle(finder, args);
    const element = handle.asElement();
    if (!element) {
      await handle.dispose();
      return null;
    }
    const token = `pw-${Date.now()}-${++markerSequence}`;
    await element.evaluate((node, value) => node.setAttribute('data-pw-marker', value), token);
    await handle.dispose();
    return page.locator(`[data-pw-marker="${token}"]`);
  }

  // ------------------------------------------------------------- clicking

  static async click(locator: Locator): Promise<void> {
    const target = await ElementUtils.find(locator, WaitStrategy.CLICKABLE);
    try {
      await target.click({ timeout: NATIVE_ATTEMPT_MS });
      return;
    } catch (e) {
      if (!(e instanceof errors.TimeoutError)) {
        throw e;
      }
    }
    // Something is sitting over the target. The daily check-in reminder is
    // the one overlay that stays put, so close it and retry natively before
    // resorting to a scripted click.
    if (await MuiUtils.dismissCheckInReminderIfShown(target.page())) {
      try {
        await target.click({ timeout: NATIVE_ATTEMPT_MS });
        return;
      } catch (e) {
        if (!(e instanceof errors.TimeoutError)) {
          throw e;
        }
      }
    }
    Log.warn('Native click could not land (covered or not actionable) - falling back to a scripted click');
    await ElementUtils.clickViaScript(target);
  }

  /**
   * Scripted click that emulates the full event sequence a real pointer
   * produces: pointerdown, mousedown, pointerup, mouseup, click.
   *
   * WHY NOT locator.dispatchEvent('click')
   * --------------------------------------
   * A lone click event is never seen by several MUI components. MUI's Select
   * opens its menu from onMouseDown, not onClick, so a bare click on a
   * dropdown does nothing at all - no error, no menu. Dispatching the whole
   * sequence makes the scripted path behave like the native one for every
   * component in this app.
   */
  static async clickViaScript(locator: Locator, timeoutMs: number = ConfigManager.explicitWait()): Promise<void> {
    await locator.first().evaluate(
      (element) => {
        const rect = element.getBoundingClientRect();
        const options = {
          bubbles: true,
          cancelable: true,
          composed: true,
          view: window,
          button: 0,
          buttons: 1,
          clientX: rect.left + rect.width / 2,
          clientY: rect.top + rect.height / 2,
        };
        element.dispatchEvent(new PointerEvent('pointerdown', options));
        element.dispatchEvent(new MouseEvent('mousedown', options));
        element.dispatchEvent(new PointerEvent('pointerup', { ...options, buttons: 0 }));
        element.dispatchEvent(new MouseEvent('mouseup', { ...options, buttons: 0 }));
        element.dispatchEvent(new MouseEvent('click', { ...options, buttons: 0 }));
      },
      undefined,
      { timeout: timeoutMs },
    );
  }

  // -------------------------------------------------------------- typing

  /**
   * Replaces the value of a controlled React input, then verifies it took.
   *
   * fill() is React-aware and is the happy path. The value is still read
   * back: a field that refuses input - a MUI Autocomplete inside a drawer
   * that is still animating in does exactly this - would otherwise turn into
   * a confusing assertion failure several steps later. If the value did not
   * stick it is set through React's own value setter.
   */
  static async type(locator: Locator, text: string | null | undefined): Promise<void> {
    const target = await ElementUtils.find(locator, WaitStrategy.VISIBLE);
    const value = text ?? '';
    try {
      await target.fill(value, { timeout: NATIVE_ATTEMPT_MS });
    } catch (e) {
      if (!(e instanceof errors.TimeoutError)) {
        throw e;
      }
      Log.warn('Could not type into the field natively - setting its value directly');
    }
    if ((await target.inputValue()) !== value) {
      Log.warn('Typed text did not register on the field - falling back to a React-safe value assignment');
      await ElementUtils.setValueViaReact(target, value);
    }
  }

  /**
   * Sets an input's value the way React itself does.
   *
   * Assigning element.value directly is invisible to React: it caches the
   * previous value on the DOM node and skips the update. Calling the
   * prototype's native setter and then dispatching a bubbling input event is
   * what makes React's synthetic onChange fire.
   */
  static async setValueViaReact(locator: Locator, value: string): Promise<void> {
    const target = await ElementUtils.find(locator, WaitStrategy.VISIBLE);
    await target.evaluate((element, newValue) => {
      const prototype =
        element.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
      setter?.call(element, newValue);
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    }, value);
  }

  /**
   * Sets a native date input.
   *
   * The API keeps the mm/dd/yyyy the user sees in an en-US browser; a date
   * input stores (and Playwright fills) the ISO form whatever the display
   * locale, so the value is converted, filled and read back.
   *
   * @param mmddyyyy date formatted for the en-US browser locale
   */
  static async typeIntoDateField(locator: Locator, mmddyyyy: string): Promise<void> {
    const target = await ElementUtils.find(locator, WaitStrategy.VISIBLE);
    const expectedIso = DateUtils.dateInputToIso(mmddyyyy);
    try {
      await target.fill(expectedIso, { timeout: NATIVE_ATTEMPT_MS });
    } catch (e) {
      Log.warn(`Could not fill the date field natively (${(e as Error).message.split('\n')[0]})`);
    }
    if ((await target.inputValue()) !== expectedIso) {
      Log.warn(`Date did not register as ${expectedIso} - setting the input value directly`);
      await ElementUtils.setValueViaReact(target, expectedIso);
    }
  }

  static async getText(locator: Locator): Promise<string> {
    return (await (await ElementUtils.find(locator, WaitStrategy.VISIBLE)).innerText()).trim();
  }

  static async getValue(locator: Locator): Promise<string> {
    return (await (await ElementUtils.find(locator, WaitStrategy.PRESENT)).inputValue()).trim();
  }

  static async getAttribute(locator: Locator, attribute: string): Promise<string | null> {
    return (await ElementUtils.find(locator, WaitStrategy.PRESENT)).getAttribute(attribute);
  }

  // ------------------------------------------------------------ scrolling

  static async scrollToTop(page: Page): Promise<void> {
    await page.evaluate(() => window.scrollTo(0, 0));
  }

  static async hover(locator: Locator): Promise<void> {
    await (await ElementUtils.find(locator, WaitStrategy.VISIBLE)).hover();
  }

  static async pressEscape(page: Page): Promise<void> {
    await page.keyboard.press('Escape');
  }

  // -------------------------------------------------------------- page text

  /** Visible text of the main content region, excluding the chrome. */
  static async mainContentText(page: Page): Promise<string> {
    const main = page.locator('main');
    if (await ElementUtils.isPresent(main)) {
      return main.first().innerText();
    }
    return ElementUtils.bodyText(page);
  }

  static async bodyText(page: Page): Promise<string> {
    return page.locator('body').innerText();
  }

  static async pageContainsText(page: Page, text: string): Promise<boolean> {
    return (await ElementUtils.bodyText(page)).includes(text);
  }

  /**
   * Polls for text rather than reading once - the SPA streams sections in,
   * so a single read right after navigation can miss late-arriving content.
   */
  static async waitForPageText(page: Page, text: string, timeoutMs: number): Promise<boolean> {
    return WaitUtils.pollQuietly(page, () => ElementUtils.pageContainsText(page, text), timeoutMs);
  }
}
