import {
  BarChart3,
  Brain,
  CreditCard,
  FileText,
  Home,
  MessageSquareText,
  Settings,
  Sparkles,
  Upload,
} from "lucide-react";

export const landingNavigation = [
  { label: "Features", href: "#features" },
  { label: "How it works", href: "#how-it-works" },
  { label: "Pricing", href: "#pricing" },
  { label: "FAQ", href: "#faq" },
] as const;

export const appNavigation = [
  { label: "Dashboard", href: "/dashboard", icon: Home },
  { label: "Documents", href: "/documents", icon: FileText },
  { label: "Upload", href: "/documents/upload", icon: Upload },
  { label: "Chat", href: "/chat", icon: MessageSquareText },
  { label: "Analytics", href: "/analytics", icon: BarChart3 },
  { label: "Billing", href: "/billing", icon: CreditCard },
  { label: "Settings", href: "/settings", icon: Settings },
] as const;

export const featureHighlights = [
  {
    title: "Grounded AI chat",
    description: "Ask questions across PDFs, DOCX, and TXT files with citations that trace every claim.",
    icon: Brain,
  },
  {
    title: "Premium document workflows",
    description: "Upload, process, search, summarize, and generate FAQs from a single document workspace.",
    icon: FileText,
  },
  {
    title: "Subscription-ready analytics",
    description: "Track usage, AI requests, and storage so teams can upgrade at the right moment.",
    icon: Sparkles,
  },
] as const;
