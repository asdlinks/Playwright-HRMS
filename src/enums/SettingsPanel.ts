import { Persona } from './Persona';

const EVERYONE = Persona.values();
const ADMIN_ONLY = [Persona.ADMIN];

/**
 * Settings is a single route (/settings) whose left rail is rendered from the
 * caller's permissions, so panel visibility - not routing - is the RBAC
 * surface here. Verified against tenant myc001:
 *
 *   ADMIN sees all 12 entries.
 *   HR    sees only 4: Locations / Offices, Holiday Config,
 *                      Payroll Settings, Account Security.
 *
 * TWO LABELS PER PANEL, DELIBERATELY
 * ----------------------------------
 * The rail label and the heading the panel renders are frequently different -
 * "Locations / Offices" opens "Locations Management", "General Config" opens
 * "Leave Allocations", "Account Security" opens "Password Management". The
 * rail label is on screen whether or not the click did anything, so asserting
 * on the content heading is what makes "did the panel open?" a real check.
 *
 * Audit & Compliance is not a panel at all: it links out to /reports/audit.
 * It occupies a rail slot and carries the same permission boundary, so it is
 * modelled here but flagged as a navigation link.
 */
export class SettingsPanel {
  static readonly COMPANY_PROFILE = new SettingsPanel('Company Profile', 'Company Profile', 'ORGANIZATION', ADMIN_ONLY);
  static readonly GENERAL_CONFIG = new SettingsPanel('General Config', 'Leave Allocations', 'ORGANIZATION', ADMIN_ONLY);
  static readonly LOCATIONS_OFFICES = new SettingsPanel('Locations / Offices', 'Locations Management', 'ORGANIZATION', EVERYONE);

  static readonly HOLIDAY_CONFIG = new SettingsPanel('Holiday Config', 'Holiday Management', 'ATTENDANCE', EVERYONE);
  static readonly ATTENDANCE_RULES = new SettingsPanel('Attendance Rules', 'Attendance Rules', 'ATTENDANCE', ADMIN_ONLY);
  static readonly WORK_MODES = new SettingsPanel('Work Modes', 'Work Modes', 'ATTENDANCE', ADMIN_ONLY);

  static readonly PAYROLL_SETTINGS = new SettingsPanel('Payroll Settings', 'Payroll Settings', 'PAYROLL', EVERYONE);

  static readonly ACCOUNT_SECURITY = new SettingsPanel('Account Security', 'Password Management', 'SECURITY', EVERYONE);

  static readonly MENU_MANAGEMENT = new SettingsPanel('Menu Management', 'Menu Management', 'ADVANCED', ADMIN_ONLY);
  static readonly ROLES_AND_PERMISSIONS = new SettingsPanel('Roles & Permissions', 'Roles & Permissions', 'ADVANCED', ADMIN_ONLY);
  static readonly SALARY_GRADES = new SettingsPanel('Salary Grades', 'Salary Grades', 'ADVANCED', ADMIN_ONLY);

  /** Navigates to /reports/audit rather than opening an in-place panel. */
  static readonly AUDIT_AND_COMPLIANCE = new SettingsPanel('Audit & Compliance', null, 'ADVANCED', ADMIN_ONLY, '/reports/audit');

  private constructor(
    /** Exact rail label as rendered in the left column. */
    readonly label: string,
    /** Heading the opened panel renders on the right; null for navigation links. */
    readonly contentHeading: string | null,
    /** Section header the entry sits under (ORGANIZATION, ATTENDANCE, ...). */
    readonly group: string,
    private readonly allowedPersonas: readonly Persona[],
    /** Route this entry navigates to, or null when it opens a panel in place. */
    readonly navigatesTo: string | null = null,
  ) {}

  static values(): SettingsPanel[] {
    return Object.values(SettingsPanel).filter((value): value is SettingsPanel => value instanceof SettingsPanel);
  }

  /** True when activating this entry routes away from /settings. */
  get isNavigationLink(): boolean {
    return this.navigatesTo !== null;
  }

  isVisibleTo(persona: Persona): boolean {
    return this.allowedPersonas.includes(persona);
  }

  static visibleTo(persona: Persona): SettingsPanel[] {
    return SettingsPanel.values().filter((p) => p.isVisibleTo(persona));
  }

  static hiddenFrom(persona: Persona): SettingsPanel[] {
    return SettingsPanel.values().filter((p) => !p.isVisibleTo(persona));
  }

  /** Entries that open a panel in place - the ones a panel test can assert on. */
  static inPlacePanelsVisibleTo(persona: Persona): SettingsPanel[] {
    return SettingsPanel.visibleTo(persona).filter((p) => !p.isNavigationLink);
  }

  toString(): string {
    return this.label;
  }
}
