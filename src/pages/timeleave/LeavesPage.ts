import type { Locator } from '@playwright/test';
import { ConfigManager } from '../../config/ConfigManager';
import { AppModule } from '../../enums/AppModule';
import { LeaveStatus } from '../../enums/LeaveStatus';
import { LeaveType } from '../../enums/LeaveType';
import { WaitTimeoutException } from '../../exceptions/FrameworkException';
import { ElementUtils } from '../../utils/ElementUtils';
import { Log } from '../../utils/Log';
import { MuiUtils } from '../../utils/MuiUtils';
import { WaitUtils } from '../../utils/WaitUtils';
import { BasePage } from '../base/BasePage';
import { ApplyLeaveDrawer } from './ApplyLeaveDrawer';

/**
 * Leave Management.
 *
 * Three things a reader should know:
 *
 *  - The balance cards ("Casual 10/10") always show the SIGNED-IN user's own
 *    entitlement, never the target employee's, even when an administrator is
 *    recording leave on someone else's behalf.
 *  - The status tabs carry live counts - "All (6)", "Pending (1)" - which is
 *    what makes tab-versus-grid consistency checkable.
 *  - Approve / Reject buttons only render on rows that are still Pending.
 */
export class LeavesPage extends BasePage {
  private readonly applyLeaveButton = MuiUtils.buttonByText(this.page, 'Apply for Leave');
  private readonly recentRequestsHeading = MuiUtils.xpath(this.page, "//*[normalize-space(text())='Recent Requests']");

  /** The message shown in place of the grid when a tab has no requests. */
  private readonly emptyState = MuiUtils.xpath(
    this.page,
    "//main//*[starts-with(normalize-space(text()),'No ')][contains(normalize-space(text()),'found')]",
  );

  landingMarker(): string {
    return AppModule.LEAVES.landingMarker;
  }

  route(): string {
    return AppModule.LEAVES.route;
  }

  // ------------------------------------------------------- balance cards

  /** Remaining days for a leave type, read from the "10/10" card; -1 when absent. */
  remainingBalance(leaveType: LeaveType): Promise<number> {
    return this.readBalance(leaveType, 1);
  }

  /** Total entitlement - the denominator of the balance card. */
  totalEntitlement(leaveType: LeaveType): Promise<number> {
    return this.readBalance(leaveType, 2);
  }

  /**
   * Reads one side of the "remaining/total" figure on a balance card.
   *
   * The cards mount only once the balance fetch resolves, so a read taken
   * straight after navigation finds nothing - poll until they do.
   *
   * @param group 1 for the remaining days, 2 for the total entitlement
   */
  private async readBalance(leaveType: LeaveType, group: 1 | 2): Promise<number> {
    try {
      return await WaitUtils.poll(
        this.page,
        async () => {
          const value = await this.readBalanceOnce(leaveType, group);
          return value < 0 ? null : value;
        },
        15_000,
        `Balance card for ${leaveType} never rendered`,
      );
    } catch (e) {
      if (!(e instanceof WaitTimeoutException)) throw e;
      return -1;
    }
  }

  /**
   * The card label is matched CASE-INSENSITIVELY on purpose: the DOM holds
   * "casual" in lowercase and MUI renders it uppercase through CSS
   * text-transform. Matching the rendered casing finds nothing.
   */
  private async readBalanceOnce(leaveType: LeaveType, group: 1 | 2): Promise<number> {
    const result = await this.page.evaluate(
      ([label, index]) => {
        const lower = label.toLowerCase();
        const leaf = [...document.querySelectorAll('main div,main span,main p')].find(
          (e) => e.children.length === 0 && (e.textContent || '').trim().toLowerCase() === lower,
        );
        if (!leaf) return null;
        let node: HTMLElement | null = leaf as HTMLElement;
        for (let hop = 0; hop < 4 && node; hop++) {
          node = node.parentElement;
          if (!node) break;
          const match = (node.innerText || '').match(/(\d+)\s*\/\s*(\d+)/);
          if (match) return match[index];
        }
        return null;
      },
      [leaveType.gridLabel, group] as const,
    );
    return result === null ? -1 : Number.parseInt(result, 10);
  }

  async allBalanceCardsDisplayed(): Promise<boolean> {
    for (const type of [LeaveType.CASUAL, LeaveType.SICK, LeaveType.PAID]) {
      if ((await this.remainingBalance(type)) < 0) {
        return false;
      }
    }
    return true;
  }

  // ---------------------------------------------------------- status tabs

