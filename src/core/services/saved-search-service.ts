import type { SavedSearch, SearchFilters } from '../models';
import type { SavedSearchPort } from '../ports';

export class SavedSearchService {
  constructor(private readonly port: SavedSearchPort) {}

  list(userId: string): Promise<SavedSearch[]> {
    return this.port.list(userId);
  }

  async save(userId: string, name: string, filters: SearchFilters): Promise<SavedSearch> {
    const trimmed = name.trim();
    if (trimmed === '') throw new Error('Name is required');
    return this.port.create(userId, trimmed, filters);
  }

  remove(id: string): Promise<void> {
    return this.port.remove(id);
  }

  async rename(id: string, name: string): Promise<SavedSearch> {
    const trimmed = name.trim();
    if (trimmed === '') throw new Error('Name is required');
    return this.port.rename(id, trimmed);
  }
}
