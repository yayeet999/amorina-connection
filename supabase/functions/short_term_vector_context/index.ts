
import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { Redis } from 'https://deno.land/x/upstash_redis@v1.22.0/mod.ts';
import { Index } from 'https://esm.sh/@upstash/vector@1.0.3';

// Validate environment variables
const vectorUrl = Deno.env.get('UPSTASH_VECTOR_REST_URL');
const vectorToken = Deno.env.get('UPSTASH_VECTOR_REST_TOKEN');
const redisUrl = Deno.env.get('UPSTASH_REDIS_REST_URL');
const redisToken = Deno.env.get('UPSTASH_REDIS_REST_TOKEN');

if (!vectorUrl || !vectorToken || !redisUrl || !redisToken) {
  throw new Error('Missing required environment variables');
}

const vector = new Index({
  url: vectorUrl,
  token: vectorToken,
});

const redis = new Redis({
  url: redisUrl,
  token: redisToken,
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
    console.log('Using Redis key:', redisKey);

    switch (action) {
      case 'store': {
        if (!message?.trim()) {
          throw new Error('Message is required for store action');
        }

        console.log('Attempting to store message in vector database:', {
          userId,
          message
        });

        try {
          // Create a simple dense vector from the text (this is a basic approach)
          const encodedData = new TextEncoder().encode(message.trim());
          const simpleVector = Array.from(encodedData).map(x => x / 255); // Normalize to [0,1]
          
          // Ensure vector has consistent length by padding or truncating to 384 dimensions
          const vectorLength = 384; // Match the Upstash Vector index configuration
          const paddedVector = [...simpleVector];
          while (paddedVector.length < vectorLength) {
            paddedVector.push(0);
          }
          const finalVector = paddedVector.slice(0, vectorLength);

          const upsertResult = await vector.upsert({
            id: `${userId}-${Date.now()}`,
            vector: finalVector,
            metadata: {
              user_id: userId,
              content: message,
              timestamp: Date.now(),
            }
          });

          console.log('Vector upsert result:', upsertResult);

          const userMessages = await vector.query({
            vector: finalVector,
            topK: 20,
            includeMetadata: true,
            includeVectors: false,
            filter: {
              user_id: userId
            }
          });

          if (userMessages?.matches?.length > 20) {
            const messagesToDelete = userMessages.matches.slice(20);
            console.log('Deleting old messages:', messagesToDelete);
            await Promise.all(
              messagesToDelete.map(msg => vector.delete(msg.id))
            );
          }

          const similarMessages = await vector.query({
            vector: finalVector,
            topK: 3,
            includeMetadata: true,
            includeVectors: false,
            filter: {
              user_id: userId
            }
          });

          if (similarMessages?.matches) {
            const contextMessages = similarMessages.matches
              .map(msg => msg.metadata?.content)
              .filter(Boolean);

            await redis.set(redisKey, JSON.stringify(contextMessages));
            const storedData = await redis.get(redisKey);
            console.log('Stored context in Redis:', storedData);
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
        } catch (error) {
          console.error('Operation failed:', error);
          throw error;
        }
      }

      case 'get_context': {
        const cachedContext = await redis.get(redisKey);
        const context = cachedContext ? JSON.parse(cachedContext as string) : [];
        
        return new Response(
          JSON.stringify({ success: true, context }),
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
