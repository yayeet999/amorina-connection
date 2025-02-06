
import { cn } from "@/lib/utils";

interface ChatBubbleProps {
  message: string;
  isUser: boolean;
}

export function ChatBubble({ message, isUser }: ChatBubbleProps) {
  return (
    <div
      className={cn(
        "max-w-[80%] p-3 rounded-2xl mb-2",
        "animate-fade-in",
        isUser ? 
          "ml-auto bg-primary text-primary-foreground rounded-br-sm" : 
          "mr-auto bg-secondary text-secondary-foreground rounded-bl-sm"
      )}
    >
      {message}
    </div>
  );
}
