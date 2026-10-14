import { assertEquals, assertTrue } from '../../src/base/Assert';
import { ALL_PERSONAS, test } from '../../src/base/BaseTest';
import { TestDataFactory } from '../../src/data/TestDataFactory';
import { AppModule } from '../../src/enums/AppModule';
import { LeaveStatus } from '../../src/enums/LeaveStatus';
import { LeaveType } from '../../src/enums/LeaveType';
import { Persona } from '../../src/enums/Persona';
import { DashboardPage } from '../../src/pages/dashboard/DashboardPage';
import { LeavesPage } from '../../src/pages/timeleave/LeavesPage';
import { DateUtils } from '../../src/utils/DateUtils';

/**
 * TC_LEAVE - The leave request workflow.
 *
 * The end-to-end case deliberately spans both personas: the Administrator
 * records a request, then HR signs in separately and sees it. That crosses a
 * real session boundary, which is the only way to prove the request was
 * persisted rather than held in client state.
 */

/** Seeded employee used as the leave subject. */
const TARGET_EMPLOYEE = 'sales1';

test.describe('LeaveWorkflowTest', () => {

    for (const persona of ALL_PERSONAS) {
        test(`TC_LEAVE_01_leaveManagementRendersAndStatusCountsReconcile [${persona.name}]`, {
            tag: ['@smoke', '@leave', '@critical'],
            annotation: { type: 'description', description: 'TC_LEAVE_01 - Leave Management renders valid '
                + 'entitlement cards and the request grid, and its status tab counts reconcile with the grid' },
        }, async ({ base }) => {
            base.step(`Signing in as ${persona.roleName()} and opening Leave Management`);
            await base.loginAndOpen(persona, AppModule.LEAVES);

            const leaves = new LeavesPage();
            assertTrue(await leaves.isLoaded(), 'Leave Management did not load for ' + persona.roleName());

            base.step('Verifying the entitlement cards');
            await base.softly().assertTrue(await leaves.allBalanceCardsDisplayed(),
                'One of the Casual / Sick / Paid balance cards is missing for ' + persona.roleName());
            for (const type of LeaveType.values()) {
                const remaining = await leaves.remainingBalance(type);
                const total = await leaves.totalEntitlement(type);
                base.note(`${persona.roleName()} ${type.gridLabel()} balance: ${remaining}/${total}`);
                await base.softly().assertTrue(total > 0,
                    `The ${type.gridLabel()} entitlement is ${total} - the card did not resolve`);
                await base.softly().assertTrue(remaining >= 0 && remaining <= total,
                    `The ${type.gridLabel()} balance shows ${remaining} of ${total}, which is impossible`);
            }

            base.step('Verifying the request grid');
            await base.softly().assertTrue(await leaves.hasRecentRequestsSection(),
                'The Recent Requests section is missing');
            await base.softly().assertTrue(await leaves.isGridDisplayed(), 'The leave request grid did not render');

            base.step('Verifying the status tab counts reconcile');
            const all = await leaves.tabCount(LeaveStatus.ALL);
            const pending = await leaves.tabCount(LeaveStatus.PENDING);
            const approved = await leaves.tabCount(LeaveStatus.APPROVED);
            const rejected = await leaves.tabCount(LeaveStatus.REJECTED);
            const cancelled = await leaves.tabCount(LeaveStatus.CANCELLED);
            base.note(`Tab counts - All: ${all}, Pending: ${pending}, Approved: ${approved}, `
                + `Rejected: ${rejected}, Cancelled: ${cancelled}`);

            await base.softly().assertEquals(pending + approved + rejected + cancelled, all,
                `The status tabs do not reconcile: Pending(${pending}) + Approved(${approved}) + `
                + `Rejected(${rejected}) + Cancelled(${cancelled}) should equal All(${all})`);
            await base.softly().assertEquals(await leaves.totalRequestCount(), all,
                `The grid reports ${await leaves.totalRequestCount()} requests but the All tab claims ${all}`);

            await leaves.selectStatusTab(LeaveStatus.PENDING);
            await base.softly().assertEquals(await leaves.totalRequestCount(), pending,
                `The Pending tab shows ${await leaves.totalRequestCount()} rows but its own count says ${pending}`);

            base.assertAllSoft();
            base.verified('Leave Management renders completely and reconciles for ' + persona.roleName());
        });
    }

    test('TC_LEAVE_02_leaveRecordedByAdminIsAutoApprovedAndVisibleToHr', {
        tag: ['@smoke', '@leave', '@e2e', '@intermodule', '@critical'],
        annotation: { type: 'description', description: 'TC_LEAVE_02 - Leave the Administrator records on an '
            + "employee's behalf is approved on save and HR, in a separate session, sees the same record" },
    }, async ({ base }) => {
        const request = TestDataFactory.singleDayLeave(TARGET_EMPLOYEE);
        const leaveDay = DateUtils.fromDateInput(request.startDate!);
        const dayMonth = DateUtils.gridDayMonth(leaveDay);
        const year = String(leaveDay.getFullYear());

        // ---------- Part 1: the Administrator records the request ----------
        base.step('Signing in as the Organization Administrator and opening Leave Management');
        await base.loginAndOpen(Persona.ADMIN, AppModule.LEAVES);

        const adminLeaves = new LeavesPage();
        const pendingBefore = await adminLeaves.tabCount(LeaveStatus.PENDING);
        const approvedBefore = await adminLeaves.tabCount(LeaveStatus.APPROVED);
        base.note(`Before: ${pendingBefore} pending, ${approvedBefore} approved`);

        base.step('Opening the Apply for Leave drawer');
        const drawer = await adminLeaves.openApplyLeaveDrawer();
        assertTrue(await drawer.isOpen(), 'The Apply for Leave drawer did not open');
        // Hard: without the target field the Administrator cannot apply on anyone's behalf.
        assertTrue(await drawer.hasTargetEmployeeField(),
            'The Target Employee field is missing - the Administrator should be able to '
            + 'apply on behalf of an employee');
        await base.softly().assertTrue(await drawer.allFieldsDisplayed(),
            'The leave drawer is missing one of its required controls');

        base.step(`Recording a single-day casual leave for ${TARGET_EMPLOYEE} on ${request.startDate}`);
        await drawer.fill(request);
        await drawer.submitExpectingSuccess();

        // Leave an Administrator records for someone else is an HR decision
        // already taken, so the app stores it as Approved rather than queueing it.
        //
        // The count rising is HARD because it is the only proof a NEW record
        // was saved: a matching row can already exist from an earlier run on
        // the same date, and the app does not record an overlapping request.
        base.step('Verifying a new request was saved directly as Approved');
        assertTrue(await adminLeaves.waitForTabCount(LeaveStatus.APPROVED, approvedBefore + 1),
            `The Approved tab reported ${await adminLeaves.tabCount(LeaveStatus.APPROVED)} after recording, `
            + `expected ${approvedBefore + 1} - no new request was saved. If an earlier run already recorded `
            + `${TARGET_EMPLOYEE} on ${dayMonth} ${year}, the app refuses the overlapping request.`);
        assertTrue(await adminLeaves.hasRequestWithStatus(TARGET_EMPLOYEE, LeaveStatus.APPROVED, dayMonth, year),
            `No Approved request for ${TARGET_EMPLOYEE} on ${dayMonth} ${year} is listed after recording it`);
        await base.softly().assertEquals(await adminLeaves.tabCount(LeaveStatus.PENDING), pendingBefore,
            'A request recorded by the Administrator should not enter the pending queue');

        base.step('Signing out of the Administrator session');
        await new DashboardPage().header().logout();

        // ---------- Part 2: HR sees the same record in its own session ----------
        base.step('Signing in as the HR Administrator in a fresh session');
        await base.loginAndOpen(Persona.HR, AppModule.LEAVES);

        const hrLeaves = new LeavesPage();
        assertTrue(await hrLeaves.isLoaded(), 'Leave Management did not load for HR');

        base.step('Verifying the approved request persisted across the session boundary');
        assertTrue(await hrLeaves.hasRequestWithStatus(TARGET_EMPLOYEE, LeaveStatus.APPROVED, dayMonth, year),
            `HR cannot see the Approved request the Administrator recorded for ${TARGET_EMPLOYEE} `
            + `on ${dayMonth} ${year}`);
        await base.softly().assertEquals(await hrLeaves.tabCount(LeaveStatus.APPROVED), approvedBefore + 1,
            "HR's Approved count disagrees with the Administrator's");

        base.assertAllSoft();
        base.verified('Leave recorded by the Administrator was approved on save and is visible to HR');
    });

    test('TC_LEAVE_03_leaveSubmissionWithoutMandatoryDatesIsRejected', {
        tag: ['@smoke', '@leave', '@negative', '@validation'],
        annotation: { type: 'description', description: 'TC_LEAVE_03 - Submitting a leave request without its '
            + 'mandatory dates is rejected and nothing is recorded' },
    }, async ({ base }) => {
        base.step('Signing in as the Organization Administrator and opening Leave Management');
        await base.loginAndOpen(Persona.ADMIN, AppModule.LEAVES);

        const leaves = new LeavesPage();
        const totalBefore = await leaves.totalRequestCount();
        base.note('Total requests before the invalid submission: ' + totalBefore);

        base.step('Filling everything except the mandatory start and end dates');
        const drawer = await leaves.openApplyLeaveDrawer();
        await drawer.fill(TestDataFactory.leaveWithoutDates(TARGET_EMPLOYEE));
        assertTrue(await drawer.isStartDateEmpty(),
            'The start date was populated - this test cannot prove date validation');

        base.step('Submitting and expecting rejection');
        await drawer.clickRecordLeave();

        // Both hard: either failing means an incomplete request may have been saved.
        assertTrue(await drawer.remainsOpenAfterSubmit(),
            'The leave drawer closed despite the mandatory dates being empty, '
            + 'which suggests an incomplete request was accepted');
        base.note(`Validation messages raised: [${(await drawer.validationMessages()).join(', ')}]`);

        await drawer.close();
        const totalAfter = await leaves.totalRequestCount();
        assertEquals(totalAfter, totalBefore,
            `The request count changed from ${totalBefore} to ${totalAfter} even though the submission was rejected`);

        base.verified('An incomplete leave request is rejected and nothing is recorded');
    });

    test('TC_LEAVE_04_entitlementCardsReportSignedInUsersOwnBalance', {
        tag: ['@smoke', '@leave'],
        annotation: { type: 'description', description: "TC_LEAVE_04 - Leave entitlement cards report the signed-in "
            + "user's own balance, not the balance of the employee being administered" },
    }, async ({ base }) => {
        base.step('Signing in as the Organization Administrator and reading its balances');
        await base.loginAndOpen(Persona.ADMIN, AppModule.LEAVES);

        const adminLeaves = new LeavesPage();
        const adminSick = await adminLeaves.remainingBalance(LeaveType.SICK);
        const adminSickTotal = await adminLeaves.totalEntitlement(LeaveType.SICK);
        base.note(`Administrator sick leave: ${adminSick}/${adminSickTotal}`);
        assertTrue(adminSick >= 0, "The Administrator's sick-leave balance did not resolve");

        base.step('Signing out and signing in as the HR Administrator');
        await new DashboardPage().header().logout();
        await base.loginAndOpen(Persona.HR, AppModule.LEAVES);

        const hrLeaves = new LeavesPage();
        const hrSick = await hrLeaves.remainingBalance(LeaveType.SICK);
        const hrSickTotal = await hrLeaves.totalEntitlement(LeaveType.SICK);
        base.note(`HR sick leave: ${hrSick}/${hrSickTotal}`);
        assertTrue(hrSick >= 0, "HR's sick-leave balance did not resolve");

        // HR has consumed sick leave in the seeded tenant and the Administrator
        // has not, so identical balances would mean the card shows tenant-wide
        // data rather than the caller's own.
        base.step('Verifying the balances are scoped per user rather than shared');
        await base.softly().assertEquals(adminSickTotal, hrSickTotal,
            `The two personas report different sick-leave entitlements (${adminSickTotal} vs ${hrSickTotal}), `
            + 'but entitlement is a tenant-level policy');
        await base.softly().assertTrue(adminSick !== hrSick || adminSick === adminSickTotal,
            `Both personas report exactly ${adminSick} sick days remaining. HR has consumed sick leave, `
            + 'so a shared figure suggests the card is not scoped to the signed-in user.');

        base.assertAllSoft();
        base.verified('Entitlement cards are scoped to the signed-in user');
    });
});
