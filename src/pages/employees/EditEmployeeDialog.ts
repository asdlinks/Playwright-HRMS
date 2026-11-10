import { Log } from '../../utils/Log';
import { MuiUtils } from '../../utils/MuiUtils';
import { BaseDialog } from '../base/BaseDialog';

/**
 * The "Edit Employee Details" dialog, used here read-only: it is the one
 * screen that shows back every value the onboarding wizard stored, split
 * across tabs (Basic Details, Identity Information, Banking Information,
 * Education, Employment History, References).
 *
 * Values are read as a flat snapshot - every input's value, every select's
 * displayed text, and the tab's visible text - rather than field by field.
 * The edit form labels some fields differently from the wizard ("Postal
 * Code" vs "PIN Code"), so "is this stored value shown on the tab" is the
 * robust question.
 *
 * isOpen(), cancel() and validationMessages() come from BaseDialog.
 */
export class EditEmployeeDialog extends BaseDialog {
  protected title(): string {
    return 'Edit Employee Details';
  }

  async openTab(tabName: string): Promise<this> {
    Log.step(`Edit dialog: opening the '${tabName}' tab`);
    await MuiUtils.clickDialogButtonViaScript(this.page, tabName);
    await this.page.waitForTimeout(800);
    return this;
  }

  /** True when the current tab shows the value anywhere. */
  async shows(expected: string): Promise<boolean> {
    const needle = expected.trim().toLowerCase();
    return (await this.snapshot()).some((v) => v.toLowerCase().includes(needle));
  }

  /**
   * Everything the current tab shows: input/textarea values (including
   * masked ones - a password-type input still holds the real value), select
   * captions, and the rendered text of list entries.
   */
  private snapshot(): Promise<string[]> {
    return this.page.evaluate(() => {
      const dialog = document.querySelector<HTMLElement>('.MuiDialog-root');
      if (!dialog) return [];
      const values = [...dialog.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea')]
        .filter((e) => e.type !== 'file' && e.type !== 'checkbox' && e.getAttribute('aria-hidden') !== 'true')
        .map((e) => e.value);
      const selects = [...dialog.querySelectorAll<HTMLElement>('[role=combobox]')].map(
        (e) => (e as HTMLInputElement).value || e.textContent || '',
      );
      return values
        .concat(selects, [dialog.innerText])
        .map((v) => (v || '').trim())
        .filter((v) => v.length > 0);
    });
  }
}
