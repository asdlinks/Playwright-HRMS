import type { Locator } from '@playwright/test';
import { AppModule } from '../../enums/AppModule';
import { WaitStrategy } from '../../enums/WaitStrategy';
import { FrameworkException, WaitTimeoutException } from '../../exceptions/FrameworkException';
import { ElementUtils } from '../../utils/ElementUtils';
import { Log } from '../../utils/Log';
import { MuiUtils } from '../../utils/MuiUtils';
import { WaitUtils } from '../../utils/WaitUtils';
import { BasePage } from '../base/BasePage';
import { EditEmployeeDialog } from './EditEmployeeDialog';
import { EmployeeOnboardingWizard } from './EmployeeOnboardingWizard';
import { EmployeeProfilePage } from './EmployeeProfilePage';

/** The "(used/limit)" figures inside the plan banner. */
const SEAT_USAGE = /\((\d+)\s*\/\s*(\d+)\)/;

/** Employee Directory - the org-wide people list with KPI strip and filters. */
export class EmployeeDirectoryPage extends BasePage {
  static readonly KPI_TOTAL_EMPLOYEES = 'Total Employees';
  static readonly KPI_DEPARTMENTS = 'Departments';
  static readonly KPI_MANAGERS = 'Managers';
  static readonly KPI_NEW_JOINERS = 'New Joiners (This Month)';

  private readonly addEmployeeButton = MuiUtils.buttonByText(this.page, 'Add New Employee');
  private readonly exportButton = MuiUtils.buttonByText(this.page, 'Export');
  private readonly nameSearch = this.page.locator("input[placeholder*='Search by name']");

  private readonly departmentFilter = MuiUtils.selectByLabel(this.page, 'Department');
  private readonly branchFilter = MuiUtils.selectByLabel(this.page, 'Branch');
  private readonly designationFilter = MuiUtils.selectByLabel(this.page, 'Designation');
  private readonly employmentTypeFilter = MuiUtils.selectByLabel(this.page, 'Employment Type');
  private readonly roleFilter = MuiUtils.selectByLabel(this.page, 'Role');

  /**
   * Banner the app shows when the tenant's plan seat limit is near or
   * reached. Matched on the element's own text node so it resolves to the
   * message itself rather than every ancestor.
   */
  private readonly planLimitBanner = MuiUtils.xpath(this.page, "//*[contains(text(),'employee limit')]");

  landingMarker(): string {
    return AppModule.EMPLOYEE_DIRECTORY.landingMarker;
  }

  route(): string {
    return AppModule.EMPLOYEE_DIRECTORY.route;
  }

  // ------------------------------------------------------------- KPI strip

  totalEmployees(): Promise<number> {
    return this.readSettledKpiCard(EmployeeDirectoryPage.KPI_TOTAL_EMPLOYEES);
  }

  departmentCount(): Promise<number> {
    return this.readSettledKpiCard(EmployeeDirectoryPage.KPI_DEPARTMENTS);
  }

  managerCount(): Promise<number> {
    return this.readKpiCard(EmployeeDirectoryPage.KPI_MANAGERS);
  }

  newJoinersThisMonth(): Promise<number> {
    return this.readKpiCard(EmployeeDirectoryPage.KPI_NEW_JOINERS);
  }

  // ------------------------------------------------------------- controls

  canAddEmployee(): Promise<boolean> {
    return ElementUtils.isDisplayed(this.addEmployeeButton);
  }

  canExport(): Promise<boolean> {
    return ElementUtils.isDisplayed(this.exportButton);
  }

  async allFiltersDisplayed(): Promise<boolean> {
    for (const filter of [
      this.departmentFilter,
      this.branchFilter,
      this.designationFilter,
      this.employmentTypeFilter,
      this.roleFilter,
    ]) {
      if (!(await ElementUtils.isDisplayed(filter))) {
        return false;
      }
    }
    return true;
  }

  /** Add New Employee opens the six-step Employee Onboarding wizard. */
  async openOnboardingWizard(): Promise<EmployeeOnboardingWizard> {
    Log.step('Opening the Employee Onboarding wizard');
    await MuiUtils.openDialogFrom(this.addEmployeeButton);
    return new EmployeeOnboardingWizard(this.page);
  }

  // ------------------------------------------------- per-employee actions

  /**
   * The row action (View Profile / Edit / Reset Password / Delete) on ONE
   * employee's card in the org tree, or null when no card shows that name.
   *
   * The tree nests cards (a manager's card contains their reports), so the
   * card is the smallest ancestor of an action button that holds exactly one
   * button of that kind AND an element whose own text is the name. The name
   * is matched exactly: "Priya Nair" must never resolve to "Priya Nair Jr".
   */
  private cardAction(fullName: string, action: string): Promise<Locator | null> {
    return ElementUtils.locateByScript(
      this.page,
      ([name, label]) => {
        const selector = `[aria-label="${label}"], [title="${label}"]`;
        for (const button of document.querySelectorAll(selector)) {
          let card = button.parentElement;
          while (card && card !== document.body && card.querySelectorAll(selector).length === 1) {
            const named = [...card.querySelectorAll('*')].some(
              (e) => e.children.length === 0 && (e.textContent || '').trim() === name,
            );
            if (named) return button;
            card = card.parentElement;
          }
        }
        return null;
      },
      [fullName, action],
    );
  }

