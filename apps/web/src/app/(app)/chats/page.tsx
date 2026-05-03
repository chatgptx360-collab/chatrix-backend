import { MessageCircle } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";

/**
 * Chat-room placeholder. The sidebar always shows the chat list; this page
 * fills the main pane when no chat is selected.
 */
export default function ChatsIndexPage() {
  return (
    <div className="flex-1 flex items-center justify-center bg-bg">
      <div className="text-center max-w-sm px-6">
        <div className="mx-auto h-14 w-14 rounded-2xl bg-brand-gradient/15 flex items-center justify-center mb-4">
          <MessageCircle size={28} className="text-primary" />
        </div>
        <h2 className="text-2xl font-semibold tracking-tight text-fg">Pick a conversation</h2>
        <p className="mt-2 text-muted leading-relaxed">
          Select a chat from the sidebar to start messaging — or hit the <span className="text-fg font-semibold">+</span> button to find a friend on Chatrix.
        </p>
      </div>
    </div>
  );
}
