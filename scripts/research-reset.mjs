import { copyFileSync, existsSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../packages/storage/package.json', import.meta.url));
const Database = require('better-sqlite3');
const args = new Set(process.argv.slice(2));
const databasePath = resolve(process.env.DATABASE_URL || 'apps/api/content-os.db');

if (!args.has('--confirm')) throw new Error('Refusing reset. Re-run with --confirm after stopping the local API.');
if (process.env.NODE_ENV === 'production') throw new Error('Refusing to reset when NODE_ENV=production.');
if (!existsSync(databasePath) || basename(databasePath) === ':memory:') throw new Error(`Refusing reset: local database was not found at ${databasePath}.`);

const backupPath = `${databasePath}.research-reset-${new Date().toISOString().replace(/[:.]/g, '-')}.bak`;
copyFileSync(databasePath, backupPath);
const db = new Database(databasePath);
const has = (name) => Boolean(db.prepare("select 1 from sqlite_master where type='table' and name=?").get(name));
const count = (name) => has(name) ? db.prepare(`select count(*) as count from \`${name}\``).get().count : 0;
const beforeSources = count('research_sources');
const generatedTables = [
  'research_fact_source_evidence', 'research_fact_evidence', 'research_facts', 'research_evidence_extractions',
  'research_packages', 'research_automation_runs', 'research_expansion_states', 'transcript_acquisition_jobs',
  'source_evidence_contents', 'source_transcripts', 'opportunity_topic_candidates', 'opportunity_signals',
  'topic_selections', 'topic_candidates', 'opportunities', 'signals',
];

db.pragma('foreign_keys = OFF');
const cleared = {};
const transaction = db.transaction(() => {
  for (const table of generatedTables) {
    if (!has(table)) continue;
    cleared[table] = count(table);
    db.prepare(`delete from \`${table}\``).run();
  }
});
transaction();
db.pragma('foreign_keys = ON');
const afterSources = count('research_sources');
db.close();
if (beforeSources !== afterSources) throw new Error('Research source preservation verification failed. Restore the backup immediately.');
console.log(JSON.stringify({ databasePath, backupPath, cleared, researchSources: { before: beforeSources, after: afterSources } }, null, 2));
