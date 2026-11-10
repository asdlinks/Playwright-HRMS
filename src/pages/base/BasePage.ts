import type { Page } from '@playwright/test';
import { ConfigManager } from '../../config/ConfigManager';
import { WaitTimeoutException } from '../../exceptions/FrameworkException';
import { ElementUtils } from '../../utils/ElementUtils';
import { Log } from '../../utils/Log';
import { MuiUtils } from '../../utils/MuiUtils';
import { WaitUtils } from '../../utils/WaitUtils';
import { HeaderComponent } from '../components/HeaderComponent';
import { SideNavComponent } from '../components/SideNavComponent';

/**
 * Shared behaviour for every page object.
 *
 * THE RULES EVERY PAGE OBJECT FOLLOWS
 * -----------------------------------
 *  1. Locators are private to the page. Tests never see a Locator, a
 *     selector or the Playwright `page` API.
 *  2. Methods express intent ("approveRequestFor", "deleteEmployee"), not
 *     mechanics ("clickButton3").
 *  3. An action that stays on the page returns this page; an action that
 *     lands somewhere else returns that page or component.
 *  4. Queries return plain values (boolean, number, string) for tests to
 *     assert.
 *  5. Pages never assert. Assertions belong to tests, so one page object
 *     serves positive and negative tests alike - there is no `expect`
 *     import anywhere under src/.
 *
 * Every page object is constructed with the test's Playwright `page`, the
 * equivalent of the Selenium framework's ThreadLocal driver. Everything is
 * async, so actions and queries are awaited.
 *
 * Overlays that sit on top of a page (dialogs, drawers, the header) are
 * modelled as components - see BaseComponent and BaseDialog.
 */
export abstract class BasePage {
  protected static readonly PAGE_HEADING = 'main h1, main h4, main .MuiTypography-h4';

  constructor(protected readonly page: Page) {}

  /** Text that proves this specific page rendered. */
  abstract landingMarker(): string;

  /** Route this page lives at, e.g. /employees. */
  abstract route(): string;

  // --------------------------------------------------------- navigation

  /**
   * Hard-navigates to this page's route, waits for the shell to boot and
   * returns this page, typed as the caller's page class:
   *
   *   const directory = await new EmployeeDirectoryPage(page).open();
   *
   * It does not check that the page loaded - a test that expects a redirect
   * (RBAC, signed-out deep links) opens the page and then checks where it
   * actually landed. Use isLoaded() for the positive case.
   */
  async open(): Promise<this> {
    const url = ConfigManager.urlFor(this.route());
    Log.step(`Navigating to ${this.constructor.name} (${url})`);
    await this.page.goto(url);
    await WaitUtils.waitForAppShell(this.page);
    await WaitUtils.waitForDataToSettle(this.page);
    await MuiUtils.dismissCheckInReminderIfShown(this.page);
    return this;
  }

  // ---------------------------------------------------- shared components

  /** The application header, present on every signed-in page. */
  header(): HeaderComponent {
    return new HeaderComponent(this.page);
  }

  /** The section side rail (Employees, Time and Leave ...). */
  sideNav(): SideNavComponent {
    return new SideNavComponent(this.page);
  }

  // ---------------------------------------------------------- page state

  currentUrl(): string {
    return this.page.url();
  }

  /** Path portion of the current URL, e.g. /dashboard. */
  currentPath(): string {
    const url = this.currentUrl();
    const base = ConfigManager.baseUrl();
    return url.startsWith(base) ? url.substring(base.length) : url;
  }

  pageTitle(): Promise<string> {
    return this.page.title();
  }

  async heading(): Promise<string> {
    const heading = this.page.locator(BasePage.PAGE_HEADING);
    return (await ElementUtils.isPresent(heading)) ? ElementUtils.getText(heading) : '';
  }

  /**
   * True when this page's landing marker is on screen.
   *
   * Deliberately content-based rather than URL-based: in a client-side routed
   * app the URL updates before the view finishes fetching, so a URL check
   * alone would pass while the page is still blank.
   */
  isLoaded(): Promise<boolean> {
    return ElementUtils.waitForPageText(this.page, this.landingMarker(), ConfigManager.explicitWait());
  }

