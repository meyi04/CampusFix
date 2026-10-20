export const FIRESTORE_PHOTO_CHUNK_BYTES = 450 * 1024;

export function encodePhotoBytes(bytes: Uint8Array): string[] {
  const chunks: string[] = [];

  for (let offset = 0; offset < bytes.length; offset += FIRESTORE_PHOTO_CHUNK_BYTES) {
    const chunk = bytes.subarray(offset, offset + FIRESTORE_PHOTO_CHUNK_BYTES);
    let binary = '';
    for (let index = 0; index < chunk.length; index += 0x8000) {
      binary += String.fromCharCode(...chunk.subarray(index, index + 0x8000));
    }
    chunks.push(btoa(binary));
  }

  return chunks;
}

export function createPhotoDataUrl(contentType: string, chunks: string[]): string {
  return `data:${contentType};base64,${chunks.join('')}`;
}
