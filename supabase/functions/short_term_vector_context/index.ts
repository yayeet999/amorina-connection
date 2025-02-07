
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { Index } from "https://esm.sh/@upstash/vector@1.0.3"
import OpenAI from "https://esm.sh/openai@4.20.1"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const index = new Index({
  url: Deno.env.get('UPSTASH_VECTOR_REST_URL')!,
  token: Deno.env.get('UPSTASH_VECTOR_REST_TOKEN')!,
  indexName: 'amorine_short_context'
})

const openai = new OpenAI({
  apiKey: Deno.env.get('OPENAI_API_KEY')!,
})

// Get embedding from OpenAI
async function getEmbedding(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: text,
    encoding_format: "float",
    dimensions: 384
  });
  
  return response.data[0].embedding;
}

// Function to store context in Redis via redis_short_retrieval
async function storeContextInRedis(userId: string, context: any) {
  const response = await fetch(
    'http://localhost:54321/functions/v1/redis_short_retrieval',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`,
      },
      body: JSON.stringify({ userId, context }),
    }
  )

  if (!response.ok) {
    const error = await response.json()
    console.error('Failed to store context in Redis:', error)
    throw new Error('Failed to store context in Redis')
  }

  return await response.json()
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { action, userId, message } = await req.json()

    if (action === 'store') {
      if (!userId || !message) {
        return new Response(
          JSON.stringify({ error: 'userId and message are required' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        )
      }

      // Generate embedding from the message using OpenAI
      const vector = await getEmbedding(message);

      // Upsert following the exact template structure
      await index.upsert({
        id: `${userId}-${Date.now()}`,
        vector: vector,
        metadata: {
          user_id: userId,
          content: message,
          timestamp: Date.now()
        }
      })

      // After successful upsert, query for similar vectors
      const similarResults = await index.query({
        vector: vector,
        topK: 3,
        includeMetadata: true,
        filter: { user_id: userId }
      });

      // Extract just the content and timestamp from metadata
      const context = similarResults.map(result => ({
        content: result.metadata.content,
        timestamp: result.metadata.timestamp
      }));

      console.log('Context retrieved:', context);

      // Store the context in Redis
      try {
        await storeContextInRedis(userId, context)
        console.log('Successfully stored context in Redis')
      } catch (error) {
        console.error('Failed to store context in Redis:', error)
      }

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    } else if (action === 'get_context') {
      if (!userId) {
        return new Response(
          JSON.stringify({ error: 'userId is required' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        )
      }

      // Query for the most recent context for this user by first getting a vector
      // to use as a reference point
      const results = await index.query({
        vector: new Array(384).fill(0), // Default vector of zeros
        topK: 3,
        includeMetadata: true,
        filter: { user_id: userId }
      });

      // Extract just the content and timestamp from metadata
      const context = results.map(result => ({
        content: result.metadata.content,
        timestamp: result.metadata.timestamp
      }));

      console.log('Context retrieved:', context);

      // Store the context in Redis
      try {
        await storeContextInRedis(userId, context)
        console.log('Successfully stored context in Redis')
      } catch (error) {
        console.error('Failed to store context in Redis:', error)
      }

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ error: 'Invalid action' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )

  } catch (error) {
    console.error('Error in short_term_vector_context:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
