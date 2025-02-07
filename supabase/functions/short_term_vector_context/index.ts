
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

async function getEmbedding(text: string): Promise<number[]> {
  console.log('Generating embedding for text:', text);
  const response = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: text,
    encoding_format: "float",
    dimensions: 384
  });
  
  console.log('Successfully generated embedding');
  return response.data[0].embedding;
}

async function maintainMessageWindow(userId: string) {
  console.log('Maintaining message window for user:', userId);
  
  try {
    // Get all messages for this user
    const allMessages = await index.query({
      vector: new Array(384).fill(0), // Dummy vector for filtering
      topK: 100, // Get all messages to sort by timestamp
      includeMetadata: true,
      includeVectors: false,
      filter: `user_id = '${userId}'`
    });

    // Sort messages by timestamp (newest first)
    const sortedMessages = allMessages.sort((a, b) => 
      (b.metadata.timestamp || 0) - (a.metadata.timestamp || 0)
    );

    // If we have more than 20 messages, delete the oldest ones
    if (sortedMessages.length > 20) {
      const messagesToDelete = sortedMessages.slice(20);
      console.log(`Deleting ${messagesToDelete.length} old messages`);
      
      for (const message of messagesToDelete) {
        await index.delete(message.id);
      }
    }
  } catch (error) {
    console.error('Error maintaining message window:', error);
  }
}

async function storeContextInRedis(userId: string, context: any) {
  console.log('Attempting to store context in Redis for user:', userId);
  console.log('Context data to store:', JSON.stringify(context));

  try {
    const response = await fetch(
      `${Deno.env.get('SUPABASE_URL')}/functions/v1/redis_short_retrieval`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`,
        },
        body: JSON.stringify({ 
          userId, 
          context: context.map((item: any) => ({
            content: String(item.content),
            timestamp: Number(item.timestamp)
          }))
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Redis storage failed:', response.status, errorText);
      throw new Error(`Failed to store context in Redis: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    console.log('Successfully stored context in Redis:', data);
    return data;
  } catch (error) {
    console.error('Error storing context in Redis:', error);
    throw error;
  }
}

async function queryVectors(userId: string, vector?: number[]) {
  console.log('Querying vectors for user:', userId);
  
  const queryVector = vector || new Array(384).fill(0);
  
  try {
    const filter = `user_id = '${userId}'`;
    console.log('Using filter:', filter);

    const results = await index.query({
      vector: queryVector,
      topK: 3,
      includeMetadata: true,
      includeVectors: false,
      filter
    });

    console.log('Vector query results:', results);
    return results;
  } catch (error) {
    console.error('Error querying vectors:', error);
    throw error;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, userId, message } = await req.json();
    console.log('Received request:', { action, userId });

    if (!userId) {
      throw new Error('userId is required');
    }

    if (action === 'store') {
      if (!message) {
        throw new Error('message is required for store action');
      }

      console.log('Processing store action for user:', userId);
      const vector = await getEmbedding(message);
      console.log('Generated embedding vector');

      await index.upsert({
        id: `${userId}-${Date.now()}`,
        vector: vector,
        metadata: {
          user_id: userId,
          content: message,
          timestamp: Date.now()
        }
      });

      console.log('Successfully upserted vector');

      // Maintain the 20-message window after adding new message
      await maintainMessageWindow(userId);
      console.log('Maintained message window');

      const similarResults = await queryVectors(userId, vector);
      console.log('Retrieved similar vectors:', similarResults);

      const context = similarResults.map(result => ({
        content: String(result.metadata.content),
        timestamp: Number(result.metadata.timestamp)
      }));

      console.log('Prepared context for Redis:', context);

      try {
        await storeContextInRedis(userId, context);
        console.log('Successfully stored context in Redis');
      } catch (error) {
        console.error('Failed to store context in Redis:', error);
      }

      return new Response(
        JSON.stringify({ success: true, context }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } else if (action === 'get_context') {
      console.log('Processing get_context action for user:', userId);
      
      const results = await queryVectors(userId);
      console.log('Retrieved vectors for context:', results);

      const context = results.map(result => ({
        content: String(result.metadata.content),
        timestamp: Number(result.metadata.timestamp)
      }));

      console.log('Prepared context for Redis:', context);

      try {
        await storeContextInRedis(userId, context);
        console.log('Successfully stored context in Redis');
      } catch (error) {
        console.error('Failed to store context in Redis:', error);
      }

      return new Response(
        JSON.stringify({ success: true, context }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Invalid action' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    );

  } catch (error) {
    console.error('Error in short_term_vector_context:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message,
        details: error.stack
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
