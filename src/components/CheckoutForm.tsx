"use client";

import { useState, useEffect } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

function FormularioInterno({ onSuccess }: { onSuccess: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [isProcessing, setIsProcessing] = useState(false);
  const [message, setMessage] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    setIsProcessing(true);
    
    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      confirmParams: {},
      redirect: "if_required",
    });

    if (error) {
      setMessage(error.message ?? "Ocurrió un error con la tarjeta.");
    } else if (paymentIntent && paymentIntent.status === "succeeded") {
      setMessage("¡Pago exitoso! 🎉");
      onSuccess();
    }
    
    setIsProcessing(false);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <PaymentElement />
      <button
        disabled={isProcessing || !stripe || !elements}
        className="w-full bg-indigo-600 text-white font-black py-3 px-4 rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-all duration-300 shadow-md shadow-indigo-500/30"
      >
        {isProcessing ? "Procesando pago..." : "Pagar Seguro"}
      </button>
      {message && (
        <div className={`text-sm font-bold text-center mt-4 ${message.includes("exitoso") ? "text-emerald-500" : "text-red-500"}`}>
          {message}
        </div>
      )}
    </form>
  );
}

export function CheckoutForm({ amount, orderCode, onSuccess }: { amount: number, orderCode: string, onSuccess: () => void }) {
  const [clientSecret, setClientSecret] = useState("");

  useEffect(() => {
    fetch("/api/create-payment-intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount, orderCode }),
    })
      .then((res) => res.json())
      .then((data) => setClientSecret(data.clientSecret))
      .catch((err) => console.error("Error pidiendo autorización a Stripe:", err));
  }, [amount, orderCode]);

  if (!clientSecret) {
    return (
      <div className="text-center text-slate-500 py-12 animate-pulse font-medium">
        Cargando pasarela de pago segura...
      </div>
    );
  }

  return (
    <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-lg">
      <Elements stripe={stripePromise} options={{ clientSecret, appearance: { theme: 'stripe' } }}>
        <FormularioInterno onSuccess={onSuccess} />
      </Elements>
    </div>
  );
}