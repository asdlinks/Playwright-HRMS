import { ElementUtils } from '../../utils/ElementUtils';
import { Log } from '../../utils/Log';
import { MuiUtils } from '../../utils/MuiUtils';
import { WaitUtils } from '../../utils/WaitUtils';
import { BaseComponent } from '../base/BaseComponent';
import type { BasePage } from '../base/BasePage';

/**
 * The contextual left rail that appears inside a module.
 *
 * Its contents change with the section - Employees shows Department /
 * Organization Structure / My Team, Time & Leave shows Leaves / Shifts /
 * Kiosk Devices and so on - and entries are filtered by permission, which
 * makes this component a second RBAC surface alongside route guards.
 */
export class SideNavComponent extends BaseComponent {
  private readonly links = MuiUtils.xpath(
    this.page,
    '//main/preceding-sibling::*//a[@href] | //aside//a[@href] | //nav//a[@href]',
  );

  async isDisplayed(): Promise<boolean> {
    return (await this.links.count()) > 0;
  }

  itemLabels(): Promise<string[]> {
    return ElementUtils.distinctTexts(this.links);
  }

  async itemRoutes(): Promise<string[]> {
    const hrefs = await this.links.evaluateAll((links) => links.map((a) => a.getAttribute('href') ?? ''));
    return [...new Set(hrefs.filter((href) => href.startsWith('/')))];
  }

  async hasItem(label: string): Promise<boolean> {
    return (await this.itemLabels()).some((item) => item.toLowerCase() === label.toLowerCase());
  }

  async linksToRoute(route: string): Promise<boolean> {
    return (await this.itemRoutes()).includes(route);
  }

  /**
   * Follows a rail link and returns the page it leads to, once loaded:
   *
   *   const departments = await page.sideNav().goTo('Department', new DepartmentPage(page));
   */
  async goTo<T extends BasePage>(label: string, destination: T): Promise<T> {
    Log.step(`Side navigation -> ${label}`);
    const link = MuiUtils.xpath(this.page, `//a[@href][normalize-space(.)=${MuiUtils.escapeForXPath(label)}]`);
    const urlBefore = this.page.url();
    await ElementUtils.click(link);

    // A native click can be absorbed without effect; the URL not changing is
    // the observable sign, so replay the full pointer sequence once.
    if (!(await this.urlChangesFrom(urlBefore))) {
      Log.warn(`The rail link '${label}' did not navigate on the native click - replaying the full pointer sequence`);
      await ElementUtils.clickViaScript(link);
      await this.urlChangesFrom(urlBefore);
    }
    await WaitUtils.waitForDataToSettle(this.page);
    await destination.isLoaded();
    return destination;
  }

  private urlChangesFrom(urlBefore: string): Promise<boolean> {
    return WaitUtils.pollQuietly(this.page, async () => this.page.url() !== urlBefore, 6_000);
  }
}
