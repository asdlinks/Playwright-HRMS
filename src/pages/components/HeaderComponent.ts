import { ElementUtils } from '../../utils/ElementUtils';
import { Log } from '../../utils/Log';
import { MuiUtils } from '../../utils/MuiUtils';
import { WaitUtils } from '../../utils/WaitUtils';

const xpath = MuiUtils.xpath;

/**
 * The persistent application header: primary nav, global employee search,
 * theme toggle, notifications and the avatar menu.
 *
 * The avatar button carries no accessible name, so it is located positionally
 * as the last button in the header bar. That is documented here rather than
 * buried in a test, because it is the one locator in the framework that would
 * break if a button were appended to the header.
 */
export class HeaderComponent {

    private static readonly HEADER = 'header, .MuiAppBar-root';
    private static readonly NAV_LINKS = 'header a[href], .MuiAppBar-root a[href]';
    private static readonly GLOBAL_SEARCH = "input[placeholder*='Search employees']";
    private static readonly THEME_TOGGLE =
        "button[aria-label*='light mode'], button[aria-label*='dark mode']";
    private static readonly AVATAR_BUTTON =
        xpath("(//header//button | //*[contains(@class,'MuiAppBar-root')]//button)[last()]");

    private static readonly MENU_UPDATE_PHOTO = xpath("//*[@role='menuitem'][contains(.,'Update Photo')]");
    private static readonly MENU_CHANGE_PASSWORD = xpath("//*[@role='menuitem'][contains(.,'Change Password')]");
    private static readonly MENU_LOGOUT = xpath("//*[@role='menuitem'][contains(.,'Logout')]");

    // ------------------------------------------------------------ presence

    async isDisplayed(): Promise<boolean> {
        return ElementUtils.isDisplayed(HeaderComponent.HEADER);
    }

    async hasGlobalSearch(): Promise<boolean> {
        return ElementUtils.isDisplayed(HeaderComponent.GLOBAL_SEARCH);
    }

    async hasThemeToggle(): Promise<boolean> {
        return ElementUtils.isDisplayed(HeaderComponent.THEME_TOGGLE);
    }

    /** Primary nav labels: Dashboard, Time & Leave, Employees, Documents, Settings. */
    async navigationLabels(): Promise<string[]> {
        const labels = (await ElementUtils.textsOf(HeaderComponent.NAV_LINKS)).filter(text => text !== '');
        return [...new Set(labels)];
    }

    async navigationHrefs(): Promise<string[]> {
        const hrefs = (await ElementUtils.attributesOf(HeaderComponent.NAV_LINKS, 'href'))
            .filter((href): href is string => href !== null && href.trim() !== '');
        return [...new Set(hrefs)];
    }

    async hasNavigationItem(label: string): Promise<boolean> {
        return (await this.navigationLabels()).some(item => item.toLowerCase() === label.toLowerCase());
    }

    async clickNavigationItem(label: string): Promise<void> {
        Log.step('Header navigation -> ' + label);
        await ElementUtils.click(xpath(`//header//a[normalize-space(.)=${MuiUtils.escapeForXPath(label)}]`));
        await WaitUtils.waitForDataToSettle();
    }

    // ------------------------------------------------------- global search

    async searchEmployee(query: string): Promise<void> {
        Log.step(`Global search for '${query}'`);
        await ElementUtils.type(HeaderComponent.GLOBAL_SEARCH, query);
        await WaitUtils.sleepQuietly(800);
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
    async openAvatarMenu(): Promise<void> {
        await MuiUtils.dismissOverlays();

        await ElementUtils.click(HeaderComponent.AVATAR_BUTTON);
        if (await WaitUtils.isVisibleWithin(MuiUtils.MENU_ITEM, 5000)) {
            return;
        }

        Log.warn('The account menu did not open on the native click - replaying the full pointer sequence');
        await ElementUtils.clickViaScript(HeaderComponent.AVATAR_BUTTON);
        await WaitUtils.waitForVisible(MuiUtils.MENU_ITEM);
    }

    async avatarMenuItems(): Promise<string[]> {
        await this.openAvatarMenu();
        const items = await ElementUtils.textsOf(MuiUtils.MENU_ITEM);
        await ElementUtils.pressEscape();
        return items;
    }

    async hasChangePasswordOption(): Promise<boolean> {
        return ElementUtils.isDisplayed(HeaderComponent.MENU_CHANGE_PASSWORD);
    }

    async hasUpdatePhotoOption(): Promise<boolean> {
        return ElementUtils.isDisplayed(HeaderComponent.MENU_UPDATE_PHOTO);
    }

    /**
     * Signs out and waits for the login page.
     *
     * Logout clears the auth cookie server-side and the SPA replaces the shell,
     * so waiting for the login form - not just a URL change - is what makes
     * this reliable.
     */
    async logout(): Promise<void> {
        Log.step('Logging out');
        const companyCodeField = "input[name='tenantCode']";

        await this.openAvatarMenu();
        await ElementUtils.click(HeaderComponent.MENU_LOGOUT);

        if (await WaitUtils.isVisibleWithin(companyCodeField, 10000)) {
            return;
        }

        // The menu item click can be absorbed like every other click in this
        // app. Reopening and replaying the pointer sequence is cheap; ending up
        // still signed in is not - the next persona's sign-in would silently
        // run against the previous session.
        Log.warn('Sign-out did not take on the native click - retrying');
        if (!await ElementUtils.isDisplayed(MuiUtils.MENU_ITEM)) {
            await this.openAvatarMenu();
        }
        await ElementUtils.clickViaScript(HeaderComponent.MENU_LOGOUT);
        await WaitUtils.waitForVisible(companyCodeField);
    }
}
