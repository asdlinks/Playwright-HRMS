import { assertEquals, assertFalse, assertTrue } from '../../src/base/Assert';
import { ALL_PERSONAS, test } from '../../src/base/BaseTest';
import { AppModule } from '../../src/enums/AppModule';
import { Persona } from '../../src/enums/Persona';
import { SettingsPanel } from '../../src/enums/SettingsPanel';
import { BasePage } from '../../src/pages/base/BasePage';
import { GenericModulePage } from '../../src/pages/base/GenericModulePage';
import { EmployeeDirectoryPage } from '../../src/pages/employees/EmployeeDirectoryPage';
import { SettingsPage } from '../../src/pages/settings/SettingsPage';
import { LeavesPage } from '../../src/pages/timeleave/LeavesPage';

/**
 * TC_RBAC - What each persona can and cannot reach.
 *
 * The product exposes two authorisation surfaces, and this spec covers both:
 *
 *   ROUTE GUARDS    - /work-modes, /attendance/policies, /attendance/kiosk-devices
 *                     and /attendance/face-enrollment silently redirect an
 *                     unauthorised persona to /dashboard.
 *
 *   RENDERED MENUS  - Settings is a single route whose left rail is built from
 *                     the caller's permissions. An Administrator sees twelve
 *                     panels; HR sees four.
 *
 * DENIALS ARE HARD ASSERTIONS. A persona reaching something it must not is a
 * security defect in its own right, so the test stops there. Checks that a
 * permitted feature is present are soft, so one run lists everything missing.
 *
 * Each denial is paired with the matching Administrator permit, because a test
 * that only asserts "HR cannot" would still pass if the route were broken for
 * everyone.
 */
