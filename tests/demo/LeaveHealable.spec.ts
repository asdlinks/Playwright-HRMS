import type { Locator } from '@playwright/test';
import { assertEquals, assertTrue } from '../../src/base/Assert';
import { BaseTest, test } from '../../src/base/BaseTest';
import { TestDataFactory } from '../../src/data/TestDataFactory';
import { LeaveRequestData } from '../../src/data/model/LeaveRequestData';
import { RawDriver } from '../../src/driver/RawDriver';
import { AppModule } from '../../src/enums/AppModule';
import { LeaveStatus } from '../../src/enums/LeaveStatus';
import { Persona } from '../../src/enums/Persona';
import { DashboardPage } from '../../src/pages/dashboard/DashboardPage';
import { ApplyLeaveDrawer } from '../../src/pages/timeleave/ApplyLeaveDrawer';
import { LeavesPage } from '../../src/pages/timeleave/LeavesPage';
import { DateUtils } from '../../src/utils/DateUtils';
import { ElementUtils } from '../../src/utils/ElementUtils';
import { MuiUtils } from '../../src/utils/MuiUtils';
import { WaitUtils } from '../../src/utils/WaitUtils';

/**
 * HEALABLE_ - leave flows that fail ONLY because of one stale locator.
 *
 * Every test here walks a real end-to-end leave flow that works against the
 * live app. Exactly one locator per test has been deliberately broken in a way
 * that a self-healing tool should be able to repair: the intended element is
 * on the page, unique, and recognisable from the broken locator's text,
 * attributes or position. Each broken locator is a BROKEN_* constant whose
 * comment gives the correct locator, so a heal can be checked against it.
 *
 * Expected result before healing: FAIL with NoSuchElementError on the
 * BROKEN_* locator. Expected result after healing: PASS, with every
 * validation in the test still green.
 *
 * See FLAKY_HEALING_DEMO.md at the project root for the full catalogue.
 * Run with:  npm run test:healable
 */

const TARGET_EMPLOYEE = 'sales1';

// ---------------------------------------------------- the broken locators

/** Text drifted. Correct: //button[normalize-space(.)='Apply for Leave'] */
const BROKEN_APPLY_BUTTON = "xpath=//button[normalize-space(.)='Apply Leave']";

/** Attribute that never existed. Correct: //textarea[contains(@placeholder,'reason for leave')] */
const BROKEN_REASON_FIELD = "xpath=//textarea[@name='leaveReason']";

/** Class name typo. Correct: //span[contains(@class,'MuiChip-label')][starts-with(normalize-space(.),'Approved (')] */
const BROKEN_APPROVED_CHIP =
    "xpath=//span[contains(@class,'MuiChip-lable')][starts-with(normalize-space(.),'Approved (')]";

/** test-id the app never shipped. Correct: {row}//button[normalize-space(.)='Approve'] */
const BROKEN_APPROVE_BUTTON_IN_ROW = "//button[@data-testid='approve-leave']";

/** Grid column field renamed. Correct: {row}//div[@data-field='status'] */
const BROKEN_STATUS_CELL_IN_ROW = "//div[@data-field='leave_status']";

// ------------------------------------------------ the correct locators

const APPLY_BUTTON = "xpath=//button[normalize-space(.)='Apply for Leave']";
const REASON_FIELD = "xpath=//textarea[contains(@placeholder,'reason for leave')]";
const SUBMIT_FOR_APPROVAL = "xpath=//button[@type='submit'][normalize-space(.)='Submit for Approval']";

