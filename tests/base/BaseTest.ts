import { expect, test as base } from '@playwright/test';
import { Persona } from '../../src/enums/Persona';
import { LoginPage } from '../../src/pages/auth/LoginPage';
import { BasePage } from '../../src/pages/base/BasePage';
import { DashboardPage } from '../../src/pages/dashboard/DashboardPage';
import { EmployeeDirectoryPage } from '../../src/pages/employees/EmployeeDirectoryPage';
import { Log } from '../../src/utils/Log';

/**
 * Lifecycle shared by every test - the Playwright counterpart of the
 * Selenium BaseTest class.
 *
 * A FRESH BROWSER CONTEXT PER TEST, ON PURPOSE
 * --------------------------------------------
 * Playwright gives each test its own browser context (cookies, storage) by
 * default, so every test signs in again. That costs a few seconds per test
 * and buys three things worth far more: tests can run in any order, a
 * failure cannot cascade into the next test through leftover session state,
 * and in an RBAC suite that keeps switching persona a stale admin cookie can
 * never silently turn an HR test green.
 *
 * Session helpers are FIXTURES - destructure the ones a test needs:
 *
 *   test('...', async ({ page, loginAndOpen }) => {
 *     const directory = await loginAndOpen(Persona.ADMIN, new EmployeeDirectoryPage(page));
 *   });
 */
export interface SessionFixtures {
  /** Signs in and returns the dashboard. */
  loginAs: (persona: Persona) => Promise<DashboardPage>;
  /** Signs in and opens a page, returning it ready to use. */
  loginAndOpen: <T extends BasePage>(persona: Persona, target: T) => Promise<T>;
  /** Opens the login page without authenticating. */
  openLoginPage: () => Promise<LoginPage>;
}

export const test = base.extend<SessionFixtures>({
  loginAs: async ({ page }, use, testInfo) => {
    await use(async (persona: Persona) => {
      testInfo.annotations.push({ type: 'persona', description: persona.roleName });
      return new LoginPage(page).loginAs(persona);
    });
  },

  loginAndOpen: async ({ loginAs }, use) => {
    await use(async <T extends BasePage>(persona: Persona, target: T): Promise<T> => {
      await loginAs(persona);
      return target.open();
    });
  },

  openLoginPage: async ({ page }, use) => {
    await use(() => new LoginPage(page).open());
  },
});

export { expect };

// ------------------------------------------------------- soft assertions

/*
 * THE RULE THE SUITE FOLLOWS
 * --------------------------
 * Hard assertions - expect(...) - guard the checks everything after them
 * depends on: sign-in, a page or dialog being loaded, a record having
 * actually been saved, and security boundaries. Continuing past one of those
 * would only produce noise.
 *
 * Soft assertions - expect.soft(...) - cover independent observations (the
 * cards, columns, controls and counts on a screen) so one run reports every
 * one that is wrong rather than stopping at the first. Every test that uses
 * them ends with assertAllSoft().
 *
 * Playwright already fails a test that recorded soft failures, so the
 * Selenium suite's "unreported soft assertion" safety net is built in.
 */

/** Stops the test here if any soft assertion has failed so far. Call it last. */
export function assertAllSoft(): void {
  const failures = base.info().errors.length;
  if (failures > 0) {
    throw new Error(`${failures} soft assertion(s) failed - see the errors above`);
  }
}

/**
 * Records a soft failure when a page did not load and returns whether it
 * did, so a sweep across several pages can skip one page's checks without
 * abandoning the others.
 */
export async function softlyLoaded(page: BasePage, pageName: string): Promise<boolean> {
  const loaded = await page.isLoaded();
  expect.soft(loaded, `${pageName} did not load - its checks were skipped`).toBe(true);
  return loaded;
}

// ------------------------------------------------ environment guards

/**
 * Skips the current test when the tenant's plan has no free employee seat.
 *
 * Hitting that ceiling is an environment problem, not a product defect, so
 * it is reported as a skip - a failure would point at the registration form
 * and send whoever triages it looking in the wrong place entirely.
 */
export async function skipIfTenantAtEmployeeLimit(directory: EmployeeDirectoryPage): Promise<void> {
  if (await directory.isAtEmployeeLimit()) {
    base.skip(
      true,
      `Cannot exercise employee registration: ${await directory.employeeLimitMessage()} ` +
        'Free a seat in the tenant (Employees -> Delete on an AT-prefixed record) and re-run.',
    );
  }
}

// ------------------------------------------------------- report logging

/*
 * Narrative entries for the HTML report and the console. A failed run reads
 * as a story rather than a stack trace - the difference between a report a
 * developer can triage and one they ignore. They appear as annotations at
 * the top of each test in the Playwright HTML report.
 */

/** Records a numbered step. */
export function step(description: string): void {
  Log.step(description);
  base.info().annotations.push({ type: 'step', description });
}

/** Records a satisfied expectation. */
export function verified(description: string): void {
  Log.pass(`VERIFIED: ${description}`);
  base.info().annotations.push({ type: 'verified', description });
}

/**
 * Records a known problem that should be visible but must not fail the test
 * - e.g. an app defect with a workaround in place. The test can still pass.
 */
export function warn(description: string): void {
  Log.warn(description);
  base.info().annotations.push({ type: 'warning', description });
}

/** Records context that is neither a step nor an assertion. */
export function note(description: string): void {
  Log.info(description);
  base.info().annotations.push({ type: 'note', description });
}
