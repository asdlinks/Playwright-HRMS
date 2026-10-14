import { assertEquals, assertTrue } from '../../src/base/Assert';
import { test } from '../../src/base/BaseTest';
import { ConfigManager } from '../../src/config/ConfigManager';
import { DriverManager } from '../../src/driver/DriverManager';
import { RawDriver } from '../../src/driver/RawDriver';
import { DashboardPage } from '../../src/pages/dashboard/DashboardPage';
import { DateUtils } from '../../src/utils/DateUtils';
import { ElementUtils } from '../../src/utils/ElementUtils';
import { MuiUtils, parseJavaInt } from '../../src/utils/MuiUtils';

/**
 * FLAKY_ - brittle leave flows that PASS SOMETIMES.
 *
 * Every locator here matches the live app today, so these can go green, but
 * they are written to fail intermittently: hard sleeps instead of waits,
 * index-based XPaths, "first row is mine" assumptions, a single retry on
 * buttons that are known to ignore native clicks, random dates that can
 * collide with earlier runs, and no handling of the daily check-in reminder.
 * Expect a mix of passes and failures across runs - and failures that move
 * between steps from one run to the next.
 *
 * Deliberately low quality. See FLAKY_HEALING_DEMO.md at the project root.
 * Run with:  npm run test:flaky
 */

const u = 'https://test.mywehr.com';
const emp = 'sales1';
let x = 0;

