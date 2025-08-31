import { type S3Hierarchy, type TaskRun } from "@shared/schema";

// For this S3-based application, we don't need traditional database storage
// The S3Service handles all data persistence
export interface IStorage {
  // Placeholder for any cached data if needed
  getCachedHierarchy(): Promise<S3Hierarchy | undefined>;
  setCachedHierarchy(hierarchy: S3Hierarchy): Promise<void>;
}

export class MemStorage implements IStorage {
  private hierarchyCache: S3Hierarchy | undefined;

  async getCachedHierarchy(): Promise<S3Hierarchy | undefined> {
    return this.hierarchyCache;
  }

  async setCachedHierarchy(hierarchy: S3Hierarchy): Promise<void> {
    this.hierarchyCache = hierarchy;
  }
}

export const storage = new MemStorage();
