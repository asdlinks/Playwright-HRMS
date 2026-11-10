/** Leave request states as rendered in the Leave Management grid and tab strip. */
export class LeaveStatus {
  static readonly ALL = new LeaveStatus('All');
  static readonly PENDING = new LeaveStatus('Pending');
  static readonly APPROVED = new LeaveStatus('Approved');
  static readonly REJECTED = new LeaveStatus('Rejected');
  static readonly CANCELLED = new LeaveStatus('Cancelled');

  private constructor(readonly label: string) {}

  static values(): LeaveStatus[] {
    return [LeaveStatus.ALL, LeaveStatus.PENDING, LeaveStatus.APPROVED, LeaveStatus.REJECTED, LeaveStatus.CANCELLED];
  }

  toString(): string {
    return this.label;
  }
}
