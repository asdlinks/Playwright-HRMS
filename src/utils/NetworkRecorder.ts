import type { Page, Response } from '@playwright/test';

interface Recording {
  writes: string[];
  pending: Promise<void>[];
  listener: (response: Response) => void;
}

/**
 * Records the page's write requests (anything but GET) - method, URL, status
 * and the start of the response body - so a failure can say what the server
 * answered when the UI says nothing.
 *
 * Diagnostic only: requests pass through unchanged. Some apps reject a save
 * without showing an error on screen (a 409 behind a dialog that just stays
 * open); the recorded response is then the only place the reason exists.
 *
 * The Selenium version had to inject fetch/XHR wrappers into the page;
 * Playwright observes the network directly, which also survives reloads.
 *
 *   NetworkRecorder.start(page);
 *   ... click Save ...
 *   Log.info('API writes: ' + await NetworkRecorder.recordedWrites(page));
 */
export class NetworkRecorder {
  private static readonly recordings = new WeakMap<Page, Recording>();

  private constructor() {}

  /** Clears earlier records and starts listening. */
  static start(page: Page): void {
    NetworkRecorder.stop(page);
    const recording: Recording = { writes: [], pending: [], listener: () => undefined };
    recording.listener = (response: Response) => {
      const method = response.request().method();
      if (method.toUpperCase() === 'GET') {
        return;
      }
      const line = `${method} ${response.url()} -> ${response.status()}`;
      recording.pending.push(
        response
          .text()
          .then((body) => {
            recording.writes.push(`${line} ${body.slice(0, 300)}`);
          })
          .catch(() => {
            recording.writes.push(`${line} <body unavailable>`);
          }),
      );
    };
    page.on('response', recording.listener);
    NetworkRecorder.recordings.set(page, recording);
  }

  static stop(page: Page): void {
    const existing = NetworkRecorder.recordings.get(page);
    if (existing) {
      page.off('response', existing.listener);
      NetworkRecorder.recordings.delete(page);
    }
  }

  /** The writes recorded since start(), one "METHOD url -> status body" entry each. */
  static async recordedWrites(page: Page): Promise<string> {
    const recording = NetworkRecorder.recordings.get(page);
    if (!recording) {
      return '[]';
    }
    await Promise.allSettled(recording.pending);
    return `[${recording.writes.join(', ')}]`;
  }
}
