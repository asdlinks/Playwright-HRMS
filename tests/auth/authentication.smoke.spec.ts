import { JsonDataReader } from '../../src/data/reader/JsonDataReader';
import { AppModule } from '../../src/enums/AppModule';
import { Persona } from '../../src/enums/Persona';
import { LoginPage } from '../../src/pages/auth/LoginPage';
import { EmployeeDirectoryPage } from '../../src/pages/employees/EmployeeDirectoryPage';
import { assertAllSoft, expect, note, step, test, verified } from '../base/BaseTest';
import { TestDataProviders } from '../dataproviders/TestDataProviders';

/**
 * TC_AUTH - Authentication and session handling.
 *
 * The tenant-scoped login (company code + email + password) is the gate every
 * other test passes through, so these run first and the rest of the suite
 * depends on them.
 */
test.describe('TC_AUTH - Authentication and session', () => {
  test(
    'TC_AUTH_01 - The login page renders every credential field, the company branding and the forgot-password help',
    { tag: ['@smoke', '@auth', '@critical'] },
    async ({ openLoginPage }) => {
      step('Opening the login page without an authenticated session');
      const login = await openLoginPage();
      expect(await login.isLoaded(), "The login page did not render its 'Welcome Back' heading").toBe(true);

      step('Verifying the page furniture and the credential form');
      expect.soft(await login.isWelcomeHeadingDisplayed(), "The 'Welcome Back' heading is missing").toBe(true);
      expect.soft(await login.isCompanyLogoDisplayed(), 'The company logo is missing from the login page').toBe(true);
      expect
        .soft(await login.areAllCredentialFieldsDisplayed(), 'Company code, email, password or the Sign In button is missing')
        .toBe(true);
      expect
        .soft(await login.isPasswordMasked(), 'The password field is not of type=password, so input is not masked')
        .toBe(true);
      expect.soft(await login.isForgotPasswordDisplayed(), "The 'Forgot your password?' control is missing").toBe(true);

      assertAllSoft();
      verified('The login page renders completely and masks the password');
    },
  );

  test(
    'TC_AUTH_02 - Every invalid credential combination is rejected with a generic message and the user is kept on the login page',
    { tag: ['@smoke', '@auth', '@negative', '@critical'] },
    async ({ openLoginPage }) => {
      const scenarios = JsonDataReader.invalidLoginScenarios();
      note(`Invalid sign-in scenarios under test: ${scenarios.length}`);

      for (const credential of scenarios) {
        step(`Attempting sign-in: ${credential.scenario}`);
        const login = await openLoginPage();
        await login.fillAndSubmit(credential);

        // Hard: an invalid sign-in that gets through is a security defect,
        // and every later scenario would then run inside a live session.
        expect(
          login.isStillOnLoginPage(),
          `An invalid sign-in (${credential.scenario}) navigated away from the login page to ${login.currentPath()}`,
        ).toBe(true);

        const message = await login.errorMessage();
        expect.soft(await login.isErrorDisplayed(), `No error was shown for: ${credential.scenario}`).toBe(true);
        expect
          .soft(
            message.includes(credential.expectedError ?? ''),
            `${credential.scenario} - expected the message to contain '${credential.expectedError}' but it read '${message}'`,
          )
          .toBe(true);

        // The message must not reveal which field was wrong, or it lets an
        // attacker enumerate valid tenants and accounts.
        const lower = message.toLowerCase();
        expect
          .soft(
            lower.includes('user not found') || lower.includes('wrong password'),
            `${credential.scenario} - the message discloses which credential was incorrect: ${message}`,
          )
          .toBe(false);
      }

      assertAllSoft();
      verified(`All ${scenarios.length} invalid credential combinations were rejected`);
    },
  );

  for (const { persona, credential } of TestDataProviders.validCredentials()) {
    test(
      `TC_AUTH_03 - ${persona.roleName} signs in with its company code, owns its dashboard session and is offered account self-service`,
      { tag: ['@smoke', '@auth', '@critical'] },
      async ({ openLoginPage }) => {
        step(`Signing in as ${persona.roleName} (${credential.email})`);
        const login = await openLoginPage();
        // loginWith fails the test itself if the dashboard never loads.
        const dashboard = await login.loginWith(credential);

        step('Verifying the session belongs to the persona that signed in');
        expect.soft(dashboard.currentPath(), 'Sign-in did not land on /dashboard').toBe(AppModule.DASHBOARD.route);
        expect
          .soft(await dashboard.signedInUserName(), 'The dashboard greeting names a different user than the one who signed in')
          .toBe(persona.displayName);
        expect.soft(await login.isErrorDisplayed(), 'An error banner appeared even though sign-in succeeded').toBe(false);

        step('Verifying the avatar menu offers account self-service');
        const items = await dashboard.header().avatarMenuItems();
        note(`Menu items offered: ${items.join(', ')}`);
        for (const action of ['Change Password', 'Update Photo', 'Logout']) {
          expect
            .soft(items.some((item) => item.includes(action)), `${action} is missing from the avatar menu for ${persona}`)
            .toBe(true);
        }

        assertAllSoft();
        verified(`${persona.roleName} signed in, owns the session and has account self-service`);
      },
    );
  }

  test(
    'TC_AUTH_04 - Protected routes are unreachable without a session, both before sign-in and after logout',
    { tag: ['@smoke', '@auth', '@security', '@critical'] },
    async ({ page, loginAs }) => {
      // Every check here is a security boundary, so all are hard assertions.
      step('Deep-linking to the Employee Directory with no session at all');
      await new EmployeeDirectoryPage(page).open();
      // The app should have redirected - the page object for where we expect
      // to be is created explicitly, then verified.
      let login = new LoginPage(page);
      expect(
        await login.isLoaded(),
        `An unauthenticated deep link to ${AppModule.EMPLOYEE_DIRECTORY.route} was not redirected to the login page`,
      ).toBe(true);
      expect(
        await login.displaysTextImmediately(AppModule.EMPLOYEE_DIRECTORY.landingMarker),
        'Employee Directory content rendered before the redirect completed',
      ).toBe(false);

      step('Signing in as the Organization Administrator, then logging out');
      const dashboard = await loginAs(Persona.ADMIN);
      login = await dashboard.header().logout();
      expect(await login.isLoaded(), 'Logout did not return the user to the login page').toBe(true);

      // The session must be dead server-side, not merely forgotten by the
      // client. A deep link is the cheapest way to prove it.
      step('Deep-linking straight back into the app after logout');
      await new EmployeeDirectoryPage(page).open();
      expect(
        await login.isLoaded(),
        `The session survived logout - deep-linking to ${AppModule.EMPLOYEE_DIRECTORY.route} reached the app instead of the login page`,
      ).toBe(true);

      verified('Protected routes are unreachable without a session, before and after logout');
    },
  );
});
