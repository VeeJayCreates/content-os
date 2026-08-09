import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: [
    './src/schema/project.ts',
    './src/schema/content.ts',
    './src/schema/research-source.ts',
    './src/schema/signal.ts',
    './src/schema/job.ts',
    './src/schema/workflow.ts',
  ],
  out: './migrations',
  dialect: 'sqlite',
  dbCredentials: {
    url: process.env.DATABASE_URL || 'content-os.db',
  },
});
