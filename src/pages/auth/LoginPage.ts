import { ConfigManager } from '../../config/ConfigManager';
import { Credential } from '../../data/model/Credential';
import { JsonDataReader } from '../../data/reader/JsonDataReader';
import { Persona } from '../../enums/Persona';
import { FrameworkException } from '../../exceptions/FrameworkException';
import { ElementUtils } from '../../utils/ElementUtils';
import { Log } from '../../utils/Log';
import { MuiUtils } from '../../utils/MuiUtils';
import { WaitUtils } from '../../utils/WaitUtils';
import { BasePage } from '../base/BasePage';
import { DashboardPage } from '../dashboard/DashboardPage';

/**
 * The tenant-scoped sign-in page.
 *
 * Authentication needs three inputs rather than the usual two - the company
 * code selects the tenant - and all three carry stable name attributes, which
 * makes this the one page in the app with genuinely first-class locators.
 */
export class LoginPage extends BasePage {
  /** Message the API returns for every bad-credential combination. */
  static readonly INVALID_CREDENTIALS_MESSAGE = 'Invalid company code, email or password';

  // --- form controls (stable name attributes) ---
  private readonly companyCode = this.page.locator("input[name='tenantCode']");
  private readonly email = this.page.locator("input[name='email']");
  private readonly password = this.page.locator("input[name='password']");
  private readonly signInButton = this.page.locator("button[type='submit']");

  // --- static content ---
  private readonly welcomeHeading = MuiUtils.xpath(this.page, "//*[normalize-space(text())='Welcome Back']");
  // The redesigned page (Nov 2026) renders the logo with an empty alt and the
  // forgot-password help as plain text ("... Contact HR"), not a button.
  private readonly companyLogo = this.page.locator("img[src*='logo']");
  private readonly forgotPassword = MuiUtils.xpath(
    this.page,
    "//*[self::p or self::button][contains(normalize-space(.),'Forgot your password')]",
  );

  // --- feedback ---
  private readonly errorAlert = MuiUtils.xpath(
    this.page,
    "//*[contains(@class,'MuiAlert-root') or @role='alert']" +
      "[contains(.,'Invalid') or contains(.,'incorrect') or contains(.,'failed')]",
  );

  landingMarker(): string {
    return 'Welcome Back';
  }

  route(): string {
    return ConfigManager.get('login.path');
  }

  // ------------------------------------------------------------ rendering

  isCompanyLogoDisplayed(): Promise<boolean> {
    return ElementUtils.isDisplayed(this.companyLogo);
  }

  isWelcomeHeadingDisplayed(): Promise<boolean> {
    return ElementUtils.isDisplayed(this.welcomeHeading);
  }

  async areAllCredentialFieldsDisplayed(): Promise<boolean> {
    return (
      (await ElementUtils.isDisplayed(this.companyCode)) &&
      (await ElementUtils.isDisplayed(this.email)) &&
      (await ElementUtils.isDisplayed(this.password)) &&
      (await ElementUtils.isDisplayed(this.signInButton))
    );
  }

  isForgotPasswordDisplayed(): Promise<boolean> {
    return ElementUtils.isDisplayed(this.forgotPassword);
  }

  /** The password field must mask input - a basic but worthwhile check. */
  async isPasswordMasked(): Promise<boolean> {
    return (await ElementUtils.getAttribute(this.password, 'type')) === 'password';
  }

  // --------------------------------------------------------------- actions

  async enterCompanyCode(companyCode: string): Promise<this> {
    await ElementUtils.type(this.companyCode, companyCode);
    return this;
  }

  async enterEmail(email: string): Promise<this> {
    await ElementUtils.type(this.email, email);
    return this;
  }

  async enterPassword(password: string): Promise<this> {
    await ElementUtils.type(this.password, password);
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
    await ElementUtils.click(this.signInButton);
    if (await this.submissionWasProcessed()) {
      return this;
    }
    Log.warn('The sign-in form did not react to the submit - replaying the full pointer sequence');
    await ElementUtils.clickViaScript(this.signInButton);
    await this.submissionWasProcessed();
    return this;
  }

  /** Waits briefly for the app to either navigate away or reject the attempt. */
  private submissionWasProcessed(): Promise<boolean> {
    return WaitUtils.pollQuietly(
      this.page,
      async () => !this.isStillOnLoginPage() || (await this.errorAlert.count()) > 0,
      10_000,
    );
  }

  /** Fills the form and submits, without checking the outcome. */
  async fillAndSubmit(credential: Credential): Promise<this> {
    await this.enterCompanyCode(credential.companyCode);
    await this.enterEmail(credential.email);
    await this.enterPassword(credential.password);
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
    const credential = JsonDataReader.credentialFor(persona.key);
    Log.step(`Signing in as ${persona} (${credential.email})`);
    await this.open();
    return this.loginWith(credential);
  }

  /**
   * Submits valid credentials on the already-open login page and returns the
   * dashboard. Use fillAndSubmit() for credentials that are expected to be
   * rejected - it stays on this page.
   */
  async loginWith(credential: Credential): Promise<DashboardPage> {
    await this.fillAndSubmit(credential);

    const dashboard = new DashboardPage(this.page);
    let loaded = await dashboard.isLoaded();

    // Signed in, on /dashboard, yet nothing rendered: the app occasionally
    // leaves a blank white page after login. The session is valid, so one
    // reload recovers it. Logged as a warning so a rising rate is visible.
    if (!loaded && this.currentPath().startsWith('/dashboard')) {
      Log.warn('Signed in but the dashboard rendered blank - reloading once');
      await this.page.reload();
      loaded = await dashboard.isLoaded();
    }

    if (!loaded) {
      throw new FrameworkException(
        `Sign-in as ${credential.email} did not reach the dashboard. Current path: ${this.currentPath()}, ` +
          `error on screen: '${await this.errorMessage()}'`,
      );
    }
    Log.pass(`Signed in as ${credential.email}`);
    return dashboard;
  }

  // -------------------------------------------------------- error handling

  /**
   * Waits briefly for the rejection banner and returns its text. Empty when
   * no error appeared, so negative tests can check for the absence of an
   * error just as easily as for its presence.
   */
  async errorMessage(): Promise<string> {
    if (await WaitUtils.isVisibleWithin(this.errorAlert, 10_000)) {
      return ElementUtils.getText(this.errorAlert);
    }
    return '';
  }

  isErrorDisplayed(): Promise<boolean> {
    return WaitUtils.isVisibleWithin(this.errorAlert, 10_000);
  }

  /** True while the browser is still parked on the login route. */
  isStillOnLoginPage(): boolean {
    return this.currentPath().startsWith(this.route());
  }
}
