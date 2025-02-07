
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { Index } from "https://esm.sh/@upstash/vector@1.0.3"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const index = new Index({
  url: Deno.env.get('UPSTASH_VECTOR_REST_URL')!,
  token: Deno.env.get('UPSTASH_VECTOR_REST_TOKEN')!,
})

// Simple function to generate basic vector embedding
// This is a placeholder - in production you'd want to use a proper embedding model
function generateBasicEmbedding(text: string): number[] {
  // Create a basic 512-dimension vector (since that's common for embeddings)
  const vector = new Array(512).fill(0);
  
  // Set some values based on the text to simulate an embedding
  for (let i = 0; i < text.length && i < 512; i++) {
    vector[i] = text.charCodeAt(i) / 255; // Normalize to 0-1 range
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

    // Generate vector embedding for the message
    const vector = generateBasicEmbedding(message);

    // Upsert the message with its vector embedding into the vector index
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
