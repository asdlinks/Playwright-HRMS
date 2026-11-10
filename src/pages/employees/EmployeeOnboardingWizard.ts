import {
  BankDetails,
  BasicDetails,
  ContactDetails,
  Education,
  IdentityDetails,
  PreviousEmployment,
  Reference,
} from '../../data/model/OnboardingEmployee';
import { WaitStrategy } from '../../enums/WaitStrategy';
import { FrameworkException, WaitTimeoutException } from '../../exceptions/FrameworkException';
import { DateUtils } from '../../utils/DateUtils';
import { ElementUtils } from '../../utils/ElementUtils';
import { Log } from '../../utils/Log';
import { MuiUtils } from '../../utils/MuiUtils';
import { NetworkRecorder } from '../../utils/NetworkRecorder';
import { WaitUtils } from '../../utils/WaitUtils';
import { BaseDialog } from '../base/BaseDialog';

const STEP_PATTERN = /STEP (\d) OF (\d)/;
const IN = MuiUtils.IN_DIALOG;

/**
 * The six-step "Employee Onboarding" wizard behind Add New Employee.
 *
 *   1 Basic Details          personal + employment, the only required step
 *   2 Contact, ID & Bank     contact, address, Aadhaar/Passport, PAN + bank
 *   3 Education              repeatable entries, each added with a button
 *   4 Employment History     repeatable entries
 *   5 References             repeatable entries; its forward button reads "Review"
 *   6 Review & Create        read-only summary and the final create button
 *
 * Only one step is rendered at a time, so label-based locators scoped to the
 * dialog resolve to the current step's field even where labels repeat across
 * steps ("Branch" on steps 1 and 2, "Contact Number" on steps 2 and 5).
 *
 * WHY THE NAVIGATION BUTTONS ARE CLICKED BY SCRIPT
 * ------------------------------------------------
 * A native click on Next/Cancel is delivered to the button yet the wizard
 * does not react, and nothing in the DOM says why. A dispatched click is
 * acted on every time. Each navigation is followed by a check that the step
 * really changed, so a swallowed click still fails loudly.
 */
export class EmployeeOnboardingWizard extends BaseDialog {
  // --- step 1: inputs carrying name attributes ---
  private readonly fullName = this.page.locator("input[name='name']");
  private readonly email = this.page.locator("input[name='email']");
  private readonly dateOfBirth = this.page.locator("input[name='date_of_birth']");
  private readonly nationality = this.page.locator("input[name='nationality']");
  private readonly employeeId = this.page.locator("input[name='employee_id']");
  private readonly probationMonths = this.page.locator("input[name='probation_period']");
  private readonly joiningDate = this.page.locator("input[name='joining_date']");

  // --- step 2: contact block carries name attributes, ID and bank blocks do not ---
  private readonly contactNumber = this.page.locator("input[name='contact_number']");
  private readonly emergencyContact = this.page.locator("input[name='emergency_contact_number']");
  private readonly address = this.page.locator("textarea[name='address']");
  private readonly city = this.page.locator("input[name='address_city']");
  private readonly pinCode = this.page.locator("input[name='address_pin_code']");
  private readonly country = this.page.locator("input[name='address_country']");

  // ------------------------------------------------------------- state

  protected title(): string {
    return 'Employee Onboarding';
  }

  /** The 1-based step the wizard is showing, read from its "STEP n OF 6" caption. */
  async currentStep(): Promise<number> {
    const match = STEP_PATTERN.exec(await MuiUtils.dialogText(this.page));
    if (!match) {
      throw new FrameworkException("The onboarding wizard shows no 'STEP n OF 6' caption");
    }
    return Number.parseInt(match[1], 10);
  }

  // ------------------------------------------------- step 1: basic details

