/**
 * One login row from credentials.json.
 *
 * Also used for the negative-login dataset, where `expectedError` carries the
 * message the app must show and `scenario` names the case in the report.
 *
 * Never log a Credential whole - use describeCredential(), which leaves the
 * password out. Reports and CI logs are widely readable.
 */
export interface Credential {
  scenario?: string;
  companyCode: string;
  email: string;
  password: string;
  expectedError?: string;
  shouldSucceed: boolean;
}

export function describeCredential(credential: Credential): string {
  return credential.scenario ?? `${credential.email} @ ${credential.companyCode}`;
}
