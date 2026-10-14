import * as fs from 'fs';
import * as path from 'path';
import type { TestInfo } from '@playwright/test';
import { ConfigManager } from '../config/ConfigManager';
import { AssertionError } from '../exceptions/errors';
import { Log } from '../utils/Log';

/**
 * Decides whether a failed test is worth running again.
 *
 * DELIBERATELY CONSERVATIVE. Retrying hides real intermittent product bugs, so
 * the default is a single retry and assertion failures are never retried -
 * only infrastructure-shaped failures (timeouts, an element that never showed,
 * a page or browser that died) are. A test whose assertion failed did its
 * job; running it again just delays the bad news.
 *
 * HOW IT PLUGS INTO PLAYWRIGHT
 * ----------------------------
 * Playwright retries every failure, up to the project's `retries`. Each
 * attempt records how it failed in a small state file; when a retry starts,
 * the previous attempt's record is read, and if that failure was not
 * retryable the retry fails at once with the original reason - before any
 * browser work happens. The test therefore ends red, exactly as if it had
 * never been retried, at the cost of a few milliseconds.
 *
 * The demo project sets `retries: 0`, so none of this applies to it - the
 * same as the demo suites not attaching the Selenium RetryListener.
 */
const STATE_DIR = path.resolve('test-output', '.retry-state');

interface AttemptRecord {
    retryable: boolean;
    errorName: string;
    message: string;
}

/** The error class Playwright serialised into the stack trace, e.g. "AssertionError". */
function errorNameOf(testInfo: TestInfo): string {
    const error = testInfo.error;
    const firstLine = (error?.stack ?? error?.message ?? '').split('\n')[0];
    const match = firstLine.match(/^([A-Za-z_$][\w$]*):/);
    return match ? match[1] : 'Error';
}

/**
 * An AssertionError means the product behaved differently from the spec,
 * which is a result worth reporting rather than re-rolling. So does a
 * framework or state error (bad config, a dialog that refused to close) or a
 * bug in the test script itself (TypeError...). Only failures of the browser
 * or the wait for it are retried.
 */
function isRetryable(testInfo: TestInfo): boolean {
    if (testInfo.status === 'timedOut') {
        return true;
    }
    const name = errorNameOf(testInfo);
    const message = testInfo.error?.message ?? '';
    if (['TimeoutError', 'WaitTimeoutError', 'NoSuchElementError'].includes(name)) {
        return true;
    }
    if (/has been closed|net::ERR_|Navigation failed|crashed/.test(message)) {
        return true;
    }
    // A Playwright API call that failed for a browser-side reason, e.g.
    // "Error: page.evaluate: Execution context was destroyed".
    return name === 'Error' && /^(page|locator|frame|elementHandle|browserContext|browser)\.\w+:/.test(message);
}

function stateFile(testInfo: TestInfo): string {
    return path.join(STATE_DIR, testInfo.testId.replace(/[^\w-]/g, '_') + '.json');
}

export const RetryPolicy = {

    /** Called before each attempt; fails a retry whose previous attempt was not retryable. */
    beforeAttempt(testInfo: TestInfo): void {
        const file = stateFile(testInfo);
        if (testInfo.retry === 0) {
            fs.rmSync(file, { force: true });
            return;
        }
        if (!fs.existsSync(file)) {
            return;
        }
        const previous = JSON.parse(fs.readFileSync(file, 'utf8')) as AttemptRecord;
        if (!previous.retryable) {
            throw new AssertionError(
                `Not retried: the previous attempt failed with ${previous.errorName}, which is a test result, `
                + `not an infrastructure failure.\n${previous.message}`);
        }
        Log.warn(`Retrying ${testInfo.title} (attempt ${testInfo.retry} of ${ConfigManager.retryCount()}) `
            + `after ${previous.errorName}`);
    },

    /** Called after each attempt; records how a failed attempt failed. */
    afterAttempt(testInfo: TestInfo): void {
        if (testInfo.status !== 'failed' && testInfo.status !== 'timedOut') {
            return;
        }
        const record: AttemptRecord = {
            retryable: isRetryable(testInfo),
            errorName: testInfo.status === 'timedOut' ? 'TestTimeout' : errorNameOf(testInfo),
            message: testInfo.error?.message ?? '',
        };
        fs.mkdirSync(STATE_DIR, { recursive: true });
        fs.writeFileSync(stateFile(testInfo), JSON.stringify(record));
    },
};
