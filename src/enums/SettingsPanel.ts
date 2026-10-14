import { Persona } from './Persona';

const ALL = Persona.values();
const ADMIN_ONLY = [Persona.ADMIN];

/**
 * Settings is a single route (/settings) whose left rail is rendered from the
 * caller permissions, so panel visibility - not routing - is the RBAC surface
 * here. A persona who cannot manage company configuration simply never sees
 * the rail entry. Verified against tenant myc001:
 *
 *   ADMIN sees all 12 entries.
 *   HR    sees only 4: Locations / Offices, Holiday Config,
 *                      Payroll Settings, Account Security.
 *
 * TWO LABELS PER PANEL, DELIBERATELY
 * ----------------------------------
 * The rail label and the heading the panel renders are frequently different -
 * "Locations / Offices" opens "Locations Management", "General Config" opens
 * "Leave Allocations", "Account Security" opens "Password Management". Storing
 * only the rail label would make "did the panel open?" unverifiable, because
 * the rail label is on screen whether or not the click did anything. Asserting
 * on the content heading is what makes the check real.
 *
 * Audit & Compliance is not a panel at all: it is a link out to
 * /reports/audit. It is modelled here because it occupies a rail slot and
 * carries the same permission boundary, but it is flagged so the panel tests
 * do not expect an in-place heading from it.
 */
export class SettingsPanel {

    static readonly COMPANY_PROFILE = new SettingsPanel('Company Profile', 'Company Profile',
        'ORGANIZATION', ADMIN_ONLY);
    static readonly GENERAL_CONFIG = new SettingsPanel('General Config', 'Leave Allocations',
        'ORGANIZATION', ADMIN_ONLY);
    static readonly LOCATIONS_OFFICES = new SettingsPanel('Locations / Offices', 'Locations Management',
        'ORGANIZATION', ALL);

    static readonly HOLIDAY_CONFIG = new SettingsPanel('Holiday Config', 'Holiday Management',
        'ATTENDANCE', ALL);
    static readonly ATTENDANCE_RULES = new SettingsPanel('Attendance Rules', 'Attendance Rules',
        'ATTENDANCE', ADMIN_ONLY);
    static readonly WORK_MODES = new SettingsPanel('Work Modes', 'Work Modes',
        'ATTENDANCE', ADMIN_ONLY);

    static readonly PAYROLL_SETTINGS = new SettingsPanel('Payroll Settings', 'Payroll Settings',
        'PAYROLL', ALL);

    static readonly ACCOUNT_SECURITY = new SettingsPanel('Account Security', 'Password Management',
        'SECURITY', ALL);

    static readonly MENU_MANAGEMENT = new SettingsPanel('Menu Management', 'Menu Management',
        'ADVANCED', ADMIN_ONLY);
    static readonly ROLES_AND_PERMISSIONS = new SettingsPanel('Roles & Permissions', 'Roles & Permissions',
        'ADVANCED', ADMIN_ONLY);
    static readonly SALARY_GRADES = new SettingsPanel('Salary Grades', 'Salary Grades',
        'ADVANCED', ADMIN_ONLY);

    /** Navigates to /reports/audit rather than opening an in-place panel. */
    static readonly AUDIT_AND_COMPLIANCE = new SettingsPanel('Audit & Compliance', null,
        'ADVANCED', ADMIN_ONLY, '/reports/audit');

    private constructor(
        private readonly labelValue: string,
        private readonly contentHeadingValue: string | null,
        private readonly groupValue: string,
        private readonly allowedPersonas: readonly Persona[],
        private readonly navigatesToValue: string | null = null) {
    }

    /** Every panel, in rail order. */
    static values(): SettingsPanel[] {
        return [
            SettingsPanel.COMPANY_PROFILE, SettingsPanel.GENERAL_CONFIG, SettingsPanel.LOCATIONS_OFFICES,
            SettingsPanel.HOLIDAY_CONFIG, SettingsPanel.ATTENDANCE_RULES, SettingsPanel.WORK_MODES,
            SettingsPanel.PAYROLL_SETTINGS, SettingsPanel.ACCOUNT_SECURITY,
            SettingsPanel.MENU_MANAGEMENT, SettingsPanel.ROLES_AND_PERMISSIONS, SettingsPanel.SALARY_GRADES,
            SettingsPanel.AUDIT_AND_COMPLIANCE,
        ];
    }

    /** Exact rail label as rendered in the left column. */
    label(): string {
        return this.labelValue;
    }

    /**
     * Heading the opened panel renders on the right. Null for entries that
     * navigate away instead of opening a panel.
     */
    contentHeading(): string | null {
        return this.contentHeadingValue;
    }

    /** Section header the entry sits under (ORGANIZATION, ATTENDANCE, ...). */
    group(): string {
        return this.groupValue;
    }

    /** True when activating this entry routes away from /settings. */
    isNavigationLink(): boolean {
        return this.navigatesToValue !== null;
    }

    /** Route this entry navigates to, or null when it opens a panel in place. */
    navigatesTo(): string | null {
        return this.navigatesToValue;
    }

    isVisibleTo(persona: Persona): boolean {
        return this.allowedPersonas.includes(persona);
    }

    static visibleTo(persona: Persona): SettingsPanel[] {
        return SettingsPanel.values().filter(panel => panel.isVisibleTo(persona));
    }

    static hiddenFrom(persona: Persona): SettingsPanel[] {
        return SettingsPanel.values().filter(panel => !panel.isVisibleTo(persona));
    }

    /** Entries that open a panel in place - the ones a panel test can assert on. */
    static inPlacePanelsVisibleTo(persona: Persona): SettingsPanel[] {
        return SettingsPanel.visibleTo(persona).filter(panel => !panel.isNavigationLink());
    }

    toString(): string {
        return this.labelValue;
    }
}
