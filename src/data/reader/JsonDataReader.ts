import * as fs from 'fs';
import * as path from 'path';
import { ConfigManager } from '../../config/ConfigManager';
import { FrameworkException } from '../../exceptions/FrameworkException';
import { Log } from '../../utils/Log';
import { Credential } from '../model/Credential';
import { OnboardingEmployee, OnboardingEmployeeData } from '../model/OnboardingEmployee';

/**
 * Loads datasets from tests/resources/testdata.
 *
 * Files are read once and cached: the same fixture is used by several tests,
 * and re-parsing it each time is pure waste.
 */
export class JsonDataReader {
  private static readonly cache = new Map<string, unknown>();

  private constructor() {}

  /** Reads and caches a JSON file from the testdata folder. */
  static read<T>(fileName: string): T {
    if (!JsonDataReader.cache.has(fileName)) {
      const file = path.join(ConfigManager.resourcesDir(), 'testdata', fileName);
      if (!fs.existsSync(file)) {
        throw new FrameworkException(`Test data file not found: ${file}`);
      }
      try {
        JsonDataReader.cache.set(fileName, JSON.parse(fs.readFileSync(file, 'utf-8')));
      } catch (e) {
        throw new FrameworkException(`Unable to parse test data file: ${fileName}`, { cause: e });
      }
    }
    return JsonDataReader.cache.get(fileName) as T;
  }

  /** Reads a JSON array file. */
  static readList<T>(fileName: string): T[] {
    const values = JsonDataReader.read<T[]>(fileName);
    Log.info(`Loaded ${values.length} record(s) from ${fileName}`);
    return values;
  }

  /** Reads a JSON object file keyed by scenario name. */
  static readMap<T>(fileName: string): Record<string, T> {
    return JsonDataReader.read<Record<string, T>>(fileName);
  }

  // ------------------------------------------------------ named datasets

  static credentials(): Record<string, Credential> {
    return JsonDataReader.readMap<Credential>('credentials.json');
  }

  static credentialFor(personaKey: string): Credential {
    const credential = JsonDataReader.credentials()[personaKey];
    if (!credential) {
      throw new FrameworkException(`No credential entry for persona key: ${personaKey}`);
    }
    return credential;
  }

  static invalidLoginScenarios(): Credential[] {
    return JsonDataReader.readList<Credential>('invalid-logins.json');
  }

  /** The fixed, fully detailed employee used by the onboarding test. */
  static onboardingEmployee(): OnboardingEmployee {
    return OnboardingEmployee.fromJson(JsonDataReader.read<OnboardingEmployeeData>('employee-onboarding.json'));
  }

  /** The fixed employee with only basic and contact details, for the quick onboarding test. */
  static quickOnboardingEmployee(): OnboardingEmployee {
    return OnboardingEmployee.fromJson(JsonDataReader.read<OnboardingEmployeeData>('employee-onboarding-quick.json'));
  }
}
