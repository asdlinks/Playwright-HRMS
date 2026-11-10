import { LeaveRequestData, describeLeaveRequest } from '../../data/model/LeaveRequestData';
import { LeaveType } from '../../enums/LeaveType';
import { ElementUtils } from '../../utils/ElementUtils';
import { Log } from '../../utils/Log';
import { MuiUtils } from '../../utils/MuiUtils';
import { WaitUtils } from '../../utils/WaitUtils';
import { BaseComponent } from '../base/BaseComponent';
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
export class ApplyLeaveDrawer extends BaseComponent {
  // Scoped to the drawer for the same reason the dialogs are: an unscoped
  // label match can resolve to a control on the page behind the overlay.
  private readonly targetEmployeeInput = this.page.locator(".MuiDrawer-paper input[placeholder*='Search employee']");
  private readonly leaveTypeSelect = MuiUtils.selectByLabelIn(this.page, MuiUtils.IN_DRAWER, 'Leave Type');
  private readonly startDate = MuiUtils.inputByLabelIn(this.page, MuiUtils.IN_DRAWER, 'Start Date');
  private readonly endDate = MuiUtils.inputByLabelIn(this.page, MuiUtils.IN_DRAWER, 'End Date');
  private readonly reason = this.page.locator(".MuiDrawer-paper textarea[placeholder*='reason for leave']");

  private readonly fullDayToggle = MuiUtils.buttonByText(this.page, 'Full Day');
  private readonly halfDayToggle = MuiUtils.buttonByText(this.page, 'Half Day');
  private readonly recordLeaveButton = MuiUtils.buttonByText(this.page, 'Record Leave');

  // -------------------------------------------------------------- state

  isDisplayed(): Promise<boolean> {
    return ElementUtils.isDisplayed(this.recordLeaveButton);
  }

  isOpen(): Promise<boolean> {
    return this.isDisplayed();
  }

  /** Present only for personas permitted to apply on another's behalf. */
  hasTargetEmployeeField(): Promise<boolean> {
    return ElementUtils.isDisplayed(this.targetEmployeeInput);
  }

  async hasDurationToggles(): Promise<boolean> {
    return (await ElementUtils.isDisplayed(this.fullDayToggle)) && (await ElementUtils.isDisplayed(this.halfDayToggle));
  }

  async allFieldsDisplayed(): Promise<boolean> {
    return (
      (await ElementUtils.isDisplayed(this.leaveTypeSelect)) &&
      (await ElementUtils.isDisplayed(this.startDate)) &&
      (await ElementUtils.isDisplayed(this.endDate)) &&
      (await this.hasDurationToggles())
    );
  }

  // ------------------------------------------------------------- filling

  async selectTargetEmployee(employeeName: string): Promise<this> {
    Log.step(`Recording leave on behalf of ${employeeName}`);
    await MuiUtils.searchAndSelect(this.targetEmployeeInput, employeeName);
    return this;
  }

  /**
   * Picks the leave type.
   *
   * Matched on a prefix, not an exact string: the option carries the live
   * remaining balance - "Casual Leave (9 left)" - so the label changes as
   * leave is consumed. An exact match works exactly once.
   */
  async selectLeaveType(leaveType: LeaveType): Promise<this> {
    await MuiUtils.selectOptionContaining(this.leaveTypeSelect, leaveType.optionLabel);
    return this;
  }

  /**
   * Selects the first leave type, in preference order, that still has days
   * left. The days come from the options - "Casual Leave (8 left)" - and once
   * a Target Employee is selected they are THAT employee's balance, so call
   * this after selecting one.
   *
   * Reads and chooses in one opening of the menu: closing it sends Escape,
   * which would close this drawer too.
   *
   * @return the type selected, or null when every type has 0 days left
   */
  async selectLeaveTypeWithBalance(preference: LeaveType[]): Promise<LeaveType | null> {
    const options = await MuiUtils.openAndReadOptions(this.leaveTypeSelect);
    for (const type of preference) {
      const option = options.find((o) => o.startsWith(type.optionLabel));
      const match = option?.match(/\((\d+) left\)/);
      const left = match ? Number.parseInt(match[1], 10) : -1;
      Log.info(`${type.gridLabel} days left for the target employee: ${left}`);
      if (left > 0) {
        await MuiUtils.chooseOpenOptionContaining(this.page, type.optionLabel);
        return type;
      }
    }
    await MuiUtils.closeDropdown(this.page);
    return null;
  }