test.describe('LeaveFlakyTest', () => {

    test('FLAKY_TC_LEAVE_01_adminRecordsLeave_FLAKY', {
        tag: ['@demo', '@flaky'],
        annotation: { type: 'description', description: '[FLAKY] FLAKY_TC_LEAVE_01 - Admin records leave for sales1 '
            + 'and it shows as Approved. Flaky: random date can fall on a weekly off, fixed sleeps before reading '
            + 'counts, first-row assumption' },
    }, async ({ base }) => {
        base.step('login admin');
        await doLogin(1);
        await go('/leaves');
        await wt(3000);

        const a = await num(3);
        const p = await num(2);
        base.note('approved ' + a + ' pending ' + p);

        base.step('apply');
        const d = getD(0);
        await fillStuff(true, d, d);
        await sub('Record Leave');

        base.step('check');
        assertTrue(await num(3) === a + 1, 'count wrong');
        assertEquals(await num(2), p, 'pending wrong');
        await clk("(//span[contains(@class,'MuiChip-label')])[3]");
        await wt(2500);
        const r = await (await RawDriver.findElement("xpath=//div[@data-rowindex='0']")).innerText();
        await base.softly().assertTrue(r.includes(emp), 'row bad: ' + r);
        await base.softly().assertTrue(r.includes('Approved'), 'not approved');
        await base.softly().assertTrue(r.includes(gridD(d)), 'date not there ' + gridD(d));
        base.assertAllSoft();
        base.verified('ok');
    });

    test('FLAKY_TC_LEAVE_02_adminLeaveVisibleToHr_FLAKY', {
        tag: ['@demo', '@flaky'],
        annotation: { type: 'description', description: '[FLAKY] FLAKY_TC_LEAVE_02 - Leave recorded by Admin is '
            + 'visible to HR after switching user. Flaky: session switch by clearing storage, fixed sleeps, row must '
            + 'be in the first 3' },
    }, async ({ base }) => {
        base.step('admin stuff');
        await doLogin(1);
        await go('/leaves');
        await wt(3000);
        const before = await num(3);
        const d = getD(1);
        await fillStuff(true, d, d);
        await sub('Record Leave');
        assertEquals(await num(3), before + 1);

        base.step('switch');
        await reset();
        await doLogin(2);
        await go('/leaves');
        await wt(3000);

        base.step('hr check');
        assertEquals(await num(3), before + 1, 'hr count');
        await clk("(//span[contains(@class,'MuiChip-label')])[3]");
        await wt(2500);
        const rows = await RawDriver.findElements('xpath=//div[@data-rowindex]');
        let f = false;
        for (let i = 0; i < 3; i++) {
            const text = await rows[i].innerText();
            if (text.includes(emp) && text.includes(gridD(d))) {
                f = true;
            }
        }
        assertTrue(f, 'not found');
        await base.softly().assertTrue(
            (await (await RawDriver.findElement('xpath=//main//h4')).innerText()).includes('Leave'), 'title');
        base.assertAllSoft();
        base.verified('ok');
    });

    test('FLAKY_TC_LEAVE_03_hrAppliesAdminApproves_FLAKY', {
        tag: ['@demo', '@flaky'],
        annotation: { type: 'description', description: '[FLAKY] FLAKY_TC_LEAVE_03 - HR submits leave for approval '
            + 'and Admin approves the first Pending row. Flaky: assumes HR\'s request is the first Pending row, '
            + 'one-shot dialog click' },
    }, async ({ base }) => {
        base.step('hr apply');
        await doLogin(2);
        await go('/leaves');
        await wt(3000);
        const p0 = await num(2);
        const d = getD(2);
        await fillStuff(false, d, d);
        await sub('Submit for Approval');
        assertEquals(await num(2), p0 + 1, 'nothing went pending');

        base.step('admin approve');
        await reset();
        await doLogin(1);
        await go('/leaves');
        await wt(3000);
        const p = await num(2);
        const a = await num(3);
        await clk("(//span[contains(@class,'MuiChip-label')])[2]");
        await wt(2500);
        await base.softly().assertTrue(
            (await (await RawDriver.findElement("xpath=//div[@data-rowindex='0']")).innerText()).includes(gridD(d)),
            'first pending row is not ours');
        await doIt('Approve');

        base.step('verify');
        assertEquals(await num(2), p - 1, 'pending not reduced');
        assertEquals(await num(3), a + 1, 'approved not increased');
        await base.softly().assertEquals(await num(1), await num(2) + await num(3) + await num(4) + await num(5),
            'tabs');
        base.assertAllSoft();
        base.verified('ok');
    });

    test('FLAKY_TC_LEAVE_04_hrAppliesAdminRejects_FLAKY', {
        tag: ['@demo', '@flaky'],
        annotation: { type: 'description', description: '[FLAKY] FLAKY_TC_LEAVE_04 - HR submits leave, Admin rejects '
            + 'it, HR sees Rejected. Flaky: three sign-ins, positional status cell div[6], one-shot clicks' },
    }, async ({ base }) => {
        base.step('hr apply');
        await doLogin(2);
        await go('/leaves');
        await wt(3000);
        const d = getD(3);
        await fillStuff(false, d, d);
        await sub('Submit for Approval');
        const rj = await num(4);

        base.step('admin reject');
        await reset();
        await doLogin(1);
        await go('/leaves');
        await wt(3000);
        await clk("(//span[contains(@class,'MuiChip-label')])[2]");
        await wt(2500);
        await doIt('Reject');
        assertEquals(await num(4), rj + 1, 'rejected count');

        base.step('hr sees it');
        await reset();
        await doLogin(2);
        await go('/leaves');
        await wt(3000);
        await clk("(//span[contains(@class,'MuiChip-label')])[4]");
        await wt(2500);
        const t = await (await RawDriver.findElement("xpath=//div[@data-rowindex='0']/div[6]")).innerText();
        await base.softly().assertEquals(t.trim(), 'Rejected', 'status cell');
        await base.softly().assertTrue(
            (await (await RawDriver.findElement("xpath=//div[@data-rowindex='0']")).innerText()).includes(gridD(d)),
            'date');
        base.assertAllSoft();
        base.verified('ok');
    });

    test('FLAKY_TC_LEAVE_05_invalidLeaveNotSaved_FLAKY', {
        tag: ['@demo', '@flaky'],
        annotation: { type: 'description', description: '[FLAKY] FLAKY_TC_LEAVE_05 - Invalid leave submissions are '
            + 'rejected and counts do not change. Flaky: drawer opening, Escape-to-close with a fixed sleep' },
    }, async ({ base }) => {
        base.step('login');
        await doLogin(1);
        await go('/leaves');
        await wt(3000);
        const all = await num(1);

        base.step('empty submit');
        await open();
        await clk("//button[text()='Record Leave']");
        await wt(2000);
        assertTrue(await chk("//button[text()='Record Leave']"), 'drawer closed on empty submit');

        base.step('end before start');
        await dt(1, getD(4));
        await dt(2, getD(-30));
        await wt(1000);
        await jclk("//button[text()='Record Leave']");
        await wt(2000);
        assertTrue(await chk("//button[text()='Record Leave']"), 'drawer closed on bad range');

        base.step('close + recount');
        await (await RawDriver.findElement('body')).press('Escape');
        await wt(1500);
        assertEquals(await num(1), all, 'all count changed');
        await base.softly().assertEquals(await num(1), await num(2) + await num(3) + await num(4) + await num(5),
            'tabs dont add up');
        base.assertAllSoft();
        base.verified('ok');
    });
});

// ---------------------------------------------------------------- helpers

async function doLogin(w: number): Promise<void> {
    const dr = DriverManager.get();
    await dr.goto(u + '/login');
    await wt(3500);
    await (await RawDriver.findElement("xpath=//input[@placeholder='e.g. mywe']")).pressSequentially('myc001');
    if (w === 1) {
        await (await RawDriver.findElement("xpath=//input[@placeholder='name@company.com']"))
            .pressSequentially('mycompany@yopmail.com');
        await (await RawDriver.findElement("xpath=//input[@type='password']")).pressSequentially('mycompany@123');
    } else {
        await (await RawDriver.findElement("xpath=//input[@placeholder='name@company.com']"))
            .pressSequentially('hr@yopmail.com');
        await (await RawDriver.findElement("xpath=//input[@type='password']")).pressSequentially('hr@123');
    }
    await (await RawDriver.findElement("xpath=//input[@type='password']")).press('Enter');
    await wt(4000);
    x = w;
}

