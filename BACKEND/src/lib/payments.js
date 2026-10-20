// Formas de pagamento aceitas - precisa bater com o enum PaymentMethod do schema.prisma
export const PAYMENT_METHODS = ["Pix", "CreditCard", "DebitCard", "Cash"];

export function isPaymentMethod(value) {
  return PAYMENT_METHODS.includes(value);
}
