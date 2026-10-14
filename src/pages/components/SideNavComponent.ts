import { DriverManager } from '../../driver/DriverManager';
import { WaitTimeoutError } from '../../exceptions/errors';
import { ElementUtils } from '../../utils/ElementUtils';
import { Log } from '../../utils/Log';
import { MuiUtils } from '../../utils/MuiUtils';
import { WaitUtils } from '../../utils/WaitUtils';

const xpath = MuiUtils.xpath;

/**
 * The contextual left rail that appears inside a module.
 *
 * Its contents change with the section - Employees shows Department /
 * Organization Structure / My Team, Time & Leave shows Leaves / Shifts /
 * Kiosk Devices and so on - and entries are filtered by permission, which
 * makes this component a second RBAC surface alongside route guards.
 */
export class SideNavComponent {

    private static readonly SIDE_NAV_LINKS =
        xpath('//main/preceding-sibling::*//a[@href] | //aside//a[@href] | //nav//a[@href]');
    private static readonly COLLAPSE_BUTTON =
        "button[aria-label='Collapse'], button[title='Collapse']";

    async isDisplayed(): Promise<boolean> {
        return ElementUtils.isPresent(SideNavComponent.SIDE_NAV_LINKS);
    }

    async itemLabels(): Promise<string[]> {
        const labels = (await ElementUtils.textsOf(SideNavComponent.SIDE_NAV_LINKS)).filter(text => text !== '');
        return [...new Set(labels)];
    }

    async itemRoutes(): Promise<string[]> {
        const routes = (await ElementUtils.attributesOf(SideNavComponent.SIDE_NAV_LINKS, 'href'))
            .filter((href): href is string => href !== null && href.startsWith('/'));
        return [...new Set(routes)];
    }

    async hasItem(label: string): Promise<boolean> {
        return (await this.itemLabels()).some(item => item.toLowerCase() === label.toLowerCase());
    }

    async linksToRoute(route: string): Promise<boolean> {
        return (await this.itemRoutes()).includes(route);
    }

    async clickItem(label: string): Promise<void> {
        Log.step('Side navigation -> ' + label);
        const link = xpath(`//a[@href][normalize-space(.)=${MuiUtils.escapeForXPath(label)}]`);
        const urlBefore = DriverManager.get().url();
        await ElementUtils.click(link);

        // A native click can be absorbed without effect; the URL not changing
        // is the observable sign, so replay the full pointer sequence once.
        if (!await this.urlChangesFrom(urlBefore)) {
            Log.warn(`The rail link '${label}' did not navigate on the native click - `
                + 'replaying the full pointer sequence');
            await ElementUtils.clickViaScript(link);
            await this.urlChangesFrom(urlBefore);
        }
        await WaitUtils.waitForDataToSettle();
    }

    private async urlChangesFrom(urlBefore: string): Promise<boolean> {
        try {
            await WaitUtils.fluently(async () => DriverManager.get().url() !== urlBefore, 6000, 'URL did not change');
            return true;
        } catch (e) {
            if (e instanceof WaitTimeoutError) {
                return false;
            }
            throw e;
        }
    }

    async collapse(): Promise<void> {
        if (await ElementUtils.isDisplayed(SideNavComponent.COLLAPSE_BUTTON)) {
            await ElementUtils.click(SideNavComponent.COLLAPSE_BUTTON);
        }
    }
}
