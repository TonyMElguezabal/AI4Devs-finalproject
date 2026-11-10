import { statSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { folderFingerprint, DEVELOPER_DATA_DIR, WORKFLOW_SCRIPT } from "../../backend/test/workflowServer.ts";

// add-browser-e2e (JOS-272) — the User's main flow in a real browser: the start form to the downloaded final video,
// on the real frontend and backend with every provider stubbed (see playwright.config.ts).

test("a session runs from the page to its downloaded final video", async ({ page }) => {
  const dataBefore = folderFingerprint(DEVELOPER_DATA_DIR);

  await page.goto("/");
  // First visit: the telemetry question. "Not now" answers it without enabling anything.
  const notNow = page.getByRole("button", { name: "Not now" });
  if (await notNow.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await notNow.click();
    await expect(notNow).toBeHidden();
  }

  const form = page.getByRole("form", { name: "Start a project" });
  await form.getByLabel("Title").fill("Browser E2E");
  await form.getByLabel("Script").fill(WORKFLOW_SCRIPT);
  await form.getByLabel("Language").selectOption("en");
  await expect(form.getByLabel("Title")).toHaveValue("Browser E2E");
  await expect(form.getByLabel("Script")).toHaveValue(WORKFLOW_SCRIPT);
  await form.getByRole("button", { name: "Start project" }).click();

  const progress = page.getByRole("group", { name: "Pipeline progress" });
  await expect(progress.getByText("Complete")).toHaveCount(4, { timeout: 60_000 });

  const download = page.getByRole("link", { name: "Download final video" });
  await expect(download).toBeVisible();
  const [file] = await Promise.all([page.waitForEvent("download"), download.click()]);
  expect(statSync((await file.path())).size).toBeGreaterThan(0);

  expect(folderFingerprint(DEVELOPER_DATA_DIR)).toEqual(dataBefore);
});
