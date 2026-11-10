import type { Locator, Page } from '@playwright/test';
import { WaitStrategy } from '../enums/WaitStrategy';
import { FrameworkException, WaitTimeoutException } from '../exceptions/FrameworkException';
import { ElementUtils } from './ElementUtils';
import { Log } from './Log';
import { WaitUtils } from './WaitUtils';

/**
 * Locator strategies and widget helpers for this application's Material-UI
 * component set.
 *
 * WHY THIS CLASS EXISTS
 * ---------------------
 * The app ships no data-testid attributes, and MUI generates input ids at
 * render time (id="_r_f_", id="_r_g_"...). Those ids change between renders
 * and between builds, so binding tests to them guarantees breakage.
 *
 * Three stable strategies are used instead, in order of preference:
 *
 *   1. The name attribute, where the app sets one (login form, onboarding
 *      wizard: tenantCode, email, date_of_birth, employee_id ...).
 *
 *   2. The visible label, resolved through the MuiFormControl wrapper MUI
 *      always renders around a label + input pair. A label-driven locator
 *      breaks only when the UI genuinely changes.
 *
 *   3. ARIA roles (combobox, option, dialog, tab) for portalled widgets.
 *
 * XPath is kept where the Selenium framework used it: label-to-control walks
 * and exact normalize-space() text matches have no closer CSS equivalent, and
 * Playwright runs XPath natively (`xpath=` prefix).
 *
 * PORTALS
 * -------
 * MUI renders menus, dialogs and autocomplete dropdowns into a portal at the
 * end of <body>, NOT inside the form they belong to. Any locator scoped to a
 * form will silently miss them, so the option helpers search from the page.
 */
export class MuiUtils {
  // -------------------------------------------------------- shared selectors

  static readonly DIALOG = '.MuiDialog-root';
  static readonly DIALOG_TITLE = '.MuiDialogTitle-root';
  static readonly DRAWER = '.MuiDrawer-root .MuiDrawer-paper';
  static readonly BACKDROP = '.MuiBackdrop-root';
  static readonly LISTBOX = "[role='listbox'], .MuiAutocomplete-popper";
  static readonly OPTION = "[role='option']";
  static readonly MENU_ITEM = "[role='menuitem']";
  static readonly FIELD_ERROR = '.MuiFormHelperText-root.Mui-error';
  static readonly ALERT = ".MuiAlert-root, [role='alert']";

  static readonly DATA_GRID = '.MuiDataGrid-root';
  static readonly DATA_GRID_ROW = '.MuiDataGrid-row';
  static readonly DATA_GRID_OVERLAY = '.MuiDataGrid-overlay';

  /** XPath prefix restricting a match to the open dialog. */
  static readonly IN_DIALOG = "//div[contains(@class,'MuiDialog-root')]";

  /** XPath prefix restricting a match to the open drawer. */
  static readonly IN_DRAWER = "//div[contains(@class,'MuiDrawer-paper')]";

  private constructor() {}

  /** Page-level XPath locator. */
  static xpath(page: Page, expression: string): Locator {
    return page.locator(`xpath=${expression}`);
  }

  // ------------------------------------------------ label-driven locators

  /**
   * MUI renders
   *   div.MuiFormControl-root
   *     label            "Full Name *"
   *     div.MuiInputBase-root
   *       input
   * so walking up to the FormControl and back down to the control is stable
   * regardless of the generated id. The label is matched on its leading text
   * so that the required-field asterisk does not have to be spelled out.
   */
  private static formControlXPath(label: string): string {
    return (
      `//label[starts-with(normalize-space(.),${MuiUtils.escapeForXPath(label)})]` +
      "/ancestor::div[contains(@class,'MuiFormControl-root')][1]"
    );
  }

  static inputByLabel(page: Page, label: string): Locator {
    return MuiUtils.inputByLabelIn(page, '', label);
  }

  static textAreaByLabel(page: Page, label: string): Locator {
    return MuiUtils.textAreaByLabelIn(page, '', label);
  }

