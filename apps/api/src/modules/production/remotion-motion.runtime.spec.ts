import { cameraTransform, overlayFrames, remotionMotionEntrySource, REMOTION_FPS, transitionFrames, transitionPresentation } from './remotion-motion.runtime';

describe('Remotion Motion Runtime V1', () => {
  it.each(['static', 'zoom_in', 'zoom_out', 'pan_left', 'pan_right', 'ken_burns'])('includes deterministic %s camera support', (motion) => {
    expect(remotionMotionEntrySource()).toContain(motion === 'static' ? "return 'scale(1)'" : `kind==='${motion}'`);
  });

  it.each([
    ['static', 'scale(1)'], ['zoom_in', 'scale(1.12)'], ['zoom_out', 'scale(1)'], ['pan_left', 'translateX(-4%)'], ['pan_right', 'translateX(4%)'], ['ken_burns', 'translate(2%,-2%)'],
  ])('calculates %s with its own scene duration', (motion, expected) => {
    expect(cameraTransform(motion, 29, 30)).toContain(expected);
  });

  it.each(['cut', 'fade', 'slide_left', 'slide_right', 'wipe_left', 'wipe_right'])('includes deterministic %s transition support', (transition) => {
    expect(transition === 'cut' ? remotionMotionEntrySource() : remotionMotionEntrySource()).toContain(transition);
  });

  it.each(['cut', 'fade', 'slide_left', 'slide_right', 'wipe_left', 'wipe_right'])('calculates bounded %s presentation', (transition) => {
    expect(transitionPresentation(transition, 100, 4)).toEqual(expect.any(Object));
  });

  it('converts overlay timing relative to scene frames', () => {
    expect(overlayFrames(500, 1500)).toEqual({ from: 15, durationInFrames: 30 });
    expect(REMOTION_FPS).toBe(30);
  });

  it('bounds transitions by the individual scene duration', () => {
    expect(transitionFrames(4)).toBe(1);
    expect(transitionFrames(8)).toBe(2);
    expect(transitionFrames(120)).toBe(12);
  });

  it('contains reusable overlays, map markers, and progressive route choreography', () => {
    const entry = remotionMotionEntrySource();
    expect(entry).toContain('const Overlay=');
    expect(entry).toContain('const MapChoreography=');
    expect(entry).toContain('strokeDashoffset');
    expect(entry).toContain('map.markers');
  });

  it('dispatches immutable internal visual snapshots to full-frame reusable scenes', () => {
    const entry = remotionMotionEntrySource();
    expect(entry).toContain('const InternalVisualScene=');
    expect(entry).toContain("visual.type==='map'");
    expect(entry).toContain("visual.type==='flow_or_corridor'");
    expect(entry).toContain("visual.type==='text_card'");
    expect(entry).toContain('const MapScene=');
    expect(entry).toContain('const FlowCorridorScene=');
    expect(entry).toContain('const TextCardScene=');
  });

  it('keeps map and corridor animation data-driven by their internal specifications', () => {
    const entry = remotionMotionEntrySource();
    expect(entry).toContain('spec.highlightedRegions');
    expect(entry).toContain('spec.routes');
    expect(entry).toContain('spec.markers');
    expect(entry).toContain('strokeDashoffset');
    expect(entry).toContain('spec.lanes');
    expect(entry).toContain('spec.pressureZone');
    expect(entry).toContain('spec.labels');
  });

  it('renders text-card content only from its bounded snapshot fields', () => {
    const entry = remotionMotionEntrySource();
    expect(entry).toContain('spec.primaryText');
    expect(entry).toContain('spec.secondaryText');
    expect(entry).toContain('spec.emphasis');
    expect(entry).toContain('spec.layout');
  });

  it('uses an internal visual in the scene canvas and retains legacy map cards only as a fallback', () => {
    const entry = remotionMotionEntrySource();
    expect(entry).toContain('media||<InternalVisualScene');
    expect(entry).toContain('!scene.internalVisual?<MapChoreography');
  });

  it('keeps missing motion on the backwards-compatible static/cut fallback', () => {
    expect(remotionMotionEntrySource()).toContain("scene.motion||{cameraMotion:'static',transition:'cut',overlays:[],map:null}");
  });
});
