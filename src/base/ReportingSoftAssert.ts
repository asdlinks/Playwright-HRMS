import { ConfigManager } from '../config/ConfigManager';
import { AssertionError } from '../exceptions/errors';
import { ReportManager } from '../reporting/ReportManager';
import { Log } from '../utils/Log';
import { Assert } from './Assert';

/**
 * A soft assertion collector that reports each failure the moment it happens.
 *
 * A soft check that stays silent until assertAll() would leave the report
 * showing whatever the test did last - not the state that was wrong. This one
 * logs the failure and attaches a screenshot at the point of failure, so
 * every soft failure in a combined test carries its own evidence. With
 * screenshot.on.soft.pass enabled, passing checks get a screenshot too, so a
 * green report still shows what each check saw.
 *
 * Every check is async because of that screenshot - await each one.
 */
export class ReportingSoftAssert {

    private readonly failures: string[] = [];
    private asserted = false;

    async assertTrue(condition: boolean, message?: string): Promise<void> {
        await this.record(condition, message, () => Assert.describeFailure(condition, true, message));
    }

    async assertFalse(condition: boolean, message?: string): Promise<void> {
        await this.record(!condition, message, () => Assert.describeFailure(condition, false, message));
    }

    async assertEquals(actual: unknown, expected: unknown, message?: string): Promise<void> {
        await this.record(Assert.equal(actual, expected), message ?? `expected [${expected}], got [${actual}]`,
            () => Assert.describeFailure(actual, expected, message));
    }

    async assertNotEquals(actual: unknown, unexpected: unknown, message?: string): Promise<void> {
        await this.record(!Assert.equal(actual, unexpected), message,
            () => `${message ? message + ' ' : ''}did not expect [${unexpected}] but found [${actual}]`);
    }

    async fail(message: string): Promise<void> {
        await this.record(false, message, () => message);
    }

    private async record(passed: boolean, description: string | undefined,
                         failureMessage: () => string): Promise<void> {
        if (passed) {
            if (ConfigManager.getBoolean('screenshot.on.soft.pass')) {
                await ReportManager.logWithScreenshot('pass', 'Check passed: ' + (description ?? 'condition held'),
                    'screenshot.pass.settle.millis');
            }
            return;
        }
        const message = failureMessage();
        this.failures.push(message);
        Log.error('SOFT FAILURE: ' + message);
        await ReportManager.logWithScreenshot('fail', 'Check failed: ' + message, 'screenshot.settle.millis');
    }

    /** Raises every soft failure recorded so far, as one AssertionError. */
    assertAll(): void {
        this.asserted = true;
        if (this.failures.length > 0) {
            throw new AssertionError('The following asserts failed:\n\t'
                + this.failures.join(',\n\t'));
        }
    }

    /** Failures recorded but never raised because assertAll() was not called. */
    hasUnreportedFailures(): boolean {
        return this.failures.length > 0 && !this.asserted;
    }

    failureCount(): number {
        return this.failures.length;
    }
}
