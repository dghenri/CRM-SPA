import { useEffect, useRef, useState } from "react";
import { Badge, Chip } from "@heroui/react";

/* ---------------------------------------------------------------------------
 * Progressive Profiling: quais dados o cliente ainda não preencheu.
 * Usado no Profile e no Account para mostrar o aviso "!" nos itens pendentes.
 * Para exigir mais um dado, é só incluir aqui.
 * ------------------------------------------------------------------------- */
export function getPendingFields(user) {
  if (!user) return { phone: false, birthdate: false, gender: false, photo: false, count: 0 };
  const pending = {
    phone: !String(user.phone ?? "").trim(),
    birthdate: !user.birthdate,
    gender: !user.gender,
    photo: !user.avatarUrl,
  };
  return { ...pending, count: Object.values(pending).filter(Boolean).length };
}

// Bolinha 100% redonda: largura = altura (o Badge sozinho estica conforme o conteúdo)
const BADGE_SIZE = { sm: "size-4 text-[10px]", md: "size-5 text-xs", lg: "size-6 text-sm" };
const BADGE_ROUND = "aspect-square min-h-0 min-w-0 justify-center rounded-full p-0 font-bold leading-none";

// classes da bolinha "!" (para usar direto num <Badge> quando ele já está dentro de um Badge.Anchor)
export const pendingBadgeClass = (size = "sm") => `${BADGE_ROUND} ${BADGE_SIZE[size] ?? BADGE_SIZE.sm}`;

// Bolinha de aviso "!" presa ao canto de um ícone/avatar:
//   <PendingAnchor show={pending.phone}><Phone /></PendingAnchor>
// Sem pendência, renderiza só o filho.
export function PendingAnchor({ show, children, size = "sm" }) {
  if (!show) return children;
  return (
    <Badge.Anchor>
      {children}
      <Badge color="warning" size={size} placement="top-right" aria-label="Pendente" className={pendingBadgeClass(size)}>
        !
      </Badge>
    </Badge.Anchor>
  );
}

// Selo "!" inline ao lado do rótulo de um campo ainda vazio
// (o Badge do HeroUI é posicionado em cima de outro elemento, por isso aqui é um Chip)
export function PendingMark() {
  return (
    <Chip size="sm" color="warning" variant="soft" aria-label="Pendente" className={`ml-1.5 size-4 text-[10px] ${BADGE_ROUND}`}>
      !
    </Chip>
  );
}

/* ---------------------------------------------------------------------------
 * Espera uma imagem terminar de carregar antes de montar a tela, para a foto
 * não "aparecer depois" (nem o aviso de foto pendente piscar à toa).
 *   const ready = useImageReady(assetUrl(user?.avatarUrl), { wait: !loading && !!user });
 * - `wait: false` (usuário ainda carregando) => ainda não está pronto.
 * - Sem imagem, ou erro ao carregar, ou passou do tempo limite (4 s) => pronto:
 *   a tela nunca fica presa por causa de uma foto.
 * - Só segura a PRIMEIRA montagem; trocar a foto depois não trava a tela de novo.
 * - Imagens que já carregaram uma vez voltam prontas na hora.
 * ------------------------------------------------------------------------- */
const loadedImages = new Set();

export function useImageReady(src, { wait = true, timeoutMs = 4000 } = {}) {
  const [settled, setSettled] = useState(null); // última `src` que terminou (ou falhou)
  const everReady = useRef(false);

  useEffect(() => {
    if (!wait || !src || loadedImages.has(src)) return;
    let cancelled = false;
    const img = new Image();
    const finish = (ok) => {
      if (ok) loadedImages.add(src);
      if (!cancelled) setSettled(src);
    };
    img.onload = () => finish(true);
    img.onerror = () => finish(false);
    img.src = src;
    const timer = setTimeout(() => finish(false), timeoutMs);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      img.onload = img.onerror = null;
    };
  }, [src, wait, timeoutMs]);

  const ready = wait && (!src || loadedImages.has(src) || settled === src);
  if (ready) everReady.current = true;
  return ready || everReady.current;
}
