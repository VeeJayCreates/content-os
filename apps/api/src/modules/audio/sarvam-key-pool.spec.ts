import { SarvamKeyPool } from './sarvam-key-pool';
describe('SarvamKeyPool', () => {
  it('normalizes duplicates, aliases deterministically, rotates and recovers cooldown keys', () => { let now = 1; const pool = new SarvamKeyPool([' one ', 'two', 'one'], () => now); expect(pool.health()).toEqual([{ alias: 'sarvam-01', state: 'eligible' }, { alias: 'sarvam-02', state: 'eligible' }]); expect(pool.lease(1)?.alias).toBe('sarvam-01'); expect(pool.lease(1)?.alias).toBe('sarvam-02'); pool.cooldown('sarvam-01', 10); expect(pool.health()[0].state).toBe('cooling_down'); now = 11; expect(pool.health()[0].state).toBe('eligible'); });
  it('disables authentication-failed aliases and returns no lease when unavailable', () => { const pool = new SarvamKeyPool(['a']); pool.disable('sarvam-01'); expect(pool.lease(1)).toBeNull(); expect(pool.health()).toEqual([{ alias: 'sarvam-01', state: 'disabled' }]); });
});
