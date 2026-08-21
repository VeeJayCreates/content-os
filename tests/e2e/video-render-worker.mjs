import { FfmpegVideoRenderer } from "../../apps/api/dist/modules/production/ffmpeg-video.renderer.js";

// The dashboard polls every three seconds. Hold the real renderer at its entry
// boundary after the worker has claimed the job and persisted initial progress,
// so at least one browser poll deterministically observes the running state.
const render = FfmpegVideoRenderer.prototype.render;
FfmpegVideoRenderer.prototype.render = async function (...args) {
  await new Promise((resolve) => setTimeout(resolve, 6_500));
  return render.apply(this, args);
};

await import("../../apps/api/dist/video-render-worker.main.js");
