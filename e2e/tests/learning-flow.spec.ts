import { expect, test } from '@playwright/test';
import { createLesson, register } from './helpers';

test.describe('core learning flow', () => {
  test('notes → lesson → explore in place → compare with notes', async ({ page }) => {
    await register(page);
    const lessonId = await createLesson(page);

    // Sections come from the notes and read without collapsible clutter.
    await expect(page.getByRole('heading', { name: 'Correlation and Alerting' })).toBeVisible();
    await expect(page.locator('section details')).toHaveCount(0);

    // Secondary material lives in one tab strip per section.
    const section = page.locator('section', { has: page.getByRole('heading', { name: 'Correlation and Alerting' }) });
    const tabs = section.getByRole('tablist', { name: 'Go deeper' });
    await expect(tabs).toBeVisible();

    // Compare the explanation with the original notes, side by side.
    await section.getByRole('button', { name: 'Compare with notes' }).click();
    const notes = section.getByRole('complementary', { name: 'Your notes' });
    await expect(notes).toContainText('4625');
    await expect(notes.locator('mark').first()).toBeVisible();

    // Diagrams are explored without leaving the lesson.
    const figure = page.locator('figure').first();
    await figure.scrollIntoViewIfNeeded();
    await figure.locator('.react-flow__node').first().click();
    await expect(figure.locator('[aria-live=polite]')).toBeVisible();
    await figure.getByRole('button', { name: /Expand/ }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    expect(page.url()).toContain(`/lessons/${lessonId}`);

    // Scroll-spy: the outline follows the section being read.
    const investigation = page.getByRole('heading', { name: 'Investigation' });
    await investigation.scrollIntoViewIfNeeded();
    // Wheel over the main column; the pointer may still sit on a scrollable "Your notes" pane.
    await investigation.hover();
    await page.mouse.wheel(0, 3000);
    await expect(page.locator('nav[aria-label="Lesson outline"] button.bg-primary-soft')).toContainText('Investigation');
  });

  test('presentation plays, captions follow the narration and nodes can be inspected', async ({ page }) => {
    await register(page);
    const lessonId = await createLesson(page);
    await page.goto(`/lessons/${lessonId}/present`);
    const stage = page.locator('[aria-roledescription=slide]');
    await expect(stage).toBeVisible();
    // Mute: the clock then never waits for a speech engine.
    await page.getByRole('button', { name: 'Mute narration' }).click();

    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await expect(stage.locator('[aria-live=polite] p')).toBeVisible();
    await expect(page.getByText('Slide 2 /')).toBeVisible({ timeout: 30_000 });

    // Jump to a diagram slide and click a node: playback pauses and details open.
    const slides = page.getByRole('list', { name: 'Slide timeline' }).getByRole('listitem');
    const count = await slides.count();
    const seek = page.getByRole('slider', { name: 'Seek within slide' });
    for (let i = 0; i < count; i++) {
      await slides.nth(i).click();
      // Nodes appear as the narration reaches them; look near the end of the slide.
      const max = Number(await seek.getAttribute('max'));
      await seek.fill(String(Math.floor((max * 0.9) / 100) * 100));
      // Slides change with a short transition; give the new one time to mount.
      const found = await stage
        .locator('svg g[style*="cursor"]')
        .first()
        .waitFor({ timeout: 1500 })
        .then(() => true, () => false);
      if (found) break;
    }
    await page.getByRole('button', { name: 'Pause' }).click().catch(() => undefined);
    await stage.locator('svg g[style*="cursor"]').first().click({ force: true });
    await expect(stage.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
  });

  test('flashcards and quiz are generated with the lesson', async ({ page }) => {
    await register(page);
    const lessonId = await createLesson(page);
    await page.goto(`/revision?tab=flashcards&lessonId=${lessonId}`);
    await expect(page.getByText(/flashcard/i).first()).toBeVisible();
  });
});

test('protected pages redirect to sign-in', async ({ page }) => {
  await page.goto('/library');
  await expect(page).toHaveURL(/\/login/);
});