  /**
   * The status "tabs" are MUI Chips, each a span.MuiChip-label reading
   * "Pending (1)" inside a clickable wrapper.
   *
   * The locator is anchored to that label span and matched on its own text.
   * A looser locator matched any ancestor CONTAINING the text, which resolved
   * to the strip wrapping all five chips - every status then reported the
   * same number, and the tabs appeared not to reconcile.
   */
  private statusChipLabel(status: LeaveStatus): Locator {
    return MuiUtils.xpath(
      this.page,
      "//span[contains(@class,'MuiChip-label')]" +
        `[starts-with(normalize-space(.),${MuiUtils.escapeForXPath(`${status.label} (`)})]`,
    );
  }

  /** Count shown on a status chip, e.g. 6 from "All (6)". */
  async tabCount(status: LeaveStatus): Promise<number> {
    const chip = this.statusChipLabel(status);
    if (!(await ElementUtils.isPresent(chip))) {
      Log.warn(`No status chip found for '${status.label}'`);
      return -1;
    }
    const text = await chip.first().innerText();
    const open = text.indexOf('(');
    const close = text.indexOf(')', open);
    if (open < 0 || close < 0) {
      return -1;
    }
    return Number.parseInt(text.substring(open + 1, close).replace(/[^0-9]/g, ''), 10);
  }

  /**
   * Polls a status tab until it reports the expected count. Tab counts are
   * refetched after an approval or a new request, so a single read straight
   * after the mutation races that refresh.
   */
  async waitForTabCount(status: LeaveStatus, expectedCount: number): Promise<boolean> {
    const reached = await WaitUtils.pollQuietly(
      this.page,
      async () => (await this.tabCount(status)) === expectedCount,
      ConfigManager.explicitWait(),
    );
    if (!reached) {
      Log.warn(`The '${status.label}' tab stayed at ${await this.tabCount(status)}, expected ${expectedCount}`);
    }
    return reached;
  }

  /**
   * Switches the grid to a status.
   *
   * The clickable surface is the chip wrapper, not the inert label span, and
   * the filter is confirmed by waiting for the grid to hold the number of
   * rows the chip advertises - a chip that silently did nothing would
   * otherwise leave the next check reading the unfiltered grid.
   */
  async selectStatusTab(status: LeaveStatus): Promise<this> {
    Log.step(`Switching to the '${status.label}' leave tab`);
    const expectedRows = await this.tabCount(status);

    const chip = MuiUtils.xpath(
      this.page,
      "//span[contains(@class,'MuiChip-label')]" +
        `[starts-with(normalize-space(.),${MuiUtils.escapeForXPath(`${status.label} (`)})]` +
        "/ancestor-or-self::*[contains(@class,'MuiChip-root') or @role='button' or self::button][1]",
    );

    await ElementUtils.click(chip);
    await this.waitForGridOrEmptyState();

    if (expectedRows >= 0 && !(await this.waitForGridTotal(expectedRows))) {
      Log.warn('The grid did not filter on the native click - replaying the full pointer sequence');
      await ElementUtils.clickViaScript(chip);
      await this.waitForGridOrEmptyState();
      await this.waitForGridTotal(expectedRows);
    }
    return this;
  }

  /** Polls the grid's pagination footer until it reports the expected total. */
  private waitForGridTotal(expectedTotal: number): Promise<boolean> {
    return WaitUtils.pollQuietly(this.page, async () => (await this.totalRequestCount()) === expectedTotal, 12_000);
  }

  // ---------------------------------------------------------------- grid

  isGridDisplayed(): Promise<boolean> {
    return ElementUtils.isDisplayed(this.page.locator(MuiUtils.DATA_GRID));
  }

  hasRecentRequestsSection(): Promise<boolean> {
    return ElementUtils.isDisplayed(this.recentRequestsHeading);
  }

  async visibleRowCount(): Promise<number> {
    return (await this.waitForGridOrEmptyState()) ? 0 : MuiUtils.gridRowCount(this.page);
  }

  /** Total across all pages, read from the pagination footer. */
  async totalRequestCount(): Promise<number> {
    return (await this.waitForGridOrEmptyState()) ? 0 : MuiUtils.gridTotalFromPagination(this.page);
  }

  /**
   * Waits for the request list to render in either of its two forms.
   *
   * A tab with no requests renders a "No ... found" message instead of a
   * data grid, so waiting for the grid alone times out on every empty tab -
   * the Pending tab is usually empty on this tenant.
   *
   * @return true when the empty state is shown, false when the grid is
   */
  private async waitForGridOrEmptyState(): Promise<boolean> {
    const rendered = await WaitUtils.poll(
      this.page,
      async () => {
        if (await WaitUtils.anyVisible(this.page.locator(MuiUtils.DATA_GRID))) {
          return 'grid';
        }
        return (await this.emptyState.count()) > 0 ? 'empty' : null;
      },
      ConfigManager.explicitWait(),
      'Neither the request grid nor its empty state rendered',
    );
    await WaitUtils.waitForDataToSettle(this.page);
    return rendered === 'empty';
  }

  hasRequestFor(employeeName: string): Promise<boolean> {
    return MuiUtils.gridHasRowContaining(this.page, employeeName);
  }

  /**
   * Status of the most recent request for an employee.
   *
   * Reads the whole row rather than a single cell: the grid virtualises
   * columns, so a status cell can be outside the rendered window while the
   * row itself is present.
   */
  async statusOf(employeeName: string): Promise<string> {
    const row = MuiUtils.gridRowContaining(this.page, employeeName);
    if (!(await ElementUtils.isPresent(row))) {
      return '';
    }
    const rowText = await row.first().innerText();
    const status = LeaveStatus.values().find((s) => s !== LeaveStatus.ALL && rowText.includes(s.label));
    return status?.label ?? '';
  }

  /**
   * True when one row carries the employee, the status and every fragment.
   *
   * Fragments pin down one specific request - an employee can have many
   * rows, and "sales1 is Approved" is true of some older request on any
   * given day.
   */
  hasRequestWithStatus(employeeName: string, status: LeaveStatus, ...fragments: string[]): Promise<boolean> {
    return WaitUtils.isVisibleWithin(this.rowMatching(employeeName, status.label, ...fragments), 12_000);
  }

  /** True when a row matches both the employee and a reason/date fragment. */
  hasRequestMatching(employeeName: string, fragment: string): Promise<boolean> {
    return WaitUtils.isVisibleWithin(this.rowMatching(employeeName, fragment), 12_000);
  }

  private rowMatching(...fragments: string[]): Locator {
    const predicates = fragments
      .map((f) => `[contains(normalize-space(.),${MuiUtils.escapeForXPath(f)})]`)
      .join('');
    return MuiUtils.xpath(this.page, `//div[contains(@class,'MuiDataGrid-row')]${predicates}`);
  }

  // ----------------------------------------------------------- approvals

  canApprove(): Promise<boolean> {
    return this.hasButton('Approve');
  }

  canReject(): Promise<boolean> {
    return this.hasButton('Reject');
  }

  /**
   * Approves the pending request on the row belonging to an employee.
   * Scoped to the row so a multi-row grid cannot approve the wrong request.
   */
  async approveRequestFor(employeeName: string): Promise<this> {
    Log.step(`Approving the leave request for ${employeeName}`);
    await this.clickRowAction(employeeName, 'Approve');
    return this;
  }

  async rejectRequestFor(employeeName: string): Promise<this> {
    Log.step(`Rejecting the leave request for ${employeeName}`);
    await this.clickRowAction(employeeName, 'Reject');
    return this;
  }

  private async clickRowAction(employeeName: string, action: string): Promise<void> {
    await ElementUtils.click(
      MuiUtils.xpath(
        this.page,
        `//div[contains(@class,'MuiDataGrid-row')][contains(normalize-space(.),${MuiUtils.escapeForXPath(employeeName)})]` +
          `//button[normalize-space(.)=${MuiUtils.escapeForXPath(action)}]`,
      ),
    );
    // The action may raise a confirmation dialog depending on configuration.
    if (await WaitUtils.isVisibleWithin(this.page.locator(MuiUtils.DIALOG), 3_000)) {
      await MuiUtils.clickDialogButton(this.page, action);
      await MuiUtils.waitForDialogToClose(this.page);
    }
    await WaitUtils.waitForDataToSettle(this.page);
  }

  // -------------------------------------------------------- apply drawer

  canApplyForLeave(): Promise<boolean> {
    return ElementUtils.isDisplayed(this.applyLeaveButton);
  }

  async openApplyLeaveDrawer(): Promise<ApplyLeaveDrawer> {
    Log.step('Opening the Apply for Leave drawer');
    const recordLeave = MuiUtils.buttonByText(this.page, 'Record Leave');

    await ElementUtils.click(this.applyLeaveButton);
    if (!(await WaitUtils.isVisibleWithin(recordLeave, 6_000))) {
      Log.warn('The leave drawer did not open on the native click - replaying the full pointer sequence');
      await ElementUtils.clickViaScript(this.applyLeaveButton);
      await WaitUtils.waitForVisible(recordLeave);
    }

    // The drawer slides in. Its fields are already "visible" while the
    // transform is still running, but they refuse input until it settles.
    await this.page.waitForTimeout(700);
    return new ApplyLeaveDrawer(this.page);
  }
}
