import { AppModule } from '../../enums/AppModule';
import { WaitStrategy } from '../../enums/WaitStrategy';
import { ElementUtils } from '../../utils/ElementUtils';
import { MuiUtils } from '../../utils/MuiUtils';
import { BasePage } from '../base/BasePage';
import { HeaderComponent } from '../components/HeaderComponent';

const xpath = MuiUtils.xpath;

/**
 * The landing page after sign-in, and the hub for inter-module verification.
 *
 * Its widgets are fed by every other module - workforce headcount from
 * Employees, pending approvals from Leave, the next holiday from the Holiday
 * Calendar - which makes it the natural place to prove that a change made in
 * one module actually propagated.
 */
export class DashboardPage extends BasePage {

    // --- KPI card labels ---
    static readonly KPI_TOTAL_WORKFORCE = 'Total Workforce';
    static readonly KPI_CURRENTLY_AWAY = 'Currently Away';
    static readonly KPI_PENDING_REQUESTS = 'Pending Requests';
    static readonly KPI_NEXT_HOLIDAY = 'Next Holiday';

    // --- widgets ---
    // Matched on the element's OWN text node, not its subtree. Using "." here
    // would also match every ancestor of the greeting, and reading the text of
    // one of those returns the whole dashboard.
    private static readonly GREETING = xpath("//*[starts-with(normalize-space(text()),'Welcome,')]");
    private static readonly PENDING_APPROVALS_WIDGET = xpath("//*[normalize-space(text())='Pending Approvals']");
    private static readonly CELEBRATIONS_WIDGET = xpath("//*[normalize-space(text())='Celebrations']");
    private static readonly UPCOMING_HOLIDAYS_WIDGET = xpath("//*[normalize-space(text())='Upcoming Holidays']");
    private static readonly ANNOUNCEMENTS_WIDGET = xpath("//*[normalize-space(text())='Company Announcements']");
    private static readonly DEPARTMENT_HEADCOUNT_WIDGET = xpath("//*[normalize-space(text())='Department Headcount']");
    private static readonly GLOBAL_TIME_OFF_WIDGET = xpath("//*[normalize-space(text())='Global Time Off']");
    private static readonly RECENT_ACTIVITY_WIDGET = xpath("//*[normalize-space(text())='Recent Activity']");
    private static readonly QUICK_ACTIONS_WIDGET = xpath("//*[normalize-space(text())='Quick Actions']");

    private readonly headerComponent = new HeaderComponent();

    landingMarker(): string {
        return AppModule.DASHBOARD.landingMarker();
    }

    route(): string {
        return AppModule.DASHBOARD.route();
    }

    header(): HeaderComponent {
        return this.headerComponent;
    }

    // ------------------------------------------------------------- greeting

    /** Full greeting line, e.g. "Welcome, Surag". */
    async greeting(): Promise<string> {
        if (!await ElementUtils.isPresent(DashboardPage.GREETING)) {
            return '';
        }
        // First line only - the greeting node sits directly above the KPI strip
        // and a rendering change could pull sibling text into the same block.
        return ((await ElementUtils.getText(DashboardPage.GREETING)).split(/\r?\n/)[0] ?? '').trim();
    }

    /** Just the name, so tests can assert which persona's session is live. */
    async signedInUserName(): Promise<string> {
        const greeting = await this.greeting();
        const comma = greeting.indexOf(',');
        return comma < 0 ? '' : greeting.substring(comma + 1).trim();
    }

    // ---------------------------------------------------------------- KPIs

    async totalWorkforce(): Promise<number> {
        return this.readSettledKpiCard(DashboardPage.KPI_TOTAL_WORKFORCE);
    }

    async currentlyAway(): Promise<number> {
        return this.readKpiCard(DashboardPage.KPI_CURRENTLY_AWAY);
    }

    async pendingRequests(): Promise<number> {
        return this.readKpiCard(DashboardPage.KPI_PENDING_REQUESTS);
    }

    /** Name of the next holiday as shown on the KPI strip. */
    async nextHolidayName(): Promise<string> {
        const value = xpath("//*[normalize-space(text())='Next Holiday']"
            + '/following::*[string-length(normalize-space(text()))>0][1]');
        return await ElementUtils.isPresent(value)
            ? (await (await ElementUtils.find(value, WaitStrategy.PRESENT)).innerText()).trim()
            : '';
    }

    // -------------------------------------------------------------- widgets

    async hasPendingApprovalsWidget(): Promise<boolean> {
        return ElementUtils.isDisplayed(DashboardPage.PENDING_APPROVALS_WIDGET);
    }

    async hasCelebrationsWidget(): Promise<boolean> {
        return ElementUtils.isDisplayed(DashboardPage.CELEBRATIONS_WIDGET);
    }

    async hasUpcomingHolidaysWidget(): Promise<boolean> {
        return ElementUtils.isDisplayed(DashboardPage.UPCOMING_HOLIDAYS_WIDGET);
    }

    async hasAnnouncementsWidget(): Promise<boolean> {
        return ElementUtils.isDisplayed(DashboardPage.ANNOUNCEMENTS_WIDGET);
    }

    async hasDepartmentHeadcountWidget(): Promise<boolean> {
        return ElementUtils.isDisplayed(DashboardPage.DEPARTMENT_HEADCOUNT_WIDGET);
    }

    async hasGlobalTimeOffWidget(): Promise<boolean> {
        return ElementUtils.isDisplayed(DashboardPage.GLOBAL_TIME_OFF_WIDGET);
    }

    async hasRecentActivityWidget(): Promise<boolean> {
        return ElementUtils.isDisplayed(DashboardPage.RECENT_ACTIVITY_WIDGET);
    }

    async hasQuickActionsWidget(): Promise<boolean> {
        return ElementUtils.isDisplayed(DashboardPage.QUICK_ACTIONS_WIDGET);
    }

    /** Every analytics widget the dashboard is expected to render. */
    async allCoreWidgetsRendered(): Promise<boolean> {
        return await this.hasPendingApprovalsWidget()
            && await this.hasUpcomingHolidaysWidget()
            && await this.hasDepartmentHeadcountWidget()
            && await this.hasGlobalTimeOffWidget()
            && await this.hasQuickActionsWidget();
    }

    /**
     * True when the Department Headcount chart plots the named department.
     * Used to prove a department created in another module reached the
     * dashboard's analytics.
     */
    async departmentHeadcountIncludes(departmentName: string): Promise<boolean> {
        return this.displaysText(departmentName);
    }

    /** True when the named employee has a card in Pending Approvals. */
    async pendingApprovalsInclude(employeeName: string): Promise<boolean> {
        const card = xpath("//*[normalize-space(text())='Pending Approvals']"
            + `/ancestor::div[3]//*[contains(normalize-space(.),${MuiUtils.escapeForXPath(employeeName)})]`);
        return ElementUtils.isPresent(card);
    }

    // -------------------------------------------------------- quick actions

    async clickQuickAction(label: string): Promise<void> {
        await ElementUtils.click(xpath(`//*[normalize-space(text())=${MuiUtils.escapeForXPath(label)}]`));
        await this.waitForSettled();
    }
}
