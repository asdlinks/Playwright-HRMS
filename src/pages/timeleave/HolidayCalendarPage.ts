import { AppModule } from '../../enums/AppModule';
import { IllegalStateError, WaitTimeoutError } from '../../exceptions/errors';
import { DateUtils } from '../../utils/DateUtils';
import { ElementUtils } from '../../utils/ElementUtils';
import { Log } from '../../utils/Log';
import { MuiUtils } from '../../utils/MuiUtils';
import { WaitUtils } from '../../utils/WaitUtils';
import { BasePage } from '../base/BasePage';

/**
 * Holiday Calendar.
 *
 * The holiday list is one of the clearest inter-module signals in the product:
 * adding a holiday here changes the dashboard's "Next Holiday" KPI and the
 * Upcoming Holidays widget, and marks the day off across attendance.
 */
export class HolidayCalendarPage extends BasePage {

    static readonly KPI_HOLIDAYS_THIS_YEAR = 'Holidays in';
    static readonly KPI_LOCATIONS = 'Locations';

    private static readonly ADD_HOLIDAY_BUTTON = MuiUtils.buttonByText('Add Holiday');
    private static readonly LOCATION_FILTER = MuiUtils.selectByLabel('Location');

    // Scoped to the dialog - the calendar page behind it has its own "Location"
    // filter, and an unscoped label match would reach past the backdrop.
    private static readonly DIALOG_HOLIDAY_NAME = MuiUtils.inputByLabelIn(MuiUtils.IN_DIALOG, 'Holiday Name');
    private static readonly DIALOG_DATE = MuiUtils.inputByLabelIn(MuiUtils.IN_DIALOG, 'Date');
    private static readonly DIALOG_LOCATION = MuiUtils.selectByLabelIn(MuiUtils.IN_DIALOG, 'Location');

    private static readonly SAVE_BUTTON = 'Save Holiday';
    private static readonly CANCEL_BUTTON = 'Cancel';

    landingMarker(): string {
        return AppModule.HOLIDAY_CALENDAR.landingMarker();
    }

    route(): string {
        return AppModule.HOLIDAY_CALENDAR.route();
    }

    // ------------------------------------------------------------- reading

    async canAddHoliday(): Promise<boolean> {
        return ElementUtils.isDisplayed(HolidayCalendarPage.ADD_HOLIDAY_BUTTON);
    }

    async hasLocationFilter(): Promise<boolean> {
        return ElementUtils.isDisplayed(HolidayCalendarPage.LOCATION_FILTER);
    }

    /**
     * Number of holidays this year, from the KPI card.
     *
     * The card renders 0 as a placeholder until the holiday fetch resolves,
     * and that placeholder can hold steady long enough to look settled. So a
     * positive figure is accepted as soon as it appears, and 0 is only
     * reported once the card has had the full wait to change.
     */
    async holidayCountThisYear(): Promise<number> {
        const label = `${HolidayCalendarPage.KPI_HOLIDAYS_THIS_YEAR} ${DateUtils.currentYear()}`;
        try {
            return await WaitUtils.fluently(async () => {
                const count = await this.readKpiCard(label);
                return count > 0 ? count : null;
            }, 15000, 'Holiday KPI stayed at zero');
        } catch (e) {
            if (!(e instanceof WaitTimeoutError)) {
                throw e;
            }
            return this.readKpiCard(label);
        }
    }

    async hasHoliday(name: string): Promise<boolean> {
        return ElementUtils.waitForPageText(name, 12000);
    }

    async hasHolidayImmediately(name: string): Promise<boolean> {
        return ElementUtils.pageContainsText(name);
    }

    /**
     * Deletes every holiday an earlier automation run left behind (named
     * "<prefix> Holiday <digits>"). A leftover dated sooner than a new
     * holiday keeps the Dashboard's next-holiday widget pointing at itself.
     */
    async deleteLeftoverAutomationHolidays(prefix: string): Promise<void> {
        await this.open();
        // The cards render after the page shell; reading at once finds none.
        // With no leftovers this costs the full wait, which is the rare case.
        if (!await ElementUtils.waitForPageText(prefix + ' Holiday', 10000)) {
            return;
        }
        const leftovers = await this.page().evaluate(namePrefix => {
            const pattern = new RegExp('^' + namePrefix + ' Holiday \\d+$');
            const names = [...document.querySelectorAll('main div,main span,main p,main h6')]
                .filter(e => e.children.length === 0)
                .map(e => (e.textContent || '').trim())
                .filter(t => pattern.test(t));
            return [...new Set(names)];
        }, prefix);
        for (const name of leftovers) {
            Log.info(`Removing leftover automation holiday '${name}'`);
            if (!await this.deleteIfPresent(name)) {
                Log.warn('Holiday delete is not working - leaving the remaining leftovers in place');
                return;
            }
        }
    }

