import { BasePage } from '../base/BasePage';

/**
 * An employee's profile page (/profile/{id}), reached from the directory's
 * "View Profile" card action.
 *
 * The id is server-generated, so this page is navigated to through
 * EmployeeDirectoryPage.openProfileOf() rather than opened by URL; route()
 * is the shared prefix only.
 */
export class EmployeeProfilePage extends BasePage {
  landingMarker(): string {
    return 'Employee Profile';
  }

  route(): string {
    return '/profile/';
  }

  /** True when the profile shows the value anywhere in its main content. */
  async shows(value: string): Promise<boolean> {
    return (await this.contentText()).includes(value);
  }
}
