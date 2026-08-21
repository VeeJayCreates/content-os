import { expect, test } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
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
  await Promise.race([workerClose,new Promise<void>((done)=>setTimeout(done,5000))]);
  if (worker.exitCode === null && worker.signalCode === null) {
    worker.kill("SIGKILL");
    await workerClose;
  }
}

test.beforeEach(async ({ page }) => {
  consoleErrors=[]; failedRequests=[]; workerLog=""; worker=undefined; workerClose=undefined;
  page.on("console",(m)=>{if(m.type()==="error") consoleErrors.push(m.text());});
  page.on("requestfailed",(f)=>failedRequests.push(`${f.method()} ${f.url()}: ${f.failure()?.errorText}`));
});

test.afterEach(async ({}, testInfo) => {
  await stopWorker();
  if (testInfo.status === testInfo.expectedStatus) return;
  await testInfo.attach("browser-console-errors",{body:consoleErrors.join("\n")||"None",contentType:"text/plain"});
  await testInfo.attach("failed-network-requests",{body:failedRequests.join("\n")||"None",contentType:"text/plain"});
  await testInfo.attach("render-worker.log",{body:workerLog||"No worker output",contentType:"text/plain"});
});

test("renders and delivers the deterministic Production Queue video", async ({ page, request }, testInfo) => {
  const fixture = JSON.parse(await readFile(resolve(root,"test-results/video-creation-runtime/fixture.json"),"utf8"));
  await page.goto("/workflows");
  await expect(page.getByRole("heading",{name:"Production queue"})).toBeVisible();
  await page.getByRole("combobox").first().selectOption({label:"Video E2E Golden Path"});
  await expect(page.getByText("Deterministic local video")).toBeVisible();
  const render=page.getByLabel("Video render");
  await expect(render.getByRole("button",{name:"Render video"})).toBeVisible();
  const queuedResponse=page.waitForResponse((response)=>response.url().endsWith(`/content-scripts/${fixture.script}/video-render-jobs`)&&response.request().method()==="POST");
  await render.getByRole("button",{name:"Render video"}).click();
  expect((await queuedResponse).status()).toBe(201);
  await expect(render.getByText(/Video render .* Queued/)).toBeVisible();

  worker=spawn(process.execPath,[resolve(root,"tests/e2e/video-render-worker.mjs")],{
    cwd:resolve(root,"apps/api"),
    env:{...Object.fromEntries(Object.entries(process.env).filter(([key])=>!["database_url","media_storage_root","video_render_work_root","audio_default_provider"].includes(key.toLowerCase()))),
      DATABASE_URL:fixture.databasePath,MEDIA_STORAGE_ROOT:fixture.mediaRoot,VIDEO_RENDER_WORK_ROOT:fixture.workRoot,AUDIO_DEFAULT_PROVIDER:"sarvam-bulbul-v3"},
    windowsHide:true,
  });
  worker.stdout.on("data",(d)=>workerLog+=d); worker.stderr.on("data",(d)=>workerLog+=d);
  workerClose=new Promise<number|null>((done)=>worker!.once("close",done));
  await expect(render.getByText(/Video render .* Running/)).toBeVisible({timeout:30000});
  await expect(render.getByLabel("Render progress")).toBeVisible();
  expect(await workerClose,workerLog).toBe(0);
  await expect(render.getByText(/Video render .* Completed/)).toBeVisible({timeout:30000});

  const video=render.locator("video");
  await expect(video).toBeVisible();
  await expect(video).toHaveAttribute("src",new RegExp(`${fixture.script}/video-render-job/output$`));
  const output=await request.get(`/api/content-scripts/${fixture.script}/video-render-job/output`);
  expect(output.ok()).toBeTruthy();
  expect(output.headers()["content-type"]).toContain("video/mp4");
  expect(Number(output.headers()["content-length"])).toBeGreaterThan(0);
  const bytes=await output.body();
  expect(bytes.byteLength).toBeGreaterThan(0);
  expect(bytes.subarray(4,8).toString("ascii")).toBe("ftyp");
  const statusResponse=await request.get(`/api/content-scripts/${fixture.script}/video-render-job`);
  const statusBody=await statusResponse.json();
  expect(statusBody.outputArtifact.mimeType).toBe("video/mp4");
  expect((await stat(resolve(fixture.mediaRoot,...statusBody.outputArtifact.storageKey.split("/")))).size).toBe(bytes.byteLength);

  if(process.env.KEEP_VIDEO_E2E_ARTIFACTS==="1"){
    const preserveDir=resolve(root,"test-results","video-creation-preserved");
    const preservedVideo=resolve(preserveDir,"contentos-video-e2e-latest.mp4");
    const preservedMetadata=resolve(preserveDir,"contentos-video-e2e-latest.json");
    await mkdir(preserveDir,{recursive:true});
    await writeFile(preservedVideo,bytes);
    await writeFile(preservedMetadata,JSON.stringify({preservedAt:new Date().toISOString(),scriptId:fixture.script,byteLength:bytes.byteLength,mimeType:statusBody.outputArtifact.mimeType,outputArtifact:statusBody.outputArtifact},null,2),"utf8");
    console.log(`[VIDEO_E2E] Preserved video: ${preservedVideo}`);
    await testInfo.attach("preserved-video-path",{body:preservedVideo,contentType:"text/plain"});
  }

  await page.reload();
  await expect(page.getByLabel("Video render").getByText(/Completed/)).toBeVisible();
  await expect(page.getByRole("link",{name:"Open or download output"})).toHaveAttribute("href",new RegExp(`${fixture.script}/video-render-job/output$`));
  expect(failedRequests).toEqual([]);
});
