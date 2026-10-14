import { ConfigManager } from '../../config/ConfigManager';
import { AppModule } from '../../enums/AppModule';
import { LeaveStatus } from '../../enums/LeaveStatus';
import { LeaveType } from '../../enums/LeaveType';
import { WaitStrategy } from '../../enums/WaitStrategy';
import { WaitTimeoutError } from '../../exceptions/errors';
import { DriverManager } from '../../driver/DriverManager';
import { ElementUtils } from '../../utils/ElementUtils';
import { Log } from '../../utils/Log';
import { MuiUtils, parseJavaInt } from '../../utils/MuiUtils';
import { WaitUtils } from '../../utils/WaitUtils';
import { BasePage } from '../base/BasePage';
import { SideNavComponent } from '../components/SideNavComponent';
import { ApplyLeaveDrawer } from './ApplyLeaveDrawer';

const xpath = MuiUtils.xpath;
const esc = MuiUtils.escapeForXPath;

/**
 * Leave Management.
 *
 * Three things a reader should know:
 *
 *  - The balance cards ("Casual 10/10") always show the SIGNED-IN user's own
 *    entitlement, never the target employee's, even when an administrator is
 *    recording leave on someone else's behalf.
 *  - The status tabs carry live counts - "All (6)", "Pending (1)" - which is
 *    what makes tab-versus-grid consistency assertable.
 *  - Approve / Reject buttons only render on rows that are still Pending.
 */
export class LeavesPage extends BasePage {

    private static readonly APPLY_LEAVE_BUTTON = MuiUtils.buttonByText('Apply for Leave');
    private static readonly RECENT_REQUESTS_HEADING = xpath("//*[normalize-space(text())='Recent Requests']");

    /** The message shown in place of the grid when a tab has no requests. */
    private static readonly EMPTY_STATE = xpath(
        "//main//*[starts-with(normalize-space(text()),'No ')][contains(normalize-space(text()),'found')]");

    private readonly sideNavComponent = new SideNavComponent();

    landingMarker(): string {
        return AppModule.LEAVES.landingMarker();
    }

    route(): string {
        return AppModule.LEAVES.route();
    }

    sideNav(): SideNavComponent {
        return this.sideNavComponent;
    }

    // ------------------------------------------------------- balance cards

    /**
     * Remaining days for a leave type, read from the "10/10" balance card.
     * Returns -1 when the card is absent.
     */
    async remainingBalance(leaveType: LeaveType): Promise<number> {
        return this.readBalance(leaveType, 1);
    }

    /** Total entitlement - the denominator of the balance card. */
    async totalEntitlement(leaveType: LeaveType): Promise<number> {
        return this.readBalance(leaveType, 2);
    }

    /**
     * Reads one side of the "remaining/total" figure on a balance card.
     *
     * The card label is matched CASE-INSENSITIVELY on purpose: the DOM holds
     * "casual" in lowercase and MUI renders it uppercase through CSS
     * text-transform. Matching the rendered casing finds nothing.
     *
     * @param group 1 for the remaining days, 2 for the total entitlement
     */
    private async readBalance(leaveType: LeaveType, group: 1 | 2): Promise<number> {
        // The cards mount only once the balance fetch resolves, so a read
        // taken straight after navigation finds nothing. Poll until they do.
        try {
            return await WaitUtils.fluently(async () => {
                const value = await this.readBalanceOnce(leaveType, group);
                return value < 0 ? null : value;
            }, 15000, `Balance card for ${leaveType} never rendered`);
        } catch (e) {
            if (e instanceof WaitTimeoutError) {
                return -1;
            }
            throw e;
        }
    }

    private async readBalanceOnce(leaveType: LeaveType, group: 1 | 2): Promise<number> {
        const result = await this.page().evaluate(([cardLabel, matchGroup]) => {
            const label = cardLabel.toLowerCase();
            const leaf = [...document.querySelectorAll('main div,main span,main p')]
                .find(e => e.children.length === 0 && (e.textContent || '').trim().toLowerCase() === label);
            if (!leaf) return null;
            let node: HTMLElement | null = leaf as HTMLElement;
            for (let hop = 0; hop < 4 && node; hop++) {
                node = node.parentElement;
                if (!node) break;
                const match = (node.innerText || '').match(/(\d+)\s*\/\s*(\d+)/);
                if (match) return match[matchGroup];
            }
            return null;
        }, [leaveType.gridLabel(), group] as const);
        return result === null ? -1 : Number.parseInt(result, 10);
    }

    async allBalanceCardsDisplayed(): Promise<boolean> {
        return await this.remainingBalance(LeaveType.CASUAL) >= 0
            && await this.remainingBalance(LeaveType.SICK) >= 0
            && await this.remainingBalance(LeaveType.PAID) >= 0;
    }

    // ---------------------------------------------------------- status tabs