test.describe('LeaveHealableTest', () => {

    test('HEALABLE_TC_LEAVE_01_adminRecordsLeave_brokenButtonText_HEALABLE', {
        tag: ['@demo', '@healable'],
        annotation: { type: 'description', description: '[HEALABLE] HEALABLE_TC_LEAVE_01 - Admin records leave for an '
            + "employee and it is saved as Approved. Broken: 'Apply Leave' button text (real text 'Apply for Leave')" },
    }, async ({ base }) => {
        const request = TestDataFactory.singleDayLeave(TARGET_EMPLOYEE);
        const day = gridFragments(request);

        base.step('Signing in as the Administrator and opening Leave Management');
        await base.loginAndOpen(Persona.ADMIN, AppModule.LEAVES);
        const leaves = new LeavesPage();
        const approvedBefore = await leaves.tabCount(LeaveStatus.APPROVED);

        base.step('Opening the Apply for Leave drawer  <-- BROKEN LOCATOR');
        await openDrawer(BROKEN_APPLY_BUTTON);

        base.step(`Recording leave for ${TARGET_EMPLOYEE} on ${request.startDate}`);
        const drawer = await new ApplyLeaveDrawer().fill(request);
        await drawer.submitExpectingSuccess();

        base.step('Verifying the request was saved as Approved');
        assertTrue(await leaves.waitForTabCount(LeaveStatus.APPROVED, approvedBefore + 1),
            'Approved count did not rise from ' + approvedBefore);
        assertTrue(await leaves.hasRequestWithStatus(TARGET_EMPLOYEE, LeaveStatus.APPROVED, ...day),
            `No Approved row for ${TARGET_EMPLOYEE} on ${day.join(' ')}`);
        base.verified('Admin-recorded leave is saved as Approved');
    });

    test('HEALABLE_TC_LEAVE_02_hrSubmitsForApproval_brokenAttribute_HEALABLE', {
        tag: ['@demo', '@healable'],
        annotation: { type: 'description', description: '[HEALABLE] HEALABLE_TC_LEAVE_02 - HR submits its own leave '
            + 'for approval and it enters the Pending queue. Broken: reason textarea located by a non-existent name '
            + 'attribute' },
    }, async ({ base }) => {
        const request = TestDataFactory.singleDayLeave(null);
        request.reason = null;
        const day = gridFragments(request);

        base.step('Signing in as HR and opening Leave Management');
        await base.loginAndOpen(Persona.HR, AppModule.LEAVES);
        const leaves = new LeavesPage();
        const pendingBefore = await leaves.tabCount(LeaveStatus.PENDING);

        base.step('Filling the leave form');
        await openDrawer(APPLY_BUTTON);
        await new ApplyLeaveDrawer().fill(request);

        base.step('Typing the reason  <-- BROKEN LOCATOR');
        await (await RawDriver.findElement(BROKEN_REASON_FIELD))
            .pressSequentially('Healable demo ' + TestDataFactory.uniqueToken());

        base.step('Submitting for approval');
        await submitForApproval();

        base.step('Verifying the request is Pending');
        assertTrue(await leaves.waitForTabCount(LeaveStatus.PENDING, pendingBefore + 1),
            'Pending count did not rise from ' + pendingBefore);
        await base.softly().assertTrue(await hasRow(LeaveStatus.PENDING, ...day),
            'No Pending row on ' + day.join(' '));
        base.assertAllSoft();
        base.verified("HR's own leave enters the Pending queue");
    });

    test('HEALABLE_TC_LEAVE_03_approvedCountRises_brokenClassName_HEALABLE', {
        tag: ['@demo', '@healable'],
        annotation: { type: 'description', description: '[HEALABLE] HEALABLE_TC_LEAVE_03 - The Approved tab count '
            + "rises after the Admin records leave. Broken: chip located by a misspelt class 'MuiChip-lable'" },
    }, async ({ base }) => {
        const request = TestDataFactory.singleDayLeave(TARGET_EMPLOYEE);

        base.step('Signing in as the Administrator and opening Leave Management');
        await base.loginAndOpen(Persona.ADMIN, AppModule.LEAVES);
        const leaves = new LeavesPage();
        const before = await leaves.tabCount(LeaveStatus.APPROVED);

        base.step('Recording leave for ' + TARGET_EMPLOYEE);
        await openDrawer(APPLY_BUTTON);
        const drawer = await new ApplyLeaveDrawer().fill(request);
        await drawer.submitExpectingSuccess();
        await leaves.waitForTabCount(LeaveStatus.APPROVED, before + 1);

        base.step('Reading the Approved chip  <-- BROKEN LOCATOR');
        const chip = await (await RawDriver.findElement(BROKEN_APPROVED_CHIP)).innerText();
        const after = Number.parseInt(chip.replace(/[^0-9]/g, ''), 10);

        assertEquals(after, before + 1, `Approved chip reads '${chip}'`);
        base.verified('The Approved chip count rose by one');
    });

    test('HEALABLE_TC_LEAVE_04_adminApprovesHrLeave_brokenTestId_HEALABLE', {
        tag: ['@demo', '@healable'],
        annotation: { type: 'description', description: '[HEALABLE] HEALABLE_TC_LEAVE_04 - HR submits leave and the '
            + 'Admin approves it from the Pending tab. Broken: Approve button located by a data-testid the app does '
            + 'not render' },
    }, async ({ base }) => {
        const request = TestDataFactory.singleDayLeave(null);
        const day = gridFragments(request);

        base.step('HR submits a leave request');
        await hrSubmits(base, request);

        base.step('Signing in as the Administrator');
        await base.loginAndOpen(Persona.ADMIN, AppModule.LEAVES);
        const leaves = new LeavesPage();
        const pending = await leaves.tabCount(LeaveStatus.PENDING);
        const approved = await leaves.tabCount(LeaveStatus.APPROVED);
        await leaves.selectStatusTab(LeaveStatus.PENDING);
        assertTrue(await hasRow(LeaveStatus.PENDING, ...day), "HR's request is not in the Pending tab");

        base.step("Approving HR's request  <-- BROKEN LOCATOR");
        const approve = await RawDriver.findElement(
            'xpath=' + rowXPath(LeaveStatus.PENDING, ...day) + BROKEN_APPROVE_BUTTON_IN_ROW);
        await clickRowAction(approve, 'Approve', ...day);

        base.step('Verifying the counts moved');
        assertTrue(await leaves.waitForTabCount(LeaveStatus.PENDING, pending - 1), 'Pending did not drop');
        await base.softly().assertEquals(await leaves.tabCount(LeaveStatus.APPROVED), approved + 1,
            'Approved did not rise');
        base.assertAllSoft();
        base.verified("Admin approved HR's leave");
    });

    test('HEALABLE_TC_LEAVE_05_adminRejectsHrLeave_brokenDataField_HEALABLE', {
        tag: ['@demo', '@healable'],
        annotation: { type: 'description', description: '[HEALABLE] HEALABLE_TC_LEAVE_05 - HR submits leave, the Admin '
            + "rejects it and the row status reads Rejected. Broken: status cell located by renamed data-field "
            + "'leave_status'" },
    }, async ({ base }) => {
        const request = TestDataFactory.singleDayLeave(null);
        const day = gridFragments(request);

        base.step('HR submits a leave request');
        await hrSubmits(base, request);

        base.step('Signing in as the Administrator and rejecting it');
        await base.loginAndOpen(Persona.ADMIN, AppModule.LEAVES);
        const leaves = new LeavesPage();
        const rejected = await leaves.tabCount(LeaveStatus.REJECTED);
        await leaves.selectStatusTab(LeaveStatus.PENDING);
        await clickRowAction(await RawDriver.findElement(
            'xpath=' + rowXPath(LeaveStatus.PENDING, ...day) + "//button[normalize-space(.)='Reject']"),
            'Reject', ...day);
        assertTrue(await leaves.waitForTabCount(LeaveStatus.REJECTED, rejected + 1), 'Rejected did not rise');

        base.step("Reading the row's status cell  <-- BROKEN LOCATOR");
        await leaves.selectStatusTab(LeaveStatus.REJECTED);
        await WaitUtils.waitForVisible('xpath=' + rowXPath(LeaveStatus.REJECTED, ...day));
        const status = await (await RawDriver.findElement(
            'xpath=' + rowXPath(LeaveStatus.REJECTED, ...day) + BROKEN_STATUS_CELL_IN_ROW)).innerText();

        assertEquals(status.trim(), 'Rejected', 'Status cell');
        base.verified('Rejected leave shows Rejected in its status cell');
    });
});