async function go(p: string): Promise<void> {
    await DriverManager.get().goto(u + p);
}

async function reset(): Promise<void> {
    // clearing cookies/storage does NOT log out here - use the avatar menu
    await new DashboardPage().header().logout();
    await wt(1000);
}

async function clk(xp: string): Promise<void> {
    await (await RawDriver.findElement('xpath=' + xp)).click({ timeout: ConfigManager.nativeClickTimeout() });
}

async function chk(xp: string): Promise<boolean> {
    try {
        return await (await RawDriver.findElement('xpath=' + xp)).isVisible();
    } catch (e) {
        return false;
    }
}

// "is disabled"
async function dis(xp: string): Promise<boolean> {
    const b = await RawDriver.findElement('xpath=' + xp);
    return !await b.isEnabled() || ((await b.getAttribute('class')) ?? '').includes('Mui-disabled');
}

async function wt(ms: number): Promise<void> {
    try {
        await DriverManager.get().waitForTimeout(ms);
    } catch (e) {
    }
}

// 1=all 2=pending 3=approved 4=rejected 5=cancelled
async function num(i: number): Promise<number> {
    const t = await (await RawDriver.findElement(`xpath=(//span[contains(@class,'MuiChip-label')])[${i}]`)).innerText();
    return parseJavaInt(t.substring(t.indexOf('(') + 1, t.indexOf(')')));
}

// opens the drawer - native click, then up to two "js" clicks, fixed sleeps, never checks the last one
async function open(): Promise<void> {
    await clk("//button[contains(.,'Apply for Leave')]");
    await wt(1500);
    for (let i = 0; i < 2 && !await chk('(//textarea)[1]'); i++) {
        await jclk("//button[contains(.,'Apply for Leave')]");
        await wt(1500);
    }
    await wt(500);
}

// "javascript click"
async function jclk(xp: string): Promise<void> {
    await ElementUtils.clickViaScript(await RawDriver.findElement('xpath=' + xp));
}

// sets date input n (1 or 2) to mm/dd/yyyy
async function dt(n: number, mdy: string): Promise<void> {
    const p = mdy.split('/');
    const e = await RawDriver.findElement(`xpath=(//input[@type='date'])[${n}]`);
    await e.evaluate((el, v) => {
        const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
        s.call(el, v);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
    }, p[2] + '-' + p[0] + '-' + p[1]);
}

// a = true means pick sales1 in the target box (admin only)
async function fillStuff(a: boolean, s: string, e: string): Promise<void> {
    await open();
    if (a) {
        await wt(700);
        // plain typing doesn't stick in this autocomplete - borrow the framework one
        await MuiUtils.searchAndSelect(
            "xpath=(//div[contains(@class,'MuiDrawer-paper')])[2]//input[contains(@placeholder,'Search employee')]", emp);
        await wt(800);
        // leave type is pre-filled with Casual - just trust it
    }
    await clk("//button[text()='Full Day']");
    await dt(1, s);
    await dt(2, e);
    await wt(500);
    await ElementUtils.type('xpath=(//textarea)[1]', 'flaky test ' + Date.now());
}

// submit button - clicked, and clicked again if the drawer is still there
async function sub(txt: string): Promise<void> {
    try {
        await clk(`//button[text()='${txt}']`);
    } catch (ex) {
        await jclk(`//button[text()='${txt}']`);
    }
    await wt(3000);
    if (await chk(`//button[text()='${txt}']`)) {
        await jclk(`//button[text()='${txt}']`);
        await wt(3000);
    }
    await wt(1500);
}

// clicks the first Approve / Reject button in the grid, confirms once
async function doIt(s: string): Promise<void> {
    await clk(`(//button[text()='${s}'])[1]`);
    await wt(1500);
    if (!await chk("//div[@role='dialog']")) {
        await jclk(`(//button[text()='${s}'])[1]`);
        await wt(1500);
    }
    if (await chk("//div[@role='dialog']")) {
        await clk(`//div[@role='dialog']//button[text()='${s}']`);
        await wt(2000);
        if (await chk("//div[@role='dialog']")) {
            await jclk(`//div[@role='dialog']//button[text()='${s}']`);
        }
    }
    await wt(3500);
}

// random-ish future date, offset k so tests don't collide (mostly)
function getD(k: number): string {
    return DateUtils.forDateInput(40 + Math.floor(Math.random() * 250) + k);
}

function gridD(d: string): string {
    return DateUtils.gridDate(DateUtils.fromDateInput(d));
}
