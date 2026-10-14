# Flaky / Healing Demo Tests

Deliberately bad leave-flow tests for trying out flaky-test detection and
self-healing tools. They sit apart from the real suite in `tests/demo/`, run
only in the `demo` Playwright project, and carry the `@demo` tag. The `demo`
project has `retries: 0`, so a failure is never hidden by a retry.

This is a port of the Selenium demo set. Test names, flows, broken locators and
failure causes are the same.

| Run | Command | Spec |
|---|---|---|
| Flaky set | `npm run test:flaky` | `tests/demo/LeaveFlaky.spec.ts` |
| Healable set | `npm run test:healable` | `tests/demo/LeaveHealable.spec.ts` |
| Broken set (unhealable + normal failures) | `npm run test:broken` | `tests/demo/LeaveBroken.spec.ts` |
| Everything | `npm run test:demo` | all three |

The test name says what kind of test it is. The test's `description`
annotation (shown in the HTML report) starts with the same tag and says why
the test fails.

| Prefix / suffix | Tag | What to expect | What a healer should do |
|---|---|---|---|
| `FLAKY_TC_…_FLAKY` | `@flaky` | Passes on some runs and fails on others, often at a different step each time | Nothing permanent. The cause is timing, data and test design, not a stale locator |
| `HEALABLE_TC_…_HEALABLE` | `@healable` | Fails every run with `NoSuchElementError` on one `BROKEN_*` locator | **Heal it.** The intended element is on the page. After healing, the test should pass |
| `UNHEALABLE_TC_…_UNHEALABLE` | `@unhealable` | Fails every run. The feature, page or message doesn't exist, or the script itself crashes | **Report "could not heal".** Picking some other element and calling it healed is a wrong heal |
| `NORMALFAIL_TC_…_ASSERTION` | `@normal-fail` | Fails every run on an assertion. Every locator and step works | **Don't touch it.** It's an ordinary test failure: the expectation is wrong |

### How the demo specs find elements

Playwright locators wait for their element, which would turn every broken
locator into a slow timeout. The demo specs therefore look elements up through
`RawDriver.findElement` (`src/driver/RawDriver.ts`): no waiting, and a missing
element fails at once with
`NoSuchElementError: no such element: Unable to locate element: {"method":"xpath","selector":"…"}`,
the same signal Selenium gave with its implicit wait at zero.

---

## FLAKY set: `LeaveFlaky.spec.ts`

Raw `RawDriver.findElement`, index-based XPaths, `waitForTimeout` sleeps,
hardcoded credentials and unclear helper names (`doLogin(n)`, `num(n)`,
`fillStuff`, `doIt`, `clk`, `jclk`, `chk`, `wt`, `getD`). Every locator
matches the app today, so each test can pass. Two fields (Admin's Target
Employee and the Reason box) borrow framework helpers, because plain typing
into them never sticks and the tests could never pass otherwise.

| Test | Flow | Why it's flaky |
|---|---|---|
| `FLAKY_TC_LEAVE_01_adminRecordsLeave_FLAKY` | Admin records leave for sales1 → Approved +1, first Approved row matches | The random date can fall on a weekly off (Sunday or 2nd/4th Saturday), which disables Record Leave. Counts are read after a fixed sleep. Assumes the new row is row 0. Grid shows `Sept`, the test expects `Sep` |
| `FLAKY_TC_LEAVE_02_adminLeaveVisibleToHr_FLAKY` | Admin records → HR sees it in the first 3 Approved rows | Same as 01, plus a sign-out and sign-in done with fixed sleeps |
| `FLAKY_TC_LEAVE_03_hrAppliesAdminApproves_FLAKY` | HR submits for approval → Admin approves the **first** Pending row | Assumes HR's request is the first Pending row. Weekly-off dates. The Pending count is read after a fixed sleep. Two sign-ins |
| `FLAKY_TC_LEAVE_04_hrAppliesAdminRejects_FLAKY` | HR submits → Admin rejects → HR checks the Rejected tab | Three sign-ins, each typed after a fixed sleep. Sometimes the page re-renders and wipes the fields. Reads the status cell by position (`div[6]`) |
| `FLAKY_TC_LEAVE_05_invalidLeaveNotSaved_FLAKY` | Empty submit, then an end date before the start date, are both refused; counts unchanged | Both dates are random, so the "invalid" range is sometimes valid. Relies on Escape plus a fixed sleep to close the drawer |

