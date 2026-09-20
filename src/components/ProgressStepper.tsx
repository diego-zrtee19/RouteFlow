import { Order } from "@/lib/types";

interface ProgressStepperProps {
  currentStatus: Order["status"];
}

export function ProgressStepper({ currentStatus }: ProgressStepperProps) {
  const steps = [
    { status: "escrow", label: "Pago Protegido", icon: "💰" },
    { status: "in_transit", label: "En Ruta", icon: "🚚" },
    { status: "at_store", label: "En Tienda", icon: "🏪" },
    { status: "delivered_pending", label: "Por Confirmar", icon: "⏳" },
    { status: "delivered_confirmed", label: "Completado", icon: "✅" },
  ];

  const currentIndex = steps.findIndex((s) => s.status === currentStatus);

  return (
    <div className="flex items-center justify-between py-4 px-6 bg-zinc-50 rounded-xl border border-zinc-200">
      {steps.map((step, index) => {
        const isCompleted = index < currentIndex;
        const isCurrent = index === currentIndex;
        const isPending = index > currentIndex;

        return (
          <div key={step.status} className="flex items-center flex-1">
            <div className="flex flex-col items-center gap-2">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center text-lg transition-all ${
                  isCompleted
                    ? "bg-emerald-600 text-white"
                    : isCurrent
                    ? "bg-zinc-900 text-white"
                    : "bg-white border-2 border-zinc-200 text-zinc-400"
                }`}
              >
                {isCompleted ? "✓" : step.icon}
              </div>
              <span
                className={`text-xs font-semibold transition-all ${
                  isCompleted
                    ? "text-emerald-700"
                    : isCurrent
                    ? "text-zinc-900"
                    : "text-zinc-400"
                }`}
              >
                {step.label}
              </span>
            </div>
            {index < steps.length - 1 && (
              <div
                className={`flex-1 h-0.5 mx-2 transition-all ${
                  isCompleted ? "bg-emerald-600" : isPending ? "bg-zinc-200" : "bg-zinc-400"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
