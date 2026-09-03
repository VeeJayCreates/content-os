import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import { ContentChannelStatus } from "@content-os/contracts";

import { ProjectChannelHierarchyContent } from "./project-channel-hierarchy";

test("renders Product and multiple Channels without pipeline ownership controls", () => {
  const html = renderToStaticMarkup(
    React.createElement(ProjectChannelHierarchyContent, {
      hierarchy: {
        productProfile: { projectId: "project-1", name: "Govt Exam Topper", description: null, targetAudience: null, valueProposition: null, primaryUrl: null, createdAt: "2026-01-01", updatedAt: "2026-01-01" },
        channels: [
          { id: "channel-1", projectId: "project-1", name: "Geo Rajneeti", slug: "geo-rajneeti", description: null, niche: null, status: ContentChannelStatus.ACTIVE, createdAt: "2026-01-01", updatedAt: "2026-01-01" },
          { id: "channel-2", projectId: "project-1", name: "Vishal World Affairs", slug: "vishal-world-affairs", description: null, niche: null, status: ContentChannelStatus.ACTIVE, createdAt: "2026-01-01", updatedAt: "2026-01-01" },
        ],
      },
    }),
  );

  assert.match(html, /Project hierarchy/);
  assert.match(html, /Product/);
  assert.match(html, /Channels/);
  assert.match(html, /Govt Exam Topper/);
  assert.match(html, /Geo Rajneeti/);
  assert.match(html, /Vishal World Affairs/);
  assert.doesNotMatch(html, /Research sources/);
});
