import { NewProject, Project } from '../schema/project';
export declare class ProjectRepository {
    findAll(): Promise<Project[]>;
    findById(id: string): Promise<Project | undefined>;
    create(data: Omit<NewProject, 'id' | 'createdAt' | 'updatedAt'>): Promise<Project>;
    delete(id: string): Promise<void>;
}
//# sourceMappingURL=project.repository.d.ts.map