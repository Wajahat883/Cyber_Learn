import { expect, test } from '@playwright/test';
import { createLesson, register } from './helpers';

test('lesson and player work on a phone', async ({ page }) => {
  await register(page);
  const lessonId = await createLesson(page);
  // No horizontal scrolling on a phone-sized screen.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await page.goto(`/lessons/${lessonId}/present`);
  await expect(page.locator('[aria-roledescription=slide]')).toBeVisible();
});
