import type { Locator } from '@playwright/test';
import { DriverManager } from '../driver/DriverManager';
import { WaitStrategy } from '../enums/WaitStrategy';
import { FrameworkError, WaitTimeoutError } from '../exceptions/errors';
import { ElementUtils } from './ElementUtils';
import { Log } from './Log';
import { Target, WaitUtils } from './WaitUtils';

/** Marks an XPath expression for Playwright, which reads plain strings as CSS. */
function xpath(expression: string): string {
    return 'xpath=' + expression;
}

/**
 * Makes a string safe as an XPath literal.
 *
 * XPath 1.0 has no escape character, so a value containing both quote kinds
 * has to be assembled with concat(). Role labels here really do contain
 * apostrophes and ampersands, so this is not theoretical.
 */
function escapeForXPath(value: string): string {
    if (!value.includes("'")) {
        return `'${value}'`;
    }
    if (!value.includes('"')) {
        return `"${value}"`;
    }
    return 'concat(' + value.split("'").map(part => `'${part}'`).join(`, "'", `) + ')';
}

function formControlXPath(label: string): string {
    return `//label[starts-with(normalize-space(.),${escapeForXPath(label)})]`
        + "/ancestor::div[contains(@class,'MuiFormControl-root')][1]";
}

/**
 * Locator strategies for this application's Material-UI component set.
 *
 * WHY THIS MODULE EXISTS
 * ----------------------
 * The app ships no data-testid attributes, and MUI generates input ids at
 * render time (id="_r_f_", id="_r_g_"...). Those ids change between renders
 * and between builds, so binding tests to them guarantees breakage.
 *
 * Three stable strategies are used instead, in order of preference:
 *
 *   1. The name attribute, where the app sets one. The login form and the
 *      Register-New-Employee dialog both do (tenantCode, email, password,
 *      date_of_birth, employee_id ...), and it is the most robust hook here.
 *
 *   2. The visible label, resolved through the MuiFormControl wrapper that
 *      MUI always renders around a label + input pair. Labels are what a user
 *      reads, so a label-driven locator breaks only when the UI genuinely
 *      changes - which is exactly when a test should break.
 *
 *   3. ARIA roles (combobox, option, dialog, tab) for portalled widgets.
 *
 * PORTALS
 * -------
 * MUI renders menus, dialogs and autocomplete dropdowns into a portal at the
 * end of <body>, NOT inside the form they belong to. Any locator scoped to a
 * form will silently miss them, so the option helpers below deliberately
 * search from the document root.
 */
