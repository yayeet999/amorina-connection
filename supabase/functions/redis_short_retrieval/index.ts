
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { Redis } from 'https://deno.land/x/upstash_redis@v1.22.0/mod.ts'

const redis = new Redis({
  url: Deno.env.get('UPSTASH_REDIS_REST_URL')!,
  token: Deno.env.get('UPSTASH_REDIS_REST_TOKEN')!,
})

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { userId, context } = await req.json()

    if (!userId) {
      throw new Error('userId is required')
    }

    // Test Redis connection
    try {
      await redis.ping()
      console.log('Redis connection successful')
    } catch (redisError) {
      console.error('Redis connection failed:', redisError)
      throw new Error('Redis connection failed')
    }

    // Store context in Redis with key pattern "user:{userId}:context"
    const key = `user:${userId}:context`
    console.log('Storing context for user:', userId)
    console.log('Context:', context)

    // Store the context as a JSON string
    await redis.set(key, JSON.stringify(context))

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error in redis_short_retrieval:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
