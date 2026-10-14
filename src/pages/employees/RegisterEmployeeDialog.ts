import { EmployeeData } from '../../data/model/EmployeeData';
import { IllegalStateError, WaitTimeoutError } from '../../exceptions/errors';
import { ElementUtils } from '../../utils/ElementUtils';
import { Log } from '../../utils/Log';
import { MuiUtils } from '../../utils/MuiUtils';
import { WaitUtils } from '../../utils/WaitUtils';
import { EmployeeDirectoryPage } from './EmployeeDirectoryPage';

/**
 * The Register New Employee dialog.
 *
 * Four sections: Personal Information, Employment Information, Identity
 * Information (optional) and Banking Information (optional).
 *
 * The text inputs carry real name attributes, so they are located that way.
 * The dropdowns (Branch, Department, Designation, Employment Type, Role,
 * Assign Manager) are MUI Selects whose options are portalled to body level,
 * so those go through MuiUtils.
 */
export class RegisterEmployeeDialog {

    private static readonly TITLE = 'Register New Employee';

    // --- inputs, by the form's own name attributes ---
    private static readonly FULL_NAME = "input[name='name']";
    private static readonly EMAIL = "input[name='email']";
    private static readonly DATE_OF_BIRTH = "input[name='date_of_birth']";
    private static readonly EMPLOYEE_ID = "input[name='employee_id']";
    private static readonly PROBATION_MONTHS = "input[name='probation_period']";
    private static readonly JOINING_DATE = "input[name='joining_date']";
    private static readonly INITIAL_PASSWORD = "input[name='password']";

    // --- dropdowns, by visible label ---
    // Scoped to the dialog: the Employee Directory underneath renders filters
    // with these exact same labels, and an unscoped locator resolves to those
    // instead. See MuiUtils.inputByLabelIn for what that failure looks like.
    private static readonly BRANCH = MuiUtils.selectByLabelIn(MuiUtils.IN_DIALOG, 'Branch');
    private static readonly DEPARTMENT = MuiUtils.selectByLabelIn(MuiUtils.IN_DIALOG, 'Department');
    private static readonly DESIGNATION = MuiUtils.selectByLabelIn(MuiUtils.IN_DIALOG, 'Designation');
    private static readonly EMPLOYMENT_TYPE = MuiUtils.selectByLabelIn(MuiUtils.IN_DIALOG, 'Employment Type');
    private static readonly ROLE = MuiUtils.selectByLabelIn(MuiUtils.IN_DIALOG, 'Role');
    private static readonly ASSIGN_MANAGER = MuiUtils.selectByLabelIn(MuiUtils.IN_DIALOG, 'Assign Manager');

    private static readonly SAVE_BUTTON = 'Save Record';
    private static readonly CANCEL_BUTTON = 'Cancel';

    // -------------------------------------------------------------- state

    async isOpen(): Promise<boolean> {
        return await MuiUtils.isDialogOpen() && (await MuiUtils.dialogText()).includes(RegisterEmployeeDialog.TITLE);
    }

    async title(): Promise<string> {
        return ElementUtils.getText(MuiUtils.DIALOG_TITLE);
    }

    /** Section headings, used to assert the dialog rendered in full. */
    async hasAllSections(): Promise<boolean> {
        const text = await MuiUtils.dialogText();
        return text.includes('Personal Information')
            && text.includes('Employment Information')
            && text.includes('Identity Information')
            && text.includes('Banking Information');
    }

    // -------------------------------------------------------------- filling

    async enterFullName(value: string): Promise<this> {
        await ElementUtils.type(RegisterEmployeeDialog.FULL_NAME, value);
        return this;
    }

    async enterEmail(value: string): Promise<this> {
        await ElementUtils.type(RegisterEmployeeDialog.EMAIL, value);
        return this;
    }

    async enterDateOfBirth(mmddyyyy: string): Promise<this> {
        await ElementUtils.typeIntoDateField(RegisterEmployeeDialog.DATE_OF_BIRTH, mmddyyyy);
        return this;
    }

    async enterEmployeeId(value: string): Promise<this> {
        await ElementUtils.type(RegisterEmployeeDialog.EMPLOYEE_ID, value);
        return this;
    }

    async enterProbationMonths(value: string): Promise<this> {
        await ElementUtils.type(RegisterEmployeeDialog.PROBATION_MONTHS, value);
        return this;
    }

    async enterJoiningDate(mmddyyyy: string): Promise<this> {
        await ElementUtils.typeIntoDateField(RegisterEmployeeDialog.JOINING_DATE, mmddyyyy);
        return this;
    }

    async enterInitialPassword(value: string): Promise<this> {
        await ElementUtils.type(RegisterEmployeeDialog.INITIAL_PASSWORD, value);
        return this;
    }

    async selectBranch(value: string): Promise<this> {
        await MuiUtils.selectOption(RegisterEmployeeDialog.BRANCH, value);
        return this;
    }

    async selectDepartment(value: string): Promise<this> {
        await MuiUtils.selectOption(RegisterEmployeeDialog.DEPARTMENT, value);
        return this;
    }

    async selectDesignation(value: string): Promise<this> {
        await MuiUtils.selectOption(RegisterEmployeeDialog.DESIGNATION, value);
        return this;
    }

