import React from 'react'

import { Tabs, Button, Chip, AlertDialog } from '@heroui/react';

import { TicketPercent, Plus, Pencil, Archive, ArchiveRestore, Trash2 } from 'lucide-react';
import { RiDiscountPercentFill } from "react-icons/ri";
import { LuBadgeDollarSign } from "react-icons/lu";
import { BiSolidBadgeDollar } from "react-icons/bi";

import api from '../../../api/api';
import CreateCuponModal from './CreateCouponModal';

const TAB_TO_STATUS = {
  all: undefined,
  actives: 'active',
  inactives: 'scheduled', // "Agendados": cupons com startsAt no futuro
  expired: 'expired',
  archived: 'archived',
};

const DISCOUNT_LABEL = {
  Percentage: (coupon) => `${coupon.discountValue}%`,
  Fixed: (coupon) => `R$ ${coupon.discountValue.toFixed(2)}`,
};

const STATUS_LABEL = {
  active: 'Ativo',
  scheduled: 'Agendado',
  expired: 'Expirado',
  archived: 'Arquivado',
};

const SCOPE_LABEL = {
  AllServices: 'Todos os serviços',
  SpecificServices: 'Serviços específicos',
  Category: 'Uma categoria',
  FirstPurchase: 'Primeira compra',
  SpecificCustomer: 'Cliente específico',
};

const STATUS_COLOR = {
  active: 'success',
  scheduled: 'accent',
  expired: 'danger',
  archived: 'default',
};

