/**
 * Date formatting for the three representations this app mixes:
 *
 *   - native <input type="date"> typed as mm/dd/yyyy in an en-US browser
 *   - grid / calendar text such as "26 Sept 2026"
 *   - holiday cards such as "Fri Oct 02 2026"
 *
 * Tests build dates relative to today rather than hardcoding them, so the
 * suite stays green tomorrow.
 *
 * Dates are plain local-time Date objects at midnight. Month names come from
 * a fixed table rather than Intl: depending on the ICU version, Intl says
 * "Sept" or "Sep", and the grid helpers below rely on the three-letter form.
 */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const pad = (value: number) => String(value).padStart(2, '0');

export const DateUtils = {

    today(): Date {
        const now = new Date();
        return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    },

    daysFromToday(days: number): Date {
        const date = DateUtils.today();
        date.setDate(date.getDate() + days);
        return date;
    },

    /** What a native date input expects when typed into, in an en-US browser: mm/dd/yyyy. */
    forDateInput(dateOrDaysFromToday: Date | number): string {
        const date = typeof dateOrDaysFromToday === 'number'
            ? DateUtils.daysFromToday(dateOrDaysFromToday)
            : dateOrDaysFromToday;
        return `${pad(date.getMonth() + 1)}/${pad(date.getDate())}/${date.getFullYear()}`;
    },

    /** ISO form, used when a date is set through the DOM value property. */
    iso(dateOrDaysFromToday: Date | number): string {
        const date = typeof dateOrDaysFromToday === 'number'
            ? DateUtils.daysFromToday(dateOrDaysFromToday)
            : dateOrDaysFromToday;
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    },

    /** 1 = Monday ... 7 = Sunday, as java.time numbers the days. */
    isoDayOfWeek(date: Date): number {
        return date.getDay() === 0 ? 7 : date.getDay();
    },

    /**
     * A future weekday, skipping Saturday and Sunday.
     *
     * Leave applied on a weekly off behaves differently (the app treats those
     * days as non-working), so tests that assert on leave-day arithmetic need
     * a working day to be meaningful.
     */
    nextWorkingDay(minimumDaysAhead: number): Date {
        const candidate = DateUtils.daysFromToday(minimumDaysAhead);
        while (DateUtils.isoDayOfWeek(candidate) >= 6) {
            candidate.setDate(candidate.getDate() + 1);
        }
        return candidate;
    },

    /** Parses the mm/dd/yyyy form the leave drawer is filled with. */
    fromDateInput(value: string): Date {
        const [month, day, year] = value.split('/').map(part => Number.parseInt(part, 10));
        return new Date(year, month - 1, day);
    },

    /**
     * Day and abbreviated month as the grid shows them, e.g. "28 Sep".
     *
     * Deliberately three letters: the app renders September as "Sept", and
     * "28 Sep" is a prefix of both spellings.
     */
    gridDayMonth(date: Date): string {
        return `${date.getDate()} ${MONTHS[date.getMonth()]}`;
    },

    /** "d MMM yyyy" with a three-letter month, e.g. "28 Sep 2026". */
    gridDate(date: Date): string {
        return `${DateUtils.gridDayMonth(date)} ${date.getFullYear()}`;
    },

    currentYear(): string {
        return String(new Date().getFullYear());
    },

    /** Compact stamp used to keep generated test data unique. */
    uniqueStamp(): string {
        return String(Date.now() % 100000000);
    },
};
