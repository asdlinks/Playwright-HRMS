import { ConfigManager } from '../../config/ConfigManager';
import { Credential } from '../../data/model/Credential';
import { JsonDataReader } from '../../data/reader/JsonDataReader';
import { DriverManager } from '../../driver/DriverManager';
import { Persona } from '../../enums/Persona';
import { IllegalStateError, WaitTimeoutError } from '../../exceptions/errors';
import { ElementUtils } from '../../utils/ElementUtils';
import { Log } from '../../utils/Log';
import { MuiUtils } from '../../utils/MuiUtils';
import { WaitUtils } from '../../utils/WaitUtils';
import { BasePage } from '../base/BasePage';
import { DashboardPage } from '../dashboard/DashboardPage';

const xpath = MuiUtils.xpath;

/**
 * The tenant-scoped sign-in page.
 *
 * Authentication needs three inputs rather than the usual two - the company
 * code selects the tenant - and all three carry stable name attributes, which
 * makes this the one page in the app with genuinely first-class locators.
 */
export class LoginPage extends BasePage {

    // --- form controls (stable name attributes) ---
    private static readonly COMPANY_CODE = "input[name='tenantCode']";
    private static readonly EMAIL = "input[name='email']";
    private static readonly PASSWORD = "input[name='password']";
    private static readonly SIGN_IN_BUTTON = "button[type='submit']";

    // --- static content ---
    private static readonly WELCOME_HEADING = xpath("//*[normalize-space(text())='Welcome Back']");
    private static readonly COMPANY_LOGO = "img[alt='Company Logo']";
    private static readonly FORGOT_PASSWORD =
        xpath("//button[contains(normalize-space(.),'Forgot your password')]");

    // --- feedback ---
    private static readonly ERROR_ALERT =
        xpath("//*[contains(@class,'MuiAlert-root') or @role='alert']"
            + "[contains(.,'Invalid') or contains(.,'incorrect') or contains(.,'failed')]");

    /** Message the API returns for every bad-credential combination. */
    static readonly INVALID_CREDENTIALS_MESSAGE = 'Invalid company code, email or password';

    landingMarker(): string {
        return 'Welcome Back';
    }

    route(): string {
        return ConfigManager.get('login.path');
    }

    // ------------------------------------------------------------ rendering

    async isCompanyLogoDisplayed(): Promise<boolean> {
        return ElementUtils.isDisplayed(LoginPage.COMPANY_LOGO);
    }

    async isWelcomeHeadingDisplayed(): Promise<boolean> {
        return ElementUtils.isDisplayed(LoginPage.WELCOME_HEADING);
    }

    async areAllCredentialFieldsDisplayed(): Promise<boolean> {
        return await ElementUtils.isDisplayed(LoginPage.COMPANY_CODE)
            && await ElementUtils.isDisplayed(LoginPage.EMAIL)
            && await ElementUtils.isDisplayed(LoginPage.PASSWORD)
            && await ElementUtils.isDisplayed(LoginPage.SIGN_IN_BUTTON);
    }

    async isForgotPasswordDisplayed(): Promise<boolean> {
        return ElementUtils.isDisplayed(LoginPage.FORGOT_PASSWORD);
    }

    /** The password field must mask input - a basic but worthwhile check. */
    async isPasswordMasked(): Promise<boolean> {
        return (await ElementUtils.getAttribute(LoginPage.PASSWORD, 'type')) === 'password';
    }

    // --------------------------------------------------------------- actions

    async enterCompanyCode(companyCode: string): Promise<this> {
        await ElementUtils.type(LoginPage.COMPANY_CODE, companyCode);
        return this;
    }

    async enterEmail(email: string): Promise<this> {
        await ElementUtils.type(LoginPage.EMAIL, email);
        return this;
    }

    async enterPassword(password: string): Promise<this> {
        await ElementUtils.type(LoginPage.PASSWORD, password);
        return this;
    }

