/**
 * Declarative wait intent used by ElementUtils.find(), so page objects never
 * have to spell out Playwright wait states by hand.
 */
export enum WaitStrategy {
  /** Element is in the DOM (may still be invisible). Playwright state 'attached'. */
  PRESENT = 'PRESENT',

  /** Element is in the DOM and visible. Playwright state 'visible'. */
  VISIBLE = 'VISIBLE',

  /**
   * Element is visible. Playwright's click() checks enabled / stable /
   * receives-events itself, so this waits like VISIBLE.
   */
  CLICKABLE = 'CLICKABLE',

  /** Element has left the DOM or become invisible - use WaitUtils.waitForInvisible(). */
  INVISIBLE = 'INVISIBLE',

  /** No wait at all - caller already knows the element is settled. */
  NONE = 'NONE',
}
