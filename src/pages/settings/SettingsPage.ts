import type { Locator } from '@playwright/test';
import { ConfigManager } from '../../config/ConfigManager';
import { AppModule } from '../../enums/AppModule';
import { SettingsPanel } from '../../enums/SettingsPanel';
import { ElementUtils } from '../../utils/ElementUtils';
import { Log } from '../../utils/Log';
import { MuiUtils } from '../../utils/MuiUtils';
import { WaitUtils } from '../../utils/WaitUtils';
import { BasePage } from '../base/BasePage';

/**
 * Settings.
 *
 * One route, many panels. The left rail is built from the signed-in user's
 * permissions, so which entries exist is the RBAC check here - an
 * Administrator sees twelve, HR sees four.
 *
 * TWO THINGS THAT BITE HERE
 * -------------------------
 *  1. The rail entry's text lives in a SPAN, but the click handler is on an
 *     ancestor row. Clicking the span does nothing, so every activation
 *     resolves the clickable ancestor first.
 *
 *  2. The rail label stays on screen whether or not the panel opened, so
 *     "is the label visible?" cannot verify a panel opened. Verification goes
 *     through the panel's own content heading instead, which differs from the
 *     rail label for half of them ("Account Security" opens "Password
 *     Management").
 */
export class SettingsPage extends BasePage {
  private readonly railEntries = MuiUtils.xpath(
    this.page,
    "//main//*[self::li or contains(@class,'MuiListItemButton-root')]//span[normalize-space(text())]",
  );

  /** Heading rendered by the currently open panel, on the right-hand side. */
  private readonly panelHeading = this.page.locator('main h6, main .MuiTypography-h6, main h5');

  landingMarker(): string {
    return AppModule.SETTINGS.landingMarker;
  }

  route(): string {
    return AppModule.SETTINGS.route;
  }

  // ------------------------------------------------------ panel visibility

  hasPanel(panel: SettingsPanel | string): Promise<boolean> {
    const label = typeof panel === 'string' ? panel : panel.label;
    return ElementUtils.isPresent(this.railLabel(label));
  }

  /** Every rail label currently rendered, in order. */
  visiblePanelLabels(): Promise<string[]> {
    return ElementUtils.distinctTexts(this.railEntries);
  }

  /** Group headers (ORGANIZATION, ATTENDANCE, PAYROLL, SECURITY, ADVANCED). */
  hasGroup(groupName: string): Promise<boolean> {
    return this.displaysTextImmediately(groupName);
  }

  // -------------------------------------------------------------- opening

  /**
   * Activates a rail entry and waits for the panel to actually render.
   * Entries that navigate away (Audit & Compliance) are routed to
   * activateNavigationEntry().
   */
  async openPanel(panel: SettingsPanel): Promise<this> {
    Log.step(`Opening the '${panel.label}' settings panel`);

    if (panel.isNavigationLink) {
      return this.activateNavigationEntry(panel);
    }

    // Activated with a scripted click, and retried once.
    //
    // The rail rows are plain divs carrying a React onClick. For entries low
    // in the rail - the ADVANCED group - a native click lands while the row
    // is still settling from scrolling and is absorbed without the handler
    // firing: the row takes the selected highlight but the right-hand panel
    // never changes. A scripted click dispatches the event straight at the
    // element, which React's handler receives wherever the row is on screen.
    for (let attempt = 1; attempt <= 2; attempt++) {
      await ElementUtils.clickViaScript(await this.clickableRailEntry(panel.label));
      if (await this.waitForPanelHeading(panel.contentHeading ?? '')) {
        break;
      }
      Log.warn(`The '${panel.label}' panel did not open on attempt ${attempt} - retrying`);
    }

    await WaitUtils.waitForDataToSettle(this.page);
    // Long panels render below the fold; scrolling up keeps the heading in
    // view so checks read what they expect to read.
    await ElementUtils.scrollToTop(this.page);
    return this;
  }

  /** Activates a rail entry that routes away from /settings. */
  async activateNavigationEntry(panel: SettingsPanel): Promise<this> {
    Log.step(`Activating the '${panel.label}' entry (navigates to ${panel.navigatesTo})`);
    await ElementUtils.clickViaScript(await this.clickableRailEntry(panel.label));
    await WaitUtils.waitForAppShell(this.page);
    await WaitUtils.waitForDataToSettle(this.page);
    return this;
  }

