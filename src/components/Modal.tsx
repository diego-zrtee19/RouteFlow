interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  message: string;
  type?: "success" | "info" | "error";
}

export function Modal({
  isOpen,
  onClose,
  title,
  message,
  type = "success",
}: ModalProps) {
  if (!isOpen) return null;

  const colors = {
    success: {
      bg: "bg-emerald-600",
      ring: "ring-emerald-500/30",
      btn: "bg-zinc-900 hover:bg-zinc-800",
      icon: "✓",
    },
    info: {
      bg: "bg-zinc-900",
      ring: "ring-zinc-500/30",
      btn: "bg-zinc-900 hover:bg-zinc-800",
      icon: "ℹ",
    },
    error: {
      bg: "bg-red-600",
      ring: "ring-red-500/30",
      btn: "bg-zinc-900 hover:bg-zinc-800",
      icon: "✕",
    },
  }[type];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden animate-in zoom-in-95 duration-200 border border-zinc-200">
        <div className={`${colors.bg} p-8 flex items-center justify-center`}>
          <div
            className={`w-20 h-20 rounded-full bg-white/20 ring-8 ${colors.ring} flex items-center justify-center text-white text-4xl font-bold`}
          >
            {colors.icon}
          </div>
        </div>
        <div className="p-8 text-center">
          <h3 className="text-xl font-bold text-zinc-900 mb-3">{title}</h3>
          <p className="text-zinc-600 mb-8 leading-relaxed">{message}</p>
          <button
            onClick={onClose}
            className={`w-full py-4 rounded-xl text-white font-semibold transition-all ${colors.btn} active:scale-[0.98]`}
          >
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
}
