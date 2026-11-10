import { AppModule } from '../../src/enums/AppModule';
import { Persona } from '../../src/enums/Persona';
import { SettingsPanel } from '../../src/enums/SettingsPanel';
import { GenericModulePage } from '../../src/pages/base/GenericModulePage';
import { EmployeeDirectoryPage } from '../../src/pages/employees/EmployeeDirectoryPage';
import { SettingsPage } from '../../src/pages/settings/SettingsPage';
import { LeavesPage } from '../../src/pages/timeleave/LeavesPage';
import { assertAllSoft, expect, note, softlyLoaded, step, test, verified } from '../base/BaseTest';
import { TestDataProviders } from '../dataproviders/TestDataProviders';

/**
 * TC_RBAC - What each persona can and cannot reach.
 *
 * The product exposes two authorisation surfaces, and this file covers both:
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
 * TC_RBAC_02 pairs the HR denials with the rights both personas keep, because
 * a test that only asserts "HR cannot" would still pass if a route were
 * broken for everyone.
 */
test.describe('TC_RBAC - Role based access control', () => {
  test(
    'TC_RBAC_01 - HR is redirected away from every restricted route and is shown only the settings panels its role permits',
    { tag: ['@smoke', '@rbac', '@security', '@critical'] },
    async ({ page, loginAs }) => {
      step('Signing in as the HR Administrator');
      await loginAs(Persona.HR);

      const denied = AppModule.deniedTo(Persona.HR);
      expect(denied.length, 'The access matrix declares no HR-restricted routes - this test would be vacuous').toBeGreaterThan(0);

      for (const module of denied) {
        step(`Deep-linking to the restricted route ${module.route}`);
        const restricted = await new GenericModulePage(page, module).open();

        expect(
          restricted.currentPath(),
          `HR reached ${module.route} but should have been redirected to ${AppModule.ACCESS_DENIED_FALLBACK_ROUTE}`,
        ).toBe(AppModule.ACCESS_DENIED_FALLBACK_ROUTE);
        expect(
          await restricted.displaysTextImmediately(module.landingMarker),
          `Content from the restricted module ${module.name} ('${module.landingMarker}') was rendered to HR despite the redirect`,
        ).toBe(false);
        verified(`HR is denied ${module.name}`);
      }

      step('Opening Settings as HR');
      const settings = await new SettingsPage(page).open();
      expect(await settings.isLoaded(), 'The Settings page did not load for HR').toBe(true);
      note(`Panels visible to HR: ${(await settings.visiblePanelLabels()).join(', ')}`);

      step('Verifying the organization-configuration panels are hidden');
      for (const panel of SettingsPanel.hiddenFrom(Persona.HR)) {
        expect(
          await settings.hasPanel(panel),
          `HR can see the restricted settings panel '${panel.label}' (group ${panel.group}), which belongs to the Organization Administrator`,
        ).toBe(false);
      }

      step('Verifying the panels HR is entitled to are offered and open');
      for (const panel of SettingsPanel.inPlacePanelsVisibleTo(Persona.HR)) {
        const offered = await settings.hasPanel(panel);
        expect.soft(offered, `HR should see the '${panel.label}' panel but it is missing`).toBe(true);
        if (!offered) {
          continue;
        }
        await settings.openPanel(panel);
        expect
          .soft(
            await settings.isPanelOpen(panel),
            `The '${panel.label}' panel did not open for HR. Expected the heading '${panel.contentHeading}' ` +
              `but the panel shows '${await settings.openPanelHeading()}'`,
          )
          .toBe(true);
      }

      assertAllSoft();
      verified('HR is held to its role on every route and settings panel');
    },
  );

  for (const persona of TestDataProviders.allPersonas()) {
    test(
      `TC_RBAC_02 - ${persona.roleName} retains the people-operations rights its role depends on`,
      { tag: ['@smoke', '@rbac'] },
      async ({ page, loginAndOpen }) => {
        step(`Signing in as ${persona.roleName} and opening the Employee Directory`);
        const directory = await loginAndOpen(persona, new EmployeeDirectoryPage(page));
        expect(await directory.isLoaded(), `The Employee Directory did not load for ${persona.roleName}`).toBe(true);

        step('Verifying employee administration and the per-row actions');
        expect.soft(await directory.canAddEmployee(), `${persona.roleName} cannot register a new employee`).toBe(true);
        expect.soft(await directory.canExport(), `${persona.roleName} cannot export the directory`).toBe(true);
        for (const action of ['View Profile', 'Edit', 'Reset Password']) {
          expect
            .soft(await directory.offersAction(action), `The '${action}' row action is not offered to ${persona.roleName}`)
            .toBe(true);
        }

        step('Opening Leave Management');
        const leaves = await new LeavesPage(page).open();
        if (await softlyLoaded(leaves, `Leave Management (for ${persona.roleName})`)) {
          expect.soft(await leaves.canApplyForLeave(), `${persona.roleName} cannot apply for leave`).toBe(true);
        }

        assertAllSoft();
        verified(`${persona.roleName} retains its people-operations rights`);
      },
    );
  }
});
