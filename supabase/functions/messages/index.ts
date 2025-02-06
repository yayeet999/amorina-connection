import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const UPSTASH_URL = Deno.env.get('UPSTASH_REDIS_REST_URL');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { userId, action, message } = await req.json();

    if (!userId) {
      throw new Error('User ID is required');
    }

    const messageKey = `chat:${userId}:messages`;

    if (action === 'store') {
      if (!message) {
        throw new Error('Message is required for store action');
      }

      // Store message in Redis
      const storeResponse = await fetch(`${UPSTASH_URL}/lpush/${messageKey}/${JSON.stringify(message)}`, {
        method: 'POST',
      });

      // Trim to keep only last 100 messages
      await fetch(`${UPSTASH_URL}/ltrim/${messageKey}/0/99`, {
        method: 'POST',
      });

      const storeData = await storeResponse.json();
      return new Response(JSON.stringify({ success: true, data: storeData }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } 
    
    if (action === 'retrieve') {
      // Retrieve last 100 messages
      const retrieveResponse = await fetch(`${UPSTASH_URL}/lrange/${messageKey}/0/99`, {
        method: 'GET',
      });
      
      const messages = await retrieveResponse.json();
      return new Response(JSON.stringify({ 
        success: true, 
        messages: messages.result.map((m: string) => JSON.parse(m))
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
