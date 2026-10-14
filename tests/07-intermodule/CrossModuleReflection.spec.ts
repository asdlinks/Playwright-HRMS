import { assertTrue } from '../../src/base/Assert';
import { test } from '../../src/base/BaseTest';
import { TestDataFactory } from '../../src/data/TestDataFactory';
import { AppModule } from '../../src/enums/AppModule';
import { LeaveStatus } from '../../src/enums/LeaveStatus';
import { Persona } from '../../src/enums/Persona';
import { BasePage } from '../../src/pages/base/BasePage';
import { DashboardPage } from '../../src/pages/dashboard/DashboardPage';
import { CompanyDocumentsPage } from '../../src/pages/documents/CompanyDocumentsPage';
import { DepartmentPage } from '../../src/pages/employees/DepartmentPage';
import { EmployeeDirectoryPage } from '../../src/pages/employees/EmployeeDirectoryPage';
import { HolidayCalendarPage } from '../../src/pages/timeleave/HolidayCalendarPage';
import { LeavesPage } from '../../src/pages/timeleave/LeavesPage';
import { DateUtils } from '../../src/utils/DateUtils';

/**
 * TC_XMOD - Inter-module data reflection.
 *
 * WHY THESE MATTER MORE THAN THE REST
 * -----------------------------------
 * An HRMS is a set of modules sharing one dataset. The interesting defects are
 * rarely "the page did not load" - they are "the department was created but
 * the directory still shows the old count". Every test here makes a change in
 * one module (hard-asserted: without it there is nothing to propagate) and
 * then checks each downstream module softly, so one run reports every module
 * the change failed to reach.
 *
 * Each test cleans up after itself so the suite can run repeatedly against the
 * same tenant.
 */
