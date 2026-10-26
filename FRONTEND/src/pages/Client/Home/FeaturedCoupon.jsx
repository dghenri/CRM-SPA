import { useEffect, useState } from "react";
import { Button, Chip } from "@heroui/react";
import { Check, Copy, Ticket } from "lucide-react";
import api from "../../../api/api";
import { calendarDaysFromNow, pickFeaturedCoupon } from "./homeUtils";

const DISCOUNT_LABEL = {
  Percentage: (c) => `${c.discountValue}% de desconto`,
  Fixed: (c) => `R$ ${Number(c.discountValue).toFixed(2)} de desconto`,
};

// Cupom em destaque na Home: o disponível que vence primeiro (urgência converte).
// Não aparece se o cliente não tem nenhum cupom válido. A lista completa fica no atalho "Cupons".
export default function FeaturedCoupon() {
  const [coupon, setCoupon] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .get("/coupons/me")
      .then((list) => !cancelled && setCoupon(pickFeaturedCoupon(list)))
      .catch((error) => console.error(error)); // a Home segue sem o cupom
    return () => {
      cancelled = true;
    };
  }, []);

  if (!coupon) return null;

  const daysLeft = coupon.expiresAt ? calendarDaysFromNow(coupon.expiresAt) : null;
  const urgent = daysLeft !== null && daysLeft <= 5;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(coupon.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (error) {
      console.error("Não foi possível copiar o cupom:", error);
    }
  }

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-dashed border-border bg-overlay p-4 drop-shadow-sm">
      <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-accent/10">
        <Ticket className="size-6 text-accent" />
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">
          {coupon.description || DISCOUNT_LABEL[coupon.discountType]?.(coupon) || "Cupom disponível"}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            onPress={handleCopy}
            aria-label={`Copiar código ${coupon.code}`}
            className="h-auto gap-1.5 rounded-md border border-dashed border-border px-2 py-0.5 font-mono text-xs font-bold"
          >
            {coupon.code}
            {copied ? <Check size={12} className="text-success" /> : <Copy size={12} className="text-muted" />}
          </Button>
          {daysLeft !== null && (
            <Chip size="sm" variant="soft" color={urgent ? "danger" : "default"}>
              {daysLeft <= 0 ? "Vence hoje" : daysLeft === 1 ? "Vence amanhã" : `Vence em ${daysLeft} dias`}
            </Chip>
          )}
        </div>
      </div>
    </div>
  );
}
