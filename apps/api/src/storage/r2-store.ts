import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { R2Config } from "../config";
import type { ObjectStore, StoredObject } from "./object-store";

export interface ObjectCommandClient {
  send(command: PutObjectCommand): Promise<unknown>;
}

export class R2ObjectStore implements ObjectStore {
  constructor(
    private readonly client: ObjectCommandClient,
    private readonly bucket: string,
  ) {}

  async put(object: StoredObject): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: object.key,
        Body: object.body,
        ContentType: object.contentType,
      }),
    );
  }
}

export function createR2ObjectStore(config: R2Config): R2ObjectStore {
  return new R2ObjectStore(
    new S3Client({
      region: "auto",
      endpoint: config.endpoint,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    }),
    config.bucket,
  );
}
