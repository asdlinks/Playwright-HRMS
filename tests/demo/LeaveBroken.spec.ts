import type { Locator, Page } from '@playwright/test';
import { Assert } from '../../src/base/Assert';
import { test } from '../../src/base/BaseTest';
import { TestDataFactory } from '../../src/data/TestDataFactory';
import { LeaveRequestData } from '../../src/data/model/LeaveRequestData';
import { DriverManager } from '../../src/driver/DriverManager';
import { RawDriver } from '../../src/driver/RawDriver';
import { LeaveType } from '../../src/enums/LeaveType';
import { ApplyLeaveDrawer } from '../../src/pages/timeleave/ApplyLeaveDrawer';
import { LeavesPage } from '../../src/pages/timeleave/LeavesPage';
import { ElementUtils } from '../../src/utils/ElementUtils';
import { parseJavaInt } from '../../src/utils/MuiUtils';

/**
 * BROKEN - ALWAYS FAILS. Worst-quality code on purpose.
 *
 * UNHEALABLE_*   the failure is NOT a stale locator: the feature, page or
 *                message does not exist in the app, or the test script itself
 *                crashes. A healer has nothing correct to heal towards and
 *                should report "could not heal" (or must not pick some random
 *                element and call it a heal).
 * NORMALFAIL_*   every locator is correct and every step works; the test
 *                fails on an assertion because its expectation is wrong
 *                about the app's behaviour/data. This is an ordinary test
 *                failure - healing must NOT change anything here.
 *
 * See FLAKY_HEALING_DEMO.md at the project root.
 * Run with:  npm run test:broken
 */

let d: Page;
let s1: string, s2: string, s3: string;
let i1: number, i2: number;
let m!: Map<string, string>;
let l: Locator[];

const sleep = (ms: number) => d.waitForTimeout(ms);
const findElement = (selector: string) => RawDriver.findElement(selector);

