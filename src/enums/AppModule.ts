import { Persona } from './Persona';

const EVERYONE = Persona.values();
const ADMIN_ONLY = [Persona.ADMIN];

/**
 * The application route map, with the on-screen landing marker for each page
 * and the personas allowed to reach it.
 *
 * This is the single place the suite encodes "what exists and who may see
 * it". The RBAC tests are generated from it, so adding a module to the
 * product means adding one line here - not writing two more tests.
 *
 * ACCESS MATRIX (verified against the test tenant myc001):
 *
 *   Route                          ADMIN   HR
 *   /dashboard                      yes    yes
 *   /employees                      yes    yes
 *   /department                     yes    yes
 *   /organization                   yes    yes
 *   /my-team                        yes    yes
 *   /attendance                     yes    yes
 *   /leaves                         yes    yes
 *   /cancellation                   yes    yes
 *   /holidays                       yes    yes
 *   /shifts                         yes    yes
 *   /company-documents              yes    yes
 *   /settings                       yes    yes (fewer panels)
 *   /reports                        yes    yes
 *   /payroll                        yes    yes
 *   /work-modes                     yes    NO  -> redirected to /dashboard
 *   /attendance/policies            yes    NO  -> redirected to /dashboard
 *   /attendance/kiosk-devices       yes    NO  -> redirected to /dashboard
 *   /attendance/face-enrollment     yes    NO  -> redirected to /dashboard
 */
export class AppModule {
  // ------------------------------------------------ shared by both personas
  static readonly DASHBOARD = new AppModule('DASHBOARD', '/dashboard', 'Organization-wide analytics', EVERYONE);
  static readonly EMPLOYEE_DIRECTORY = new AppModule('EMPLOYEE_DIRECTORY', '/employees', 'Employee Directory', EVERYONE);
  static readonly DEPARTMENT = new AppModule('DEPARTMENT', '/department', 'Department Management', EVERYONE);
  static readonly ORGANIZATION_STRUCTURE = new AppModule('ORGANIZATION_STRUCTURE', '/organization', 'Organization Structure', EVERYONE);
  static readonly MY_TEAM = new AppModule('MY_TEAM', '/my-team', 'My Team', EVERYONE);
  static readonly DAILY_CHECK_IN = new AppModule('DAILY_CHECK_IN', '/attendance', 'Daily Check-In', EVERYONE);
  static readonly LEAVES = new AppModule('LEAVES', '/leaves', 'Leave Management', EVERYONE);
  static readonly LEAVE_CANCELLATION = new AppModule('LEAVE_CANCELLATION', '/cancellation', 'Leave Cancellation', EVERYONE);
  static readonly HOLIDAY_CALENDAR = new AppModule('HOLIDAY_CALENDAR', '/holidays', 'Holiday Calendar', EVERYONE);
  static readonly SHIFTS = new AppModule('SHIFTS', '/shifts', 'Shift Management', EVERYONE);
  static readonly COMPANY_DOCUMENTS = new AppModule('COMPANY_DOCUMENTS', '/company-documents', 'Company Documents', EVERYONE);
  static readonly SETTINGS = new AppModule('SETTINGS', '/settings', 'Settings', EVERYONE);
  static readonly REPORTS = new AppModule('REPORTS', '/reports', 'Executive Dashboard', EVERYONE);
  static readonly PAYROLL = new AppModule('PAYROLL', '/payroll', 'Payroll', EVERYONE);

  // ----------------------------------------------------- administrator only
  static readonly WORK_MODES = new AppModule('WORK_MODES', '/work-modes', 'Work Modes', ADMIN_ONLY);
  static readonly ATTENDANCE_POLICIES = new AppModule('ATTENDANCE_POLICIES', '/attendance/policies', 'Attendance Policies', ADMIN_ONLY);
  static readonly KIOSK_DEVICES = new AppModule('KIOSK_DEVICES', '/attendance/kiosk-devices', 'Kiosk Devices', ADMIN_ONLY);
  static readonly FACE_ENROLLMENT = new AppModule('FACE_ENROLLMENT', '/attendance/face-enrollment', 'Face Enrollment', ADMIN_ONLY);

  /** Where an unauthorised persona lands when a route guard rejects them. */
  static readonly ACCESS_DENIED_FALLBACK_ROUTE = '/dashboard';

  private constructor(
    readonly name: string,
    readonly route: string,
    /**
     * Text that proves the page actually rendered - a heading or subtitle only
     * this page shows. Asserting on it is what makes these "did the page load
     * properly" checks rather than "did the URL change" checks.
     */
    readonly landingMarker: string,
    private readonly allowedPersonas: readonly Persona[],
  ) {}

  /** Every module, in declaration order. */
  static values(): AppModule[] {
    return Object.values(AppModule).filter((value): value is AppModule => value instanceof AppModule);
  }

  isAccessibleBy(persona: Persona): boolean {
    return this.allowedPersonas.includes(persona);
  }

  static accessibleBy(persona: Persona): AppModule[] {
    return AppModule.values().filter((m) => m.isAccessibleBy(persona));
  }

  static deniedTo(persona: Persona): AppModule[] {
    return AppModule.values().filter((m) => !m.isAccessibleBy(persona));
  }

  toString(): string {
    return `${this.name}[${this.route}]`;
  }
}