  /** The clickable combobox surface of a MUI Select / Autocomplete. */
  static selectByLabel(page: Page, label: string): Locator {
    return MuiUtils.selectByLabelIn(page, '', label);
  }

  /** Inline validation message rendered under a labelled field. */
  static errorTextByLabel(page: Page, label: string): Locator {
    return MuiUtils.xpath(
      page,
      MuiUtils.formControlXPath(label) +
        "//p[contains(@class,'MuiFormHelperText-root') and contains(@class,'Mui-error')]",
    );
  }

  // ------------------------------------------------- scoped field locators

  /*
   * Field locators scoped to an overlay.
   *
   * NOT OPTIONAL - these prevent a real and very confusing bug.
   *
   * This app renders the SAME labels in two places at once: the Employee
   * Directory has Department / Branch / Designation / Employment Type / Role
   * filters, and the onboarding dialog that opens on top of it has fields
   * with exactly those labels. The page's filter comes first in the DOM, so
   * an unscoped locator resolves to the control BEHIND the dialog - and
   * operating it re-renders the directory, remounts the dialog and loses
   * every value already typed into the form.
   */

  static inputByLabelIn(page: Page, scopeXPath: string, label: string): Locator {
    return MuiUtils.xpath(page, `${scopeXPath}${MuiUtils.formControlXPath(label)}//input`);
  }

  static textAreaByLabelIn(page: Page, scopeXPath: string, label: string): Locator {
    return MuiUtils.xpath(page, `${scopeXPath}${MuiUtils.formControlXPath(label)}//textarea[not(@aria-hidden='true')]`);
  }

  static selectByLabelIn(page: Page, scopeXPath: string, label: string): Locator {
    return MuiUtils.xpath(page, `${scopeXPath}${MuiUtils.formControlXPath(label)}//*[@role='combobox']`);
  }

  static inputByName(page: Page, name: string): Locator {
    return page.locator(`input[name='${name}']`);
  }

  // -------------------------------------------------------------- buttons

  /** Button matched on its exact visible text. */
  static buttonByText(page: Page, text: string): Locator {
    return MuiUtils.xpath(page, `//button[normalize-space(.)=${MuiUtils.escapeForXPath(text)}]`);
  }

  /** Button whose text merely contains the fragment - for buttons with badges. */
  static buttonContainingText(page: Page, text: string): Locator {
    return MuiUtils.xpath(page, `//button[contains(normalize-space(.),${MuiUtils.escapeForXPath(text)})]`);
  }

  static tabByText(page: Page, text: string): Locator {
    return MuiUtils.xpath(page, `//*[@role='tab'][contains(normalize-space(.),${MuiUtils.escapeForXPath(text)})]`);
  }

  /**
   * Control matched on its accessible name OR its visible text.
   *
   * The employee directory's row actions are icon-only buttons whose meaning
   * lives entirely in aria-label/title. A text-only locator finds nothing and
   * the test reports "HR cannot edit employees" - a wrong answer rather than
   * a failed lookup. The same control may be captioned elsewhere, so both
   * are matched.
   */
  static controlByAccessibleName(page: Page, name: string): Locator {
    const escaped = MuiUtils.escapeForXPath(name);
    return MuiUtils.xpath(
      page,
      `//*[self::button or @role='button'][@aria-label=${escaped} or @title=${escaped}` +
        ` or normalize-space(.)=${escaped} or .//*[@aria-label=${escaped} or @title=${escaped}]]`,
    );
  }

  // ------------------------------------------------ check-in reminder

  /**
   * Closes the "Hello, you haven't checked in yet today" reminder if shown.
   *
   * The app floats this card over every page on a persona's first sign-in of
   * the day, so it appears in the first run each morning and never in a
   * rerun later that day - a textbook source of "fails only sometimes". Only
   * its close button is clicked: the card body navigates to Daily Check-In.
   *
   * @return true when a reminder was found and closed
   */
  static async dismissCheckInReminderIfShown(page: Page): Promise<boolean> {
    const closed = await page.evaluate(() => {
      const text = [...document.querySelectorAll('body *')].find(
        (e) => e.children.length === 0 && /checked in yet/i.test(e.textContent || ''),
      );
      if (!text) return false;
      let card = text.parentElement;
      while (card && !card.querySelector('button')) card = card.parentElement;
      if (!card || card === document.body) return false;
      (card.querySelector('button') as HTMLButtonElement).click();
      return true;
    });
    if (closed) {
      Log.warn('Closed the daily check-in reminder that was covering the page');
      await page.waitForTimeout(400);
    }
    return closed;
  }

