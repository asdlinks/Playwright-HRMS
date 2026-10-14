import { ConfigManager } from '../../config/ConfigManager';
import { AppModule } from '../../enums/AppModule';
import { SettingsPanel } from '../../enums/SettingsPanel';
import { WaitStrategy } from '../../enums/WaitStrategy';
import { WaitTimeoutError } from '../../exceptions/errors';
import { ElementUtils } from '../../utils/ElementUtils';
import { Log } from '../../utils/Log';
import { MuiUtils } from '../../utils/MuiUtils';
import { WaitUtils } from '../../utils/WaitUtils';
import { BasePage } from '../base/BasePage';

const xpath = MuiUtils.xpath;

/**
 * Settings.
 *
 * One route, many panels. The left rail is built from the signed-in user's
 * permissions, so which entries exist is the RBAC assertion here - an
 * Administrator sees twelve, HR sees four.
 *
 * TWO THINGS THAT BITE HERE
 * -------------------------
 *  1. The rail entry's text lives in a SPAN, but the click handler is on an
 *     ancestor row. Clicking the span does nothing, so every activation
 *     resolves the clickable ancestor first.
 *
 *  2. The rail label stays on screen whether or not the panel opened, so
 *     "is the label visible?" cannot verify a panel opened. Verification goes
 *     through the panel's own content heading instead, which differs from the
 *     rail label for half of them ("Account Security" opens "Password
 *     Management").
 */
export class SettingsPage extends BasePage {

    private static readonly RAIL_ENTRIES =
        xpath("//main//*[self::li or contains(@class,'MuiListItemButton-root')]//span[normalize-space(text())]");

    /** Heading rendered by the currently open panel, on the right-hand side. */
    private static readonly PANEL_HEADING = 'main h6, main .MuiTypography-h6, main h5';

    landingMarker(): string {
        return AppModule.SETTINGS.landingMarker();
    }

    route(): string {
        return AppModule.SETTINGS.route();
    }

    // ------------------------------------------------------ panel visibility

    async hasPanel(panel: SettingsPanel | string): Promise<boolean> {
        const label = typeof panel === 'string' ? panel : panel.label();
        return ElementUtils.isPresent(this.railLabelLocator(label));
    }

    /** Every rail label currently rendered, in order. */
    async visiblePanelLabels(): Promise<string[]> {
        const labels = (await ElementUtils.textsOf(SettingsPage.RAIL_ENTRIES)).filter(text => text !== '');
        return [...new Set(labels)];
    }

    /** Group headers (ORGANIZATION, ATTENDANCE, PAYROLL, SECURITY, ADVANCED). */
    async hasGroup(groupName: string): Promise<boolean> {
        return this.displaysTextImmediately(groupName);
    }

    // -------------------------------------------------------------- opening

    /**
     * Activates a rail entry and waits for the panel to actually render.
     *
     * For an entry that navigates away (Audit & Compliance) this delegates to
     * activateNavigationEntry().
     */
    async openPanel(panel: SettingsPanel): Promise<this> {
        Log.step(`Opening the '${panel.label()}' settings panel`);

        if (panel.isNavigationLink()) {
            return this.activateNavigationEntry(panel);
        }

        // Activated with a scripted click, and retried once.
        //
        // The rail rows are plain divs carrying a React onClick. For entries
        // low in the rail - the ADVANCED group - a native click lands while
        // the row is still settling from scrollIntoView and is absorbed
        // without the handler firing: the row takes the selected highlight but
        // the right-hand panel never changes. A scripted click dispatches the
        // event straight at the element, which React's synthetic handler
        // receives regardless of where the row happens to be on screen.
        for (let attempt = 1; attempt <= 2; attempt++) {
            await ElementUtils.clickViaScript(
                await ElementUtils.find(await this.clickableRailEntry(panel.label()), WaitStrategy.PRESENT));
            if (await this.waitForPanelHeading(panel.contentHeading()!)) {
                break;
            }
            Log.warn(`The '${panel.label()}' panel did not open on attempt ${attempt} - retrying`);
        }

        await WaitUtils.waitForDataToSettle();
        // Long panels render below the fold; scrolling up keeps the heading in
        // view so assertions read what they expect to read.
        await ElementUtils.scrollToTop();
        return this;
    }

