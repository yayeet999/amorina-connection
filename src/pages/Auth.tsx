
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Heart, ArrowLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function Auth() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({
          email,
          password,
        });
        if (error) throw error;
        toast({
          title: "Success!",
          description: "Please check your email to verify your account.",
        });
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        navigate('/onboarding');
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#FFF0F5] to-[#FFFAFA] flex flex-col items-center justify-center p-4 relative">
      <Button
        variant="ghost"
        onClick={() => navigate('/')}
        className="absolute top-4 left-4 flex items-center gap-2 text-muted-foreground hover:text-secondary"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Home
      </Button>

      <Card className="w-full max-w-md p-8 space-y-8 relative">
        <div className="flex flex-col items-center space-y-2">
          <Heart className="w-12 h-12 text-secondary" />
          <h1 className="text-2xl font-bold text-gradient">
            {isSignUp ? "Create Account" : "Welcome Back"}
          </h1>
          <p className="text-muted-foreground text-center">
            {isSignUp
              ? "Sign up to start your journey with Amorine"
              : "Sign in to continue your journey"}
          </p>
        </div>

        <div className="flex w-full rounded-lg overflow-hidden">
          <button
            onClick={() => setIsSignUp(false)}
            className={`flex-1 py-2 text-sm font-medium transition-colors ${
              !isSignUp
                ? "bg-secondary text-white"
                : "bg-secondary/10 text-muted-foreground hover:bg-secondary/20"
            }`}
          >
            Sign In
          </button>
          <button
            onClick={() => setIsSignUp(true)}
            className={`flex-1 py-2 text-sm font-medium transition-colors ${
              isSignUp
                ? "bg-secondary text-white"
                : "bg-secondary/10 text-muted-foreground hover:bg-secondary/20"
            }`}
          >
            Sign Up
          </button>
        </div>

        <form onSubmit={handleAuth} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="bg-white/50"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="bg-white/50"
            />
          </div>

          <Button
            type="submit"
            className="w-full bg-secondary hover:bg-secondary-hover text-white"
            disabled={loading}
          >
            {loading
              ? "Loading..."
              : isSignUp
              ? "Create Account"
              : "Sign In"}
          </Button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">
                Or continue with
              </span>
            </div>
          </div>

          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => supabase.auth.signInWithOAuth({
              provider: 'google',
              options: {
                redirectTo: `${window.location.origin}/onboarding`,
              },
            })}
          >
            Continue with Google
          </Button>
        </form>
      </Card>
    </div>
  );
}
