import type { Locator } from '@playwright/test';
import { AppModule } from '../../enums/AppModule';
import { FrameworkException } from '../../exceptions/FrameworkException';
import { ElementUtils } from '../../utils/ElementUtils';
import { Log } from '../../utils/Log';
import { MuiUtils } from '../../utils/MuiUtils';
import { WaitUtils } from '../../utils/WaitUtils';
import { BasePage } from '../base/BasePage';

/**
 * Department Management.
 *
 * Worth knowing when reading the tests: the app enforces "only empty
 * departments can be deleted", and it reports success by refreshing the list
 * and the KPI strip rather than by raising a toast. There is no snackbar to
 * check anywhere in this app, so every mutation is verified against the
 * resulting state.
 */
export class DepartmentPage extends BasePage {
  static readonly KPI_DEPARTMENTS = 'Departments';
  static readonly KPI_TOTAL_EMPLOYEES = 'Total Employees';
  static readonly KPI_LARGEST_TEAM = 'Largest Team';

  /** Business rule surfaced in the delete confirmation dialog. */
  static readonly EMPTY_ONLY_DELETE_RULE = 'Only empty departments can be deleted';

  private static readonly CREATE_BUTTON = 'Create Team';
  private static readonly CANCEL_BUTTON = 'Cancel';
  private static readonly DELETE_BUTTON = 'Delete';

  private readonly newDepartmentButton = MuiUtils.buttonByText(this.page, 'New Department');
  private readonly dialogNameInput = this.page.locator(".MuiDialog-root input[type='text']");

  landingMarker(): string {
    return AppModule.DEPARTMENT.landingMarker;
  }

  route(): string {
    return AppModule.DEPARTMENT.route;
  }

  // ----------------------------------------------------------------- KPIs

  departmentCount(): Promise<number> {
    return this.readSettledKpiCard(DepartmentPage.KPI_DEPARTMENTS);
  }

  totalEmployees(): Promise<number> {
    return this.readSettledKpiCard(DepartmentPage.KPI_TOTAL_EMPLOYEES);
  }

  canCreateDepartment(): Promise<boolean> {
    return ElementUtils.isDisplayed(this.newDepartmentButton);
  }

  // ------------------------------------------------------------- creating

  async openCreateDialog(): Promise<this> {
    Log.step('Opening the Create New Department dialog');
    await MuiUtils.openDialogFrom(this.newDepartmentButton);
    return this;
  }

  createDialogTitle(): Promise<string> {
    return ElementUtils.getText(this.page.locator(MuiUtils.DIALOG_TITLE));
  }

  async enterDepartmentName(name: string): Promise<this> {
    await ElementUtils.type(this.dialogNameInput, name);
    return this;
  }

  async submitCreateDialog(): Promise<this> {
    if (!(await MuiUtils.clickDialogButtonAndWaitForClose(this.page, DepartmentPage.CREATE_BUTTON))) {
      throw new FrameworkException(
        'The Create New Department dialog stayed open after submitting. ' +
          `Validation messages on screen: ${await MuiUtils.dialogText(this.page)}`,
      );
    }
    await WaitUtils.waitForDataToSettle(this.page);
    return this;
  }

  /**
   * Submits the create dialog without failing when the app refuses it.
   *
   * @return true when the dialog closed (accepted), false when it stayed open (rejected)
   */
  async submitCreateDialogQuietly(): Promise<boolean> {
    const closed = await MuiUtils.clickDialogButtonAndWaitForClose(this.page, DepartmentPage.CREATE_BUTTON);
    await WaitUtils.waitForDataToSettle(this.page);
    return closed;
  }

  createDialogText(): Promise<string> {
    return MuiUtils.dialogText(this.page);
  }

  /** Full create flow: open, name, save. */
  async createDepartment(name: string): Promise<this> {
    Log.step(`Creating department '${name}'`);
    await this.openCreateDialog();
    await this.enterDepartmentName(name);
    return this.submitCreateDialog();
  }

  async cancelCreateDialog(): Promise<this> {
    await MuiUtils.clickDialogButtonAndWaitForClose(this.page, DepartmentPage.CANCEL_BUTTON);
    return this;
  }

  // -------------------------------------------------------------- reading

  hasDepartment(name: string): Promise<boolean> {
    return ElementUtils.waitForPageText(this.page, name, 12_000);
  }

