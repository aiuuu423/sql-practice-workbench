import { expect, test } from "@playwright/test";
import { readFile, unlink, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const statePaths = [
  "../../data/progress.json",
  "../../data/submissions.jsonl",
  "../../data/coach_feedback.jsonl",
  "../../data/coach_profile.json",
  "../../../00_学习计划.md",
  "../../../01_知识点笔记.md",
  "../../../02_练习题库.md",
  "../../../03_错题记录.md"
].map((path) => fileURLToPath(new URL(path, import.meta.url)));
const stateBackup = new Map<string, Buffer | null>();

test.beforeAll(async () => {
  for (const path of statePaths) {
    try {
      stateBackup.set(path, await readFile(path));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      stateBackup.set(path, null);
    }
  }
});

test.afterAll(async () => {
  await Promise.all(
    [...stateBackup].map(async ([path, contents]) => {
      if (contents) {
        await writeFile(path, contents);
        return;
      }
      await unlink(path).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "ENOENT") throw error;
      });
    })
  );
});

const correctD01 = `SELECT
  user_id,
  city,
  register_time
FROM users
WHERE register_time >= '2026-10-01'
  AND register_time < '2026-11-01'
  AND status = 'active'
  AND city IN ('北京', '上海')
  AND invite_code IS NOT NULL
ORDER BY register_time DESC, user_id ASC
LIMIT 5`;

async function replaceEditor(page: import("@playwright/test").Page, sql: string) {
  const editor = page.locator(".cm-content");
  await editor.click();
  await editor.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
  await editor.fill(sql);
}

test("completes the SQL practice workflow", async ({ page }) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  await expect(page.getByText("MySQL 8.0.46")).toBeVisible();
  await page
    .getByRole("button", { name: /10 月活跃邀请用户/ })
    .click();

  await replaceEditor(
    page,
    "SELECT user_id, city, register_time FROM users WHERE 1 = 0"
  );
  await page.getByRole("button", { name: "运行 SQL" }).click();
  await expect(page.getByText("0 行")).toBeVisible();

  await page.getByRole("button", { name: "提交答案" }).click();
  await expect
    .poll(() => page.locator(".result-pane").innerText(), { timeout: 10_000 })
    .toContain("结果不匹配");
  await expect(page.getByText("AI 正在分析")).toBeVisible();
  await expect(page.getByText("第 1 次筛选条件缺失")).toBeVisible({
    timeout: 10_000
  });
  await expect(page.getByText("阶段总结")).toHaveCount(0);

  await page.getByRole("button", { name: "提交答案" }).click();
  await expect(page.getByText("第 2 次筛选条件缺失")).toBeVisible({
    timeout: 10_000
  });
  await page.getByRole("button", { name: "提交答案" }).click();
  await expect(page.getByText("第 3 次筛选条件缺失")).toBeVisible({
    timeout: 10_000
  });
  await expect(page.getByText("阶段总结")).toBeVisible();
  await expect(page.getByText("需要继续巩固多条件筛选")).toBeVisible();

  await replaceEditor(page, correctD01);
  await page.getByRole("button", { name: "提交答案" }).click();
  await expect(page.getByText("答案通过")).toBeVisible();
  await page.screenshot({
    path: "/tmp/sql-workbench-passed.png",
    fullPage: false
  });

  await replaceEditor(page, "DELETE FROM users");
  await page.getByRole("button", { name: "提交答案" }).click();
  await expect(page.getByText(/DELETE is not allowed/i)).toBeVisible();
  await expect(page.getByText(/第 1 次执行错误/)).toBeVisible({
    timeout: 10_000
  });

  await page.screenshot({
    path: "/tmp/sql-workbench-1440x900.png",
    fullPage: false
  });

  const desktopRegions = await page.evaluate(() => {
    const box = (selector: string) => {
      const rect = document.querySelector(selector)?.getBoundingClientRect();
      return rect
        ? { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom }
        : null;
    };
    return {
      question: box(".question-region"),
      workbench: box(".workbench"),
      progress: box(".progress-region")
    };
  });
  expect(desktopRegions.question!.right).toBeLessThanOrEqual(
    desktopRegions.workbench!.left
  );
  expect(desktopRegions.workbench!.right).toBeLessThanOrEqual(
    desktopRegions.progress!.left
  );

  await page.getByRole("button", { name: "重置数据" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "确认重置" }).click();
  await expect(page.getByText(/已恢复 8 个用户和 12 笔订单/)).toBeVisible();

  await page.setViewportSize({ width: 1024, height: 768 });
  await expect(page.getByRole("button", { name: "打开学习进度" })).toBeVisible();
  await page.getByRole("button", { name: "打开学习进度" }).click();
  await expect(page.getByText("学习进度")).toBeVisible();
  await expect
    .poll(async () => (await page.locator(".progress-region").boundingBox())?.x)
    .toBeLessThan(800);
  await page.screenshot({
    path: "/tmp/sql-workbench-1024x768.png",
    fullPage: false
  });

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth
  );
  expect(overflow).toBe(false);
  expect(
    consoleErrors.filter(
      (message) => !message.includes("400 (Bad Request)")
    )
  ).toEqual([]);
  expect(pageErrors).toEqual([]);
});
