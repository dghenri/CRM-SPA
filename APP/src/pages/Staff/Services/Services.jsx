import { useState, useEffect } from "react";
import { fetchServices, createService, updateService, deleteService } from "../../../api/services";
import api from "../../../api/api";

import {
  Card, Chip, Button, Modal, TextField, Label, Input, TextArea,
  Switch, Select, ListBox, toast, AlertDialog, 

} from "@heroui/react";

import { 
  Clock, Tag, Pencil, Trash2, Plus, EyeOff, Check, CloudAlert, IdCardLanyard, Package
} from "lucide-react";

function formatPrice(value) {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

const UNIT_LABEL = { Un: "un", Ml: "ml", G: "g" };

/* ---------- receita (insumos do procedimento) ----------
 * Chamadas à API usadas só aqui. Se preferir, mova para ../../../api/services
 * junto com as outras (fetchServices, createService...). Assumem que `api`
 * devolve o corpo da resposta, como no GET /staff abaixo.
 */
const fetchRecipe = (serviceId) => api.get(`/services/${serviceId}/recipe`);
const saveRecipe = (serviceId, items) => api.put(`/services/${serviceId}/recipe`, { items });
const fetchRecipeSummary = () => api.get("/admin/recipes/summary");
const fetchProducts = () => api.get("/products");

// chave só para o React identificar a linha (sem a API de UUID do navegador, que
// não existe em http fora de localhost)
let recipeRowSeq = 0;
const newRecipeRow = (productId = "", quantity = "") => ({ key: `recipe-${++recipeRowSeq}`, productId, quantity });

// linhas do formulário -> itens da API (ignora linha totalmente vazia)
const recipeRowsToItems = (rows) =>
  rows
    .filter((r) => r.productId || String(r.quantity).trim() !== "")
    .map((r) => ({ productId: r.productId, quantity: Number(r.quantity) }));

function RecipeEditor({ rows, setRows, products, status }) {
  const byId = new Map(products.map((p) => [p.id, p]));
  const options = products.filter((p) => p.active);
  const usedIds = rows.map((r) => r.productId).filter(Boolean);

  const setRow = (key, patch) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  // custo estimado por sessão (só conta insumos com custo conhecido)
  let cost = 0;
  let missingCost = 0;
  for (const r of rows) {
    const p = byId.get(r.productId);
    const qty = Number(r.quantity);
    if (!p || !(qty > 0)) continue;
    if (p.lastCost == null) missingCost += 1;
    else cost += qty * p.lastCost;
  }

  return (
    <div className="mb-4 flex flex-col gap-3">
      <div>
        <Label className="block">Insumos do procedimento (opcional)</Label>
        <p className="text-xs font-semibold text-muted">
          Quanto de cada produto é usado por sessão. O estoque baixa sozinho quando o atendimento é concluído.
        </p>
      </div>

      {status === "loading" && <p className="text-sm font-semibold text-muted">Carregando insumos…</p>}
      {status === "error" && (
        <p className="text-sm font-semibold text-danger">
          Não foi possível carregar os insumos. Salvar o procedimento não altera a receita atual.
        </p>
      )}

      {status === "ready" && (
        <>
          {rows.map((row) => {
            const product = byId.get(row.productId);
            const qty = Number(row.quantity);
            const short = product && qty > 0 && product.currentStock < qty;
            return (
              <div key={row.key} className="flex flex-col gap-1">
                <div className="flex items-start gap-2">
                  <Select
                    aria-label="Produto"
                    placeholder="Selecione o produto"
                    className="flex-1"
                    value={row.productId || null}
                    onChange={(key) => setRow(row.key, { productId: key ?? "" })}
                    disabledKeys={usedIds.filter((id) => id !== row.productId)}
                  >
                    <Select.Trigger className="border border-border font-medium">
                      <Select.Value />
                      <Select.Indicator />
                    </Select.Trigger>
                    <Select.Popover className="font-semibold">
                      <ListBox>
                        {options.map((p) => (
                          <ListBox.Item key={p.id} id={p.id} textValue={p.name}>
                            {p.name} ({UNIT_LABEL[p.unit]})
                            <ListBox.ItemIndicator />
                          </ListBox.Item>
                        ))}
                      </ListBox>
                    </Select.Popover>
                  </Select>

                  <TextField
                    aria-label="Quantidade por sessão"
                    className="w-28"
                    value={row.quantity}
                    onChange={(v) => setRow(row.key, { quantity: v })}
                  >
                    <Input type="number" min="0" step="any" placeholder="Qtd." className="border border-border font-medium" />
                  </TextField>
                  <span className="w-7 pt-2.5 text-sm font-semibold text-muted">{product ? UNIT_LABEL[product.unit] : ""}</span>

                  <Button
                    isIconOnly
                    size="sm"
                    variant="danger-soft"
                    className="mt-1 rounded-full"
                    aria-label="Remover insumo"
                    onPress={() => setRows((rs) => rs.filter((r) => r.key !== row.key))}
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
                {product && (
                  <p className={`text-xs font-semibold ${short ? "text-danger" : "text-muted"}`}>
                    Saldo em estoque: {product.currentStock.toLocaleString("pt-BR")} {UNIT_LABEL[product.unit]}
                    {short && " (insuficiente para uma sessão)"}
                  </p>
                )}
              </div>
            );
          })}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button size="sm" variant="tertiary" onPress={() => setRows((rs) => [...rs, newRecipeRow()])}>
              <Plus size={14} />
              Adicionar insumo
            </Button>
            {rows.length > 0 && (
              <p className="text-xs font-semibold text-muted">
                Custo estimado por sessão: <span className="text-foreground">{formatPrice(cost)}</span>
                {missingCost > 0 && ` (${missingCost} sem custo cadastrado)`}
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function ServiceFormModal({ isOpen, onOpenChange, initial, staff, products, onSave }) {
  const EMPTY_SERVICE_FORM = {
    title: "",
    description: "",
    duration: "",
    price: "",
    image: "",
    available: true,
    professionalId: "",
  };
  const [form, setForm] = useState(EMPTY_SERVICE_FORM);
  const [error, setError] = useState("");
  const [recipeRows, setRecipeRows] = useState([]);
  const [recipeStatus, setRecipeStatus] = useState("ready"); // loading | ready | error
  const [recipeInitialKey, setRecipeInitialKey] = useState("[]"); // para só salvar se mudou

  // carrega a receita atual ao abrir um procedimento existente
  useEffect(() => {
    if (!isOpen) return;
    if (!initial) {
      setRecipeRows([]);
      setRecipeStatus("ready");
      setRecipeInitialKey("[]");
      return;
    }
    let cancelled = false;
    setRecipeRows([]);
    setRecipeStatus("loading");
    fetchRecipe(initial.id)
      .then((data) => {
        if (cancelled) return;
        const rows = data.items.map((i) => newRecipeRow(i.productId, String(i.quantity)));
        setRecipeRows(rows);
        setRecipeInitialKey(JSON.stringify(recipeRowsToItems(rows)));
        setRecipeStatus("ready");
      })
      .catch((err) => {
        console.error("Falha ao carregar receita:", err);
        if (!cancelled) setRecipeStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, initial]);

  useEffect(() => {
    if (isOpen) {
      setForm(
        initial
          ? {
              title: initial.title,
              description: initial.description,
              duration: String(initial.duration),
              price: String(initial.price),
              image: initial.image,
              available: initial.available,
              professionalId: initial.professionalId ?? initial.professional?.id ?? "",
            }
          : EMPTY_SERVICE_FORM
      );
      setError("");
    }
  }, [isOpen, initial]);

  const handleSubmit = (close) => {
    if (!form.title.trim() || !form.description.trim() || !form.duration || !form.price) {
      setError("Preencha todos os campos obrigatórios.");
      return;
    }
    // receita: valida e só envia se foi carregada e mudou (null = não mexe)
    let recipeItems = null;
    if (recipeStatus === "ready") {
      const items = recipeRowsToItems(recipeRows);
      if (items.some((i) => !i.productId)) {
        setError("Escolha o produto de cada insumo.");
        return;
      }
      if (items.some((i) => !(i.quantity > 0))) {
        setError("Informe a quantidade de cada insumo (maior que zero).");
        return;
      }
      if (new Set(items.map((i) => i.productId)).size !== items.length) {
        setError("Há um insumo repetido na receita.");
        return;
      }
      if (JSON.stringify(items) !== recipeInitialKey) recipeItems = items;
    }

    onSave({
      title: form.title.trim(),
      description: form.description.trim(),
      duration: Number(form.duration),
      price: Number(form.price),
      image:
        form.image.trim() ||
        `https://picsum.photos/seed/${encodeURIComponent(form.title)}/600/450`,
      available: form.available,
      professionalId: form.professionalId || null,
    }, recipeItems);
    close();
  };

  return (
    <Modal>
      <Modal.Backdrop isOpen={isOpen} onOpenChange={onOpenChange}>
        <Modal.Container placement="center" size="lg" scroll="inside">
          <Modal.Dialog>
            {({ close }) => (
              <>
                <Modal.Header className="mb-8">
                  <Modal.Heading className="text-xl">{initial ? "Editar procedimento" : "Novo procedimento"}</Modal.Heading>
                </Modal.Header>

                <Modal.Body className="gap-4">
                  <TextField
                    isRequired
                    value={form.title}
                    onChange={(v) => setForm({ ...form, title: v })}
                  >
                    <Label>Título</Label>
                    <Input placeholder="Ex: Massagem Relaxante Premium" className="border border-border mb-4 font-medium" />
                  </TextField>

                  <TextField
                    isRequired
                    value={form.description}
                    onChange={(v) => setForm({ ...form, description: v })}
                  >
                    <Label>Descrição</Label>
                    <TextArea
                      rows={3}
                      placeholder="Adicione uma descrição do procedimento..."
                      className="font-medium mb-4 border border-border"
                    />
                  </TextField>

                  <div className="flex gap-3">
                    <TextField
                      isRequired
                      className="flex-1 mb-4"
                      value={form.duration}
                      onChange={(v) => setForm({ ...form, duration: v })}
                    >
                      <Label>Duração (min)</Label>
                      <Input 
                        type="number" 
                        min="0" placeholder="60 minutos" 
                        className="border border-border font-medium" />
                    </TextField>

                    <TextField
                      isRequired
                      className="flex-1 mb-4"
                      value={form.price}
                      onChange={(v) => setForm({ ...form, price: v })}
                    >
                      <Label>Preço (R$)</Label>
                      <Input
                        type="number" 
                        min="0" step="0.01" 
                        placeholder="180,00" 
                        className="border border-border font-medium" />
                    </TextField>
                  </div>

                  <TextField
                    value={form.image}
                    onChange={(v) => setForm({ ...form, image: v })}
                    className="mb-4"
                  >
                    <Label>URL da imagem (opcional)</Label>
                    <Input placeholder="https://... " className="border border-border font-medium" />
                  </TextField>

                  <div className="mb-4">
                    <Label className="mb-1 block">Profissional responsável (opcional)</Label>
                    <Select
                      aria-label="Profissional responsável"
                      placeholder="Selecione um profissional"
                      className="w-full"
                      selectedKey={form.professionalId || null}
                      onSelectionChange={(key) => setForm({ ...form, professionalId: key ?? "" })}
                    >
                      <Select.Trigger className="border border-border font-medium">
                        <Select.Value />
                        <Select.Indicator />
                      </Select.Trigger>
                      <Select.Popover className="font-semibold">
                        <ListBox>
                          {staff.map((s) => (
                            <ListBox.Item key={s.id} id={s.id} textValue={s.name}>
                              {s.name}
                              <ListBox.ItemIndicator />
                            </ListBox.Item>
                          ))}
                        </ListBox>
                      </Select.Popover>
                    </Select>
                  </div>
                  <RecipeEditor rows={recipeRows} setRows={setRecipeRows} products={products} status={recipeStatus} />
                  {error && <p className="text-sm text-danger">{error}</p>}
                </Modal.Body>

                <Modal.Footer className="justify-between">
                  <div>
                    <Switch
                      isSelected={form.available}
                      onChange={(v) => setForm({ ...form, available: v })}
                      className="flex"
                    >
                      <Switch.Content>
                        <Switch.Control>
                          <Switch.Thumb />
                        </Switch.Control>
                        <Label>{form.available ? "Ativo" : "Oculto"}</Label>
                      </Switch.Content>
                    </Switch>
                  </div>
                  
                  <div className="gap-2">
                    <Button variant="secondary" slot="close" className="mr-2">
                      Cancelar
                    </Button>

                    <Button variant="primary" onPress={() => handleSubmit(close)}>
                      Salvar procedimento
                    </Button>
                  </div>
                  
                </Modal.Footer>
              </>
            )}
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}

function ServiceCard({ service, recipe, onEdit, onDelete, onToggle }) {
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [selectedService, setSelectedService] = useState(null);

  /* Delete employee dialog */
  const handleDelet = (service) => {
    setSelectedService(service);
    setIsDeleteOpen(true);
  };

  return (
    <>
      <Card className="bg-background drop-shadow-md rounded-4xl p-2.5">
        <Card.Content className="">
          <div className="relative">
            <img
              src={service.image}
              alt={service.title}
              className={`w-full aspect-3.5/4 rounded-3xl object-cover ${
                !service.available ? "grayscale opacity-60" : ""
              }`}
            />
            {!service.available && (
              <Chip
                size="md"
                className="absolute left-3 top-3 bg-black/70 text-white"
              >
                <EyeOff size={12} />
                Indisponível
              </Chip>
            )}
          </div>
        </Card.Content>

        <Card.Footer className="flex-col items-start gap-4 px-4 pb-4 pt-3">
          <div>
            <h3 className="font-serif text-base font-bold leading-tight text-foreground">
              {service.title}
            </h3>
            <p className="mt-1 line-clamp-2 text-sm text-muted font-semibold">
              {service.description}
            </p>
            {service.professional?.name && (
              <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-muted">
                <IdCardLanyard size={12} />
                {service.professional.name}
              </p>
            )}
          </div>

          <div className="flex gap-4">
            <p size="sm" variant="soft" color="success" className="text-sm font-semibold">
              {formatPrice(service.price)}
            </p>
            <Chip size="sm" variant="soft" color="accent">
              <Clock size={13} />
              {service.duration} min
            </Chip>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Chip size="sm" variant="soft" color={recipe?.items ? "default" : "warning"}>
              <Package size={13} />
              {recipe?.items ? `${recipe.items} insumo${recipe.items > 1 ? "s" : ""}` : "Sem insumos"}
            </Chip>
            {recipe?.cost != null && (
              <span
                className="text-xs font-semibold text-muted"
                title={recipe.costComplete ? "Custo estimado dos insumos por sessão" : "Custo parcial: há insumos sem custo cadastrado"}
              >
                Custo {formatPrice(recipe.cost)}
                {!recipe.costComplete && "*"}
              </span>
            )}
          </div>

          <div className="flex w-full items-center gap-2 pt-1">
            <Button
              size="sm"
              variant="tertiary"
              className={`flex-1 justify-center gap-2 rounded-full font-semibold ${
                service.available
                  ? "bg-success/10 text-success hover:bg-success/20"
                  : "bg-default-100 text-default-500"
              }`}
              onPress={() => onToggle(service.id)}
            >
              {service.available ? <Check size={14} /> : <EyeOff size={14} />}
              {service.available ? "Ativo" : "Oculto"}
            </Button>
            <Button
              isIconOnly
              size="sm"
              variant="tertiary"
              className="rounded-full"
              aria-label="Editar"
              onPress={() => onEdit(service)}
            >
              <Pencil size={16} />
            </Button>
            <Button
              isIconOnly
              size="sm"
              variant="danger"
              className="rounded-full"
              aria-label="Excluir"
              onPress={() => handleDelet(service)}
            >
              <Trash2 size={16} />
            </Button>
          </div>
        </Card.Footer>
      </Card>

      {/* Delete service dialog */}
      <AlertDialog isOpen={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <AlertDialog.Backdrop variant="blur">
          <AlertDialog.Container>
            <AlertDialog.Dialog className="sm:max-w-115 border-6">
              <AlertDialog.Header className="items-center">
                <AlertDialog.Icon status="danger" className="size-15">
                  <Trash2 className="size-8" />
                </AlertDialog.Icon>
                <AlertDialog.Heading>Deletar procedimento</AlertDialog.Heading>
              </AlertDialog.Header>
              <AlertDialog.Body>
                <p className="text-sm leading-5 text-muted font-semibold text-center">
                  Tem certeza que deseja deletar o procedimento <span className="font-bold"><br/>{selectedService?.title}</span>?
                  <br/>
                  <span className="text-danger leading-12">Isso não pode ser desfeito.</span>
                </p>
              </AlertDialog.Body>
              <AlertDialog.Footer>
                <Button slot="close" variant="tertiary" className="w-full">
                  Cancel
                </Button>
                <Button
                  slot="close"
                  variant="danger"
                  className="w-full"
                  onPress={() => onDelete(service.id)}
                >
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


export default function AdminServicesPage() {
  const [services, setServices] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [editingService, setEditingService] = useState(null);
  const [isOpen, setIsOpen] = useState(false);
  const [staff, setStaff] = useState([]);
  const [products, setProducts] = useState([]);
  const [recipeSummary, setRecipeSummary] = useState({});

  // Produtos do estoque (seletor de insumos) e resumo das receitas (card de cada procedimento)
  const refreshRecipeSummary = () =>
    fetchRecipeSummary()
      .then(setRecipeSummary)
      .catch((err) => console.error("Falha ao carregar receitas:", err));

  useEffect(() => {
    let cancelled = false;
    fetchProducts()
      .then((data) => {
        if (!cancelled) setProducts(data);
      })
      .catch((err) => console.error("Falha ao carregar produtos:", err));
    refreshRecipeSummary();
    return () => {
      cancelled = true;
    };
  }, []);

  // Carrega a lista de profissionais pro seletor "Profissional responsável"
  useEffect(() => {
    let cancelled = false;
    api
      .get("/staff")
      .then((data) => {
        if (!cancelled) setStaff(data);
      })
      .catch((err) => console.error("Falha ao carregar equipe:", err));
    return () => {
      cancelled = true;
    };
  }, []);

  // Carrega os procedimento do backend ao montar a página.
  useEffect(() => {
    let cancelled = false;

    fetchServices()
      .then((data) => {
        if (!cancelled) setServices(data);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err.message || "Erro ao carregar procedimentos.");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const openNew = () => {
    setEditingService(null);
    setIsOpen(true);
  };

  const openEdit = (service) => {
    setEditingService(service);
    setIsOpen(true);
  };

  const handleSave = async (data, recipeItems) => {
    let saved;
    try {
      if (editingService) {
        saved = await updateService(editingService.id, data);
        setServices((prev) => prev.map((s) => (s.id === saved.id ? saved : s)));
      } else {
        saved = await createService(data);
        setServices((prev) => [...prev, saved]);
      }
    } catch (err) {
      toast(err.message || "Erro ao salvar procedimento", { variant: "danger" });
      return;
    }

    // recipeItems === null: a receita não mudou (ou não carregou), então não mexe nela
    if (recipeItems) {
      try {
        await saveRecipe(saved.id, recipeItems);
        await refreshRecipeSummary();
      } catch (err) {
        toast(`Procedimento salvo, mas os insumos não: ${err.message || "erro desconhecido"}`, { variant: "danger" });
        return;
      }
    }

    toast(editingService ? "Procedimento atualizado" : "Procedimento criado", { variant: "success" });
  };

  const handleDelete = async (id) => {
    const previous = services;
    setServices((prev) => prev.filter((s) => s.id !== id)); // otimista
    try {
      await deleteService(id);
      toast.danger("Procedimento removido");
    } catch (err) {
      setServices(previous); // desfaz se a API falhar
      toast(err.message || "Erro ao remover procedimento", { variant: "danger" });
    }
  };

  const handleToggle = async (id) => {
    const target = services.find((s) => s.id === id);
    if (!target) return;

    const previous = services;
    setServices((prev) =>
      prev.map((s) => (s.id === id ? { ...s, available: !s.available } : s))
    ); // otimista

    try {
      await updateService(id, { available: !target.available });
    } catch (err) {
      setServices(previous); // desfaz se a API falhar
      toast(err.message || "Erro ao atualizar procedimento", { variant: "danger" });
    }
  };

  return (
    <section className="w-full p-2">
      {loadError && (
        <p className="flex mb-4 text-sm text-danger font-semibold gap-2">
          {console.log(loadError)} <CloudAlert /> Verifique se o backend está rodando.
        </p>
      )}

      {isLoading ? (
        <div className="flex mt-100 items-center justify-center gap-2">
          <p className="text-sm text-muted font-semibold">Carregando...</p>
        </div>
      ) : (
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <button
          onClick={openNew}
          className="flex min-h-70 flex-col items-center justify-center gap-2 rounded-3xl border-2 border-dashed border-default-200 text-default-500 transition hover:border-primary hover:text-primary"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-default-100">
            <Plus size={22} />
          </div>
          <span className="text-sm font-semibold">Adicionar serviço</span>
        </button>
        {services.map((service) => (
          <ServiceCard
            key={service.id}
            service={service}
            recipe={recipeSummary[service.id]}
            onEdit={openEdit}
            onDelete={handleDelete}
            onToggle={handleToggle}
          />
        ))}

      </div>
      )}

      <ServiceFormModal
        isOpen={isOpen}
        onOpenChange={setIsOpen}
        initial={editingService}
        staff={staff}
        products={products}
        onSave={handleSave}
      />
    </section>
  );
}