  hasDepartmentImmediately(name: string): Promise<boolean> {
    return ElementUtils.pageContainsText(this.page, name);
  }

  /** Waits for a department to disappear after deletion. */
  departmentRemoved(name: string): Promise<boolean> {
    return WaitUtils.pollQuietly(this.page, async () => !(await ElementUtils.pageContainsText(this.page, name)), 15_000);
  }

  /**
   * Headcount chip shown beside a department in the left-hand list.
   *
   * Walks up from the department name looking for a sibling leaf that is
   * purely a number. "The first number in the row text" would be wrong here -
   * generated department names contain digits themselves.
   *
   * @return the headcount, or -1 when the department is not listed
   */
  async headcountFor(departmentName: string): Promise<number> {
    const result = await this.page.evaluate((name) => {
      const leaf = [...document.querySelectorAll('main div,main span,main p,main h6')].find(
        (e) => e.children.length === 0 && (e.textContent || '').trim() === name,
      );
      if (!leaf) return null;
      let node: Element | null = leaf;
      for (let hop = 0; hop < 5 && node; hop++) {
        node = node.parentElement;
        if (!node) break;
        const numeric = [...node.querySelectorAll('*')].filter(
          (e) => e.children.length === 0 && /^\d+$/.test((e.textContent || '').trim()),
        );
        if (numeric.length) return (numeric[0].textContent || '').trim();
      }
      return null;
    }, departmentName);
    return result === null ? -1 : Number.parseInt(result, 10);
  }

  // ------------------------------------------------------------- deleting

  /**
   * Opens the delete confirmation for a department. The trash control is an
   * unlabelled icon button inside the department's row.
   */
  async clickDeleteFor(departmentName: string): Promise<this> {
    Log.step(`Requesting deletion of department '${departmentName}'`);
    await MuiUtils.openDialogFrom(await this.resolveDeleteButton(departmentName));
    return this;
  }

  /**
   * Finds the trash control on a department's row.
   *
   * The rows are unlabelled divs and the delete control has no accessible
   * name, so it is resolved structurally: from the department's own text
   * node, walk up to the nearest ancestor that owns buttons and take the last
   * one. An XPath such as `ancestor::div[.//button][1]` is unsafe here - the
   * first matching ancestor can be the whole section, whose first button is
   * "New Department", which would open the wrong dialog.
   */
  private async resolveDeleteButton(departmentName: string): Promise<Locator> {
    const button = await ElementUtils.locateByScript(
      this.page,
      ([name]) => {
        const leaf = [...document.querySelectorAll('main div,main span,main p,main h6')].find(
          (e) => e.children.length === 0 && (e.textContent || '').trim() === name,
        );
        if (!leaf) return null;
        let node: Element | null = leaf;
        for (let hop = 0; hop < 5 && node; hop++) {
          node = node.parentElement;
          if (!node) break;
          const buttons = [...node.querySelectorAll('button')];
          if (buttons.length) return buttons[buttons.length - 1];
        }
        return null;
      },
      [departmentName],
    );
    if (!button) {
      throw new FrameworkException(
        `No delete control found for the department '${departmentName}' - it may not be listed on this page`,
      );
    }
    return button;
  }

  deleteConfirmationText(): Promise<string> {
    return MuiUtils.dialogText(this.page);
  }

  async confirmDelete(): Promise<this> {
    await MuiUtils.clickDialogButtonAndWaitForClose(this.page, DepartmentPage.DELETE_BUTTON);
    await WaitUtils.waitForDataToSettle(this.page);
    return this;
  }

  async cancelDelete(): Promise<this> {
    await MuiUtils.clickDialogButtonAndWaitForClose(this.page, DepartmentPage.CANCEL_BUTTON);
    return this;
  }

  /** Full delete flow, used both by tests and by cleanup. */
  async deleteDepartment(name: string): Promise<this> {
    await this.clickDeleteFor(name);
    return this.confirmDelete();
  }

  /**
   * Best-effort cleanup for teardown. Never throws: a cleanup failure must
   * not mask the real failure that a test already reported.
   */
  async deleteIfPresent(name: string): Promise<void> {
    try {
      await this.open();
      if (await this.hasDepartmentImmediately(name)) {
        await this.deleteDepartment(name);
        Log.info(`Cleaned up department '${name}'`);
      }
    } catch (e) {
      Log.warn(`Could not clean up department '${name}': ${(e as Error).message}`);
    }
  }
}
