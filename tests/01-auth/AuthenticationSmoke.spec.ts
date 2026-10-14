import { assertFalse, assertTrue } from '../../src/base/Assert';
import { test } from '../../src/base/BaseTest';
import { JsonDataReader } from '../../src/data/reader/JsonDataReader';
import { AppModule } from '../../src/enums/AppModule';
import { Persona } from '../../src/enums/Persona';
import { LoginPage } from '../../src/pages/auth/LoginPage';
import { BasePage } from '../../src/pages/base/BasePage';
import { DashboardPage } from '../../src/pages/dashboard/DashboardPage';

/**
 * TC_AUTH - Authentication and session handling.
 *
 * The tenant-scoped login (company code + email + password) is the gate every
 * other test passes through, so these run first and the rest of the suite
 * depends on them.
 */
test.describe('AuthenticationSmokeTest', () => {

    test('TC_AUTH_01_loginPageRendersAllCredentialFieldsAndBranding', {
        tag: ['@smoke', '@auth', '@critical'],
        annotation: { type: 'description', description: 'TC_AUTH_01 - The login page renders every credential field, '
            + 'the company branding and the forgot-password help' },
    }, async ({ base }) => {
        base.step('Opening the login page without an authenticated session');
        const login = await base.openLoginPage();
        assertTrue(await login.isLoaded(), "The login page did not render its 'Welcome Back' heading");

        base.step('Verifying the page furniture and the credential form');
        await base.softly().assertTrue(await login.isWelcomeHeadingDisplayed(),
            "The 'Welcome Back' heading is missing");
        await base.softly().assertTrue(await login.isCompanyLogoDisplayed(),
            'The company logo is missing from the login page');
        await base.softly().assertTrue(await login.areAllCredentialFieldsDisplayed(),
            'Company code, email, password or the Sign In button is missing');
        await base.softly().assertTrue(await login.isPasswordMasked(),
            'The password field is not of type=password, so input is not masked');
        await base.softly().assertTrue(await login.isForgotPasswordDisplayed(),
            "The 'Forgot your password?' control is missing");

        base.assertAllSoft();
        base.verified('The login page renders completely and masks the password');
    });

    test('TC_AUTH_02_invalidCredentialCombinationsAreRejected', {
        tag: ['@smoke', '@auth', '@negative', '@critical'],
        annotation: { type: 'description', description: 'TC_AUTH_02 - Every invalid credential combination is rejected '
            + 'with a generic message and the user is kept on the login page' },
    }, async ({ base }) => {
        const scenarios = JsonDataReader.invalidLoginScenarios();
        base.note('Invalid sign-in scenarios under test: ' + scenarios.length);

        for (const credential of scenarios) {
            base.step('Attempting sign-in: ' + credential.scenario);
            const login = await base.openLoginPage();
            await login.fillAndSubmit(credential);

            // Hard: an invalid sign-in that gets through is a security defect,
            // and every later scenario would then run inside a live session.
            assertTrue(login.isStillOnLoginPage(),
                `An invalid sign-in (${credential.scenario}) navigated away from the login page to `
                + login.currentPath());

            const message = await login.errorMessage();
            await base.softly().assertTrue(await login.isErrorDisplayed(),
                'No error was shown for: ' + credential.scenario);
            await base.softly().assertTrue(message.includes(credential.expectedError ?? ''),
                `${credential.scenario} - expected the message to contain '${credential.expectedError}' `
                + `but it read '${message}'`);

            // The message must not reveal which field was wrong, or it lets an
            // attacker enumerate valid tenants and accounts.
            const lower = message.toLowerCase();
            await base.softly().assertFalse(lower.includes('user not found') || lower.includes('wrong password'),
                `${credential.scenario} - the message discloses which credential was incorrect: ${message}`);
        }

        base.assertAllSoft();
        base.verified(`All ${scenarios.length} invalid credential combinations were rejected`);
    });

    for (const persona of [Persona.ADMIN, Persona.HR]) {
        test(`TC_AUTH_03_eachPersonaSignsInOwnsSessionAndGetsAccountSelfService [${persona.name}]`, {
            tag: ['@smoke', '@auth', '@critical'],
            annotation: { type: 'description', description: 'TC_AUTH_03 - Each persona signs in with its company code, '
                + 'owns its dashboard session and is offered account self-service' },
        }, async ({ base }) => {
            const credential = JsonDataReader.credentialFor(persona.key());

            base.step(`Signing in as ${persona.roleName()} (${credential.email})`);
            base.activePersona = persona;
            const login = await base.openLoginPage();
            await login.fillAndSubmit(credential);

            const dashboard = new DashboardPage();
            assertTrue(await dashboard.isLoaded(),
                `Sign-in as ${persona} did not reach the dashboard. Landed on: ${dashboard.currentPath()}`);

            base.step('Verifying the session belongs to the persona that signed in');
            await base.softly().assertEquals(dashboard.currentPath(), AppModule.DASHBOARD.route(),
                'Sign-in did not land on /dashboard');
            await base.softly().assertEquals(await dashboard.signedInUserName(), persona.displayName(),
                'The dashboard greeting names a different user than the one who signed in');
            await base.softly().assertFalse(await login.isErrorDisplayed(),
                'An error banner appeared even though sign-in succeeded');

            base.step('Verifying the avatar menu offers account self-service');
            const items = await dashboard.header().avatarMenuItems();
            base.note(`Menu items offered: [${items.join(', ')}]`);
            for (const action of ['Change Password', 'Update Photo', 'Logout']) {
                await base.softly().assertTrue(items.some(item => item.includes(action)),
                    `${action} is missing from the avatar menu for ${persona}`);
            }

            base.assertAllSoft();
            base.verified(persona.roleName() + ' signed in, owns the session and has account self-service');
        });
    }

    test('TC_AUTH_04_protectedRoutesAreUnreachableBeforeSignInAndAfterLogout', {
        tag: ['@smoke', '@auth', '@security', '@critical'],
        annotation: { type: 'description', description: 'TC_AUTH_04 - Protected routes are unreachable without a '
            + 'session, both before sign-in and after logout' },
    }, async ({ base }) => {
        // Every check here is a security boundary, so all are hard assertions.
        base.step('Deep-linking to the Employee Directory with no session at all');
        await BasePage.navigateTo(AppModule.EMPLOYEE_DIRECTORY);
        const login = new LoginPage();
        assertTrue(await login.isLoaded(),
            `An unauthenticated deep link to ${AppModule.EMPLOYEE_DIRECTORY.route()} `
            + 'was not redirected to the login page');
        assertFalse(await login.displaysTextImmediately(AppModule.EMPLOYEE_DIRECTORY.landingMarker()),
            'Employee Directory content rendered before the redirect completed');

        base.step('Signing in as the Organization Administrator, then logging out');
        const dashboard = await base.loginAs(Persona.ADMIN);
        await dashboard.header().logout();
        assertTrue(await login.isLoaded(), 'Logout did not return the user to the login page');

        // The session must be dead server-side, not merely forgotten by the
        // client. A deep link is the cheapest way to prove it.
        base.step('Deep-linking straight back into the app after logout');
        await BasePage.navigateTo(AppModule.EMPLOYEE_DIRECTORY);
        assertTrue(await login.isLoaded(),
            `The session survived logout - deep-linking to ${AppModule.EMPLOYEE_DIRECTORY.route()} `
            + 'reached the app instead of the login page');

        base.verified('Protected routes are unreachable without a session, before and after logout');
    });
});
