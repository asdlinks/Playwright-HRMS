/**
 * Leave categories configured for tenant myc001.
 *
 * The dropdown and the grid label the same category differently ("Casual
 * Leave" vs "Casual"), so both spellings live here and page objects pick the
 * one their locator needs.
 */
export class LeaveType {

    static readonly CASUAL = new LeaveType('CASUAL', 'Casual Leave', 'Casual');
    static readonly SICK = new LeaveType('SICK', 'Sick Leave', 'Sick');
    static readonly PAID = new LeaveType('PAID', 'Paid Leave', 'Paid');

    private constructor(
        readonly name: string,
        private readonly optionLabelValue: string,
        private readonly gridLabelValue: string) {
    }

    static values(): LeaveType[] {
        return [LeaveType.CASUAL, LeaveType.SICK, LeaveType.PAID];
    }

    /** Label shown in the Apply-for-Leave "Leave Type" dropdown. */
    optionLabel(): string {
        return this.optionLabelValue;
    }

    /** Shorter label used by the leave grid and the balance cards. */
    gridLabel(): string {
        return this.gridLabelValue;
    }

    toString(): string {
        return this.name;
    }
}
