import { AssertionError } from '../exceptions/errors';

/**
 * Hard assertions, worded the way TestNG's Assert reported them.
 *
 * Plain functions rather than expect(): the suite's rule is that a hard
 * assertion stops the test with a message written for whoever triages it,
 * and these throw an AssertionError the retry policy recognises as "the
 * product misbehaved", which is never re-run.
 */
function format(actual: unknown, expected: unknown, message?: string): string {
    return `${message ? message + ' ' : ''}expected [${expected}] but found [${actual}]`;
}

function equal(actual: unknown, expected: unknown): boolean {
    if (Array.isArray(actual) && Array.isArray(expected)) {
        return actual.length === expected.length && actual.every((value, i) => equal(value, expected[i]));
    }
    return actual === expected;
}

export const Assert = {

    assertTrue(condition: boolean, message?: string): void {
        if (!condition) {
            throw new AssertionError(format(condition, true, message));
        }
    },

    assertFalse(condition: boolean, message?: string): void {
        if (condition) {
            throw new AssertionError(format(condition, false, message));
        }
    },

    assertEquals(actual: unknown, expected: unknown, message?: string): void {
        if (!equal(actual, expected)) {
            throw new AssertionError(format(actual, expected, message));
        }
    },

    assertNotEquals(actual: unknown, unexpected: unknown, message?: string): void {
        if (equal(actual, unexpected)) {
            throw new AssertionError(
                `${message ? message + ' ' : ''}did not expect [${unexpected}] but found [${actual}]`);
        }
    },

    fail(message: string): never {
        throw new AssertionError(message);
    },

    /** The failure message these assertions produce, without throwing. */
    describeFailure: format,

    equal,
};

export const { assertTrue, assertFalse, assertEquals, assertNotEquals, fail } = Assert;
