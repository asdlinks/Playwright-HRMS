import type { FullConfig } from '@playwright/test';
import { ConfigManager } from '../config/ConfigManager';
import { Log } from '../utils/Log';

/** Prints the run banner - the first thing anyone triaging a red run needs. */
export default async function globalSetup(config: FullConfig): Promise<void> {
    Log.info('='.repeat(78));
    Log.info('SUITE START: MyWe HRMS - ' + config.projects.map(project => project.name).join(', '));
    Log.info('Application : ' + ConfigManager.baseUrl());
    Log.info('Tenant      : ' + ConfigManager.tenantCode());
    Log.info(`Browser     : ${ConfigManager.browser()} (headless=${ConfigManager.headless()})`);
    Log.info('='.repeat(78));
}
