import { PutObjectCommand } from "@aws-sdk/client-s3";
import { describe, expect, it } from "vitest";
import { R2ObjectStore, type ObjectCommandClient } from "./r2-store";

describe("R2ObjectStore", () => {
  it("puts the object in the configured bucket", async () => {
    const sent: PutObjectCommand[] = [];
    const client: ObjectCommandClient = {
      async send(command) {
        sent.push(command);
        return {};
      },
    };
    const body = new Uint8Array([1, 2, 3]);
    await new R2ObjectStore(client, "rev-notes").put({
      key: "users/user_1/sources/src_1/notes.pdf",
      body,
      contentType: "application/pdf",
    });
    expect(sent).toHaveLength(1);
    expect(sent[0]?.input).toMatchObject({
      Bucket: "rev-notes",
      Key: "users/user_1/sources/src_1/notes.pdf",
      Body: body,
      ContentType: "application/pdf",
    });
  });
});
