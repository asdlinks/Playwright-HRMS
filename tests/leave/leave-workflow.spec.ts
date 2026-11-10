import { TestDataFactory } from '../../src/data/TestDataFactory';
import { LeaveStatus } from '../../src/enums/LeaveStatus';
import { LeaveType } from '../../src/enums/LeaveType';
import { Persona } from '../../src/enums/Persona';
import { LeavesPage } from '../../src/pages/timeleave/LeavesPage';
import { assertAllSoft, expect, note, step, test, verified } from '../base/BaseTest';
import { TestDataProviders } from '../dataproviders/TestDataProviders';

/** Seeded employee named as the leave subject in the rejected request. */
const TARGET_EMPLOYEE = 'hr';

/**
 * TC_LEAVE - Leave Management.
 *
 * Neither test leaves anything behind: TC_LEAVE_01 only reads, and
 * TC_LEAVE_02 submits a request the app must reject.
 */
test.describe('TC_LEAVE - Leave Management', () => {
  for (const persona of TestDataProviders.allPersonas()) {
    test(
      `TC_LEAVE_01 - Leave Management renders valid entitlement cards and the request grid, and its status counts reconcile (${persona.roleName})`,
      { tag: ['@smoke', '@leave', '@critical'] },
      async ({ page, loginAndOpen }) => {
        step(`Signing in as ${persona.roleName} and opening Leave Management`);
        const leaves = await loginAndOpen(persona, new LeavesPage(page));
        expect(await leaves.isLoaded(), `Leave Management did not load for ${persona.roleName}`).toBe(true);

        step('Verifying the entitlement cards');
        expect
          .soft(await leaves.allBalanceCardsDisplayed(), `One of the Casual / Sick / Paid balance cards is missing for ${persona.roleName}`)
          .toBe(true);
        for (const type of LeaveType.values()) {
          const remaining = await leaves.remainingBalance(type);
          const total = await leaves.totalEntitlement(type);
          note(`${persona.roleName} ${type.gridLabel} balance: ${remaining}/${total}`);
          expect.soft(total, `The ${type.gridLabel} entitlement is ${total} - the card did not resolve`).toBeGreaterThan(0);
          expect
            .soft(
              remaining >= 0 && remaining <= total,
              `The ${type.gridLabel} balance shows ${remaining} of ${total}, which is impossible`,
            )
            .toBe(true);
        }

        step('Verifying the request grid');
        expect.soft(await leaves.hasRecentRequestsSection(), 'The Recent Requests section is missing').toBe(true);
        expect.soft(await leaves.isGridDisplayed(), 'The leave request grid did not render').toBe(true);

        step('Verifying the status tab counts reconcile');
        const all = await leaves.tabCount(LeaveStatus.ALL);
        const pending = await leaves.tabCount(LeaveStatus.PENDING);
        const approved = await leaves.tabCount(LeaveStatus.APPROVED);
        const rejected = await leaves.tabCount(LeaveStatus.REJECTED);
        const cancelled = await leaves.tabCount(LeaveStatus.CANCELLED);
        note(`Tab counts - All: ${all}, Pending: ${pending}, Approved: ${approved}, Rejected: ${rejected}, Cancelled: ${cancelled}`);

        expect
          .soft(
            pending + approved + rejected + cancelled,
            `The status tabs do not reconcile: Pending(${pending}) + Approved(${approved}) + Rejected(${rejected}) + ` +
              `Cancelled(${cancelled}) should equal All(${all})`,
          )
          .toBe(all);
        const gridTotal = await leaves.totalRequestCount();
        expect.soft(gridTotal, `The grid reports ${gridTotal} requests but the All tab claims ${all}`).toBe(all);

        await leaves.selectStatusTab(LeaveStatus.PENDING);
        const pendingRows = await leaves.totalRequestCount();
        expect.soft(pendingRows, `The Pending tab shows ${pendingRows} rows but its own count says ${pending}`).toBe(pending);

        assertAllSoft();
        verified(`Leave Management renders completely and reconciles for ${persona.roleName}`);
      },
    );
  }

  test(
    'TC_LEAVE_02 - Submitting a leave request without its mandatory dates is rejected and nothing is recorded',
    { tag: ['@smoke', '@leave', '@negative', '@validation'] },
    async ({ page, loginAndOpen }) => {
      step('Signing in as the Organization Administrator and opening Leave Management');
      const leaves = await loginAndOpen(Persona.ADMIN, new LeavesPage(page));
      const totalBefore = await leaves.totalRequestCount();
      note(`Total requests before the invalid submission: ${totalBefore}`);

      step('Filling everything except the mandatory start and end dates');
      const drawer = await leaves.openApplyLeaveDrawer();
      await drawer.fill(TestDataFactory.leaveWithoutDates(TARGET_EMPLOYEE));
      expect(await drawer.isStartDateEmpty(), 'The start date was populated - this test cannot prove date validation').toBe(true);

      step('Submitting and expecting rejection');
      await drawer.clickRecordLeave();

      // Both hard: either failing means an incomplete request may have been saved.
      expect(
        await drawer.remainsOpenAfterSubmit(),
        'The leave drawer closed despite the mandatory dates being empty, which suggests an incomplete request was accepted',
      ).toBe(true);
      note(`Validation messages raised: ${(await drawer.validationMessages()).join(' | ')}`);

      await drawer.close();
      const totalAfter = await leaves.totalRequestCount();
      expect(
        totalAfter,
        `The request count changed from ${totalBefore} to ${totalAfter} even though the submission was rejected`,
      ).toBe(totalBefore);

      verified('An incomplete leave request is rejected and nothing is recorded');
    },
  );
});
