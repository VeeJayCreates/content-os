import { db } from '../db';
import { projects } from '../schema/project';

export class ProjectRepository {
  getDb() {
    return db;
  }

  table() {
    return projects;
  }
}