export const MuiUtils = {

    xpath,
    escapeForXPath,

    // -------------------------------------------------------- shared locators

    DIALOG: '.MuiDialog-root',
    DIALOG_TITLE: '.MuiDialogTitle-root',
    DRAWER: '.MuiDrawer-root .MuiDrawer-paper',
    BACKDROP: '.MuiBackdrop-root',
    LISTBOX: "[role='listbox'], .MuiAutocomplete-popper",
    OPTION: "[role='option']",
    MENU_ITEM: "[role='menuitem']",
    FIELD_ERROR: '.MuiFormHelperText-root.Mui-error',
    ALERT: ".MuiAlert-root, [role='alert']",

    DATA_GRID: '.MuiDataGrid-root',
    DATA_GRID_ROW: '.MuiDataGrid-row',
    DATA_GRID_OVERLAY: '.MuiDataGrid-overlay',

    /** XPath prefix restricting a match to the open dialog. */
    IN_DIALOG: "//div[contains(@class,'MuiDialog-root')]",

    /** XPath prefix restricting a match to the open drawer. */
    IN_DRAWER: "//div[contains(@class,'MuiDrawer-paper')]",

    // ------------------------------------------------ label-driven locators

    /**
     * Input resolved from its visible label.
     *
     * MUI renders:
     *   div.MuiFormControl-root
     *     label            "Full Name *"
     *     div.MuiInputBase-root
     *       input
     *
     * so walking up to the FormControl and back down to the control is stable
     * regardless of the generated id. The label is matched on its leading text
     * so that the required-field asterisk does not have to be spelled out.
     */
    inputByLabel(label: string): string {
        return xpath(formControlXPath(label) + '//input');
    },

    textAreaByLabel(label: string): string {
        return xpath(formControlXPath(label) + "//textarea[not(@aria-hidden='true')]");
    },

    /** The clickable combobox surface of a MUI Select / Autocomplete. */
    selectByLabel(label: string): string {
        return xpath(formControlXPath(label) + "//*[@role='combobox']");
    },

    /** Inline validation message rendered under a labelled field. */
    errorTextByLabel(label: string): string {
        return xpath(formControlXPath(label)
            + "//p[contains(@class,'MuiFormHelperText-root') and contains(@class,'Mui-error')]");
    },

    // ------------------------------------------------- scoped field locators

    /**
     * Field locators scoped to an overlay.
     *
     * NOT OPTIONAL - these prevent a real and very confusing bug.
     *
     * An unscoped label locator searches the whole document, and this app
     * renders the SAME labels in two places at once: the Employee Directory
     * has Department / Branch / Designation / Employment Type / Role filters,
     * and the Register New Employee dialog that opens on top of it has fields
     * with exactly those labels. The page's filter comes first in the DOM, so
     * an unscoped locator resolves to the control BEHIND the dialog.
     *
     * The failure that produces is thoroughly misleading: the backdrop blocks
     * the native click, the scripted fallback then successfully operates the
     * hidden filter, the directory underneath re-renders, the dialog remounts,
     * and every value already typed into the form is lost. The test finally
     * fails with "Full name is required" on a form it believes it filled in.
     *
     * The Holiday dialog has the same clash on "Location".
     */
    inputByLabelIn(scopeXPath: string, label: string): string {
        return xpath(scopeXPath + formControlXPath(label) + '//input');
    },

    textAreaByLabelIn(scopeXPath: string, label: string): string {
        return xpath(scopeXPath + formControlXPath(label) + "//textarea[not(@aria-hidden='true')]");
    },

    selectByLabelIn(scopeXPath: string, label: string): string {
        return xpath(scopeXPath + formControlXPath(label) + "//*[@role='combobox']");
    },

    // ----------------------------------------------------- attribute locators

    inputByName(name: string): string {
        return `input[name='${name}']`;
    },

    // -------------------------------------------------------------- buttons

    /** Button matched on its exact visible text. */
    buttonByText(text: string): string {
        return xpath(`//button[normalize-space(.)=${escapeForXPath(text)}]`);
    },

    /** Button whose text merely contains the fragment - for buttons with badges. */
    buttonContainingText(text: string): string {
        return xpath(`//button[contains(normalize-space(.),${escapeForXPath(text)})]`);
    },

    tabByText(text: string): string {
        return xpath(`//*[@role='tab'][contains(normalize-space(.),${escapeForXPath(text)})]`);
    },

    /**
     * Control matched on its accessible name OR its visible text.
     *
     * The employee directory's row actions are icon-only buttons - an eye, a
     * pencil, a key, a bin - whose meaning lives entirely in aria-label/title.
     * A text-only locator finds nothing and the test reports "HR cannot edit
     * employees", which is a wrong answer rather than a failed lookup. The
     * same control may be captioned elsewhere in the app, so both are matched.
     */
    controlByAccessibleName(name: string): string {
        const escaped = escapeForXPath(name);
        return xpath("//*[self::button or @role='button']"
            + `[@aria-label=${escaped} or @title=${escaped} or normalize-space(.)=${escaped}`
            + ` or .//*[@aria-label=${escaped} or @title=${escaped}]]`);
    },

    // ------------------------------------------------ check-in reminder

    /**
     * Closes the "Hello, you haven't checked in yet today" reminder if shown.
     *
     * The app floats this card over every page on a persona's first sign-in
     * of the day, so it appears in the first run each morning and never in a
     * rerun later that day - a textbook source of "fails only sometimes". It
     * swallows clicks aimed at whatever is underneath it. Only its close
     * button is clicked: the card body itself navigates to Daily Check-In.
     *
     * @return true when a reminder was found and closed
     */
    async dismissCheckInReminderIfShown(): Promise<boolean> {
        const closed = await DriverManager.get().evaluate(() => {
            const text = [...document.querySelectorAll('body *')]
                .find(e => e.children.length === 0 && /checked in yet/i.test(e.textContent || ''));
            if (!text) return false;
            let card = text.parentElement;
            while (card && !card.querySelector('button')) card = card.parentElement;
            if (!card || card === document.body) return false;
            card.querySelector('button')!.click();
            return true;
        });
        if (closed) {
            Log.warn('Closed the daily check-in reminder that was covering the page');
            await WaitUtils.sleepQuietly(400);
            return true;
        }
        return false;
    },

    // ------------------------------------------------------ select handling

    /**
     * Picks an option from a MUI Select.
     *
     * The dropdown is portalled, so the sequence is: click the combobox, wait
     * for the listbox to mount at body level, click the option by its text.
     */
    async selectOption(combobox: Target, optionText: string): Promise<void> {
        Log.step(`Selecting '${optionText}' from dropdown`);
        await MuiUtils.openDropdown(combobox);

        const option = xpath(`//*[@role='option'][normalize-space(.)=${escapeForXPath(optionText)}]`);
        if (!await ElementUtils.isPresent(option)) {
            const available = await availableOptions();
            await MuiUtils.closeDropdown();
            throw new FrameworkError(
                `Option '${optionText}' is not in the dropdown. Available options: [${available.join(', ')}]`);
        }
        await chooseOption(option, optionText);
    },

    /** Picks the first option whose text contains the fragment. */
    async selectOptionContaining(combobox: Target, fragment: string): Promise<void> {
        Log.step(`Selecting the option containing '${fragment}' from dropdown`);
        await MuiUtils.openDropdown(combobox);
        const option = xpath(`(//*[@role='option'][contains(normalize-space(.),${escapeForXPath(fragment)})])[1]`);
        if (!await ElementUtils.isPresent(option)) {
            const available = await availableOptions();
            await MuiUtils.closeDropdown();
            throw new FrameworkError(
                `No option containing '${fragment}' in the dropdown. Available options: [${available.join(', ')}]`);
        }
        await chooseOption(option, fragment);
    },

    /** Opens a dropdown, reads its options, closes it again. */
    async readOptions(combobox: Target): Promise<string[]> {
        await MuiUtils.openDropdown(combobox);
        const options = await availableOptions();
        await MuiUtils.closeDropdown();
        return options;
    },

    /**
     * Dismisses an open menu without choosing anything.
     *
     * Escape alone is not dependable here - it is delivered to whatever holds
     * focus, and after a scripted open that is not always the menu. Clicking
     * the backdrop is what a user would do and what MUI always listens for, so
     * it is the fallback. An open menu left behind is not a cosmetic problem:
     * its full-screen backdrop intercepts every subsequent click on the page.
     */
    async closeDropdown(): Promise<void> {
        if (!await ElementUtils.isDisplayed(MuiUtils.LISTBOX)) {
            return;
        }

        await ElementUtils.pressEscape();
        if (await WaitUtils.waitForInvisibleQuietly(MuiUtils.LISTBOX, 3000)) {
            return;
        }

        Log.warn('The menu ignored Escape - dismissing it through the backdrop');
        if (await ElementUtils.isPresent(MuiUtils.BACKDROP)) {
            await ElementUtils.clickViaScript(await ElementUtils.find(MuiUtils.BACKDROP, WaitStrategy.PRESENT));
        }
        if (!await WaitUtils.waitForInvisibleQuietly(MuiUtils.LISTBOX, 5000)) {
            throw new FrameworkError(
                'An open dropdown menu could not be dismissed - its backdrop will '
                + 'intercept every later interaction on this page');
        }
    },

    /**
     * Opens a MUI Select and waits for its portalled menu.
     *
     * MUI binds the Select to onMouseDown rather than onClick, so a click that
     * does not carry the full pointer sequence leaves the menu shut. The
     * native click is tried first; the scripted fallback replays the whole
     * sequence, which is what actually opens it when the native click is
     * swallowed by an overlay.
     */
    async openDropdown(combobox: Target): Promise<void> {
        await ElementUtils.click(combobox);
        if (await WaitUtils.isVisibleWithin(MuiUtils.LISTBOX, 5000)) {
            return;
        }

        Log.warn('The dropdown did not open on the native click - replaying the full pointer sequence');
        await ElementUtils.clickViaScript(combobox);
        await WaitUtils.waitForVisible(MuiUtils.LISTBOX);
    },

    /**
     * Types into a MUI Autocomplete and picks the first suggestion that
     * matches. Used by "Target Employee" on the Apply-for-Leave drawer, which
     * filters server-side as you type.
     */
    async searchAndSelect(autocompleteInput: Target, query: string): Promise<void> {
        Log.step(`Autocomplete search for '${query}'`);
        await ElementUtils.type(autocompleteInput, query);
        await WaitUtils.waitForVisible(MuiUtils.LISTBOX);

        // Wait for an option that actually MATCHES the query, then click that
        // one - never "whichever option is first".
        //
        // Clicking the first option is a race with real consequences here:
        // focusing the field opens the list unfiltered, so for a moment option
        // one is simply the first employee in the tenant. Selecting it records
        // leave against the wrong person, the test then looks for a request
        // that was never created, and the failure points at the assertion
        // rather than at the selection that actually went wrong.
        const matching = xpath(`//*[@role='option'][contains(normalize-space(.),${escapeForXPath(query)})]`);
        try {
            await WaitUtils.fluently(async () => ElementUtils.isPresent(matching), 12000,
                `No autocomplete option matched '${query}'`);
        } catch (e) {
            if (!(e instanceof WaitTimeoutError)) {
                throw e;
            }
            const available = await availableOptions();
            await MuiUtils.closeDropdown();
            throw new FrameworkError(
                `No autocomplete option matched '${query}'. Offered: [${available.join(', ')}]`, { cause: e });
        }

        const firstMatch = xpath(`(//*[@role='option'][contains(normalize-space(.),${escapeForXPath(query)})])[1]`);
        await chooseOption(firstMatch, query);
    },

    // -------------------------------------------------------- dialog handling

    async isDialogOpen(): Promise<boolean> {
        return ElementUtils.isDisplayed(MuiUtils.DIALOG);
    },

    async waitForDialog(): Promise<void> {
        await WaitUtils.waitForVisible(MuiUtils.DIALOG);
    },

    /**
     * Clicks a trigger and waits for its dialog, retrying with a scripted
     * click if the first attempt produced nothing.
     *
     * Several of this app's action buttons sit in headers that re-render as
     * their data resolves. A native click dispatched while that is happening
     * is occasionally absorbed - no exception, no dialog, and the test then
     * fails 25 seconds later waiting for a dialog that was never asked for.
     * The scripted retry dispatches the event straight at the element, which
     * React's handler receives regardless of layout timing.
     *
     * The native click is still tried first, deliberately: it is the only one
     * of the two that would catch a genuinely unclickable control.
     */
    async openDialogFrom(trigger: Target): Promise<void> {
        const element = await ElementUtils.find(trigger, WaitStrategy.CLICKABLE);
        await ElementUtils.clickElement(element);
        if (await WaitUtils.isVisibleWithin(MuiUtils.DIALOG, 6000)) {
            return;
        }

        Log.warn('The dialog did not open on the native click - retrying with a scripted click');
        await ElementUtils.clickViaScript(element);
        await WaitUtils.waitForVisible(MuiUtils.DIALOG);
    },

    async waitForDialogToClose(): Promise<void> {
        await WaitUtils.waitForInvisible(MuiUtils.DIALOG);
    },

    async dialogText(): Promise<string> {
        return (await ElementUtils.find(MuiUtils.DIALOG, WaitStrategy.VISIBLE)).innerText();
    },

    /**
     * Clicks a button inside the open dialog.
     *
     * Scoped to the dialog on purpose: "Delete" and "Cancel" also exist on the
     * page underneath, and an unscoped locator picks whichever the DOM returns
     * first - a classic source of tests that pass for the wrong reason.
     */
    async clickDialogButton(buttonText: string): Promise<void> {
        await ElementUtils.click(await dialogButton(buttonText));
    },

    /**
     * Clicks a dialog button that is expected to dismiss the dialog, and
     * confirms it did.
     *
     * A submit that quietly fails to register leaves the dialog open, and the
     * caller then times out waiting for it to close. Retrying once with the
     * full pointer sequence distinguishes "the click did not land" from "the
     * form was rejected" - if the dialog is still open after the retry, the
     * app really did refuse the submission and the caller should inspect the
     * validation messages.
     *
     * @return true when the dialog closed
     */
    async clickDialogButtonAndWaitForClose(buttonText: string): Promise<boolean> {
        await MuiUtils.clickDialogButton(buttonText);
        if (!await ElementUtils.isDisplayed(MuiUtils.DIALOG) || await waitForDialogToCloseQuietly(8000)) {
            return true;
        }

        Log.warn(`The dialog stayed open after '${buttonText}' - replaying the full pointer sequence`);
        await MuiUtils.clickDialogButtonViaScript(buttonText);
        return waitForDialogToCloseQuietly(10000);
    },

    async clickDialogButtonViaScript(buttonText: string): Promise<void> {
        await ElementUtils.clickViaScript(await dialogButton(buttonText));
    },

    /**
     * Confirms a destructive action.
     *
     * The app uses a MUI confirmation dialog rather than window.confirm(), so
     * no browser dialog handling is involved.
     */
    async confirmDestructiveAction(): Promise<void> {
        await MuiUtils.waitForDialog();
        await MuiUtils.clickDialogButton('Delete');
        await MuiUtils.waitForDialogToClose();
    },

    // ------------------------------------------------------ DataGrid handling

    async waitForGrid(): Promise<void> {
        await WaitUtils.waitForVisible(MuiUtils.DATA_GRID);
        await WaitUtils.waitForDataToSettle();
    },

    async gridRowCount(): Promise<number> {
        return ElementUtils.count(MuiUtils.DATA_GRID_ROW);
    },

    /** Row containing the given text in any cell. */
    gridRowContaining(text: string): string {
        return xpath("//div[contains(@class,'MuiDataGrid-row')]"
            + "[.//div[contains(@class,'MuiDataGrid-cell')]"
            + `[contains(normalize-space(.),${escapeForXPath(text)})]]`);
    },

    /** A specific column cell within the row identified by rowText. */
    gridCell(rowText: string, columnField: string): string {
        return xpath("//div[contains(@class,'MuiDataGrid-row')]"
            + "[.//div[contains(@class,'MuiDataGrid-cell')]"
            + `[contains(normalize-space(.),${escapeForXPath(rowText)})]]`
            + `//div[@data-field=${escapeForXPath(columnField)}]`);
    },

    async gridHasRowContaining(text: string): Promise<boolean> {
        return WaitUtils.isVisibleWithin(MuiUtils.gridRowContaining(text), 10000);
    },

    /**
     * Reads the total row count from the pagination footer ("1-6 of 6").
     * More reliable than counting DOM rows, which only holds the current page
     * and, for a virtualised grid, only the rendered window of it.
     */
    async gridTotalFromPagination(): Promise<number> {
        const displayedRows = '.MuiTablePagination-displayedRows';
        if (!await ElementUtils.isPresent(displayedRows)) {
            return MuiUtils.gridRowCount();
        }
        const parts = (await ElementUtils.getText(displayedRows)).split('of');
        if (parts.length < 2) {
            return MuiUtils.gridRowCount();
        }
        return parseJavaInt(parts[1].replace(/[^0-9]/g, ''));
    },

    // ------------------------------------------------------------- utilities

    /** Dismisses any open overlay so the next interaction is not intercepted. */
    async dismissOverlays(): Promise<void> {
        if (await ElementUtils.isDisplayed(MuiUtils.DIALOG) || await ElementUtils.isDisplayed(MuiUtils.DRAWER)) {
            await ElementUtils.pressEscape();
            await WaitUtils.sleepQuietly(400);
        }
        if (await ElementUtils.isDisplayed(MuiUtils.BACKDROP)) {
            await ElementUtils.pressEscape();
        }
    },
};

