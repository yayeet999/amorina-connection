
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const UPSTASH_URL = Deno.env.get('UPSTASH_REDIS_REST_URL');
const UPSTASH_TOKEN = Deno.env.get('UPSTASH_REDIS_REST_TOKEN');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (!UPSTASH_URL) {
      throw new Error('UPSTASH_REDIS_REST_URL is not configured');
    }
    if (!UPSTASH_TOKEN) {
      throw new Error('UPSTASH_REDIS_REST_TOKEN is not configured');
    }

    const { userId, action, message } = await req.json();
    console.log('Received request:', { userId, action, message });

    if (!userId) {
      throw new Error('User ID is required');
    }

    const messageKey = `chat:${userId}:messages`;
    const headers = {
      Authorization: `Bearer ${UPSTASH_TOKEN}`,
      'Content-Type': 'application/json',
    };

    if (action === 'store') {
      if (!message || !message.content) {
        throw new Error('Message with content is required for store action');
      }

      // Simple message structure
      const messageToStore = {
        type: message.isUser ? 'user' : 'assistant',
        content: message.content,
        timestamp: Date.now()
      };

      console.log('Storing message:', messageToStore);
      
      // Store the message directly in Redis
      const response = await fetch(`${UPSTASH_URL}/lpush/${messageKey}`, {
        method: 'POST',
        headers,
        body: JSON.stringify([JSON.stringify(messageToStore)])
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Redis store error:', errorText);
        throw new Error(`Redis store error: ${errorText}`);
      }

      // Trim to keep only last 100 messages
      await fetch(`${UPSTASH_URL}/ltrim/${messageKey}/0/99`, {
        method: 'POST',
        headers,
        body: JSON.stringify([])
      });

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } 
    
    if (action === 'retrieve') {
      console.log('Retrieving messages for key:', messageKey);
      const response = await fetch(`${UPSTASH_URL}/lrange/${messageKey}/0/99`, {
        method: 'POST',
        headers,
        body: JSON.stringify([])
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Redis retrieve error:', errorText);
        throw new Error(`Redis retrieve error: ${errorText}`);
      }

      const result = await response.json();
      console.log('Raw Redis response:', result);

      // Parse messages and convert to frontend format
      const messages = (result.result || [])
        .map((m: string) => {
          try {
            const parsed = JSON.parse(m);
            if (!parsed.type || !parsed.content || !parsed.timestamp) {
              console.warn('Invalid message format:', parsed);
              return null;
            }
            return {
              content: parsed.content,
              isUser: parsed.type === 'user',
              timestamp: parsed.timestamp
            };
          } catch (e) {
            console.error('Failed to parse message:', m, e);
            return null;
          }
        })
        .filter((m: any) => m !== null);

      console.log('Parsed messages:', messages);

      return new Response(JSON.stringify({ 
        success: true, 
        messages
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    throw new Error('Invalid action');
  } catch (error) {
    console.error('Error in messages function:', error);
    return new Response(JSON.stringify({ 
      error: error.message,
      details: 'An error occurred while processing your request',
      timestamp: new Date().toISOString()
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
