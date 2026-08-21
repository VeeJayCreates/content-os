import { expect, test } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(process.cwd());
let consoleErrors: string[] = [];
let failedRequests: string[] = [];
let workerLog = "";
let worker: ChildProcess | undefined;
let workerClose: Promise<number | null> | undefined;

async function stopWorker() {
  if (!worker || !workerClose) return;
  if (worker.exitCode === null && worker.signalCode === null) worker.kill();
  await Promise.race([
    workerClose,
    new Promise<void>((done) => setTimeout(done, 5_000)),
  ]);
  if (worker.exitCode === null && worker.signalCode === null) {
    worker.kill("SIGKILL");
    await workerClose;
  }
}

test.beforeEach(async ({ page }) => {
  consoleErrors = [];
  failedRequests = [];
  workerLog = "";
  worker = undefined;
  workerClose = undefined;
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("requestfailed", (failed) => failedRequests.push(`${failed.method()} ${failed.url()}: ${failed.failure()?.errorText}`));
});

test.afterEach(async ({}, testInfo) => {
  await stopWorker();
  if (testInfo.status === testInfo.expectedStatus) return;
  await testInfo.attach("browser-console-errors", { body: consoleErrors.join("\n") || "None", contentType: "text/plain" });
  await testInfo.attach("failed-network-requests", { body: failedRequests.join("\n") || "None", contentType: "text/plain" });
  await testInfo.attach("render-worker.log", { body: workerLog || "No worker output", contentType: "text/plain" });
});

test("renders and delivers the deterministic Production Queue video", async ({ page, request }, testInfo) => {
  const fixture = JSON.parse(await readFile(resolve(root, "test-results/video-creation-runtime/fixture.json"), "utf8"));
  await page.goto("/workflows");
  await expect(page.getByRole("heading", { name: "Production queue" })).toBeVisible();
  await page.getByRole("combobox").first().selectOption({ label: "Video E2E Golden Path" });
  await expect(page.getByText("Deterministic local video")).toBeVisible();
  const render = page.getByLabel("Video render");
  await expect(render.getByRole("button", { name: "Render video" })).toBeVisible();
  const queuedResponse = page.waitForResponse((response) => response.url().endsWith(`/content-scripts/${fixture.script}/video-render-jobs`) && response.request().method() === "POST");
  await render.getByRole("button", { name: "Render video" }).click();
  expect((await queuedResponse).status()).toBe(201);
  await expect(render.getByText(/Video render .* Queued/)).toBeVisible();

  worker = spawn(process.execPath, [resolve(root, "tests/e2e/video-render-worker.mjs")], {
    cwd: resolve(root, "apps/api"),
    env: {
      ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !["database_url", "media_storage_root", "video_render_work_root", "audio_default_provider"].includes(key.toLowerCase()))),
      DATABASE_URL: fixture.databasePath,
      MEDIA_STORAGE_ROOT: fixture.mediaRoot,
      VIDEO_RENDER_WORK_ROOT: fixture.workRoot,
      AUDIO_DEFAULT_PROVIDER: "sarvam-bulbul-v3",
    },
    windowsHide: true,
  });
  worker.stdout.on("data", (data) => workerLog += data); worker.stderr.on("data", (data) => workerLog += data);
  workerClose = new Promise<number | null>((done) => worker!.once("close", done));
  await expect(render.getByText(/Video render .* Running/)).toBeVisible({ timeout: 30_000 });
  await expect(render.getByLabel("Render progress")).toBeVisible();
  expect(await workerClose, workerLog).toBe(0);
  await expect(render.getByText(/Video render .* Completed/)).toBeVisible({ timeout: 30_000 });

  const video = render.locator("video");
  await expect(video).toBeVisible();
  await expect(video).toHaveAttribute("src", new RegExp(`${fixture.script}/video-render-job/output$`));
  const output = await request.get(`/api/content-scripts/${fixture.script}/video-render-job/output`);
  expect(output.ok()).toBeTruthy();
  expect(output.headers()["content-type"]).toContain("video/mp4");
  expect(Number(output.headers()["content-length"])).toBeGreaterThan(0);
  const bytes = await output.body();
  expect(bytes.byteLength).toBeGreaterThan(0);
  expect(bytes.subarray(4, 8).toString("ascii")).toBe("ftyp");
  const statusResponse = await request.get(`/api/content-scripts/${fixture.script}/video-render-job`);
  const statusBody = await statusResponse.json();
  expect(statusBody.outputArtifact.mimeType).toBe("video/mp4");
  expect((await stat(resolve(fixture.mediaRoot, ...statusBody.outputArtifact.storageKey.split("/")))).size).toBe(bytes.byteLength);

  await page.reload();
  await expect(page.getByLabel("Video render").getByText(/Completed/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Open or download output" })).toHaveAttribute("href", new RegExp(`${fixture.script}/video-render-job/output$`));
  expect(failedRequests).toEqual([]);
});
