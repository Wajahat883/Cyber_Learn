import { expect, type Page } from '@playwright/test';

export const NOTES = `# SIEM Architecture

A Security Information and Event Management (SIEM) system collects security events from many log sources.

## Log Collection

Log sources such as Windows servers, firewalls and Linux hosts forward events to the SIEM. Agents or syslog forwarders send the events over the network. Normalization converts different log formats into a common schema.

## Correlation and Alerting

The SIEM correlates events using detection rules. When a rule matches, the SIEM raises an alert. For example, many failed logons (Windows event ID 4625) followed by a success (event ID 4624) may indicate a brute-force attack.

\`\`\`
Get-WinEvent -FilterHashtable @{LogName='Security'; Id=4625}
\`\`\`

## Investigation

A SOC analyst triages the alert, reviews related events on a timeline and decides whether to escalate the incident.`;

export async function register(page: Page) {
  await page.goto('/register');
  await page.fill('input[autocomplete=nickname]', 'E2E Student');
  await page.fill('input[type=email]', `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`);
  await page.fill('input[type=password]', 'correct horse battery');
  await page.click('button[type=submit]');
  await page.waitForURL('/');
}

/** Creates a lesson from pasted notes without the plan-review pause; returns the lesson id. */
export async function createLesson(page: Page, title = 'SIEM Architecture') {
  await page.goto('/create');
  await page.fill('input[placeholder="e.g. SIEM Architecture"]', title);
  await page.fill('textarea', NOTES);
  await page.getByRole('switch', { name: 'Review the plan first' }).click();
  await page.getByRole('button', { name: 'Generate Learning Experience' }).click();
  await page.waitForURL('**/generations/*');
  await page.getByRole('link', { name: 'Open lesson' }).click({ timeout: 90_000 });
  await page.waitForURL('**/lessons/*');
  await expect(page.locator('section h2').first()).toBeVisible();
  return page.url().split('/lessons/')[1].split(/[#?/]/)[0];
}
