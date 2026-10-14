import type { Page } from '@playwright/test';
import { ConfigManager } from '../../config/ConfigManager';
import { DriverManager } from '../../driver/DriverManager';
import { AppModule } from '../../enums/AppModule';
import { WaitTimeoutError } from '../../exceptions/errors';
import { ElementUtils } from '../../utils/ElementUtils';
import { Log } from '../../utils/Log';
import { MuiUtils } from '../../utils/MuiUtils';
import { WaitUtils } from '../../utils/WaitUtils';

/**
 * Shared behaviour for every page object.
 *
 * Page objects expose intent ("openHolidayCalendar", "approveLeaveFor") and
 * return other page objects or plain values. They never assert - assertions
 * belong to tests, so the same page object can serve a positive and a negative
 * test without contortion.
 */
export abstract class BasePage {

    protected static readonly PAGE_HEADING = 'main h1, main h4, main .MuiTypography-h4';

    protected page(): Page {
        return DriverManager.get();
    }

    /**
     * Text that proves this specific page rendered. Subclasses return the
     * heading or subtitle unique to them.
     */
    abstract landingMarker(): string;

    /** Route this page lives at, e.g. /employees. */
    abstract route(): string;

    // --------------------------------------------------------- navigation

    /** Hard-navigates to this page's route and waits for the shell to boot. */
    async open(): Promise<void> {
        const url = ConfigManager.urlFor(this.route());
        Log.step('Navigating to ' + url);
        await this.page().goto(url);
        await WaitUtils.waitForAppShell();
        await WaitUtils.waitForDataToSettle();
    }

    static async navigateTo(module: AppModule): Promise<void> {
        const url = ConfigManager.urlFor(module.route());
        Log.step(`Navigating to ${module.name} (${url})`);
        await DriverManager.get().goto(url);
        await WaitUtils.waitForAppShell();
        await WaitUtils.waitForDataToSettle();
        await MuiUtils.dismissCheckInReminderIfShown();
    }

    // ---------------------------------------------------------- page state

    currentUrl(): string {
        return this.page().url();
    }

    /** Path portion of the current URL, e.g. /dashboard. */
    currentPath(): string {
        const url = this.currentUrl();
        const base = ConfigManager.baseUrl();
        return url.startsWith(base) ? url.substring(base.length) : url;
    }

    async pageTitle(): Promise<string> {
        return this.page().title();
    }

    async heading(): Promise<string> {
        return await ElementUtils.isPresent(BasePage.PAGE_HEADING)
            ? ElementUtils.getText(BasePage.PAGE_HEADING)
            : '';
    }

    /**
     * True when this page's landing marker is on screen.
     *
     * Deliberately content-based rather than URL-based: in a client-side
     * routed app the URL updates before the view finishes fetching, so a URL
     * check alone would pass while the page is still blank.
     */
    async isLoaded(): Promise<boolean> {
        return ElementUtils.waitForPageText(this.landingMarker(), ConfigManager.explicitWait());
    }

    async isLoadedWithin(timeoutMillis: number): Promise<boolean> {
        return ElementUtils.waitForPageText(this.landingMarker(), timeoutMillis);
    }

    /** Visible text of the main region - used for coarse content assertions. */
    async contentText(): Promise<string> {
        return ElementUtils.mainContentText();
    }

    async displaysText(text: string): Promise<boolean> {
        return ElementUtils.waitForPageText(text, 10000);
    }

    async displaysTextImmediately(text: string): Promise<boolean> {
        return ElementUtils.pageContainsText(text);
    }

    // ------------------------------------------------------------- helpers

    protected async clickButton(buttonText: string): Promise<void> {
        Log.step('Clicking button: ' + buttonText);
        await ElementUtils.click(MuiUtils.buttonByText(buttonText));
    }

    protected async hasButton(buttonText: string): Promise<boolean> {
        return ElementUtils.isDisplayed(MuiUtils.buttonByText(buttonText));
    }

    protected async waitForSettled(): Promise<void> {
        await WaitUtils.waitForDataToSettle();
    }

    /**
     * Reads the numeric value of one of the KPI cards at the top of a module
     * page ("Total Employees 5", "Departments 2", "Total Workforce 5" ...).
     *
     * The cards are plain nested divs with no class hook and no fixed
     * label/value nesting, so this walks up from the label to the nearest
     * ancestor that also contains a number and extracts it. Doing that in one
     * scripted pass is both faster and far less brittle than an XPath that has
     * to guess the card's exact shape.
     *
     * @return the card value, or -1 when no such card is on screen
     */
    async readKpiCard(cardLabel: string): Promise<number> {
        const result = await this.page().evaluate(label => {
            const leaves = [...document.querySelectorAll('div,span,p,h6')]
                .filter(e => e.children.length === 0 && (e.textContent || '').trim() === label);
            for (const leaf of leaves) {
                let node: HTMLElement | null = leaf as HTMLElement;
                for (let hop = 0; hop < 4 && node; hop++) {
                    node = node.parentElement;
                    if (!node) break;
                    const text = (node.innerText || '').replace(label, ' ');
                    const match = text.match(/\b\d[\d,]*\b/);
                    if (match) return match[0].replace(/,/g, '');
                }
            }
            return null;
        }, cardLabel);

        if (result === null) {
            Log.warn('KPI card not found on screen: ' + cardLabel);
            return -1;
        }
        return Number.parseInt(result, 10);
    }

    /**
     * Reads a KPI card once it has stopped changing.
     *
     * The cards render with a placeholder and are filled in when their fetch
     * resolves, so a single read taken straight after navigation can capture
     * the placeholder. A baseline captured that way makes a later
     * "the count must not have changed" assertion fail against a number that
     * was never real. Two consecutive equal reads are taken as settled.
     */
    async readSettledKpiCard(cardLabel: string): Promise<number> {
        try {
            return await WaitUtils.fluently(async () => {
                const firstRead = await this.readKpiCard(cardLabel);
                if (firstRead < 0) {
                    return null;
                }
                await WaitUtils.sleepQuietly(400);
                return firstRead === await this.readKpiCard(cardLabel) ? { value: firstRead } : null;
            }, ConfigManager.explicitWait(), `KPI '${cardLabel}' never settled`).then(settled => settled.value);
        } catch (e) {
            if (!(e instanceof WaitTimeoutError)) {
                throw e;
            }
            Log.warn(`KPI '${cardLabel}' did not settle - using a single read`);
            return this.readKpiCard(cardLabel);
        }
    }

    /**
     * Polls a KPI card until it reports the expected value.
     *
     * Counters are refetched after a mutation, so reading once immediately
     * after a save races the refresh.
     */
    async waitForKpiCard(cardLabel: string, expectedValue: number): Promise<boolean> {
        try {
            await WaitUtils.fluently(async () => (await this.readKpiCard(cardLabel)) === expectedValue,
                ConfigManager.explicitWait(), `KPI '${cardLabel}' never reached ${expectedValue}`);
            return true;
        } catch (e) {
            if (!(e instanceof WaitTimeoutError)) {
                throw e;
            }
            Log.warn(`KPI '${cardLabel}' stayed at ${await this.readKpiCard(cardLabel)}, expected ${expectedValue}`);
            return false;
        }
    }
}
