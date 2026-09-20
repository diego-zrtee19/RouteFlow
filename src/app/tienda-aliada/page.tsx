"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function TiendaAliadaPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    nombreEstablecimiento: "",
    giroNegocio: "",
    direccion: "",
    colonia: "",
    nombreResponsable: "",
    whatsapp: "",
    ineFile: null as File | null,
    comprobanteFile: null as File | null,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    // Simular envío a backend
    await new Promise((resolve) => setTimeout(resolve, 2000));

    setIsSubmitting(false);
    setSubmitted(true);
  };

  const handleFileChange = (field: "ineFile" | "comprobanteFile", file: File | null) => {
    setFormData((prev) => ({ ...prev, [field]: file }));
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-zinc-50 text-zinc-900 font-sans">
        <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-xl border-b border-zinc-200 shadow-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
            <a href="/" className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-zinc-900 flex items-center justify-center text-white font-black text-xl">
                R
              </div>
              <span className="font-extrabold text-lg text-zinc-900">RouteFlow</span>
            </a>
            <span className="font-semibold text-zinc-600">Registro Tienda Aliada</span>
          </div>
        </header>

        <main className="max-w-2xl mx-auto px-4 sm:px-6 py-16">
          <div className="bg-white rounded-2xl border border-zinc-200 p-8 text-center">
            <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-emerald-100 flex items-center justify-center">
              <span className="text-4xl">🛡️</span>
            </div>
            <h1 className="text-3xl font-black text-zinc-900 mb-4">
              ¡Solicitud Enviada con Éxito!
            </h1>
            <p className="text-lg text-zinc-600 mb-6">
              Tu solicitud para convertirte en Punto Route ha sido recibida. Nuestro equipo de validación revisará tu información.
            </p>
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-6 mb-8">
              <p className="font-semibold text-emerald-800 mb-2">
                ⏱️ Tiempo de respuesta
              </p>
              <p className="text-emerald-700">
                Recibirás respuesta en menos de 24 horas. Te contactaremos por WhatsApp al número proporcionado.
              </p>
            </div>
            <button
              onClick={() => router.push("/")}
              className="px-8 py-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-black text-lg transition-all"
            >
              Volver al Inicio
            </button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 font-sans">
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-xl border-b border-zinc-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <a href="/" className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-zinc-900 flex items-center justify-center text-white font-black text-xl">
              R
            </div>
            <span className="font-extrabold text-lg text-zinc-900">RouteFlow</span>
          </a>
          <span className="font-semibold text-zinc-600">Registro Tienda Aliada</span>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-12">
        {/* Hero de la página */}
        <div className="text-center mb-12">
          <h1 className="text-4xl sm:text-5xl font-black text-zinc-900 mb-4">
            Convierte tu mostrador en un{" "}
            <span className="bg-gradient-to-r from-blue-600 to-emerald-500 bg-clip-text text-transparent">
              Punto Route
            </span>
          </h1>
          <p className="text-lg text-zinc-600 max-w-xl mx-auto">
            Gana dinero extra por resguardar y entregar paquetes seguros en tu colonia. Cero inversión, 100% verificado.
          </p>
        </div>

        {/* Formulario de Vetting y Seguridad */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Información del Negocio */}
          <div className="bg-white rounded-2xl border border-zinc-200 p-6">
            <h2 className="text-xl font-black text-zinc-900 mb-6 flex items-center gap-2">
              <span className="text-2xl">🏪</span>
              Información del Negocio
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-zinc-700 mb-2">
                  Nombre del establecimiento
                </label>
                <input
                  type="text"
                  value={formData.nombreEstablecimiento}
                  onChange={(e) => setFormData({ ...formData, nombreEstablecimiento: e.target.value })}
                  placeholder="Ej. Abarrotes Don Pepe"
                  required
                  className="w-full px-4 py-3 rounded-lg border border-zinc-200 focus:border-zinc-400 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-zinc-700 mb-2">
                  Giro del negocio
                </label>
                <select
                  value={formData.giroNegocio}
                  onChange={(e) => setFormData({ ...formData, giroNegocio: e.target.value })}
                  required
                  className="w-full px-4 py-3 rounded-lg border border-zinc-200 focus:border-zinc-400 focus:outline-none"
                >
                  <option value="">Selecciona el giro</option>
                  <option value="abarrotes">Abarrotes</option>
                  <option value="papeleria">Papelería</option>
                  <option value="farmacia">Farmacia</option>
                  <option value="ciber">Ciber</option>
                  <option value="otro">Otro</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-bold text-zinc-700 mb-2">
                  Dirección exacta
                </label>
                <input
                  type="text"
                  value={formData.direccion}
                  onChange={(e) => setFormData({ ...formData, direccion: e.target.value })}
                  placeholder="Calle, número, entre calles"
                  required
                  className="w-full px-4 py-3 rounded-lg border border-zinc-200 focus:border-zinc-400 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-zinc-700 mb-2">
                  Colonia (Zapopan / Guadalajara)
                </label>
                <input
                  type="text"
                  value={formData.colonia}
                  onChange={(e) => setFormData({ ...formData, colonia: e.target.value })}
                  placeholder="Ej. Zapopan Centro, Providencia, etc."
                  required
                  className="w-full px-4 py-3 rounded-lg border border-zinc-200 focus:border-zinc-400 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Información del Responsable */}
          <div className="bg-white rounded-2xl border border-zinc-200 p-6">
            <h2 className="text-xl font-black text-zinc-900 mb-6 flex items-center gap-2">
              <span className="text-2xl">👤</span>
              Información del Responsable
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-zinc-700 mb-2">
                  Nombre completo del responsable
                </label>
                <input
                  type="text"
                  value={formData.nombreResponsable}
                  onChange={(e) => setFormData({ ...formData, nombreResponsable: e.target.value })}
                  placeholder="Nombre(s) y apellidos"
                  required
                  className="w-full px-4 py-3 rounded-lg border border-zinc-200 focus:border-zinc-400 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-zinc-700 mb-2">
                  WhatsApp de contacto
                </label>
                <input
                  type="tel"
                  value={formData.whatsapp}
                  onChange={(e) => setFormData({ ...formData, whatsapp: e.target.value })}
                  placeholder="+52 33 1234 5678"
                  required
                  className="w-full px-4 py-3 rounded-lg border border-zinc-200 focus:border-zinc-400 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Filtro de Seguridad - Trust & Safety */}
          <div className="bg-white rounded-2xl border border-zinc-200 p-6">
            <h2 className="text-xl font-black text-zinc-900 mb-6 flex items-center gap-2">
              <span className="text-2xl">🛡️</span>
              Filtro de Seguridad (Trust & Safety)
            </h2>

            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
              <p className="text-sm text-blue-800 font-semibold mb-2">
                🔒 Verificación Obligatoria
              </p>
              <p className="text-sm text-blue-700">
                Para garantizar que la tienda es 100% real y evitar fraudes logísticos, requerimos documentación oficial.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-zinc-700 mb-2">
                  INE del dueño (foto o PDF)
                </label>
                <input
                  type="file"
                  accept="image/*,.pdf"
                  onChange={(e) => handleFileChange("ineFile", e.target.files?.[0] || null)}
                  required
                  className="w-full px-4 py-3 rounded-lg border border-zinc-200 focus:border-zinc-400 focus:outline-none file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-zinc-100 file:text-zinc-700 hover:file:bg-zinc-200"
                />
                <p className="text-xs text-zinc-500 mt-1">
                  Solo aceptamos INE vigente. La información será tratada con máxima confidencialidad.
                </p>
              </div>

              <div>
                <label className="block text-sm font-bold text-zinc-700 mb-2">
                  Comprobante de domicilio del local (PDF o imagen)
                </label>
                <input
                  type="file"
                  accept="image/*,.pdf"
                  onChange={(e) => handleFileChange("comprobanteFile", e.target.files?.[0] || null)}
                  required
                  className="w-full px-4 py-3 rounded-lg border border-zinc-200 focus:border-zinc-400 focus:outline-none file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-zinc-100 file:text-zinc-700 hover:file:bg-zinc-200"
                />
                <p className="text-xs text-zinc-500 mt-1">
                  Recibo de luz, agua o predial no mayor a 3 meses de antigüedad.
                </p>
              </div>
            </div>
          </div>

          {/* Botón de envío */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-black text-lg transition-all active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-3"
          >
            {isSubmitting ? (
              <>
                <span className="inline-block w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Enviando solicitud...
              </>
            ) : (
              <>
                <span className="text-xl">📩</span>
                Enviar solicitud de aliado
              </>
            )}
          </button>

          <p className="text-center text-sm text-zinc-500">
            Al enviar este formulario, aceptas nuestros términos y condiciones de privacidad.
          </p>
        </form>
      </main>
    </div>
  );
}
