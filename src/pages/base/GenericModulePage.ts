import type { Page } from '@playwright/test';
import { AppModule } from '../../enums/AppModule';
import { BasePage } from './BasePage';

/**
 * Page object for modules the suite only needs to load and verify.
 *
 * Writing twelve near-identical classes for Daily Check-In, Shifts, My Team,
 * Reports, Payroll and friends would be ceremony, not coverage. When one of
 * these grows real interaction tests it earns its own class; until then it
 * is addressed through its AppModule entry.
 */
export class GenericModulePage extends BasePage {
  constructor(
    page: Page,
    readonly module: AppModule,
  ) {
    super(page);
  }

  landingMarker(): string {
    return this.module.landingMarker;
  }

  route(): string {
    return this.module.route;
  }
}