  async fillBasicDetails(basic: BasicDetails): Promise<this> {
    Log.step(`Step 1 - Basic Details for ${basic.fullName}`);
    await ElementUtils.type(this.fullName, basic.fullName);
    await ElementUtils.type(this.email, basic.email);
    await ElementUtils.typeIntoDateField(this.dateOfBirth, this.browserDate(basic.dateOfBirth));
    await this.select('Gender', basic.gender);
    await this.select('Blood Group', basic.bloodGroup);
    await this.select('Marital Status', basic.maritalStatus);
    await ElementUtils.type(this.nationality, basic.nationality);

    await this.select('Branch', basic.branch);
    await this.select('Department', basic.department);
    await this.select('Designation', basic.designation);
    // The field is pre-filled with an auto-generated id; typing replaces it.
    await ElementUtils.type(this.employeeId, basic.employeeId);
    await this.select('Employment Type', basic.employmentType);
    await ElementUtils.type(this.probationMonths, basic.probationMonths);
    await ElementUtils.typeIntoDateField(this.joiningDate, this.browserDate(basic.joiningDate));

    // Options carry a suffix ("Branch Head (Brand head)",
    // "General Shift · General (...)"), so these match on the stable part.
    await this.selectContaining('Reporting Manager', basic.reportingManager);
    await this.selectContaining('Attendance Policy', basic.attendancePolicy);
    await this.selectContaining('Shift', basic.shift);
    return this;
  }

  // ------------------------------------------- step 2: contact, ID & bank

  async fillContactDetails(contact: ContactDetails): Promise<this> {
    Log.step('Step 2 - Contact and address');
    await ElementUtils.type(this.contactNumber, contact.contactNumber);
    await ElementUtils.type(this.emergencyContact, contact.emergencyContactNumber);
    await ElementUtils.type(this.address, contact.addressLine);
    await ElementUtils.type(this.city, contact.city);
    // State before district: the district list is the chosen state's.
    await this.select('State', contact.state);
    await MuiUtils.searchAndSelect(MuiUtils.inputByLabelIn(this.page, IN, 'District'), contact.district);
    if (contact.pinCode?.trim()) {
      await ElementUtils.type(this.pinCode, contact.pinCode);
    }
    await ElementUtils.type(this.country, contact.country);
    return this;
  }

  async fillIdentityDetails(identity: IdentityDetails): Promise<this> {
    Log.step('Step 2 - Identity numbers');
    await this.typeByLabel('Aadhaar Number', identity.aadhaarNumber);
    await this.typeByLabel('Passport Number', identity.passportNumber);
    return this;
  }

  async fillBankDetails(bank: BankDetails): Promise<this> {
    Log.step('Step 2 - Banking');
    await this.typeByLabel('PAN Number', bank.panNumber);
    await this.typeByLabel('Account Holder Name', bank.accountHolderName);
    await this.typeByLabel('Bank Name', bank.bankName);
    await this.typeByLabel('Account Number', bank.accountNumber);
    await this.typeByLabel('Confirm Account Number', bank.accountNumber);
    await this.typeByLabel('Branch', bank.branch);
    await this.typeByLabel('IFSC Code', bank.ifscCode);
    return this;
  }

  // ------------------------------------------ steps 3-5: repeatable lists

  async addEducation(education: Education): Promise<this> {
    Log.step(`Step 3 - Adding education: ${education.qualification}`);
    await this.typeByLabel('Qualification', education.qualification);
    await this.typeByLabel('Institution', education.institution);
    await this.typeByLabel('Specialization', education.specialization);
    await this.typeByLabel('Year of Passing', education.yearOfPassing);
    await this.typeByLabel('Grade', education.grade);
    await this.addEntry('Add Education Entry', education.institution);
    return this;
  }

  async addPreviousEmployment(job: PreviousEmployment): Promise<this> {
    Log.step(`Step 4 - Adding previous employer: ${job.companyName}`);
    await this.typeByLabel('Company Name', job.companyName);
    await this.typeByLabel('Designation', job.designation);
    await this.typeDateByLabel('From', job.from);
    await this.typeDateByLabel('To', job.to);
    if (job.mostRecent) {
      const checkbox = MuiUtils.xpath(
        this.page,
        `${IN}//label[contains(normalize-space(.),'most recent employer')]//input[@type='checkbox']`,
      );
      if (!(await (await ElementUtils.find(checkbox, WaitStrategy.PRESENT)).isChecked())) {
        await ElementUtils.clickViaScript(checkbox);
      }
    }
    await this.addEntry('Add Company', job.companyName);
    return this;
  }

