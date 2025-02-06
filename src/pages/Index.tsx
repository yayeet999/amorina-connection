
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { MessageCircle, Heart, Sparkles } from "lucide-react";

const Index = () => {
  return (
    <div className="min-h-screen bg-gradient-to-b from-background-light to-background flex flex-col items-center justify-center px-4">
      {/* Hero Section */}
      <div className="w-full max-w-4xl mx-auto text-center space-y-8 animate-fade-in">
        {/* Logo Animation Container */}
        <div className="relative w-24 h-24 mx-auto mb-8 animate-float">
          <div className="absolute inset-0 bg-primary rounded-full opacity-20 animate-pulse"></div>
          <Heart className="w-full h-full text-secondary p-4" />
        </div>

        {/* Main Heading */}
        <h1 className="text-4xl md:text-6xl font-bold text-text space-y-2">
          <span className="block">Your Always-There</span>
          <span className="block bg-clip-text text-transparent bg-gradient-to-r from-primary to-secondary">
            Companion
          </span>
        </h1>

        {/* Subheading */}
        <p className="text-lg md:text-xl text-text/80 max-w-2xl mx-auto">
          Experience meaningful conversations with an AI companion that understands and grows with you.
        </p>

        {/* CTA Button */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mt-8">
          <Button
            size="lg"
            className="bg-secondary hover:bg-secondary-hover text-white transform transition-all duration-200 hover:scale-105 flex items-center gap-2 px-8 py-6 rounded-full"
          >
            <Sparkles className="w-5 h-5" />
            <span>Start Free Trial</span>
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
              className="p-6 bg-white/80 backdrop-blur-sm border border-primary/10 hover:border-primary/20 transition-all duration-200 hover:shadow-lg"
            >
              <div className="flex flex-col items-center text-center space-y-4">
                <feature.icon className="w-8 h-8 text-secondary" />
                <h3 className="font-semibold text-lg text-text">{feature.title}</h3>
                <p className="text-text/70">{feature.description}</p>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Index;
