
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Male, Female, User } from "lucide-react";

const AGE_RANGES = ["18-24", "25-34", "35+"];
const GENDERS = [
  { value: "male", label: "Male", icon: Male },
  { value: "female", label: "Female", icon: Female },
  { value: "non-binary", label: "Non-Binary", icon: User },
];

export function OnboardingForm() {
  const [step, setStep] = useState(1);
  const [fullName, setFullName] = useState("");
  const [gender, setGender] = useState("");
  const [ageRange, setAgeRange] = useState("");
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleSubmit = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("No user found");

      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: fullName,
          gender,
          age_range: ageRange,
          onboarding_completed: true,
        })
        .eq("id", user.id);

      if (error) throw error;

      toast({
        title: "Profile updated!",
        description: "Welcome to Amorine.AI",
      });

      navigate("/dashboard");
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update profile. Please try again.",
        variant: "destructive",
      });
    }
  };

  const nextStep = () => setStep(s => Math.min(s + 1, 3));
  const prevStep = () => setStep(s => Math.max(s - 1, 1));

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#FFF0F5] to-[#FFFAFA] flex items-center justify-center p-4">
      <Card className="w-full max-w-md p-6 space-y-8 animate-fade-in">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-bold text-gradient">Tell Us About You</h1>
          <p className="text-muted-foreground">Step {step} of 3</p>
        </div>

        {step === 1 && (
          <div className="space-y-4 animate-fade-in">
            <Label htmlFor="name">What's your name?</Label>
            <Input
              id="name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Enter your name"
              className="text-lg"
            />
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4 animate-fade-in">
            <Label>How do you identify?</Label>
            <RadioGroup
              value={gender}
              onValueChange={setGender}
              className="grid grid-cols-3 gap-4"
            >
              {GENDERS.map(({ value, label, icon: Icon }) => (
                <Label
                  key={value}
                  className={`flex flex-col items-center justify-center p-4 rounded-lg border-2 cursor-pointer hover:border-primary transition-colors ${
                    gender === value ? "border-primary bg-primary/5" : ""
                  }`}
                >
                  <RadioGroupItem value={value} className="sr-only" />
                  <Icon className="w-6 h-6 mb-2" />
                  <span>{label}</span>
                </Label>
              ))}
            </RadioGroup>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4 animate-fade-in">
            <Label>What's your age range?</Label>
            <RadioGroup
              value={ageRange}
              onValueChange={setAgeRange}
              className="grid grid-cols-3 gap-4"
            >
              {AGE_RANGES.map((range) => (
                <Label
                  key={range}
                  className={`flex items-center justify-center p-3 rounded-full border-2 cursor-pointer hover:border-primary transition-colors ${
                    ageRange === range ? "border-primary bg-primary/5" : ""
                  }`}
                >
                  <RadioGroupItem value={range} className="sr-only" />
                  <span>{range}</span>
                </Label>
              ))}
            </RadioGroup>
          </div>
        )}

        <div className="flex justify-between pt-4">
          {step > 1 && (
            <Button variant="outline" onClick={prevStep}>
              Back
            </Button>
          )}
          {step < 3 && (
            <Button
              className="ml-auto"
              onClick={nextStep}
              disabled={
                (step === 1 && !fullName) ||
                (step === 2 && !gender)
              }
            >
              Next
            </Button>
          )}
          {step === 3 && (
            <Button
              className="ml-auto"
              onClick={handleSubmit}
              disabled={!ageRange}
            >
              Complete
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}
