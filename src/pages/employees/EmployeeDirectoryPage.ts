import { AppModule } from '../../enums/AppModule';
import { WaitStrategy } from '../../enums/WaitStrategy';
import { ElementUtils } from '../../utils/ElementUtils';
import { Log } from '../../utils/Log';
import { MuiUtils } from '../../utils/MuiUtils';
import { WaitUtils } from '../../utils/WaitUtils';
import { BasePage } from '../base/BasePage';
import { SideNavComponent } from '../components/SideNavComponent';
import { RegisterEmployeeDialog } from './RegisterEmployeeDialog';

const xpath = MuiUtils.xpath;

/** Employee Directory - the org-wide people list with KPI strip and filters. */
export class EmployeeDirectoryPage extends BasePage {

    static readonly KPI_TOTAL_EMPLOYEES = 'Total Employees';
    static readonly KPI_DEPARTMENTS = 'Departments';
    static readonly KPI_MANAGERS = 'Managers';
    static readonly KPI_NEW_JOINERS = 'New Joiners (This Month)';

    private static readonly ADD_EMPLOYEE_BUTTON = MuiUtils.buttonByText('Add New Employee');
    private static readonly EXPORT_BUTTON = MuiUtils.buttonByText('Export');
    private static readonly NAME_SEARCH = "input[placeholder*='Search by name']";

    private static readonly DEPARTMENT_FILTER = MuiUtils.selectByLabel('Department');
    private static readonly BRANCH_FILTER = MuiUtils.selectByLabel('Branch');
    private static readonly DESIGNATION_FILTER = MuiUtils.selectByLabel('Designation');
    private static readonly EMPLOYMENT_TYPE_FILTER = MuiUtils.selectByLabel('Employment Type');
    private static readonly ROLE_FILTER = MuiUtils.selectByLabel('Role');

    /**
     * Banner the app shows when the tenant's plan seat limit is reached.
     * Matched on the element's own text node so it resolves to the message
     * itself rather than every ancestor, whatever component renders it.
     */
    private static readonly PLAN_LIMIT_BANNER = xpath("//*[contains(text(),'employee limit')]");

    private readonly sideNavComponent = new SideNavComponent();

    landingMarker(): string {
        return AppModule.EMPLOYEE_DIRECTORY.landingMarker();
    }

    route(): string {
        return AppModule.EMPLOYEE_DIRECTORY.route();
    }

    sideNav(): SideNavComponent {
        return this.sideNavComponent;
    }

    // ------------------------------------------------------------- KPI strip

    async totalEmployees(): Promise<number> {
        return this.readSettledKpiCard(EmployeeDirectoryPage.KPI_TOTAL_EMPLOYEES);
    }

    async departmentCount(): Promise<number> {
        return this.readSettledKpiCard(EmployeeDirectoryPage.KPI_DEPARTMENTS);
    }

    async managerCount(): Promise<number> {
        return this.readKpiCard(EmployeeDirectoryPage.KPI_MANAGERS);
    }

    async newJoinersThisMonth(): Promise<number> {
        return this.readKpiCard(EmployeeDirectoryPage.KPI_NEW_JOINERS);
    }

    // ------------------------------------------------------------- controls

    async canAddEmployee(): Promise<boolean> {
        return ElementUtils.isDisplayed(EmployeeDirectoryPage.ADD_EMPLOYEE_BUTTON);
    }

    async canExport(): Promise<boolean> {
        return ElementUtils.isDisplayed(EmployeeDirectoryPage.EXPORT_BUTTON);
    }

    async allFiltersDisplayed(): Promise<boolean> {
        return await ElementUtils.isDisplayed(EmployeeDirectoryPage.DEPARTMENT_FILTER)
            && await ElementUtils.isDisplayed(EmployeeDirectoryPage.BRANCH_FILTER)
            && await ElementUtils.isDisplayed(EmployeeDirectoryPage.DESIGNATION_FILTER)
            && await ElementUtils.isDisplayed(EmployeeDirectoryPage.EMPLOYMENT_TYPE_FILTER)
            && await ElementUtils.isDisplayed(EmployeeDirectoryPage.ROLE_FILTER);
    }

    async openRegisterEmployeeDialog(): Promise<RegisterEmployeeDialog> {
        Log.step('Opening the Register New Employee dialog');
        await MuiUtils.openDialogFrom(EmployeeDirectoryPage.ADD_EMPLOYEE_BUTTON);
        return new RegisterEmployeeDialog();
    }

    // ------------------------------------------------- subscription capacity

    /**
     * True when the tenant cannot take another employee.
     *
     * The plan caps headcount, and on a shared test tenant that ceiling gets
     * reached eventually - every creation test consumes a seat and the app
     * offers no bulk cleanup. Without this check the symptom is
     * indistinguishable from a broken form: the dialog closes, nothing is
     * created, and the test reports "the employee is not listed". Detecting
     * the cap lets the suite say what is actually wrong.
     */
    async isAtEmployeeLimit(): Promise<boolean> {
        return ElementUtils.isPresent(EmployeeDirectoryPage.PLAN_LIMIT_BANNER);
    }

