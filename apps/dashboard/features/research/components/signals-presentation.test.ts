import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SignalCard } from './signals-screen.tsx';

test('renders source video title, normalized research topic, and durable transcript status as distinct operational fields', () => {
  const html = renderToStaticMarkup(React.createElement(SignalCard, { signal: {
    id: 'signal', projectId: 'project', researchSourceId: 'source', sourceType: 'youtube' as never, externalId: 'youtube:video',
    title: 'Competitor source-video title', url: 'https://youtube.com/watch?v=video', summary: null, publishedAt: null,
    discoveredAt: '2026-09-01T00:00:00.000Z', createdAt: '2026-09-01T00:00:00.000Z',
    project: { id: 'project', name: 'Project' }, sourceName: 'Competitor', researchTopic: 'Normalized underlying subject',
    transcript: { status: 'pending', language: null, trackKind: null },
  } }));
  assert.match(html, /Source video: Competitor source-video title/);
  assert.match(html, /Research topic:/);
  assert.match(html, /Normalized underlying subject/);
  assert.match(html, /Transcript: PENDING/);
});
