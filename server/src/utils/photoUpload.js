import { supabase, STORAGE_BUCKET } from "./supabaseClient.js";
import { randomUUID } from "crypto";

// Uploads a single file buffer to Supabase Storage and returns its
// public URL. `folder` lets us separate complaint photos from
// resolution photos within the same bucket.
export async function uploadPhoto(file, folder = "complaints") {
  if (!file) return null;

  const ext = file.originalname.split(".").pop();
  const fileName = `${folder}/${randomUUID()}.${ext}`;

  const { error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(fileName, file.buffer, {
      contentType: file.mimetype,
      upsert: false,
    });

  if (error) {
    throw new Error(`Photo upload failed: ${error.message}`);
  }

  const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(fileName);
  return data.publicUrl;
}
