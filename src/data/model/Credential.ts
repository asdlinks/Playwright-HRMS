/**
 * One login row from credentials.json.
 *
 * Also used for the negative-login dataset, where expectedError carries the
 * message the app must show and scenario names the case in the report.
 */
export class Credential {
    scenario?: string;
    companyCode = '';
    email = '';
    password = '';
    expectedError?: string;
    shouldSucceed = true;

    static from(raw: Partial<Credential>): Credential {
        return Object.assign(new Credential(), raw);
    }

    /** Never print the password - reports and CI logs are widely readable. */
    toString(): string {
        return this.scenario ?? `${this.email} @ ${this.companyCode}`;
    }
}