    /** Name shown on the "Next Holiday" KPI card. */
    async nextHolidayName(): Promise<string> {
        const lines = (await this.contentText()).split(/\r?\n/);
        const index = lines.findIndex(line => line.trim() === 'Next Holiday');
        if (index < 0) {
            return '';
        }
        return lines.slice(index + 1).find(line => line.trim() !== '')?.trim() ?? '';
    }

    // ------------------------------------------------------------ creating

    async openAddHolidayDialog(): Promise<this> {
        Log.step('Opening the Add New Holiday dialog');
        await MuiUtils.openDialogFrom(HolidayCalendarPage.ADD_HOLIDAY_BUTTON);
        return this;
    }

    async addHolidayDialogTitle(): Promise<string> {
        return ElementUtils.getText(MuiUtils.DIALOG_TITLE);
    }

    async enterHolidayName(name: string): Promise<this> {
        await ElementUtils.type(HolidayCalendarPage.DIALOG_HOLIDAY_NAME, name);
        return this;
    }

    async enterHolidayDate(mmddyyyy: string): Promise<this> {
        await ElementUtils.typeIntoDateField(HolidayCalendarPage.DIALOG_DATE, mmddyyyy);
        return this;
    }

    async saveHoliday(): Promise<this> {
        if (!await MuiUtils.clickDialogButtonAndWaitForClose(HolidayCalendarPage.SAVE_BUTTON)) {
            throw new IllegalStateError(
                'The holiday was not saved - the dialog is still open. '
                + `Validation messages: [${(await this.validationMessages()).join(', ')}]`);
        }
        await WaitUtils.waitForDataToSettle();
        return this;
    }

    async cancelHolidayDialog(): Promise<this> {
        await MuiUtils.clickDialogButtonAndWaitForClose(HolidayCalendarPage.CANCEL_BUTTON);
        return this;
    }

    /** Full create flow. */
    async addHoliday(name: string, mmddyyyy: string): Promise<this> {
        Log.step(`Adding holiday '${name}' on ${mmddyyyy}`);
        await this.openAddHolidayDialog();
        await this.enterHolidayName(name);
        await this.enterHolidayDate(mmddyyyy);
        return this.saveHoliday();
    }

    /** Inline validation messages raised by the dialog. */
    async validationMessages(): Promise<string[]> {
        await WaitUtils.sleepQuietly(600);
        return (await ElementUtils.textsOf(MuiUtils.FIELD_ERROR)).filter(text => text !== '');
    }

    // ------------------------------------------------------------ deleting

    /**
     * Best-effort cleanup - never throws, so it cannot mask a real failure.
     *
     * The delete control is resolved structurally from the holiday's own text
     * node rather than by an ancestor XPath: ancestor::div[.//button][1] can
     * match the whole page section, whose last button is not this row's.
     * Deleting the wrong holiday during cleanup would be considerably worse
     * than failing to clean up at all.
     */
    async deleteIfPresent(holidayName: string): Promise<boolean> {
        try {
            await this.open();
            // Waiting, not immediate: the list renders after the page shell,
            // and an immediate read skipped cleanup and leaked holidays that
            // then outranked later runs' holidays on the Dashboard widget.
            if (!await this.hasHoliday(holidayName)) {
                return true;
            }

            const control = await ElementUtils.locateByScript(name => {
                const leaf = [...document.querySelectorAll('main div,main span,main p,main h6')]
                    .find(e => e.children.length === 0 && (e.textContent || '').trim() === name);
                if (!leaf) return null;
                let node: Element | null = leaf;
                for (let hop = 0; hop < 5 && node; hop++) {
                    node = node.parentElement;
                    if (!node) break;
                    const buttons = [...node.querySelectorAll('button')];
                    if (buttons.length) return buttons[buttons.length - 1];
                }
                return null;
            }, holidayName);

            if (!control) {
                Log.warn(`No delete control found for the holiday '${holidayName}'`);
                return false;
            }

            await ElementUtils.clickElement(control);
            if (await WaitUtils.isVisibleWithin(MuiUtils.DIALOG, 4000)) {
                await MuiUtils.confirmDestructiveAction();
            }

            // Verify rather than assume: on 2026-09-24 the delete control was
            // observed doing nothing at all (no request, no dialog, no DOM
            // change), and an unverified "cleaned up" hid the leak for days.
            await this.open();
            if (await this.hasHoliday(holidayName)) {
                Log.warn(`The holiday '${holidayName}' is still listed after delete - `
                    + 'the application did not remove it');
                return false;
            }
            Log.info(`Cleaned up holiday '${holidayName}'`);
            return true;
        } catch (e) {
            Log.warn(`Could not clean up holiday '${holidayName}': ${(e as Error).message}`);
            return false;
        }
    }
}
