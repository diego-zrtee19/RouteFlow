export type InstagramThread = { sender_id: string; message_text: string; sent_at: string };
export type InstagramMessage = {
  id: string;
  message_text: string;
  sent_at: string;
  direction: "incoming" | "outgoing";
  status: "received" | "pending" | "sent" | "unknown" | "delivered" | "read" | "failed";
};
export type InstagramInbox = {
  username: string | null;
  repliesEnabled: boolean;
  threads: InstagramThread[];
  hasMore: boolean;
};
