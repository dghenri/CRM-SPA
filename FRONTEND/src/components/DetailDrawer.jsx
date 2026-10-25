import { Avatar, Button, Drawer, toast } from "@heroui/react";
import { Copy, Pencil, UserRound } from "lucide-react";

// Drawer lateral (direita) de "ficha completa" de uma pessoa: usado em Employees e Users.
// Mostra o que não cabe nas colunas da tabela. O conteúdo vem por `children`, montado com
// <DetailSection> e <DetailField>.
//
// Uso:
//   <DetailDrawer isOpen={open} onOpenChange={setOpen} person={user} avatarSrc={...} onEdit={() => ...}>
//     <DetailSection title="Contato">
//       <DetailField label="Email">{user.email}</DetailField>
//     </DetailSection>
//   </DetailDrawer>

/* ---------------------------- formatadores ---------------------------- */
// Datas "de calendário" (aniversário) vêm como meia-noite UTC: formata em UTC pra não voltar um dia no fuso do Brasil.
export function formatDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

// Instantes (criado em, último login) em horário local.
export function formatDateTime(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export function calcAge(value) {
  if (!value) return null;
  const birth = new Date(value);
  if (Number.isNaN(birth.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - birth.getUTCFullYear();
  const beforeBirthday =
    now.getMonth() < birth.getUTCMonth() ||
    (now.getMonth() === birth.getUTCMonth() && now.getDate() < birth.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age >= 0 ? age : null;
}

function getInitials(name) {
  if (!name) return "";
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("");
}

/* ---------------------------- blocos de layout ---------------------------- */
export function DetailSection({ title, children }) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{title}</h3>
      <div className="grid grid-cols-1 gap-x-6 gap-y-4 rounded-2xl border-2 border-border p-4 sm:grid-cols-2">
        {children}
      </div>
    </section>
  );
}

// `wide` ocupa a linha inteira (textos longos, listas de chips)
export function DetailField({ label, children, wide = false }) {
  const isEmpty = children === undefined || children === null || children === "" || children === false;
  return (
    <div className={`flex min-w-0 flex-col gap-1 ${wide ? "sm:col-span-2" : ""}`}>
      <span className="text-xs font-medium text-muted">{label}</span>
      <div className="wrap-break-word text-sm font-semibold text-foreground">
        {isEmpty ? <span className="text-muted">—</span> : children}
      </div>
    </div>
  );
}

/* ---------------------------- drawer ---------------------------- */
export default function DetailDrawer({
  isOpen,
  onOpenChange,
  person,
  avatarSrc,
  onEdit,
  editLabel = "Edit",
  children,
}) {
  const handleCopyId = async () => {
    if (!person?.id) return;
    try {
      await navigator.clipboard.writeText(String(person.id));
      toast.success("ID copiado");
    } catch (error) {
      console.error("Erro ao copiar:", error);
      toast.danger("Não foi possível copiar o ID.");
    }
  };

  return (
    <Drawer isOpen={isOpen} onOpenChange={onOpenChange}>
      <Drawer.Backdrop variant="blur">
        <Drawer.Content placement="right">
          <Drawer.Dialog className="w-full max-w-[92vw] border-l-6 border-border sm:w-130">
            <Drawer.CloseTrigger />

            {/* HEADER */}
            <Drawer.Header className="flex-row items-center gap-4 pr-8">
              <Avatar size="lg">
                {avatarSrc && <Avatar.Image alt={person?.name || ""} src={avatarSrc} />}
                <Avatar.Fallback>{getInitials(person?.name) || <UserRound className="size-6" />}</Avatar.Fallback>
              </Avatar>

              <div className="flex min-w-0 flex-col items-start">
                <Drawer.Heading className="truncate text-lg font-bold">{person?.name}</Drawer.Heading>
                <span className="max-w-full truncate text-xs font-medium text-muted">{person?.email}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onPress={handleCopyId}
                  className="-ml-2 mt-1 h-auto gap-1 px-2 py-0.5 text-xs font-semibold text-muted"
                >
                  #{person?.id}
                  <Copy className="size-3" />
                </Button>
              </div>
            </Drawer.Header>

            {/* BODY (rola sozinho) */}
            <Drawer.Body className="flex flex-col gap-6 py-4">{children}</Drawer.Body>

            {/* FOOTER */}
            <Drawer.Footer>
              <Button slot="close" variant="tertiary" className="p-6">
                Close
              </Button>
              {onEdit && (
                <Button onPress={onEdit} className="gap-2 p-6">
                  <Pencil className="size-4" />
                  {editLabel}
                </Button>
              )}
            </Drawer.Footer>
          </Drawer.Dialog>
        </Drawer.Content>
      </Drawer.Backdrop>
    </Drawer>
  );
}