    /** The plan-limit message, or empty when the tenant still has capacity. */
    async employeeLimitMessage(): Promise<string> {
        return await this.isAtEmployeeLimit()
            ? (await (await ElementUtils.find(EmployeeDirectoryPage.PLAN_LIMIT_BANNER, WaitStrategy.PRESENT))
                .innerText()).trim()
            : '';
    }

    // -------------------------------------------------------------- search

    async searchByName(name: string): Promise<this> {
        Log.step(`Filtering the directory by name '${name}'`);
        await ElementUtils.type(EmployeeDirectoryPage.NAME_SEARCH, name);
        // The list filters client-side on a debounce rather than a request.
        await WaitUtils.sleepQuietly(900);
        return this;
    }

    async clearNameSearch(): Promise<this> {
        await ElementUtils.type(EmployeeDirectoryPage.NAME_SEARCH, '');
        await WaitUtils.sleepQuietly(900);
        return this;
    }

    async filterByDepartment(department: string): Promise<this> {
        Log.step(`Filtering the directory by department '${department}'`);
        await MuiUtils.selectOption(EmployeeDirectoryPage.DEPARTMENT_FILTER, department);
        await this.waitForSettled();
        return this;
    }

    /** Department options currently offered by the filter dropdown. */
    async availableDepartmentFilterOptions(): Promise<string[]> {
        return MuiUtils.readOptions(EmployeeDirectoryPage.DEPARTMENT_FILTER);
    }

    // ------------------------------------------------------------- results

    /**
     * True when a card or row for this employee is on screen RIGHT NOW.
     *
     * Note this only sees the department currently selected in the org-chart
     * view - use containsEmployeeIn() to ask whether the employee exists in
     * the directory at all.
     */
    async showsEmployee(nameOrEmail: string): Promise<boolean> {
        return ElementUtils.waitForPageText(nameOrEmail, 12000);
    }

    /**
     * True when the employee appears under the given department.
     *
     * WHY THE DEPARTMENT IS REQUIRED
     * ------------------------------
     * The directory's default view is an org chart that renders ONE department
     * group at a time - HR is selected on load - and the name search narrows
     * within whatever group is showing. An employee created into Sales is
     * therefore genuinely off-screen even though the record saved perfectly,
     * which reads as "the employee was never created" and sends you hunting
     * for a bug that does not exist.
     *
     * So the group is selected first, then the name is searched inside it.
     * That is also exactly what a user would do.
     */
    async containsEmployeeIn(department: string, nameOrEmail: string): Promise<boolean> {
        await this.selectDepartmentGroup(department);
        await this.searchByName(nameOrEmail);
        const found = await ElementUtils.waitForPageText(nameOrEmail, 12000);
        await this.clearNameSearch();
        return found;
    }

    /**
     * Switches the org chart to a department group via its chip.
     *
     * Does nothing when the chip is absent - a tenant with a single department
     * renders no chips at all, and that is not an error.
     */
    async selectDepartmentGroup(department: string): Promise<this> {
        const escaped = MuiUtils.escapeForXPath(department);
        const chip = xpath(`//button[normalize-space(.)=${escaped}] | //*[@role='button'][normalize-space(.)=${escaped}]`);
        if (!await ElementUtils.isPresent(chip)) {
            Log.warn(`No department group chip for '${department}' - the directory may not be grouped`);
            return this;
        }
        Log.step(`Switching the directory to the '${department}' group`);
        await ElementUtils.click(chip);
        await this.waitForSettled();
        return this;
    }

    async showsEmployeeImmediately(nameOrEmail: string): Promise<boolean> {
        return ElementUtils.pageContainsText(nameOrEmail);
    }

    /** Department group headings rendered over the employee cards. */
    async showsDepartmentGroup(department: string): Promise<boolean> {
        return this.displaysText(department);
    }

    /**
     * Row-level actions the current persona is offered.
     *
     * Presence, not visibility: the card actions are rendered for every row
     * but only revealed on hover, so a visibility check would report "HR
     * cannot edit employees" when the real answer is "the mouse is not over
     * the card". Whether the control exists in the row at all is what the
     * permission model decides, and what this is asking.
     */
    async offersAction(actionLabel: string): Promise<boolean> {
        return ElementUtils.isPresent(MuiUtils.controlByAccessibleName(actionLabel));
    }

    /** True when the action is not merely present but actually on screen. */
    async actionIsVisible(actionLabel: string): Promise<boolean> {
        return ElementUtils.isDisplayed(MuiUtils.controlByAccessibleName(actionLabel));
    }
}
