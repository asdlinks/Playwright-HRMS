import * as fs from 'fs';
import * as path from 'path';
import { ConfigManager } from '../config/ConfigManager';
import { DriverManager } from '../driver/DriverManager';
import { Log } from './Log';
import { WaitUtils } from './WaitUtils';

function stamp(): string {
    const now = new Date();
    const pad = (value: number, width = 2) => String(value).padStart(width, '0');
    return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_`
        + `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}_${pad(now.getMilliseconds(), 3)}`;
}

/** Screenshot capture for the HTML report and for on-disk failure evidence. */
export const ScreenshotUtils = {

    /**
     * Lets the screen finish loading, then returns a PNG.
     * "Finished loading" means document ready, MUI skeletons/spinners gone
     * (bounded by settleMillis), then a short pause for MUI fade and slide
     * transitions. Every wait is non-fatal, so a permanent shimmer costs a few
     * seconds, not the test.
     *
     * @return the PNG, or null when there is no page or the capture failed
     */
    async captureSettled(settleMillis: number): Promise<Buffer | null> {
        if (!DriverManager.isInitialised()) {
            return null;
        }
        try {
            await WaitUtils.waitForDocumentReady();
            await WaitUtils.waitForDataToSettle(settleMillis);
            await WaitUtils.sleepQuietly(ConfigManager.getInt('screenshot.animation.millis'));
        } catch (e) {
            Log.warn('Screen did not settle before the screenshot: ' + (e as Error).message);
        }
        try {
            return await DriverManager.get().screenshot();
        } catch (e) {
            Log.warn('Could not capture screenshot: ' + (e as Error).message);
            return null;
        }
    },

    /** Writes a PNG to the screenshot directory and returns its absolute path. */
    async captureToFile(testName: string): Promise<string | null> {
        if (!DriverManager.isInitialised()) {
            return null;
        }
        try {
            const fileName = `${testName.replace(/[^a-zA-Z0-9_-]/g, '_')}_${stamp()}.png`;
            const target = path.resolve(ConfigManager.get('screenshot.dir'), fileName);
            fs.mkdirSync(path.dirname(target), { recursive: true });
            await DriverManager.get().screenshot({ path: target });
            Log.info('Screenshot saved: ' + target);
            return target;
        } catch (e) {
            Log.warn('Could not save screenshot: ' + (e as Error).message);
            return null;
        }
    },
};
