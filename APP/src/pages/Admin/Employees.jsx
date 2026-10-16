import { useMemo, useState, useEffect } from "react";
import api from '../../api/api';
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
  UserX,
  UserMinus,
  ArrowRightLeft,

} from "lucide-react";

const statusColorMap = {
  Active: "success",
  Inactive: "danger",
  OnLeave: "warning",
};

function formatLabel(text) {
  if (!text) return "";
  return text.replace(/([a-z])([A-Z])/g, "$1 $2");
}

export default function Collaborators() {
  // Senha visível por padrão ao editar/criar um colaborador
  const [isVisible, setIsVisible] = useState(true);
  const [isCreateVisible, setIsCreateVisible] = useState(true);
  const [selectedKeys, setSelectedKeys] = useState(new Set());
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  // modal "transferir antes de excluir" (funcionária com sessões futuras / procedimentos)
  const [isTransferOpen, setIsTransferOpen] = useState(false);
  const [isTransferring, setIsTransferring] = useState(false);
  const [transferTo, setTransferTo] = useState(null);
  const [workload, setWorkload] = useState({ futureAppointments: 0, services: 0 });
  const [selectedUser, setSelectedUser] = useState(null);
  const [users, setUsers] = useState([]);
  const [selected, setSelected] = useState(new Set(["news", "travel"]));
  const [sortDescriptor, setSortDescriptor] = useState({
    column: "name",
    direction: "ascending",
  });

  /* GET users */
  async function getUsers() {
    try {
      const data = await api.get('/staff');
      setUsers(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error(error);
      setUsers([]);
    }
  }

  /* DEL users - com transferTo, as sessões futuras e os procedimentos passam pra essa funcionária */
  async function delUsers(id, transferToId) {
    try {
      const query = transferToId ? `?transferTo=${encodeURIComponent(transferToId)}` : "";
      await api.delete(`/staff/${id}${query}`);
      toast.success(transferToId ? "Sessões transferidas e funcionária removida." : "Funcionária removida.");
      return true;
    } catch (error) {
      console.error(error);
      toast.danger(error.message || "Não foi possível excluir a funcionária.");
      return false;
    } finally {
      getUsers();
    }
  }

  async function handleTransferAndDelete() {
    if (!selectedUser?.id || !transferTo) return;
    setIsTransferring(true);
    const ok = await delUsers(selectedUser.id, transferTo);
    setIsTransferring(false);
    if (ok) setIsTransferOpen(false);
  }

  useEffect(() => {
    getUsers();
  }, []);

  /* Sort users */
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

  /* KPI counts */
  const kpi = useMemo(() => {
    const total = users.length;
    const active = users.filter((u) => u.status === "Active").length;
    const inactive = users.filter((u) => u.status === "Inactive").length;
    const onLeave = users.filter((u) => u.status === "OnLeave").length;
    return { total, active, inactive, onLeave };
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

  /* Copia o ID completo do colaborador (usado na tabela e no modal de edição) */
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
    role: "",
    status: "",
    birthdate: null,
  });

  const [newUser, setNewUser] = useState({
    name: "",
    email: "",
    password: "",
    role: "",
    status: "Active",
    birthdate: null,
  });

  useEffect(() => {
    if (selectedUser) {
      setFormData({
        name: selectedUser.name || "",
        email: selectedUser.email || "",
        password: "",
        role: selectedUser.role || "",
        status: selectedUser.status || "",
        birthdate: selectedUser.birthdate
        ? parseDate(selectedUser.birthdate.split("T")[0])
        : null,
      });
    }
  }, [selectedUser]);

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
      role: "",
      status: "Active",
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
        role: formData.role,
        status: formData.status,
        birthdate: formData.birthdate ? formData.birthdate.toString() : undefined,
      };

      if (formData.password) {
        payload.password = formData.password;
      }

      await api.put(`/staff/${selectedUser.id}`, payload);

      toast.success("Usuário atualizado com sucesso!");
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
    if (!newUser.name || !newUser.email || !newUser.password || !newUser.role || !newUser.birthdate) {
      toast.danger("Preencha nome, email, senha, cargo e data de nascimento.");
      return;
    }

    setIsCreating(true);

    try {
      const payload = {
        name: newUser.name,
        email: newUser.email,
        password: newUser.password,
        role: newUser.role,
        status: newUser.status || "Active",
        birthdate: newUser.birthdate.toString(),
      };

      await api.post("/staff", payload);
      toast.success("Colaborador criado com sucesso!");
      setIsCreateOpen(false);
      getUsers();
    } catch (error) {
      console.error(error);
      // Mostra a mensagem real vinda do backend (ex.: role inválida, email
      // duplicado, id ausente) em vez de um texto genérico
      toast.danger(error.message || "Não foi possível criar o colaborador.");
    } finally {
      setIsCreating(false);
    }
  };

  /* Delete employee dialog: se ela ainda tem sessões futuras/procedimentos, abre o modal de transferência */
  const handleDelet = async (user) => {
    setSelectedUser(user);
    setTransferTo(null);
    try {
      const load = await api.get(`/staff/${user.id}/workload`);
      if (load.futureAppointments > 0 || load.services > 0) {
        setWorkload(load);
        setIsTransferOpen(true);
        return;
      }
    } catch (error) {
      console.error(error);
      toast.danger(error.message || "Não foi possível verificar as sessões da funcionária.");
      return;
    }
    setIsDeleteOpen(true);
  };

  // quem pode receber: outras funcionárias ativas
  const transferReceivers = users.filter((u) => u.id !== selectedUser?.id && u.status === "Active");

  return (
    <>
      {/* KPI - Resumo de colaboradores */}
      <div className="flex items-center rounded-2xl border-6 border-border bg-overlay drop-shadow-md p-6 mb-6">
        <div className="flex flex-col gap-1 pr-6">
          <span className="text-sm font-medium text-muted">Total Collaborators</span>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold">{kpi.total}</span>
            <Users className="size-5 text-muted" />
          </div>
        </div>

        <Separator orientation="vertical" className="h-fill w-0.5" />

        <div className="flex flex-col gap-1 px-6">
          <span className="text-sm font-medium text-muted">Active</span>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold">{kpi.active}</span>
            <Chip color="success" size="sm" variant="soft">
              <UserCheck className="size-3.5" />
              {kpi.total ? `${Math.round((kpi.active / kpi.total) * 100)}%` : "0%"}
            </Chip>
          </div>
        </div>

        <Separator orientation="vertical" className="h-fill w-0.5" />

        <div className="flex flex-col gap-1 px-6">
          <span className="text-sm font-medium text-muted">Inactive</span>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold">{kpi.inactive}</span>
            <Chip color="danger" size="sm" variant="soft">
              <UserX className="size-3.5" />
              {kpi.total ? `${Math.round((kpi.inactive / kpi.total) * 100)}%` : "0%"}
            </Chip>
          </div>
        </div>

        <Separator orientation="vertical" className="h-fill w-0.5" />

        <div className="flex flex-col gap-1 pl-6">
          <span className="text-sm font-medium text-muted">On Leave</span>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold">{kpi.onLeave}</span>
            <Chip color="warning" size="sm" variant="soft">
              <UserMinus className="size-3.5" />
              {kpi.total ? `${Math.round((kpi.onLeave / kpi.total) * 100)}%` : "0%"}
            </Chip>
          </div>
        </div>
      </div>

      {/* Ação - Novo colaborador */}
      <div className="flex justify-end mb-0">
        <Button onPress={handleNewUser} className="bg-field-foreground text-background rounded-b-none gap-2 p-6">
          <Plus className="size-4 mt-2" />
          New Collaborator
        </Button>
      </div>

      <Table className="rounded-tr-none">
        <Table.ScrollContainer>
          <Table.Content
            aria-label="staff"
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
                    Employee ID
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
              <Table.Column allowsSorting id="role">
                {({sortDirection}) => (
                  <Table.SortableColumnHeader sortDirection={sortDirection}>
                    Role
                  </Table.SortableColumnHeader>
                )}
              </Table.Column>
              <Table.Column allowsSorting id="status">
                {({sortDirection}) => (
                  <Table.SortableColumnHeader sortDirection={sortDirection}>
                    Status
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

                  {/* TABLE USER ROLE */}
                  <Table.Cell className="min-w-52 font-semibold">{formatLabel(user.role)}</Table.Cell>

                  {/* TABLE USER STATUS */}
                  <Table.Cell className="min-w-25">
                    <Chip color={statusColorMap[user.status]} size="sm" variant="soft">
                      {formatLabel(user.status)}
                    </Chip>
                  </Table.Cell>

                  {/* TABLE USER ACTIONS */}
                  <Table.Cell>
                    <div className="flex items-center justify-end gap-1">

                      <Button
                       isIconOnly
                       size="sm"
                       variant="tertiary"
                       /* onPress={} */
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
                      
                      <DateField value={formData.birthdate}>
                        <Label htmlFor="input-type-number" className="text-muted">Birthdate</Label>
                        <DateField.Group className="py-5 border-2 border-border">
                          <DateField.Input className="font-semibold">
                            {(segment) => <DateField.Segment segment={segment} />}
                          </DateField.Input>
                        </DateField.Group>
                        <FieldError />
                      </DateField>

                      <Select
                        selectedKey={formData.role}
                        onSelectionChange={(key) =>
                          handleInputChange("role", key)
                        }
                      >
                        <Label className="text-muted">Role</Label>
                        <Select.Trigger className="font-semibold border-2 border-border">
                          <Select.Value />
                          <Select.Indicator />
                        </Select.Trigger>
                        <Select.Popover className="p-1">
                          <ListBox>
                            <ListBox.Item id="MajorAdmin" textValue="Major Admin">
                              <Label htmlFor="MajorAdmin">Major Admin</Label>
                              <ListBox.ItemIndicator />
                            </ListBox.Item>
                            <ListBox.Item id="Farmaceutica" textValue="Farmacêutica">
                              <Label htmlFor="Farmaceutica">Farmacêutica</Label>
                              <ListBox.ItemIndicator />
                            </ListBox.Item>
                            <ListBox.Item id="Massoterapeuta" textValue="Massoterapeuta">
                              <Label htmlFor="Massoterapeuta">Massoterapeuta</Label>
                              <ListBox.ItemIndicator />
                            </ListBox.Item>
                          </ListBox>
                        </Select.Popover>
                      </Select>

                      <div className="flex flex-col gap-3">
                        <TagGroup
                          selectionMode="single"
                          selectedKeys={
                            formData.status
                              ? new Set([formData.status])
                              : new Set()
                          }
                          onSelectionChange={(keys) => {
                            const value = [...keys][0];
                            handleInputChange("status", value);
                          }}
                        >
                          <Label className="text-muted">Status</Label>

                          <TagGroup.List className="mt-2">
                            <Tag id="Active"
                              className="data-[selected=true]:bg-success-soft data-[selected=true]:text-success-soft-foreground">
                              Active
                            </Tag>
                            <Tag id="Inactive"
                              className="data-[selected=true]:bg-danger-soft data-[selected=true]:text-danger-soft-foreground">
                              Inactive
                            </Tag>
                            <Tag id="OnLeave"
                              className="data-[selected=true]:bg-warning-soft data-[selected=true]:text-warning-soft-foreground">
                              On Leave
                            </Tag>
                          </TagGroup.List>
                        </TagGroup>
                      </div>
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

      {/* New collaborator modal */}
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
                  <Modal.Heading className="text-lg">New Collaborator</Modal.Heading>
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
                    selectedKey={newUser.role}
                    onSelectionChange={(key) =>
                      handleNewUserChange("role", key)
                    }
                  >
                    <Label className="text-muted">Role</Label>
                    <Select.Trigger className="font-semibold border-2 border-border">
                      <Select.Value />
                      <Select.Indicator />
                    </Select.Trigger>
                    <Select.Popover className="p-1">
                      <ListBox>
                        <ListBox.Item id="MajorAdmin" textValue="Major Admin">
                          <Label htmlFor="new-MajorAdmin">Major Admin</Label>
                          <ListBox.ItemIndicator />
                        </ListBox.Item>
                        <ListBox.Item id="Farmaceutica" textValue="Farmacêutica">
                          <Label htmlFor="new-Farmaceutica">Farmacêutica</Label>
                          <ListBox.ItemIndicator />
                        </ListBox.Item>
                        <ListBox.Item id="Massoterapeuta" textValue="Massoterapeuta">
                          <Label htmlFor="new-Massoterapeuta">Massoterapeuta</Label>
                          <ListBox.ItemIndicator />
                        </ListBox.Item>
                      </ListBox>
                    </Select.Popover>
                  </Select>

                  <div className="flex flex-col gap-3">
                    <TagGroup
                      selectionMode="single"
                      selectedKeys={
                        newUser.status
                          ? new Set([newUser.status])
                          : new Set()
                      }
                      onSelectionChange={(keys) => {
                        const value = [...keys][0];
                        handleNewUserChange("status", value);
                      }}
                    >
                      <Label className="text-muted">Status</Label>

                      <TagGroup.List className="mt-2">
                        <Tag id="Active"
                          className="data-[selected=true]:bg-success-soft data-[selected=true]:text-success-soft-foreground">
                          Active
                        </Tag>
                        <Tag id="Inactive"
                          className="data-[selected=true]:bg-danger-soft data-[selected=true]:text-danger-soft-foreground">
                          Inactive
                        </Tag>
                        <Tag id="OnLeave"
                          className="data-[selected=true]:bg-warning-soft data-[selected=true]:text-warning-soft-foreground">
                          On Leave
                        </Tag>
                      </TagGroup.List>
                    </TagGroup>
                  </div>
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

      {/* Delete employee dialog */}
      <AlertDialog isOpen={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <AlertDialog.Backdrop variant="blur">
          <AlertDialog.Container>
            <AlertDialog.Dialog className="sm:max-w-115 border-6">
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
                <Button slot="close" variant="danger" className="w-full" onPress={() => delUsers(selectedUser?.id)}>
                  Confirm
                </Button>
              </AlertDialog.Footer>
            </AlertDialog.Dialog>
          </AlertDialog.Container>
        </AlertDialog.Backdrop>
      </AlertDialog>

      {/* Transfer & delete modal */}
      <Modal isOpen={isTransferOpen} onOpenChange={setIsTransferOpen}>
        <Modal.Backdrop variant={"opaque"}>
          <Modal.Container>
            <Modal.Dialog className="sm:max-w-130 border-6">

              {/* HEADER */}
              <Modal.Header className="flex-row items-center mb-4">
                <Modal.Icon className="size-15 bg-default text-foreground">
                  <ArrowRightLeft className="size-8" />
                </Modal.Icon>
                <div>
                  <Modal.Heading className="text-lg">Transferir antes de excluir</Modal.Heading>
                  <span className="text-xs font-semibold text-muted">{selectedUser?.name}</span>
                </div>
              </Modal.Header>
              <Separator className="mb-4" />

              {/* BODY */}
              <Modal.Body className="flex flex-col gap-4 p-4">
                <p className="text-sm leading-5 font-semibold text-muted">
                  {selectedUser?.name} ainda tem{" "}
                  <span className="text-foreground">
                    {workload.futureAppointments} sessão(ões) futura(s)
                  </span>{" "}
                  e{" "}
                  <span className="text-foreground">{workload.services} procedimento(s)</span>.
                  Escolha quem vai recebê-los. As sessões já realizadas continuam com o nome dela no histórico.
                </p>

                <Select
                  selectedKey={transferTo}
                  onSelectionChange={(key) => setTransferTo(key)}
                  placeholder="Selecione a funcionária"
                  isDisabled={transferReceivers.length === 0}
                >
                  <Label className="text-muted">Transferir para</Label>
                  <Select.Trigger className="font-semibold border-2 border-border">
                    <Select.Value />
                    <Select.Indicator />
                  </Select.Trigger>
                  <Select.Popover className="p-1">
                    <ListBox>
                      {transferReceivers.map((r) => (
                        <ListBox.Item key={r.id} id={r.id} textValue={r.name}>
                          {r.name}
                          <span className="ml-2 text-xs font-semibold text-muted">{formatLabel(r.role)}</span>
                          <ListBox.ItemIndicator />
                        </ListBox.Item>
                      ))}
                    </ListBox>
                  </Select.Popover>
                </Select>

                {transferReceivers.length === 0 && (
                  <p className="text-xs font-semibold text-danger">
                    Não há outra funcionária ativa para receber. Ative ou cadastre uma antes de excluir.
                  </p>
                )}
              </Modal.Body>

              {/* FOOTER */}
              <Modal.Footer>
                <Button
                  variant="tertiary"
                  onPress={() => setIsTransferOpen(false)}
                  className="p-6"
                >
                  Cancel
                </Button>

                <Button
                  variant="danger"
                  onPress={handleTransferAndDelete}
                  isDisabled={!transferTo || isTransferring}
                  className="p-6"
                >
                  {isTransferring ? <Spinner color="current" className="size-5" /> : "Transferir e excluir"}
                </Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>
    </>
  );
}
