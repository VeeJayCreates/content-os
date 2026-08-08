"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.workflows = void 0;
const sqlite_core_1 = require("drizzle-orm/sqlite-core");
exports.workflows = (0, sqlite_core_1.sqliteTable)('workflows', {
    id: (0, sqlite_core_1.text)('id').primaryKey(),
    projectId: (0, sqlite_core_1.text)('project_id').notNull(),
    status: (0, sqlite_core_1.text)('status').notNull(),
    createdAt: (0, sqlite_core_1.text)('created_at').notNull(),
});
