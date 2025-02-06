
import { cn } from "@/lib/utils";

interface ChatBubbleProps {
  message: string;
  isUser: boolean;
}

export function ChatBubble({ message, isUser }: ChatBubbleProps) {
  return (
    <div
      className={cn(
        "max-w-[80%] p-3 rounded-2xl mb-2 shadow-sm",
        "animate-fade-in",
        isUser ? 
          "ml-auto bg-[#FFB6C1] text-white rounded-br-sm" : 
          "mr-auto bg-[#FF69B4] text-white rounded-bl-sm"
      )}
    >
      {message}
    </div>
  );
}
