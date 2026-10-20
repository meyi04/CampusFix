import { describe, expect, test } from 'vitest';
import { Buffer } from 'node:buffer';
import { createPhotoDataUrl, encodePhotoBytes, FIRESTORE_PHOTO_CHUNK_BYTES } from '@/utils/firestorePhotos';
import { validatePhotos } from '@/services/reports';

describe('Firestore photo encoding', () => {
  test('splits images below the Firestore document limit and preserves bytes', () => {
    const input = Buffer.alloc(FIRESTORE_PHOTO_CHUNK_BYTES + 37);
    for (let index = 0; index < input.length; index += 1) input[index] = index % 256;
    const chunks = encodePhotoBytes(input);
    const output = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk, 'base64')));

    expect(chunks).toHaveLength(2);
    expect(chunks[0].length).toBeLessThanOrEqual(614400);
    expect(output.equals(input)).toBe(true);
  });

  test('reconstructs a displayable data URL from ordered chunks', () => {
    const bytes = Uint8Array.from([0, 65, 255, 16]);
    const chunks = encodePhotoBytes(bytes);

    expect(createPhotoDataUrl('image/png', chunks)).toBe(`data:image/png;base64,${btoa(String.fromCharCode(...bytes))}`);
  });

  test('enforces the combined Firestore attachment size limit', () => {
    const createFile = (name: string, size: number) => {
      const file = new File([], name, { type: 'image/png' });
      Object.defineProperty(file, 'size', { value: size });
      return file;
    };

    expect(() => validatePhotos([
      createFile('first.png', 5 * 1024 * 1024),
      createFile('second.png', 1024 * 1024),
    ])).not.toThrow();
    expect(() => validatePhotos([
      createFile('first.png', 5 * 1024 * 1024),
      createFile('second.png', 1024 * 1024 + 1),
    ])).toThrow('The combined photo size cannot exceed 6 MB');
  });
});