  private async requireCardAction(fullName: string, action: string): Promise<Locator> {
    try {
      return await WaitUtils.poll(
        this.page,
        () => this.cardAction(fullName, action),
        12_000,
        `No '${action}' action on a card for '${fullName}'`,
      );
    } catch (e) {
      if (!(e instanceof WaitTimeoutException)) throw e;
      throw new FrameworkException(`No card with a '${action}' action for '${fullName}'`, { cause: e });
    }
  }

  /** Narrows the directory to the name and reports whether its card is shown. */
  async hasEmployeeNamed(fullName: string): Promise<boolean> {
    await this.searchByName(fullName);
    const found = await WaitUtils.pollQuietly(
      this.page,
      async () => (await this.cardAction(fullName, 'Edit')) !== null,
      10_000,
    );
    await this.clearNameSearch();
    return found;
  }

  async openEditFor(fullName: string): Promise<EditEmployeeDialog> {
    Log.step(`Opening Edit for '${fullName}'`);
    await this.searchByName(fullName);
    await ElementUtils.clickViaScript(await this.requireCardAction(fullName, 'Edit'));
    await MuiUtils.waitForDialog(this.page);
    await WaitUtils.waitForDataToSettle(this.page);
    return new EditEmployeeDialog(this.page);
  }

  /** Opens the employee's profile page. */
  async openProfileOf(fullName: string): Promise<EmployeeProfilePage> {
    Log.step(`Opening the profile of '${fullName}'`);
    await this.searchByName(fullName);
    await ElementUtils.clickViaScript(await this.requireCardAction(fullName, 'View Profile'));
    await WaitUtils.waitForUrlContains(this.page, '/profile/');
    await ElementUtils.waitForPageText(this.page, 'Employee Profile', 15_000);
    await WaitUtils.waitForDataToSettle(this.page);
    return new EmployeeProfilePage(this.page);
  }

  /**
   * Deletes the employee through their card's Delete action and its
   * "Remove this employee?" confirmation.
   *
   * Note what the app means by delete: the person loses login access and
   * leaves the directory, attendance, leave and payroll, but their history
   * and records are KEPT (undoable only via the vendor's support).
   *
   * @return the confirmation dialog's text, for the report
   */
  async deleteEmployee(fullName: string): Promise<string> {
    Log.step(`Deleting the employee '${fullName}'`);
    await this.searchByName(fullName);
    await ElementUtils.clickViaScript(await this.requireCardAction(fullName, 'Delete'));
    await MuiUtils.waitForDialog(this.page);
    const confirmation = await MuiUtils.dialogText(this.page);

    const dialog = await ElementUtils.find(this.page.locator(MuiUtils.DIALOG), WaitStrategy.VISIBLE);
    const buttons = dialog.locator('button');
    // The app captions it "Remove Employee"; the others are kept for wording
    // changes - never "Cancel". The last match wins: the action bar is last.
    const index = (await buttons.allInnerTexts())
      .map((t) => t.trim().toLowerCase())
      .reduce(
        (found, text, i) =>
          text.startsWith('remove') || text.includes('delete') || text === 'confirm' || text.startsWith('yes') ? i : found,
        -1,
      );
    if (index < 0) {
      throw new FrameworkException(`The delete confirmation has no confirm button. It read: ${confirmation}`);
    }
    await ElementUtils.clickViaScript(buttons.nth(index));
    if (!(await WaitUtils.waitForInvisibleQuietly(this.page.locator(MuiUtils.DIALOG), 15_000))) {
      throw new FrameworkException(`The delete confirmation did not close. It read: ${await MuiUtils.dialogText(this.page)}`);
    }
    await WaitUtils.waitForDataToSettle(this.page);
    await this.clearNameSearch();
    return confirmation;
  }

  /**
   * Removes the employee if a card for them exists. Cleanup only: safe to
   * call whether or not the record was ever created.
   *
   * @return true when a record was found and deleted
   */
  async deleteEmployeeIfPresent(fullName: string): Promise<boolean> {
    await MuiUtils.dismissOverlays(this.page);
    if (!(await this.hasEmployeeNamed(fullName))) {
      return false;
    }
    await this.deleteEmployee(fullName);
    const gone = !(await this.hasEmployeeNamed(fullName));
    Log.warn(gone ? `Cleaned up the employee '${fullName}'` : `Tried to delete '${fullName}' but the card is still listed`);
    return gone;
  }

  // ------------------------------------------------- subscription capacity

