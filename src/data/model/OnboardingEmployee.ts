/** Step 1 - Basic Details. Dates are ISO (yyyy-MM-dd). */
export interface BasicDetails {
  fullName: string;
  email: string;
  dateOfBirth: string;
  gender: string;
  bloodGroup: string;
  maritalStatus: string;
  nationality: string;
  branch: string;
  department: string;
  designation: string;
  employeeId: string;
  employmentType: string;
  probationMonths: string;
  joiningDate: string;
  reportingManager: string;
  attendancePolicy: string;
  shift: string;
}

/** Step 2 - contact and address. */
export interface ContactDetails {
  contactNumber: string;
  emergencyContactNumber: string;
  addressLine: string;
  city: string;
  district: string;
  state: string;
  pinCode: string;
  country: string;
}

/** Step 2 - identity documents (numbers only; no uploads). */
export interface IdentityDetails {
  aadhaarNumber: string;
  passportNumber: string;
}

/** Step 2 - banking. */
export interface BankDetails {
  panNumber: string;
  accountHolderName: string;
  bankName: string;
  accountNumber: string;
  branch: string;
  ifscCode: string;
}

/** Step 3 - one qualification. */
export interface Education {
  qualification: string;
  institution: string;
  specialization: string;
  yearOfPassing: string;
  grade: string;
}

/** Step 4 - one previous employer. */
export interface PreviousEmployment {
  companyName: string;
  designation: string;
  from: string;
  to: string;
  mostRecent: boolean;
}

/** Step 5 - one reference. */
export interface Reference {
  name: string;
  relationship: string;
  contactNumber: string;
  email: string;
  address: string;
}

/** The raw shape of employee-onboarding(-quick).json. */
export interface OnboardingEmployeeData {
  basicDetails: BasicDetails;
  contactDetails: ContactDetails;
  identityDetails?: IdentityDetails | null;
  bankDetails?: BankDetails | null;
  education?: Education[];
  employmentHistory?: PreviousEmployment[];
  references?: Reference[];
}

/**
 * A complete employee record for the six-step Employee Onboarding wizard.
 *
 * Unlike the unique names TestDataFactory generates, this is a fixed,
 * realistic person loaded from testdata/employee-onboarding.json (or
 * employee-onboarding-quick.json). Only the unique identifiers get a run
 * stamp (withRunStamp), because the app never releases the email of a deleted
 * employee. The test deletes the record at the end, and removes any
 * same-named leftover from an aborted run before it starts.
 */
export class OnboardingEmployee {
  constructor(
    readonly basicDetails: BasicDetails,
    readonly contactDetails: ContactDetails,
    readonly identityDetails: IdentityDetails | null,
    readonly bankDetails: BankDetails | null,
    readonly education: Education[],
    readonly employmentHistory: PreviousEmployment[],
    readonly references: Reference[],
  ) {}

  static fromJson(data: OnboardingEmployeeData): OnboardingEmployee {
    return new OnboardingEmployee(
      data.basicDetails,
      data.contactDetails,
      data.identityDetails ?? null,
      data.bankDetails ?? null,
      data.education ?? [],
      data.employmentHistory ?? [],
      data.references ?? [],
    );
  }

  get fullName(): string {
    return this.basicDetails.fullName;
  }

  /**
   * This person with a run stamp on their unique identifiers only: email,
   * Employee ID, Aadhaar, Passport and PAN.
   *
   * The app permanently reserves these for a deleted employee - "This email
   * belongs to a deleted employee", "This Aadhaar number is already assigned
   * to another employee" (both HTTP 409) - so the cleanup at the end of a run
   * would otherwise block every later run. The identity numbers keep their
   * valid shapes (12-digit Aadhaar, letter + 7 digits passport, AAAAA9999A
   * PAN). Everything else stays exactly as stored.
   *
   * @param stamp ten digits, e.g. "1104213400";
   *              "priya.nair@x.com" becomes "priya.nair.1104213400@x.com"
   */
  withRunStamp(stamp: string): OnboardingEmployee {
    if (!/^\d{10}$/.test(stamp)) {
      throw new Error(`The run stamp must be ten digits: ${stamp}`);
    }
    const b = this.basicDetails;
    const at = b.email.indexOf('@');
    const stamped: BasicDetails = {
      ...b,
      email: `${b.email.substring(0, at)}.${stamp}${b.email.substring(at)}`,
      employeeId: `${b.employeeId}-${stamp}`,
    };
    // Identity and bank are optional - the quick-onboarding person has neither.
    const id = this.identityDetails;
    const stampedId: IdentityDetails | null = id && {
      aadhaarNumber: id.aadhaarNumber.substring(0, 2) + stamp,
      passportNumber: id.passportNumber.charAt(0) + stamp.substring(3),
    };
    const bank = this.bankDetails;
    const stampedBank: BankDetails | null = bank && {
      ...bank,
      panNumber: bank.panNumber.substring(0, 5) + stamp.substring(6) + bank.panNumber.charAt(9),
    };
    return new OnboardingEmployee(
      stamped,
      this.contactDetails,
      stampedId,
      stampedBank,
      this.education,
      this.employmentHistory,
      this.references,
    );
  }
}