test.describe('LeaveBrokenTest', () => {

    test('UNHEALABLE_TC_LEAVE_01_bulkApproveAllPending_featureMissing_UNHEALABLE', {
        tag: ['@demo', '@unhealable'],
        annotation: { type: 'description', description: '[UNHEALABLE] UNHEALABLE_TC_LEAVE_01 - Admin bulk-approves '
            + "every pending leave. Fails: the app has no 'Bulk Approve All' button - there is no element to heal to" },
    }, async ({ base }) => {
        try {
            d = DriverManager.get();
            await d.goto('https://test.mywehr.com/login');
            await sleep(2500);
            await (await findElement("[name='tenantCode']")).pressSequentially('myc001');
            await (await findElement("[name='email']")).pressSequentially('mycompany@yopmail.com');
            await (await findElement("[name='password']")).pressSequentially('mycompany@123');
            await (await findElement("xpath=//button[@type='submit']")).click();
            await sleep(5000);
            await d.goto('https://test.mywehr.com/leaves');
            await sleep(5000);
            s1 = await (await findElement("xpath=(//span[contains(@class,'MuiChip-label')])[2]")).innerText();
            i1 = parseJavaInt(s1.replace(/\D/g, ''));
            console.log('pending=' + i1);
            await (await findElement("xpath=(//span[contains(@class,'MuiChip-label')])[2]")).click();
            await sleep(3000);
            await (await findElement("xpath=//button[normalize-space(.)='Bulk Approve All']")).click();
            await sleep(3000);
            await (await findElement(
                `xpath=//div[@role='dialog']//button[normalize-space(.)='Yes, approve ${i1}']`)).click();
            await sleep(5000);
            s1 = await (await findElement("xpath=(//span[contains(@class,'MuiChip-label')])[2]")).innerText();
            Assert.assertEquals(s1, 'Pending (0)');
        } catch (t) {
            console.log('ERROR!!!! ' + (t as Error).message);
            throw t;
        }
    });

    test('UNHEALABLE_TC_LEAVE_02_leaveApprovalsV2Page_routeMissing_UNHEALABLE', {
        tag: ['@demo', '@unhealable'],
        annotation: { type: 'description', description: '[UNHEALABLE] UNHEALABLE_TC_LEAVE_02 - Admin opens the Leave '
            + 'Approvals v2 page. Fails: the route /leaves/approvals-v2 does not exist, so the page and its heading '
            + 'never render' },
    }, async ({ base }) => {
        d = DriverManager.get();
        await d.goto('https://test.mywehr.com/login');
        await sleep(2500);
        await (await findElement("[name='tenantCode']")).pressSequentially('myc001');
        await (await findElement("[name='email']")).pressSequentially('mycompany@yopmail.com');
        await (await findElement("[name='password']")).pressSequentially('mycompany@123');
        await (await findElement("xpath=//button[@type='submit']")).click();
        await sleep(5000);
        await d.goto('https://test.mywehr.com/leaves/approvals-v2');
        await sleep(5000);
        const h = d.locator("xpath=//h4[normalize-space(.)='Leave Approvals']").first();
        await h.waitFor({ state: 'visible', timeout: 15000 });
        Assert.assertTrue(await h.isVisible());
        l = await RawDriver.findElements("xpath=//table[@id='approvals-table']//tr");
        Assert.assertTrue(l.length > 0, 'no rows');
    });

    test('UNHEALABLE_TC_LEAVE_03_tabTotals_scriptBug_UNHEALABLE', {
        tag: ['@demo', '@unhealable'],
        annotation: { type: 'description', description: '[UNHEALABLE] UNHEALABLE_TC_LEAVE_03 - Leave tab totals add '
            + 'up. Fails: the TEST SCRIPT crashes (TypeError on a map that is never created; past that, a '
            + "NumberFormatException parsing 'All (n)') - every locator is fine, so there is nothing to heal" },
    }, async ({ base }) => {
        d = DriverManager.get();
        await d.goto('https://test.mywehr.com/login');
        await sleep(2500);
        await (await findElement("[name='tenantCode']")).pressSequentially('myc001');
        await (await findElement("[name='email']")).pressSequentially('mycompany@yopmail.com');
        await (await findElement("[name='password']")).pressSequentially('mycompany@123');
        await (await findElement("xpath=//button[@type='submit']")).click();
        await sleep(5000);
        await d.goto('https://test.mywehr.com/leaves');
        await sleep(5000);
        l = await RawDriver.findElements("xpath=//span[contains(@class,'MuiChip-label')]");
        let t = 0;
        for (let i = 1; i < l.length; i++) {
            m.set('tab' + i, await l[i].innerText());
            t = t + parseJavaInt((await l[i].innerText()).split(' ')[1]);
        }
        i2 = parseJavaInt(await l[0].innerText());
        Assert.assertEquals(t, i2);
    });

    test('UNHEALABLE_TC_LEAVE_04_successToastAfterSubmit_messageNeverShown_UNHEALABLE', {
        tag: ['@demo', '@unhealable'],
        annotation: { type: 'description', description: "[UNHEALABLE] UNHEALABLE_TC_LEAVE_04 - HR submits leave and "
            + "sees a 'Leave applied successfully' toast. Fails: the app shows no toast at all after submitting - "
            + 'nothing to heal to' },
    }, async ({ base }) => {
        d = DriverManager.get();
        await d.goto('https://test.mywehr.com/login');
        await sleep(2500);
        await (await findElement("[name='tenantCode']")).pressSequentially('myc001');
        await (await findElement("[name='email']")).pressSequentially('hr@yopmail.com');
        await (await findElement("[name='password']")).pressSequentially('hr@123');
        await (await findElement("xpath=//button[@type='submit']")).click();
        await sleep(5000);
        await d.goto('https://test.mywehr.com/leaves');
        await sleep(5000);
        for (let k = 0; k < 3 && (await RawDriver.findElements('xpath=//textarea')).length === 0; k++) {
            await (await findElement("xpath=//button[contains(.,'Apply for Leave')]")).click();
            await sleep(2000);
        }
        // submit an EMPTY form - no dates - and still expect a success toast
        await (await findElement("xpath=//button[contains(.,'Submit for Approval')]")).click();
        const toast = d.locator("xpath=//div[contains(@class,'Toastify__toast--success')]"
            + "[contains(.,'Leave applied successfully')]").first();
        await toast.waitFor({ state: 'visible', timeout: 10000 });
        Assert.assertTrue(await toast.isVisible());
    });

    test('NORMALFAIL_TC_LEAVE_05_adminRecordedLeaveExpectedPending_wrongExpectation_ASSERTION', {
        tag: ['@demo', '@normal-fail'],
        annotation: { type: 'description', description: '[NORMAL-FAIL] NORMALFAIL_TC_LEAVE_05 - Leave the Admin '
            + 'records for sales1 should wait in Pending. Fails on the ASSERTION: the app auto-approves admin-recorded '
            + 'leave (Approved +1, Pending unchanged). All locators are correct - do not heal' },
    }, async ({ base }) => {
        d = DriverManager.get();
        await d.goto('https://test.mywehr.com/login');
        await sleep(2500);
        await (await findElement("[name='tenantCode']")).pressSequentially('myc001');
        await (await findElement("[name='email']")).pressSequentially('mycompany@yopmail.com');
        await (await findElement("[name='password']")).pressSequentially('mycompany@123');
        await (await findElement("xpath=//button[@type='submit']")).click();
        await sleep(5000);
        await d.goto('https://test.mywehr.com/leaves');
        await sleep(5000);
        s1 = await (await findElement(
            "xpath=//span[contains(@class,'MuiChip-label')][starts-with(.,'Pending')]")).innerText();
        i1 = parseJavaInt(s1.replace(/\D/g, ''));
        const r: LeaveRequestData = TestDataFactory.singleDayLeave('sales1');
        for (let k = 0; k < 3 && (await RawDriver.findElements('xpath=//textarea')).length === 0; k++) {
            await ElementUtils.clickViaScript("xpath=//button[contains(.,'Apply for Leave')]");
            await sleep(2000);
        }
        await sleep(700);
        await (await new ApplyLeaveDrawer().fill(r)).submitExpectingSuccess();
        await sleep(4000);
        s2 = await (await findElement(
            "xpath=//span[contains(@class,'MuiChip-label')][starts-with(.,'Pending')]")).innerText();
        i2 = parseJavaInt(s2.replace(/\D/g, ''));
        console.log(i1 + ' -> ' + i2);
        Assert.assertEquals(i2, i1 + 1, 'admin-recorded leave should go to Pending for approval');
    });

    test('NORMALFAIL_TC_LEAVE_06_casualEntitlementIs20_staleTestData_ASSERTION', {
        tag: ['@demo', '@normal-fail'],
        annotation: { type: 'description', description: "[NORMAL-FAIL] NORMALFAIL_TC_LEAVE_06 - Admin's Casual leave "
            + 'card shows a 20-day entitlement. Fails on the ASSERTION: the tenant policy is 15 days (card reads '
            + 'n/15). All locators are correct - do not heal' },
    }, async ({ base }) => {
        d = DriverManager.get();
        await d.goto('https://test.mywehr.com/login');
        await sleep(2500);
        await (await findElement("[name='tenantCode']")).pressSequentially('myc001');
        await (await findElement("[name='email']")).pressSequentially('mycompany@yopmail.com');
        await (await findElement("[name='password']")).pressSequentially('mycompany@123');
        await (await findElement("xpath=//button[@type='submit']")).click();
        await sleep(5000);
        await d.goto('https://test.mywehr.com/leaves');
        await sleep(5000);
        i1 = await new LeavesPage().totalEntitlement(LeaveType.CASUAL);
        console.log('casual total: ' + i1);
        Assert.assertEquals(i1, 20, 'casual entitlement');
    });
});