  // ------------------------------------------------------ select handling

  /**
   * Picks an option from a MUI Select.
   *
   * The dropdown is portalled, so the sequence is: click the combobox, wait
   * for the listbox to mount at body level, click the option by its text.
   */
  static async selectOption(combobox: Locator, optionText: string): Promise<void> {
    Log.step(`Selecting '${optionText}' from dropdown`);
    const page = combobox.page();
    await MuiUtils.openDropdown(combobox);
    const option = MuiUtils.xpath(page, `//*[@role='option'][normalize-space(.)=${MuiUtils.escapeForXPath(optionText)}]`);
    if (!(await ElementUtils.isPresent(option))) {
      const available = await MuiUtils.availableOptions(page);
      await MuiUtils.closeDropdown(page);
      throw new FrameworkException(`Option '${optionText}' is not in the dropdown. Available options: ${available}`);
    }
    await MuiUtils.chooseOption(option, optionText);
  }

  /** Picks the first option whose text contains the fragment. */
  static async selectOptionContaining(combobox: Locator, fragment: string): Promise<void> {
    Log.step(`Selecting the option containing '${fragment}' from dropdown`);
    const page = combobox.page();
    await MuiUtils.openDropdown(combobox);
    const option = MuiUtils.firstOptionContaining(page, fragment);
    if (!(await ElementUtils.isPresent(option))) {
      const available = await MuiUtils.availableOptions(page);
      await MuiUtils.closeDropdown(page);
      throw new FrameworkException(`No option containing '${fragment}' in the dropdown. Available options: ${available}`);
    }
    await MuiUtils.chooseOption(option, fragment);
  }

  private static firstOptionContaining(page: Page, fragment: string): Locator {
    return MuiUtils.xpath(page, `(//*[@role='option'][contains(normalize-space(.),${MuiUtils.escapeForXPath(fragment)})])[1]`);
  }

  /**
   * Clicks a menu option and waits for the menu to dismiss.
   *
   * The menu closing is the only observable proof the option was taken; a
   * click that fails to register leaves it open, and every later locator
   * then has to fight a full-screen MUI backdrop. Retried once with the full
   * pointer sequence.
   */
  private static async chooseOption(option: Locator, description: string): Promise<void> {
    const page = option.page();
    const listbox = page.locator(MuiUtils.LISTBOX);
    await ElementUtils.click(option);
    if (await WaitUtils.isVisibleWithin(listbox, 3_000)) {
      Log.warn(`The menu stayed open after choosing '${description}' - replaying the full pointer sequence`);
      // Checked without waiting: if the option is already gone the menu is
      // closing and there is nothing to retry.
      if (await ElementUtils.isPresent(option)) {
        try {
          await ElementUtils.clickViaScript(option, 2_000);
        } catch {
          Log.warn(`The option for '${description}' detached during the retry - the menu was already closing`);
        }
      }
    }
    if (!(await WaitUtils.waitForInvisibleQuietly(listbox, 10_000))) {
      // Leaving an open menu behind would break the next interaction far
      // from here, so close it and report honestly.
      await ElementUtils.pressEscape(page);
      throw new FrameworkException(`The dropdown menu would not close after choosing '${description}'`);
    }
  }

  /**
   * Opens a dropdown and reads its options, leaving it OPEN so the caller can
   * choose with chooseOpenOptionContaining().
   *
   * For dropdowns inside a drawer: closing a menu sends Escape, which closes
   * the drawer as well, so read-then-close-then-reopen loses the form.
   */
  static async openAndReadOptions(combobox: Locator): Promise<string[]> {
    await MuiUtils.openDropdown(combobox);
    return MuiUtils.availableOptions(combobox.page());
  }

