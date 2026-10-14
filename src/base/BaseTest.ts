import { test as playwrightTest, TestInfo } from '@playwright/test';
import { ConfigManager } from '../config/ConfigManager';
import { DriverManager } from '../driver/DriverManager';
import { AppModule } from '../enums/AppModule';
import { Persona } from '../enums/Persona';
import { AssertionError } from '../exceptions/errors';
import { LoginPage } from '../pages/auth/LoginPage';
import { BasePage } from '../pages/base/BasePage';
import { DashboardPage } from '../pages/dashboard/DashboardPage';
import { EmployeeDirectoryPage } from '../pages/employees/EmployeeDirectoryPage';
import { ReportManager } from '../reporting/ReportManager';
import { Log } from '../utils/Log';
import { ScreenshotUtils } from '../utils/ScreenshotUtils';
import { ReportingSoftAssert } from './ReportingSoftAssert';
import { RetryPolicy } from './RetryPolicy';

/**
 * Lifecycle and helpers shared by every test, handed to each test as the
 * `base` fixture.
 *
 * A FRESH BROWSER SESSION PER TEST, ON PURPOSE
 * --------------------------------------------
 * Each test gets its own browser context and its own login. That costs a few
 * seconds per test and buys three things worth far more: tests can run in any
 * order, a failure cannot cascade into the next test through leftover session
 * state, and the suite parallelises without redesign. In an RBAC suite that
 * repeatedly switches persona, sharing a session would be actively dangerous -
 * a stale admin cookie would silently turn an HR test green.
 */
export class BaseTest {

    /** Persona the current test is signed in as, for logging and teardown. */
    activePersona: Persona | null = null;

    /** Soft checks for the current test; a fresh instance per test. */
    private readonly softAssert = new ReportingSoftAssert();

    constructor(readonly testInfo: TestInfo) {
    }

    // ------------------------------------------------------ session helpers

    /** Signs in and returns the dashboard. */
    async loginAs(persona: Persona): Promise<DashboardPage> {
        this.activePersona = persona;
        return new LoginPage().loginAs(persona);
    }

    /** Signs in and navigates straight to a module. */
    async loginAndOpen(persona: Persona, module: AppModule): Promise<void> {
        await this.loginAs(persona);
        await BasePage.navigateTo(module);
    }

    /** Opens the login page without authenticating. */
    async openLoginPage(): Promise<LoginPage> {
        const login = new LoginPage();
        await login.open();
        return login;
    }

    // ------------------------------------------------------- soft assertions

    /**
     * Soft checks for this test.
     *
     * THE RULE THE SUITE FOLLOWS
     * --------------------------
     * Hard assertions (Assert) guard the checks everything after them depends
     * on: sign-in, a page or dialog being loaded, a record having actually
     * been saved, and security boundaries. Continuing past one of those would
     * only produce noise.
     *
     * Soft assertions cover independent observations - the cards, columns,
     * controls and counts on a screen - so one run reports every one that is
     * wrong rather than stopping at the first. Every test that uses them ends
     * with assertAllSoft().
     */
    softly(): ReportingSoftAssert {
        return this.softAssert;
    }

    /** Raises every soft failure recorded by this test. Call it last. */
    assertAllSoft(): void {
        this.softAssert.assertAll();
    }

    /**
     * Records a soft failure when a page did not load and returns whether it
     * did, so a sweep across several pages can skip one page's checks without
     * abandoning the others.
     */
    async softlyLoaded(page: BasePage, pageName: string): Promise<boolean> {
        const loaded = await page.isLoaded();
        await this.softAssert.assertTrue(loaded, `${pageName} did not load - its checks were skipped`);
        return loaded;
    }

    hasUnreportedSoftFailures(): boolean {
        return this.softAssert.hasUnreportedFailures();
    }

    softFailureCount(): number {
        return this.softAssert.failureCount();
    }

    // ------------------------------------------------ environment guards

    /**
     * Skips the current test when the tenant's plan has no free employee seat.
     *
     * Hitting that ceiling is an environment problem, not a product defect, so
     * it is reported as a skip - a failure would point at the registration
     * form and send whoever triages it looking in the wrong place entirely.
     */
    async skipIfTenantAtEmployeeLimit(directory: EmployeeDirectoryPage): Promise<void> {
        if (await directory.isAtEmployeeLimit()) {
            playwrightTest.skip(true, 'Cannot exercise employee registration: '
                + await directory.employeeLimitMessage()
                + ' Free a seat in the tenant (Employees -> Delete on an AT-prefixed record) and re-run.');
        }
    }

