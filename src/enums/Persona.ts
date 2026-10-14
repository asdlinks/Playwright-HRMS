import { ConfigManager } from '../config/ConfigManager';

/**
 * The application's two test personas.
 *
 * Credentials live in credentials.json (the committed test-environment
 * defaults) and are looked up by key, so a pipeline can swap that file
 * without touching source.
 */
export class Persona {

    /** Organization Administrator - the tenant's full-rights "System" role. */
    static readonly ADMIN = new Persona('ADMIN', 'admin', 'Organization Administrator', 'Surag');

    /** HR Administrator - people-operations rights, no org configuration. */
    static readonly HR = new Persona('HR', 'hr', 'HR Administrator', 'hr');

    private constructor(
        readonly name: string,
        private readonly keyValue: string,
        private readonly roleNameValue: string,
        private readonly displayNameValue: string) {
    }

    static values(): Persona[] {
        return [Persona.ADMIN, Persona.HR];
    }

    key(): string {
        return this.keyValue;
    }

    /** Role label exactly as rendered on Settings -> Roles & Permissions. */
    roleName(): string {
        return this.roleNameValue;
    }

    /** Name rendered by the dashboard greeting: "Welcome, {displayName}". */
    displayName(): string {
        return this.displayNameValue;
    }

    tenantCode(): string {
        return ConfigManager.tenantCode();
    }

    toString(): string {
        return `${this.name}(${this.displayNameValue})`;
    }
}
