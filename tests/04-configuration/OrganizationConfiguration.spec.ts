import { assertTrue } from '../../src/base/Assert';
import { test } from '../../src/base/BaseTest';
import { AppModule } from '../../src/enums/AppModule';
import { Persona } from '../../src/enums/Persona';
import { SettingsPanel } from '../../src/enums/SettingsPanel';
import { BasePage } from '../../src/pages/base/BasePage';
import { GenericModulePage } from '../../src/pages/base/GenericModulePage';
import { EmployeeDirectoryPage } from '../../src/pages/employees/EmployeeDirectoryPage';
import { SettingsPage } from '../../src/pages/settings/SettingsPage';
import { HolidayCalendarPage } from '../../src/pages/timeleave/HolidayCalendarPage';

/**
 * TC_CFG - Organization configuration that other modules depend on.
 *
 * Branches, designations, employment types, shifts and work modes are the
 * reference data the rest of the HRMS is built from - an employee cannot be
 * registered without a department and a designation, and attendance cannot be
 * evaluated without a shift.
 *
 * Each test sweeps one configuration area in a single session. A page that
 * fails to load is recorded as a failure and its own checks are skipped, but
 * the sweep carries on, so one run reports the state of the whole area.
 */
test.describe('OrganizationConfigurationTest', () => {

    test('TC_CFG_01_organizationSetupExposesReferenceDataAndCompanyProfile', {
        tag: ['@smoke', '@configuration', '@critical'],
        annotation: { type: 'description', description: 'TC_CFG_01 - Organization Structure exposes the reference '
            + 'data other modules consume, and the Company Profile carries the locale and financial-year settings '
            + 'payroll derives from' },
    }, async ({ base }) => {
        base.step('Signing in as the Organization Administrator');
        await base.loginAs(Persona.ADMIN);

        base.step('Organization Structure - reference-data tabs and a configured branch');
        await BasePage.navigateTo(AppModule.ORGANIZATION_STRUCTURE);
        const structure = new GenericModulePage(AppModule.ORGANIZATION_STRUCTURE);
        if (await base.softlyLoaded(structure, 'Organization Structure')) {
            for (const tab of ['Branches', 'Designations', 'Employment Types']) {
                await base.softly().assertTrue(await structure.displaysTextImmediately(tab),
                    `The '${tab}' tab is missing from Organization Structure`);
            }
            await base.softly().assertTrue(await structure.displaysTextImmediately('Attendance'),
                'Organization Structure does not describe its relationship to Attendance');
            await base.softly().assertTrue(await structure.displaysText('Thrissur'),
                'No branch is configured - employees cannot be assigned a location');
        }

        base.step('Company Profile - locale and financial year');
        await BasePage.navigateTo(AppModule.SETTINGS);
        const settings = new SettingsPage();
        assertTrue(await settings.isLoaded(), 'The Settings page did not load');
        await settings.openPanel(SettingsPanel.COMPANY_PROFILE);
        assertTrue(await settings.isPanelOpen(SettingsPanel.COMPANY_PROFILE),
            `The Company Profile panel did not open - the panel shows '${await settings.openPanelHeading()}'`);

        for (const expected of ['Locale & Financial Year', 'INR', 'DD/MM/YYYY', 'April', 'payslips',
            'Save Company Profile']) {
            await base.softly().assertTrue(await settings.displaysTextImmediately(expected),
                `The Company Profile does not show '${expected}'`);
        }

        base.assertAllSoft();
        base.verified('Organization Structure and the Company Profile carry the reference data '
            + 'other modules depend on');
    });

    test('TC_CFG_02_attendanceIsConfiguredAcrossShiftsWorkModesPoliciesAndHolidays', {
        tag: ['@smoke', '@configuration'],
        annotation: { type: 'description', description: 'TC_CFG_02 - Attendance is fully configured: shifts, work '
            + 'modes, policies binding them, the Daily Check-In calendar and the holiday calendar' },
    }, async ({ base }) => {
        base.step('Signing in as the Organization Administrator');
        await base.loginAs(Persona.ADMIN);

        base.step('Shift Management - working hours and assignment');
        await BasePage.navigateTo(AppModule.SHIFTS);
        const shifts = new GenericModulePage(AppModule.SHIFTS);
        if (await base.softlyLoaded(shifts, 'Shift Management')) {
            await base.softly().assertTrue(await shifts.displaysText('General Shift'),
                'No shift is defined - attendance has no working hours to evaluate against');
            await base.softly().assertTrue(await shifts.displaysTextImmediately('Assign Shift to Employee'),
                'The shift assignment section is missing');
            await base.softly().assertTrue(await shifts.displaysTextImmediately('Effective From'),
                'The Effective From control is missing from shift assignment');
        }

        base.step('Work Modes - the five standard modes');
        await BasePage.navigateTo(AppModule.WORK_MODES);
        const workModes = new GenericModulePage(AppModule.WORK_MODES);
        if (await base.softlyLoaded(workModes, 'Work Modes')) {
            for (const mode of ['Office', 'Work From Home', 'Hybrid', 'Client Visit', 'Field Work']) {
                await base.softly().assertTrue(await workModes.displaysTextImmediately(mode),
                    `The '${mode}' work mode is not configured`);
            }
            await base.softly().assertTrue(await workModes.displaysTextImmediately('attendance policies'),
                'Work Modes does not describe its relationship to attendance policies');
        }

        base.step('Attendance Policies - check-in methods bound to work modes');
        await BasePage.navigateTo(AppModule.ATTENDANCE_POLICIES);
        const policies = new GenericModulePage(AppModule.ATTENDANCE_POLICIES);
        if (await base.softlyLoaded(policies, 'Attendance Policies')) {
            for (const column of ['Name', 'Type', 'Allowed Methods', 'Assigned', 'Status']) {
                await base.softly().assertTrue(await policies.displaysTextImmediately(column),
                    `The '${column}' column is missing from the policy table`);
            }
            await base.softly().assertTrue(await policies.displaysTextImmediately('Field Work')
                    || await policies.displaysTextImmediately('Client Visit'),
                'No policy references a configured work mode');
            await base.softly().assertTrue(await policies.displaysTextImmediately('New Policy'),
                'The New Policy control is missing');
        }

        base.step('Daily Check-In - monthly summary and legend');
        await BasePage.navigateTo(AppModule.DAILY_CHECK_IN);
        const checkIn = new GenericModulePage(AppModule.DAILY_CHECK_IN);
        if (await base.softlyLoaded(checkIn, 'Daily Check-In')) {
            for (const label of ['Present Days', 'On Leave', 'Absent Days', 'Attendance Rate', 'Present',
                'Leave', 'Absent', 'Holiday', 'Attendance History']) {
                await base.softly().assertTrue(await checkIn.displaysTextImmediately(label),
                    `'${label}' is missing from Daily Check-In`);
            }
        }

        base.step('Holiday Calendar - populated, scoped by location, editable');
        await BasePage.navigateTo(AppModule.HOLIDAY_CALENDAR);
        const holidays = new HolidayCalendarPage();
        if (await base.softlyLoaded(holidays, 'Holiday Calendar')) {
            const count = await holidays.holidayCountThisYear();
            base.note('Holidays configured this year: ' + count);
            await base.softly().assertTrue(count > 0,
                'No holidays are configured this year - attendance has no off-days to apply');
            await base.softly().assertTrue(await holidays.displaysTextImmediately('Next Holiday'),
                'The Next Holiday card is missing from the calendar');
            await base.softly().assertTrue(await holidays.hasLocationFilter(),
                'The Location filter is missing - holidays cannot be scoped per office');
            await base.softly().assertTrue(await holidays.canAddHoliday(),
                'The Add Holiday control is missing for the Administrator');
        }

        base.assertAllSoft();
        base.verified('Shifts, work modes, policies, check-in and holidays are all configured');
    });

    test('TC_CFG_03_reportsWorkspaceAggregatesFiguresConsistentWithTheDirectory', {
        tag: ['@smoke', '@configuration', '@reports'],
        annotation: { type: 'description', description: 'TC_CFG_03 - The Reports workspace aggregates live figures '
            + 'from every operational module, consistent with the Employee Directory' },
    }, async ({ base }) => {
        base.step('Signing in as the Organization Administrator and opening Reports');
        await base.loginAndOpen(Persona.ADMIN, AppModule.REPORTS);

        const reports = new GenericModulePage(AppModule.REPORTS);
        assertTrue(await reports.isLoaded(), 'The Reports workspace did not load');

        base.step('Verifying the KPI strip, analytics workspaces and charts');
        // The KPI strip renders after the page shell, so these checks wait for
        // it; an immediate read of the first card races the data fetch.
        for (const kpi of ['Total Employees', 'Present Today', 'On Leave', 'Pending Approvals', 'New Joiners (MTD)']) {
            await base.softly().assertTrue(await reports.displaysText(kpi),
                `The '${kpi}' figure is missing from the executive dashboard`);
        }
        for (const workspace of ['Employees', 'Attendance', 'Leave', 'Payroll', 'Organization', 'Compliance']) {
            await base.softly().assertTrue(await reports.displaysTextImmediately(workspace),
                `The '${workspace}' analytics workspace is missing`);
        }
        for (const chart of ['Department Distribution', 'Work Mode Distribution']) {
            await base.softly().assertTrue(await reports.displaysTextImmediately(chart),
                `The ${chart} chart is missing`);
        }

        base.step('Verifying the reported headcount agrees with the Employee Directory');
        const reported = await reports.readSettledKpiCard('Total Employees');
        await BasePage.navigateTo(AppModule.EMPLOYEE_DIRECTORY);
        const directory = await new EmployeeDirectoryPage().totalEmployees();
        base.note(`Headcount - Reports: ${reported}, Directory: ${directory}`);
        await base.softly().assertEquals(reported, directory,
            `Reports claims ${reported} employees but the Employee Directory reports ${directory}`);

        base.assertAllSoft();
        base.verified('The Reports workspace aggregates consistent figures across modules');
    });
});
