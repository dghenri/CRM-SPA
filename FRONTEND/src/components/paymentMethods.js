import { QrCode, CreditCard, Landmark, Banknote } from "lucide-react";

/**
 * Formas de pagamento aceitas. Os `id` precisam bater com o enum
 * PaymentMethod do schema.prisma (e com src/lib/payments.js no back-end).
 * Reaproveite este arquivo na página de receita/faturamento.
 */
export const PAYMENT_METHODS = [
  { id: "Pix", label: "Pix", description: "Pagamento instantâneo", icon: QrCode },
  { id: "CreditCard", label: "Cartão de crédito", description: "Na maquininha, no atendimento", icon: CreditCard },
  { id: "DebitCard", label: "Cartão de débito", description: "Na maquininha, no atendimento", icon: Landmark },
  { id: "Cash", label: "Dinheiro", description: "Pago em espécie, no atendimento", icon: Banknote },
];

export function getPaymentMethod(id) {
  return PAYMENT_METHODS.find((method) => method.id === id) ?? null;
}

export function paymentMethodLabel(id) {
  return getPaymentMethod(id)?.label ?? "Não informado";
}
