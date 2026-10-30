export interface StoredObject {
  key: string;
  body: Uint8Array;
  contentType: string;
}

export interface ObjectStore {
  put(object: StoredObject): Promise<void>;
}