// ---------------------------------------------------------------- helpers

/**
 * Opens the Apply for Leave drawer. The button often ignores the first
 * native click, so it is retried with a scripted pointer sequence.
 */
async function openDrawer(applyButton: string): Promise<void> {
    const button = await RawDriver.findElement(applyButton);
    await ElementUtils.clickElement(button);
    for (let attempt = 0; attempt < 3 && !await WaitUtils.isVisibleWithin(REASON_FIELD, 3000); attempt++) {
        await ElementUtils.clickViaScript(button);
    }
    assertTrue(await ElementUtils.isDisplayed(REASON_FIELD), 'The Apply for Leave drawer did not open');
    await WaitUtils.sleepQuietly(700);
}

async function submitForApproval(): Promise<void> {
    await ElementUtils.click(SUBMIT_FOR_APPROVAL);
    if (!await WaitUtils.waitForInvisibleQuietly(SUBMIT_FOR_APPROVAL, 8000)) {
        await ElementUtils.clickViaScript(SUBMIT_FOR_APPROVAL);
    }
    assertTrue(await WaitUtils.waitForInvisibleQuietly(SUBMIT_FOR_APPROVAL, 10000),
        'The drawer stayed open after Submit for Approval');
    await WaitUtils.waitForDataToSettle();
}

