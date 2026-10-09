import multer from 'multer';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

//=============================================================== UPLOAD DE IMAGENS
// Mesmo esquema da sua API de imagens: o arquivo fica numa pasta do servidor
// (uploads/) e o banco guarda só o caminho. Diferenças: exige login (as rotas
// que usam isto), valida o TIPO REAL do arquivo e limita o tamanho.
//
// Pasta: backend/uploads (ou o que estiver em UPLOADS_DIR no .env).
// Em hospedagens com disco temporário (Render grátis, Heroku...) a pasta é
// apagada a cada deploy - lá use um disco persistente ou um serviço de
// armazenamento (S3, Cloudinary...). Só `saveAvatarFile`/`deleteAvatarFile`
// precisariam mudar.

const here = path.dirname(fileURLToPath(import.meta.url));
export const UPLOADS_DIR = process.env.UPLOADS_DIR ? path.resolve(process.env.UPLOADS_DIR) : path.resolve(here, '../../uploads');
export const AVATARS_DIR = path.join(UPLOADS_DIR, 'avatars');
export const AVATARS_URL_PREFIX = '/uploads/avatars/';

export const MAX_AVATAR_BYTES = 2 * 1024 * 1024; // o front já manda ~20-40 KB (256x256)

// Descobre o formato pelos primeiros bytes (o mimetype que o navegador manda é só um palpite)
export function detectImageExtension(buffer) {
  if (!buffer || buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpg';
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buffer.subarray(0, 4).toString('latin1') === 'RIFF' && buffer.subarray(8, 12).toString('latin1') === 'WEBP') return 'webp';
  return null;
}

// Guarda na memória, valida, e só então grava no disco
const parseSingleFile = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_AVATAR_BYTES, files: 1, fields: 5 },
}).single('file'); // campo "file", igual na sua API

export function receiveAvatar(req, res, next) {
  parseSingleFile(req, res, (error) => {
    if (!error) return next();
    if (error.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'A foto é grande demais (máximo 2 MB).' });
    if (error instanceof multer.MulterError) return res.status(400).json({ error: 'Envio inválido. Mande a foto no campo "file".' });
    next(error);
  });
}

// Grava e devolve o caminho público (ex: /uploads/avatars/<id>-<hora>-<aleatório>.jpg)
export async function saveAvatarFile(userId, buffer, extension) {
  await fs.mkdir(AVATARS_DIR, { recursive: true });
  const name = `${userId}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${extension}`;
  await fs.writeFile(path.join(AVATARS_DIR, name), buffer, { flag: 'wx' });
  return AVATARS_URL_PREFIX + name;
}

// Apaga um arquivo antigo. Só mexe em caminhos que o próprio servidor criou
// (ignora data URLs antigas, URLs externas e qualquer coisa fora da pasta).
export async function deleteAvatarFile(avatarUrl) {
  if (typeof avatarUrl !== 'string' || !avatarUrl.startsWith(AVATARS_URL_PREFIX)) return;
  const name = path.basename(avatarUrl);
  await fs.unlink(path.join(AVATARS_DIR, name)).catch((error) => {
    if (error.code !== 'ENOENT') console.error('Não foi possível apagar a foto antiga:', error);
  });
}
