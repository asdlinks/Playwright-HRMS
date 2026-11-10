import { LeaveType } from '../enums/LeaveType';
import { DateUtils } from '../utils/DateUtils';
import { LeaveRequestData } from './model/LeaveRequestData';

/**
 * Builds unique, valid test data at runtime.
 *
 * WHY NOT STATIC FIXTURES
 * -----------------------
 * The HRMS rejects duplicate names (departments, for one). A committed
 * fixture with a fixed name passes once, then fails on every later run
 * against the same tenant. Every generated record therefore carries a
 * timestamp and a per-process counter, which also makes automation-created
 * rows easy to spot and clean up in the test tenant.
 *
 * Realistic people (the onboarding tests) and reference data the tenant
 * already owns stay in JSON under testdata/, because those are inputs the
 * tests read rather than invent.
 */
export class TestDataFactory {
  /** Prefix on every automation-created record, for easy identification. */
  static readonly AUTOMATION_PREFIX = 'AT';

  private static sequence = 0;

  private constructor() {}

  /** Unique token, e.g. "AT_84213077_3". */
  static uniqueToken(): string {
    return `${TestDataFactory.AUTOMATION_PREFIX}_${DateUtils.uniqueStamp()}_${++TestDataFactory.sequence}`;
  }

  static uniqueDepartmentName(): string {
    return `${TestDataFactory.AUTOMATION_PREFIX} Dept ${DateUtils.uniqueStamp()}${++TestDataFactory.sequence}`;
  }

  static leaveWithoutDates(targetEmployee: string): LeaveRequestData {
    return {
      scenario: 'Leave submitted with no dates',
      targetEmployee,
      leaveType: LeaveType.CASUAL,
      reason: 'Negative validation check',
    };
  }
}
