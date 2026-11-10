const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const pad = (value: number): string => String(value).padStart(2, '0');

/**
 * Date formatting for the representations this app mixes:
 *
 *   - native <input type="date">, displayed mm/dd/yyyy in an en-US browser
 *     but stored (and filled by Playwright) as yyyy-MM-dd
 *   - grid / calendar text such as "26 Sept 2026"
 *
 * All dates are local calendar dates at midnight - never parsed through
 * `new Date("yyyy-MM-dd")`, which is UTC and shifts the day in some zones.
 * Tests build dates relative to today rather than hardcoding them, so the
 * suite stays green tomorrow.
 */
export class DateUtils {
  private constructor() {}

  static today(): Date {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }

  static daysFromToday(days: number): Date {
    const date = DateUtils.today();
    date.setDate(date.getDate() + days);
    return date;
  }

  /** Parses yyyy-MM-dd as a local date. */
  static parseIso(iso: string): Date {
    const [year, month, day] = iso.split('-').map(Number);
    return new Date(year, month - 1, day);
  }

  /** mm/dd/yyyy - what a native date input shows in an en-US browser. */
  static forDateInput(date: Date | number): string {
    const d = typeof date === 'number' ? DateUtils.daysFromToday(date) : date;
    return `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()}`;
  }

  /** yyyy-MM-dd. */
  static iso(date: Date | number): string {
    const d = typeof date === 'number' ? DateUtils.daysFromToday(date) : date;
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  /** Converts mm/dd/yyyy to the yyyy-MM-dd a date input stores internally. */
  static dateInputToIso(mmddyyyy: string): string {
    const parts = mmddyyyy.split('/');
    return parts.length === 3 ? `${parts[2]}-${parts[0]}-${parts[1]}` : mmddyyyy;
  }

  /** Parses the mm/dd/yyyy form the leave drawer is filled with. */
  static fromDateInput(mmddyyyy: string): Date {
    return DateUtils.parseIso(DateUtils.dateInputToIso(mmddyyyy));
  }

  /**
   * A future weekday, skipping Saturday and Sunday.
   *
   * Leave applied on a weekly off behaves differently (the app treats those
   * days as non-working), so tests that assert on leave-day arithmetic need
   * a working day to be meaningful.
   */
  static nextWorkingDay(minimumDaysAhead: number): Date {
    const candidate = DateUtils.daysFromToday(minimumDaysAhead);
    while (candidate.getDay() === 0 || candidate.getDay() === 6) {
      candidate.setDate(candidate.getDate() + 1);
    }
    return candidate;
  }

  /**
   * Day and abbreviated month as the grid shows them, e.g. "28 Sep".
   * Deliberately three letters: the app renders September as "Sept", and
   * "28 Sep" is a prefix of both spellings.
   */
  static gridDayMonth(date: Date): string {
    return `${date.getDate()} ${MONTHS[date.getMonth()]}`;
  }

  /** "dd MMM yyyy", e.g. "02 Nov 2026" - the profile page's date format. */
  static profileDate(iso: string): string {
    const d = DateUtils.parseIso(iso);
    return `${pad(d.getDate())} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  }

  static currentYear(): string {
    return String(new Date().getFullYear());
  }

  /** Compact stamp used to keep generated test data unique. */
  static uniqueStamp(): string {
    return String(Date.now() % 100_000_000);
  }

  /** Ten digits, "MMddHHmmss" - the stamp OnboardingEmployee.withRunStamp() expects. */
  static runStamp(): string {
    const n = new Date();
    return `${pad(n.getMonth() + 1)}${pad(n.getDate())}${pad(n.getHours())}${pad(n.getMinutes())}${pad(n.getSeconds())}`;
  }
}
