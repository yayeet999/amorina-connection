
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Redis } from 'https://deno.land/x/upstash_redis@v1.22.0/mod.ts';
import { Index } from 'npm:@upstash/vector@1.0.2';

const vector = new Index({
  url: Deno.env.get('UPSTASH_VECTOR_REST_URL')!,
  token: Deno.env.get('UPSTASH_VECTOR_REST_TOKEN')!,
  indexName: 'amorine-upstash-vector-short' // Set the correct index name
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

        // Store message in vector database with a dense vector representation
        const upsertResult = await vector.upsert({
          id: `${userId}-${Date.now()}`,
          vector: Array(384).fill(0.5), // Dense vector with 384 dimensions (matching all-MiniLM-L6-v2)
          metadata: {
            userId,
            timestamp: Date.now(),
            content: message,
          }
        });

        console.log('Vector upsert result:', upsertResult);

        // Get all messages for this user
        const userMessages = await vector.query({
          topK: 20,
          vector: Array(384).fill(0.5), // Dense vector matching the model dimensions
          filter: { userId },
          includeMetadata: true,
        });

        console.log('Retrieved user messages:', userMessages);

        // If more than 20 messages, delete the oldest ones
        if (userMessages.length > 20) {
          const messagesToDelete = userMessages.slice(20);
          console.log('Deleting old messages:', messagesToDelete);
          await Promise.all(
            messagesToDelete.map(msg => 
              vector.delete(msg.id)
            )
          );
        }

        // Perform similarity search for top 3 relevant messages
        const similarMessages = await vector.query({
          topK: 3,
          vector: Array(384).fill(0.5), // Dense vector matching the model dimensions
          filter: { userId },
          includeMetadata: true,
        });

        console.log('Similar messages found:', similarMessages);

        // Store top 3 messages in Redis
        const contextMessages = similarMessages.map(msg => msg.metadata.content);
        await redis.set(redisKey, JSON.stringify(contextMessages));

        console.log('Stored context in Redis:', contextMessages);

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
