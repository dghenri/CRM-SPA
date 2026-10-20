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
// Onde a foto fica:
//  - COM as variáveis CLOUDINARY_* no .env -> no Cloudinary (produção / Render grátis,
//    onde o disco é apagado a cada deploy). O banco guarda a URL completa (https://res.cloudinary.com/...).
//  - SEM elas -> na pasta backend/uploads (ou UPLOADS_DIR), como antes (desenvolvimento).
//    O banco guarda o caminho (/uploads/avatars/...).
// Só `saveAvatarFile`/`deleteAvatarFile` sabem disso: as rotas não mudam.
//
// Variáveis: CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET
// (ou só CLOUDINARY_URL=cloudinary://chave:segredo@nome). Pacote: npm i cloudinary

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

//------------------------------------------------------------- CLOUDINARY
const CLOUDINARY_FOLDER = 'viva-bem-spa/avatars';
const CLOUDINARY_HOST = 'https://res.cloudinary.com/';

const cloudinaryConfigured = () =>
  Boolean(process.env.CLOUDINARY_URL || (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET));

let cloudinaryPromise = null;
function getCloudinary() {
  if (!cloudinaryPromise) {
    cloudinaryPromise = import('cloudinary').then(({ v2 }) => {
      // com CLOUDINARY_URL o SDK já se configura sozinho; senão usa as três variáveis
      if (!process.env.CLOUDINARY_URL) {
        v2.config({
          cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
          api_key: process.env.CLOUDINARY_API_KEY,
          api_secret: process.env.CLOUDINARY_API_SECRET,
          secure: true,
        });
      }
      return v2;
    });
  }
  return cloudinaryPromise;
}

// https://res.cloudinary.com/<nome>/image/upload/v123/viva-bem-spa/avatars/abc.jpg
//   -> "viva-bem-spa/avatars/abc"  (o que o Cloudinary pede para apagar)
export function cloudinaryPublicId(url) {
  if (typeof url !== 'string' || !url.startsWith(CLOUDINARY_HOST)) return null;
  const afterUpload = url.split('/upload/')[1];
  if (!afterUpload) return null;
  const withoutVersion = afterUpload.split('?')[0].replace(/^v\d+\//, '');
  const publicId = withoutVersion.replace(/\.[a-z0-9]+$/i, '');
  // só apaga o que está na NOSSA pasta de avatares (nunca outra coisa da conta)
  return publicId.startsWith(CLOUDINARY_FOLDER + '/') ? publicId : null;
}

async function saveToCloudinary(userId, buffer) {
  const cloudinary = await getCloudinary();
  const publicId = `${userId}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  const result = await new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: CLOUDINARY_FOLDER, public_id: publicId, resource_type: 'image', overwrite: false },
      (error, uploaded) => (error ? reject(error) : resolve(uploaded)),
    );
    stream.end(buffer);
  });
  return result.secure_url;
}

// Grava e devolve o endereço da foto:
//  - Cloudinary: URL completa (https://res.cloudinary.com/...)
//  - disco: caminho público (ex: /uploads/avatars/<id>-<hora>-<aleatório>.jpg)
export async function saveAvatarFile(userId, buffer, extension) {
  if (cloudinaryConfigured()) return saveToCloudinary(userId, buffer);

  await fs.mkdir(AVATARS_DIR, { recursive: true });
  const name = `${userId}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${extension}`;
  await fs.writeFile(path.join(AVATARS_DIR, name), buffer, { flag: 'wx' });
  return AVATARS_URL_PREFIX + name;
}

// Apaga uma foto antiga. Só mexe no que o próprio servidor criou: arquivos da pasta
// de avatares ou fotos da pasta de avatares no Cloudinary (ignora data URLs antigas,
// URLs externas e qualquer outra coisa).
export async function deleteAvatarFile(avatarUrl) {
  const publicId = cloudinaryPublicId(avatarUrl);
  if (publicId) {
    if (!cloudinaryConfigured()) return;
    try {
      const cloudinary = await getCloudinary();
      await cloudinary.uploader.destroy(publicId, { resource_type: 'image', invalidate: true });
    } catch (error) {
      console.error('Não foi possível apagar a foto antiga no Cloudinary:', error);
    }
    return;
  }

  if (typeof avatarUrl !== 'string' || !avatarUrl.startsWith(AVATARS_URL_PREFIX)) return;
  const name = path.basename(avatarUrl);
  await fs.unlink(path.join(AVATARS_DIR, name)).catch((error) => {
    if (error.code !== 'ENOENT') console.error('Não foi possível apagar a foto antiga:', error);
  });
}
