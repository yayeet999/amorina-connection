
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Redis } from 'https://deno.land/x/upstash_redis@v1.22.0/mod.ts';

const redis = new Redis({
  url: Deno.env.get('UPSTASH_REDIS_REST_URL')!,
  token: Deno.env.get('UPSTASH_REDIS_REST_TOKEN')!,
});

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Test Redis connection
    try {
      await redis.ping();
      console.log('Redis connection successful');
    } catch (redisError) {
      console.error('Redis connection failed:', redisError);
      throw new Error('Redis connection failed');
    }

    const { userId, action, message } = await req.json();
    console.log('Received request:', { userId, action, message });

    if (!userId) {
      console.error('Missing userId in request');
      throw new Error('User ID is required');
    }

    const key = `chat:${userId}:messages`;
    console.log('Redis key:', key);

    if (action === 'store') {
      if (!message?.content) {
        console.error('Missing content in message');
        throw new Error('Message content is required');
      }

      // Create message object with the simplified structure
      const messageToStore = {
        type: message.isUser ? 'user' : 'assistant',
        content: message.content,
        timestamp: Date.now()
      };

      console.log('Storing message:', messageToStore);
      
      // Store message as JSON string
      const pushResult = await redis.lpush(key, JSON.stringify(messageToStore));
      console.log('Redis push result:', pushResult);

      const currentLength = await redis.llen(key);
      console.log('Current list length after store:', currentLength);

      // Trim to last 100 messages
      await redis.ltrim(key, 0, 99);

      return new Response(
        JSON.stringify({ success: true }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200
        }
      );
    }

    if (action === 'retrieve') {
      console.log('Fetching messages for user:', userId);
      
      const listLength = await redis.llen(key);
      console.log('Total messages in Redis:', listLength);
      
      // Get messages from Redis (already in reverse chronological order due to LPUSH)
      const rawMessages = await redis.lrange(key, 0, 99);
      console.log('Retrieved messages from Redis:', rawMessages.length);

      // Parse messages and convert to frontend format
      const messages = rawMessages.map(msg => {
        try {
          const parsed = typeof msg === 'string' ? JSON.parse(msg) : msg;
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
          console.error('Failed to parse message:', msg, e);
          return null;
        }
      }).filter(Boolean);

      console.log('Successfully parsed messages count:', messages.length);

      // No need to reverse here - messages are already in reverse chronological order due to LPUSH
      return new Response(
        JSON.stringify({ 
          success: true, 
          messages: messages 
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200
        }
      );
    }

    console.error('Invalid action requested:', action);
    throw new Error('Invalid action');

  } catch (error) {
    console.error('Error in messages function:', error);
    
    return new Response(
      JSON.stringify({ 
        error: error.message,
        details: error.stack,
        timestamp: new Date().toISOString()
      }),
      { 
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
