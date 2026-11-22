"use client";
import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { MessageInbox, type MessagingChannel } from "@/components/dashboard/MessageInbox";
import { buttonStyles } from "@/components/ui/Button";
function Messages() {
  const [channel, setChannel] = useState<MessagingChannel>("instagram");
  useEffect(() => {
    const read = () =>
      setChannel(
        new URL(window.location.href).searchParams.get("channel") === "whatsapp"
          ? "whatsapp"
          : "instagram",
      );
    read();
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, []);
  function choose(next: MessagingChannel) {
    if (next === channel) return;
    const url = new URL(window.location.href);
    url.searchParams.set("channel", next);
    url.searchParams.delete("sender");
    window.history.replaceState(null, "", url);
    setChannel(next);
  }
  return (
    <>
      <nav aria-label="Canales de mensajes" className="mb-6 flex flex-wrap gap-2">
        {(["instagram", "whatsapp"] as const).map((value) => (
          <button
            type="button"
            key={value}
            aria-pressed={channel === value}
            onClick={() => choose(value)}
            className={buttonStyles({
              size: "sm",
              variant: channel === value ? "primary" : "secondary",
            })}
          >
            {value === "instagram" ? "Instagram" : "WhatsApp"}
          </button>
        ))}
      </nav>
      <MessageInbox channel={channel} />
    </>
  );
}
export default function MessagesPage() {
  const { userId } = useAuth();
  return <DashboardLayout>{userId && <Messages key={userId} />}</DashboardLayout>;
}
