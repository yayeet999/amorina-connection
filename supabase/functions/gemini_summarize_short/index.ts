
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
    console.log('Summarizing messages for user:', userId);

    if (!userId) {
      throw new Error('User ID is required');
    }

    // Get last 10 messages from Redis
    const key = `chat:${userId}:messages`;
    const messages = await redis.lrange(key, 0, 9);
    console.log('Retrieved messages count:', messages.length);

    if (!messages.length) {
      throw new Error('No messages found to summarize');
    }

    // Parse messages and format them for summarization
    const formattedMessages = messages.map(msg => {
      const parsed = typeof msg === 'string' ? JSON.parse(msg) : msg;
      return `${parsed.type}: ${parsed.content}`;
    }).join('\n');

    console.log('Calling Gemini API for summarization');
    
    const response = await fetch(
      'https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash-8b:generateContent',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': Deno.env.get('GEMINI_API_KEY')!,
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `You are a specialized summarizer for a conversation between a user and their assistant AI girlfriend. You will receive the last 10 messages between the user and the assistant AI girlfriend. Please analyze them thoroughly and return a concise JSON object that captures:

1. A 1-2 sentence summary of the main topic and tone.
2. Emotional state analysis of the overall primary/secondary emotion, intensity (1–5), and a sentiment trend (rising, steady, or declining).
3. User needs (emotional or practical such as advice, attention, etc)
4. Key details or facts mentioned.
5. Conversation dynamics (initiator, tone, relationship context, vulnerability, etc).

Output only valid JSON in the structure below, with no additional commentary:

{
  "summary": "",
  "emotional_state": {
    "primary_emotion": "",
    "secondary_emotion": "",
    "intensity": "",
    "sentiment_trend": ""
  },
  "user_needs": [],
  "key_details": [],
  "conversation_dynamics": ""
}

Here are the messages to analyze:
${formattedMessages}`
            }]
          }]
        })
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Gemini API error:', errorData);
      throw new Error('Failed to generate summary');
    }

    const data = await response.json();
    console.log('Received Gemini response:', data);

    const summary = data.candidates[0].content.parts[0].text;

    // Store the summary in Redis
    const summaryKey = `chat:${userId}:summary`;
    await redis.set(summaryKey, summary);

    return new Response(
      JSON.stringify({ 
        success: true, 
        summary 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error) {
    console.error('Error in gemini_summarize_short:', error);
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
