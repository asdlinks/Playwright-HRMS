import type { Locator } from '@playwright/test';
import { AppModule } from '../../enums/AppModule';
import { IllegalStateError, NoSuchElementError, WaitTimeoutError } from '../../exceptions/errors';
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
 * assert on anywhere in this app, so every mutation is verified against
 * resulting state.
 */
export class DepartmentPage extends BasePage {

    static readonly KPI_DEPARTMENTS = 'Departments';
    static readonly KPI_TOTAL_EMPLOYEES = 'Total Employees';
    static readonly KPI_LARGEST_TEAM = 'Largest Team';

    /** Business rule surfaced in the delete confirmation dialog. */
    static readonly EMPTY_ONLY_DELETE_RULE = 'Only empty departments can be deleted';

    private static readonly NEW_DEPARTMENT_BUTTON = MuiUtils.buttonByText('New Department');
    private static readonly DIALOG_NAME_INPUT = ".MuiDialog-root input[type='text']";

    private static readonly CREATE_BUTTON = 'Create Team';
    private static readonly CANCEL_BUTTON = 'Cancel';
    private static readonly DELETE_BUTTON = 'Delete';

    landingMarker(): string {
        return AppModule.DEPARTMENT.landingMarker();
    }

    route(): string {
        return AppModule.DEPARTMENT.route();
    }

    // ----------------------------------------------------------------- KPIs

    async departmentCount(): Promise<number> {
        return this.readSettledKpiCard(DepartmentPage.KPI_DEPARTMENTS);
    }

    async totalEmployees(): Promise<number> {
        return this.readSettledKpiCard(DepartmentPage.KPI_TOTAL_EMPLOYEES);
    }

    async canCreateDepartment(): Promise<boolean> {
        return ElementUtils.isDisplayed(DepartmentPage.NEW_DEPARTMENT_BUTTON);
    }

    // ------------------------------------------------------------- creating

    async openCreateDialog(): Promise<this> {
        Log.step('Opening the Create New Department dialog');
        await MuiUtils.openDialogFrom(DepartmentPage.NEW_DEPARTMENT_BUTTON);
        return this;
    }

    async createDialogTitle(): Promise<string> {
        return ElementUtils.getText(MuiUtils.DIALOG_TITLE);
    }

    async enterDepartmentName(name: string): Promise<this> {
        await ElementUtils.type(DepartmentPage.DIALOG_NAME_INPUT, name);
        return this;
    }

    async submitCreateDialog(): Promise<this> {
        if (!await MuiUtils.clickDialogButtonAndWaitForClose(DepartmentPage.CREATE_BUTTON)) {
            throw new IllegalStateError(
                'The Create New Department dialog stayed open after submitting. '
                + 'Validation messages on screen: ' + await MuiUtils.dialogText());
        }
        await WaitUtils.waitForDataToSettle();
        return this;
    }

    /** Full create flow: open, name, save, wait for the row to appear. */
    async createDepartment(name: string): Promise<this> {
        Log.step(`Creating department '${name}'`);
        await this.openCreateDialog();
        await this.enterDepartmentName(name);
        await this.submitCreateDialog();
        return this;
    }

    async cancelCreateDialog(): Promise<this> {
        await MuiUtils.clickDialogButtonAndWaitForClose(DepartmentPage.CANCEL_BUTTON);
        return this;
    }

    // -------------------------------------------------------------- reading

    async hasDepartment(name: string): Promise<boolean> {
        return ElementUtils.waitForPageText(name, 12000);
    }

    async hasDepartmentImmediately(name: string): Promise<boolean> {
        return ElementUtils.pageContainsText(name);
    }

    /** Waits for a department to disappear after deletion. */
    async departmentRemoved(name: string): Promise<boolean> {
        try {
            await WaitUtils.fluently(async () => !await ElementUtils.pageContainsText(name),
                15000, `Department '${name}' was still listed`);
            return true;
        } catch (e) {
            if (e instanceof WaitTimeoutError) {
                return false;
            }
            throw e;
        }
    }