  /** Picks the first option containing the fragment from an already open menu. */
  static async chooseOpenOptionContaining(page: Page, fragment: string): Promise<void> {
    await MuiUtils.chooseOption(MuiUtils.firstOptionContaining(page, fragment), fragment);
  }

  /** Opens a dropdown, reads its options, closes it again. */
  static async readOptions(combobox: Locator): Promise<string[]> {
    await MuiUtils.openDropdown(combobox);
    const options = await MuiUtils.availableOptions(combobox.page());
    await MuiUtils.closeDropdown(combobox.page());
    return options;
  }

  /**
   * Dismisses an open menu without choosing anything.
   *
   * Escape is delivered to whatever holds focus, which after a scripted open
   * is not always the menu, so clicking the backdrop is the fallback. An open
   * menu left behind is not cosmetic: its full-screen backdrop intercepts
   * every subsequent click on the page.
   */
  static async closeDropdown(page: Page): Promise<void> {
    const listbox = page.locator(MuiUtils.LISTBOX);
    if (!(await ElementUtils.isDisplayed(listbox))) {
      return;
    }
    await ElementUtils.pressEscape(page);
    if (await WaitUtils.waitForInvisibleQuietly(listbox, 3_000)) {
      return;
    }
    Log.warn('The menu ignored Escape - dismissing it through the backdrop');
    const backdrop = page.locator(MuiUtils.BACKDROP);
    if (await ElementUtils.isPresent(backdrop)) {
      await ElementUtils.clickViaScript(backdrop);
    }
    if (!(await WaitUtils.waitForInvisibleQuietly(listbox, 5_000))) {
      throw new FrameworkException(
        'An open dropdown menu could not be dismissed - its backdrop will intercept every later interaction on this page',
      );
    }
  }

  /**
   * Opens a MUI Select and waits for its portalled menu.
   *
   * MUI binds the Select to onMouseDown rather than onClick. The native click
   * is tried first; the scripted fallback replays the whole pointer
   * sequence, which is what opens it when the native click is swallowed.
   */
  static async openDropdown(combobox: Locator): Promise<void> {
    const listbox = combobox.page().locator(MuiUtils.LISTBOX);
    await ElementUtils.click(combobox);
    if (await WaitUtils.isVisibleWithin(listbox, 5_000)) {
      return;
    }
    Log.warn('The dropdown did not open on the native click - replaying the full pointer sequence');
    await ElementUtils.clickViaScript(combobox);
    await WaitUtils.waitForVisible(listbox);
  }

  private static async availableOptions(page: Page): Promise<string[]> {
    return (await page.locator(MuiUtils.OPTION).allInnerTexts()).map((t) => t.trim());
  }

  /**
   * Types into a MUI Autocomplete and picks the suggestion matching the query.
   * Used by "Target Employee" on the Apply-for-Leave drawer, which filters
   * server-side as you type.
   */
  static async searchAndSelect(autocompleteInput: Locator, query: string): Promise<void> {
    Log.step(`Autocomplete search for '${query}'`);
    const page = autocompleteInput.page();
    const escaped = MuiUtils.escapeForXPath(query);
    await ElementUtils.type(autocompleteInput, query);
    await WaitUtils.waitForVisible(page.locator(MuiUtils.LISTBOX));

    // Wait for an option that actually MATCHES the query, then click that one
    // - never "whichever option is first". Focusing the field opens the list
    // unfiltered, so for a moment option one is simply the first employee in
    // the tenant; selecting it would record leave against the wrong person.
    const matching = MuiUtils.xpath(page, `//*[@role='option'][contains(normalize-space(.),${escaped})]`);
    try {
      await WaitUtils.poll(page, async () => (await matching.count()) > 0, 12_000, `No autocomplete option matched '${query}'`);
    } catch (e) {
      if (!(e instanceof WaitTimeoutException)) throw e;
      const available = await MuiUtils.availableOptions(page);
      await MuiUtils.closeDropdown(page);
      throw new FrameworkException(`No autocomplete option matched '${query}'. Offered: ${available}`, { cause: e });
    }

    // An option that IS the query wins over one that merely contains it:
    // searching "hr" also lists anyone whose name contains "hr".
    const exactMatch = MuiUtils.xpath(
      page,
      `(//*[@role='option'][normalize-space(.)=${escaped} or .//*[normalize-space(text())=${escaped}]])[1]`,
    );
    const firstMatch = MuiUtils.firstOptionContaining(page, query);
    await MuiUtils.chooseOption((await ElementUtils.isPresent(exactMatch)) ? exactMatch : firstMatch, query);
  }

