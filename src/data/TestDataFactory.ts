import { LeaveType } from '../enums/LeaveType';
import { DateUtils } from '../utils/DateUtils';
import { EmployeeData } from './model/EmployeeData';
import { LeaveRequestData } from './model/LeaveRequestData';

/**
 * Builds unique, valid test data at runtime.
 *
 * WHY NOT STATIC FIXTURES
 * -----------------------
 * The HRMS rejects duplicate employee emails and employee ids. A committed
 * fixture with a fixed email passes once, then fails on every subsequent run
 * against the same tenant - the classic "works on my machine, red in CI
 * tomorrow" failure. Every generated record therefore carries a timestamp and
 * a per-worker counter, which also makes it trivial to spot and clean up
 * automation-created rows in the test tenant.
 *
 * Static reference data that the tenant already owns (department "Sales",
 * designation "Brand head" ...) stays in JSON, because those are inputs the
 * tests select rather than create.
 */
let sequence = 0;

/** A random integer in [min, max). */
function randomBetween(min: number, max: number): number {
    return min + Math.floor(Math.random() * (max - min));
}

export const TestDataFactory = {

    /** Prefix on every automation-created record, for easy identification. */
    AUTOMATION_PREFIX: 'AT',

    /** Unique token, e.g. "AT_84213077_3". */
    uniqueToken(): string {
        return `${TestDataFactory.AUTOMATION_PREFIX}_${DateUtils.uniqueStamp()}_${++sequence}`;
    },

    uniqueEmail(): string {
        return `at.auto.${DateUtils.uniqueStamp()}${++sequence}@yopmail.com`;
    },

    uniqueDepartmentName(): string {
        return `${TestDataFactory.AUTOMATION_PREFIX} Dept ${DateUtils.uniqueStamp()}${++sequence}`;
    },

    uniqueHolidayName(): string {
        return `${TestDataFactory.AUTOMATION_PREFIX} Holiday ${DateUtils.uniqueStamp()}${++sequence}`;
    },

    /**
     * A fully valid employee payload using reference data that already exists
     * in tenant myc001.
     */
    validEmployee(): EmployeeData {
        const token = TestDataFactory.uniqueToken();
        return EmployeeData.from({
            scenario: 'Valid employee ' + token,
            fullName: `${TestDataFactory.AUTOMATION_PREFIX} Tester ${sequence}`,
            email: TestDataFactory.uniqueEmail(),
            dateOfBirth: DateUtils.forDateInput(new Date(1995, 5, 15)),
            department: 'Sales',
            designation: 'Brand head',
            employeeId: token,
            probationMonths: '3',
            joiningDate: DateUtils.forDateInput(DateUtils.today()),
            role: 'Employee',
            initialPassword: 'Automation@123',
        });
    },

    /** Employee payload targeted at a specific department. */
    validEmployeeIn(department: string): EmployeeData {
        const employee = TestDataFactory.validEmployee();
        employee.department = department;
        return employee;
    },

    /**
     * A single-day leave on a random weekday one to eleven months out.
     *
     * Randomised because the app will not record leave that overlaps an
     * existing request, and every run leaves one behind. A weekend draw is
     * re-rolled rather than moved to Monday: moving it made Mondays three times
     * as likely, and two runs did land on the same Monday.
     */
    singleDayLeave(targetEmployee: string | null): LeaveRequestData {
        let day: Date;
        do {
            day = DateUtils.daysFromToday(randomBetween(30, 330));
        } while (DateUtils.isoDayOfWeek(day) >= 6);
        return LeaveRequestData.from({
            scenario: 'Single day casual leave for ' + targetEmployee,
            targetEmployee,
            leaveType: LeaveType.CASUAL,
            startDate: DateUtils.forDateInput(day),
            endDate: DateUtils.forDateInput(day),
            reason: 'Automated regression check ' + TestDataFactory.uniqueToken(),
        });
    },

    leaveWithoutDates(targetEmployee: string): LeaveRequestData {
        return LeaveRequestData.from({
            scenario: 'Leave submitted with no dates',
            targetEmployee,
            leaveType: LeaveType.CASUAL,
            reason: 'Negative validation check',
        });
    },
};
