"use client";

import { ConnectSetup } from "@/components/dashboard/ConnectSetup";
import React, { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Check } from "lucide-react";
import { useI18n } from "@/i18n/LanguageProvider";
import { LanguageSwitcher } from "@/components/shared/LanguageSwitcher";

interface Seller {
  id: string;
  businessName: string;
  bio: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  shippingAddress?: Record<string, string> | null;
}

export default function SettingsPage() {
  const { t } = useI18n();
  const [seller, setSeller] = useState<Seller | null>(null);
  const [businessName, setBusinessName] = useState("");
  const [bio, setBio] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [origin, setOrigin] = useState<Record<string, string>>({
    fullName: "",
    phone: "",
    street: "",
    city: "",
    state: "",
    postalCode: "",
    country: "",
  });
  const [error, setError] = useState("");
  const [fedex, setFedex] = useState<{
    configured: boolean;
    testMode: boolean;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/dashboard/me", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled) return;
        if (data?.seller) {
          setSeller(data.seller);
          setFedex(data.fedex ?? null);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  // Seed the form once the seller arrives, so the inputs are not permanently
  // bound to the empty initial state.
  useEffect(() => {
    if (!seller) return;
    setBusinessName(seller.businessName);
    setBio(seller.bio || "");
    setEmail(seller.contactEmail || "");
    setPhone(seller.contactPhone || "");
    if (seller.shippingAddress) setOrigin(seller.shippingAddress);
  }, [seller]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!seller || saving) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/dashboard/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessName,
          bio,
          contactEmail: email,
          contactPhone: phone,
          ...(Object.values(origin).some(Boolean)
            ? { shippingAddress: origin }
            : {}),
        }),
      });

      if (res.ok) {
        const updated = await res.json();
        if (updated?.seller) setSeller(updated.seller);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
        setError("");
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error?.message || "No se pudieron guardar los cambios");
      }
    } catch {
      setError(t("productForm.errorNetwork"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-2xl space-y-6">
        <ConnectSetup />
        <div>
          <h1 className="text-2xl font-extrabold text-[#0B1220]">
            {t("dashboard.settings.title")}
          </h1>
          <p className="text-sm text-slate-500">
            {t("dashboard.settings.subtitle")}
          </p>
        </div>

        <Card className="p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-5 mb-5 border-b border-slate-100">
            <div>
              <h2 className="text-sm font-bold text-[#0B1220]">
                {t("dashboard.settings.language")}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {t("dashboard.settings.languageHint")}
              </p>
            </div>
            <LanguageSwitcher showNames />
          </div>

          <form onSubmit={handleSave} className="space-y-4">
            <Input
              label={t("dashboard.settings.businessName")}
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              required
            />
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
                {t("dashboard.settings.bio")}
              </label>
              <textarea
                className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm text-[#0B1220] h-20"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Input
                label={t("dashboard.settings.contactEmail")}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <Input
                label={t("dashboard.settings.contactPhone")}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>

            <h2 className="font-semibold">Origen de los envíos FedEx</h2>
            {fedex && (
              <p className="text-sm text-slate-600">
                FedEx:{" "}
                {!fedex.configured
                  ? "faltan credenciales"
                  : fedex.testMode
                    ? "modo de pruebas (sandbox)"
                    : "producción configurada; conexión pendiente de validación"}
                .
              </p>
            )}
            {origin.fullName?.includes("DEMO") && (
              <p className="text-sm text-amber-700">
                Dirección ficticia de demostración. Sustitúyela por tu dirección
                real antes de utilizar FedEx en producción.
              </p>
            )}
            <p className="text-sm text-slate-500">
              Completa estos datos antes de generar una etiqueta.
            </p>
            {Object.entries({
              fullName: "Nombre del remitente",
              phone: "Teléfono del remitente",
              street: "Calle y número",
              city: "Ciudad",
              state: "Código del estado",
              postalCode: "Código postal",
              country: "Código del país (MX, US)",
            }).map(([key, label]) => (
              <Input
                key={key}
                label={label}
                value={origin[key] || ""}
                onChange={(e) =>
                  setOrigin((current) => ({
                    ...current,
                    [key]: e.target.value,
                  }))
                }
              />
            ))}
            {error && (
              <p role="alert" className="text-red-600">
                {error}
              </p>
            )}
            <div className="pt-2">
              <Button
                type="submit"
                size="md"
                isLoading={saving}
                disabled={!seller || saving}
              >
                {saved ? (
                  <Check className="w-4 h-4 mr-1 text-emerald-300" />
                ) : null}
                {saved
                  ? t("dashboard.settings.saved")
                  : t("dashboard.settings.save")}
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </DashboardLayout>
  );
}
