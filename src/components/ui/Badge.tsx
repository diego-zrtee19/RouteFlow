"use client";

import React from "react";
import { OrderStatus, PaymentStatus, ShipmentStatus } from "@/domain/types";
import { useI18n } from "@/i18n/LanguageProvider";

interface BadgeProps {
  children: React.ReactNode;
  variant?: "default" | "success" | "warning" | "error" | "blue" | "slate";
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = "default",
  className = "",
}) => {
  const styles = {
    default: "bg-slate-100 text-slate-800 border-slate-200",
    success: "bg-emerald-50 text-emerald-700 border-emerald-200",
    warning: "bg-amber-50 text-amber-700 border-amber-200",
    error: "bg-rose-50 text-rose-700 border-rose-200",
    blue: "bg-blue-50 text-blue-700 border-blue-200",
    slate: "bg-slate-50 text-slate-600 border-slate-200",
  };

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${styles[variant]} ${className}`}
    >
      {children}
    </span>
  );
};

export const OrderStatusBadge: React.FC<{ status: OrderStatus }> = ({ status }) => {
  const { t } = useI18n();
  const label = t(`status.${status}`);

  switch (status) {
    case "COMPLETED":
    case "BUYER_CONFIRMED":
      return <Badge variant="success">{label}</Badge>;
    case "PAID":
      return <Badge variant="blue">{label}</Badge>;
    case "READY_TO_SHIP":
      // `PROCESSING` was a V1-only status with no counterpart in the V3 state
      // machine, so it could never render and its branch was dead.
      return <Badge variant="warning">{label}</Badge>;
    case "SHIPPED":
    case "IN_TRANSIT":
      return <Badge variant="blue">{label}</Badge>;
    case "DELIVERED":
      return <Badge variant="success">{label}</Badge>;
    case "CANCELLED":
    case "REFUNDED":
      // `REFUND_REQUESTED` was V1-only; a V3 order goes straight to REFUNDED.
      return <Badge variant="error">{label}</Badge>;
    case "DISPUTED":
      return <Badge variant="error">{label}</Badge>;
    case "PAYMENT_PENDING":
    case "CREATED":
    default:
      return <Badge variant="slate">{label}</Badge>;
  }
};

export const PaymentStatusBadge: React.FC<{ status: PaymentStatus }> = ({ status }) => {
  const { t } = useI18n();
  const label = t(`status.payment.${status}`);

  switch (status) {
    case "SUCCEEDED":
      return <Badge variant="success">{label}</Badge>;
    case "AUTHORIZED":
    case "PENDING":
      return <Badge variant="warning">{label}</Badge>;
    case "FAILED":
      return <Badge variant="error">{label}</Badge>;
    case "REFUNDED":
      return <Badge variant="slate">{label}</Badge>;
    default:
      return <Badge variant="slate">{label}</Badge>;
  }
};

export const ShipmentStatusBadge: React.FC<{ status: ShipmentStatus }> = ({ status }) => {
  const { t } = useI18n();
  const label = t(`status.shipment.${status}`);

  switch (status) {
    case "DELIVERED":
      return <Badge variant="success">{label}</Badge>;
    case "OUT_FOR_DELIVERY":
      return <Badge variant="warning">{label}</Badge>;
    case "IN_TRANSIT":
      return <Badge variant="blue">{label}</Badge>;
    case "PICKED_UP":
    case "LABEL_CREATED":
      return <Badge variant="slate">{label}</Badge>;
    case "FAILED":
    case "CANCELLED":
      return <Badge variant="error">{label}</Badge>;
    default:
      return <Badge variant="slate">{label}</Badge>;
  }
};

