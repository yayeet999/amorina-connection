
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
    const { userId } = await req.json();
    console.log('Received request for user:', userId);

    if (!userId) {
      throw new Error('User ID is required');
    }

    const counterKey = `user:${userId}:message_counter`;
    
    // Increment counter and get new value
    const newCount = await redis.incr(counterKey);
    console.log('New message count:', newCount);

    let triggerSummary = false;
    if (newCount >= 5) {
      // Reset counter when it hits 5
      await redis.set(counterKey, 0);
      triggerSummary = true;
      console.log('Counter reset, triggering summary');
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        count: newCount,
        triggerSummary 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error) {
    console.error('Error in redis_counter_short:', error);
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