    /**
     * The status "tabs" are MUI Chips, each a span.MuiChip-label reading
     * "Pending (1)" inside a clickable wrapper.
     *
     * The locator is anchored to that label span and matched on its own text.
     * An earlier, looser locator matched any ancestor CONTAINING the text,
     * which resolved to the strip wrapping all five chips - every status then
     * reported the same number, and the tabs appeared not to reconcile.
     */
    private static statusChipLabel(status: LeaveStatus): string {
        return xpath("//span[contains(@class,'MuiChip-label')]"
            + `[starts-with(normalize-space(.),${esc(status.label() + ' (')})]`);
    }

    /** Count shown on a status chip, e.g. 6 from "All (6)". */
    async tabCount(status: LeaveStatus): Promise<number> {
        const chip = LeavesPage.statusChipLabel(status);
        if (!await ElementUtils.isPresent(chip)) {
            Log.warn(`No status chip found for '${status.label()}'`);
            return -1;
        }
        const text = await (await ElementUtils.find(chip, WaitStrategy.PRESENT)).innerText();
        const open = text.indexOf('(');
        const close = text.indexOf(')', open);
        if (open < 0 || close < 0) {
            return -1;
        }
        return parseJavaInt(text.substring(open + 1, close).replace(/[^0-9]/g, ''));
    }

    /**
     * Polls a status tab until it reports the expected count.
     *
     * The tab counts are refetched after an approval or a new request, so a
     * single read straight after the mutation races that refresh.
     */
    async waitForTabCount(status: LeaveStatus, expectedCount: number): Promise<boolean> {
        try {
            await WaitUtils.fluently(async () => (await this.tabCount(status)) === expectedCount,
                ConfigManager.explicitWait(), `The '${status.label()}' tab never reached ${expectedCount}`);
            return true;
        } catch (e) {
            if (!(e instanceof WaitTimeoutError)) {
                throw e;
            }
            Log.warn(`The '${status.label()}' tab stayed at ${await this.tabCount(status)}, expected ${expectedCount}`);
            return false;
        }
    }

    /**
     * Switches the grid to a status.
     *
     * The clickable surface is the chip wrapper, not the inert label span, and
     * the filter is confirmed by waiting for the grid to actually hold the
     * number of rows the chip advertises - clicking a chip that silently does
     * nothing would otherwise leave the next assertion reading the unfiltered
     * grid and failing for the wrong reason.
     */
    async selectStatusTab(status: LeaveStatus): Promise<this> {
        Log.step(`Switching to the '${status.label()}' leave tab`);
        const expectedRows = await this.tabCount(status);

        const chip = xpath("//span[contains(@class,'MuiChip-label')]"
            + `[starts-with(normalize-space(.),${esc(status.label() + ' (')})]`
            + "/ancestor-or-self::*[contains(@class,'MuiChip-root') or @role='button' or self::button][1]");

        await ElementUtils.click(chip);
        await this.waitForGridOrEmptyState();

        if (expectedRows >= 0 && !await this.waitForGridTotal(expectedRows)) {
            Log.warn('The grid did not filter on the native click - replaying the full pointer sequence');
            await ElementUtils.clickViaScript(chip);
            await this.waitForGridOrEmptyState();
            await this.waitForGridTotal(expectedRows);
        }
        return this;
    }

    /** Polls the grid's pagination footer until it reports the expected total. */
    private async waitForGridTotal(expectedTotal: number): Promise<boolean> {
        try {
            await WaitUtils.fluently(async () => (await this.totalRequestCount()) === expectedTotal,
                12000, `The grid never showed ${expectedTotal} rows`);
            return true;
        } catch (e) {
            if (e instanceof WaitTimeoutError) {
                return false;
            }
            throw e;
        }
    }

    // ---------------------------------------------------------------- grid

    async isGridDisplayed(): Promise<boolean> {
        return ElementUtils.isDisplayed(MuiUtils.DATA_GRID);
    }

    async hasRecentRequestsSection(): Promise<boolean> {
        return ElementUtils.isDisplayed(LeavesPage.RECENT_REQUESTS_HEADING);
    }

    async visibleRowCount(): Promise<number> {
        return await this.waitForGridOrEmptyState() ? 0 : MuiUtils.gridRowCount();
    }

    /** Total across all pages, read from the pagination footer. */
    async totalRequestCount(): Promise<number> {
        return await this.waitForGridOrEmptyState() ? 0 : MuiUtils.gridTotalFromPagination();
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
        const page = DriverManager.get();
        const rendered = await WaitUtils.fluently(async () => {
            if ((await page.locator(MuiUtils.DATA_GRID).filter({ visible: true }).count()) > 0) {
                return 'grid';
            }
            return await ElementUtils.isPresent(LeavesPage.EMPTY_STATE) ? 'empty' : null;
        }, ConfigManager.explicitWait(), 'Neither the request grid nor its empty state rendered');
        await WaitUtils.waitForDataToSettle();
        return rendered === 'empty';
    }

