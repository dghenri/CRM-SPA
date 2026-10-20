// Limitador de tentativas por IP (janela fixa).
//  - Com REDIS_URL: o contador fica no Redis, compartilhado entre servidores e que sobrevive a reinícios.
//  - Sem REDIS_URL (ou sem o pacote "ioredis"): usa a memória do processo (serve para desenvolvimento).
// Se o Redis cair, a requisição passa pelo contador em memória em vez de travar o login/recuperação.
let redisPromise = null;

function getRedis() {
  if (!process.env.REDIS_URL) return null;
  if (!redisPromise) {
    redisPromise = import('ioredis')
      .then(({ default: Redis }) => {
        // O Upstash só aceita conexão criptografada: redis:// vira rediss:// automaticamente
        const url = process.env.REDIS_URL.replace(/^redis:\/\/([^/]*upstash\.io)/i, 'rediss://$1');
        const client = new Redis(url, { maxRetriesPerRequest: 1, enableOfflineQueue: false, connectTimeout: 5000 });
        let lastError = '';
        client.on('error', (error) => {
          if (error.message !== lastError) console.error('[redis]', error.message); // não repete a mesma mensagem
          lastError = error.message;
        });
        client.on('ready', () => { lastError = ''; console.log('[rateLimit] Redis conectado'); });
        console.log('[rateLimit] usando Redis');
        return client;
      })
      .catch(() => {
        console.warn('[rateLimit] REDIS_URL definido, mas o pacote "ioredis" não está instalado (npm i ioredis). Usando memória.');
        return null;
      });
  }
  return redisPromise;
}

// ---- fallback em memória ----
const memory = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of memory) if (entry.resetAt <= now) memory.delete(key);
}, 5 * 60 * 1000).unref();

function hitMemory(key, windowMs) {
  const now = Date.now();
  let entry = memory.get(key);
  if (!entry || entry.resetAt <= now) {
    entry = { count: 0, resetAt: now + windowMs };
    memory.set(key, entry);
  }
  entry.count += 1;
  return { count: entry.count, retryAfterMs: entry.resetAt - now };
}

async function hitRedis(redis, key, windowMs) {
  // cria a chave com validade só se ainda não existir, depois incrementa (funciona em qualquer versão do Redis)
  const results = await redis.multi().set(key, 0, 'PX', windowMs, 'NX').incr(key).pttl(key).exec();
  const count = Number(results?.[1]?.[1] ?? 1);
  const ttl = Number(results?.[2]?.[1] ?? windowMs);
  return { count, retryAfterMs: ttl > 0 ? ttl : windowMs };
}

export const rateLimit = ({ name, windowMs, max }) => async (req, res, next) => {
  const key = `rl:${name}:${req.ip}`;
  let result;
  try {
    const redis = await getRedis();
    // enquanto o Redis ainda está conectando (ou caiu), conta na memória em vez de falhar
    result = redis && redis.status === 'ready' ? await hitRedis(redis, key, windowMs) : hitMemory(key, windowMs);
  } catch (error) {
    console.error('[rateLimit] Redis indisponível, usando memória:', error.message);
    result = hitMemory(key, windowMs);
  }

  if (result.count > max) {
    res.set('Retry-After', String(Math.ceil(result.retryAfterMs / 1000)));
    return res.status(429).json({ error: 'Muitas tentativas. Aguarde alguns minutos e tente de novo.' });
  }
  next();
};
