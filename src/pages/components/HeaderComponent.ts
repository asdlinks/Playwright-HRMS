import { ElementUtils } from '../../utils/ElementUtils';
import { Log } from '../../utils/Log';
import { MuiUtils } from '../../utils/MuiUtils';
import { WaitUtils } from '../../utils/WaitUtils';
import type { LoginPage } from '../auth/LoginPage';
import { BaseComponent } from '../base/BaseComponent';
import type { BasePage } from '../base/BasePage';

/**
 * The persistent application header: primary nav, global employee search,
 * theme toggle, notifications and the avatar menu.
 *
 * The avatar button carries no accessible name, so it is located positionally
 * as the last button in the header bar. That is documented here rather than
 * buried in a test, because it is the one locator in the framework that would
 * break if a button were appended to the header.
 */
export class HeaderComponent extends BaseComponent {
  private readonly bar = this.page.locator('header, .MuiAppBar-root');
  private readonly navLinks = this.page.locator('header a[href], .MuiAppBar-root a[href]');
  private readonly globalSearch = this.page.locator("input[placeholder*='Search employees']");
  private readonly themeToggle = this.page.locator(
    "button[aria-label*='light mode'], button[aria-label*='dark mode']",
  );
  private readonly avatarButton = MuiUtils.xpath(
    this.page,
    "(//header//button | //*[contains(@class,'MuiAppBar-root')]//button)[last()]",
  );
  private readonly menuItems = this.page.locator(MuiUtils.MENU_ITEM);
  private readonly menuUpdatePhoto = MuiUtils.xpath(this.page, "//*[@role='menuitem'][contains(.,'Update Photo')]");
  private readonly menuChangePassword = MuiUtils.xpath(this.page, "//*[@role='menuitem'][contains(.,'Change Password')]");
  private readonly menuLogout = MuiUtils.xpath(this.page, "//*[@role='menuitem'][contains(.,'Logout')]");

  // ------------------------------------------------------------ presence

  isDisplayed(): Promise<boolean> {
    return ElementUtils.isDisplayed(this.bar);
  }

  hasGlobalSearch(): Promise<boolean> {
    return ElementUtils.isDisplayed(this.globalSearch);
  }

  hasThemeToggle(): Promise<boolean> {
    return ElementUtils.isDisplayed(this.themeToggle);
  }

  /** Primary nav labels: Dashboard, Time & Leave, Employees, Documents, Settings. */
  navigationLabels(): Promise<string[]> {
    return ElementUtils.distinctTexts(this.navLinks);
  }

  async navigationHrefs(): Promise<string[]> {
    const hrefs = await this.navLinks.evaluateAll((links) => links.map((a) => a.getAttribute('href') ?? ''));
    return [...new Set(hrefs.filter((href) => href.trim() !== ''))];
  }

  async hasNavigationItem(label: string): Promise<boolean> {
    return (await this.navigationLabels()).some((item) => item.toLowerCase() === label.toLowerCase());
  }

  /**
   * Follows a header link and returns the page it leads to, once loaded:
   *
   *   const directory = await page.header().goTo('Employees', new EmployeeDirectoryPage(page));
   */
  async goTo<T extends BasePage>(label: string, destination: T): Promise<T> {
    Log.step(`Header navigation -> ${label}`);
    await ElementUtils.click(MuiUtils.xpath(this.page, `//header//a[normalize-space(.)=${MuiUtils.escapeForXPath(label)}]`));
    await WaitUtils.waitForDataToSettle(this.page);
    await destination.isLoaded();
    return destination;
  }

  // -------------------------------------------------------- avatar menu

  /**
   * Opens the account menu.
   *
   * Two hazards, both seen in practice:
   *  - an open dialog or drawer swallows the click, so overlays are cleared
   *    first;
   *  - the avatar is an icon button in a header that re-renders as
   *    notifications resolve, so a native click is sometimes absorbed. The
   *    menu appearing is the post-condition, and the scripted pointer
   *    sequence is the retry.
   */
  private async openAvatarMenu(): Promise<void> {
    await MuiUtils.dismissOverlays(this.page);
    await ElementUtils.click(this.avatarButton);
    if (await WaitUtils.isVisibleWithin(this.menuItems, 5_000)) {
      return;
    }
    Log.warn('The account menu did not open on the native click - replaying the full pointer sequence');
    await ElementUtils.clickViaScript(this.avatarButton);
    await WaitUtils.waitForVisible(this.menuItems);
  }

  async avatarMenuItems(): Promise<string[]> {
    await this.openAvatarMenu();
    const items = (await this.menuItems.allInnerTexts()).map((t) => t.trim());
    await ElementUtils.pressEscape(this.page);
    return items;
  }

  hasChangePasswordOption(): Promise<boolean> {
    return ElementUtils.isDisplayed(this.menuChangePassword);
  }

  hasUpdatePhotoOption(): Promise<boolean> {
    return ElementUtils.isDisplayed(this.menuUpdatePhoto);
  }

  /**
   * Signs out and waits for the login page.
   *
   * Logout clears the auth cookie server-side and the SPA replaces the shell,
   * so waiting for the login form - not just a URL change - is what makes
   * this reliable.
   */
  async logout(): Promise<LoginPage> {
    Log.step('Logging out');
    const companyCodeField = this.page.locator("input[name='tenantCode']");

    await this.openAvatarMenu();
    await ElementUtils.click(this.menuLogout);

    if (!(await WaitUtils.isVisibleWithin(companyCodeField, 10_000))) {
      // The menu item click can be absorbed like every other click in this
      // app. Ending up still signed in is expensive - the next persona's
      // sign-in would silently run against the previous session.
      Log.warn('Sign-out did not take on the native click - retrying');
      if (!(await ElementUtils.isDisplayed(this.menuItems))) {
        await this.openAvatarMenu();
      }
      await ElementUtils.clickViaScript(this.menuLogout);
      await WaitUtils.waitForVisible(companyCodeField);
    }

    // Loaded lazily: LoginPage extends BasePage, and BasePage creates this
    // component, so a top-level import would make a circular class
    // dependency that breaks at module load (Java does not have this issue).
    const { LoginPage: LoginPageClass } = await import('../auth/LoginPage');
    return new LoginPageClass(this.page);
  }
}
