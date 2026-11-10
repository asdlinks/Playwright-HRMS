# MyWe HRMS — Page Object Model Reference Framework (Playwright + TypeScript)

A Playwright + TypeScript port of the Selenium 4 / TestNG reference framework
for the MyWe HRMS web app (`https://test.mywehr.com`). The **POM structure, the
page/component classes, their method names and the 12 test cases are the
same**. Only the engine underneath changed.

---

## Quick start

```bash
npm install
npx playwright install chromium     # once: download the browser

npm test                            # full suite, Chromium, headed (config default)
npm run test:ci                     # headless, 2 retries
npm run test:smoke                  # by tag: test:auth | test:rbac | test:employee | test:leave
npm run test:firefox                # or test:edge
npx playwright test --grep TC_EMP_02          # a single test
npx playwright test --ui                      # interactive runner
npm run report                      # open the HTML report
```

**Requirements:** Node 18+.

**Report:** `test-output/reports/index.html`. It holds the steps/notes/warnings
as annotations, a screenshot of every test, and a trace and video for failures.

> ⚠️ The app allows **one active session per account**. The suite runs one test
> at a time (`workers: 1`) for that reason. Don't browse the app as Admin or HR
> while it runs, because that silently logs the suite out.

---

## The POM rules this framework follows

| # | Rule | Where to see it |
|---|------|-----------------|
| 1 | **Locators are private to the page.** Tests never see a `Locator`, a selector or the `page` API. | Every class under `src/pages/` |
| 2 | **Methods express intent**, not mechanics: `deleteEmployee(name)`, `approveRequestFor(name)`. | `EmployeeDirectoryPage`, `LeavesPage` |
| 3 | **Actions return the next page object.** Staying on the page returns `this`; landing somewhere else returns that page or component. | `loginAs()` → `DashboardPage`, `openEditFor()` → `EditEmployeeDialog`, `header().logout()` → `LoginPage` |
| 4 | **Queries return plain values** (`boolean`, `number`, `string`). | `totalEmployees()`, `hasEmployeeNamed()` |
| 5 | **Pages never assert.** | No `expect` import anywhere in `src/` |
| 6 | **Opening a page returns it, typed.** | `await new EmployeeDirectoryPage(page).open()`, `loginAndOpen(Persona.ADMIN, new LeavesPage(page))` |
| 7 | **Shared behaviour lives in base classes.** | `src/pages/base/` |
| 8 | **Low-level mechanics live in utilities**, used by pages only. | `src/utils/` |
| 9 | **Test data lives outside the code.** | `tests/resources/testdata/`, `TestDataFactory` |

### A test reads like a user story

```ts
const directory = await loginAndOpen(Persona.ADMIN, new EmployeeDirectoryPage(page));

const wizard = await directory.openOnboardingWizard();
await wizard.fillBasicDetails(basic);
await wizard.next();
await wizard.fillContactDetails(contact);
await wizard.next();
const outcome = await wizard.create();

expect(await directory.hasEmployeeNamed(name)).toBe(true);
const edit = await directory.openEditFor(name);
await edit.openTab('Basic Details');
expect.soft(await edit.shows(basic.email)).toBe(true);
await edit.cancel();
await directory.deleteEmployee(name);
```

Playwright is async, so every call is awaited and each step sits on its own
line instead of the Java one-line chain (`wizard.fillBasicDetails(b).next()`).
Methods still return `this` / the next page, exactly as before.

---

## Project layout

```
src/
├── config/        ConfigManager            config.properties + env-var overrides (ms durations)
├── enums/         AppModule (routes + access matrix), Persona, SettingsPanel, LeaveType, LeaveStatus, WaitStrategy
├── exceptions/    FrameworkException, WaitTimeoutException
├── data/
│   ├── model/     Credential, OnboardingEmployee, LeaveRequestData
│   ├── reader/    JsonDataReader           cached JSON loading
│   └── TestDataFactory                     unique names for created records
├── pages/
│   ├── base/      BasePage, BaseComponent, BaseDialog, GenericModulePage
│   ├── components/ HeaderComponent, SideNavComponent
│   ├── auth/      LoginPage
│   ├── dashboard/ DashboardPage
│   ├── employees/ EmployeeDirectoryPage, DepartmentPage, EmployeeProfilePage,
│   │              EmployeeOnboardingWizard, EditEmployeeDialog
│   ├── timeleave/ LeavesPage, ApplyLeaveDrawer
│   └── settings/  SettingsPage
└── utils/         ElementUtils, WaitUtils, MuiUtils, NetworkRecorder, DateUtils, Log

tests/
├── base/          BaseTest.ts   fixtures (loginAs, loginAndOpen, openLoginPage) + step/verified/warn/note, assertAllSoft
├── dataproviders/ TestDataProviders
├── auth/ rbac/ employee/ leave/   *.spec.ts
└── resources/
    ├── config.properties
    └── testdata/  credentials, invalid-logins, employee-onboarding(-quick)

playwright.config.ts   browsers, retries, timeouts, reporter, screenshots/trace/video
```

Class hierarchy is unchanged:

