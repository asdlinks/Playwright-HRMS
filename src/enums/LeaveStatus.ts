/** Leave request states as rendered in the Leave Management grid and tab strip. */
export class LeaveStatus {

    static readonly ALL = new LeaveStatus('ALL', 'All');
    static readonly PENDING = new LeaveStatus('PENDING', 'Pending');
    static readonly APPROVED = new LeaveStatus('APPROVED', 'Approved');
    static readonly REJECTED = new LeaveStatus('REJECTED', 'Rejected');
    static readonly CANCELLED = new LeaveStatus('CANCELLED', 'Cancelled');

    private constructor(readonly name: string, private readonly labelValue: string) {
    }

    static values(): LeaveStatus[] {
        return [LeaveStatus.ALL, LeaveStatus.PENDING, LeaveStatus.APPROVED,
            LeaveStatus.REJECTED, LeaveStatus.CANCELLED];
    }

    label(): string {
        return this.labelValue;
    }

    toString(): string {
        return this.name;
    }
}
