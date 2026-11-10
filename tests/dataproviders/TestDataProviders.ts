import { Credential } from '../../src/data/model/Credential';
import { JsonDataReader } from '../../src/data/reader/JsonDataReader';
import { Persona } from '../../src/enums/Persona';

/**
 * Every data provider in the suite.
 *
 * Playwright has no @DataProvider: a test file loops over the rows and
 * declares one test per row, which is what these feed.
 *
 * Most datasets are iterated inside a single test (see the TC_AUTH_02 loop)
 * so one session covers every scenario with soft assertions. The providers
 * left here split a test per persona, because each persona needs its own
 * sign-in anyway.
 */
export class TestDataProviders {
  private constructor() {}

  static allPersonas(): Persona[] {
    return [Persona.ADMIN, Persona.HR];
  }

  static validCredentials(): Array<{ persona: Persona; credential: Credential }> {
    return TestDataProviders.allPersonas().map((persona) => ({
      persona,
      credential: JsonDataReader.credentialFor(persona.key),
    }));
  }
}