    // ------------------------------------------------------- report logging

    /**
     * Records a numbered step in the report and the console.
     *
     * Tests call this for each logical step so a failed run reads as a
     * narrative rather than a stack trace - the difference between a report a
     * developer can triage and one they ignore.
     */
    step(description: string): void {
        Log.step(description);
        ReportManager.log('info', description);
    }

    /** Records a satisfied expectation. */
    verified(description: string): void {
        Log.pass('VERIFIED: ' + description);
        ReportManager.log('pass', description);
    }

    /** Records context that is neither a step nor an assertion. */
    note(description: string): void {
        Log.info(description);
        ReportManager.log('info', description);
    }
}

function durationOf(testInfo: TestInfo): string {
    return (testInfo.duration / 1000).toFixed(1);
}

/**
 * The test function every spec uses: Playwright's test with the BaseTest
 * lifecycle wired in as fixtures.
 *
 *  retryGate (auto)  applies RetryPolicy before and after every attempt.
 *  base              binds the page to DriverManager, opens the report entry,
 *                    and on the way out takes the outcome screenshots and
 *                    fails any test that recorded soft failures but never
 *                    called assertAllSoft().
 */
export const test = playwrightTest.extend<{ base: BaseTest; retryGate: void }>({

    retryGate: [async ({}, use, testInfo) => {
        RetryPolicy.beforeAttempt(testInfo);
        await use();
        RetryPolicy.afterAttempt(testInfo);
    }, { auto: true }],

    base: async ({ page }, use, testInfo) => {
        DriverManager.set(page);
        ReportManager.setCurrentTest(testInfo);
        const base = new BaseTest(testInfo);

        Log.info('-'.repeat(78));
        Log.info('TEST START: ' + testInfo.title);
        const description = testInfo.annotations.find(annotation => annotation.type === 'description');
        if (description?.description) {
            Log.info('            ' + description.description);
        }

        await use(base);

        // Safety net for a test that recorded soft failures but never called
        // assertAllSoft() - without it those failures would be silently
        // dropped and the test reported green.
        const unreported = testInfo.status === 'passed' && base.hasUnreportedSoftFailures();

        try {
            if (testInfo.status === 'passed' && !unreported) {
                ReportManager.log('pass', `Test passed in ${durationOf(testInfo)}s`);
                if (ConfigManager.getBoolean('screenshot.on.success')) {
                    await ReportManager.logWithScreenshot('pass', 'Final state', 'screenshot.settle.millis');
                }
                Log.pass(`TEST PASSED: ${testInfo.title} (${durationOf(testInfo)}s)`);
            } else if (testInfo.status === 'skipped') {
                ReportManager.log('skip', testInfo.annotations.find(a => a.type === 'skip')?.description
                    ?? 'Skipped');
                Log.warn('TEST SKIPPED: ' + testInfo.title);
            } else {
                ReportManager.log('fail', `Test failed after ${durationOf(testInfo)}s`);
                if (ConfigManager.getBoolean('screenshot.on.failure')) {
                    await ReportManager.logWithScreenshot('fail', 'Screen at the point of failure',
                        'screenshot.settle.millis');
                }
                // A PNG on disk as well as in the report - CI artifacts are
                // easier to browse than an HTML report when a whole run goes red.
                await ScreenshotUtils.captureToFile(testInfo.title);
                Log.error('TEST FAILED: ' + testInfo.title);
                if (testInfo.error?.message) {
                    Log.error('  Reason: ' + testInfo.error.message.split('\n')[0]);
                }
            }
        } finally {
            ReportManager.clearCurrentTest();
            DriverManager.clear();
        }

        if (unreported) {
            Log.error(`${testInfo.title} recorded ${base.softFailureCount()} soft failure(s) `
                + 'but never called assertAllSoft()');
            throw new AssertionError(`${base.softFailureCount()} soft assertion(s) failed and were never `
                + 'reported - see the log');
        }
    },
});

/** Persona-parameterised tests - the Selenium suite's "allPersonas" DataProvider. */
export const ALL_PERSONAS: readonly Persona[] = [Persona.ADMIN, Persona.HR];
