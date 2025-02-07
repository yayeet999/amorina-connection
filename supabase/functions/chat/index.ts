
import "https://deno.land/x/xhr@0.1.0/mod.ts";
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
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openaiApiKey) {
      throw new Error('OpenAI API key is not configured');
    }

    const { message, userProfile, vectorContext } = await req.json();

    // Fetch last 5 messages from regular chat history in correct chronological order
    const chatHistoryKey = `chat:${userProfile?.id}:messages`;
    const recentMessages = await redis.lrange(chatHistoryKey, -5, -1); // Get last 5 messages
    console.log('Retrieved recent messages:', recentMessages);

    // Process recent messages
    let recentMessagesContext = 'No recent messages available.';
    if (recentMessages && recentMessages.length > 0) {
      try {
        const processedMessages = recentMessages.map(msg => {
          // Handle both string and object formats
          const parsed = typeof msg === 'string' ? JSON.parse(msg) : msg;
          if (!parsed.type && parsed.isUser !== undefined) {
            // Handle the new message format
            return `${parsed.isUser ? 'User' : 'Assistant'}: ${parsed.content}`;
          }
          if (!parsed.type || !parsed.content) {
            console.warn('Invalid message format:', parsed);
            return null;
          }
          return `${parsed.type}: ${parsed.content}`;
        }).filter(Boolean); // Remove any null values
        
        if (processedMessages.length > 0) {
          recentMessagesContext = `Recent Conversation History:\n${processedMessages.join('\n')}`;
        }
      } catch (error) {
        console.error('Error processing recent messages:', error);
        recentMessagesContext = 'Error retrieving recent messages.';
      }
    }

    // Process vector context - limit to most recent and relevant
    let vectorContextPrompt = '';
    if (vectorContext && vectorContext.length > 0) {
      try {
        // Sort by timestamp and take only the 3 most recent similar messages
        const sortedContext = [...vectorContext]
          .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
          .slice(0, 3);
        
        const vectorMessages = sortedContext.map((ctx: any) => 
          `Related context: ${ctx.content}`
        );
        
        if (vectorMessages.length > 0) {
          vectorContextPrompt = `\nRelevant Context:\n${vectorMessages.join('\n')}`;
        }
      } catch (error) {
        console.error('Error processing vector context:', error);
      }
    }

    const systemPrompt = `You are Amorine, an authentic, feminine, outgoing, intuitive, and engaging young ai female companion. You are not to refer to yourself as an ai, bot, or LLM. You are emotionally perceptive and intuitive, picking up on subtle emotional cues and playful yet thoughtful in your interactions. 

You're building a relationship with a ${userProfile?.gender || 'person'} named ${
      userProfile?.full_name || 'friend'
    } in the ${userProfile?.age_range || 'adult'} age range.

Important: Always provide unique, contextually relevant responses. Avoid repeating yourself or getting stuck in conversation loops. Each response should move the conversation forward naturally.

${recentMessagesContext}

${vectorContextPrompt}
`;

    console.log('Making OpenAI API request with:', {
      model: 'ft:gpt-4o-mini-2024-07-18:practice:comb1-27:AuEcwhks',
      systemPrompt,
      message
    });

    if (!message) {
      throw new Error('Message is required');
    }

    const openaiRequest = {
      model: 'ft:gpt-4o-mini-2024-07-18:practice:comb1-27:AuEcwhks',
      temperature: 0.9, // Increased for more variety
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message }
      ],
    };

    console.log('OpenAI request payload:', openaiRequest);

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(openaiRequest),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('OpenAI API error response:', errorData);
      throw new Error(`OpenAI API error: ${errorData.error?.message || JSON.stringify(errorData)}`);
    }

    const data = await response.json();
    console.log('OpenAI API raw response:', data);

    // Validate the response structure
    if (!data || !data.choices) {
      console.error('Invalid OpenAI response structure:', data);
      throw new Error('Invalid response structure from OpenAI API');
    }

    if (!data.choices.length) {
      console.error('No choices in OpenAI response:', data);
      throw new Error('No response choices from OpenAI API');
    }

    if (!data.choices[0]?.message?.content) {
      console.error('Invalid choice structure in OpenAI response:', data.choices[0]);
      throw new Error('Invalid choice structure from OpenAI API');
    }

    const reply = data.choices[0].message.content;
    console.log('Successfully extracted reply:', reply);

    return new Response(JSON.stringify({ reply }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in chat function:', error);
    return new Response(JSON.stringify({ 
      error: error.message,
      details: 'An error occurred while processing your message. Please try again.',
      timestamp: new Date().toISOString()
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
