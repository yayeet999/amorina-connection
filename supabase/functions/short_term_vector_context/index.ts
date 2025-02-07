
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
    console.log('Using Redis key:', redisKey);

    switch (action) {
      case 'store': {
        if (!message) {
          throw new Error('Message is required for store action');
        }

        console.log('Attempting to store message in vector database:', {
          userId,
          message
        });

        // Store message in vector database with text content for embedding
        const upsertResult = await vector.upsert({
          id: `${userId}-${Date.now()}`,
          text: message, // Using text field instead of vector for automatic embedding
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
            text: message, // Using text for query embedding
            topK: 20,
            includeMetadata: true,
            includeVectors: false,
            filter: `user_id = '${userId}'`
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
            text: message, // Using text for similarity search
            topK: 3,
            includeMetadata: true,
            includeVectors: false,
            filter: `user_id = '${userId}'`
          });

          console.log('Similar messages found:', similarMessages);

          if (similarMessages.matches) {
            const contextMessages = similarMessages.matches
              .map(msg => msg.metadata?.content)
              .filter(Boolean);

            console.log('Preparing to store in Redis - Context Messages:', contextMessages);
            
            try {
              const setResult = await redis.set(redisKey, JSON.stringify(contextMessages));
              console.log('Redis storage result:', setResult);
              
              // Verify the data was stored correctly
              const storedData = await redis.get(redisKey);
              console.log('Verification - Data stored in Redis:', storedData);
            } catch (redisError) {
              console.error('Redis operation failed:', redisError);
              throw redisError;
            }
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
        console.log('Attempting to retrieve context from Redis with key:', redisKey);
        
        try {
          const cachedContext = await redis.get(redisKey);
          console.log('Raw data retrieved from Redis:', cachedContext);
          
          const context = cachedContext ? JSON.parse(cachedContext as string) : [];
          console.log('Parsed context data:', context);

          return new Response(
            JSON.stringify({ 
              success: true, 
              context 
            }),
            { 
              headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
            }
          );
        } catch (redisError) {
          console.error('Error retrieving from Redis:', redisError);
          throw redisError;
        }
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
