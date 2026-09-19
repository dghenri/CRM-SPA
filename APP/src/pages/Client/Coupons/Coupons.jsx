import React from 'react'
import { useNavigate } from "react-router-dom";
import MobileNav from '../../../components/MobileNav'
import { BadgePercent, HeartCrack, Ticket, Copy, Check } from 'lucide-react';
import { Button, Tabs, Input, TextField, Form } from "@heroui/react";

import api from '../../../api/api';

const DISCOUNT_LABEL = {
  Percentage: (coupon) => `${coupon.discountValue}% de desconto`,
  Fixed: (coupon) => `R$ ${coupon.discountValue.toFixed(2)} de desconto`,
};

function formatDate(iso) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
}

// Cupom no formato de ticket: ícone à esquerda, linha de corte com mordidas em
// meia-lua no meio, código + validade à direita (mesma referência visual do
// painel de cupons da equipe).
function CouponTicket({ coupon, footerLabel, faded = false }) {
  const [copied, setCopied] = React.useState(false);

  async function handleCopyCode() {
    const text = coupon.code;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        // fallback pra contexto não seguro (ex: acessando por http://IP-da-rede
        // no celular) - o Clipboard API moderno só funciona em HTTPS/localhost
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      console.error('Não foi possível copiar o cupom:', err);
    }
  }

  return (
    <div
      className={`relative flex items-stretch justify-between gap-4 overflow-visible rounded-xl border border-default bg-overlay ${faded ? 'opacity-60 grayscale' : ''
        }`}
    >
      {/* <div className="flex min-w-0 flex-1 items-stretch"> */}
        <div className="flex shrink-0 items-center py-4 pl-8 pr-6">
          <div className="flex size-12 items-center justify-center rounded-lg bg-accent-soft text-accent">
            <BadgePercent />
          </div>
        </div>
      {/* </div> */}

      {/* linha de corte, com as mordidas em meia-lua nas pontas (efeito de ticket picotado) */}
      <div className="relative w-px shrink-0 self-stretch">
        <div className="absolute inset-y-3 left-1/2 -translate-x-1/2 border-l-2 border-dashed border-border" />
        <span className="absolute left-1/2 top-0 size-8 -translate-x-1/2 -translate-y-1/2 rounded-full bg-background border-b" />
        <span className="absolute bottom-0 left-1/2 size-8 -translate-x-1/2 translate-y-1/2 rounded-full bg-background border-t" />
      </div>

      <div className="flex min-w-0 flex-2 flex-col justify-between gap-3 py-4 pr-5">
        <div className="flex min-w-0 flex-col gap-1.5">
          <span className="block text-pretty text-sm text-muted font-medium">
            {coupon.description || DISCOUNT_LABEL[coupon.discountType]?.(coupon) || coupon.discountValue}
          </span>

          <Button
            variant="ghost"
            onPress={handleCopyCode}
            aria-label={`Copiar código ${coupon.code}`}
            className="w-fit gap-1.5 rounded-md border border-dashed border-border px-2 py-1 font-mono font-bold tracking-wide"
          >
            {coupon.code}
            {copied ? <Check size={14} className="text-success" /> : <Copy size={14} className="text-muted" />}
          </Button>
        </div>

        <span className="self-end text-right text-xs text-muted font-medium">
          {footerLabel ?? (coupon.expiresAt ? `Válido até ${formatDate(coupon.expiresAt)}` : 'Sem data de expiração')}
        </span>
      </div>
    </div>
  );
}

const EMPTY_STATE_COLOR = {
  danger: 'bg-danger-soft text-danger',
  success: 'bg-success-soft text-success',
  muted: 'bg-surface-tertiary text-muted',
};

const EmptyState = ({ icon: Icon = HeartCrack, emoji, text = 'Nenhum cupom por aqui.', color = 'danger' }) => {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
      <div className={`flex items-center justify-center size-16 rounded-full ${EMPTY_STATE_COLOR[color] ?? EMPTY_STATE_COLOR.danger}`}>
        {emoji ? (
          <span className="text-3xl leading-none">{emoji}</span>
        ) : (
          <Icon className="size-8" />
        )}
      </div>
      <p className="text-sm text-muted font-medium">{text}</p>
    </div>
  )
}

function CouponListSection({ isLoading, items, emptyIcon, emptyEmoji, emptyColor, emptyText, renderItem }) {
  if (isLoading) {
    return <p className="text-sm text-muted text-center font-medium py-10">Carregando cupons...</p>;
  }

  if (items.length === 0) {
    return <EmptyState icon={emptyIcon} emoji={emptyEmoji} color={emptyColor} text={emptyText} />;
  }

  return <div className="flex flex-col gap-3">{items.map(renderItem)}</div>;
}

