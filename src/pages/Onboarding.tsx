
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { OnboardingForm } from "@/components/onboarding/OnboardingForm";
import { useQuery } from "@tanstack/react-query";

export default function Onboarding() {
  const navigate = useNavigate();

  const { data: profile } = useQuery({
    queryKey: ['profile'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();
      
      return profile;
    },
  });

  useEffect(() => {
    if (profile?.onboarding_completed) {
      navigate('/dashboard');
    }
  }, [profile, navigate]);

  return <OnboardingForm />;
}
