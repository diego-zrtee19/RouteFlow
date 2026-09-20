export function TrustSignals() {
  return (
    <div className="bg-zinc-50 rounded-2xl p-6 border border-zinc-200">
      <div className="flex items-center justify-center gap-8 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center">
            <span className="text-emerald-600 text-sm">🔒</span>
          </div>
          <div>
            <p className="text-xs font-semibold text-zinc-900">Escrow Protegido</p>
            <p className="text-[10px] text-zinc-500">Pago garantizado</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
            <span className="text-blue-600 text-sm">🛡️</span>
          </div>
          <div>
            <p className="text-xs font-semibold text-zinc-900">RouteFlow Secure</p>
            <p className="text-[10px] text-zinc-500">Transacción segura</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <div className="w-6 h-4 bg-zinc-300 rounded opacity-60"></div>
            <div className="w-6 h-4 bg-zinc-300 rounded opacity-60"></div>
            <div className="w-6 h-4 bg-zinc-300 rounded opacity-60"></div>
          </div>
          <div>
            <p className="text-xs font-semibold text-zinc-900">Tarjetas</p>
            <p className="text-[10px] text-zinc-500">Visa, MC, Amex</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-zinc-100 flex items-center justify-center">
            <span className="text-zinc-600 text-sm">✓</span>
          </div>
          <div>
            <p className="text-xs font-semibold text-zinc-900">SSL 256-bit</p>
            <p className="text-[10px] text-zinc-500">Encriptación</p>
          </div>
        </div>
      </div>
    </div>
  );
}
