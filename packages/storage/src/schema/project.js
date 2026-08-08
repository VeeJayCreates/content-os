"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.projects = void 0;
const sqlite_core_1 = require("drizzle-orm/sqlite-core");
exports.projects = (0, sqlite_core_1.sqliteTable)('projects', {
    id: (0, sqlite_core_1.text)('id').primaryKey(),
    name: (0, sqlite_core_1.text)('name').notNull(),
    description: (0, sqlite_core_1.text)('description'),
    contentType: (0, sqlite_core_1.text)('content_type').notNull(),
    status: (0, sqlite_core_1.text)('status').notNull(),
    createdAt: (0, sqlite_core_1.text)('created_at').notNull(),
    updatedAt: (0, sqlite_core_1.text)('updated_at').notNull(),
});
