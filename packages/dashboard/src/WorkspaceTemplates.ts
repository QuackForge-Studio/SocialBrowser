export interface WorkspaceTemplate {
  id: string;
  name: string;
  description: string;
  iconName: string;
  badgeColor: string;
  groups: {
    name: string;
    platforms: Array<{ platform: string; defaultName: string }>;
  }[];
}

export const WORKSPACE_TEMPLATES: WorkspaceTemplate[] = [
  {
    id: "social-media-manager",
    name: "Social Media HQ",
    description: "Core channels for brand publishing & community management",
    iconName: "ShareNetwork",
    badgeColor: "#f97316",
    groups: [
      {
        name: "Main Publishing Hub",
        platforms: [
          { platform: "twitter", defaultName: "Official X Account" },
          { platform: "linkedin", defaultName: "Company LinkedIn" },
          { platform: "facebook", defaultName: "Brand Page" }
        ]
      },
      {
        name: "Visual & Short Video",
        platforms: [
          { platform: "instagram", defaultName: "Main Instagram" },
          { platform: "tiktok", defaultName: "TikTok Channel" }
        ]
      }
    ]
  },
  {
    id: "ecommerce-brand",
    name: "E-Commerce & Retail",
    description: "Shop social channels, ads & customer support feeds",
    iconName: "ShoppingBag",
    badgeColor: "#ec4899",
    groups: [
      {
        name: "Sales & Promotions",
        platforms: [
          { platform: "facebook", defaultName: "Store Page" },
          { platform: "instagram", defaultName: "Shop Feed" }
        ]
      },
      {
        name: "Customer Outreach",
        platforms: [
          { platform: "tiktok", defaultName: "Product Demos" },
          { platform: "reddit", defaultName: "Community Subreddit" }
        ]
      }
    ]
  },
  {
    id: "creator-hub",
    name: "Content Creator",
    description: "Personal branding, audience engagement & tech discussions",
    iconName: "Sparkles",
    badgeColor: "#8b5cf6",
    groups: [
      {
        name: "Daily Engagement",
        platforms: [
          { platform: "twitter", defaultName: "Personal X Profile" },
          { platform: "reddit", defaultName: "Reddit Monitored Subs" }
        ]
      },
      {
        name: "Professional & Network",
        platforms: [
          { platform: "linkedin", defaultName: "Personal LinkedIn" }
        ]
      }
    ]
  }
];
