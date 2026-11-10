import { LeaveType } from '../../enums/LeaveType';

/** Payload for the Apply-for-Leave drawer. Dates are mm/dd/yyyy. */
export interface LeaveRequestData {
  scenario?: string;
  targetEmployee?: string;
  leaveType?: LeaveType;
  halfDay?: boolean;
  startDate?: string;
  endDate?: string;
  reason?: string;
  expectedError?: string;
}

export function describeLeaveRequest(data: LeaveRequestData): string {
  return data.scenario ?? `${data.leaveType ?? LeaveType.CASUAL} ${data.startDate} -> ${data.endDate}`;
}