    async hasRequestFor(employeeName: string): Promise<boolean> {
        return MuiUtils.gridHasRowContaining(employeeName);
    }

    /**
     * Status of the most recent request for an employee.
     *
     * Reads the whole row rather than a single cell: the grid virtualises
     * columns, so a status cell can be outside the rendered window while the
     * row itself is present.
     */
    async statusOf(employeeName: string): Promise<string> {
        const row = MuiUtils.gridRowContaining(employeeName);
        if (!await ElementUtils.isPresent(row)) {
            return '';
        }
        const rowText = await (await ElementUtils.find(row, WaitStrategy.PRESENT)).innerText();
        for (const status of LeaveStatus.values()) {
            if (status !== LeaveStatus.ALL && rowText.includes(status.label())) {
                return status.label();
            }
        }
        return '';
    }

    /**
     * True when one row carries the employee, every fragment and the status.
     *
     * Used to pin down one specific request - an employee can have many rows,
     * and "sales1 is Approved" is true of some older request on any given day.
     */
    async hasRequestWithStatus(employeeName: string, status: LeaveStatus, ...fragments: string[]): Promise<boolean> {
        let row = "//div[contains(@class,'MuiDataGrid-row')]"
            + `[contains(normalize-space(.),${esc(employeeName)})]`
            + `[contains(normalize-space(.),${esc(status.label())})]`;
        for (const fragment of fragments) {
            row += `[contains(normalize-space(.),${esc(fragment)})]`;
        }
        return WaitUtils.isVisibleWithin(xpath(row), 12000);
    }

    /** True when a row matches both the employee and a reason/date fragment. */
    async hasRequestMatching(employeeName: string, fragment: string): Promise<boolean> {
        const row = xpath("//div[contains(@class,'MuiDataGrid-row')]"
            + `[contains(normalize-space(.),${esc(employeeName)})]`
            + `[contains(normalize-space(.),${esc(fragment)})]`);
        return WaitUtils.isVisibleWithin(row, 12000);
    }

    // ----------------------------------------------------------- approvals

    async canApprove(): Promise<boolean> {
        return ElementUtils.isDisplayed(MuiUtils.buttonByText('Approve'));
    }

    async canReject(): Promise<boolean> {
        return ElementUtils.isDisplayed(MuiUtils.buttonByText('Reject'));
    }

    /**
     * Approves the pending request on the row belonging to an employee.
     * Scoped to the row so a multi-row grid cannot approve the wrong request.
     */
    async approveRequestFor(employeeName: string): Promise<this> {
        Log.step('Approving the leave request for ' + employeeName);
        await this.clickRowAction(employeeName, 'Approve');
        return this;
    }

    async rejectRequestFor(employeeName: string): Promise<this> {
        Log.step('Rejecting the leave request for ' + employeeName);
        await this.clickRowAction(employeeName, 'Reject');
        return this;
    }

    private async clickRowAction(employeeName: string, action: string): Promise<void> {
        const actionButton = xpath("//div[contains(@class,'MuiDataGrid-row')]"
            + `[contains(normalize-space(.),${esc(employeeName)})]`
            + `//button[normalize-space(.)=${esc(action)}]`);
        await ElementUtils.click(actionButton);

        // The action may raise a confirmation dialog depending on configuration.
        if (await WaitUtils.isVisibleWithin(MuiUtils.DIALOG, 3000)) {
            await MuiUtils.clickDialogButton(action);
            await MuiUtils.waitForDialogToClose();
        }
        await WaitUtils.waitForDataToSettle();
    }

    // -------------------------------------------------------- apply drawer

    async canApplyForLeave(): Promise<boolean> {
        return ElementUtils.isDisplayed(LeavesPage.APPLY_LEAVE_BUTTON);
    }

    async openApplyLeaveDrawer(): Promise<ApplyLeaveDrawer> {
        Log.step('Opening the Apply for Leave drawer');
        const recordLeave = MuiUtils.buttonByText('Record Leave');

        await ElementUtils.click(LeavesPage.APPLY_LEAVE_BUTTON);
        if (!await WaitUtils.isVisibleWithin(recordLeave, 6000)) {
            Log.warn('The leave drawer did not open on the native click - replaying the full pointer sequence');
            await ElementUtils.clickViaScript(LeavesPage.APPLY_LEAVE_BUTTON);
            await WaitUtils.waitForVisible(recordLeave);
        }

        // The drawer slides in. Its fields are already in the DOM and already
        // "visible" while the transform is still running, but they refuse
        // keystrokes until it settles, which surfaces as a failed action on
        // the first field touched.
        await WaitUtils.sleepQuietly(700);
        return new ApplyLeaveDrawer();
    }
}
