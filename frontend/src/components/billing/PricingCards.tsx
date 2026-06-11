import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const plans = [
  {
    name: "Free",
    price: "$0",
    description: "For trying document intelligence.",
    features: ["Unlimited documents", "100 questions", "100 MB storage", "Local Ollama-ready"],
  },
  {
    name: "Pro",
    price: "$29",
    description: "For professionals and small teams.",
    features: ["Unlimited chats", "More storage", "Priority processing", "API keys"],
    featured: true,
  },
  {
    name: "Business",
    price: "Custom",
    description: "For governed teams and high volume workflows.",
    features: ["SAML-ready roadmap", "Audit controls", "Dedicated limits", "Premium support"],
  },
];

export function PricingCards() {
  return (
    <div className="grid gap-5 lg:grid-cols-3">
      {plans.map((plan) => (
        <Card key={plan.name} className={plan.featured ? "border-primary shadow-glow" : ""}>
          <CardHeader>
            <CardTitle>{plan.name}</CardTitle>
            <p className="text-sm text-muted-foreground">{plan.description}</p>
            <p className="pt-4 font-display text-4xl font-semibold">
              {plan.price}
              {plan.price.startsWith("$") && <span className="text-sm text-muted-foreground">/mo</span>}
            </p>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {plan.features.map((feature) => (
                <li key={feature} className="flex items-center gap-2 text-sm">
                  <Check className="h-4 w-4 text-emerald-500" />
                  {feature}
                </li>
              ))}
            </ul>
            <Button className="mt-6 w-full" variant={plan.featured ? "premium" : "outline"}>
              {plan.featured ? "Upgrade to Pro" : "Select plan"}
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
