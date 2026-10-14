import { assertEquals, assertTrue } from '../../src/base/Assert';
import { test } from '../../src/base/BaseTest';
import { TestDataFactory } from '../../src/data/TestDataFactory';
import { JsonDataReader } from '../../src/data/reader/JsonDataReader';
import { AppModule } from '../../src/enums/AppModule';
import { Persona } from '../../src/enums/Persona';
import { DepartmentPage } from '../../src/pages/employees/DepartmentPage';
import { EmployeeDirectoryPage } from '../../src/pages/employees/EmployeeDirectoryPage';

/**
 * TC_EMP - Employee directory and department management.
 *
 * Tests that create data use TestDataFactory, so every record is unique and
 * prefixed "AT" - the suite can be run repeatedly against the same tenant,
 * and anything it leaves behind is identifiable.
 */
test.describe('EmployeeManagementTest', () => {

    test('TC_EMP_01_directoryRendersCompletelyAndSearchAndFilterNarrowResults', {
        tag: ['@smoke', '@employee', '@critical'],
        annotation: { type: 'description', description: 'TC_EMP_01 - The Employee Directory renders its KPI strip, '
            + 'filters and controls, and search and department filtering narrow the results' },
    }, async ({ base }) => {
        base.step('Signing in as the Organization Administrator and opening the directory');
        await base.loginAndOpen(Persona.ADMIN, AppModule.EMPLOYEE_DIRECTORY);

        const directory = new EmployeeDirectoryPage();
        assertTrue(await directory.isLoaded(), 'The Employee Directory did not load');

        base.step('Verifying the KPI strip reports real figures');
        const totalEmployees = await directory.totalEmployees();
        const departments = await directory.departmentCount();
        base.note(`Directory KPIs - employees: ${totalEmployees}, departments: ${departments}, `
            + `managers: ${await directory.managerCount()}, new joiners: ${await directory.newJoinersThisMonth()}`);
        await base.softly().assertTrue(totalEmployees > 0,
            `The directory reports ${totalEmployees} employees - the KPI did not resolve`);
        await base.softly().assertTrue(departments > 0, `The directory reports ${departments} departments`);

        base.step('Verifying the filters and administration controls');
        await base.softly().assertTrue(await directory.allFiltersDisplayed(),
            'One or more of the Department / Branch / Designation / Employment Type / Role filters is missing');
        await base.softly().assertTrue(await directory.canAddEmployee(), 'The Add New Employee control is missing');
        await base.softly().assertTrue(await directory.canExport(), 'The Export control is missing');

        // Hard: the search checks below are meaningless without a known employee.
        base.step('Confirming a known seeded employee is present before filtering');
        assertTrue(await directory.showsEmployee('hr'), "The seeded employee 'hr' is not in the unfiltered directory");

        base.step('Searching for a name that cannot match anything');
        await directory.searchByName('zzz_no_such_employee_zzz');
        await base.softly().assertFalse(await directory.showsEmployeeImmediately('hr'),
            "A search with no possible match still shows 'hr' - the name filter is not applied");

        base.step('Clearing the search and confirming the directory is restored');
        await directory.clearNameSearch();
        await base.softly().assertTrue(await directory.showsEmployee('hr'),
            'Clearing the search did not restore the full directory');

        base.step('Filtering by the HR department');
        await directory.filterByDepartment('HR');
        await base.softly().assertTrue(await directory.showsEmployee('hr'),
            'Filtering by the HR department hid the employee who belongs to it');

        base.assertAllSoft();
        base.verified('The directory renders completely and search and filtering narrow correctly');
    });

    test('TC_EMP_02_administratorRegistersEmployeeAndDirectoryReflectsIt', {
        tag: ['@smoke', '@employee', '@e2e', '@critical'],
        annotation: { type: 'description', description: 'TC_EMP_02 - The Administrator registers a new employee '
            + 'end to end and the record appears in the directory with the headcount raised' },
    }, async ({ base }) => {
        base.step('Signing in as the Organization Administrator and opening the directory');
        await base.loginAndOpen(Persona.ADMIN, AppModule.EMPLOYEE_DIRECTORY);

        const directory = new EmployeeDirectoryPage();
        await base.skipIfTenantAtEmployeeLimit(directory);

        const headcountBefore = await directory.totalEmployees();
        base.note('Headcount before registration: ' + headcountBefore);

        const employee = TestDataFactory.validEmployee();
        base.note(`Registering: ${employee.fullName} / ${employee.employeeId} / ${employee.email}`);

        base.step('Opening the Register New Employee dialog');
        const dialog = await directory.openRegisterEmployeeDialog();
        assertTrue(await dialog.isOpen(), 'The Register New Employee dialog did not open');
        await base.softly().assertTrue(await dialog.hasAllSections(),
            'The dialog is missing one of its Personal / Employment / Identity / Banking sections');

        base.step('Completing the mandatory details and saving');
        await dialog.fill(employee);
        await dialog.saveExpectingSuccess();

        // Hard: the record existing is the point of the test.
        base.step('Verifying the new employee is listed in the directory');
        assertTrue(await directory.containsEmployeeIn(employee.department!, employee.fullName!),
            `The newly registered employee '${employee.fullName}' is not listed in the directory`);

        base.step('Verifying the headcount KPI rose by one');
        await base.softly().assertTrue(
            await directory.waitForKpiCard(EmployeeDirectoryPage.KPI_TOTAL_EMPLOYEES, headcountBefore + 1),
            `The Total Employees KPI reported ${await directory.totalEmployees()} after registration, `
            + `expected ${headcountBefore + 1}`);

        base.assertAllSoft();
        base.verified('The employee was registered and the directory reflects it');
    });

    test('TC_EMP_03_registrationFormRejectsEveryInvalidDataset', {
        tag: ['@smoke', '@employee', '@negative', '@validation'],
        annotation: { type: 'description', description: 'TC_EMP_03 - The registration form blocks every invalid '
            + 'dataset, raises the correct inline message and saves nothing' },
    }, async ({ base }) => {
        const scenarios = JsonDataReader.employeeValidationScenarios()
            .filter(scenario => scenario.expectedError != null);
        base.note('Invalid registration scenarios under test: ' + scenarios.length);

        base.step('Signing in as the Organization Administrator and opening the directory');
        await base.loginAndOpen(Persona.ADMIN, AppModule.EMPLOYEE_DIRECTORY);
        const directory = new EmployeeDirectoryPage();
        const headcountBefore = await directory.totalEmployees();

        for (const scenario of scenarios) {
            base.step('Scenario: ' + scenario.scenario);
            const dialog = await directory.openRegisterEmployeeDialog();
            await dialog.fill(scenario);
            await dialog.clickSave();

            // Hard: a closed dialog means an invalid record may have been saved.
            assertTrue(await dialog.remainsOpenAfterSubmit(),
                `The dialog closed for an invalid dataset (${scenario.scenario}), `
                + 'which means the record may have been saved');

            const messages = await dialog.validationMessages();
            base.note(`Validation messages raised: [${messages.join(', ')}]`);
            await base.softly().assertTrue(await dialog.showsValidationMessage(scenario.expectedError!),
                `${scenario.scenario} - expected '${scenario.expectedError}' on the ${scenario.erroneousField} `
                + `field, but the form raised: [${messages.join(', ')}]`);
            await dialog.cancel();
        }

        // Hard: nothing may have been persisted by any rejected submission.
        base.step('Verifying no record was created by any rejected submission');
        assertEquals(await directory.totalEmployees(), headcountBefore,
            'The headcount changed even though every submission was rejected - '
            + 'an invalid record may have been persisted');

        base.assertAllSoft();
        base.verified(`All ${scenarios.length} invalid datasets were rejected`);
    });

    test('TC_EMP_04_departmentCanBeCreatedAndDeletedWithCountTracking', {
        tag: ['@smoke', '@employee', '@e2e'],
        annotation: { type: 'description', description: 'TC_EMP_04 - A department can be created and then deleted, '
            + 'and the department count tracks both operations' },
    }, async ({ base }) => {
        const departmentName = TestDataFactory.uniqueDepartmentName();

        base.step('Signing in as the Organization Administrator and opening Department Management');
        await base.loginAndOpen(Persona.ADMIN, AppModule.DEPARTMENT);

        const departments = new DepartmentPage();
        assertTrue(await departments.isLoaded(), 'Department Management did not load');

        const countBefore = await departments.departmentCount();
        base.note('Departments before: ' + countBefore);

        try {
            base.step(`Creating the department '${departmentName}'`);
            await departments.openCreateDialog();
            await base.softly().assertEquals(await departments.createDialogTitle(), 'Create New Department',
                'The create dialog has an unexpected title');
            await departments.enterDepartmentName(departmentName);
            await departments.submitCreateDialog();

            assertTrue(await departments.hasDepartment(departmentName),
                `The new department '${departmentName}' is not listed`);
            await base.softly().assertTrue(
                await departments.waitForKpiCard(DepartmentPage.KPI_DEPARTMENTS, countBefore + 1),
                `The department count reported ${await departments.departmentCount()}, expected ${countBefore + 1}`);
            await base.softly().assertEquals(await departments.headcountFor(departmentName), 0,
                'A newly created department should start with zero employees');

            base.step('Deleting the department');
            await departments.clickDeleteFor(departmentName);
            const confirmation = await departments.deleteConfirmationText();
            base.note('Confirmation dialog: ' + confirmation.replace(/\n/g, ' / '));
            await base.softly().assertTrue(confirmation.includes(DepartmentPage.EMPTY_ONLY_DELETE_RULE),
                `The delete confirmation does not state the rule '${DepartmentPage.EMPTY_ONLY_DELETE_RULE}'. `
                + `It read: ${confirmation}`);
            await departments.confirmDelete();

            assertTrue(await departments.departmentRemoved(departmentName),
                `The department '${departmentName}' is still listed after deletion`);
            await base.softly().assertTrue(
                await departments.waitForKpiCard(DepartmentPage.KPI_DEPARTMENTS, countBefore),
                `The department count did not return to ${countBefore}`);

            base.assertAllSoft();
            base.verified('The department was created and deleted, with the count tracking both');
        } finally {
            // Guarantees the tenant is left clean even if an assertion above failed.
            await departments.deleteIfPresent(departmentName);
        }
    });
});
