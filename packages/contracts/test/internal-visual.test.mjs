import assert from 'node:assert/strict';
import test from 'node:test';
import { validateInternalVisualSpecification } from '../dist/internal-visual.js';

const map = { type: 'map', version: 'internal-visual-v1', spec: { focus: 'Region', viewport: { framing: 'regional', geometryStatus: 'named_region' }, highlightedRegions: ['Region'], regionDetails: [{ id: 'region-1', label: 'Region', geometryStatus: 'named_region', emphasis: 'primary' }], geographicReferences: [], markers: [{ id: 'marker-1', latitude: 10, longitude: 20, label: 'Marker', role: 'focus', emphasis: 'primary' }], routes: [{ id: 'route-1', points: [{ latitude: 10, longitude: 20 }, { latitude: 11, longitude: 21 }], role: 'primary', direction: 'forward' }], zones: [{ id: 'zone-1', label: 'Chokepoint', kind: 'chokepoint', geometryStatus: 'unavailable', emphasis: 'primary' }], labels: [], emphasisTargets: ['Chokepoint'] } };

test('normalizes all V1 internal visual types', () => {
  assert.deepEqual(validateInternalVisualSpecification(map), map);
  for (const value of [
    { type: 'flow_or_corridor', version: 'internal-visual-v1', spec: { direction: 'forward', lanes: [], laneConfiguration: [{ id: 'lane-1', role: 'primary', geometryStatus: 'unavailable' }], movingEntities: ['generic'], entityConfiguration: [{ id: 'entity-1', kind: 'generic', count: 3 }], compression: 'pressure', progression: 'approach', pressureZone: 'Pressure zone', pressureZoneDetails: { id: 'pressure-1', label: 'Pressure zone', kind: 'pressure' }, labels: [], emphasisTargets: ['Pressure zone'] } },
    { type: 'text_card', version: 'internal-visual-v1', spec: { primaryText: 'Title', secondaryText: null, emphasis: 'primary', layout: 'centered' } },
    { type: 'timeline_or_statistic', version: 'internal-visual-v1', spec: { title: 'Timeline', values: [{ label: 'A', value: '1' }], labels: [], emphasisTarget: null } },
    { type: 'chart_or_screenshot', version: 'internal-visual-v1', spec: { intent: 'Chart', labels: [], dataReferences: ['fact-1'] } },
  ]) assert.ok(validateInternalVisualSpecification(value));
});

for (const [name, value] of [
  ['unknown type', { ...map, type: 'unknown' }], ['blank focus', { ...map, spec: { ...map.spec, focus: ' ' } }], ['invalid viewport', { ...map, spec: { ...map.spec, viewport: { framing: 'planet', geometryStatus: 'unavailable' } } }], ['invalid zone', { ...map, spec: { ...map.spec, zones: [{ id: 'zone', label: 'Zone', kind: 'planet', geometryStatus: 'unavailable', emphasis: 'primary' }] } }], ['out-of-range marker', { ...map, spec: { ...map.spec, markers: [{ latitude: 91, longitude: 20 }] } }], ['one-point route', { ...map, spec: { ...map.spec, routes: [{ points: [{ latitude: 10, longitude: 20 }] }] } }], ['non-finite coordinate', { ...map, spec: { ...map.spec, markers: [{ latitude: Number.NaN, longitude: 20 }] } }], ['invalid flow entity count', { type: 'flow_or_corridor', version: 'internal-visual-v1', spec: { direction: 'forward', lanes: [], laneConfiguration: [], movingEntities: [], entityConfiguration: [{ id: 'entity', kind: 'generic', count: 0 }], compression: 'none', progression: 'steady', pressureZone: null, pressureZoneDetails: null, labels: [], emphasisTargets: [] } }], ['empty text', { type: 'text_card', version: 'internal-visual-v1', spec: { primaryText: '', secondaryText: null, emphasis: 'primary', layout: 'centered' } }],
]) test(`rejects ${name}`, () => assert.throws(() => validateInternalVisualSpecification(value)));

test('normalizes legacy sparse map and flow snapshots without fabricating geometry', () => {
  const sparseMap = validateInternalVisualSpecification({ type: 'map', version: 'internal-visual-v1', spec: { focus: 'Named focus', highlightedRegions: [], markers: [], routes: [], labels: [] } });
  assert.deepEqual(sparseMap.spec.viewport, { framing: 'auto', geometryStatus: 'unavailable' });
  assert.deepEqual(sparseMap.spec.zones, []);
  const sparseFlow = validateInternalVisualSpecification({ type: 'flow_or_corridor', version: 'internal-visual-v1', spec: { direction: 'forward', lanes: [], movingEntities: [], pressureZone: null, labels: [] } });
  assert.deepEqual(sparseFlow.spec.laneConfiguration, []);
  assert.equal(sparseFlow.spec.compression, 'none');
});