  async addReference(reference: Reference): Promise<this> {
    Log.step(`Step 5 - Adding reference: ${reference.name}`);
    await this.typeByLabel('Reference Name', reference.name);
    await this.typeByLabel('Relationship', reference.relationship);
    await this.typeByLabel('Contact Number', reference.contactNumber);
    await this.typeByLabel('Email', reference.email);
    await ElementUtils.type(MuiUtils.textAreaByLabelIn(this.page, IN, 'Address'), reference.address);
    await this.addEntry('Add Reference', reference.name);
    return this;
  }

  // ----------------------------------------------------------- navigation

  /** Moves forward one step (Next, or Review on step 5) and checks it happened. */
  async next(): Promise<this> {
    const from = await this.currentStep();
    if (!(await this.tryNext())) {
      throw new FrameworkException(
        `The wizard stayed on step ${from}. Validation messages: ${JSON.stringify(await this.validationMessages())}. ` +
          `Field values: ${await this.fieldValues()}`,
      );
    }
    return this;
  }

  /**
   * Attempts to move forward one step.
   *
   * @return false when the wizard stayed put - read validationMessages()
   */
  async tryNext(): Promise<boolean> {
    const from = await this.currentStep();
    const button = from === 5 ? 'Review' : 'Next';
    Log.step(`Wizard: '${button}' from step ${from}`);
    await MuiUtils.clickDialogButtonViaScript(this.page, button);
    return WaitUtils.pollQuietly(this.page, async () => (await this.currentStep()) === from + 1, 10_000);
  }

  /** Empties the PIN Code field (step 2). */
  async clearPinCode(): Promise<this> {
    await ElementUtils.setValueViaReact(this.pinCode, '');
    return this;
  }

  /**
   * Clicks Create Employee on Review & Create and waits for the wizard to
   * leave that step - the proof the record was accepted.
   *
   * @return the success screen's text with the password redacted, or empty if
   *         the wizard closed straight away
   */
  async create(): Promise<string> {
    const step = await this.currentStep();
    if (step !== 6) {
      throw new FrameworkException(`create() called on step ${step}, not 6`);
    }
    Log.step('Wizard: creating the employee');
    const dialog = await ElementUtils.find(this.page.locator(MuiUtils.DIALOG), WaitStrategy.VISIBLE);
    const buttons = dialog.locator('button');
    const texts = (await buttons.allInnerTexts()).map((t) => t.trim());
    // The action bar comes last, so the last "create" button is the one.
    const index = texts.reduce((found, text, i) => (text.toLowerCase().includes('create') ? i : found), -1);
    if (index < 0) {
      throw new FrameworkException(`No create button on the Review step. Buttons: ${texts.filter(Boolean)}`);
    }
    NetworkRecorder.start(this.page);
    await ElementUtils.clickViaScript(buttons.nth(index));

    try {
      await WaitUtils.poll(
        this.page,
        async () => !(await MuiUtils.isDialogOpen(this.page)) || !(await this.onReviewStep()),
        30_000,
        'The onboarding wizard did not move on after create',
      );
    } catch (e) {
      if (!(e instanceof WaitTimeoutException)) throw e;
      // The app can reject a create without saying so on screen; the API
      // response is then the only place the reason exists.
      throw new FrameworkException(
        'The wizard is still on Review & Create 30s after create. ' +
          `API writes: ${EmployeeOnboardingWizard.redact(await NetworkRecorder.recordedWrites(this.page))}. ` +
          `Validation messages: ${await this.validationMessages()}. Alerts: ${await this.alertTexts()}`,
        { cause: e },
      );
    }
    Log.info(`API writes during create: ${EmployeeOnboardingWizard.redact(await NetworkRecorder.recordedWrites(this.page))}`);
    NetworkRecorder.stop(this.page);

    // A successful create shows an "Employee Created Successfully" screen with
    // the generated login details inside the same dialog; it also names any
    // section that failed to save. Done closes it.
    let outcome = '';
    if (await MuiUtils.isDialogOpen(this.page)) {
      outcome = EmployeeOnboardingWizard.redact((await MuiUtils.dialogText(this.page)).replace(/\n/g, ' / '));
      Log.info(`After create the wizard shows: ${outcome}`);
      const after = await ElementUtils.find(this.page.locator(MuiUtils.DIALOG), WaitStrategy.VISIBLE);
      const afterButtons = after.locator('button');
      const close = (await afterButtons.allInnerTexts()).reduce(
        (found, text, i) => (/^(done|close|finish|ok)$/i.test(text.trim()) ? i : found),
        -1,
      );
      if (close >= 0) {
        await ElementUtils.clickViaScript(afterButtons.nth(close));
      }
      await WaitUtils.waitForInvisibleQuietly(this.page.locator(MuiUtils.DIALOG), 10_000);
      if (await MuiUtils.isDialogOpen(this.page)) {
        await MuiUtils.dismissOverlays(this.page);
      }
    }
    await WaitUtils.waitForDataToSettle(this.page);
    Log.pass('Employee created through the onboarding wizard');
    return outcome;
  }

