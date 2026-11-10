/**
 * Single error type for every unrecoverable framework-level failure (bad
 * config, unreadable test data, a control that is not on screen...).
 * Keeping one type makes handling and reporting uniform.
 */
export class FrameworkException extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'FrameworkException';
  }
}

/**
 * Raised by WaitUtils.poll() when a condition is not met in time - the
 * counterpart of Selenium's TimeoutException. Page objects catch it where a
 * timeout is an answer ("the panel did not open") rather than a failure.
 */
export class WaitTimeoutException extends FrameworkException {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'WaitTimeoutException';
  }
}
