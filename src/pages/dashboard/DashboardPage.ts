import { AppModule } from '../../enums/AppModule';
import { ElementUtils } from '../../utils/ElementUtils';
import { MuiUtils } from '../../utils/MuiUtils';
import { BasePage } from '../base/BasePage';

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
  // Matched on the element's OWN text node, not its subtree. Matching "."
  // would also match every ancestor of the greeting, and the text of one of
  // those is the whole dashboard.
  private readonly greetingText = MuiUtils.xpath(this.page, "//*[starts-with(normalize-space(text()),'Welcome,')]");
  private readonly pendingApprovalsWidget = this.ownText('Pending Approvals');
  private readonly celebrationsWidget = this.ownText('Celebrations');
  private readonly upcomingHolidaysWidget = this.ownText('Upcoming Holidays');
  private readonly announcementsWidget = this.ownText('Company Announcements');
  private readonly departmentHeadcountWidget = this.ownText('Department Headcount');
  private readonly globalTimeOffWidget = this.ownText('Global Time Off');
  private readonly recentActivityWidget = this.ownText('Recent Activity');
  private readonly quickActionsWidget = this.ownText('Quick Actions');

  private ownText(text: string) {
    return MuiUtils.xpath(this.page, `//*[normalize-space(text())=${MuiUtils.escapeForXPath(text)}]`);
  }

  landingMarker(): string {
    return AppModule.DASHBOARD.landingMarker;
  }

  route(): string {
    return AppModule.DASHBOARD.route;
  }

  // ------------------------------------------------------------- greeting

  /** Full greeting line, e.g. "Welcome, Surag". */
  async greeting(): Promise<string> {
    if (!(await ElementUtils.isPresent(this.greetingText))) {
      return '';
    }
    // First line only - the greeting node sits directly above the KPI strip
    // and a rendering change could pull sibling text into the same block.
    return (await ElementUtils.getText(this.greetingText)).split('\n')[0].trim();
  }

  /** Just the name, so tests can check which persona's session is live. */
  async signedInUserName(): Promise<string> {
    const greeting = await this.greeting();
    const comma = greeting.indexOf(',');
    return comma < 0 ? '' : greeting.substring(comma + 1).trim();
  }

  // ---------------------------------------------------------------- KPIs

  totalWorkforce(): Promise<number> {
    return this.readSettledKpiCard(DashboardPage.KPI_TOTAL_WORKFORCE);
  }

  currentlyAway(): Promise<number> {
    return this.readKpiCard(DashboardPage.KPI_CURRENTLY_AWAY);
  }

  pendingRequests(): Promise<number> {
    return this.readKpiCard(DashboardPage.KPI_PENDING_REQUESTS);
  }

  /** Name of the next holiday as shown on the KPI strip. */
  async nextHolidayName(): Promise<string> {
    const value = MuiUtils.xpath(
      this.page,
      "//*[normalize-space(text())='Next Holiday']/following::*[string-length(normalize-space(text()))>0][1]",
    );
    return (await ElementUtils.isPresent(value)) ? (await value.first().innerText()).trim() : '';
  }

  // -------------------------------------------------------------- widgets

  hasPendingApprovalsWidget(): Promise<boolean> {
    return ElementUtils.isDisplayed(this.pendingApprovalsWidget);
  }

  hasCelebrationsWidget(): Promise<boolean> {
    return ElementUtils.isDisplayed(this.celebrationsWidget);
  }

  hasUpcomingHolidaysWidget(): Promise<boolean> {
    return ElementUtils.isDisplayed(this.upcomingHolidaysWidget);
  }

  hasAnnouncementsWidget(): Promise<boolean> {
    return ElementUtils.isDisplayed(this.announcementsWidget);
  }

  hasDepartmentHeadcountWidget(): Promise<boolean> {
    return ElementUtils.isDisplayed(this.departmentHeadcountWidget);
  }

  hasGlobalTimeOffWidget(): Promise<boolean> {
    return ElementUtils.isDisplayed(this.globalTimeOffWidget);
  }

  hasRecentActivityWidget(): Promise<boolean> {
    return ElementUtils.isDisplayed(this.recentActivityWidget);
  }

  hasQuickActionsWidget(): Promise<boolean> {
    return ElementUtils.isDisplayed(this.quickActionsWidget);
  }

  /** Every analytics widget the dashboard is expected to render. */
  async allCoreWidgetsRendered(): Promise<boolean> {
    return (
      (await this.hasPendingApprovalsWidget()) &&
      (await this.hasUpcomingHolidaysWidget()) &&
      (await this.hasDepartmentHeadcountWidget()) &&
      (await this.hasGlobalTimeOffWidget()) &&
      (await this.hasQuickActionsWidget())
    );
  }

  /**
   * True when the Department Headcount chart plots the named department -
   * proof that a department created in another module reached the
   * dashboard's analytics.
   */
  departmentHeadcountIncludes(departmentName: string): Promise<boolean> {
    return this.displaysText(departmentName);
  }

  /** True when the named employee has a card in Pending Approvals. */
  pendingApprovalsInclude(employeeName: string): Promise<boolean> {
    return ElementUtils.isPresent(
      MuiUtils.xpath(
        this.page,
        "//*[normalize-space(text())='Pending Approvals']/ancestor::div[3]" +
          `//*[contains(normalize-space(.),${MuiUtils.escapeForXPath(employeeName)})]`,
      ),
    );
  }
}
