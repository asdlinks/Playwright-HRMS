import { AppModule } from '../../enums/AppModule';
import { ElementUtils } from '../../utils/ElementUtils';
import { Log } from '../../utils/Log';
import { MuiUtils } from '../../utils/MuiUtils';
import { BasePage } from '../base/BasePage';

/**
 * Company Documents - a MUI DataGrid of published documents with Active and
 * Archived tabs, plus the upload dialog.
 *
 * Both personas can read and upload here, which makes it a useful control in
 * the RBAC suite: it proves the suite distinguishes "HR is restricted" from
 * "HR is restricted everywhere".
 */
export class CompanyDocumentsPage extends BasePage {

    private static readonly UPLOAD_BUTTON = MuiUtils.buttonByText('Upload Document');
    private static readonly ACTIVE_TAB = MuiUtils.buttonByText('Active');
    private static readonly ARCHIVED_TAB = MuiUtils.buttonByText('Archived');
    private static readonly CATEGORY_FILTER = MuiUtils.selectByLabel('Category');
    private static readonly GRID_SEARCH = "input[placeholder*='Search']";

    private static readonly EXPECTED_COLUMNS = [
        'Title', 'Category', 'Version', 'Effective Date',
        'Expiry Date', 'Uploaded By', 'Size'];

    landingMarker(): string {
        return AppModule.COMPANY_DOCUMENTS.landingMarker();
    }

    route(): string {
        return AppModule.COMPANY_DOCUMENTS.route();
    }

    // -------------------------------------------------------------- reading

    async canUpload(): Promise<boolean> {
        return ElementUtils.isDisplayed(CompanyDocumentsPage.UPLOAD_BUTTON);
    }

    async hasActiveAndArchivedTabs(): Promise<boolean> {
        return await ElementUtils.isDisplayed(CompanyDocumentsPage.ACTIVE_TAB)
            && await ElementUtils.isDisplayed(CompanyDocumentsPage.ARCHIVED_TAB);
    }

    async hasCategoryFilter(): Promise<boolean> {
        return ElementUtils.isDisplayed(CompanyDocumentsPage.CATEGORY_FILTER);
    }

    async isGridDisplayed(): Promise<boolean> {
        return ElementUtils.isDisplayed(MuiUtils.DATA_GRID);
    }

    /** True when every expected column header is rendered. */
    async hasAllExpectedColumns(): Promise<boolean> {
        const content = await this.contentText();
        return CompanyDocumentsPage.EXPECTED_COLUMNS.every(column => content.includes(column));
    }

    expectedColumns(): string[] {
        return [...CompanyDocumentsPage.EXPECTED_COLUMNS];
    }

    async missingColumns(): Promise<string[]> {
        const content = await this.contentText();
        return CompanyDocumentsPage.EXPECTED_COLUMNS.filter(column => !content.includes(column));
    }

    async documentCount(): Promise<number> {
        await MuiUtils.waitForGrid();
        return MuiUtils.gridTotalFromPagination();
    }

    async hasDocument(title: string): Promise<boolean> {
        return MuiUtils.gridHasRowContaining(title);
    }

    // -------------------------------------------------------------- actions

    async openArchivedTab(): Promise<this> {
        Log.step('Switching to the Archived documents tab');
        await ElementUtils.click(CompanyDocumentsPage.ARCHIVED_TAB);
        await this.waitForSettled();
        return this;
    }

    async openActiveTab(): Promise<this> {
        await ElementUtils.click(CompanyDocumentsPage.ACTIVE_TAB);
        await this.waitForSettled();
        return this;
    }

    async searchDocuments(query: string): Promise<this> {
        await ElementUtils.type(CompanyDocumentsPage.GRID_SEARCH, query);
        await this.waitForSettled();
        return this;
    }

    /** Opens the upload dialog without submitting - upload needs a real file. */
    async openUploadDialog(): Promise<this> {
        Log.step('Opening the Upload Document dialog');
        await MuiUtils.openDialogFrom(CompanyDocumentsPage.UPLOAD_BUTTON);
        return this;
    }

    async uploadDialogTitle(): Promise<string> {
        return ElementUtils.getText(MuiUtils.DIALOG_TITLE);
    }

    /** Field labels the upload dialog is expected to present. */
    async uploadDialogHasAllFields(): Promise<boolean> {
        const text = await MuiUtils.dialogText();
        return text.includes('Title')
            && text.includes('Category')
            && text.includes('Effective Date')
            && text.includes('Share with All Employees');
    }

    async closeUploadDialog(): Promise<this> {
        await MuiUtils.clickDialogButtonAndWaitForClose('Cancel');
        return this;
    }
}