  // -------------------------------------------------------- dialog handling

  static async isDialogOpen(page: Page): Promise<boolean> {
    return ElementUtils.isDisplayed(page.locator(MuiUtils.DIALOG));
  }

  static async waitForDialog(page: Page): Promise<void> {
    await WaitUtils.waitForVisible(page.locator(MuiUtils.DIALOG));
  }

  /**
   * Clicks a trigger and waits for its dialog, retrying with a scripted click
   * if the first attempt produced nothing.
   *
   * Several of this app's action buttons sit in headers that re-render as
   * their data resolves; a native click dispatched while that happens is
   * occasionally absorbed - no error, no dialog. The native click is still
   * tried first, deliberately: it is the only one of the two that would
   * catch a genuinely unclickable control.
   */
  static async openDialogFrom(trigger: Locator): Promise<void> {
    const dialog = trigger.page().locator(MuiUtils.DIALOG);
    await ElementUtils.click(trigger);
    if (await WaitUtils.isVisibleWithin(dialog, 6_000)) {
      return;
    }
    Log.warn('The dialog did not open on the native click - retrying with a scripted click');
    await ElementUtils.clickViaScript(trigger);
    await WaitUtils.waitForVisible(dialog);
  }

  static async waitForDialogToClose(page: Page): Promise<void> {
    await WaitUtils.waitForInvisible(page.locator(MuiUtils.DIALOG));
  }

  static async dialogText(page: Page): Promise<string> {
    return (await ElementUtils.find(page.locator(MuiUtils.DIALOG), WaitStrategy.VISIBLE)).innerText();
  }

  /**
   * A button inside the open dialog.
   *
   * Scoped to the dialog on purpose: "Delete" and "Cancel" also exist on the
   * page underneath, and an unscoped locator picks whichever comes first in
   * the DOM - a classic source of tests that pass for the wrong reason.
   */
  private static async dialogButton(page: Page, buttonText: string): Promise<Locator> {
    const dialog = await ElementUtils.find(page.locator(MuiUtils.DIALOG), WaitStrategy.VISIBLE);
    return dialog.locator(`xpath=.//button[normalize-space(.)=${MuiUtils.escapeForXPath(buttonText)}]`).first();
  }

  static async clickDialogButton(page: Page, buttonText: string): Promise<void> {
    await ElementUtils.click(await MuiUtils.dialogButton(page, buttonText));
  }

  static async clickDialogButtonViaScript(page: Page, buttonText: string): Promise<void> {
    await ElementUtils.clickViaScript(await MuiUtils.dialogButton(page, buttonText));
  }

  /**
   * Clicks a dialog button that is expected to dismiss the dialog, and
   * confirms it did.
   *
   * Retrying once with the full pointer sequence distinguishes "the click did
   * not land" from "the form was rejected" - if the dialog is still open
   * after the retry, the app really did refuse the submission and the caller
   * should inspect the validation messages.
   *
   * @return true when the dialog closed
   */
  static async clickDialogButtonAndWaitForClose(page: Page, buttonText: string): Promise<boolean> {
    await MuiUtils.clickDialogButton(page, buttonText);
    if (!(await MuiUtils.isDialogOpen(page)) || (await MuiUtils.waitForDialogToCloseQuietly(page, 8_000))) {
      return true;
    }
    Log.warn(`The dialog stayed open after '${buttonText}' - replaying the full pointer sequence`);
    await MuiUtils.clickDialogButtonViaScript(page, buttonText);
    return MuiUtils.waitForDialogToCloseQuietly(page, 10_000);
  }

