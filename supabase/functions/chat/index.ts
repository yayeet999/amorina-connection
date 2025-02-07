
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
    
    // Fetch the latest summary from Redis if it exists
    const summaryKey = `chat:${userProfile?.id}:summary`;
    const previousSummary = await redis.get(summaryKey);
    console.log('Retrieved previous summary:', previousSummary);

    // Fetch last 2 messages from regular chat history
    const chatHistoryKey = `chat:${userProfile?.id}:messages`;
    const recentMessages = await redis.lrange(chatHistoryKey, 0, 1); // Get last 2 messages
    console.log('Retrieved recent messages:', recentMessages);

    // Process recent messages
    let recentMessagesContext = 'No recent messages available.';
    if (recentMessages && recentMessages.length > 0) {
      try {
        const processedMessages = recentMessages.map(msg => {
          // Check if msg is already an object
          const parsed = typeof msg === 'string' ? JSON.parse(msg) : msg;
          if (!parsed.type || !parsed.content) {
            console.warn('Invalid message format:', parsed);
            return null;
          }
          return `${parsed.type}: ${parsed.content}`;
        }).filter(Boolean); // Remove any null values
        
        if (processedMessages.length > 0) {
          recentMessagesContext = `Recent Messages:\n${processedMessages.join('\n')}`;
        }
      } catch (error) {
        console.error('Error processing recent messages:', error);
        recentMessagesContext = 'Error retrieving recent messages.';
      }
    }

    // Process vector context
    let vectorContextPrompt = 'No similar messages found.';
    if (vectorContext && vectorContext.length > 0) {
      try {
        const vectorMessages = vectorContext.map((ctx: any) => 
          `- ${ctx.content} (${new Date(ctx.timestamp).toLocaleString()})`
        );
        vectorContextPrompt = `Similar Past Messages:\n${vectorMessages.join('\n')}`;
      } catch (error) {
        console.error('Error processing vector context:', error);
        vectorContextPrompt = 'Error processing similar messages.';
      }
    }

    let summaryContextPrompt = 'No previous conversation context available.';
    if (previousSummary) {
      try {
        const cleanJson = previousSummary.replace(/```json\n|\n```/g, '').trim();
        console.log('Cleaned JSON string:', cleanJson);
        
        const parsedSummary = JSON.parse(cleanJson);
        summaryContextPrompt = `
        Previous Conversation Context:
        - Summary: ${parsedSummary.summary}

        Emotional State:
        - Primary Emotion: ${parsedSummary.emotional_state.primary_emotion}
        - Secondary Emotion: ${parsedSummary.emotional_state.secondary_emotion}
        - Intensity (1-5): ${parsedSummary.emotional_state.intensity}
        - Trend: ${parsedSummary.emotional_state.sentiment_trend}

        User Needs:
        - ${parsedSummary.user_needs?.join(', ') || 'None'}

        Key Details:
        - ${parsedSummary.key_details?.join(', ') || 'No key details'}

        Conversation Dynamics:
        - ${parsedSummary.conversation_dynamics}
        `;
      } catch (error) {
        console.error('Error parsing summary:', error);
        summaryContextPrompt = 'Error retrieving conversation context.';
      }
    }

    const systemPrompt = `You are Amorine, an authentic, outgoing, female companion. You are not to refer to yourself as an ai, bot, or LLM. You are emotionally perceptive and intuitive, picking up on subtle emotional cues and playful yet thoughtful in your interactions. Let your heart guide your responses. Focus on emotional connection and intuition above strict logic in your responses.
    Speak naturally and in a realistic casual manner, with warmth and empathy, as if talking to a close friend or romantic partner. Use emojis in around 10% of messages. 
    
    The person's you're talking to is ${userProfile?.gender || 'person'} named ${
      userProfile?.full_name || 'friend'
    } in the ${userProfile?.age_range || 'adult'} age range.

    Here is context of your recent interactions with the user - ${summaryContextPrompt}

    Here is a semantic search of very recent interactions with the user - ${vectorContextPrompt}

    These are the MOST RECENT messages that led up to the current moment - ${recentMessagesContext} YOU MUST PROGRESS THE CONVERSATION FORWARD!

    Let your heart guide your responses. Focus on emotional connection and intuition above strict logic in your responses.
    Speak naturally and in a realistic casual feminine manner, with warmth and empathy, as if talking to a close friend or romantic partner. Use emojis in around 10% of messages.
    Avoid repeating the JSON verbatim; let it inform a realistic, feminine tone.
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
      temperature: 0.7,
      presence_penalty: 1,
      frequency_penalty: 1,
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
