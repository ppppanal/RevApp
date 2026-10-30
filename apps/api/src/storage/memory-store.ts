import type { ObjectStore, StoredObject } from "./object-store";

export class MemoryObjectStore implements ObjectStore {
  readonly objects = new Map<string, StoredObject>();

  async put(object: StoredObject): Promise<void> {
    this.objects.set(object.key, object);
  }
}
