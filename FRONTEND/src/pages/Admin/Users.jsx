import { useMemo, useState, useEffect } from "react";
import api, { assetUrl } from '../../api/api';
import DetailDrawer, {
  DetailField,
  DetailSection,
  calcAge,
  formatDate,
  formatDateTime,
} from "../../components/DetailDrawer";
import { parseDate } from "@internationalized/date";

import {
  Avatar,
  Button,
  Checkbox,
  Chip,
  Table,
  Modal,
  Label,
  Input,
  InputGroup,
  TextField,
  Separator,
  ToggleButton,
  DateField,
  Description,
  FieldError,
  ListBox,
  Select,
  EmptyState,
  AlertDialog,
  Tag,
  TagGroup,
  Toast,
  toast,
  Spinner,
} from "@heroui/react";

import {
  Copy,
  Eye,
  EyeOff,
  Pencil,
  Trash2,
  Rocket,
  UserRound,
  SquareArrowOutUpRight as BlankIcon,
  Inbox,
  Plus,
  Users,
  UserCheck,
  Venus,
  Mars,
  CircleDashed,

} from "lucide-react";

// User (cliente) não tem "status" nem "role" no schema - só gender.
// Reaproveita as mesmas cores do Chip pra dar uma pista visual por gênero.
const genderColorMap = {
  Male: "info",
  Female: "danger",
  Other: "warning",
  PreferNotToSay: "default",
};

function formatLabel(text) {
  if (!text) return "";
  return text.replace(/([a-z])([A-Z])/g, "$1 $2");
}

// 12345678900 -> 123.456.789-00 (se não tiver 11 dígitos, mostra como veio)
function formatCpf(cpf) {
  if (!cpf) return null;
  const digits = String(cpf).replace(/\D/g, "");
  return digits.length === 11 ? digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4") : String(cpf);
}

// preferências de notificação do cliente (User.notificationPrefs)
const NOTIFICATION_LABELS = {
  sessionReminders: "Lembretes de sessão",
  promotions: "Promoções",
  news: "Novidades",
  viaEmail: "E-mail",
  viaWhatsapp: "WhatsApp",
};