    /**
     * Submits the form and confirms the app actually reacted.
     *
     * A sign-in has exactly two legitimate outcomes: the browser leaves the
     * login route, or a rejection banner appears. Seeing NEITHER means the
     * click never reached React - and the symptom of that is brutal to
     * diagnose, because the test reports "sign-in failed" with an empty error
     * message while the credentials were perfectly good. The retry replays the
     * full pointer sequence.
     */
    async submit(): Promise<this> {
        Log.step('Submitting the sign-in form');
        await ElementUtils.click(LoginPage.SIGN_IN_BUTTON);

        if (await this.submissionWasProcessed()) {
            return this;
        }

        Log.warn('The sign-in form did not react to the submit - replaying the full pointer sequence');
        await ElementUtils.clickViaScript(LoginPage.SIGN_IN_BUTTON);
        await this.submissionWasProcessed();
        return this;
    }

    /** Waits briefly for the app to either navigate away or reject the attempt. */
    private async submissionWasProcessed(): Promise<boolean> {
        try {
            await WaitUtils.fluently(
                async () => !this.isStillOnLoginPage() || await ElementUtils.isPresent(LoginPage.ERROR_ALERT),
                10000, 'The sign-in form neither navigated nor raised an error');
            return true;
        } catch (e) {
            if (e instanceof WaitTimeoutError) {
                return false;
            }
            throw e;
        }
    }

    /** Fills the form and submits, without asserting the outcome. */
    async fillAndSubmit(credentialOrCompanyCode: Credential | string, email?: string, password?: string): Promise<this> {
        if (credentialOrCompanyCode instanceof Credential) {
            return this.fillAndSubmit(credentialOrCompanyCode.companyCode,
                credentialOrCompanyCode.email, credentialOrCompanyCode.password);
        }
        await this.enterCompanyCode(credentialOrCompanyCode);
        await this.enterEmail(email ?? '');
        await this.enterPassword(password ?? '');
        return this.submit();
    }

    // ------------------------------------------------------- happy path API

    /**
     * Signs in as a persona and waits for the dashboard.
     *
     * The single entry point used by test setup, so credentials are resolved
     * from the dataset in exactly one place.
     */
    async loginAs(persona: Persona): Promise<DashboardPage> {
        const credential = JsonDataReader.credentialFor(persona.key());
        Log.step(`Signing in as ${persona} (${credential.email})`);

        await this.open();
        await this.fillAndSubmit(credential);

        const dashboard = new DashboardPage();
        let loaded = await dashboard.isLoaded();

        // Signed in, on /dashboard, yet nothing rendered: the app occasionally
        // leaves a blank white page after login. The session is valid, so one
        // reload recovers it. Logged as a warning so a rising rate is visible
        // in the report rather than silently absorbed.
        if (!loaded && this.currentPath().startsWith('/dashboard')) {
            Log.warn('Signed in but the dashboard rendered blank - reloading once');
            await DriverManager.get().reload();
            loaded = await dashboard.isLoaded();
        }

        if (!loaded) {
            throw new IllegalStateError(
                `Sign-in as ${persona} did not reach the dashboard. Current path: `
                + `${this.currentPath()}, error on screen: '${await this.errorMessage()}'`);
        }
        Log.pass('Signed in as ' + persona);
        return dashboard;
    }

    // -------------------------------------------------------- error handling

    /**
     * Waits briefly for the rejection banner and returns its text.
     * Empty string when no error appeared, so negative tests can assert on the
     * absence of an error just as easily as on its presence.
     */
    async errorMessage(): Promise<string> {
        if (await WaitUtils.isVisibleWithin(LoginPage.ERROR_ALERT, 10000)) {
            return ElementUtils.getText(LoginPage.ERROR_ALERT);
        }
        return '';
    }

    async isErrorDisplayed(): Promise<boolean> {
        return WaitUtils.isVisibleWithin(LoginPage.ERROR_ALERT, 10000);
    }

    /** True while the browser is still parked on the login route. */
    isStillOnLoginPage(): boolean {
        return this.currentPath().startsWith(this.route());
    }
}