  private static async waitForDialogToCloseQuietly(page: Page, timeoutMs: number): Promise<boolean> {
    return WaitUtils.pollQuietly(page, async () => !(await WaitUtils.anyVisible(page.locator(MuiUtils.DIALOG))), timeoutMs);
  }

  /**
   * Confirms a destructive action. The app uses a MUI confirmation dialog
   * rather than window.confirm(), so no browser dialog handling is involved.
   */
  static async confirmDestructiveAction(page: Page): Promise<void> {
    await MuiUtils.waitForDialog(page);
    await MuiUtils.clickDialogButton(page, 'Delete');
    await MuiUtils.waitForDialogToClose(page);
  }

  // ------------------------------------------------------ DataGrid handling

  static async waitForGrid(page: Page): Promise<void> {
    await WaitUtils.waitForVisible(page.locator(MuiUtils.DATA_GRID));
    await WaitUtils.waitForDataToSettle(page);
  }

  static async gridRowCount(page: Page): Promise<number> {
    return page.locator(MuiUtils.DATA_GRID_ROW).count();
  }

  /** Row containing the given text in any cell. */
  static gridRowContaining(page: Page, text: string): Locator {
    return MuiUtils.xpath(
      page,
      "//div[contains(@class,'MuiDataGrid-row')][.//div[contains(@class,'MuiDataGrid-cell')]" +
        `[contains(normalize-space(.),${MuiUtils.escapeForXPath(text)})]]`,
    );
  }

  /** A specific column cell within the row identified by rowText. */
  static gridCell(page: Page, rowText: string, columnField: string): Locator {
    return MuiUtils.xpath(
      page,
      "//div[contains(@class,'MuiDataGrid-row')][.//div[contains(@class,'MuiDataGrid-cell')]" +
        `[contains(normalize-space(.),${MuiUtils.escapeForXPath(rowText)})]]` +
        `//div[@data-field=${MuiUtils.escapeForXPath(columnField)}]`,
    );
  }

  static async gridHasRowContaining(page: Page, text: string): Promise<boolean> {
    return WaitUtils.isVisibleWithin(MuiUtils.gridRowContaining(page, text), 10_000);
  }

  /**
   * Reads the total row count from the pagination footer ("1-6 of 6").
   * More reliable than counting DOM rows, which only holds the current page
   * and, for a virtualised grid, only the rendered window of it.
   */
  static async gridTotalFromPagination(page: Page): Promise<number> {
    const displayedRows = page.locator('.MuiTablePagination-displayedRows');
    if (!(await ElementUtils.isPresent(displayedRows))) {
      return MuiUtils.gridRowCount(page);
    }
    const parts = (await ElementUtils.getText(displayedRows)).split('of');
    if (parts.length < 2) {
      return MuiUtils.gridRowCount(page);
    }
    return Number.parseInt(parts[1].replace(/[^0-9]/g, ''), 10);
  }

  // ------------------------------------------------------------- utilities

  /**
   * Makes a string safe as an XPath literal.
   *
   * XPath 1.0 has no escape character, so a value containing both quote
   * kinds has to be assembled with concat(). Role labels here really do
   * contain apostrophes and ampersands.
   */
  static escapeForXPath(value: string): string {
    if (!value.includes("'")) {
      return `'${value}'`;
    }
    if (!value.includes('"')) {
      return `"${value}"`;
    }
    return `concat(${value
      .split("'")
      .map((part) => `'${part}'`)
      .join(`, "'", `)})`;
  }

  /** Dismisses any open overlay so the next interaction is not intercepted. */
  static async dismissOverlays(page: Page): Promise<void> {
    if ((await MuiUtils.isDialogOpen(page)) || (await ElementUtils.isDisplayed(page.locator(MuiUtils.DRAWER)))) {
      await ElementUtils.pressEscape(page);
      await page.waitForTimeout(400);
    }
    if (await ElementUtils.isDisplayed(page.locator(MuiUtils.BACKDROP))) {
      await ElementUtils.pressEscape(page);
    }
  }
}
