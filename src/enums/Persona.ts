import { ConfigManager } from '../config/ConfigManager';

/**
 * The application's two test personas.
 *
 * Credentials are read from credentials.json (through JsonDataReader) rather
 * than hardcoded here. The values committed there are the test-environment
 * defaults.
 *
 * Modelled as a class with fixed instances because a TypeScript enum cannot
 * carry data the way a Java enum does.
 */
export class Persona {
  /** Organization Administrator - the tenant's full-rights "System" role. */
  static readonly ADMIN = new Persona('ADMIN', 'admin', 'Organization Administrator', 'Surag');

  /** HR Administrator - people-operations rights, no org configuration. */
  static readonly HR = new Persona('HR', 'hr', 'HR Administrator', 'hr');

  private constructor(
    readonly name: string,
    /** Key of this persona's entry in credentials.json. */
    readonly key: string,
    /** Role label exactly as rendered on Settings -> Roles & Permissions. */
    readonly roleName: string,
    /** Name rendered by the dashboard greeting: "Welcome, {displayName}". */
    readonly displayName: string,
  ) {}

  static values(): Persona[] {
    return [Persona.ADMIN, Persona.HR];
  }

  get tenantCode(): string {
    return ConfigManager.tenantCode();
  }

  toString(): string {
    return `${this.name}(${this.displayName})`;
  }
}