```
BasePage (route, open, isLoaded)          BaseComponent (no route)
 ├── LoginPage                              ├── HeaderComponent
 ├── DashboardPage                          ├── SideNavComponent
 ├── EmployeeDirectoryPage                  ├── ApplyLeaveDrawer
 ├── EmployeeProfilePage                    └── BaseDialog (title, isOpen, cancel)
 ├── DepartmentPage                              ├── EditEmployeeDialog
 ├── LeavesPage                                  └── EmployeeOnboardingWizard
 ├── SettingsPage
 └── GenericModulePage
```

---

## Selenium → Playwright mapping

| Selenium framework | Playwright framework |
|---|---|
| `DriverFactory`, `DriverManager` (ThreadLocal driver) | Playwright's `page` fixture, passed to each page object's constructor |
| `private static final By X` | `private readonly x = this.page.locator(...)` |
| `findElement` (first match) | `locator.first()`, applied inside `ElementUtils` (Playwright locators are strict) |
| `WebDriverWait` / `FluentWait` | Playwright auto-waiting + `WaitUtils.poll()` for app-specific conditions |
| `TimeoutException` | `WaitTimeoutException` |
| JS-executor scripts returning a `WebElement` | `ElementUtils.locateByScript()`, which returns a normal `Locator` |
| `NetworkRecorder` (injected fetch/XHR wrappers) | `page.on('response')`, no page injection |
| `BaseTest` (`@BeforeMethod` / `@AfterMethod`) | `test.extend()` fixtures in `tests/base/BaseTest.ts`; a new browser context per test is the default |
| `Assert.assertTrue(...)` | `expect(value, message).toBe(true)` |
| `softly().assertTrue(...)` + `assertAllSoft()` | `expect.soft(...)` + `assertAllSoft()` |
| `@DataProvider` | a `for` loop that declares one test per row |
| TestNG groups / suite XMLs | tags (`{ tag: ['@smoke', '@auth'] }`) + `--grep` |
| `RetryAnalyzer`, `RetryListener` | `retries` in `playwright.config.ts` |
| ExtentReports + `ScreenshotUtils` + `TestListener` | the built-in HTML reporter, `screenshot`, `trace`, `video` |
| `throw new SkipException(...)` | `test.skip(true, reason)` |
| `-Dkey=value` overrides | environment variables (`BASE_URL=... npx playwright test`) |
| `pom.xml` profiles | `package.json` scripts |

**Behaviour kept on purpose:** the scripted full-pointer-sequence click
fallback, the React-safe value setter, the label → MuiFormControl XPath
locators, overlay-scoped fields, dismissing the check-in reminder, settled KPI
reads, and redacting passwords from logs. All of these deal with quirks of this
app, not of Selenium.

---

## The tests

| ID | Test |
|----|------|
| TC_AUTH_01 | Login page renders every field and masks the password |
| TC_AUTH_02 | Every invalid credential combination is rejected |
| TC_AUTH_03 | Each persona signs in and owns its session (one test per persona) |
| TC_AUTH_04 | Protected routes are unreachable signed-out and after logout |
| TC_RBAC_01 | HR is redirected away from every restricted route and settings panel |
| TC_RBAC_02 | Both personas keep their shared people-operations rights |
| TC_EMP_01 | Directory renders; search and filter narrow results |
| TC_EMP_02 | A department is created and deleted, with the count tracking both |
| TC_EMP_03 | Full 6-step onboarding, every stored value read back, then deleted |
| TC_EMP_04 | Quick onboarding (basic + contact only), verified, then deleted |
| TC_LEAVE_01 | Leave Management renders and its status counts reconcile (one test per persona) |
| TC_LEAVE_02 | A leave request without dates is rejected and nothing is saved |

**Known app defect.** The onboarding wizard rejects every 6-digit PIN code.
TC_EMP_03 records this as a `warning` annotation and continues without a PIN.

**Run order.** Spec files run in alphabetical folder order (auth, employee,
leave, rbac) rather than the TestNG suite order. Every test signs in on its own,
so the order does not affect results.

---

## Adding a page — checklist

1. Create `class XPage extends BasePage` in the right `src/pages/<module>/` folder.
2. Implement `route()` and `landingMarker()`.
3. Declare locators as `private readonly` fields built from `this.page`.
4. Write async intent-level methods. Return `this`, the next page, or a plain value.
5. Overlays get their own class extending `BaseComponent` / `BaseDialog`.
6. In the test: `const x = await loginAndOpen(Persona.ADMIN, new XPage(page));` and assert.

> If a component needs to return a page that itself extends `BasePage` (like
> `HeaderComponent.logout()` → `LoginPage`), import it lazily inside the method.
> A top-level import creates a circular class dependency in JavaScript.

---

## Configuration

`tests/resources/config.properties`. Override any key with an environment
variable: upper-case it and replace dots with underscores (`base.url` → `BASE_URL`).

| Key | Default | Notes |
|---|---|---|
| `base.url` | `https://test.mywehr.com` | |
| `tenant.code` | `myc001` | |
| `browser` | `chromium` | `chromium`, `chrome`, `edge`, `firefox`, `webkit` |
| `headless` | `false` | always headless when `CI` is set |
| `explicit.wait` | `25` | seconds: action and assertion timeout |
| `test.timeout` | `300` | seconds per test |
| `retry.count` | `1` | 2 on CI |
| `screenshot` / `trace` / `video` | `on` / `retain-on-failure` / `retain-on-failure` | |