/** HR signs in, submits the request for approval, and signs out. */
async function hrSubmits(base: BaseTest, request: LeaveRequestData): Promise<void> {
    await base.loginAndOpen(Persona.HR, AppModule.LEAVES);
    const leaves = new LeavesPage();
    const pendingBefore = await leaves.tabCount(LeaveStatus.PENDING);
    await openDrawer(APPLY_BUTTON);
    await new ApplyLeaveDrawer().fill(request);
    await submitForApproval();
    assertTrue(await leaves.waitForTabCount(LeaveStatus.PENDING, pendingBefore + 1),
        "HR's request was not queued as Pending");
    await new DashboardPage().header().logout();
}

function gridFragments(request: LeaveRequestData): string[] {
    const day = DateUtils.fromDateInput(request.startDate!);
    return [DateUtils.gridDayMonth(day), String(day.getFullYear())];
}

function rowXPath(status: LeaveStatus, ...fragments: string[]): string {
    let xpath = "//div[contains(@class,'MuiDataGrid-row')]"
        + `[.//span[contains(@class,'MuiChip-label')][normalize-space(.)=${MuiUtils.escapeForXPath(status.label())}]]`;
    for (const fragment of fragments) {
        xpath += `[contains(normalize-space(.),${MuiUtils.escapeForXPath(fragment)})]`;
    }
    return xpath;
}

async function hasRow(status: LeaveStatus, ...fragments: string[]): Promise<boolean> {
    return WaitUtils.isVisibleWithin('xpath=' + rowXPath(status, ...fragments), 12000);
}

/**
 * Clicks Approve / Reject on a Pending row. Like the Apply button, these
 * often ignore a single native click, so the click is replayed until the
 * row leaves the Pending state.
 */
async function clickRowAction(button: Locator, action: string, ...day: string[]): Promise<void> {
    const pendingRow = 'xpath=' + rowXPath(LeaveStatus.PENDING, ...day);
    await ElementUtils.clickElement(button);
    for (let attempt = 0; attempt < 3; attempt++) {
        await confirmIfAsked(action);
        if (await WaitUtils.waitForInvisibleQuietly(pendingRow, 5000)) {
            return;
        }
        if ((await button.count()) === 0) {
            return; // the row re-rendered, so the action went through
        }
        await ElementUtils.clickViaScript(button);
    }
}

async function confirmIfAsked(action: string): Promise<void> {
    if (await WaitUtils.isVisibleWithin(MuiUtils.DIALOG, 3000)) {
        assertTrue(await MuiUtils.clickDialogButtonAndWaitForClose(action),
            `The '${action}' confirmation dialog did not close`);
    }
    await WaitUtils.waitForDataToSettle();
}
