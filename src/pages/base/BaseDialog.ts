import { WaitStrategy } from '../../enums/WaitStrategy';
import { ElementUtils } from '../../utils/ElementUtils';
import { MuiUtils } from '../../utils/MuiUtils';
import { WaitUtils } from '../../utils/WaitUtils';
import { BaseComponent } from './BaseComponent';

/**
 * A MUI modal dialog (role="dialog"), identified by its title.
 *
 * Holds what every dialog shares - "is it open", its text, its inline
 * validation messages and a way to dismiss it - so each concrete dialog only
 * adds the fields and actions that are specific to it.
 */
export abstract class BaseDialog extends BaseComponent {
  /** Text in the dialog's header that identifies this dialog. */
  protected abstract title(): string;

  async isDisplayed(): Promise<boolean> {
    return (await MuiUtils.isDialogOpen(this.page)) && (await MuiUtils.dialogText(this.page)).includes(this.title());
  }

  /** Alias of isDisplayed() that reads naturally for a dialog. */
  isOpen(): Promise<boolean> {
    return this.isDisplayed();
  }

  /** Visible text of the dialog. Excludes the values typed into inputs. */
  text(): Promise<string> {
    return MuiUtils.dialogText(this.page);
  }

  /** Inline field errors currently shown, de-duplicated, in screen order. */
  validationMessages(): Promise<string[]> {
    return ElementUtils.distinctTexts(this.page.locator(MuiUtils.FIELD_ERROR));
  }

  /**
   * Closes the dialog without saving: Cancel or Close, whichever the current
   * footer offers, then Escape and overlay clean-up as a fallback.
   */
  async cancel(): Promise<void> {
    if (await MuiUtils.isDialogOpen(this.page)) {
      const dialog = await ElementUtils.find(this.page.locator(MuiUtils.DIALOG), WaitStrategy.VISIBLE);
      const buttons = dialog.locator('button');
      const index = (await buttons.allInnerTexts()).findIndex((t) => /^(cancel|close)$/i.test(t.trim()));
      if (index >= 0) {
        await ElementUtils.clickViaScript(buttons.nth(index));
      }
      await WaitUtils.waitForInvisibleQuietly(this.page.locator(MuiUtils.DIALOG), 5_000);
    }
    await MuiUtils.dismissOverlays(this.page);
  }
}
