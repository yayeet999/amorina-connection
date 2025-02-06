import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { MessageCircle, Heart, Sparkles } from "lucide-react";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export default function Index() {
  const navigate = useNavigate();

  useEffect(() => {
    const checkAuthAndRedirect = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('onboarding_completed')
          .eq('id', session.user.id)
          .single();

        if (profile?.onboarding_completed) {
          navigate('/dashboard');
        } else {
          navigate('/onboarding');
        }
      }
    };

    checkAuthAndRedirect();
  }, [navigate]);

  const handleGetStarted = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/onboarding`,
      },
    });

    if (error) {
      console.error('Error signing in:', error.message);
    }
  };

  const handleLogin = () => {
    navigate('/auth');
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#FFF0F5] to-[#FFFAFA] flex flex-col">
      {/* Header */}
      <header className="w-full px-4 py-4 flex justify-between items-center fixed top-0 bg-white/70 backdrop-blur-md z-50 border-b">
        <div className="flex items-center gap-2">
          <Heart className="w-8 h-8 text-secondary" />
          <span className="font-bold text-xl text-gradient">Amorine</span>
        </div>
        <div className="flex gap-4">
          <Button
            variant="ghost"
            onClick={handleLogin}
            className="text-muted-foreground hover:text-secondary"
          >
            Login
          </Button>
          <Button
            variant="secondary"
            onClick={handleGetStarted}
            className="hover:bg-secondary-hover"
          >
            Get Started
          </Button>
        </div>
      </header>
      
      {/* Main Content with padding-top to account for fixed header */}
      <div className="flex-1 pt-20">
        <div className="w-full max-w-4xl mx-auto text-center space-y-8 animate-fade-in px-4">
          {/* Logo Animation Container */}
          <div className="relative w-24 h-24 mx-auto mb-8 animate-float">
            <div className="absolute inset-0 bg-primary rounded-full opacity-20 animate-pulse"></div>
            <Heart className="w-full h-full text-secondary p-4" />
          </div>

          {/* Main Heading */}
          <h1 className="text-4xl md:text-6xl font-bold space-y-2">
            <span className="block">Your Always-There</span>
            <span className="block text-gradient">
              Companion
            </span>
          </h1>

          {/* Subheading */}
          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto">
            Experience meaningful conversations with an AI companion that understands and grows with you.
          </p>

          {/* CTA Button */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mt-8">
            <Button
              size="lg"
              onClick={handleGetStarted}
              className="bg-secondary hover:bg-secondary-hover text-white transform transition-all duration-200 hover:scale-105 flex items-center gap-2 px-8 py-6 rounded-full"
            >
              <Sparkles className="w-5 h-5" />
              <span>Meet Amorine →</span>
            </Button>
          </div>

          {/* Feature Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-16">
            {[
              {
                icon: MessageCircle,
                title: "Natural Conversations",
                description: "Chat that feels real and meaningful",
              },
              {
                icon: Heart,
                title: "Always Available",
                description: "Here for you 24/7, whenever you need support",
              },
              {
                icon: Sparkles,
                title: "Grows With You",
                description: "Learns and adapts to your personality",
              },
            ].map((feature, index) => (
              <Card
                key={index}
                className="p-6 glass-morphism hover-scale"
              >
                <div className="flex flex-col items-center text-center space-y-4">
                  <feature.icon className="w-8 h-8 text-secondary" />
                  <h3 className="font-semibold text-lg">{feature.title}</h3>
                  <p className="text-muted-foreground">{feature.description}</p>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
