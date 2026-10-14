/**
 * Payload for the Register New Employee dialog.
 *
 * Field names mirror the form's own name attributes (name, email,
 * date_of_birth, employee_id ...) so the mapping from data file to page object
 * stays obvious.
 *
 * Built through TestDataFactory rather than by hand, so every run gets a
 * unique email and employee id - the app rejects duplicates, and a suite that
 * can only pass once is not a suite.
 *
 * A field left undefined/null means "do not touch it"; an empty string is a
 * meaningful input ("clear this field").
 */
export class EmployeeData {
    scenario?: string | null;
    fullName?: string | null;
    email?: string | null;
    dateOfBirth?: string | null;
    branch?: string | null;
    department?: string | null;
    designation?: string | null;
    employeeId?: string | null;
    employmentType?: string | null;
    probationMonths?: string | null;
    joiningDate?: string | null;
    role?: string | null;
    manager?: string | null;
    initialPassword?: string | null;

    // Expectations, used by the negative dataset
    expectedError?: string | null;
    erroneousField?: string | null;

    static from(raw: Partial<EmployeeData>): EmployeeData {
        return Object.assign(new EmployeeData(), raw);
    }

    toString(): string {
        return this.scenario ?? `${this.fullName} / ${this.employeeId}`;
    }
}