  /** Heading of the panel currently displayed on the right. */
  async openPanelHeading(): Promise<string> {
    return (await ElementUtils.isPresent(this.panelHeading)) ? ElementUtils.getText(this.panelHeading) : '';
  }

  /**
   * True once the named panel is genuinely on screen.
   *
   * Compares the rendered panel heading rather than searching page text - a
   * text search would match the rail label and pass even if the click never
   * took effect.
   */
  async isPanelOpen(panel: SettingsPanel): Promise<boolean> {
    if (panel.isNavigationLink) {
      return this.currentPath().startsWith(panel.navigatesTo ?? '');
    }
    return this.waitForPanelHeading(panel.contentHeading ?? '');
  }

  private async waitForPanelHeading(expectedHeading: string): Promise<boolean> {
    const opened = await WaitUtils.pollQuietly(
      this.page,
      async () => (await this.openPanelHeading()) === expectedHeading,
      ConfigManager.explicitWait(),
    );
    if (!opened) {
      Log.warn(`Panel heading is '${await this.openPanelHeading()}', expected '${expectedHeading}'`);
    }
    return opened;
  }

  // ------------------------------------------- Roles & Permissions panel

  /** True when the Roles & Permissions panel lists the role. */
  listsRole(roleName: string): Promise<boolean> {
    return ElementUtils.waitForPageText(this.page, roleName, 12_000);
  }

  /** Expands a role accordion to reveal its permission grants. */
  async expandRole(roleName: string): Promise<this> {
    Log.step(`Expanding the '${roleName}' role`);
    await ElementUtils.click(
      MuiUtils.xpath(
        this.page,
        `//*[contains(@class,'MuiAccordionSummary-root')][contains(normalize-space(.),${MuiUtils.escapeForXPath(roleName)})]`,
      ),
    );
    await WaitUtils.waitForDataToSettle(this.page);
    return this;
  }

  /** User count chip beside a role, e.g. 1 from "HR Administrator 1 user". */
  async userCountFor(roleName: string): Promise<number> {
    const result = await this.page.evaluate((role) => {
      const leaf = [...document.querySelectorAll('main div,main span,main p,main h6')].find(
        (e) => e.children.length === 0 && (e.textContent || '').trim() === role,
      );
      if (!leaf) return null;
      let node: HTMLElement | null = leaf as HTMLElement;
      for (let hop = 0; hop < 3 && node; hop++) {
        node = node.parentElement;
        if (!node) break;
        const match = (node.innerText || '').match(/(\d+)\s+users?/);
        if (match) return match[1];
      }
      return null;
    }, roleName);
    return result === null ? -1 : Number.parseInt(result, 10);
  }

  // ------------------------------------------------------------- locators

  /** The element carrying the rail label - used for presence checks. */
  private railLabel(label: string): Locator {
    return MuiUtils.xpath(this.page, `//main//*[normalize-space(text())=${MuiUtils.escapeForXPath(label)}]`);
  }

  /**
   * The clickable row that owns the rail label.
   *
   * The label itself is an inert span; MUI binds the handler to the list-item
   * row above it. Falls back to the label when no such ancestor exists, so a
   * markup change degrades instead of throwing.
   */
  private async clickableRailEntry(label: string): Promise<Locator> {
    const clickableAncestor = MuiUtils.xpath(
      this.page,
      `//main//*[normalize-space(text())=${MuiUtils.escapeForXPath(label)}]` +
        "/ancestor-or-self::*[self::li or self::button or @role='button' or contains(@class,'MuiListItemButton-root')][1]",
    );
    return (await ElementUtils.isPresent(clickableAncestor)) ? clickableAncestor : this.railLabel(label);
  }

  /** Exposed so tests can report what a persona actually sees. */
  async currentPanelHeadingOrBlank(): Promise<string> {
    return (await ElementUtils.isDisplayed(this.panelHeading)) ? ElementUtils.getText(this.panelHeading) : '';
  }
}
