"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProjectRepository = void 0;
const node_crypto_1 = require("node:crypto");
const drizzle_orm_1 = require("drizzle-orm");
const db_1 = require("../db");
const project_1 = require("../schema/project");
class ProjectRepository {
    async findAll() {
        return db_1.db.select().from(project_1.projects);
    }
    async findById(id) {
        const rows = await db_1.db
            .select()
            .from(project_1.projects)
            .where((0, drizzle_orm_1.eq)(project_1.projects.id, id));
        return rows[0];
    }
    async create(data) {
        const now = new Date().toISOString();
        const project = {
            id: (0, node_crypto_1.randomUUID)(),
            createdAt: now,
            updatedAt: now,
            ...data,
        };
        await db_1.db.insert(project_1.projects).values(project);
        return project;
    }
    async delete(id) {
        await db_1.db.delete(project_1.projects).where((0, drizzle_orm_1.eq)(project_1.projects.id, id));
    }
}
exports.ProjectRepository = ProjectRepository;
