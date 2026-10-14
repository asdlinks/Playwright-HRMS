/**
 * The framework's error types.
 *
 * Each sets `name`, because the retry policy reads it back from the failed
 * test's stack trace (Playwright hands fixtures a serialised error, not the
 * object) to decide whether a failure is worth re-running.
 */

/**
 * Single error type for every unrecoverable framework-level failure (bad
 * config, unreadable test data, unsupported browser...). Keeping one type
 * makes reporting and the retry policy uniform.
 */
export class FrameworkError extends Error {
    constructor(message: string, options?: { cause?: unknown }) {
        super(message, options);
        this.name = 'FrameworkError';
    }
}

/** A failed hard or soft assertion: the product behaved differently from the spec. */
export class AssertionError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'AssertionError';
    }
}

/** A polling wait that ran out of time - the equivalent of Selenium's TimeoutException. */
export class WaitTimeoutError extends Error {
    constructor(message: string, options?: { cause?: unknown }) {
        super(message, options);
        this.name = 'WaitTimeoutError';
    }
}

/** No element matched a locator - the equivalent of Selenium's NoSuchElementException. */
export class NoSuchElementError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'NoSuchElementError';
    }
}

/** The app is in a state a flow cannot continue from (a dialog that will not close...). */
export class IllegalStateError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'IllegalStateError';
    }
}
