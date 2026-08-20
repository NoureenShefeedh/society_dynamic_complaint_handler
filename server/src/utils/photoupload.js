import { supabase, STORAGE_BUCKET } from "./supabaseClient.js";
import { randomUUID } from "crypto";

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