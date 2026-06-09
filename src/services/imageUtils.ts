/**
 * Resizes and compresses a base64 image to speed up processing.
 * @param base64Str The original base64 image string.
 * @param maxWidth The maximum width of the resized image.
 * @param maxHeight The maximum height of the resized image.
 * @param quality The quality of the compressed image (0 to 1).
 * @returns A promise that resolves to the optimized base64 image string.
 */
export async function optimizeImage(
  base64Str: string,
  maxWidth: number = 1600,
  maxHeight: number = 1600,
  quality: number = 0.8
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.src = base64Str;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;

      // Calculate new dimensions
      if (width > height) {
        if (width > maxWidth) {
          height *= maxWidth / width;
          width = maxWidth;
        }
      } else {
        if (height > maxHeight) {
          width *= maxHeight / height;
          height = maxHeight;
        }
      }

      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Could not get canvas context'));
        return;
      }

      // Draw and compress
      ctx.drawImage(img, 0, 0, width, height);
      const optimizedBase64 = canvas.toDataURL('image/jpeg', quality);
      resolve(optimizedBase64);
    };
    img.onerror = (err) => reject(err);
  });
}