export default function Coupons() {
  const [coupons, setCoupons] = React.useState([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [errorMessage, setErrorMessage] = React.useState('');

  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const [editingCoupon, setEditingCoupon] = React.useState(null);

  async function loadCoupons() {
    setIsLoading(true);
    setErrorMessage('');
    try {
      const data = await api.get('/coupons');
      setCoupons(data);
    } catch (error) {
      setErrorMessage(error.message || 'Não foi possível carregar os cupons.');
    } finally {
      setIsLoading(false);
    }
  }

  React.useEffect(() => {
    loadCoupons();
  }, []);

  function openCreateModal() {
    setEditingCoupon(null);
    setIsModalOpen(true);
  }

  function openEditModal(coupon) {
    setEditingCoupon(coupon);
    setIsModalOpen(true);
  }

  function handleSaved() {
    loadCoupons();
  }

  async function handleToggleArchive(coupon) {
    try {
      const updated = await api.patch(`/coupons/${coupon.id}/archive`, {
        archived: coupon.status !== 'archived',
      });
      setCoupons((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
    } catch (error) {
      setErrorMessage(error.message || 'Não foi possível arquivar o cupom.');
    }
  }

  async function handleDelete(coupon) {
    try {
      await api.delete(`/coupons/${coupon.id}`);
      setCoupons((prev) => prev.filter((c) => c.id !== coupon.id));
    } catch (error) {
      setErrorMessage(error.message || 'Não foi possível remover o cupom.');
    }
  }

  return (
    <div>
      {/* HEAD */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Cupons</h1>
          <span className="text-sm text-muted font-semibold">Crie e gerencie cupons de desconto.</span>
        </div>

        <Button variant="outline" className="rounded-lg" onPress={openCreateModal}>
          <Plus className="size-5" />
          Criar cupom
        </Button>
      </div>

      {!!errorMessage && (
        <p className="mb-4 text-sm text-danger">{errorMessage}</p>
      )}

      <div className="w-full h-10 bg-surface-tertiary rounded-full">
        <Tabs className="w-full" defaultSelectedKey="actives">
          <Tabs.ListContainer className='flex items-center justify-start px-80'>
            <Tabs.List aria-label="Options">
              <Tabs.Tab id="all">
                Todos
                <Tabs.Indicator />
              </Tabs.Tab>
              <Tabs.Tab id="actives">
                Ativos
                <Tabs.Indicator />
              </Tabs.Tab>
              <Tabs.Tab id="inactives">
                Agendados
                <Tabs.Indicator />
              </Tabs.Tab>
              <Tabs.Tab id="expired">
                Expirados
                <Tabs.Indicator />
              </Tabs.Tab>
              <Tabs.Tab id="archived">
                Arquivados
                <Tabs.Indicator />
              </Tabs.Tab>
            </Tabs.List>
          </Tabs.ListContainer>

          {Object.entries(TAB_TO_STATUS).map(([tabId, status]) => (
            <Tabs.Panel className="pt-4" id={tabId} key={tabId}>
              <CouponList
                coupons={status ? coupons.filter((c) => c.status === status) : coupons}
                isLoading={isLoading}
                onCreate={openCreateModal}
                onEdit={openEditModal}
                onToggleArchive={handleToggleArchive}
                onDelete={handleDelete}
              />
            </Tabs.Panel>
          ))}
        </Tabs>
      </div>

      <CreateCuponModal
        isOpen={isModalOpen}
        onOpenChange={setIsModalOpen}
        coupon={editingCoupon}
        onSaved={handleSaved}
      />
    </div>
  )
}

function CouponList({ coupons, isLoading, onCreate, onEdit, onToggleArchive, onDelete }) {
  if (isLoading) {
    return <p className="text-sm text-muted text-center font-medium py-10">Carregando cupons...</p>;
  }

  if (coupons.length === 0) {
    return <EmptyState onCreate={onCreate} />;
  }

  return (
    <div className="grid grid-cols-2 gap-3">
      {coupons.map((coupon) => (
        <div
          key={coupon.id}
          className="relative flex items-stretch justify-between gap-4 overflow-visible rounded-xl border border-default bg-overlay"
        >
          <div className="flex min-w-0 flex-1 items-stretch gap-8">
            <div className="flex shrink-0 items-center py-4 pl-8">
              <div className={`flex size-12 items-center justify-center rounded-lg ${coupon.discountType === 'Percentage' ? "bg-accent-soft text-accent" : "bg-danger-soft text-danger"}`}>
                {coupon.discountType === 'Percentage' ? <RiDiscountPercentFill className="size-7" /> : <LuBadgeDollarSign  className="size-7" />}
                
              </div>
            </div>

            {/* linha de corte, com as mordidas em meia-lua nas pontas (efeito de ticket picotado) */}
            <div className="relative w-px shrink-0 self-stretch">
              <div className="absolute inset-y-3 left-1/2 -translate-x-1/2 border-l-2 border-dashed border-border" />
              <span className="absolute left-1/2 top-0 size-8 -translate-x-1/2 -translate-y-1/2 rounded-full bg-surface border-b" />
              <span className="absolute bottom-0 left-1/2 size-8 -translate-x-1/2 translate-y-1/2 rounded-full bg-surface border-t" />
            </div>

            <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 py-4">
              <div className="flex items-center gap-2">
                <span className="font-bold">{coupon.code}</span>
                <Chip size="sm" variant="soft" color={STATUS_COLOR[coupon.status] ?? 'default'}>
                  {STATUS_LABEL[coupon.status] ?? coupon.status}
                </Chip>
              </div>
              <div className="text-sm text-muted font-medium">
                <span>
                  {DISCOUNT_LABEL[coupon.discountType]?.(coupon) ?? coupon.discountValue}
                  {' • '}
                  {SCOPE_LABEL[coupon.scope] ?? coupon.scope}
                </span>
              </div>
              <span className="block truncate text-sm text-muted font-medium">
                {coupon.description ? ` ${coupon.description}` : ''}
              </span>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1 py-4 pr-8">
            <Button variant="ghost" isIconOnly aria-label="Editar cupom" onPress={() => onEdit(coupon)} className="hover:bg-accent-soft hover:text-accent transition-all duration-180">
              <Pencil className="size-4" />
            </Button>
            <Button
              variant="ghost"
              isIconOnly
              aria-label={coupon.status === 'archived' ? 'Desarquivar cupom' : 'Arquivar cupom'}
              onPress={() => onToggleArchive(coupon)}
              className="hover:bg-warning-soft hover:text-warning transition-all duration-180"
            >
              {coupon.status === 'archived' ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />}
            </Button>
            <AlertDialog>
              <Button
                variant="ghost"
                isIconOnly
                aria-label="Remover cupom"
                className="hover:bg-danger-soft hover:text-danger transition-all duration-180"
              >
                <Trash2 className="size-4" />
              </Button>
              <AlertDialog.Backdrop>
                <AlertDialog.Container>
                  <AlertDialog.Dialog className="sm:max-w-130">
                    <AlertDialog.Header>
                      <AlertDialog.Icon status="danger" />
                      <AlertDialog.Heading>Remover cupom "{coupon.code}"?</AlertDialog.Heading>
                    </AlertDialog.Header>
                    <AlertDialog.Body>
                      <p>
                        Essa ação não pode ser desfeita. O cupom será removido definitivamente,
                        junto com a referência ao seu histórico de uso.
                      </p>
                    </AlertDialog.Body>
                    <AlertDialog.Footer>
                      <Button slot="close" variant="tertiary">Cancelar</Button>
                      <Button slot="close" variant="danger" onPress={() => onDelete(coupon)}>
                        Remover
                      </Button>
                    </AlertDialog.Footer>
                  </AlertDialog.Dialog>
                </AlertDialog.Container>
              </AlertDialog.Backdrop>
            </AlertDialog>
          </div>
        </div>
      ))}
    </div>
  );
}

const EmptyState = ({ onCreate }) => {
  return (
    <div className="flex flex-col items-center justify-center">
      <TicketPercent size={60} strokeWidth={1.5} />

      <div className="flex flex-col items-center text-center mb-6">
        <h1 className="text-xl font-bold">
          Sem cupons
        </h1>

        <span className="text-sm text-muted font-semibold">
          Crie um cupom para ofertar descontos para seus  clientes.
        </span>
      </div>

      <Button variant="outline" className="rounded-lg p-5" onPress={onCreate}>
        <Plus className="size-7" />
        Criar cupom
      </Button>
    </div>
  );
};
