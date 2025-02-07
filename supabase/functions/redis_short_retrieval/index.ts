
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { Redis } from 'https://deno.land/x/upstash_redis@v1.22.0/mod.ts'

const redis = new Redis({
  url: Deno.env.get('UPSTASH_REDIS_REST_URL')!,
  token: Deno.env.get('UPSTASH_REDIS_REST_TOKEN')!,
})

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { userId, context } = await req.json();
    console.log('Received request with userId:', userId);
    console.log('Context data:', JSON.stringify(context));

    if (!userId) {
      throw new Error('userId is required');
    }

    if (!context || !Array.isArray(context)) {
      throw new Error('context must be an array');
    }

    // Validate context structure and types
    context.forEach((item, index) => {
      if (!item || typeof item !== 'object') {
        throw new Error(`Invalid context item at index ${index}: must be an object`);
      }
      if (typeof item.content !== 'string') {
        throw new Error(`Invalid content at index ${index}: must be a string`);
      }
      if (typeof item.timestamp !== 'number') {
        throw new Error(`Invalid timestamp at index ${index}: must be a number`);
      }
    });

    try {
      await redis.ping();
      console.log('Redis connection successful');
    } catch (redisError) {
      console.error('Redis connection failed:', redisError);
      throw new Error('Redis connection failed');
    }

    const key = `user:${userId}:context`;
    console.log('Storing context for user:', userId);
    console.log('Context to store:', JSON.stringify(context));

    await redis.set(key, JSON.stringify(context));
    console.log('Successfully stored context in Redis');

    return new Response(
      JSON.stringify({ 
        success: true,
        message: 'Context stored successfully'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in redis_short_retrieval:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message,
        details: error.stack
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