test.describe('RoleBasedAccessTest', () => {

    test('TC_RBAC_01_hrIsDeniedRestrictedRoutesAndOrganizationConfiguration', {
        tag: ['@smoke', '@rbac', '@security', '@critical'],
        annotation: { type: 'description', description: 'TC_RBAC_01 - HR is redirected away from every restricted '
            + 'route and is shown only the settings panels its role permits' },
    }, async ({ base }) => {
        base.step('Signing in as the HR Administrator');
        await base.loginAs(Persona.HR);

        const denied = AppModule.deniedTo(Persona.HR);
        assertFalse(denied.length === 0,
            'The access matrix declares no HR-restricted routes - this test would be vacuous');

        for (const module of denied) {
            base.step('Deep-linking to the restricted route ' + module.route());
            await BasePage.navigateTo(module);
            const page = new GenericModulePage(module);

            assertEquals(page.currentPath(), AppModule.ACCESS_DENIED_FALLBACK_ROUTE,
                `HR reached ${module.route()} but should have been redirected to `
                + AppModule.ACCESS_DENIED_FALLBACK_ROUTE);
            assertFalse(await page.displaysTextImmediately(module.landingMarker()),
                `Content from the restricted module ${module.name} ('${module.landingMarker()}') `
                + 'was rendered to HR despite the redirect');
            base.verified('HR is denied ' + module.name);
        }

        base.step('Opening Settings as HR');
        await BasePage.navigateTo(AppModule.SETTINGS);
        const settings = new SettingsPage();
        assertTrue(await settings.isLoaded(), 'The Settings page did not load for HR');
        base.note(`Panels visible to HR: [${(await settings.visiblePanelLabels()).join(', ')}]`);

        base.step('Verifying the organization-configuration panels are hidden');
        for (const panel of SettingsPanel.hiddenFrom(Persona.HR)) {
            assertFalse(await settings.hasPanel(panel),
                `HR can see the restricted settings panel '${panel.label()}' (group ${panel.group()}), `
                + 'which belongs to the Organization Administrator');
        }

        base.step('Verifying the panels HR is entitled to are offered and open');
        for (const panel of SettingsPanel.inPlacePanelsVisibleTo(Persona.HR)) {
            if (!await settings.hasPanel(panel)) {
                await base.softly().fail(`HR should see the '${panel.label()}' panel but it is missing`);
                continue;
            }
            await settings.openPanel(panel);
            await base.softly().assertTrue(await settings.isPanelOpen(panel),
                `The '${panel.label()}' panel did not open for HR. Expected the heading `
                + `'${panel.contentHeading()}' but the panel shows '${await settings.openPanelHeading()}'`);
        }

        base.assertAllSoft();
        base.verified('HR is held to its role on every route and settings panel');
    });

    test('TC_RBAC_02_administratorHoldsFullAccessIncludingRoleGovernance', {
        tag: ['@smoke', '@rbac', '@security', '@critical'],
        annotation: { type: 'description', description: 'TC_RBAC_02 - The Administrator reaches every route denied '
            + 'to HR, sees the complete settings catalogue and governs roles with live user counts' },
    }, async ({ base }) => {
        base.step('Signing in as the Organization Administrator');
        await base.loginAs(Persona.ADMIN);

        // Proves the HR denials are a permission boundary, not broken pages.
        for (const module of AppModule.deniedTo(Persona.HR)) {
            base.step(`Opening ${module.name} as the Administrator`);
            await BasePage.navigateTo(module);
            const page = new GenericModulePage(module);
            await base.softly().assertTrue(await page.isLoaded(),
                `${module.name} did not load for the Administrator either - the HR denial may be a broken `
                + 'page rather than a permission boundary');
            await base.softly().assertNotEquals(page.currentPath(), AppModule.ACCESS_DENIED_FALLBACK_ROUTE,
                'The Administrator was also redirected away from ' + module.route());
        }

        base.step('Opening Settings as the Administrator');
        await BasePage.navigateTo(AppModule.SETTINGS);
        const settings = new SettingsPage();
        assertTrue(await settings.isLoaded(), 'The Settings page did not load for the Administrator');
        base.note(`Panels visible to the Administrator: [${(await settings.visiblePanelLabels()).join(', ')}]`);

        base.step('Verifying the complete settings catalogue');
        for (const panel of SettingsPanel.values()) {
            await base.softly().assertTrue(await settings.hasPanel(panel),
                `The Administrator cannot see the '${panel.label()}' panel`);
        }
        for (const group of ['ORGANIZATION', 'ATTENDANCE', 'PAYROLL', 'SECURITY', 'ADVANCED']) {
            await base.softly().assertTrue(await settings.hasGroup(group),
                `The '${group}' settings group is missing for the Administrator`);
        }

        base.step('Opening Roles & Permissions');
        await settings.openPanel(SettingsPanel.ROLES_AND_PERMISSIONS);
        assertTrue(await settings.isPanelOpen(SettingsPanel.ROLES_AND_PERMISSIONS),
            `The Roles & Permissions panel did not open - the panel shows '${await settings.openPanelHeading()}'`);

        base.step('Verifying both persona roles are listed with live user counts');
        for (const persona of Persona.values()) {
            await base.softly().assertTrue(await settings.listsRole(persona.roleName()),
                `The '${persona.roleName()}' role is missing from the catalogue`);
            const users = await settings.userCountFor(persona.roleName());
            base.note(`${persona.roleName()} users: ${users}`);
            await base.softly().assertTrue(users >= 1,
                `The ${persona.roleName()} role reports ${users} users, but the ${persona} persona holds it`);
        }

        base.assertAllSoft();
        base.verified('The Administrator holds full access, including role governance');
    });

    for (const persona of ALL_PERSONAS) {
        test(`TC_RBAC_03_bothPersonasRetainSharedPeopleOperationsRights [${persona.name}]`, {
            tag: ['@smoke', '@rbac'],
            annotation: { type: 'description', description: 'TC_RBAC_03 - Both personas retain the '
                + 'people-operations rights their roles depend on, proving scoping rather than blanket restriction' },
        }, async ({ base }) => {
            base.step(`Signing in as ${persona.roleName()} and opening the Employee Directory`);
            await base.loginAndOpen(persona, AppModule.EMPLOYEE_DIRECTORY);

            const directory = new EmployeeDirectoryPage();
            assertTrue(await directory.isLoaded(), 'The Employee Directory did not load for ' + persona.roleName());

            base.step('Verifying employee administration and the per-row actions');
            await base.softly().assertTrue(await directory.canAddEmployee(),
                persona.roleName() + ' cannot register a new employee');
            await base.softly().assertTrue(await directory.canExport(),
                persona.roleName() + ' cannot export the directory');
            for (const action of ['View Profile', 'Edit', 'Reset Password']) {
                await base.softly().assertTrue(await directory.offersAction(action),
                    `The '${action}' row action is not offered to ${persona.roleName()}`);
            }

            base.step('Opening Leave Management');
            await BasePage.navigateTo(AppModule.LEAVES);
            const leaves = new LeavesPage();
            if (await base.softlyLoaded(leaves, `Leave Management (for ${persona.roleName()})`)) {
                await base.softly().assertTrue(await leaves.canApplyForLeave(),
                    persona.roleName() + ' cannot apply for leave');
            }

            base.assertAllSoft();
            base.verified(persona.roleName() + ' retains its people-operations rights');
        });
    }
});
