
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Redis } from 'https://deno.land/x/upstash_redis@v1.22.0/mod.ts';
import { Vector } from 'https://deno.land/x/upstash_vector@v0.0.5/mod.ts';

const vector = new Vector({
  url: Deno.env.get('UPSTASH_VECTOR_REST_URL')!,
  token: Deno.env.get('UPSTASH_VECTOR_REST_TOKEN')!,
});

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
    const { action, userId, message } = await req.json();
    console.log('Received request:', { action, userId, message });

    if (!userId) {
      throw new Error('User ID is required');
    }

    const vectorIndex = 'user_messages';
    const redisKey = `user:${userId}:top_context`;

    switch (action) {
      case 'store': {
        if (!message) {
          throw new Error('Message is required for store action');
        }

        // Store message in vector database
        await vector.upsert(vectorIndex, [{
          id: `${userId}-${Date.now()}`,
          metadata: {
            userId,
            timestamp: Date.now(),
            content: message,
          },
          content: message,
        }]);

        // Get all messages for this user
        const userMessages = await vector.query(vectorIndex, {
          topK: 20,
          filter: { userId },
          includeMetadata: true,
        });

        // If more than 20 messages, delete the oldest ones
        if (userMessages.length > 20) {
          const messagesToDelete = userMessages.slice(20);
          await Promise.all(
            messagesToDelete.map(msg => 
              vector.delete(vectorIndex, msg.id)
            )
          );
        }

        // Perform similarity search for top 3 relevant messages
        const similarMessages = await vector.query(vectorIndex, {
          topK: 3,
          vector: message,
          filter: { userId },
          includeMetadata: true,
        });

        // Store top 3 messages in Redis
        const contextMessages = similarMessages.map(msg => msg.metadata.content);
        await redis.set(redisKey, JSON.stringify(contextMessages));

        return new Response(
          JSON.stringify({ 
            success: true, 
            context: contextMessages 
          }),
          { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );
      }

      case 'get_context': {
        // Retrieve context from Redis
        const cachedContext = await redis.get(redisKey);
        const context = cachedContext ? JSON.parse(cachedContext as string) : [];

        return new Response(
          JSON.stringify({ 
            success: true, 
            context 
          }),
          { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );
      }

      default:
        throw new Error(`Invalid action: ${action}`);
    }

  } catch (error) {
    console.error('Error in short_term_vector_context:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message,
        timestamp: new Date().toISOString()
      }),
      { 
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
