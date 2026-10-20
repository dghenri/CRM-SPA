import { useEffect, useRef, useState } from "react";
import { Avatar, Badge, Button, Description, Modal, toast } from "@heroui/react";
import { Camera, Trash2, ZoomIn, ZoomOut } from "lucide-react";
import { assetUrl } from "../api/api";
import { useAuth } from "../context/AuthContext";

/* ---------------------------------------------------------------------------
 * Foto de perfil com recorte (mesmo comportamento da tela Conta do cliente).
 * Escolher arquivo -> recortar/dar zoom -> o JPEG 512x512 é entregue a `onSave`.
 *
 * Props:
 *   name       nome (iniciais quando não há foto)
 *   avatarUrl  caminho salvo no servidor (passa por assetUrl)
 *   onSave     async (blob) => void   envia o JPEG recortado
 *   onRemove   async () => void       remove a foto (omita para esconder o botão)
 * ------------------------------------------------------------------------- */

const AVATAR_SIZE = 512;
const AVATAR_MAX_BYTES = 1_500_000; // o servidor aceita até 2 MB
const CROP_ZOOM_MAX = 4;

const getInitials = (name = "") =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase())
    .join("");

const USER_STATUS_COLOR = {
  Active: "success",
  Inactive: "danger",
  OnLeave: "warning",
};

function getStatusColor(status) {
  return USER_STATUS_COLOR[status] ?? "default";
}


async function fileToBitmap(file) {
  if (!file.type.startsWith("image/")) throw new Error("Escolha um arquivo de imagem.");
  if (file.size > 15 * 1024 * 1024) throw new Error("A imagem é muito grande (máximo 15 MB).");
  try {
    // "from-image" respeita a rotação gravada pela câmera do celular
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("Não foi possível ler essa imagem. Tente outra (JPG ou PNG).");
  }
}

// crop = { x, y, size }: quadrado em pixels da imagem ORIGINAL
async function bitmapToAvatarBlob(bitmap, crop) {
  const size = Math.max(1, Math.min(crop.size, bitmap.width, bitmap.height));
  const x = Math.min(Math.max(0, crop.x), bitmap.width - size);
  const y = Math.min(Math.max(0, crop.y), bitmap.height - size);

  const canvas = document.createElement("canvas");
  canvas.width = AVATAR_SIZE;
  canvas.height = AVATAR_SIZE;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff"; // PNG com transparência vira fundo branco no JPEG
  ctx.fillRect(0, 0, AVATAR_SIZE, AVATAR_SIZE);
  ctx.drawImage(bitmap, x, y, size, size, 0, 0, AVATAR_SIZE, AVATAR_SIZE);

  for (const quality of [0.85, 0.7, 0.55]) {
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (blob && blob.size <= AVATAR_MAX_BYTES) return blob;
  }
  throw new Error("Não foi possível reduzir essa foto. Tente outra.");
}

// Área de recorte quadrada: arraste a foto e use o zoom (roda do mouse também).
// A moldura circular mostra como ela aparece no perfil.
function AvatarCropper({ bitmap, busy, onCancel, onApply }) {
  const [view] = useState(() => Math.max(200, Math.min(320, window.innerWidth - 96)));
  const baseScale = view / Math.min(bitmap.width, bitmap.height); // zoom 1 = a foto cobre a área
  const [zoom, setZoom] = useState(1);
  const scale = baseScale * zoom;
  const [offset, setOffset] = useState(() => ({
    x: (view - bitmap.width * baseScale) / 2,
    y: (view - bitmap.height * baseScale) / 2,
  }));
  const canvasRef = useRef(null);
  const drag = useRef(null);

  // mantém a foto sempre cobrindo toda a área (sem "buracos" nas bordas)
  const clamp = (x, y, s) => ({
    x: Math.min(0, Math.max(view - bitmap.width * s, x)),
    y: Math.min(0, Math.max(view - bitmap.height * s, y)),
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = view * dpr;
    canvas.height = view * dpr;
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, view, view);
    ctx.drawImage(bitmap, offset.x, offset.y, bitmap.width * scale, bitmap.height * scale);
  }, [bitmap, offset, scale, view]);

  // dá zoom mantendo o centro da área no mesmo ponto da foto
  const changeZoom = (next) => {
    const z = Math.min(CROP_ZOOM_MAX, Math.max(1, next));
    const s2 = baseScale * z;
    const cx = (view / 2 - offset.x) / scale;
    const cy = (view / 2 - offset.y) / scale;
    setOffset(clamp(view / 2 - cx * s2, view / 2 - cy * s2, s2));
    setZoom(z);
  };

  const onPointerDown = (e) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { px: e.clientX, py: e.clientY, ox: offset.x, oy: offset.y };
  };
  const onPointerMove = (e) => {
    const d = drag.current;
    if (!d) return;
    setOffset(clamp(d.ox + e.clientX - d.px, d.oy + e.clientY - d.py, scale));
  };
  const endDrag = () => {
    drag.current = null;
  };

  return (
    <div className="grid w-full justify-items-center gap-4">
      <div
        className="relative touch-none cursor-grab overflow-hidden rounded-2xl active:cursor-grabbing"
        style={{ width: view, height: view }}
      >
        <canvas
          ref={canvasRef}
          style={{ width: view, height: view }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          aria-label="Arraste para posicionar a foto"
        />
        {/* moldura circular: escurece o que fica fora do que aparecerá no perfil */}
        <div className="pointer-events-none absolute inset-0 rounded-full shadow-[0_0_0_9999px_rgba(0,0,0,0.55)] ring-2 ring-white/80" />
      </div>

      <div className="flex w-full max-w-xs items-center gap-3">
        <ZoomOut size={18} className="shrink-0 text-muted" />
        <input
          type="range"
          min={1}
          max={CROP_ZOOM_MAX}
          step={0.01}
          value={zoom}
          onChange={(e) => changeZoom(Number(e.target.value))}
          aria-label="Zoom"
          className="w-full accent-accent"
        />
        <ZoomIn size={18} className="shrink-0 text-muted" />
      </div>

      <p className="text-center text-sm text-muted">Arraste a foto para posicionar e use o zoom para ajustar o tamanho.</p>

      <div className="flex w-full justify-between gap-2">
        <Button variant="tertiary" isDisabled={busy} onPress={onCancel} className="flex-1">
          Cancelar
        </Button>
        <Button
          isPending={busy}
          onPress={() => onApply({ x: -offset.x / scale, y: -offset.y / scale, size: view / scale })}
          className="flex-1"
        >
          Salvar foto
        </Button>
      </div>
    </div>
  );
}