  async chooseFullDay(): Promise<this> {
    await ElementUtils.click(this.fullDayToggle);
    return this;
  }

  async chooseHalfDay(): Promise<this> {
    await ElementUtils.click(this.halfDayToggle);
    return this;
  }

  async enterStartDate(mmddyyyy: string): Promise<this> {
    await ElementUtils.typeIntoDateField(this.startDate, mmddyyyy);
    return this;
  }

  async enterEndDate(mmddyyyy: string): Promise<this> {
    await ElementUtils.typeIntoDateField(this.endDate, mmddyyyy);
    return this;
  }

  async enterReason(reason: string): Promise<this> {
    await ElementUtils.type(this.reason, reason);
    return this;
  }

  async fill(data: LeaveRequestData): Promise<this> {
    Log.step(`Filling the leave form: ${describeLeaveRequest(data)}`);
    if (data.targetEmployee && (await this.hasTargetEmployeeField())) {
      await this.selectTargetEmployee(data.targetEmployee);
    }
    await this.selectLeaveType(data.leaveType ?? LeaveType.CASUAL);
    if (data.halfDay) {
      await this.chooseHalfDay();
    } else {
      await this.chooseFullDay();
    }
    if (data.startDate?.trim()) {
      await this.enterStartDate(data.startDate);
    }
    if (data.endDate?.trim()) {
      await this.enterEndDate(data.endDate);
    }
    if (data.reason !== undefined) {
      await this.enterReason(data.reason);
    }
    return this;
  }

  // ---------------------------------------------------------- submitting

  /** Submits without checking the outcome - used by the validation tests. */
  async clickRecordLeave(): Promise<this> {
    Log.step('Submitting the leave request');
    await ElementUtils.click(this.recordLeaveButton);
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
    if (!(await WaitUtils.waitForInvisibleQuietly(this.recordLeaveButton, 8_000))) {
      Log.warn('The leave drawer did not react to the submit - replaying the full pointer sequence');
      await ElementUtils.clickViaScript(this.recordLeaveButton);
    }
    await WaitUtils.waitForInvisible(this.recordLeaveButton);
    await WaitUtils.waitForDataToSettle(this.page);
    Log.pass('Leave request recorded');
    return new LeavesPage(this.page);
  }

  /**
   * Closes the drawer without submitting, and confirms it actually closed.
   *
   * A drawer left open keeps its backdrop over the page, so the next
   * interaction fails somewhere unrelated to the test that caused it.
   */
  async close(): Promise<LeavesPage> {
    await ElementUtils.pressEscape(this.page);
    if (await WaitUtils.waitForInvisibleQuietly(this.recordLeaveButton, 5_000)) {
      return new LeavesPage(this.page);
    }
    Log.warn('The leave drawer ignored Escape - dismissing it through the backdrop');
    const backdrop = this.page.locator(MuiUtils.BACKDROP);
    if (await ElementUtils.isPresent(backdrop)) {
      await ElementUtils.clickViaScript(backdrop);
    }
    await WaitUtils.waitForInvisibleQuietly(this.recordLeaveButton, 5_000);
    return new LeavesPage(this.page);
  }

  // ---------------------------------------------------------- validation

  async validationMessages(): Promise<string[]> {
    await this.page.waitForTimeout(600);
    return ElementUtils.distinctTexts(this.page.locator(MuiUtils.FIELD_ERROR));
  }

  /**
   * The drawer staying open is the app rejecting the submission. With no
   * toast to read, this is the observable signal of a failed submit.
   */
  async remainsOpenAfterSubmit(): Promise<boolean> {
    await this.page.waitForTimeout(2_000);
    return ElementUtils.isDisplayed(this.recordLeaveButton);
  }

  /** True when the date input is empty (nothing was entered or it was rejected). */
  async isStartDateEmpty(): Promise<boolean> {
    return (await ElementUtils.getValue(this.startDate)) === '';
  }
}
