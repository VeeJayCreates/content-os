import { classifyYouTubeSearchFailure } from './youtube-research-search.provider';

describe('classifyYouTubeSearchFailure', () => {
  it('classifies Windows socket permission denial without exposing provider output', () => {
    expect(classifyYouTubeSearchFailure(new Error('HTTPSConnection failed: [WinError 10013] access permissions')))
      .toBe('local_network_permission_denied');
  });

  it('classifies executable, timeout, and generic transport failures conservatively', () => {
    expect(classifyYouTubeSearchFailure({ code: 'ENOENT' })).toBe('executable_unavailable');
    expect(classifyYouTubeSearchFailure({ code: 'ETIMEDOUT' })).toBe('timeout');
    expect(classifyYouTubeSearchFailure(new Error('connection failed'))).toBe('transport_unavailable');
  });
});
