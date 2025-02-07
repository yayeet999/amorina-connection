
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Redis } from 'https://deno.land/x/upstash_redis@v1.22.0/mod.ts';
import { Index } from 'npm:@upstash/vector@1.0.2';

const vector = new Index({
  url: Deno.env.get('UPSTASH_VECTOR_REST_URL')!,
  token: Deno.env.get('UPSTASH_VECTOR_REST_TOKEN')!,
  indexName: 'amorine-upstash-vector-short'
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

    const redisKey = `user:${userId}:top_context`;

    switch (action) {
      case 'store': {
        if (!message) {
          throw new Error('Message is required for store action');
        }

        console.log('Attempting to store message in vector database:', {
          userId,
          message
        });

        // Store message in vector database
        const upsertResult = await vector.upsert({
          id: `${userId}-${Date.now()}`,
          vector: Array(384).fill(0.5),
          metadata: {
            user_id: userId,
            content: message,
            timestamp: Date.now(),
          }
        });

        console.log('Vector upsert result:', upsertResult);

        try {
          // Query to find and manage user messages
          const userMessages = await vector.query({
            vector: Array(384).fill(0.5),
            topK: 20,
            includeMetadata: true,
            includeVectors: false,
            filter: JSON.stringify({ user_id: userId })
          });

          console.log('Retrieved user messages:', userMessages);

          if (userMessages.matches && userMessages.matches.length > 20) {
            const messagesToDelete = userMessages.matches.slice(20);
            console.log('Deleting old messages:', messagesToDelete);
            await Promise.all(
              messagesToDelete.map(msg => vector.delete(msg.id))
            );
          }

          // Query for similar messages
          const similarMessages = await vector.query({
            vector: Array(384).fill(0.5),
            topK: 3,
            includeMetadata: true,
            includeVectors: false,
            filter: JSON.stringify({ user_id: userId })
          });

          console.log('Similar messages found:', similarMessages);

          if (similarMessages.matches) {
            const contextMessages = similarMessages.matches
              .map(msg => msg.metadata?.content)
              .filter(Boolean);

            console.log('Storing context in Redis:', contextMessages);
            await redis.set(redisKey, JSON.stringify(contextMessages));
          }

        } catch (queryError) {
          console.error('Error during vector query operations:', queryError);
          // Continue execution even if query fails
        }

        return new Response(
          JSON.stringify({ 
            success: true,
            message: 'Message stored successfully'
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

        console.log('Retrieved context from Redis:', context);

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