  /**
   * True when the tenant cannot take another employee.
   *
   * The plan caps headcount, and a shared test tenant reaches that ceiling
   * eventually. Without this check the symptom is indistinguishable from a
   * broken form: the dialog closes, nothing is created, and the test reports
   * "the employee is not listed".
   *
   * The banner appears BEFORE the cap too - "Approaching your subscription
   * plan's employee limit (9/10)" - so the used/limit figures decide. Only a
   * banner without figures is treated as the cap.
   */
  async isAtEmployeeLimit(): Promise<boolean> {
    if (!(await ElementUtils.isPresent(this.planLimitBanner))) {
      return false;
    }
    const usage = SEAT_USAGE.exec(await this.employeeLimitMessage());
    return usage ? Number(usage[1]) >= Number(usage[2]) : true;
  }

  /** The plan-limit message, or empty when the tenant still has capacity. */
  async employeeLimitMessage(): Promise<string> {
    return (await ElementUtils.isPresent(this.planLimitBanner))
      ? (await this.planLimitBanner.first().innerText()).trim()
      : '';
  }

  // -------------------------------------------------------------- search

  async searchByName(name: string): Promise<this> {
    Log.step(`Filtering the directory by name '${name}'`);
    await ElementUtils.type(this.nameSearch, name);
    // The list filters client-side on a debounce rather than a request.
    await this.page.waitForTimeout(900);
    return this;
  }

  async clearNameSearch(): Promise<this> {
    await ElementUtils.type(this.nameSearch, '');
    await this.page.waitForTimeout(900);
    return this;
  }

  async filterByDepartment(department: string): Promise<this> {
    Log.step(`Filtering the directory by department '${department}'`);
    await MuiUtils.selectOption(this.departmentFilter, department);
    await this.waitForSettled();
    return this;
  }

  /** Department options currently offered by the filter dropdown. */
  availableDepartmentFilterOptions(): Promise<string[]> {
    return MuiUtils.readOptions(this.departmentFilter);
  }

  // ------------------------------------------------------------- results

  /**
   * True when a card or row for this employee is on screen RIGHT NOW.
   * Only sees the department currently selected in the org-chart view - use
   * containsEmployeeIn() to ask whether the employee exists at all.
   */
  showsEmployee(nameOrEmail: string): Promise<boolean> {
    return ElementUtils.waitForPageText(this.page, nameOrEmail, 12_000);
  }

  /**
   * True when the employee appears under the given department.
   *
   * WHY THE DEPARTMENT IS REQUIRED
   * ------------------------------
   * The directory's default view is an org chart that renders ONE department
   * group at a time - HR is selected on load - and the name search narrows
   * within whatever group is showing. An employee created into Sales is
   * genuinely off-screen even though the record saved perfectly. So the
   * group is selected first, then the name is searched inside it - exactly
   * what a user would do.
   */
  async containsEmployeeIn(department: string, nameOrEmail: string): Promise<boolean> {
    await this.selectDepartmentGroup(department);
    await this.searchByName(nameOrEmail);
    const found = await ElementUtils.waitForPageText(this.page, nameOrEmail, 12_000);
    await this.clearNameSearch();
    return found;
  }

  /**
   * Switches the org chart to a department group via its chip. Does nothing
   * when the chip is absent - a tenant with a single department renders no
   * chips at all, and that is not an error.
   */
  async selectDepartmentGroup(department: string): Promise<this> {
    const escaped = MuiUtils.escapeForXPath(department);
    const chip = MuiUtils.xpath(
      this.page,
      `//button[normalize-space(.)=${escaped}] | //*[@role='button'][normalize-space(.)=${escaped}]`,
    );
    if (!(await ElementUtils.isPresent(chip))) {
      Log.warn(`No department group chip for '${department}' - the directory may not be grouped`);
      return this;
    }
    Log.step(`Switching the directory to the '${department}' group`);
    await ElementUtils.click(chip);
    await this.waitForSettled();
    return this;
  }

  showsEmployeeImmediately(nameOrEmail: string): Promise<boolean> {
    return ElementUtils.pageContainsText(this.page, nameOrEmail);
  }

  /** Department group headings rendered over the employee cards. */
  showsDepartmentGroup(department: string): Promise<boolean> {
    return this.displaysText(department);
  }

  /**
   * Row-level actions the current persona is offered.
   *
   * Presence, not visibility: the card actions are rendered for every row
   * but only revealed on hover, so a visibility check would report "HR
   * cannot edit employees" when the real answer is "the mouse is not over
   * the card". Whether the control exists at all is what the permission
   * model decides.
   */
  offersAction(actionLabel: string): Promise<boolean> {
    return ElementUtils.isPresent(MuiUtils.controlByAccessibleName(this.page, actionLabel));
  }

  /** True when the action is not merely present but actually on screen. */
  actionIsVisible(actionLabel: string): Promise<boolean> {
    return ElementUtils.isDisplayed(MuiUtils.controlByAccessibleName(this.page, actionLabel));
  }
}
