import type { Page } from '@playwright/test';

/**
 * A piece of UI that is not a page: it has no route of its own and lives on
 * top of, or inside, whatever page is showing - the header, the side rail, a
 * dialog, a drawer.
 *
 * Components follow the same rules as pages (private locators, intent-level
 * methods, no assertions) but are reached through a page method
 * (`directory.openEditFor(name)`, `page.header()`) rather than opened by URL.
 */
export abstract class BaseComponent {
  constructor(protected readonly page: Page) {}

  /** True when the component is on screen. */
  abstract isDisplayed(): Promise<boolean>;
}
