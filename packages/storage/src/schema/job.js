"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.jobs = void 0;
const sqlite_core_1 = require("drizzle-orm/sqlite-core");
exports.jobs = (0, sqlite_core_1.sqliteTable)('jobs', {
    id: (0, sqlite_core_1.text)('id').primaryKey(),
    workflowId: (0, sqlite_core_1.text)('workflow_id').notNull(),
    type: (0, sqlite_core_1.text)('type').notNull(),
    status: (0, sqlite_core_1.text)('status').notNull(),
    retries: (0, sqlite_core_1.integer)('retries').default(0).notNull(),
    cost: (0, sqlite_core_1.real)('cost'),
});
