import type { Locator, Page } from '@playwright/test';
import { ConfigManager } from '../config/ConfigManager';
import { FrameworkException, WaitTimeoutException } from '../exceptions/FrameworkException';
import { Log } from './Log';

/**
 * Wait helpers tuned for this specific SPA.
 *
 * Playwright already auto-waits for every action and web-first assertion, so
 * this class only covers what auto-waiting cannot know about:
 *
 *  1. A full page load paints a "Loading Mywe HRMS..." splash before React
 *     mounts. Reading content before that clears gives false negatives, so
 *     every navigation funnels through waitForAppShell().
 *
 *  2. Route changes are client-side. The URL updates immediately while the
 *     new view is still fetching, so "URL changed" is never sufficient proof
 *     that a page loaded - content must be checked too.
 *
 *  3. Page objects ask questions ("is the KPI settled?", "did the step
 *     change?") that are app-specific conditions, not element states. poll()
 *     is the FluentWait equivalent for those.
 */
export class WaitUtils {
  /** Text shown by the pre-React bootstrap splash. */
  private static readonly SPLASH_TEXT = 'Loading Mywe HRMS';

  private static readonly LOADERS = '.MuiSkeleton-root, .MuiCircularProgress-root, .MuiLinearProgress-root';

  private constructor() {}

  // --------------------------------------------------------------- polling

  /**
   * Re-evaluates a condition until it yields a value other than null,
   * undefined or false, and returns that value. Errors thrown by the
   * condition (a node detached mid-render, a dialog not open yet) count as
   * "not yet", exactly as FluentWait ignoring StaleElementReference did.
   *
   * Note that 0 and "" ARE results - only null / undefined / false keep
   * polling.
   *
   * @throws WaitTimeoutException when the timeout passes first
   */
  static async poll<T>(
    page: Page,
    condition: () => Promise<T | null | undefined | false>,
    timeoutMs: number,
    description: string,
  ): Promise<T> {
    const deadline = Date.now() + timeoutMs;
    let lastError: unknown;
    for (;;) {
      try {
        const result = await condition();
        if (result !== null && result !== undefined && result !== false) {
          return result;
        }
      } catch (e) {
        lastError = e;
      }
      if (Date.now() >= deadline) {
        throw new WaitTimeoutException(`${description} (after ${timeoutMs} ms)`, { cause: lastError });
      }
      await page.waitForTimeout(ConfigManager.pollingInterval());
    }
  }

  /** poll() for a yes/no question: false on timeout instead of throwing. */
  static async pollQuietly(page: Page, condition: () => Promise<boolean>, timeoutMs: number): Promise<boolean> {
    try {
      return await WaitUtils.poll(page, condition, timeoutMs, 'condition');
    } catch (e) {
      if (e instanceof WaitTimeoutException) {
        return false;
      }
      throw e;
    }
  }

  // ----------------------------------------------------------- app readiness

  /**
   * Blocks until the document has loaded AND the bootstrap splash has been
   * replaced by the real application shell.
   */
  static async waitForAppShell(page: Page): Promise<void> {
    await WaitUtils.waitForDocumentReady(page);
    await WaitUtils.waitForSplashToClear(page);
  }

  static async waitForDocumentReady(page: Page): Promise<void> {
    try {
      await page.waitForLoadState('load', { timeout: ConfigManager.pageLoadTimeout() });
    } catch {
      Log.warn("The page did not reach the 'load' state - continuing anyway");
    }
  }

  static async waitForSplashToClear(page: Page): Promise<void> {
    const timeout = ConfigManager.spaSettleWait();
    const cleared = await WaitUtils.pollQuietly(
      page,
      async () => !(await page.locator('body').innerText()).includes(WaitUtils.SPLASH_TEXT),
      timeout,
    );
    if (!cleared) {
      throw new FrameworkException(
        `The application never finished booting - the '${WaitUtils.SPLASH_TEXT}' splash was still on screen after ${timeout / 1000}s.`,
      );
    }
  }

  /**
   * Waits for MUI skeleton placeholders and progress indicators to disappear.
   * Used after triggering a data fetch inside an already-mounted view.
   *
   * Deliberately non-fatal and deliberately short. This is an optimisation
   * that lets the following read see settled content, not a correctness
   * gate - the assertions do their own waiting. Some charts keep a shimmer
   * mounted for good, and paying the full explicit wait here on every
   * navigation would add minutes to the suite without catching anything.
   */
  static async waitForDataToSettle(page: Page, timeoutMs = ConfigManager.dataSettleWait()): Promise<void> {
    const loaders = page.locator(WaitUtils.LOADERS);
    const settled = await WaitUtils.pollQuietly(page, async () => !(await WaitUtils.anyVisible(loaders)), timeoutMs);
    if (!settled) {
      Log.warn(`Loading indicators still visible after ${timeoutMs / 1000}s - continuing`);
    }
  }

  /** True when at least one element matched by the locator is visible. */
  static async anyVisible(locator: Locator): Promise<boolean> {
    return locator.evaluateAll((elements) =>
      elements.some((e) => {
        const box = e.getBoundingClientRect();
        const style = window.getComputedStyle(e);
        return box.width > 0 && box.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      }),
    );
  }

  // ------------------------------------------------------------- conditions

  static async waitForVisible(locator: Locator, timeoutMs = ConfigManager.explicitWait()): Promise<Locator> {
    const target = locator.first();
    await target.waitFor({ state: 'visible', timeout: timeoutMs });
    return target;
  }

  static async waitForPresent(locator: Locator, timeoutMs = ConfigManager.explicitWait()): Promise<Locator> {
    const target = locator.first();
    await target.waitFor({ state: 'attached', timeout: timeoutMs });
    return target;
  }

  static async waitForInvisible(locator: Locator, timeoutMs = ConfigManager.explicitWait()): Promise<void> {
    await locator.first().waitFor({ state: 'hidden', timeout: timeoutMs });
  }

  static async waitForUrlContains(page: Page, fragment: string, timeoutMs = ConfigManager.explicitWait()): Promise<void> {
    await page.waitForURL((url) => url.href.includes(fragment), { timeout: timeoutMs, waitUntil: 'commit' });
  }

  /**
   * True when the element shows up inside the timeout, false when it does
   * not. Never throws - this is the primitive negative checks are built on,
   * where "absent" is the expected outcome rather than a failure.
   */
  static async isVisibleWithin(locator: Locator, timeoutMs: number): Promise<boolean> {
    try {
      await locator.first().waitFor({ state: 'visible', timeout: timeoutMs });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * True when the element goes away inside the timeout, false when it does
   * not. The non-throwing counterpart of waitForInvisible().
   */
  static async waitForInvisibleQuietly(locator: Locator, timeoutMs: number): Promise<boolean> {
    try {
      await locator.first().waitFor({ state: 'hidden', timeout: timeoutMs });
      return true;
    } catch {
      return false;
    }
  }

  static async sleep(page: Page, ms: number): Promise<void> {
    await page.waitForTimeout(ms);
  }
}