Other causes: no handling for the daily check-in reminder (it appears on each
persona's first login of the day), random dates that can overlap an earlier
run, and grid loading time that varies.

**Observed on the Selenium version, 2026-10-06** (last 3 runs, no retries): 01
passed 1 of 3, 05 passed 3 of 3, and 02, 03 and 04 failed every time, each run
at a different step. 02–04 have the longest flows, so they pass least often.
If they need to pass more often, lengthen the `wt(...)` sleeps. The Playwright
version has not been measured yet.

## HEALABLE set: `LeaveHealable.spec.ts`

Each test is a real end-to-end flow, written properly. It fails only because of
one `BROKEN_*` locator, marked `<-- BROKEN LOCATOR` in the step log.

| Test | Flow | Broken locator | Correct locator |
|---|---|---|---|
| `HEALABLE_TC_LEAVE_01_adminRecordsLeave_brokenButtonText_HEALABLE` | Admin records leave → Approved | `//button[normalize-space(.)='Apply Leave']` (text changed) | `//button[normalize-space(.)='Apply for Leave']` |
| `HEALABLE_TC_LEAVE_02_hrSubmitsForApproval_brokenAttribute_HEALABLE` | HR submits own leave → Pending +1 | `//textarea[@name='leaveReason']` (attribute never existed) | `//textarea[contains(@placeholder,'reason for leave')]` |
| `HEALABLE_TC_LEAVE_03_approvedCountRises_brokenClassName_HEALABLE` | Admin records → Approved chip +1 | `//span[contains(@class,'MuiChip-lable')][starts-with(normalize-space(.),'Approved (')]` (class typo) | `…[contains(@class,'MuiChip-label')]…` |
| `HEALABLE_TC_LEAVE_04_adminApprovesHrLeave_brokenTestId_HEALABLE` | HR submits → Admin approves that row | `{row}//button[@data-testid='approve-leave']` (test-id not rendered) | `{row}//button[normalize-space(.)='Approve']` |
| `HEALABLE_TC_LEAVE_05_adminRejectsHrLeave_brokenDataField_HEALABLE` | HR submits → Admin rejects → status cell says Rejected | `{row}//div[@data-field='leave_status']` (column renamed) | `{row}//div[@data-field='status']` |

`{row}` is the grid row matching the request's status and date.

Healers that learn from a passing run (Healenium-style) need a green baseline
first. Run once with the correct locators, then restore the broken ones.

## BROKEN set: `LeaveBroken.spec.ts`

Worst-quality code on purpose: module-level mutable state, copy-pasted login,
`catch` and rethrow, `console.log`, magic sleeps, and no report steps. Every
test fails on every run.

| Test | Category | Why it fails |
|---|---|---|
| `UNHEALABLE_TC_LEAVE_01_bulkApproveAllPending_featureMissing_UNHEALABLE` | Unhealable | Clicks a "Bulk Approve All" button. The app has no such feature |
| `UNHEALABLE_TC_LEAVE_02_leaveApprovalsV2Page_routeMissing_UNHEALABLE` | Unhealable | Opens `/leaves/approvals-v2`, which doesn't exist, then waits for its heading and table |
| `UNHEALABLE_TC_LEAVE_03_tabTotals_scriptBug_UNHEALABLE` | Unhealable | The test code crashes with a `TypeError` on a map that is never created (and a bad number parse after that). Every locator is fine |
| `UNHEALABLE_TC_LEAVE_04_successToastAfterSubmit_messageNeverShown_UNHEALABLE` | Unhealable | Submits an empty form and waits for a "Leave applied successfully" toast. The app never shows one |
| `NORMALFAIL_TC_LEAVE_05_adminRecordedLeaveExpectedPending_wrongExpectation_ASSERTION` | Normal failure | Expects admin-recorded leave to go to Pending. The app auto-approves it |
| `NORMALFAIL_TC_LEAVE_06_casualEntitlementIs20_staleTestData_ASSERTION` | Normal failure | Expects a 20-day Casual entitlement. The tenant policy is 15 |

## Leave balance will run out

Every Admin flow records **Casual** leave for **sales1**. When sales1's Casual
balance reaches 0, FLAKY 01/02, HEALABLE 01/03 and NORMALFAIL 05 will fail
because of the balance, not because of what they're meant to show. A healed
HEALABLE test would still be red. Check the balance before a demo run, top up
or reset it in the tenant, or point `TARGET_EMPLOYEE` / `emp` at another
employee. HR's own Casual balance drains the same way through the HR flows.
The Selenium and Playwright demo sets draw on the same balances.

## Side effects on the test tenant

Each run adds leave records. FLAKY 01/02, HEALABLE 01/03 and NORMALFAIL 05 add
Approved leave for sales1. The HR flows add HR leave that ends up Approved,
Rejected or, if a test fails partway, left Pending. FLAKY 05 sometimes records a
leave when its random "invalid" date range turns out to be valid. Leave dates
are random, so records rarely collide, but sales1's and HR's balances go down
over many runs.
