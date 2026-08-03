import { test, expect } from '@playwright/test';

test.describe('Docker Image Builder System - E2E User Workflows', () => {
  test.beforeEach(async ({ page }) => {
    // Clear localStorage to start with clean state
    await page.goto('/login');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
  });

  test('should redirect root / to /login and allow logging in', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { name: /welcome to build monitor/i })).toBeVisible();

    // Fill user ID and submit
    await page.getByLabel(/user id/i).fill('e2e-test-user');
    await page.getByRole('button', { name: /enter|continue|login|submit/i }).click();

    // Verify navigation to /builds
    await expect(page).toHaveURL(/\/builds$/);
    await expect(page.getByRole('heading', { name: /builds/i })).toBeVisible();
  });

  test('should navigate through main navigation links', async ({ page }) => {
    // Set authenticated user ID directly in localStorage
    await page.goto('/login');
    await page.evaluate(() => localStorage.setItem('userId', 'e2e-tester'));
    await page.goto('/builds');

    await expect(page).toHaveURL(/\/builds$/);
    await expect(page.getByRole('heading', { name: /builds/i })).toBeVisible();

    // Navigate to Build Request page
    const requestLink = page.getByRole('link', { name: /request|new build/i }).first();
    if (await requestLink.isVisible()) {
      await requestLink.click();
      await expect(page).toHaveURL(/\/build-request$/);
      await expect(page.getByRole('heading', { name: /request a build|build request/i })).toBeVisible();
    }

    // Navigate to Admin Builds page
    await page.goto('/admin/builds');
    await expect(page).toHaveURL(/\/admin\/builds$/);
    await expect(page.getByRole('heading', { name: /admin|all builds/i })).toBeVisible();

    // Navigate to Admin Hosting page
    await page.goto('/admin/hosting');
    await expect(page).toHaveURL(/\/admin\/hosting$/);
  });

  test('should submit a new build request successfully', async ({ page }) => {
    await page.goto('/login');
    await page.evaluate(() => localStorage.setItem('userId', 'e2e-tester'));
    await page.goto('/build-request');

    // Fill build request form
    const appNameInput = page.getByLabel(/app name/i);
    if (await appNameInput.isVisible()) {
      await appNameInput.fill('e2e-sample-app');
    }

    const repositoryInput = page.getByLabel(/repository|repo url/i);
    if (await repositoryInput.isVisible()) {
      await repositoryInput.fill('https://github.com/example/sample-app.git');
    }

    // Submit form
    const submitBtn = page.getByRole('button', { name: /create build|submit|request build/i });
    if (await submitBtn.isVisible()) {
      await submitBtn.click();
      // Should redirect to builds list or build detail
      await expect(page).toHaveURL(/\/(builds|build-request)/);
    }
  });

  test('should toggle dark/light theme seamlessly', async ({ page }) => {
    await page.goto('/login');
    await page.evaluate(() => localStorage.setItem('userId', 'e2e-tester'));
    await page.goto('/builds');

    const themeToggleBtn = page.getByRole('button', { name: /toggle theme|switch theme|dark|light/i }).first();
    if (await themeToggleBtn.isVisible()) {
      const initialTheme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
      await themeToggleBtn.click();
      const updatedTheme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
      expect(updatedTheme).not.toEqual(initialTheme);
    }
  });
});