export default function AvatarUploader({ name, avatarUrl, onSave, onRemove }) {
  const inputRef = useRef(null);
  const bitmapRef = useRef(null);
  const [bitmap, setBitmap] = useState(null); // imagem escolhida, aguardando o recorte
  const [reading, setReading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState(false);
  const { user } = useAuth();

  const closeCrop = () => {
    bitmapRef.current?.close?.();
    bitmapRef.current = null;
    setBitmap(null);
  };
  // ao sair da tela, libera a imagem decodificada
  useEffect(() => () => bitmapRef.current?.close?.(), []);

  const pickFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = ""; // permite escolher o mesmo arquivo de novo
    if (!file) return;
    setReading(true);
    try {
      const decoded = await fileToBitmap(file);
      bitmapRef.current?.close?.();
      bitmapRef.current = decoded;
      setBitmap(decoded);
    } catch (err) {
      toast(err.message, { variant: "danger" });
    } finally {
      setReading(false);
    }
  };

  const applyCrop = async (crop) => {
    setBusy(true);
    try {
      const blob = await bitmapToAvatarBlob(bitmap, crop);
      await onSave(blob);
      closeCrop();
    } catch (err) {
      toast(err.message || "Não foi possível salvar a foto.", { variant: "danger" });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setRemoving(true);
    try {
      await onRemove();
    } catch (err) {
      toast(err.message || "Não foi possível remover a foto.", { variant: "danger" });
    } finally {
      setRemoving(false);
    }
  };

  return (
    <>
      <div className="flex items-center gap-4">
        <Badge.Anchor>
          <Avatar className="size-20 rounded-full text-2xl">
            <Avatar.Image src={assetUrl(avatarUrl)} alt="Foto de perfil" />
            <Avatar.Fallback>{getInitials(name)}</Avatar.Fallback>
          </Avatar>
          <Badge color={getStatusColor(user?.status)} placement="bottom-right" size="sm" />
        </Badge.Anchor>

        <div className="flex flex-col flex-wrap gap-2">
          <div className="flex gap-4">
            <Button size="sm" isPending={reading} onPress={() => inputRef.current?.click()}>
              <Camera size={16} />
              {avatarUrl ? "Trocar foto" : "Escolher foto"}
            </Button>
            {avatarUrl && onRemove && (
              <Button variant="danger-soft" size="sm" isPending={removing} onPress={remove}>
                <Trash2 size={16} />
                Remover
              </Button>
            )}
          </div>
          <Description>
            Tamanho do aquivo deve ser até 2MB
          </Description>
        </div>

        <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={pickFile} aria-label="Escolher foto" />
      </div>

      <Modal>
        <Modal.Backdrop isOpen={!!bitmap} onOpenChange={(open) => !open && !busy && closeCrop()}>
          <Modal.Container>
            <Modal.Dialog className="sm:max-w-md">
              <Modal.Header>
                <Modal.Heading>Ajustar foto</Modal.Heading>
              </Modal.Header>
              <Modal.Body>
                {bitmap && <AvatarCropper bitmap={bitmap} busy={busy} onCancel={closeCrop} onApply={applyCrop} />}
              </Modal.Body>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>
    </>
  );
}
