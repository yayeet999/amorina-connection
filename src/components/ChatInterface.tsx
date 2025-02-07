
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ChatBubble } from "./ChatBubble";
import { ChatInput } from "./ChatInput";
import { TypingIndicator } from "./TypingIndicator";
import { useToast } from "@/hooks/use-toast";

interface Message {
  content: string;
  isUser: boolean;
  timestamp: number;
}

export function ChatInterface() {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const { data: userProfile } = useQuery({
    queryKey: ['userProfile'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();
      
      return profile;
    },
  });

  useEffect(() => {
    const fetchMessages = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          console.log('No user found, skipping message fetch');
          return;
        }

        console.log('Fetching messages for user:', user.id);
        const { data, error } = await supabase.functions.invoke('messages', {
          body: { 
            action: 'retrieve',
            userId: user.id
          },
        });

        if (error) {
          console.error('Error fetching messages:', error);
          throw error;
        }

        if (!data?.messages) {
          console.warn('No messages found in response:', data);
          return;
        }

        console.log('Received messages:', data.messages);
        setMessages([...data.messages].reverse());
      } catch (error) {
        console.error('Error fetching messages:', error);
        toast({
          title: "Error",
          description: "Failed to load chat history. Please try refreshing the page.",
          variant: "destructive",
        });
      }
    };

    fetchMessages();
  }, [toast]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = async (content: string) => {
    try {
      setIsLoading(true);
      
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const userMessage = { content, isUser: true, timestamp: Date.now() };
      setMessages(prev => [...prev, userMessage]);

      // Store message in regular chat history
      const { error: storeError } = await supabase.functions.invoke('messages', {
        body: {
          action: 'store',
          userId: user.id,
          message: userMessage
        },
      });

      if (storeError) throw storeError;

      // Store user message in vector context
      const { error: vectorError } = await supabase.functions.invoke('short_term_vector_context', {
        body: {
          action: 'store',
          userId: user.id,
          message: content
        },
      });

      if (vectorError) {
        console.error('Error storing vector context:', vectorError);
      }

      const { data: counterData, error: counterError } = await supabase.functions.invoke('redis_counter_short', {
        body: { userId: user.id },
      });

      if (counterError) throw counterError;

      if (counterData?.triggerSummary) {
        await supabase.functions.invoke('gemini_summarize_short', {
          body: { userId: user.id },
        });
      }

      // Get vector context before making AI request
      const { data: vectorContext } = await supabase.functions.invoke('short_term_vector_context', {
        body: {
          action: 'get_context',
          userId: user.id
        },
      });

      // Add vector context to the chat request if available
      const chatRequestBody = {
        message: content,
        userProfile,
        vectorContext: vectorContext?.context
      };

      const response = await supabase.functions.invoke('chat', {
        body: chatRequestBody,
      });

      if (response.error) throw new Error(response.error.message);
      
      const aiMessage = {
        content: response.data.reply,
        isUser: false,
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, aiMessage]);

      // Store AI message in regular chat history only (not in vector context)
      const { error: aiStoreError } = await supabase.functions.invoke('messages', {
        body: {
          action: 'store',
          userId: user.id,
          message: aiMessage
        },
      });

      if (aiStoreError) throw aiStoreError;
      
    } catch (error) {
      console.error('Error sending message:', error);
      toast({
        title: "Error",
        description: "Failed to send message. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message, index) => (
          <ChatBubble
            key={message.timestamp + index}
            message={message.content}
            isUser={message.isUser}
          />
        ))}
        {isLoading && <TypingIndicator />}
        <div ref={messagesEndRef} />
      </div>
      <ChatInput onSendMessage={handleSendMessage} isLoading={isLoading} />
    </div>
  );
}
