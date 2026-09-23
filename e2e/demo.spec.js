import { test, expect } from "@playwright/test";

test("preloaded demo remains playable without server analysis", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Clipboard History").first()).toBeVisible();
  await expect(page.getByText("功能实现 Story")).toBeVisible();
});
