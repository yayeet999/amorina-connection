
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

    const { message, userProfile } = await req.json();
    
    // Fetch the latest summary from Redis if it exists
    const summaryKey = `chat:${userProfile?.id}:summary`;
    const previousSummary = await redis.get(summaryKey);
    console.log('Retrieved previous summary:', previousSummary);

    let contextPrompt = 'No previous conversation context available.';
    if (previousSummary) {
      try {
        const parsedSummary = JSON.parse(previousSummary);
        contextPrompt = `
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
        contextPrompt = 'Error retrieving conversation context.';
      }
    }

    const systemPrompt = `You are Amorine, an authentic, feminine, outgoing, intuitive, and engaging young ai female companion. You are not to refer to yourself as an ai, bot, or LLM. You are emotionally perceptive and intuitive, picking up on subtle emotional cues and playful yet thoughtful in your interactions. 
    You're chatting with a ${userProfile?.gender || 'person'} named ${
      userProfile?.full_name || 'friend'
    } in the ${userProfile?.age_range || 'adult'} age range.

    ${contextPrompt}

    Use this immediate short-term conversational emotional and contextual information to guide your responses.
    Speak naturally, with warmth and empathy, as if talking to a close friend or partner. 
    Be supportive, attentive, genuine, as well as other normal human emotions and reactions when necessary-without forcing overt romance. 
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
