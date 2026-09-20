"use client";

import { useState, useRef, useEffect } from "react";

export function RouteDropdown() {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="px-3 py-2 text-sm font-semibold rounded-full transition-all duration-300 hover:bg-zinc-100 hover:text-zinc-900 text-zinc-600 flex items-center gap-2"
      >
        <span>🏪</span>
        <span className="hidden sm:inline">Puntos Route</span>
        <span className={`text-zinc-400 transition-transform ${isOpen ? "rotate-180" : ""}`}>
          ▾
        </span>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-64 bg-white rounded-xl border border-zinc-200 shadow-xl py-2 z-50 animate-fade-in-up">
          <div className="px-4 py-2 border-b border-zinc-100">
            <p className="text-xs font-bold text-zinc-500 uppercase tracking-wide">
              Para Tiendas Aliadas
            </p>
          </div>
          
          <a
            href="/tienda-aliada"
            onClick={() => setIsOpen(false)}
            className="w-full px-4 py-3 text-left hover:bg-zinc-50 transition-colors flex items-center gap-3 block"
          >
            <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-600">
              🏪
            </div>
            <div>
              <p className="text-sm font-semibold text-zinc-900">
                Únete como Tienda Aliada
              </p>
              <p className="text-xs text-zinc-500">
                Conviértete en Punto Route
              </p>
            </div>
          </a>

          <a
            href="/punto-route"
            onClick={() => setIsOpen(false)}
            className="w-full px-4 py-3 text-left hover:bg-zinc-50 transition-colors flex items-center gap-3 block"
          >
            <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center text-blue-600">
              🔐
            </div>
            <div>
              <p className="text-sm font-semibold text-zinc-900">
                Panel de Socio
              </p>
              <p className="text-xs text-zinc-500">
                Login para Puntos Route
              </p>
            </div>
          </a>

          <div className="px-4 py-2 border-t border-zinc-100 mt-2">
            <p className="text-xs text-zinc-400 text-center">
              🛡️ Protección RouteFlow Escrow
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
