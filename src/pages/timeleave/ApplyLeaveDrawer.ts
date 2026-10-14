import { LeaveRequestData } from '../../data/model/LeaveRequestData';
import { LeaveType } from '../../enums/LeaveType';
import { WaitStrategy } from '../../enums/WaitStrategy';
import { ElementUtils } from '../../utils/ElementUtils';
import { Log } from '../../utils/Log';
import { MuiUtils } from '../../utils/MuiUtils';
import { WaitUtils } from '../../utils/WaitUtils';
import { LeavesPage } from './LeavesPage';

/**
 * The right-hand Apply-for-Leave drawer.
 *
 * A MUI Drawer, not a Dialog, so it has no role="dialog" and the MuiUtils
 * dialog helpers do not apply. Fields carry no name attributes either, so
 * everything here is located by its visible label.
 *
 * "Target Employee" only renders for personas allowed to apply on behalf of
 * someone else; an ordinary employee sees the drawer without it.
 */
export class ApplyLeaveDrawer {

    // Scoped to the drawer for the same reason the dialogs are: an unscoped
    // label match can resolve to a control on the page behind the overlay.
    private static readonly TARGET_EMPLOYEE_INPUT = ".MuiDrawer-paper input[placeholder*='Search employee']";
    private static readonly LEAVE_TYPE_SELECT = MuiUtils.selectByLabelIn(MuiUtils.IN_DRAWER, 'Leave Type');
    private static readonly START_DATE = MuiUtils.inputByLabelIn(MuiUtils.IN_DRAWER, 'Start Date');
    private static readonly END_DATE = MuiUtils.inputByLabelIn(MuiUtils.IN_DRAWER, 'End Date');
    private static readonly REASON = ".MuiDrawer-paper textarea[placeholder*='reason for leave']";

    private static readonly FULL_DAY_TOGGLE = MuiUtils.buttonByText('Full Day');
    private static readonly HALF_DAY_TOGGLE = MuiUtils.buttonByText('Half Day');
    private static readonly RECORD_LEAVE_BUTTON = MuiUtils.buttonByText('Record Leave');

    // -------------------------------------------------------------- state

    async isOpen(): Promise<boolean> {
        return ElementUtils.isDisplayed(ApplyLeaveDrawer.RECORD_LEAVE_BUTTON);
    }

    /** Present only for personas permitted to apply on another's behalf. */
    async hasTargetEmployeeField(): Promise<boolean> {
        return ElementUtils.isDisplayed(ApplyLeaveDrawer.TARGET_EMPLOYEE_INPUT);
    }

    async hasDurationToggles(): Promise<boolean> {
        return await ElementUtils.isDisplayed(ApplyLeaveDrawer.FULL_DAY_TOGGLE)
            && await ElementUtils.isDisplayed(ApplyLeaveDrawer.HALF_DAY_TOGGLE);
    }

    async allFieldsDisplayed(): Promise<boolean> {
        return await ElementUtils.isDisplayed(ApplyLeaveDrawer.LEAVE_TYPE_SELECT)
            && await ElementUtils.isDisplayed(ApplyLeaveDrawer.START_DATE)
            && await ElementUtils.isDisplayed(ApplyLeaveDrawer.END_DATE)
            && await this.hasDurationToggles();
    }

    // ------------------------------------------------------------- filling

    async selectTargetEmployee(employeeName: string): Promise<this> {
        Log.step('Recording leave on behalf of ' + employeeName);
        await MuiUtils.searchAndSelect(ApplyLeaveDrawer.TARGET_EMPLOYEE_INPUT, employeeName);
        return this;
    }

    /**
     * Picks the leave type.
     *
     * Matched on a prefix, not an exact string: the option carries the live
     * remaining balance - "Casual Leave (9 left)" - so the label changes as
     * leave is consumed. An exact match works exactly once and then breaks for
     * a reason that has nothing to do with the code.
     */
    async selectLeaveType(leaveType: LeaveType): Promise<this> {
        await MuiUtils.selectOptionContaining(ApplyLeaveDrawer.LEAVE_TYPE_SELECT, leaveType.optionLabel());
        return this;
    }

    async chooseFullDay(): Promise<this> {
        await ElementUtils.click(ApplyLeaveDrawer.FULL_DAY_TOGGLE);
        return this;
    }

    async chooseHalfDay(): Promise<this> {
        await ElementUtils.click(ApplyLeaveDrawer.HALF_DAY_TOGGLE);
        return this;
    }

