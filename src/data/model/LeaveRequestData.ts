import { LeaveType } from '../../enums/LeaveType';

/** Payload for the Apply-for-Leave drawer. */
export class LeaveRequestData {
    scenario?: string | null;
    targetEmployee?: string | null;
    leaveType: LeaveType | null = LeaveType.CASUAL;
    halfDay = false;
    startDate?: string | null;
    endDate?: string | null;
    reason?: string | null;
    expectedError?: string | null;

    static from(raw: Partial<LeaveRequestData>): LeaveRequestData {
        return Object.assign(new LeaveRequestData(), raw);
    }

    toString(): string {
        return this.scenario ?? `${this.leaveType} ${this.startDate} -> ${this.endDate}`;
    }
}
