/**
 * Declarative wait intent used by ElementUtils, so page objects never have to
 * build wait conditions by hand.
 */
export enum WaitStrategy {

    /** Element is in the DOM (may still be invisible). */
    PRESENT = 'PRESENT',

    /** Element is in the DOM and has a non-zero size. */
    VISIBLE = 'VISIBLE',

    /** Element is visible and enabled. */
    CLICKABLE = 'CLICKABLE',

    /** Element has left the DOM or become invisible. */
    INVISIBLE = 'INVISIBLE',

    /** No wait at all - caller already knows the element is settled. */
    NONE = 'NONE',
}
