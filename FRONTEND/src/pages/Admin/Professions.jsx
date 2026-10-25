import { useEffect, useState } from "react";
import api from "../../api/api";

import {
  AlertDialog,
  Button,
  Chip,
  EmptyState,
  Input,
  Label,
  Modal,
  Separator,
  Spinner,
  Switch,
  Table,
  TextField,
  toast,
} from "@heroui/react";

import { Briefcase, Inbox, Pencil, Plus, Trash2 } from "lucide-react";

// Tela do Admin: cadastra as funções/profissões da clínica (Desenvolvedor, Suporte,
// Farmacêutica(o), Massoterapeuta...). Elas aparecem no cadastro do funcionário e
// definem quem pode solicitar movimentações de cada produto do estoque.
// Profissão em uso não pode ser excluída (o back-end responde 409): desative-a.
export default function Professions() {
  const [professions, setProfessions] = useState([]);
  const [loading, setLoading] = useState(true);

  // modal criar/renomear: null = fechado | {} = nova | profissão = renomear
  const [editing, setEditing] = useState(null);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  // exclusão
  const [deleting, setDeleting] = useState(null);

  async function load() {
    try {
      const data = await api.get("/professions?includeInactive=true");
      setProfessions(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error(error);
      toast.danger(error.message || "Não foi possível carregar as profissões.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const openCreate = () => {
    setName("");
    setEditing({});
  };

  const openEdit = (profession) => {
    setName(profession.name);
    setEditing(profession);
  };

  async function handleSave() {
    if (!name.trim()) {
      toast.danger("Informe o nome da profissão.");
      return;
    }
    setSaving(true);
    try {
      if (editing?.id) {
        await api.put(`/professions/${editing.id}`, { name });
        toast.success("Profissão atualizada.");
      } else {
        await api.post("/professions", { name });
        toast.success("Profissão criada.");
      }
      setEditing(null);
      load();
    } catch (error) {
      console.error(error);
      toast.danger(error.message || "Não foi possível salvar a profissão.");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(profession, active) {
    try {
      await api.put(`/professions/${profession.id}`, { active });
      toast.success(active ? "Profissão ativada." : "Profissão desativada.");
    } catch (error) {
      console.error(error);
      toast.danger(error.message || "Não foi possível alterar a profissão.");
    } finally {
      load();
    }
  }

  async function handleDelete() {
    if (!deleting) return;
    try {
      await api.delete(`/professions/${deleting.id}`);
      toast.success("Profissão removida.");
    } catch (error) {
      console.error(error);
      // 409 = em uso: a mensagem do back-end já orienta a desativar
      toast.danger(error.message || "Não foi possível excluir a profissão.");
    } finally {
      setDeleting(null);
      load();
    }
  }

  if (loading) {
    return <p className="py-10 text-center text-sm font-medium text-muted">Carregando profissões…</p>;
  }

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Profissões</h1>
          <p className="text-sm font-semibold text-muted">
            {professions.filter((p) => p.active).length} ativas · {professions.length} no total
          </p>
        </div>
        <Button onPress={openCreate} className="gap-2 p-6">
          <Plus className="size-4" />
          Nova profissão
        </Button>
      </div>

      <Table>
        <Table.ScrollContainer>
          <Table.Content aria-label="Profissões" className="min-w-150">
            <Table.Header>
              <Table.Column isRowHeader id="name">Profissão</Table.Column>
              <Table.Column id="status">Status</Table.Column>
              <Table.Column id="active">Ativa</Table.Column>
              <Table.Column className="text-end">Ações</Table.Column>
            </Table.Header>

            <Table.Body
              renderEmptyState={() => (
                <EmptyState className="flex h-full w-full flex-col items-center justify-center gap-4 py-8 text-center">
                  <Inbox className="size-6 text-muted" />
                  <span className="text-sm font-semibold text-muted">Nenhuma profissão cadastrada</span>
                </EmptyState>
              )}
            >
              {professions.map((profession) => (
                <Table.Row key={profession.id} id={profession.id}>
                  <Table.Cell>
                    <div className="flex items-center gap-2 font-semibold">
                      <Briefcase className="size-4 text-muted" />
                      {profession.name}
                    </div>
                  </Table.Cell>

                  <Table.Cell>
                    <Chip color={profession.active ? "success" : "default"} size="sm" variant="soft">
                      {profession.active ? "Ativa" : "Inativa"}
                    </Chip>
                  </Table.Cell>

                  <Table.Cell>
                    <Switch
                      aria-label={`Ativar ${profession.name}`}
                      isSelected={profession.active}
                      onChange={(active) => handleToggleActive(profession, active)}
                    >
                      <Switch.Content>
                        <Switch.Control>
                          <Switch.Thumb />
                        </Switch.Control>
                      </Switch.Content>
                    </Switch>
                  </Table.Cell>

                  <Table.Cell>
                    <div className="flex items-center justify-end gap-1">
                      <Button isIconOnly size="sm" variant="tertiary" aria-label="Renomear" onPress={() => openEdit(profession)}>
                        <Pencil className="size-5" />
                      </Button>
                      <Button isIconOnly size="sm" variant="danger-soft" aria-label="Excluir" onPress={() => setDeleting(profession)}>
                        <Trash2 className="size-5" />
                      </Button>
                    </div>
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Content>
        </Table.ScrollContainer>
      </Table>

      {/* Criar / renomear */}
      <Modal isOpen={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <Modal.Backdrop variant="opaque">
          <Modal.Container>
            <Modal.Dialog className="border-6 sm:max-w-130">
              <Modal.Header className="mb-4 flex-row items-center">
                <Modal.Icon className="size-15 bg-default text-foreground">
                  <Briefcase className="size-8" />
                </Modal.Icon>
                <Modal.Heading className="text-lg">
                  {editing?.id ? "Renomear profissão" : "Nova profissão"}
                </Modal.Heading>
              </Modal.Header>
              <Separator className="mb-4" />

              <Modal.Body className="p-4">
                <TextField fullWidth value={name} onChange={setName}>
                  <Label className="text-muted">Nome</Label>
                  <Input
                    className="border-2 border-border font-semibold"
                    placeholder="Ex: Esteticista"
                    onKeyDown={(e) => e.key === "Enter" && !saving && handleSave()}
                    autoFocus
                  />
                </TextField>
              </Modal.Body>

              <Modal.Footer>
                <Button variant="danger-soft" onPress={() => setEditing(null)} className="p-6" isDisabled={saving}>
                  Cancel
                </Button>
                <Button onPress={handleSave} isDisabled={saving} className="p-6">
                  {saving ? <Spinner color="current" className="size-5" /> : "Save"}
                </Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>

      {/* Excluir */}
      <AlertDialog isOpen={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialog.Backdrop variant="blur">
          <AlertDialog.Container>
            <AlertDialog.Dialog className="border-6 sm:max-w-115">
              <AlertDialog.Header className="items-center">
                <AlertDialog.Icon status="danger" className="size-15">
                  <Trash2 className="size-8" />
                </AlertDialog.Icon>
                <AlertDialog.Heading>Excluir profissão</AlertDialog.Heading>
              </AlertDialog.Header>
              <AlertDialog.Body>
                <p className="text-center text-sm font-semibold leading-5 text-muted">
                  Excluir <span className="font-bold">{deleting?.name}</span>?
                  <br />
                  Se algum funcionário ou produto usar essa profissão, a exclusão é bloqueada: nesse caso, desative-a.
                </p>
              </AlertDialog.Body>
              <AlertDialog.Footer>
                <Button slot="close" variant="tertiary" className="w-full">
                  Cancel
                </Button>
                <Button slot="close" variant="danger" className="w-full" onPress={handleDelete}>
                  Confirm
                </Button>
              </AlertDialog.Footer>
            </AlertDialog.Dialog>
          </AlertDialog.Container>
        </AlertDialog.Backdrop>
      </AlertDialog>
    </>
  );
}