  isLoadedWithin(timeoutMs: number): Promise<boolean> {
    return ElementUtils.waitForPageText(this.page, this.landingMarker(), timeoutMs);
  }

  /** Visible text of the main region - used for coarse content checks. */
  contentText(): Promise<string> {
    return ElementUtils.mainContentText(this.page);
  }

  displaysText(text: string): Promise<boolean> {
    return ElementUtils.waitForPageText(this.page, text, 10_000);
  }

  displaysTextImmediately(text: string): Promise<boolean> {
    return ElementUtils.pageContainsText(this.page, text);
  }

  // ------------------------------------------------------------- helpers

  protected async clickButton(buttonText: string): Promise<void> {
    Log.step(`Clicking button: ${buttonText}`);
    await ElementUtils.click(MuiUtils.buttonByText(this.page, buttonText));
  }

  protected hasButton(buttonText: string): Promise<boolean> {
    return ElementUtils.isDisplayed(MuiUtils.buttonByText(this.page, buttonText));
  }

  protected waitForSettled(): Promise<void> {
    return WaitUtils.waitForDataToSettle(this.page);
  }

  /**
   * Reads the numeric value of one of the KPI cards at the top of a module
   * page ("Total Employees 5", "Departments 2", "Total Workforce 5" ...).
   *
   * The cards are plain nested divs with no class hook and no fixed
   * label/value nesting, so this walks up from the label to the nearest
   * ancestor that also contains a number and extracts it - in one scripted
   * pass, which is faster and less brittle than guessing the card's shape.
   *
   * @return the card value, or -1 when no such card is on screen
   */
  async readKpiCard(cardLabel: string): Promise<number> {
    const result = await this.page.evaluate((label) => {
      const leaves = [...document.querySelectorAll('div,span,p,h6')].filter(
        (e) => e.children.length === 0 && (e.textContent || '').trim() === label,
      );
      for (const leaf of leaves) {
        let node: HTMLElement | null = leaf as HTMLElement;
        for (let hop = 0; hop < 4 && node; hop++) {
          node = node.parentElement;
          if (!node) break;
          const text = (node.innerText || '').replace(label, ' ');
          const match = text.match(/\b\d[\d,]*\b/);
          if (match) return match[0].replace(/,/g, '');
        }
      }
      return null;
    }, cardLabel);

    if (result === null) {
      Log.warn(`KPI card not found on screen: ${cardLabel}`);
      return -1;
    }
    return Number.parseInt(result, 10);
  }

  /**
   * Reads a KPI card once it has stopped changing.
   *
   * The cards render with a placeholder and are filled in when their fetch
   * resolves, so a single read taken straight after navigation can capture
   * the placeholder - and a baseline captured that way makes a later "the
   * count must not have changed" check fail against a number that was never
   * real. Two consecutive equal reads are taken as settled.
   */
  async readSettledKpiCard(cardLabel: string): Promise<number> {
    try {
      return await WaitUtils.poll(
        this.page,
        async () => {
          const first = await this.readKpiCard(cardLabel);
          if (first < 0) {
            return null;
          }
          await this.page.waitForTimeout(400);
          return first === (await this.readKpiCard(cardLabel)) ? first : null;
        },
        ConfigManager.explicitWait(),
        `KPI '${cardLabel}' never settled`,
      );
    } catch (e) {
      if (!(e instanceof WaitTimeoutException)) throw e;
      Log.warn(`KPI '${cardLabel}' did not settle - using a single read`);
      return this.readKpiCard(cardLabel);
    }
  }

  /**
   * Polls a KPI card until it reports the expected value. Counters are
   * refetched after a mutation, so reading once immediately after a save
   * races the refresh.
   */
  async waitForKpiCard(cardLabel: string, expectedValue: number): Promise<boolean> {
    const reached = await WaitUtils.pollQuietly(
      this.page,
      async () => (await this.readKpiCard(cardLabel)) === expectedValue,
      ConfigManager.explicitWait(),
    );
    if (!reached) {
      Log.warn(`KPI '${cardLabel}' stayed at ${await this.readKpiCard(cardLabel)}, expected ${expectedValue}`);
    }
    return reached;
  }
}