    /** Activates a rail entry that routes away from /settings. */
    async activateNavigationEntry(panel: SettingsPanel): Promise<this> {
        Log.step(`Activating the '${panel.label()}' entry (navigates to ${panel.navigatesTo()})`);
        await ElementUtils.clickViaScript(
            await ElementUtils.find(await this.clickableRailEntry(panel.label()), WaitStrategy.PRESENT));
        await WaitUtils.waitForAppShell();
        await WaitUtils.waitForDataToSettle();
        return this;
    }

    /** Heading of the panel currently displayed on the right. */
    async openPanelHeading(): Promise<string> {
        return await ElementUtils.isPresent(SettingsPage.PANEL_HEADING)
            ? ElementUtils.getText(SettingsPage.PANEL_HEADING)
            : '';
    }

    /**
     * True once the named panel is genuinely on screen.
     *
     * Compares the rendered panel heading rather than searching page text -
     * a text search would match the rail label and pass even if the click
     * never took effect.
     */
    async isPanelOpen(panel: SettingsPanel): Promise<boolean> {
        if (panel.isNavigationLink()) {
            return this.currentPath().startsWith(panel.navigatesTo()!);
        }
        return this.waitForPanelHeading(panel.contentHeading()!);
    }

    private async waitForPanelHeading(expectedHeading: string): Promise<boolean> {
        try {
            await WaitUtils.fluently(async () => (await this.openPanelHeading()) === expectedHeading,
                ConfigManager.explicitWait(), `The panel heading never became '${expectedHeading}'`);
            return true;
        } catch (e) {
            if (!(e instanceof WaitTimeoutError)) {
                throw e;
            }
            Log.warn(`Panel heading is '${await this.openPanelHeading()}', expected '${expectedHeading}'`);
            return false;
        }
    }

    // ------------------------------------------- Roles & Permissions panel

    /** Role names listed on the Roles & Permissions panel. */
    async listsRole(roleName: string): Promise<boolean> {
        return ElementUtils.waitForPageText(roleName, 12000);
    }

    /** Expands a role accordion to reveal its permission grants. */
    async expandRole(roleName: string): Promise<this> {
        Log.step(`Expanding the '${roleName}' role`);
        await ElementUtils.click(xpath("//*[contains(@class,'MuiAccordionSummary-root')]"
            + `[contains(normalize-space(.),${MuiUtils.escapeForXPath(roleName)})]`));
        await WaitUtils.waitForDataToSettle();
        return this;
    }

    /** User count chip beside a role, e.g. 1 from "HR Administrator 1 user". */
    async userCountFor(roleName: string): Promise<number> {
        const result = await this.page().evaluate(role => {
            const leaf = [...document.querySelectorAll('main div,main span,main p,main h6')]
                .find(e => e.children.length === 0 && (e.textContent || '').trim() === role);
            if (!leaf) return null;
            let node: HTMLElement | null = leaf as HTMLElement;
            for (let hop = 0; hop < 3 && node; hop++) {
                node = node.parentElement;
                if (!node) break;
                const match = (node.innerText || '').match(/(\d+)\s+users?/);
                if (match) return match[1];
            }
            return null;
        }, roleName);
        return result === null ? -1 : Number.parseInt(result, 10);
    }

    // ------------------------------------------------------------- locators

    /** The span carrying the rail label - used for presence checks. */
    private railLabelLocator(label: string): string {
        return xpath(`//main//*[normalize-space(text())=${MuiUtils.escapeForXPath(label)}]`);
    }

    /**
     * The clickable row that owns the rail label.
     *
     * The label itself is an inert span; MUI binds the handler to the list-item
     * row above it. Falls back to the label when no such ancestor exists, so a
     * markup change degrades instead of throwing.
     */
    private async clickableRailEntry(label: string): Promise<string> {
        const escaped = MuiUtils.escapeForXPath(label);
        const clickableAncestor = xpath(`//main//*[normalize-space(text())=${escaped}]`
            + "/ancestor-or-self::*[self::li or self::button or @role='button'"
            + " or contains(@class,'MuiListItemButton-root')][1]");
        return await ElementUtils.isPresent(clickableAncestor)
            ? clickableAncestor
            : this.railLabelLocator(label);
    }

    /** Exposed so tests can report what a persona actually sees. */
    async currentPanelHeadingOrBlank(): Promise<string> {
        return await ElementUtils.isDisplayed(SettingsPage.PANEL_HEADING)
            ? (await (await ElementUtils.find(SettingsPage.PANEL_HEADING, WaitStrategy.VISIBLE)).innerText()).trim()
            : '';
    }
}