    async selectEmploymentType(value: string): Promise<this> {
        await MuiUtils.selectOption(RegisterEmployeeDialog.EMPLOYMENT_TYPE, value);
        return this;
    }

    async selectRole(value: string): Promise<this> {
        await MuiUtils.selectOption(RegisterEmployeeDialog.ROLE, value);
        return this;
    }

    async assignManager(value: string): Promise<this> {
        await MuiUtils.selectOption(RegisterEmployeeDialog.ASSIGN_MANAGER, value);
        return this;
    }

    /**
     * Fills whatever the dataset provides and leaves the rest untouched.
     *
     * Null-tolerant on purpose: the negative dataset deliberately omits fields
     * to exercise validation, and a blank string is itself a meaningful input
     * ("clear this field") rather than "skip it".
     */
    async fill(data: EmployeeData): Promise<this> {
        Log.step('Filling the employee form: ' + data);
        if (data.fullName != null) {
            await this.enterFullName(data.fullName);
        }
        if (data.email != null) {
            await this.enterEmail(data.email);
        }
        if (data.dateOfBirth != null && data.dateOfBirth.trim() !== '') {
            await this.enterDateOfBirth(data.dateOfBirth);
        }
        if (data.branch != null) {
            await this.selectBranch(data.branch);
        }
        if (data.department != null) {
            await this.selectDepartment(data.department);
        }
        if (data.designation != null) {
            await this.selectDesignation(data.designation);
        }
        if (data.employeeId != null) {
            await this.enterEmployeeId(data.employeeId);
        }
        if (data.employmentType != null) {
            await this.selectEmploymentType(data.employmentType);
        }
        if (data.probationMonths != null) {
            await this.enterProbationMonths(data.probationMonths);
        }
        if (data.joiningDate != null && data.joiningDate.trim() !== '') {
            await this.enterJoiningDate(data.joiningDate);
        }
        if (data.role != null) {
            await this.selectRole(data.role);
        }
        if (data.manager != null) {
            await this.assignManager(data.manager);
        }
        if (data.initialPassword != null) {
            await this.enterInitialPassword(data.initialPassword);
        }
        return this;
    }

    // ------------------------------------------------------------ submitting

    /**
     * Clicks Save without asserting the outcome - used by validation tests.
     *
     * A submit has two legitimate outcomes here: the dialog closes (accepted)
     * or validation messages appear (rejected). Either proves the click
     * registered. Seeing NEITHER means the click was swallowed, which would
     * otherwise be misreported as "the form raised no validation errors" - so
     * that case is retried with the full pointer sequence.
     */
    async clickSave(): Promise<this> {
        Log.step('Submitting the employee form');
        await MuiUtils.clickDialogButton(RegisterEmployeeDialog.SAVE_BUTTON);

        if (!await this.submissionWasProcessed()) {
            Log.warn('The form did not react to the submit - replaying the full pointer sequence');
            if (await MuiUtils.isDialogOpen()) {
                await MuiUtils.clickDialogButtonViaScript(RegisterEmployeeDialog.SAVE_BUTTON);
                await this.submissionWasProcessed();
            }
        }
        return this;
    }

    /** Waits briefly for the dialog to either close or raise validation errors. */
    private async submissionWasProcessed(): Promise<boolean> {
        try {
            await WaitUtils.fluently(
                async () => !await MuiUtils.isDialogOpen() || await ElementUtils.isPresent(MuiUtils.FIELD_ERROR),
                8000, 'The form neither closed nor raised a validation message');
            return true;
        } catch (e) {
            if (e instanceof WaitTimeoutError) {
                return false;
            }
            throw e;
        }
    }

    /** Saves and waits for the dialog to close, i.e. the happy path. */
    async saveExpectingSuccess(): Promise<EmployeeDirectoryPage> {
        if (!await MuiUtils.clickDialogButtonAndWaitForClose(RegisterEmployeeDialog.SAVE_BUTTON)) {
            throw new IllegalStateError(
                'The employee was not saved - the dialog is still open. '
                + `Validation messages: [${(await this.validationMessages()).join(', ')}]`);
        }
        await WaitUtils.waitForDataToSettle();
        Log.pass('Employee record saved');
        return new EmployeeDirectoryPage();
    }

    async cancel(): Promise<EmployeeDirectoryPage> {
        await MuiUtils.clickDialogButtonAndWaitForClose(RegisterEmployeeDialog.CANCEL_BUTTON);
        return new EmployeeDirectoryPage();
    }

    // ------------------------------------------------------------ validation

    /** Every inline validation message currently rendered in the dialog. */
    async validationMessages(): Promise<string[]> {
        await WaitUtils.sleepQuietly(600);
        const messages = (await ElementUtils.textsOf(MuiUtils.FIELD_ERROR)).filter(text => text !== '');
        return [...new Set(messages)];
    }

    async showsValidationMessage(message: string): Promise<boolean> {
        return (await this.validationMessages()).some(text => text.includes(message));
    }

    /** The dialog staying open is itself proof the submission was rejected. */
    async remainsOpenAfterSubmit(): Promise<boolean> {
        await WaitUtils.sleepQuietly(800);
        return MuiUtils.isDialogOpen();
    }
}
