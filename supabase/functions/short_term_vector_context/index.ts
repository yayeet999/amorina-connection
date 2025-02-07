
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { Index } from "https://esm.sh/@upstash/vector@1.0.3"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const index = new Index({
  url: Deno.env.get('UPSTASH_VECTOR_REST_URL')!,
  token: Deno.env.get('UPSTASH_VECTOR_REST_TOKEN')!,
  indexName: 'amorine_short_context'
})

// Simple function to generate a basic vector from text
// This is a placeholder - in production you'd want to use a proper embedding model
function generateBasicVector(text: string): number[] {
  // Create a fixed-length vector (1536 dimensions to match common embedding models)
  const vector = new Array(1536).fill(0);
  
  // Simple hash function to generate some values
  for (let i = 0; i < text.length; i++) {
    const value = text.charCodeAt(i) / 255; // Normalize to 0-1
    vector[i % 1536] = value;
  }
  
  return vector;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { action, userId, message } = await req.json()

    // We only handle store action now
    if (action !== 'store') {
      return new Response(
        JSON.stringify({ error: 'Only store action is supported' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    if (!userId || !message) {
      return new Response(
        JSON.stringify({ error: 'userId and message are required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    // Generate vector from the message
    const vector = generateBasicVector(message);

    // Upsert following the exact template structure
    const upsertResult = await index.upsert({
      id: `${userId}-${Date.now()}`,
      vector: vector,
      metadata: {
        user_id: userId,
        content: message,
        timestamp: Date.now()
      }
    })

    console.log('Vector upsert result:', upsertResult)

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error in short_term_vector_context:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
