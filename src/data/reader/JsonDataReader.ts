import * as fs from 'fs';
import * as path from 'path';
import { RESOURCES_DIR } from '../../config/ConfigManager';
import { FrameworkError } from '../../exceptions/errors';
import { Log } from '../../utils/Log';
import { Credential } from '../model/Credential';
import { EmployeeData } from '../model/EmployeeData';

/**
 * Loads datasets from resources/testdata.
 *
 * Files are read once and cached: the same dataset is asked for by several
 * tests, and re-parsing the same JSON over and over is pure waste.
 */
const TEST_DATA_ROOT = path.join(RESOURCES_DIR, 'testdata');
const CACHE = new Map<string, unknown>();

function parse(fileName: string): unknown {
    const file = path.join(TEST_DATA_ROOT, fileName);
    if (!fs.existsSync(file)) {
        throw new FrameworkError('Test data file not found: ' + file);
    }
    try {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (e) {
        throw new FrameworkError('Unable to parse test data file: ' + fileName, { cause: e });
    }
}

export const JsonDataReader = {

    /** Reads a JSON array file into a typed list. */
    readList<T>(fileName: string, map: (raw: any) => T): T[] {
        const cacheKey = fileName + '#list';
        if (!CACHE.has(cacheKey)) {
            const raw = parse(fileName);
            if (!Array.isArray(raw)) {
                throw new FrameworkError(`Test data file ${fileName} does not hold a JSON array`);
            }
            const values = raw.map(map);
            Log.info(`Loaded ${values.length} record(s) from ${fileName}`);
            CACHE.set(cacheKey, values);
        }
        return CACHE.get(cacheKey) as T[];
    },

    /** Reads a JSON object file keyed by scenario name. */
    readMap<T>(fileName: string, map: (raw: any) => T): Map<string, T> {
        const cacheKey = fileName + '#map';
        if (!CACHE.has(cacheKey)) {
            const raw = parse(fileName) as Record<string, unknown>;
            CACHE.set(cacheKey, new Map(Object.entries(raw).map(([key, value]) => [key, map(value)])));
        }
        return CACHE.get(cacheKey) as Map<string, T>;
    },

    readRaw(fileName: string): Record<string, unknown> {
        return parse(fileName) as Record<string, unknown>;
    },

    // ------------------------------------------------------ named datasets

    credentials(): Map<string, Credential> {
        return JsonDataReader.readMap('credentials.json', Credential.from);
    },

    credentialFor(personaKey: string): Credential {
        const credential = JsonDataReader.credentials().get(personaKey);
        if (!credential) {
            throw new FrameworkError('No credential entry for persona key: ' + personaKey);
        }
        return credential;
    },

    invalidLoginScenarios(): Credential[] {
        return JsonDataReader.readList('invalid-logins.json', Credential.from);
    },

    employeeValidationScenarios(): EmployeeData[] {
        return JsonDataReader.readList('employee-validation.json', EmployeeData.from);
    },
};
