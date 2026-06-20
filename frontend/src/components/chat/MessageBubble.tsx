import { Copy, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { MarkdownMessage } from "@/components/chat/MarkdownMessage";
import { cn } from "@/lib/cn";
import type { ChatMessage } from "@/types/api";

interface MessageBubbleProps {
  message: ChatMessage;
  onRegenerate?: () => void;
}

export function MessageBubble({ message, onRegenerate }: MessageBubbleProps) {
  const isAssistant = message.role === "ASSISTANT";
  const isComplete = message.status === "COMPLETED" && Boolean(message.content.trim());

  const handleCopy = async () => {
    await navigator.clipboard.writeText(message.content);
    toast.success("Message copied.");
  };

  return (
    <article className={cn("flex", isAssistant ? "justify-start" : "justify-end")}>
      <div
        className={cn(
          "max-w-[90%] rounded-3xl border px-5 py-4 shadow-sm md:max-w-[78%]",
          isAssistant
            ? "liquid-row"
            : "border-white/35 bg-[linear-gradient(135deg,hsl(var(--primary)),hsl(var(--liquid-aqua)))] text-primary-foreground shadow-primary/20",
        )}
      >
        <div className="prose prose-sm max-w-none dark:prose-invert">
          <MarkdownMessage content={message.content || "Thinking..."} />
        </div>
        {isAssistant && isComplete && (
          <div className="mt-3 flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={handleCopy}>
              <Copy className="h-4 w-4" />
              Copy
            </Button>
            {onRegenerate && (
              <Button variant="ghost" size="sm" onClick={onRegenerate}>
                <RotateCcw className="h-4 w-4" />
                Regenerate
              </Button>
            )}
          </div>
        )}
      </div>
    </article>
  );
}