    /**
     * Headcount chip shown beside a department in the left-hand list.
     *
     * Walks up from the department name looking for a sibling leaf that is
     * purely a number. Matching "the first number in the row text" would be
     * wrong here - generated department names contain digits themselves, so
     * the count has to be identified structurally rather than by scraping.
     *
     * @return the headcount, or -1 when the department is not listed
     */
    async headcountFor(departmentName: string): Promise<number> {
        const result = await this.page().evaluate(name => {
            const leaf = [...document.querySelectorAll('main div,main span,main p,main h6')]
                .find(e => e.children.length === 0 && (e.textContent || '').trim() === name);
            if (!leaf) return null;
            let node: Element | null = leaf;
            for (let hop = 0; hop < 5 && node; hop++) {
                node = node.parentElement;
                if (!node) break;
                const numeric = [...node.querySelectorAll('*')].filter(
                    e => e.children.length === 0 && /^\d+$/.test((e.textContent || '').trim()));
                if (numeric.length) return (numeric[0].textContent || '').trim();
            }
            return null;
        }, departmentName);
        return result === null ? -1 : Number.parseInt(result, 10);
    }

    // ------------------------------------------------------------- deleting

    /**
     * Opens the delete confirmation for a department.
     *
     * The trash control is an unlabelled icon button inside the department's
     * row, so it is reached by scoping to the row that carries the name.
     */
    async clickDeleteFor(departmentName: string): Promise<this> {
        Log.step(`Requesting deletion of department '${departmentName}'`);
        await MuiUtils.openDialogFrom(await this.resolveDeleteButton(departmentName));
        return this;
    }

    /**
     * Finds the trash control on a department's row.
     *
     * The rows are unlabelled divs, not list items, and the delete control is
     * an icon button with no accessible name - so it is resolved structurally:
     * from the department's own text node, walk up to the nearest ancestor
     * that owns buttons and take the last one. An XPath such as
     * ancestor::div[.//button][1] is unsafe here because the first matching
     * ancestor can be the whole page section, whose first button is
     * "New Department" - clicking that would open the wrong dialog and the
     * test would fail somewhere confusing.
     */
    private async resolveDeleteButton(departmentName: string): Promise<Locator> {
        const element = await ElementUtils.locateByScript(name => {
            const leaf = [...document.querySelectorAll('main div,main span,main p,main h6')]
                .find(e => e.children.length === 0 && (e.textContent || '').trim() === name);
            if (!leaf) return null;
            let node: Element | null = leaf;
            for (let hop = 0; hop < 5 && node; hop++) {
                node = node.parentElement;
                if (!node) break;
                const buttons = [...node.querySelectorAll('button')];
                if (buttons.length) return buttons[buttons.length - 1];
            }
            return null;
        }, departmentName);

        if (!element) {
            throw new NoSuchElementError(
                `No delete control found for the department '${departmentName}' - it may not be listed on this page`);
        }
        return element;
    }

    async deleteConfirmationText(): Promise<string> {
        return MuiUtils.dialogText();
    }

    async confirmDelete(): Promise<this> {
        await MuiUtils.clickDialogButtonAndWaitForClose(DepartmentPage.DELETE_BUTTON);
        await WaitUtils.waitForDataToSettle();
        return this;
    }

    async cancelDelete(): Promise<this> {
        await MuiUtils.clickDialogButtonAndWaitForClose(DepartmentPage.CANCEL_BUTTON);
        return this;
    }

    /** Full delete flow, used both by tests and by cleanup. */
    async deleteDepartment(name: string): Promise<this> {
        await this.clickDeleteFor(name);
        await this.confirmDelete();
        return this;
    }

    /**
     * Best-effort cleanup for teardown.
     *
     * Never throws: a cleanup failure must not mask the real assertion failure
     * that a test already reported.
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