export default function Coupons() {
  const navigate = useNavigate();

  const [coupons, setCoupons] = React.useState([]);
  const [redemptions, setRedemptions] = React.useState([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [errorMessage, setErrorMessage] = React.useState('');

  const [code, setCode] = React.useState('');
  const [isRedeeming, setIsRedeeming] = React.useState(false);
  const [redeemError, setRedeemError] = React.useState('');
  const [redeemSuccess, setRedeemSuccess] = React.useState('');

  async function loadData() {
    setIsLoading(true);
    setErrorMessage('');
    try {
      const [couponsData, redemptionsData] = await Promise.all([
        api.get('/coupons/me'),
        api.get('/coupons/me/redemptions'),
      ]);
      setCoupons(couponsData);
      setRedemptions(redemptionsData);
    } catch (error) {
      setErrorMessage(error.message || 'Não foi possível carregar seus cupons.');
    } finally {
      setIsLoading(false);
    }
  }

  React.useEffect(() => {
    loadData();
  }, []);

  async function handleRedeem(event) {
    event.preventDefault();
    if (!code.trim() || isRedeeming) return;

    setIsRedeeming(true);
    setRedeemError('');
    setRedeemSuccess('');
    try {
      const redemption = await api.post('/coupons/redeem', { code: code.trim().toUpperCase() });
      setCode('');
      setRedeemSuccess(`Cupom ${redemption.coupon?.code ?? ''} adicionado à sua carteira!`);
      await loadData();
    } catch (error) {
      setRedeemError(error.message || 'Não foi possível resgatar esse cupom.');
    } finally {
      setIsRedeeming(false);
    }
  }

  // um cupom só conta como "usado" se existir um registro de resgate; "expirado"
  // é só quem passou da validade sem nunca ter sido usado (senão ele já aparece
  // em Usados). "Agendado" entra em Disponíveis também - já está na carteira,
  // só ainda não começou a valer.
  const available = coupons.filter(
    (c) =>
      (c.status === 'active' || c.status === 'scheduled') &&
      (!c.usageLimit || c.usageCount < c.usageLimit) &&
      (!c.perUserLimit || c.myUsageCount < c.perUserLimit)
  );
  const expired = coupons.filter((c) => c.status === 'expired' && c.myUsageCount === 0);

  return (
    <div>
      <MobileNav onBack={() => navigate(-1)} title={"Cupons"} />

      <main className="flex-1 overflow-y-auto pt-24 px-4">
        <Form onSubmit={handleRedeem} className="flex items-start gap-4 mb-4">
          <TextField
            aria-label="Código do cupom"
            className="w-full"
            value={code}
            onChange={(value) => setCode(value.toUpperCase())}
            isDisabled={isRedeeming}
          >
            <Input
              className="w-full border border-default rounded-xl"
              placeholder="Digite o código do cupom"
            />
          </TextField>
          <Button
            type="submit"
            variant="outline"
            className="bg-overlay py-6 rounded-xl shrink-0"
            isPending={isRedeeming}
          >
            Resgatar
          </Button>
        </Form>

        {!!redeemSuccess && <p className="mb-4 text-sm font-medium text-success">{redeemSuccess}</p>}
        {!!redeemError && <p className="mb-4 text-sm text-danger">{redeemError}</p>}
        {!!errorMessage && <p className="mb-4 text-sm text-danger">{errorMessage}</p>}

        <Tabs className="w-full max-w-md h-120" defaultSelectedKey="available">
          <Tabs.ListContainer>
            <Tabs.List aria-label="Options">
              <Tabs.Tab id="available" className="py-6">
                Disponíveis ({available.length})
                <Tabs.Indicator />
              </Tabs.Tab>
              <Tabs.Tab id="used" className="py-6">
                Usados ({redemptions.length})
                <Tabs.Indicator />
              </Tabs.Tab>
              <Tabs.Tab id="expired" className="py-6">
                Expirados ({expired.length})
                <Tabs.Indicator />
              </Tabs.Tab>
            </Tabs.List>
          </Tabs.ListContainer>

          <Tabs.Panel className="pt-4" id="available">
            <CouponListSection
              isLoading={isLoading}
              items={available}
              emptyIcon={Ticket}
              emptyText="Nenhum cupom disponível ainda."
              renderItem={(coupon) => (
                <CouponTicket
                  key={coupon.id}
                  coupon={coupon}
                  footerLabel={
                    coupon.status === 'scheduled'
                      ? `Disponível a partir de ${formatDate(coupon.startsAt)}`
                      : undefined
                  }
                />
              )}
            />
          </Tabs.Panel>

          <Tabs.Panel className="pt-4" id="used">
            <CouponListSection
              isLoading={isLoading}
              items={redemptions}
              emptyIcon={HeartCrack}
              emptyText="Nenhum cupom resgatado ainda."
              renderItem={(redemption) => (
                <CouponTicket
                  key={redemption.id}
                  coupon={redemption.coupon}
                  footerLabel={`Usado em ${formatDate(redemption.usedAt)}`}
                  faded
                />
              )}
            />
          </Tabs.Panel>

          <Tabs.Panel className="pt-4" id="expired">
            <CouponListSection
              isLoading={isLoading}
              items={expired}
              emptyEmoji="🎉"
              emptyColor="success"
              emptyText="Nenhum cupom expirado, ufa..."
              renderItem={(coupon) => (
                <CouponTicket
                  key={coupon.id}
                  coupon={coupon}
                  footerLabel={`Expirou em ${formatDate(coupon.expiresAt)}`}
                  faded
                />
              )}
            />
          </Tabs.Panel>
        </Tabs>
      </main>
    </div>
  )
}
