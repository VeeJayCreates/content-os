export type SarvamKeyState = 'eligible' | 'cooling_down' | 'disabled';
export type SarvamKeyLease = { alias: string; secret: string; attempt: number; rotated: boolean };
type Entry = { alias: string; secret: string; disabled: boolean; cooldownUntil: number };

export class SarvamKeyPool {
  private cursor = 0;
  private readonly entries: Entry[];
  constructor(keys: readonly string[], private readonly now: () => number = () => Date.now()) {
    const unique = [...new Set(keys.map((key) => key.trim()).filter(Boolean))];
    this.entries = unique.map((secret, index) => ({ alias: `sarvam-${String(index + 1).padStart(2, '0')}`, secret, disabled: false, cooldownUntil: 0 }));
  }
  lease(attempt: number, used = new Set<string>()): SarvamKeyLease | null {
    for (let offset = 0; offset < this.entries.length; offset += 1) {
      const index = (this.cursor + offset) % this.entries.length; const entry = this.entries[index];
      if (!used.has(entry.alias) && !entry.disabled && entry.cooldownUntil <= this.now()) { this.cursor = (index + 1) % this.entries.length; return { alias: entry.alias, secret: entry.secret, attempt, rotated: attempt > 1 }; }
    }
    return null;
  }
  cooldown(alias: string, ms: number) { const entry = this.entries.find((value) => value.alias === alias); if (entry) entry.cooldownUntil = Math.max(entry.cooldownUntil, this.now() + Math.max(0, ms)); }
  disable(alias: string) { const entry = this.entries.find((value) => value.alias === alias); if (entry) entry.disabled = true; }
  health(): Array<{ alias: string; state: SarvamKeyState }> { const at = this.now(); return this.entries.map((entry) => ({ alias: entry.alias, state: entry.disabled ? 'disabled' : entry.cooldownUntil > at ? 'cooling_down' : 'eligible' })); }
  get size() { return this.entries.length; }
}