  /**
   * Removes the generated initial password from text bound for logs and
   * reports - from the success screen ("Password / xxxx") and from the API
   * response ("initial_password":"xxxx").
   */
  private static redact(text: string): string {
    return text
      .replace(/(Password \/ )[^ /]+/g, '$1<redacted>')
      .replace(/("initial_password"\s*:\s*")[^"]*/g, '$1<redacted>');
  }

  // -------------------------------------------------------------- helpers

  private async select(label: string, option: string | undefined): Promise<void> {
    if (option?.trim()) {
      await MuiUtils.selectOption(MuiUtils.selectByLabelIn(this.page, IN, label), option);
    }
  }

  private async selectContaining(label: string, fragment: string | undefined): Promise<void> {
    if (fragment?.trim()) {
      await MuiUtils.selectOptionContaining(MuiUtils.selectByLabelIn(this.page, IN, label), fragment);
    }
  }

  private async typeByLabel(label: string, value: string | undefined): Promise<void> {
    if (value?.trim()) {
      await ElementUtils.type(MuiUtils.inputByLabelIn(this.page, IN, label), value);
    }
  }

  /** From/To may render as date or month inputs; each takes a different value shape. */
  private async typeDateByLabel(label: string, isoDate: string | undefined): Promise<void> {
    if (!isoDate?.trim()) {
      return;
    }
    const locator = MuiUtils.inputByLabelIn(this.page, IN, label);
    const type = await ElementUtils.getAttribute(locator, 'type');
    if (type === 'date') {
      await ElementUtils.typeIntoDateField(locator, this.browserDate(isoDate));
    } else if (type === 'month') {
      await ElementUtils.setValueViaReact(locator, isoDate.substring(0, 7));
    } else {
      await ElementUtils.type(locator, isoDate);
    }
  }

  /** Clicks a list's Add button and waits for the new entry to be listed. */
  private async addEntry(buttonText: string, entryMarker: string): Promise<void> {
    await MuiUtils.clickDialogButtonViaScript(this.page, buttonText);
    // Dialog TEXT excludes input values, so the marker only shows up once the
    // entry is rendered in the list - not while it sits in the form.
    const added = await WaitUtils.pollQuietly(
      this.page,
      async () => (await MuiUtils.dialogText(this.page)).includes(entryMarker),
      8_000,
    );
    if (!added) {
      throw new FrameworkException(`'${buttonText}' did not add an entry showing '${entryMarker}'`);
    }
    await this.page.waitForTimeout(400);
  }

  private browserDate(iso: string): string {
    return DateUtils.forDateInput(DateUtils.parseIso(iso));
  }

  private async onReviewStep(): Promise<boolean> {
    try {
      return (await MuiUtils.dialogText(this.page)).includes('STEP 6 OF 6');
    } catch {
      return false;
    }
  }

  /** "label=value" for every field on the current step - for failure messages. */
  private fieldValues(): Promise<string> {
    return this.page.evaluate(() => {
      const dialog = document.querySelector('.MuiDialog-root');
      if (!dialog) return 'no dialog';
      return [...dialog.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea')]
        .filter((e) => e.type !== 'file' && e.getAttribute('aria-hidden') !== 'true')
        .map((e) => {
          const control = e.closest('.MuiFormControl-root');
          const label = control && control.querySelector('label');
          return `${label ? (label.textContent || '').trim() : e.name || '?'}=${JSON.stringify(e.value)}`;
        })
        .join(', ');
    });
  }

  private async alertTexts(): Promise<string[]> {
    return (await this.page.locator(MuiUtils.ALERT).allInnerTexts()).map((t) => t.trim()).filter(Boolean);
  }
}
