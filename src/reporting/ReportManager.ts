import type { TestInfo } from '@playwright/test';
import { ConfigManager } from '../config/ConfigManager';
import { ScreenshotUtils } from '../utils/ScreenshotUtils';

export type Status = 'info' | 'pass' | 'fail' | 'skip';

/**
 * Owns the report entries for the running test - the Playwright counterpart
 * of the Selenium framework's ExtentReportManager.
 *
 * Playwright's own HTML report is the report. Each log line becomes an
 * annotation on the test (shown in order at the top of the test's page) and
 * each screenshot becomes an attachment, numbered so the two read as one
 * narrative. Attachments are written as files next to the report rather than
 * embedded, so a run with hundreds of screenshots stays small.
 */
let current: TestInfo | undefined;
let screenshotSequence = 0;

export const ReportManager = {

    setCurrentTest(testInfo: TestInfo): void {
        current = testInfo;
    },

    currentTest(): TestInfo | undefined {
        return current;
    },

    clearCurrentTest(): void {
        current = undefined;
    },

    /** Adds a text entry to the current test. */
    log(status: Status, details: string): void {
        current?.annotations.push({ type: status, description: details });
    },

    /**
     * Logs details to the current test with a screenshot taken once the
     * screen has settled. Falls back to a text-only entry if no test is
     * active or the capture fails.
     *
     * @param settleMillisKey config key bounding the wait for loaders to clear
     */
    async logWithScreenshot(status: Status, details: string, settleMillisKey: string): Promise<void> {
        const testInfo = current;
        if (!testInfo) {
            return;
        }
        const sequence = String(++screenshotSequence).padStart(4, '0');
        ReportManager.log(status, `${details} [screenshot ${sequence}]`);
        const png = await ScreenshotUtils.captureSettled(ConfigManager.getInt(settleMillisKey));
        if (png) {
            await testInfo.attach(`${sequence}_${status}_${details}`.substring(0, 150),
                { body: png, contentType: 'image/png' });
        }
    },
};
