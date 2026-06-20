import { createClient } from "@supabase/supabase-js";
import { config } from "../config.js";
import { StorageError } from "../errors.js";
import { logProcessFailed, logProcessFinished, logProcessStarted } from "../logger.js";

const client = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

export class SupabaseStorage {
  async upload({ bucket, path, content, contentType }) {
    logProcessStarted("Supabase storage upload", {
      bucket,
      path,
      content_type: contentType,
      bytes: content.byteLength,
    });
    const body = content.buffer.slice(
      content.byteOffset,
      content.byteOffset + content.byteLength,
    );
    const { error } = await client.storage.from(bucket).upload(path, body, {
      contentType,
      cacheControl: "0",
      upsert: false,
    });
    if (error) {
      logProcessFailed("Supabase storage upload", error, { bucket, path });
      throw new StorageError(undefined, { cause: error });
    }
    logProcessFinished("Supabase storage upload", { bucket, path, bytes: content.byteLength });
  }

  async download({ bucket, path }) {
    logProcessStarted("Supabase storage download", { bucket, path });
    const { data, error } = await client.storage.from(bucket).download(path);
    if (error || !data) {
      logProcessFailed("Supabase storage download", error ?? new Error("Storage object missing."), {
        bucket,
        path,
      });
      throw new StorageError(undefined, { cause: error });
    }
    const buffer = Buffer.from(await data.arrayBuffer());
    logProcessFinished("Supabase storage download", { bucket, path, bytes: buffer.byteLength });
    return buffer;
  }

  async delete({ bucket, path }) {
    logProcessStarted("Supabase storage delete", { bucket, path });
    const { error } = await client.storage.from(bucket).remove([path]);
    if (error) {
      logProcessFailed("Supabase storage delete", error, { bucket, path });
      throw new StorageError(undefined, { cause: error });
    }
    logProcessFinished("Supabase storage delete", { bucket, path });
  }
}

export const storage = new SupabaseStorage();