/**
 * Integer.parseInt semantics: an empty or non-numeric string is an error,
 * not NaN quietly flowing into an assertion.
 */
export function parseJavaInt(text: string): number {
    if (!/^[+-]?\d+$/.test(text)) {
        throw new Error(`NumberFormatException: For input string: "${text}"`);
    }
    return Number.parseInt(text, 10);
}

async function dialogButton(buttonText: string): Promise<Locator> {
    const dialog = await ElementUtils.find(MuiUtils.DIALOG, WaitStrategy.VISIBLE);
    const button = dialog.locator(xpath(`.//button[normalize-space(.)=${escapeForXPath(buttonText)}]`)).first();
    if ((await button.count()) === 0) {
        throw new FrameworkError(`The open dialog has no '${buttonText}' button`);
    }
    return button;
}

async function waitForDialogToCloseQuietly(timeoutMillis: number): Promise<boolean> {
    try {
        await WaitUtils.fluently(
            async () => (await DriverManager.get().locator(MuiUtils.DIALOG).filter({ visible: true }).count()) === 0,
            timeoutMillis, 'The dialog never closed');
        return true;
    } catch (e) {
        if (e instanceof WaitTimeoutError) {
            return false;
        }
        throw e;
    }
}

async function availableOptions(): Promise<string[]> {
    return ElementUtils.textsOf(MuiUtils.OPTION);
}

/**
 * Clicks a menu option and waits for the menu to dismiss.
 *
 * The menu closing is the only observable proof the option was taken; a
 * click that fails to register leaves it open, and every later locator then
 * has to fight a full-screen MUI backdrop. Retried once with the full pointer
 * sequence for the same reason dropdowns need it.
 */
async function chooseOption(option: string, description: string): Promise<void> {
    await ElementUtils.click(option);
    if (await WaitUtils.isVisibleWithin(MuiUtils.LISTBOX, 3000)) {
        Log.warn(`The menu stayed open after choosing '${description}' - replaying the full pointer sequence`);
        if (await ElementUtils.isPresent(option)) {
            await ElementUtils.clickViaScript(option);
        }
    }
    if (!await WaitUtils.waitForInvisibleQuietly(MuiUtils.LISTBOX, 10000)) {
        // Leaving an open menu behind would break the next interaction far
        // from here, so close it and report honestly.
        await ElementUtils.pressEscape();
        throw new FrameworkError(`The dropdown menu would not close after choosing '${description}'`);
    }
}