    async enterStartDate(mmddyyyy: string): Promise<this> {
        await ElementUtils.typeIntoDateField(ApplyLeaveDrawer.START_DATE, mmddyyyy);
        return this;
    }

    async enterEndDate(mmddyyyy: string): Promise<this> {
        await ElementUtils.typeIntoDateField(ApplyLeaveDrawer.END_DATE, mmddyyyy);
        return this;
    }

    async enterReason(reason: string): Promise<this> {
        await ElementUtils.type(ApplyLeaveDrawer.REASON, reason);
        return this;
    }

    async fill(data: LeaveRequestData): Promise<this> {
        Log.step('Filling the leave form: ' + data);
        if (data.targetEmployee != null && await this.hasTargetEmployeeField()) {
            await this.selectTargetEmployee(data.targetEmployee);
        }
        if (data.leaveType != null) {
            await this.selectLeaveType(data.leaveType);
        }
        if (data.halfDay) {
            await this.chooseHalfDay();
        } else {
            await this.chooseFullDay();
        }
        if (data.startDate != null && data.startDate.trim() !== '') {
            await this.enterStartDate(data.startDate);
        }
        if (data.endDate != null && data.endDate.trim() !== '') {
            await this.enterEndDate(data.endDate);
        }
        if (data.reason != null) {
            await this.enterReason(data.reason);
        }
        return this;
    }

    // ---------------------------------------------------------- submitting

    /** Submits without asserting - used by the validation tests. */
    async clickRecordLeave(): Promise<this> {
        Log.step('Submitting the leave request');
        await ElementUtils.click(ApplyLeaveDrawer.RECORD_LEAVE_BUTTON);
        return this;
    }

    /**
     * Submits a valid request and waits for the drawer to close.
     *
     * The drawer closing is the only confirmation a save happened. A native
     * click can be absorbed without effect - the form stays open with no
     * validation error - so that case is retried once with the full pointer
     * sequence, the same way sign-in is.
     */
    async submitExpectingSuccess(): Promise<LeavesPage> {
        await this.clickRecordLeave();
        if (!await WaitUtils.waitForInvisibleQuietly(ApplyLeaveDrawer.RECORD_LEAVE_BUTTON, 8000)) {
            Log.warn('The leave drawer did not react to the submit - replaying the full pointer sequence');
            await ElementUtils.clickViaScript(ApplyLeaveDrawer.RECORD_LEAVE_BUTTON);
        }
        await WaitUtils.waitForInvisible(ApplyLeaveDrawer.RECORD_LEAVE_BUTTON);
        await WaitUtils.waitForDataToSettle();
        Log.pass('Leave request recorded');
        return new LeavesPage();
    }

    /**
     * Closes the drawer without submitting, and confirms it actually closed.
     *
     * A drawer left open keeps its backdrop over the page, so the next
     * interaction fails somewhere unrelated to the test that caused it.
     */
    async close(): Promise<LeavesPage> {
        await ElementUtils.pressEscape();
        if (await WaitUtils.waitForInvisibleQuietly(ApplyLeaveDrawer.RECORD_LEAVE_BUTTON, 5000)) {
            return new LeavesPage();
        }

        Log.warn('The leave drawer ignored Escape - dismissing it through the backdrop');
        if (await ElementUtils.isPresent(MuiUtils.BACKDROP)) {
            await ElementUtils.clickViaScript(await ElementUtils.find(MuiUtils.BACKDROP, WaitStrategy.PRESENT));
        }
        await WaitUtils.waitForInvisibleQuietly(ApplyLeaveDrawer.RECORD_LEAVE_BUTTON, 5000);
        return new LeavesPage();
    }

    // ---------------------------------------------------------- validation

    async validationMessages(): Promise<string[]> {
        await WaitUtils.sleepQuietly(600);
        const messages = (await ElementUtils.textsOf(MuiUtils.FIELD_ERROR)).filter(text => text !== '');
        return [...new Set(messages)];
    }

    /**
     * The drawer staying open is the app rejecting the submission.
     * With no toast to read, this is the observable signal of a failed submit.
     */
    async remainsOpenAfterSubmit(): Promise<boolean> {
        await WaitUtils.sleepQuietly(2000);
        return ElementUtils.isDisplayed(ApplyLeaveDrawer.RECORD_LEAVE_BUTTON);
    }

    /** True when the native date input rejected the value and stayed empty. */
    async isStartDateEmpty(): Promise<boolean> {
        return (await ElementUtils.getValue(ApplyLeaveDrawer.START_DATE)) === '';
    }
}