test.describe('CrossModuleReflectionTest', () => {

    test('TC_XMOD_01_newDepartmentPropagatesToDirectoryKpiAndFilterOptions', {
        tag: ['@smoke', '@intermodule', '@e2e', '@critical'],
        annotation: { type: 'description', description: 'TC_XMOD_01 - A department created in Department Management '
            + 'is reflected in the Employee Directory KPI and offered as a filter option' },
    }, async ({ base }) => {
        const departmentName = TestDataFactory.uniqueDepartmentName();

        base.step('Signing in as the Organization Administrator');
        await base.loginAs(Persona.ADMIN);

        base.step('Recording the Employee Directory department count before the change');
        await BasePage.navigateTo(AppModule.EMPLOYEE_DIRECTORY);
        const directory = new EmployeeDirectoryPage();
        const directoryCountBefore = await directory.departmentCount();
        base.note(`Employee Directory reports ${directoryCountBefore} departments`);

        const departments = new DepartmentPage();
        try {
            base.step(`MODULE 1 - creating the department '${departmentName}'`);
            await departments.open();
            const moduleCountBefore = await departments.departmentCount();
            await departments.createDepartment(departmentName);

            assertTrue(await departments.hasDepartment(departmentName),
                'The department was not created in its own module');
            await base.softly().assertTrue(
                await departments.waitForKpiCard(DepartmentPage.KPI_DEPARTMENTS, moduleCountBefore + 1),
                'Department Management did not increment its own count');

            base.step('MODULE 2 - verifying the Employee Directory KPI picked up the change');
            await directory.open();
            await base.softly().assertTrue(
                await directory.waitForKpiCard(EmployeeDirectoryPage.KPI_DEPARTMENTS, directoryCountBefore + 1),
                `The Employee Directory still reports ${await directory.departmentCount()} departments, `
                + `expected ${directoryCountBefore + 1}`);

            // The Dashboard's headcount chart plots only departments with
            // members, so a new empty department legitimately does not appear
            // there. The filter dropdown is built from the same reference data
            // and must still offer it.
            base.step('MODULE 2 - verifying the department is offered as a filter option');
            const filterOptions = await directory.availableDepartmentFilterOptions();
            base.note(`Department filter offers: [${filterOptions.join(', ')}]`);
            await base.softly().assertTrue(filterOptions.some(option => option.includes(departmentName)),
                `The new department '${departmentName}' is not offered by the department filter. `
                + `Options were: [${filterOptions.join(', ')}]`);

            base.assertAllSoft();
            base.verified('The new department reached Department Management, the Directory KPI '
                + 'and its filter options');
        } finally {
            await departments.deleteIfPresent(departmentName);
        }
    });

    test('TC_XMOD_02_newEmployeeRaisesHeadcountAcrossDirectoryDashboardAndDepartment', {
        tag: ['@smoke', '@intermodule', '@e2e', '@critical'],
        annotation: { type: 'description', description: 'TC_XMOD_02 - A newly registered employee raises the '
            + 'headcount consistently across the Directory, the Dashboard and their department' },
    }, async ({ base }) => {
        const employee = TestDataFactory.validEmployeeIn('Sales');

        base.step('Signing in as the Organization Administrator');
        const dashboard = await base.loginAs(Persona.ADMIN);

        base.step("Recording every module's headcount before the change");
        const directory = new EmployeeDirectoryPage();
        await directory.open();
        await base.skipIfTenantAtEmployeeLimit(directory);
        const directoryBefore = await directory.totalEmployees();

        await dashboard.open();
        const workforceBefore = await dashboard.totalWorkforce();

        const departments = new DepartmentPage();
        await departments.open();
        const salesBefore = await departments.headcountFor('Sales');
        base.note(`Before - Directory: ${directoryBefore}, Dashboard: ${workforceBefore}, Sales: ${salesBefore}`);
        await base.softly().assertEquals(directoryBefore, workforceBefore,
            `The Directory (${directoryBefore}) and the Dashboard (${workforceBefore}) disagree on headcount `
            + 'before any change');

        base.step(`MODULE 1 - registering ${employee.fullName} into Sales`);
        await directory.open();
        const dialog = await directory.openRegisterEmployeeDialog();
        await dialog.fill(employee);
        await dialog.saveExpectingSuccess();
        assertTrue(await directory.containsEmployeeIn(employee.department!, employee.fullName!),
            'The new employee is not listed in the directory');
        await base.softly().assertTrue(
            await directory.waitForKpiCard(EmployeeDirectoryPage.KPI_TOTAL_EMPLOYEES, directoryBefore + 1),
            `The Employee Directory reports ${await directory.totalEmployees()} employees, `
            + `expected ${directoryBefore + 1}`);

        base.step('MODULE 2 - verifying the Dashboard workforce figure rose by one');
        await dashboard.open();
        await base.softly().assertTrue(
            await dashboard.waitForKpiCard(DashboardPage.KPI_TOTAL_WORKFORCE, workforceBefore + 1),
            `The Dashboard reports a workforce of ${await dashboard.totalWorkforce()}, `
            + `expected ${workforceBefore + 1}`);

        base.step('MODULE 3 - verifying the Sales department absorbed the new member');
        await departments.open();
        const salesAfter = await departments.headcountFor('Sales');
        await base.softly().assertEquals(salesAfter, salesBefore + 1,
            `The Sales department reports ${salesAfter} members, expected ${salesBefore + 1}`);
        await base.softly().assertTrue(await departments.hasDepartment(employee.fullName!),
            'The new employee is not listed under the Sales department');

        base.note('The employee is left in place - the app offers deactivation rather than hard deletion, '
            + 'and removing a person is not something an unattended suite should do.');

        base.assertAllSoft();
        base.verified('The new employee raised the headcount consistently in all three modules');
    });

    test('TC_XMOD_03_newHolidayPropagatesToCalendarAndDashboardWidget', {
        tag: ['@smoke', '@intermodule', '@e2e'],
        annotation: { type: 'description', description: 'TC_XMOD_03 - A holiday added to the calendar is listed '
            + "there and promoted by the Dashboard's next-holiday widget" },
    }, async ({ base }) => {
        const holidayName = TestDataFactory.uniqueHolidayName();
        // Two days out, so it is the soonest upcoming holiday and therefore the
        // one the dashboard promotes.
        const holidayDate = DateUtils.forDateInput(2);

        base.step('Signing in as the Organization Administrator');
        const dashboard = await base.loginAs(Persona.ADMIN);
        base.note(`The Dashboard currently promotes: '${await dashboard.nextHolidayName()}'`);

        const holidays = new HolidayCalendarPage();
        base.step('Removing holidays left behind by earlier runs');
        await holidays.deleteLeftoverAutomationHolidays(TestDataFactory.AUTOMATION_PREFIX);
        try {
            base.step(`MODULE 1 - adding the holiday '${holidayName}' on ${holidayDate}`);
            await holidays.open();
            assertTrue(await holidays.isLoaded(), 'The Holiday Calendar did not load');
            assertTrue(await holidays.canAddHoliday(), 'The Administrator is not offered the Add Holiday control');
            await holidays.addHoliday(holidayName, holidayDate);
            assertTrue(await holidays.hasHoliday(holidayName),
                `The holiday '${holidayName}' is not listed in the calendar`);

            base.step('MODULE 2 - verifying the Dashboard promoted it as the next holiday');
            await dashboard.open();
            await base.softly().assertTrue(await dashboard.displaysText(holidayName),
                `The Dashboard does not show the new holiday '${holidayName}'. `
                + `It still promotes '${await dashboard.nextHolidayName()}'`);

            base.assertAllSoft();
            base.verified('The new holiday reached both the calendar and the Dashboard widget');
        } finally {
            await holidays.deleteIfPresent(holidayName);
        }
    });

    test('TC_XMOD_04_dashboardFiguresAgreeWithLeaveDirectoryAndDepartmentModules', {
        tag: ['@smoke', '@intermodule', '@critical'],
        annotation: { type: 'description', description: "TC_XMOD_04 - The Dashboard's pending-approval and "
            + 'workforce figures agree with the Leave, Employee Directory and Department modules' },
    }, async ({ base }) => {
        base.step('Signing in as the Organization Administrator and reading the Dashboard');
        const dashboard = await base.loginAs(Persona.ADMIN);

        const dashboardPending = await dashboard.pendingRequests();
        const dashboardWorkforce = await dashboard.totalWorkforce();
        base.note(`Dashboard - pending: ${dashboardPending}, workforce: ${dashboardWorkforce}`);
        // Hard: every comparison below is against these two figures.
        assertTrue(dashboardPending >= 0, 'The Dashboard pending-requests KPI did not resolve');
        assertTrue(dashboardWorkforce > 0, 'The Dashboard workforce KPI did not resolve');
        await base.softly().assertTrue(await dashboard.hasPendingApprovalsWidget(),
            'The Pending Approvals widget is missing from the Dashboard');

        base.step('Leave Management - pending count');
        await BasePage.navigateTo(AppModule.LEAVES);
        const leaves = new LeavesPage();
        if (await base.softlyLoaded(leaves, 'Leave Management')) {
            const leavePending = await leaves.tabCount(LeaveStatus.PENDING);
            base.note('Leave module pending: ' + leavePending);
            await base.softly().assertEquals(dashboardPending, leavePending,
                `The Dashboard reports ${dashboardPending} pending requests but the Leave module reports `
                + leavePending);
        }

        base.step('Employee Directory - headcount');
        await BasePage.navigateTo(AppModule.EMPLOYEE_DIRECTORY);
        const directoryTotal = await new EmployeeDirectoryPage().totalEmployees();
        base.note('Employee Directory headcount: ' + directoryTotal);
        await base.softly().assertEquals(directoryTotal, dashboardWorkforce,
            `The Employee Directory reports ${directoryTotal} but the Dashboard reports ${dashboardWorkforce}`);

        base.step('Department Management - headcount');
        await BasePage.navigateTo(AppModule.DEPARTMENT);
        const departmentTotal = await new DepartmentPage().totalEmployees();
        base.note('Department module headcount: ' + departmentTotal);
        await base.softly().assertEquals(departmentTotal, dashboardWorkforce,
            `The Department module reports ${departmentTotal} but the Dashboard reports ${dashboardWorkforce}`);

        base.assertAllSoft();
        base.verified('The Dashboard agrees with the Leave, Directory and Department modules');
    });

    test('TC_XMOD_05_publishedDocumentsAreVisibleToBothPersonasWithMetadata', {
        tag: ['@smoke', '@intermodule', '@documents'],
        annotation: { type: 'description', description: 'TC_XMOD_05 - Company Documents published by the '
            + 'Administrator are visible to HR with full column metadata' },
    }, async ({ base }) => {
        base.step('Signing in as the Organization Administrator and opening Company Documents');
        await base.loginAndOpen(Persona.ADMIN, AppModule.COMPANY_DOCUMENTS);

        const adminDocuments = new CompanyDocumentsPage();
        assertTrue(await adminDocuments.isLoaded(), 'Company Documents did not load for the Administrator');

        await base.softly().assertTrue(await adminDocuments.hasAllExpectedColumns(),
            `The document grid is missing columns: [${(await adminDocuments.missingColumns()).join(', ')}]`);

        const adminVisibleCount = await adminDocuments.documentCount();
        base.note(`The Administrator can see ${adminVisibleCount} active document(s)`);
        // Hard: with nothing published there is nothing to compare across personas.
        assertTrue(adminVisibleCount > 0,
            'No documents are published in this tenant, so cross-persona visibility cannot be verified');

        base.step('Verifying the upload dialog exposes its publishing controls');
        await adminDocuments.openUploadDialog();
        await base.softly().assertEquals(await adminDocuments.uploadDialogTitle(), 'Upload Document',
            'The upload dialog has an unexpected title');
        await base.softly().assertTrue(await adminDocuments.uploadDialogHasAllFields(),
            'The upload dialog is missing one of Title / Category / Effective Date / Share with All Employees');
        await adminDocuments.closeUploadDialog();

        base.step('Signing out and signing in as the HR Administrator');
        await new DashboardPage().header().logout();
        await base.loginAndOpen(Persona.HR, AppModule.COMPANY_DOCUMENTS);

        const hrDocuments = new CompanyDocumentsPage();
        assertTrue(await hrDocuments.isLoaded(), 'Company Documents did not load for HR');

        base.step('Verifying HR sees the same documents and holds the publishing right');
        const hrVisibleCount = await hrDocuments.documentCount();
        await base.softly().assertEquals(hrVisibleCount, adminVisibleCount,
            `HR can see ${hrVisibleCount} document(s) but the Administrator sees ${adminVisibleCount}`);
        await base.softly().assertTrue(await hrDocuments.canUpload(), 'HR is not offered the Upload Document control');

        base.assertAllSoft();
        base.verified('Published documents and the publishing right reach both personas');
    });
});
