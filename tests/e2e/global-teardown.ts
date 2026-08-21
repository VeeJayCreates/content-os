import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

export default async function globalTeardown() {
  await writeFile(resolve("test-results/video-creation-runtime/stop"), "stop\n");
}
