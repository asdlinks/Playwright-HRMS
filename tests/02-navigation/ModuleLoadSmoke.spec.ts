import { assertTrue } from '../../src/base/Assert';
import { ALL_PERSONAS, test } from '../../src/base/BaseTest';
import { AppModule } from '../../src/enums/AppModule';
import { Persona } from '../../src/enums/Persona';
import { BasePage } from '../../src/pages/base/BasePage';
import { GenericModulePage } from '../../src/pages/base/GenericModulePage';
import { DepartmentPage } from '../../src/pages/employees/DepartmentPage';
import { EmployeeDirectoryPage } from '../../src/pages/employees/EmployeeDirectoryPage';
import { LeavesPage } from '../../src/pages/timeleave/LeavesPage';

/**
 * TC_NAV - Every page loads, for every persona entitled to it.
 *
 * Content-based rather than URL-based: each module declares a landing marker
 * in AppModule and the test asserts that marker actually rendered. A
 * client-side router changes the URL long before the view has data, so a URL
 * check alone would pass on a blank screen.
 *
 * The module sweep runs in ONE session per persona with soft assertions, so a
 * single run reports every module that is broken, not just the first.
 */

/** Strings that betray a crashed view or an unhandled server error. */
const ERROR_SIGNATURES = [
    'Something went wrong',
    'Unexpected Application Error',
    '500 Internal Server Error',
    'Cannot read properties of',
    'TypeError:',
    'ChunkLoadError',
];

function firstLines(text: string): string {
    return text.split(/\r?\n/).slice(0, 6).reduce((a, b) => a + ' | ' + b, '');
}

test.describe('ModuleLoadSmokeTest', () => {

    for (const persona of ALL_PERSONAS) {
        test(`TC_NAV_01_headerIsCompleteAndEveryPermittedModuleLoadsCleanly [${persona.name}]`, {
            tag: ['@smoke', '@navigation', '@critical'],
            annotation: { type: 'description', description: 'TC_NAV_01 - The header is complete and every module '
                + 'the persona is entitled to renders its own content without an error state' },
        }, async ({ base }) => {
            base.step('Signing in as ' + persona.roleName());
            const dashboard = await base.loginAs(persona);

            base.step('Verifying the global header');
            const header = dashboard.header();
            base.note(`Navigation offered: [${(await header.navigationLabels()).join(', ')}]`);
            for (const section of ['Dashboard', 'Time & Leave', 'Employees', 'Documents', 'Settings']) {
                await base.softly().assertTrue(await header.hasNavigationItem(section),
                    `The '${section}' section is missing from the header for ${persona}`);
            }
            const hrefs = await header.navigationHrefs();
            for (const linked of [AppModule.DASHBOARD, AppModule.EMPLOYEE_DIRECTORY, AppModule.COMPANY_DOCUMENTS]) {
                await base.softly().assertTrue(hrefs.includes(linked.route()),
                    `No header link points at ${linked.route()} for ${persona}`);
            }
            await base.softly().assertTrue(await header.hasGlobalSearch(),
                'The global employee search is missing from the header for ' + persona);

            const modules = AppModule.accessibleBy(persona);
            base.note(`${persona.roleName()} is entitled to ${modules.length} modules`);

            for (const module of modules) {
                base.step(`Opening ${module.name} at ${module.route()}`);
                await BasePage.navigateTo(module);
                const page = new GenericModulePage(module);

                if (!await base.softlyLoaded(page, `${module.name} (for ${persona.roleName()})`)) {
                    base.note(`${module.name} showed: ${firstLines(await page.contentText())}`);
                    continue;
                }
                await base.softly().assertEquals(page.currentPath(), module.route(),
                    `${module.name} redirected ${persona.roleName()} away from a route it is entitled to`);

                const content = await page.contentText();
                for (const signature of ERROR_SIGNATURES) {
                    await base.softly().assertFalse(content.includes(signature),
                        `${module.name} rendered an error state containing '${signature}'. `
                        + `Screen showed: ${firstLines(content)}`);
                }
            }

            base.assertAllSoft();
            base.verified(`The header is complete and all ${modules.length} modules loaded cleanly `
                + `for ${persona.roleName()}`);
        });
    }

    test('TC_NAV_02_sectionRailsLinkToEverySubModule', {
        tag: ['@smoke', '@navigation'],
        annotation: { type: 'description', description: 'TC_NAV_02 - The Employees and Time & Leave section rails '
            + 'link to every sub-module and the links navigate' },
    }, async ({ base }) => {
        base.step('Signing in as the Organization Administrator and opening Employees');
        await base.loginAndOpen(Persona.ADMIN, AppModule.EMPLOYEE_DIRECTORY);

        const employeesRail = new EmployeeDirectoryPage().sideNav();
        assertTrue(await employeesRail.isDisplayed(), 'The Employees section rail did not render');
        base.note(`Employees rail: [${(await employeesRail.itemLabels()).join(', ')}]`);

        base.step('Verifying the Employees rail links');
        for (const module of [AppModule.DEPARTMENT, AppModule.ORGANIZATION_STRUCTURE, AppModule.MY_TEAM]) {
            await base.softly().assertTrue(await employeesRail.linksToRoute(module.route()),
                'The Employees rail does not link to ' + module.route());
        }

        base.step('Following the Department link and verifying it navigates');
        await employeesRail.clickItem('Department');
        await base.softly().assertTrue(await new DepartmentPage().isLoaded(),
            'Following the rail to Department did not load Department Management');

        base.step('Opening Time & Leave');
        await BasePage.navigateTo(AppModule.DAILY_CHECK_IN);
        const timeLeaveRail = new LeavesPage().sideNav();
        assertTrue(await timeLeaveRail.isDisplayed(), 'The Time & Leave rail did not render');
        base.note(`Time & Leave rail: [${(await timeLeaveRail.itemLabels()).join(', ')}]`);

        base.step('Verifying the Time & Leave rail links');
        for (const module of [AppModule.LEAVES, AppModule.LEAVE_CANCELLATION, AppModule.HOLIDAY_CALENDAR,
            AppModule.SHIFTS, AppModule.ATTENDANCE_POLICIES, AppModule.KIOSK_DEVICES, AppModule.FACE_ENROLLMENT]) {
            await base.softly().assertTrue(await timeLeaveRail.linksToRoute(module.route()),
                `The Time & Leave rail does not link to ${module.route()} (${module.name})`);
        }

        base.assertAllSoft();
        base.verified('Both section rails link to every sub-module');
    });
});
