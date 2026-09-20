import { Order } from "@/lib/types";
import QRCode from "react-qr-code";

interface AppleWalletQRProps {
  order: Order;
}

export function AppleWalletQR({ order }: AppleWalletQRProps) {
  return (
    <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-3xl p-8 max-w-sm mx-auto shadow-2xl">
      {/* Apple Wallet Style Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center">
            <span className="text-2xl">🛡️</span>
          </div>
          <div>
            <p className="text-white font-black text-sm">RouteFlow</p>
            <p className="text-slate-400 text-xs">Pago Protegido</p>
          </div>
        </div>
        <div className="px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/50">
          <p className="text-emerald-400 text-xs font-bold">ACTIVO</p>
        </div>
      </div>

      {/* QR Code - Extra Grande y Centrado */}
      <div className="bg-white rounded-2xl p-6 mb-6 flex items-center justify-center">
        <QRCode value={order.qrSeed} size={180} level="H" />
      </div>

      {/* Información Minimalista */}
      <div className="space-y-4">
        <div className="text-center">
          <p className="text-white font-black text-2xl mb-1">{order.productName}</p>
          <p className="text-slate-400 text-sm">Código: {order.orderCode}</p>
        </div>

        <div className="border-t border-slate-700 pt-4">
          <div className="flex items-center justify-between text-sm">
            <div>
              <p className="text-slate-400 text-xs uppercase tracking-wide mb-1">Punto de Recolección</p>
              <p className="text-white font-semibold">{order.assignedStore}</p>
            </div>
            <div className="text-right">
              <p className="text-slate-400 text-xs uppercase tracking-wide mb-1">Total</p>
              <p className="text-emerald-400 font-black text-xl">${order.price.toFixed(2)}</p>
            </div>
          </div>
        </div>

        <div className="bg-slate-800/50 rounded-xl p-4 text-center">
          <p className="text-white text-sm font-semibold">
            Muestra este código en el mostrador
          </p>
          <p className="text-slate-400 text-xs mt-1">
            El escáner validará tu identidad
          </p>
        </div>
      </div>
    </div>
  );
}