export default function Customers() {
  const [isVisible, setIsVisible] = useState(true);
  const [isCreateVisible, setIsCreateVisible] = useState(true);
  const [selectedKeys, setSelectedKeys] = useState(new Set());
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isViewOpen, setIsViewOpen] = useState(false); // drawer "ver detalhes" (ficha completa)
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [users, setUsers] = useState([]);
  const [sortDescriptor, setSortDescriptor] = useState({
    column: "name",
    direction: "ascending",
  });

  /* GET customers */
  async function getUsers() {
    try {
      const data = await api.get('/users');
      setUsers(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error(error);
      setUsers([]);
    }
  }

  /* DEL customer */
  async function delUsers(id) {
    try {
      await api.delete(`/users/${id}`);
    } catch (error) {
      console.error(error);
    }

    getUsers();
  }

  useEffect(() => {
    getUsers();
  }, []);

  /* Sort customers */
  const sortedUsers = useMemo(() => {
    return [...users].sort((a, b) => {
      const col = sortDescriptor.column;
      const first = String(a[col] ?? "");
      const second = String(b[col] ?? "");

      let cmp = first.localeCompare(second);

      if (sortDescriptor.direction === "descending") {
        cmp *= -1;
      }

      return cmp;
    });
  }, [users, sortDescriptor]);

  /* KPI counts - por gênero, já que User não tem "status" */
  const kpi = useMemo(() => {
    const total = users.length;
    const male = users.filter((u) => u.gender === "Male").length;
    const female = users.filter((u) => u.gender === "Female").length;
    // Other + PreferNotToSay + sem gênero informado (campo é opcional)
    const other = total - male - female;
    return { total, male, female, other };
  }, [users]);

  function getInitials(name) {
    if (!name) return "";
    return name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0].toUpperCase())
      .join("");
  }

  /* Copia o ID completo do cliente (usado na tabela e no modal de edição) */
  const handleCopyId = async (id) => {
    if (!id) return;

    try {
      await navigator.clipboard.writeText(String(id));
      toast.success("ID copiado");
    } catch (error) {
      console.error("Erro ao copiar:", error);
      toast.danger("Não foi possível copiar o ID.");
    }
  };

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    gender: "",
    phone: "",
    birthdate: null,
  });

  const [newUser, setNewUser] = useState({
    name: "",
    email: "",
    password: "",
    gender: "",
    phone: "",
    birthdate: null,
  });

  useEffect(() => {
    if (selectedUser) {
      setFormData({
        name: selectedUser.name || "",
        email: selectedUser.email || "",
        password: "",
        gender: selectedUser.gender || "",
        phone: selectedUser.phone || "",
        birthdate: selectedUser.birthdate
          ? parseDate(selectedUser.birthdate.split("T")[0])
          : null,
      });
    }
  }, [selectedUser]);

  const handleViewUser = (user) => {
    setSelectedUser(user);
    setIsViewOpen(true);
  };

  const handleEditUser = (user) => {
    setSelectedUser(user);
    setIsVisible(true);
    setIsEditOpen(true);
  };

  const handleNewUser = () => {
    setNewUser({
      name: "",
      email: "",
      password: "",
      gender: "",
      phone: "",
      birthdate: null,
    });
    setIsCreateVisible(true);
    setIsCreateOpen(true);
  };

  const handleInputChange = (field, value) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleNewUserChange = (field, value) => {
    setNewUser((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  /* UPDATE USER FUNCTION */
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    if (!selectedUser?.id) return;
    setIsSaving(true);

    try {
      const payload = {
        name: formData.name,
        email: formData.email,
        gender: formData.gender || undefined,
        phone: formData.phone,
        birthdate: formData.birthdate ? formData.birthdate.toString() : undefined,
      };

      if (formData.password) {
        payload.password = formData.password;
      }

      await api.put(`/users/${selectedUser.id}`, payload);

      toast.success("Cliente atualizado com sucesso!");
      setIsEditOpen(false);
      getUsers();
    } catch (error) {
      console.error(error);
      toast.danger(error.message || "Não foi possível salvar as alterações.");
    } finally {
      setIsSaving(false);
    }
  };

  /* CREATE USER FUNCTION */
  const [isCreating, setIsCreating] = useState(false);

  const handleCreateUser = async () => {
    if (!newUser.name || !newUser.email || !newUser.password || !newUser.birthdate) {
      toast.danger("Preencha nome, email, senha e data de nascimento.");
      return;
    }

    setIsCreating(true);

    try {
      const payload = {
        name: newUser.name,
        email: newUser.email,
        password: newUser.password,
        gender: newUser.gender || undefined,
        phone: newUser.phone,
        birthdate: newUser.birthdate.toString(),
      };

      await api.post("/users", payload);
      toast.success("Cliente criado com sucesso!");
      setIsCreateOpen(false);
      getUsers();
    } catch (error) {
      console.error(error);
      // Mostra a mensagem real vinda do backend (ex.: email duplicado)
      // em vez de um texto genérico
      toast.danger(error.message || "Não foi possível criar o cliente.");
    } finally {
      setIsCreating(false);
    }
  };

  /* Delete user modal */
  const handleDelet = (user) => {
    setSelectedUser(user);
    setIsDeleteOpen(true);
  };

  return (
    <>
      {/* KPI - Resumo de clientes */}
      <div className="flex items-center rounded-2xl border-6 border-border bg-overlay drop-shadow-md p-6 mb-6">
        <div className="flex flex-col gap-1 pr-6">
          <span className="text-sm font-medium text-muted">Total de clientes</span>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold">{kpi.total}</span>
            <Users className="size-5 text-muted" />
          </div>
        </div>

        <Separator orientation="vertical" className="h-fill w-0.5" />

        <div className="flex flex-col gap-1 px-6">
          <span className="text-sm font-medium text-muted">Masculino</span>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold">{kpi.male}</span>
            <Chip color="info" size="sm" variant="soft">
              <Mars className="size-3.5" />
              {kpi.total ? `${Math.round((kpi.male / kpi.total) * 100)}%` : "0%"}
            </Chip>
          </div>
        </div>

        <Separator orientation="vertical" className="h-fill w-0.5" />

        <div className="flex flex-col gap-1 px-6">
          <span className="text-sm font-medium text-muted">Feminino</span>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold">{kpi.female}</span>
            <Chip color="danger" size="sm" variant="soft">
              <Venus className="size-3.5" />
              {kpi.total ? `${Math.round((kpi.female / kpi.total) * 100)}%` : "0%"}
            </Chip>
          </div>
        </div>

        <Separator orientation="vertical" className="h-fill w-0.5" />

        <div className="flex flex-col gap-1 pl-6">
          <span className="text-sm font-medium text-muted">Outro / Não informado</span>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold">{kpi.other}</span>
            <Chip color="default" size="sm" variant="soft">
              <CircleDashed className="size-3.5" />
              {kpi.total ? `${Math.round((kpi.other / kpi.total) * 100)}%` : "0%"}
            </Chip>
          </div>
        </div>
      </div>

      {/* Ação - Novo cliente */}
      <div className="flex justify-end mb-0">
        <Button onPress={handleNewUser} className="bg-field-foreground text-background rounded-b-none gap-2 p-6">
          <Plus className="size-4 mt-2" />
          New User
        </Button>
      </div>

      <Table className="rounded-tr-none">
        <Table.ScrollContainer>
          <Table.Content
            aria-label="users"
            className="min-w-200"
            selectedKeys={selectedKeys}
            sortDescriptor={sortDescriptor}
            onSelectionChange={setSelectedKeys}
            onSortChange={setSortDescriptor}
          >
            <Table.Header>
              <Table.Column allowsSorting isRowHeader className="after:hidden" id="id">
                {({sortDirection}) => (
                  <Table.SortableColumnHeader sortDirection={sortDirection}>
                    User ID
                  </Table.SortableColumnHeader>
                )}
              </Table.Column>
              <Table.Column allowsSorting className="after:hidden" id="name">
                {({sortDirection}) => (
                  <Table.SortableColumnHeader sortDirection={sortDirection}>
                    Member
                  </Table.SortableColumnHeader>
                )}
              </Table.Column>
              <Table.Column allowsSorting id="phone">
                {({sortDirection}) => (
                  <Table.SortableColumnHeader sortDirection={sortDirection}>
                    Phone
                  </Table.SortableColumnHeader>
                )}
              </Table.Column>
              <Table.Column allowsSorting id="gender">
                {({sortDirection}) => (
                  <Table.SortableColumnHeader sortDirection={sortDirection}>
                    Gender
                  </Table.SortableColumnHeader>
                )}
              </Table.Column>
              <Table.Column className="text-end">Actions</Table.Column>
            </Table.Header>

            <Table.Body
             renderEmptyState={() => (
              <EmptyState className="flex h-full w-full flex-col items-center justify-center gap-4 text-center py-8">
                <Inbox className="size-6 text-muted" />
                <span className="text-sm font-semibold text-muted">No results found</span>
              </EmptyState>
              )}
            >
              {sortedUsers.map((user) => (
                <Table.Row key={user.id} id={user.id}>

                  {/* TABLE USER ID */}
                  <Table.Cell className="font-medium">
                    <div className="flex items-center gap-2">
                      #{user.id}{" "}
                      <Button
                       onPress={() => handleCopyId(user.id)}
                       isIconOnly
                       size="sm"
                       variant="ghost"
                       aria-label="Copy full ID"
                      >
                        <Copy className="size-4 text-muted" />
                      </Button>
                    </div>
                  </Table.Cell>

                  {/* TABLE USER NAME | EMAIL | AVATAR */}
                  <Table.Cell>
                    <div className="flex items-center gap-3">

                      <Avatar size="sm">
                        <Avatar.Image src={/* user.image_url */ "https://heroui-assets.nyc3.cdn.digitaloceanspaces.com/avatars/orange.jpg"} />
                        <Avatar.Fallback className="mb-0.5">
                          {getInitials(user.name) || <UserRound className="size-6" />}
                        </Avatar.Fallback>
                      </Avatar>

                      <div className="flex flex-col">
                        <span className="text-xs font-semibold">{user.name}</span>
                        <span className="text-xs text-muted">{user.email}</span>
                      </div>

                    </div>
                  </Table.Cell>

                  {/* TABLE USER PHONE */}
                  <Table.Cell className="min-w-40 font-semibold">
                    {user.phone || <span className="text-muted">—</span>}
                  </Table.Cell>

                  {/* TABLE USER GENDER */}
                  <Table.Cell className="min-w-40">
                    {user.gender ? (
                      <Chip color={genderColorMap[user.gender]} size="sm" variant="soft">
                        {formatLabel(user.gender)}
                      </Chip>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </Table.Cell>

                  {/* TABLE USER ACTIONS */}
                  <Table.Cell>
                    <div className="flex items-center justify-end gap-1">

                      <Button
                       isIconOnly
                       size="sm"
                       variant="tertiary"
                       aria-label="View details"
                       onPress={() => handleViewUser(user)}
                      >
                        <Eye className="size-5" />
                      </Button>

                      <Button
                       isIconOnly
                       size="sm"
                       variant="tertiary"
                       onPress={() => handleEditUser(user)}
                      >
                        <Pencil className="size-5" />
                      </Button>

                      <Button
                       isIconOnly
                       size="sm"
                       variant="danger-soft"
                       onPress={() => handleDelet(user)}
                      >
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

      {/* Edit user modal */}
      <Modal isOpen={isEditOpen} onOpenChange={setIsEditOpen}>
        <Modal.Backdrop variant={"opaque"}>
          <Modal.Container>
            <Modal.Dialog className="sm:max-w-300 border-6">

              {/* HEADER */}
              <Modal.Header className="flex-row items-center mb-8">
                <Modal.Icon className="size-15 bg-default text-foreground">
                  <UserRound className="size-10" />
                </Modal.Icon>
                <div>
                  <Modal.Heading className="text-lg">Edit User</Modal.Heading>
                  {selectedUser && (
                    <span className="group">
                      <Button
                       variant="ghost"
                       onPress={() => handleCopyId(selectedUser?.id)}
                       className="button--sm hover:bg-field-border
                       flex items-center font-semibold text-xs text-muted pl-0
                       opacity-50 transition-all duration-200 group-hover:opacity-100"
                      >
                        #{selectedUser?.id}
                        <Copy
                         className="size-3 ml-1
                         opacity-50
                         transition-all
                         duration-200
                         group-hover:opacity-100"
                        />
                      </Button>

                    </span>
                  )}
                </div>
              </Modal.Header>
              <Separator className="mb-4"/>
              {/* BODY */}
              <Modal.Body className="grid grid-cols-2 rounded-xl p-4 gap-6">
                {selectedUser && (
                  <>
                    {/* LEFT */}
                    <div className="flex flex-col gap-4">
                      <div className="flex flex-col gap-1">
                        <Label htmlFor="input-type-name" className="text-muted">Name</Label>
                        <Input
                         id="input-type-name"
                         aria-label="Name"
                         value={formData.name}
                         onChange={(e) => handleInputChange("name", e.target.value)}
                         className="font-semibold border-2 border-border"
                         placeholder="Douglas Silva"
                        />
                      </div>

                      <div className="flex flex-col gap-1">
                        <Label htmlFor="input-type-email" className="text-muted">Email</Label>
                        <Input
                         id="input-type-email"
                         value={formData.email}
                         onChange={(e) => handleInputChange("email", e.target.value)}
                         className="font-semibold border-2 border-border"
                         placeholder="name@email.com"
                         />
                      </div>

                      <div className="flex flex-col gap-1">
                        <Label htmlFor="input-type-phone" className="text-muted">Phone</Label>
                        <Input
                         id="input-type-phone"
                         value={formData.phone}
                         onChange={(e) => handleInputChange("phone", e.target.value)}
                         className="font-semibold border-2 border-border"
                         placeholder="(00) 00000-0000"
                         />
                      </div>

                      <div className="flex flex-col gap-1">
                        <Label htmlFor="input-type-password" className="text-muted">New Password</Label>
                        <InputGroup className="justify-between border-2 border-border">
                        <InputGroup.Input
                          id="input-type-password"
                          type={isVisible ? "text" : "password"}
                          value={formData.password}
                          onChange={(e) => handleInputChange("password", e.target.value)}
                          placeholder="Deixe em branco para manter a senha atual"
                          className="font-semibold"

                        />
                          <InputGroup.Suffix className="pr-0">
                            <Button
                              isIconOnly
                              aria-label={isVisible ? "Hide password" : "Show password"}
                              size="lg"
                              variant="ghost"
                              onPress={() => setIsVisible(!isVisible)}
                            >
                              {isVisible ? <Eye className="size-6 text-muted" /> : <EyeOff className="size-6 text-muted" />}
                            </Button>
                          </InputGroup.Suffix>
                        </InputGroup>
                        <span className="text-xs text-muted">
                          A senha atual é criptografada e não pode ser exibida. Preencha aqui apenas se quiser definir uma nova.
                        </span>
                      </div>
                    </div>

                    {/* RIGHT */}
                    <div className="flex flex-col gap-4">

                      <DateField value={formData.birthdate} onChange={(value) => handleInputChange("birthdate", value)}>
                        <Label htmlFor="input-type-birthdate" className="text-muted">Birthdate</Label>
                        <DateField.Group className="py-5 border-2 border-border">
                          <DateField.Input className="font-semibold">
                            {(segment) => <DateField.Segment segment={segment} />}
                          </DateField.Input>
                        </DateField.Group>
                        <FieldError />
                      </DateField>

                      <Select
                        selectedKey={formData.gender}
                        onSelectionChange={(key) =>
                          handleInputChange("gender", key)
                        }
                      >
                        <Label className="text-muted">Gender</Label>
                        <Select.Trigger className="font-semibold border-2 border-border">
                          <Select.Value />
                          <Select.Indicator />
                        </Select.Trigger>
                        <Select.Popover className="p-1">
                          <ListBox>
                            <ListBox.Item id="Male" textValue="Male">
                              <Label htmlFor="Male">Male</Label>
                              <ListBox.ItemIndicator />
                            </ListBox.Item>
                            <ListBox.Item id="Female" textValue="Female">
                              <Label htmlFor="Female">Female</Label>
                              <ListBox.ItemIndicator />
                            </ListBox.Item>
                            <ListBox.Item id="Other" textValue="Other">
                              <Label htmlFor="Other">Other</Label>
                              <ListBox.ItemIndicator />
                            </ListBox.Item>
                            <ListBox.Item id="PreferNotToSay" textValue="Prefer not to say">
                              <Label htmlFor="PreferNotToSay">Prefer not to say</Label>
                              <ListBox.ItemIndicator />
                            </ListBox.Item>
                          </ListBox>
                        </Select.Popover>
                      </Select>
                    </div>
                  </>
                )}
              </Modal.Body>

              {/* FOOTER */}
              <Modal.Footer>
                <Button
                 variant="danger-soft"
                 onPress={() => setIsEditOpen(false)}
                 className="p-6"
                >
                  Cancel
                </Button>

                <Button
                 onPress={handleSave}
                 isDisabled={isSaving}
                 className="p-6"
                >
                  {isSaving ? <Spinner color="current" className="size-5" /> : "Save"}
                </Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>

      {/* New user modal */}
      <Modal isOpen={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <Modal.Backdrop variant={"opaque"}>
          <Modal.Container>
            <Modal.Dialog className="sm:max-w-300 border-6">

              {/* HEADER */}
              <Modal.Header className="flex-row items-center mb-8">
                <Modal.Icon className="size-15 bg-default text-foreground">
                  <UserRound className="size-10" />
                </Modal.Icon>
                <div>
                  <Modal.Heading className="text-lg">New User</Modal.Heading>
                </div>
              </Modal.Header>
              <Separator className="mb-4"/>

              {/* BODY */}
              <Modal.Body className="grid grid-cols-2 rounded-xl p-4 gap-6">
                {/* LEFT */}
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1">
                    <Label htmlFor="input-type-new-name" className="text-muted">Name</Label>
                    <Input
                     id="input-type-new-name"
                     aria-label="Name"
                     value={newUser.name}
                     onChange={(e) => handleNewUserChange("name", e.target.value)}
                     className="font-semibold border-2 border-border"
                     placeholder="Firs and last name"
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <Label htmlFor="input-type-new-email" className="text-muted">Email</Label>
                    <Input
                     id="input-type-new-email"
                     value={newUser.email}
                     onChange={(e) => handleNewUserChange("email", e.target.value)}
                     className="font-semibold border-2 border-border"
                     placeholder="name@email.com"
                     />
                  </div>

                  <div className="flex flex-col gap-1">
                    <Label htmlFor="input-type-new-phone" className="text-muted">Phone</Label>
                    <Input
                     id="input-type-new-phone"
                     value={newUser.phone}
                     onChange={(e) => handleNewUserChange("phone", e.target.value)}
                     className="font-semibold border-2 border-border"
                     placeholder="(00) 00000-0000"
                     />
                  </div>

                  <div className="flex flex-col gap-1">
                    <Label htmlFor="input-type-new-password" className="text-muted">Password</Label>
                    <InputGroup className="justify-between border-2 border-border">
                    <InputGroup.Input
                      id="input-type-new-password"
                      type={isCreateVisible ? "text" : "password"}
                      value={newUser.password}
                      onChange={(e) => handleNewUserChange("password", e.target.value)}
                      placeholder="Digite a senha"
                      className="font-semibold"
                    />
                      <InputGroup.Suffix className="pr-0">
                        <Button
                          isIconOnly
                          aria-label={isCreateVisible ? "Hide password" : "Show password"}
                          size="lg"
                          variant="ghost"
                          onPress={() => setIsCreateVisible(!isCreateVisible)}
                        >
                          {isCreateVisible ? <Eye className="size-6 text-muted" /> : <EyeOff className="size-6 text-muted" />}
                        </Button>
                      </InputGroup.Suffix>
                    </InputGroup>
                  </div>
                </div>

                {/* RIGHT */}
                <div className="flex flex-col gap-4">

                  <DateField value={newUser.birthdate} onChange={(value) => handleNewUserChange("birthdate", value)}>
                    <Label htmlFor="input-type-new-birthdate" className="text-muted">Birthdate</Label>
                    <DateField.Group className="py-5 border-2 border-border">
                      <DateField.Input className="font-semibold">
                        {(segment) => <DateField.Segment segment={segment} />}
                      </DateField.Input>
                    </DateField.Group>
                    <FieldError />
                  </DateField>

                  <Select
                    selectedKey={newUser.gender}
                    onSelectionChange={(key) =>
                      handleNewUserChange("gender", key)
                    }
                  >
                    <Label className="text-muted">Gender</Label>
                    <Select.Trigger className="font-semibold border-2 border-border">
                      <Select.Value />
                      <Select.Indicator />
                    </Select.Trigger>
                    <Select.Popover className="p-1">
                      <ListBox>
                        <ListBox.Item id="Male" textValue="Male">
                          <Label htmlFor="new-Male">Male</Label>
                          <ListBox.ItemIndicator />
                        </ListBox.Item>
                        <ListBox.Item id="Female" textValue="Female">
                          <Label htmlFor="new-Female">Female</Label>
                          <ListBox.ItemIndicator />
                        </ListBox.Item>
                        <ListBox.Item id="Other" textValue="Other">
                          <Label htmlFor="new-Other">Other</Label>
                          <ListBox.ItemIndicator />
                        </ListBox.Item>
                        <ListBox.Item id="PreferNotToSay" textValue="Prefer not to say">
                          <Label htmlFor="new-PreferNotToSay">Prefer not to say</Label>
                          <ListBox.ItemIndicator />
                        </ListBox.Item>
                      </ListBox>
                    </Select.Popover>
                  </Select>
                </div>
              </Modal.Body>

              {/* FOOTER */}
              <Modal.Footer>
                <Button
                 variant="danger-soft"
                 onPress={() => setIsCreateOpen(false)}
                 className="p-6"
                >
                  Cancel
                </Button>

                <Button
                 onPress={handleCreateUser}
                 isDisabled={isCreating}
                 className="p-6"
                >
                  {isCreating ? <Spinner color="current" className="size-5" /> : "Create"}
                </Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>

      {/* Delete user modal */}
      <AlertDialog isOpen={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <AlertDialog.Backdrop variant="blur">
          <AlertDialog.Container>
            <AlertDialog.Dialog className="sm:max-w-[360px] border-6">
              <AlertDialog.CloseTrigger />
              <AlertDialog.Header className="items-center">
                <AlertDialog.Icon status="danger" className="size-15">
                  <Trash2 className="size-8" />
                </AlertDialog.Icon>
                <AlertDialog.Heading>Delete User</AlertDialog.Heading>
              </AlertDialog.Header>
              <AlertDialog.Body>
                <p className="text-sm leading-5 text-muted font-semibold text-center">
                  Are you sure you want to delete the user <span className="font-bold"><br/>{selectedUser?.name}</span>?
                  <br/>This action cannot be undone.
                </p>
              </AlertDialog.Body>
              <AlertDialog.Footer>
                <Button slot="close" variant="tertiary" className="w-full">
                  Cancel
                </Button>
                <Button slot="close" variant="danger" className="w-full" onClick={() => delUsers(selectedUser?.id)}>
                  Confirm
                </Button>
              </AlertDialog.Footer>
            </AlertDialog.Dialog>
          </AlertDialog.Container>
        </AlertDialog.Backdrop>
      </AlertDialog>

      {/* View customer drawer (ficha completa) */}
      <DetailDrawer
        isOpen={isViewOpen}
        onOpenChange={setIsViewOpen}
        person={selectedUser}
        avatarSrc={assetUrl(selectedUser?.avatarUrl)}
        onEdit={() => {
          setIsViewOpen(false);
          handleEditUser(selectedUser);
        }}
      >
        {selectedUser && (
          <>
            <DetailSection title="Contact">
              <DetailField label="Email" wide>{selectedUser.email}</DetailField>
              <DetailField label="Phone">{selectedUser.phone}</DetailField>
              <DetailField label="CPF">{formatCpf(selectedUser.cpf)}</DetailField>
              <DetailField label="Birthdate">
                {formatDate(selectedUser.birthdate) &&
                  `${formatDate(selectedUser.birthdate)}${
                    calcAge(selectedUser.birthdate) !== null ? ` · ${calcAge(selectedUser.birthdate)} anos` : ""
                  }`}
              </DetailField>
              <DetailField label="Gender">
                {selectedUser.gender && (
                  <Chip color={genderColorMap[selectedUser.gender]} size="sm" variant="soft">
                    {formatLabel(selectedUser.gender)}
                  </Chip>
                )}
              </DetailField>
            </DetailSection>

            <DetailSection title="Account">
              <DetailField label="Registered">{formatDateTime(selectedUser.createdAt)}</DetailField>
              <DetailField label="Last login">
                {formatDateTime(selectedUser.lastLogin) ?? <span className="text-muted">Nunca entrou</span>}
              </DetailField>
              <DetailField label="Last update">{formatDateTime(selectedUser.updatedAt)}</DetailField>
              <DetailField label="Favorite services">
                {Array.isArray(selectedUser.favoriteServiceIds) ? String(selectedUser.favoriteServiceIds.length) : null}
              </DetailField>
            </DetailSection>

            {selectedUser.notificationPrefs && (
              <DetailSection title="Notifications">
                <DetailField label="Preferences" wide>
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(NOTIFICATION_LABELS).map(([key, label]) => (
                      <Chip
                        key={key}
                        size="sm"
                        variant="soft"
                        color={selectedUser.notificationPrefs[key] ? "success" : "danger"}
                      >
                        {label}: {selectedUser.notificationPrefs[key] ? "on" : "off"}
                      </Chip>
                    ))}
                  </div>
                </DetailField>
              </DetailSection>
            )}

            {Array.isArray(selectedUser.addresses) && selectedUser.addresses.length > 0 && (
              <DetailSection title="Addresses">
                {selectedUser.addresses.map((a) => (
                  <DetailField key={a.id} label={a.label || "Endereço"} wide>
                    <div className="flex flex-col gap-0.5">
                      <span>
                        {a.street}, {a.number}
                        {a.complement ? ` - ${a.complement}` : ""}
                      </span>
                      <span className="text-xs font-medium text-muted">
                        {a.neighborhood} · {a.city}/{a.state} · CEP {a.zipCode}
                        {a.isDefault ? " · principal" : ""}
                      </span>
                    </div>
                  </DetailField>
                ))}
              </DetailSection>
            )}
          </>
        )}
      </DetailDrawer>
    </>
  );
}
