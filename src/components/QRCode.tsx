"use client";

import ReactQRCode from "react-qr-code";

interface QRCodeProps {
  /** Valor codificado en el QR (típicamente order.qrSeed) */
  value: string;
  size?: number;
  /** @deprecated Usa `value`. Se mantiene por compatibilidad con seed. */
  seed?: string;
}

/**
 * Wrapper de react-qr-code para RouteFlow.
 * Preferir: <QRCode value={order.qrSeed} size={128} />
 */
export function QRCode({ value, seed, size = 128 }: QRCodeProps) {
  const payload = value || seed || "";

  return (
    <div
      className="bg-white p-2 rounded-xl shadow-inner border border-gray-200 inline-flex items-center justify-center"
      style={{ width: size + 16, height: size + 16 }}
    >
      <ReactQRCode value={payload} size={size} level="H" />
    </div>
  );
}
