import { AiImageStyle } from '@shared/api';
import { Product } from '@shared/models';
import { environment } from '../../environments/environment';
import { HttpError } from './http';

/** Estilos de la IA de imágenes (los mismos que entiende el backend). */
export const AI_STYLES: { id: AiImageStyle; label: string; hint: string }[] = [
  { id: 'estudio', label: 'Fondo de estudio', hint: 'Fondo blanco limpio, como tienda en línea' },
  { id: 'ambiente', label: 'En ambiente', hint: 'El producto en un espacio real donde se usa' },
  { id: 'publicidad', label: 'Publicitaria', hint: 'Fondo llamativo para anuncios y estados' },
];

const VIDEO_MAX = 16 * 1024 * 1024;
const IMAGE_SIDE = 1600;

export const isVideo = (f: File) => f.type.startsWith('video/');

/** Reduce la foto (máx. 1600 px) y la pasa a JPG: carga rápido y cumple los límites de WhatsApp. */
async function toJpeg(file: File): Promise<Blob> {
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(file);
  } catch {
    throw new Error(`No se pudo leer "${file.name}". Usa fotos JPG o PNG.`);
  }
  const scale = Math.min(1, IMAGE_SIDE / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff'; // las PNG transparentes quedan sobre blanco
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  return new Promise((ok, fail) => canvas.toBlob((b) => (b ? ok(b) : fail(new Error('No se pudo procesar la foto'))), 'image/jpeg', 0.86));
}

async function post<T>(path: string, body: BodyInit, contentType: string): Promise<T> {
  const res = await fetch(environment.apiUrl + path, {
    method: 'POST', credentials: 'include', headers: { 'Content-Type': contentType, 'X-CRM-Request': '1' }, body,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new HttpError(res.status, json?.error ?? `Error ${res.status}`);
  return json as T;
}

const dataUrl = (b: Blob) => new Promise<string>((ok) => { const r = new FileReader(); r.onload = () => ok(r.result as string); r.readAsDataURL(b); });

/** Sube una foto o un video del catálogo y devuelve su URL pública. */
export async function uploadMedia(file: File): Promise<string> {
  if (isVideo(file)) {
    if (file.type !== 'video/mp4') throw new Error(`"${file.name}": el video debe ser MP4 (es el que acepta WhatsApp).`);
    if (file.size > VIDEO_MAX) throw new Error(`"${file.name}" pesa más de 16 MB, el límite de WhatsApp. Recórtalo o comprímelo.`);
  }
  const blob = isVideo(file) ? file : await toJpeg(file);
  if (environment.demo) return dataUrl(blob); // modo demostración: sin servidor
  return (await post<{ url: string }>('/api/media', blob, blob.type)).url;
}

/** Genera una foto nueva del producto con la IA de la plataforma, a partir de una foto ya subida. */
export async function generateAiImage(imageUrl: string, style: AiImageStyle, extra = ''): Promise<string> {
  return (await post<{ url: string }>('/api/media/generate', JSON.stringify({ imageUrl, style, extra: extra.trim() || undefined }), 'application/json')).url;
}

/**
 * Sube fotos y videos y los pone en el producto: la primera foto queda como principal (si no tenía),
 * las demás van a la galería y el video (MP4) queda como video del producto. Devuelve los errores.
 */
export async function addMediaToProduct(p: Product, files: File[], progress: (msg: string) => void): Promise<string[]> {
  const errors: string[] = [];
  for (const [i, f] of files.entries()) {
    progress(files.length > 1 ? `Subiendo ${i + 1} de ${files.length}…` : 'Subiendo…');
    try {
      const url = await uploadMedia(f);
      if (isVideo(f)) p.videoUrl = url;
      else if (!p.imageUrl) p.imageUrl = url;
      else p.gallery = [...(p.gallery ?? []), url];
    } catch (e) {
      errors.push((e as Error).message);
    }
  }
  return errors;
}
