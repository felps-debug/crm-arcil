import { test, expect } from "@playwright/test";

// Smoke test only: confirms the login form renders with the fields a user
// needs to authenticate. Does not attempt a real sign-in (no Supabase
// session), so it stays green without live credentials configured.
test("login page renders email, password fields and a submit button", async ({ page }) => {
  await page.goto("/login");

  // Field labels (see src/app/login/page.tsx's <Field label="..." />).
  await expect(page.getByText("E-mail", { exact: true })).toBeVisible();
  await expect(page.getByText("Senha", { exact: true })).toBeVisible();

  // The <label> elements aren't wired to their <input> via htmlFor/id, so
  // getByLabel() would not find them — select the inputs directly instead.
  await expect(page.locator('input[type="email"]')).toBeVisible();
  await expect(page.locator('input[autocomplete="current-password"]')).toBeVisible();

  // The login form's submit button (distinct from the "Entrar"/"Criar
  // conta" tab switcher, which sits outside the <form>).
  const submitButton = page.locator('form button[type="submit"]');
  await expect(submitButton).toBeVisible();
  await expect(submitButton).toContainText(/entrar/i);
});
