// Simple storage interface for the card lookup API
// Since this is a stateless API that fetches from Scryfall,
// no persistent storage is needed

export interface IStorage {
  // This API doesn't require storage operations
  // All data is fetched directly from Scryfall API
}

export class MemStorage implements IStorage {
  constructor() {
    // No storage needed for this stateless API
  }
}

export const storage = new MemStorage();
