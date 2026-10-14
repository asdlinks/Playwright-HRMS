# MyWe HRMS — Playwright Automation Framework

End-to-end smoke and regression coverage for the MyWe HRMS web application
(`https://test.mywehr.com`), built as a hybrid **Page Object + Data Driven**
framework on Playwright Test and TypeScript.

This is a port of the Selenium/TestNG framework (`Selenium HRMS`). The tests,
page objects, locators, waits, fallbacks, datasets and assertions follow the
same logic one for one. Only the tooling changed. See
[Mapping from the Selenium framework](#mapping-from-the-selenium-framework).

---

## Quick start

```bash
npm install                          # once
npm test                             # full suite (Chrome, headed)
npm run test:ci                      # headless, 2 retries
npm run test:rbac                    # only the access-control tests
npm run test:intermodule             # only the cross-module reflection tests
npm run test:critical-path           # only tests tagged @critical
npm run test:auth                    # one module: auth | navigation | configuration | employee | leave
npm run report                       # open the last HTML report
```

Override any config key with an environment variable. The variable is the
key in upper case with dots replaced by underscores:

```bash
npx cross-env BROWSER=firefox HEADLESS=true npm test
```

Or filter by tag or title directly:

```bash
npx playwright test --project=hrms --grep @leave
npx playwright test --project=hrms -g "TC_AUTH_02"
```

**Requirements:** Node 18+, and Google Chrome installed (the default
`browser=chrome` drives the installed Chrome, as the Selenium suite did). For
`chromium`, `firefox` or `webkit`, run `npx playwright install <browser>` once.

---

## ⚠️ One constraint you must know before running

**The application enforces a single active session per user account.**

Signing in as `mycompany@yopmail.com` anywhere invalidates every other session
for that account, including a suite that is mid-run. In practice:

- **Do not browse the app as Admin or HR while the suite is running.** Your
  browser tab will silently log the suite out, and tests will fail several
  steps later on a login page with errors that look nothing like the cause.
- **Never run two tests as the same persona concurrently.** This is the one
  real limit on parallelism here. The framework is otherwise parallel-ready
  (each worker has its own page and no shared state), but the *accounts* are
  the bottleneck, not the code. `playwright.config.ts` therefore ships with
  `workers: 1`. Raise it only once each worker has its own login.
- **Give CI its own accounts.** To parallelise properly, create one Admin and
  one HR account per worker and select them by `TEST_WORKER_INDEX` in
  `Persona`.

---

## Test coverage

**25 test functions across 7 spec files, 29 executions per run.**

### Hard and soft assertions

- **Hard** (`assertTrue` / `assertEquals` from `src/base/Assert`) for checks
  everything after them depends on: sign-in, a page/dialog/drawer being loaded,
  a record actually being saved, and every security boundary. The test stops
  there.
- **Soft** (`base.softly()`) for independent observations, so one run lists
  every one that is wrong. Each soft check takes a screenshot at the moment it
  ran and logs it in the HTML report. Soft checks are async; `await` each one.
- Every test that uses soft checks ends with `base.assertAllSoft()`. A safety
  net in the `base` fixture fails any test that recorded soft failures but
  forgot to call it.

| ID | Area | What it proves |
|----|------|----------------|
| `TC_AUTH_01` | Auth | Login page renders all credential fields, branding, masked password |
| `TC_AUTH_02` | Auth | Every invalid credential combination is rejected generically *(5 datasets, one test)* |
| `TC_AUTH_03` | Auth | Each persona signs in, owns its session, gets account self-service *(×2 personas)* |
| `TC_AUTH_04` | Auth | Protected routes are unreachable before sign-in and after logout |
| `TC_NAV_01` | Navigation | Header is complete and every permitted module loads cleanly *(×2 personas; 18 / 14 modules)* |
| `TC_NAV_02` | Navigation | Employees and Time & Leave rails link to every sub-module |
| `TC_RBAC_01` | **RBAC** | HR is denied every restricted route and org-configuration panel; permitted panels open |
| `TC_RBAC_02` | **RBAC** | Admin reaches every HR-denied route, sees all 12 panels, governs roles with live counts |
| `TC_RBAC_03` | **RBAC** | Both personas retain people-ops rights and employee row actions *(×2 personas)* |
| `TC_CFG_01` | Configuration | Organization Structure reference data + Company Profile locale / financial year |
| `TC_CFG_02` | Configuration | Shifts, work modes, attendance policies, Daily Check-In and Holiday Calendar |
| `TC_CFG_03` | Configuration | Reports workspace aggregates figures consistent with the Directory |
| `TC_EMP_01` | Employee | Directory renders KPIs, filters, controls; search and department filter narrow results |
| `TC_EMP_02` | Employee | **E2E** register an employee; directory lists it and headcount rises |
| `TC_EMP_03` | Employee | Registration form rejects every invalid dataset and saves nothing *(5 datasets, one test)* |
| `TC_EMP_04` | Employee | **E2E** department create → delete, with count tracking and the empty-only rule |
| `TC_LEAVE_01` | Leave | Entitlement cards and grid render; status tab counts reconcile *(×2 personas)* |
| `TC_LEAVE_02` | Leave | **E2E cross-persona** Admin records leave → saved as Approved → HR sees it in a separate session |
| `TC_LEAVE_03` | Leave | Leave without mandatory dates is rejected; nothing is recorded |
| `TC_LEAVE_04` | Leave | Entitlement cards are scoped to the signed-in user, not the tenant |
| `TC_XMOD_01` | **Inter-module** | New department → Directory KPI + Directory filter options |
| `TC_XMOD_02` | **Inter-module** | New employee → Directory + Dashboard + their Department all agree |
| `TC_XMOD_03` | **Inter-module** | New holiday → Calendar + Dashboard next-holiday widget |
| `TC_XMOD_04` | **Inter-module** | Dashboard pending approvals and workforce agree with Leave, Directory and Department |
| `TC_XMOD_05` | **Inter-module** | Published documents and the upload right reach both personas |

The deliberately broken flaky / healable / unhealable demo tests live in
`tests/demo/` and are catalogued in [FLAKY_HEALING_DEMO.md](FLAKY_HEALING_DEMO.md).

---

## The two personas

| | Organization Administrator | HR Administrator |
|---|---|---|
| Company code | `myc001` | `myc001` |
| Email | `mycompany@yopmail.com` | `hr@yopmail.com` |
| Display name | Surag | hr |
| Settings panels | all 12 | 4 |

### Verified access matrix

Encoded in `AppModule` and `SettingsPanel`, so the navigation and RBAC tests
are generated from it. Adding a module to the product means adding one line,
not writing two more tests.

**Routes denied to HR** (silently redirect to `/dashboard`):
`/work-modes`, `/attendance/policies`, `/attendance/kiosk-devices`,
`/attendance/face-enrollment`

**Settings panels hidden from HR:**
Company Profile, General Config, Attendance Rules, Work Modes, Menu Management,
Roles & Permissions, Salary Grades, Audit & Compliance

**Shared by both:** Dashboard, Employees, Department, Organization Structure,
My Team, Daily Check-In, Leaves, Leave Cancellation, Holiday Calendar, Shifts,
Company Documents, Reports, Payroll, and 4 settings panels.

---

## Project layout

```
playwright.config.ts               browsers, projects, reporters, timeouts
resources/
├── config.properties              committed defaults (env vars override)
└── testdata/*.json                datasets
src/
├── config/ConfigManager           env var → config.properties
├── driver/DriverManager           the active Page for this worker
├── driver/RawDriver               no-wait findElement, for the demo specs only
├── enums/
│   ├── AppModule                  route map + landing markers + access matrix
│   ├── SettingsPanel              rail labels, panel headings, visibility
│   └── Persona, LeaveType, LeaveStatus, WaitStrategy
├── data/
│   ├── TestDataFactory            unique runtime data ("AT" prefixed)
│   ├── model/                     EmployeeData, LeaveRequestData, Credential
│   └── reader/JsonDataReader      cached dataset loading
├── pages/                         page objects, one per screen
│   ├── base/BasePage              navigation, landing checks, KPI reader
│   ├── components/                HeaderComponent, SideNavComponent
│   └── auth|dashboard|employees|timeleave|documents|settings/
├── base/
│   ├── BaseTest                   the `test` fixture: page binding, helpers, outcome screenshots
│   ├── Assert, ReportingSoftAssert
│   └── RetryPolicy                retry infrastructure failures only
├── reporting/                     ReportManager, globalSetup banner
└── utils/
    ├── WaitUtils                  SPA-aware waits (bootstrap splash, skeletons)
    ├── ElementUtils               interaction + React-safe input handling
    ├── MuiUtils                   Material-UI component strategies
    └── DateUtils, ScreenshotUtils, Log
tests/
├── 01-auth … 07-intermodule/      the suite, in run order
└── demo/                          flaky / healable / broken demo set
```

---

## Dataset management

Two kinds of dataset, split by who should be able to change them.

**File-based.** A tester extends these without touching code:

| File | Feeds |
|---|---|
| `credentials.json` | persona logins |
| `invalid-logins.json` | 5 negative auth scenarios + expected message |
| `employee-validation.json` | 5 invalid employee payloads + expected message |
| `reference-data.json` | what the seeded tenant already contains |

**Generated at runtime.** `TestDataFactory` builds these. The HRMS rejects
duplicate employee emails and IDs, so a committed fixture passes once and then
fails forever against the same tenant. Every created record carries a
timestamp and a per-worker counter, and is prefixed `AT` so automation data is
identifiable.

**Model-based.** The navigation and RBAC tests are generated from
`AppModule` and `SettingsPanel`, so coverage cannot drift from the route map
the page objects navigate by.

---

## Notes on this application (earned the hard way)

Worth reading before extending the framework. Each of these caused a real
failure during development of the Selenium suite, and the Playwright port
keeps every workaround.

**No `data-testid`, and MUI ids are generated per render** (`id="_r_f_"`).
Locators use, in order of preference: the `name` attribute where the app sets
one (login form, Register Employee dialog), the visible label resolved through
MUI's `FormControl` wrapper, then ARIA roles. The original XPaths are kept
as-is. `MuiUtils.xpath()` marks them with Playwright's `xpath=` prefix.

**MUI Selects open on `mousedown`, not `click`.** A scripted
`element.click()` does *nothing*: no error, no menu. `ElementUtils.clickViaScript`
therefore replays the whole pointer sequence
(`pointerdown → mousedown → pointerup → mouseup → click`).

**Native clicks are intermittently absorbed** while a view re-renders around
them. Playwright's auto-waiting does not help here, because the click
*succeeds* and React simply never sees it. Every interaction with an
observable outcome (dialog opens, menu closes, grid filters, panel switches)
tries the native click first, then retries with the scripted sequence. When
you add an interaction, give it a post-condition rather than assuming the
click landed.

**Icon-only controls carry their meaning in `aria-label`/`title`.** Use
`MuiUtils.controlByAccessibleName`, not `buttonByText`.

**The Employee Directory defaults to an org-chart view that renders one
department at a time.** An employee created into Sales is off-screen even
though the record saved. The KPI strip is the honest check that a record
exists. To *see* the person, switch department group.

**KPI cards render a placeholder before their fetch resolves.** Baselines go
through `readSettledKpiCard`.

**Some labels are lowercase in the DOM and uppercased by CSS.** The leave
balance card holds `casual`. Match the DOM, not the screenshot.

**There are no toasts anywhere.** Every mutation is verified against the
resulting list or counter.

**The app boots behind a `Loading Mywe HRMS…` splash**, and routing is
client-side, so the URL updates before the view has data. Page objects assert a
content *landing marker*, never just the URL.

**Rail and panel labels differ.** "Locations / Offices" opens "Locations
Management"; "Account Security" opens "Password Management".

**"Audit & Compliance" is a link, not a panel.** It routes to `/reports/audit`.

---

## Design decisions

**A fresh browser context and login per test.** Playwright gives every test
its own context, the equivalent of the Selenium suite's fresh browser. It
costs a few seconds each and buys order-independence, no cascading failures,
and parallel-readiness.

**The page lives in `DriverManager`, not in constructor arguments.** It is the
same design as the Selenium framework's ThreadLocal driver, and page objects
keep their argument-free constructors (`new LeavesPage()`). It is safe because
each Playwright worker is its own process running one test at a time.

**Retries are conservative.** One retry by default, and an `AssertionError` is
never retried. Only infrastructure-shaped failures are retried: a timeout, an
element that never appeared, a page or browser that died, a Playwright API
error. Playwright retries every failure, so `RetryPolicy` records how each
attempt failed. A retry of a non-retryable failure fails at once with the
original reason, so the test still ends red. The demo project has
`retries: 0`.

**Page objects never assert.** Assertions live in tests, so the same page
object serves positive and negative cases.

**Tests clean up after themselves.** Departments and holidays are removed in a
`finally` block. Cleanup helpers never throw, so a cleanup problem cannot mask
the real failure a test already reported. Employees are left in place
deliberately: the app offers deactivation rather than deletion.

### Test data the suite creates

Everything it creates is prefixed **`AT`**: `AT Dept <stamp>`,
`AT Holiday <stamp>`, `AT Tester <n>`, employee IDs `AT_<stamp>_<n>`, emails
`at.auto.<stamp>@yopmail.com`.

| Record | Cleaned up? |
|---|---|
| Departments | Yes, in `finally` |
| Holidays | Yes, in `finally`, but the app's holiday delete has been seen doing nothing; `deleteIfPresent` verifies and warns |
| Employees | **No.** Deactivation only; remove manually if the tenant gets noisy |
| Leave requests | **No.** `TC_LEAVE_02` leaves one approved request per run |

**The tenant's plan caps headcount (currently 10).** Every run of `TC_EMP_02`
and `TC_XMOD_02` consumes a seat. Once the cap is reached both tests
**skip** with the app's message rather than fail. Delete a few `AT Tester`
employees to free seats and re-run.

---

## Reports

Every run writes:

- `test-output/reports/html/`: the Playwright HTML report (`npm run report`).
  Each test shows its description, its step / note / verified log as
  annotations, one numbered screenshot per soft check (with
  `screenshot.on.soft.pass=true`), and a final-state or point-of-failure
  screenshot. Screenshots are files beside the report, not embedded, so the
  report stays small.
- `test-output/reports/junit-results.xml`: for CI.
- `test-output/screenshots/`: a PNG for every failed test.
- `test-output/test-results/`: a Playwright trace for every failed test
  (`npx playwright show-trace <trace.zip>`), which replays each step.

Tags (`@smoke`, `@critical`, `@rbac`…) are the TestNG groups and show on each
test in the report.

---

## Suites

| npm script | Contents | Selenium equivalent |
|---|---|---|
| `test` / `test:smoke` / `test:regression` | everything except the demo set, in folder order auth → nav → RBAC → config → employee → leave → inter-module | `smoke.xml`, `regression.xml` |
| `test:critical-path` | `@critical` only, the build gate | `critical-path.xml` |
| `test:rbac` | `@rbac` | `-Prbac` |
| `test:intermodule` | `@intermodule` | `-Pintermodule` |
| `test:auth` … `test:leave` | one module folder | `-Pauth` … `-Pleave` |
| `test:flaky` / `test:healable` / `test:broken` / `test:demo` | the demo set, no retries | `-Pflaky` … `-Pdemo` |
| `test:ci` | headless, 2 retries | `-Pci` |
| `test:grid` | `remote-chrome` against a Playwright server | `-Pgrid` |

**Tags:** `@smoke`, `@critical`, `@auth`, `@navigation`, `@rbac`, `@security`,
`@configuration`, `@employee`, `@leave`, `@intermodule`, `@e2e`, `@negative`,
`@validation`, `@documents`, `@reports`, and `@demo` / `@flaky` / `@healable` /
`@unhealable` / `@normal-fail` on the demo set.

---

## Configuration

Every key in `resources/config.properties` can be overridden with an env var
(`BASE_URL`, `BROWSER`, `HEADLESS`, `RETRY_COUNT`…), so one committed file
serves local runs, CI and remote runs without being edited.

| Key | Default | Notes |
|---|---|---|
| `base.url` | `https://test.mywehr.com` | |
| `tenant.code` | `myc001` | |
| `browser` | `chrome` | `chrome`, `chromium`, `firefox`, `edge`, `webkit`, `remote-chrome`, `remote-firefox` |
| `headless` | `false` | |
| `explicit.wait` | `25` | seconds |
| `spa.settle.wait` | `20` | bootstrap splash timeout |
| `native.click.timeout.millis` | `5000` | how long a native click may wait before the scripted fallback |
| `test.timeout.minutes` | `15` | per test; the persona sweeps take several minutes |
| `retry.count` | `1` | |
| `grid.url` | `ws://localhost:3000/` | Playwright server (`npx playwright run-server --port 3000`) for `remote-*` |

---

## Extending it

**A new module:** add one line to `AppModule` with its route, landing marker
and permitted personas. The navigation and RBAC tests pick it up
automatically.

**A new settings panel:** add one line to `SettingsPanel` with its rail label,
its *panel heading* and its personas.

**A new negative case:** add an object to the relevant JSON file. No code.

**A new page:** extend `BasePage`, implement `landingMarker()` and `route()`,
and keep assertions out of it.

**A new test:** import `test` from `src/base/BaseTest` and take the `base`
fixture: `test('TC_X_01_…', { tag: ['@smoke'] }, async ({ base }) => { … })`.

---

## Mapping from the Selenium framework

| Selenium / TestNG | Playwright / TypeScript |
|---|---|
| `DriverFactory` + `ThreadLocal<WebDriver>` | `playwright.config.ts` + `DriverManager` holding the `Page` |
| `By` locators | selector strings; XPaths keep their text behind `xpath=` |
| `WebDriverWait` / `FluentWait` | `WaitUtils.fluently` (same polling semantics) and `locator.waitFor` |
| `JavascriptExecutor.executeScript` | `page.evaluate` / `locator.evaluate` |
| A `WebElement` returned from a script | `ElementUtils.locateByScript`, which tags the element and returns a `Locator` |
| `BaseTest` `@BeforeMethod` / `@AfterMethod` | the `base` and `retryGate` fixtures in `src/base/BaseTest.ts` |
| TestNG `Assert` / `SoftAssert` | `src/base/Assert.ts` / `ReportingSoftAssert` (same messages) |
| `@DataProvider` (`allPersonas`) | a `for (const persona of ALL_PERSONAS)` loop around `test()` |
| `groups` | `tag` |
| `SkipException` | `test.skip(true, reason)` |
| `RetryAnalyzer` + `RetryListener` | project `retries` + `RetryPolicy` |
| `TestListener` + Extent report | the `base` fixture's outcome handling + Playwright HTML report |
| Suite XMLs + Maven profiles | `hrms` / `demo` projects + npm scripts |
| `NoSuchElementException` from `findElement` | `NoSuchElementError` from `RawDriver.findElement` (demo specs) |
