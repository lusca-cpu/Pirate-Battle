import { expect, test } from '@playwright/test';

test('o menu inicial mostra os botões principais', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Options', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ranking', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Match History', exact: true })).toBeVisible();
});

test('Options abre outra tela e o menu some', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: 'Options', exact: true }).click();

  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeHidden();
});

test('Play inicia a partida', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: 'Play', exact: true }).click();

  await expect(page.getByRole('button', { name: 'Options', exact: true })).toBeHidden();
});
