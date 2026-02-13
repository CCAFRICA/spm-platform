"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Zap,
  Bell,
  AlertTriangle,
  TrendingUp,
  Target,
  CheckCircle2,
  ChevronRight,
  Lightbulb,
  ArrowRight,
  Clock,
  Award,
} from "lucide-react";
import { useCurrency } from "@/contexts/tenant-context";
import { GoalPacing } from "@/components/acceleration/goal-pacing";
import { CoachingCard } from "@/components/acceleration/coaching-card";
import { BadgeDisplay } from "@/components/acceleration/badge-display";
import { pageVariants, containerVariants, itemVariants } from "@/lib/animations";
import { toast } from "sonner";

// Mock alerts data
const alerts = [
  {
    id: "ALT-001",
    type: "budget",
    severity: "warning",
    title: "Budget Threshold Alert",
    message: "West Region has exceeded 90% of Q4 commission budget. Consider reviewing upcoming payouts.",
    timestamp: "2024-12-15T10:30:00Z",
    read: false,
    actionUrl: "/insights/compensation",
  },
  {
    id: "ALT-002",
    type: "performance",
    severity: "success",
    title: "Top Performer Achievement",
    message: "Sarah Chen has achieved 150% quota attainment this quarter - eligible for accelerator bonus.",
    timestamp: "2024-12-14T15:45:00Z",
    read: false,
  },
  {
    id: "ALT-003",
    type: "goal",
    severity: "success",
    title: "Team Goal Achieved",
    message: "West-Enterprise team has hit their Q4 target ahead of schedule. Congratulations!",
    timestamp: "2024-12-13T09:00:00Z",
    read: true,
  },
  {
    id: "ALT-004",
    type: "performance",
    severity: "critical",
    title: "Underperformance Alert",
    message: "5 sales reps are below 60% quota attainment with 2 weeks remaining in the quarter.",
    timestamp: "2024-12-11T14:20:00Z",
    read: false,
    actionUrl: "/performance",
  },
];

const recommendations = [
  {
    id: "REC-001",
    title: "Focus on North Region",
    description: "North Region is underperforming by 6.5%. Consider additional support or SPIF incentives.",
    impact: "High",
    category: "Performance",
    icon: Target,
  },
  {
    id: "REC-002",
    title: "Review Tiered Plan Effectiveness",
    description: "Tiered commission plan shows 15% higher attainment vs basic plan. Consider expanding eligibility.",
    impact: "Medium",
    category: "Compensation",
    icon: TrendingUp,
  },
  {
    id: "REC-003",
    title: "Q1 Planning Preparation",
    description: "Begin quota planning for Q1 2025. Historical data suggests 8% YoY growth target is achievable.",
    impact: "High",
    category: "Planning",
    icon: Lightbulb,
  },
];

const activeSpifs = [
  {
    id: "SPIF-001",
    name: "Holiday Push SPIF",
    description: "Extra $500 per deal closed before Dec 20",
    startDate: "2024-12-01",
    endDate: "2024-12-20",
    status: "active",
    participants: 40,
    totalPayout: 12500,
    dealsWon: 25,
  },
  {
    id: "SPIF-002",
    name: "New Product Launch",
    description: "2x commission on new Analytics module sales",
    startDate: "2024-11-15",
    endDate: "2024-12-31",
    status: "active",
    participants: 35,
    totalPayout: 28000,
    dealsWon: 14,
  },
];

const goals = [
  {
    id: "GOAL-001",
    name: "Q4 Revenue Target",
    target: 2500000,
    current: 2150000,
    startDate: "2024-10-01",
    endDate: "2024-12-31",
    status: "on-track" as const,
    milestones: [
      { date: "2024-10-31", target: 800000, actual: 820000 },
      { date: "2024-11-30", target: 1700000, actual: 1680000 },
      { date: "2024-12-31", target: 2500000, actual: 2150000 },
    ],
  },
  {
    id: "GOAL-002",
    name: "New Logo Acquisition",
    target: 50,
    current: 48,
    startDate: "2024-10-01",
    endDate: "2024-12-31",
    status: "ahead" as const,
    milestones: [
      { date: "2024-10-31", target: 15, actual: 18 },
      { date: "2024-11-30", target: 35, actual: 38 },
      { date: "2024-12-31", target: 50, actual: 48 },
    ],
  },
  {
    id: "GOAL-003",
    name: "Enterprise Expansion",
    target: 800000,
    current: 520000,
    startDate: "2024-10-01",
    endDate: "2024-12-31",
    status: "behind" as const,
    milestones: [
      { date: "2024-10-31", target: 250000, actual: 180000 },
      { date: "2024-11-30", target: 550000, actual: 420000 },
      { date: "2024-12-31", target: 800000, actual: 520000 },
    ],
  },
];

const coachingTips = [
  {
    id: "TIP-001",
    title: "Closing Techniques for Enterprise Deals",
    summary: "Master the art of multi-stakeholder negotiations",
    content: "When closing enterprise deals, focus on building consensus among stakeholders. Identify the economic buyer, champion, and technical evaluator early in the process.\n\nKey steps:\n1. Map the decision-making process\n2. Create value propositions for each stakeholder\n3. Address objections proactively\n4. Use ROI calculators to justify investment",
    category: "skill" as const,
    difficulty: "advanced" as const,
    estimatedTime: "15 min read",
    actionUrl: "/resources/enterprise-closing",
  },
  {
    id: "TIP-002",
    title: "Leveraging the New Analytics Module",
    summary: "Tips for positioning our newest product feature",
    content: "The Analytics Module is our fastest-growing product. Here's how to position it effectively:\n\n• Lead with the pain point: manual reporting takes 20+ hours per month\n• Show the dashboard demo early in the conversation\n• Highlight integration capabilities with existing tools\n• Use the ROI calculator showing 80% time savings",
    category: "product" as const,
    difficulty: "intermediate" as const,
    estimatedTime: "10 min read",
  },
  {
    id: "TIP-003",
    title: "End of Quarter Momentum",
    summary: "Stay motivated and focused during the final push",
    content: "The end of quarter can be challenging. Here are strategies to maintain your energy:\n\n• Break down your remaining quota into daily targets\n• Celebrate small wins with your team\n• Focus on qualified opportunities in your pipeline\n• Use the SPIF programs to create urgency",
    category: "motivation" as const,
    difficulty: "beginner" as const,
    estimatedTime: "5 min read",
  },
];

const badges = [
  {
    id: "BADGE-001",
    type: "quota-crusher" as const,
    name: "Quota Crusher",
    description: "Exceeded quota by 25% or more",
    earnedDate: "2024-11-30",
    level: "gold" as const,
  },
  {
    id: "BADGE-002",
    type: "streak" as const,
    name: "Hot Streak",
    description: "5 consecutive weeks above target",
    earnedDate: "2024-12-01",
    level: "silver" as const,
  },
  {
    id: "BADGE-003",
    type: "fast-closer" as const,
    name: "Fast Closer",
    description: "Average deal cycle under 30 days",
    earnedDate: "2024-10-15",
    level: "bronze" as const,
  },
  {
    id: "BADGE-004",
    type: "rising-star" as const,
    name: "Rising Star",
    description: "Top 10% improvement this quarter",
    earnedDate: "2024-12-10",
  },
  {
    id: "BADGE-005",
    type: "champion" as const,
    name: "Team Champion",
    description: "Helped 3+ teammates hit quota",
    earnedDate: "",
    progress: 67,
  },
];

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getSeverityStyle(severity: string): { bg: string; text: string; border: string } {
  switch (severity) {
    case "critical":
      return { bg: "bg-red-50 dark:bg-red-950/30", text: "text-red-700 dark:text-red-400", border: "border-red-200 dark:border-red-800" };
    case "warning":
      return { bg: "bg-amber-50 dark:bg-amber-950/30", text: "text-amber-700 dark:text-amber-400", border: "border-amber-200 dark:border-amber-800" };
    case "success":
      return { bg: "bg-emerald-50 dark:bg-emerald-950/30", text: "text-emerald-700 dark:text-emerald-400", border: "border-emerald-200 dark:border-emerald-800" };
    default:
      return { bg: "bg-blue-50 dark:bg-blue-950/30", text: "text-blue-700 dark:text-blue-400", border: "border-blue-200 dark:border-blue-800" };
  }
}

function getSeverityIcon(severity: string) {
  switch (severity) {
    case "critical":
      return <AlertTriangle className="h-5 w-5 text-red-500" />;
    case "warning":
      return <AlertTriangle className="h-5 w-5 text-amber-500" />;
    case "success":
      return <CheckCircle2 className="h-5 w-5 text-emerald-500" />;
    default:
      return <Bell className="h-5 w-5 text-blue-500" />;
  }
}

export default function AccelerationPage() {
  const { format: fmt } = useCurrency();
  const [alertsList, setAlertsList] = useState(alerts);
  const unreadAlerts = alertsList.filter((a) => !a.read).length;

  const markAsRead = (alertId: string) => {
    setAlertsList((prev) =>
      prev.map((a) => (a.id === alertId ? { ...a, read: true } : a))
    );
    toast.success("Alert marked as read");
  };

  const markAllRead = () => {
    setAlertsList((prev) => prev.map((a) => ({ ...a, read: true })));
    toast.success("All alerts marked as read");
  };

  const handleCoachingComplete = () => {
    toast.success("Coaching tip completed!");
  };

  return (
    <motion.div
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900"
    >
      <div className="container mx-auto px-4 md:px-6 py-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
            Acceleration & Alerts
          </h1>
          <p className="mt-2 text-slate-600 dark:text-slate-400">
            Active incentives, notifications, and AI-powered recommendations
          </p>
        </div>

        {/* Badges Section */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="mb-6"
        >
          <Card className="border-0 shadow-lg bg-gradient-to-br from-slate-900 to-slate-800">
            <CardContent className="py-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-white flex items-center gap-2 mb-1">
                    <Award className="h-5 w-5 text-amber-400" />
                    Your Achievements
                  </h2>
                  <p className="text-sm text-slate-400">
                    {badges.filter((b) => !b.progress || b.progress === 100).length} badges earned, {badges.filter((b) => b.progress && b.progress < 100).length} in progress
                  </p>
                </div>
                <BadgeDisplay badges={badges} size="md" showLabels={false} />
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Active SPIFs */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="mb-6"
        >
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Zap className="h-5 w-5 text-amber-500" />
            Active Incentive Programs
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            {activeSpifs.map((spif, index) => (
              <motion.div key={spif.id} variants={itemVariants} custom={index}>
                <Card className="border-0 shadow-lg bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/20 dark:to-orange-950/20 overflow-hidden">
                  <CardContent className="pt-6 relative">
                    <motion.div
                      className="absolute top-0 right-0 w-32 h-32 bg-amber-200/20 rounded-full blur-2xl"
                      animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.5, 0.3] }}
                      transition={{ duration: 3, repeat: Infinity }}
                    />
                    <div className="flex items-start justify-between mb-3 relative">
                      <div>
                        <Badge className="bg-amber-500 text-white hover:bg-amber-500 mb-2">
                          Active SPIF
                        </Badge>
                        <h3 className="font-semibold text-slate-900 dark:text-slate-50">{spif.name}</h3>
                        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">{spif.description}</p>
                      </div>
                      <Zap className="h-8 w-8 text-amber-400" />
                    </div>
                    <div className="grid grid-cols-4 gap-4 mt-4 pt-4 border-t border-amber-200 dark:border-amber-800">
                      <div>
                        <p className="text-xs text-slate-500 dark:text-slate-400">Ends</p>
                        <p className="font-medium text-slate-900 dark:text-slate-50">
                          {new Date(spif.endDate).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                          })}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500 dark:text-slate-400">Participants</p>
                        <p className="font-medium text-slate-900 dark:text-slate-50">{spif.participants}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500 dark:text-slate-400">Deals Won</p>
                        <p className="font-medium text-emerald-600">{spif.dealsWon}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500 dark:text-slate-400">Total Payout</p>
                        <p className="font-medium text-emerald-600">
                          {fmt(spif.totalPayout)}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Tabbed Content */}
        <Tabs defaultValue="alerts" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4 md:w-auto md:inline-grid">
            <TabsTrigger value="alerts" className="flex items-center gap-2">
              <Bell className="h-4 w-4" />
              <span className="hidden sm:inline">Alerts</span>
              {unreadAlerts > 0 && (
                <Badge variant="destructive" className="h-5 w-5 p-0 text-xs">
                  {unreadAlerts}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="goals" className="flex items-center gap-2">
              <Target className="h-4 w-4" />
              <span className="hidden sm:inline">Goals</span>
            </TabsTrigger>
            <TabsTrigger value="coaching" className="flex items-center gap-2">
              <Lightbulb className="h-4 w-4" />
              <span className="hidden sm:inline">Coaching</span>
            </TabsTrigger>
            <TabsTrigger value="recommendations" className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              <span className="hidden sm:inline">Insights</span>
            </TabsTrigger>
          </TabsList>

          {/* Alerts Tab */}
          <TabsContent value="alerts">
            <Card className="border-0 shadow-lg">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Bell className="h-5 w-5 text-slate-400" />
                      Notifications
                    </CardTitle>
                    <CardDescription>System alerts and important updates</CardDescription>
                  </div>
                  {unreadAlerts > 0 && (
                    <Button variant="ghost" size="sm" onClick={markAllRead}>
                      Mark all read
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <motion.div
                  variants={containerVariants}
                  initial="hidden"
                  animate="visible"
                  className="space-y-3"
                >
                  <AnimatePresence>
                    {alertsList.map((alert, index) => {
                      const style = getSeverityStyle(alert.severity);
                      return (
                        <motion.div
                          key={alert.id}
                          variants={itemVariants}
                          custom={index}
                          layout
                          className={`p-4 rounded-lg border ${style.border} ${style.bg} ${
                            !alert.read ? "ring-2 ring-offset-2 ring-slate-200 dark:ring-slate-700 dark:ring-offset-slate-900" : ""
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            {getSeverityIcon(alert.severity)}
                            <div className="flex-1">
                              <div className="flex items-start justify-between">
                                <h4 className={`font-medium ${style.text}`}>
                                  {alert.title}
                                </h4>
                                {!alert.read && (
                                  <motion.span
                                    initial={{ scale: 0 }}
                                    animate={{ scale: 1 }}
                                    className="w-2 h-2 bg-blue-500 rounded-full"
                                  />
                                )}
                              </div>
                              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                                {alert.message}
                              </p>
                              <div className="flex items-center justify-between mt-2">
                                <span className="text-xs text-slate-500 flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  {formatDate(alert.timestamp)}
                                </span>
                                <div className="flex items-center gap-2">
                                  {!alert.read && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 text-xs"
                                      onClick={() => markAsRead(alert.id)}
                                    >
                                      Mark read
                                    </Button>
                                  )}
                                  {alert.actionUrl && (
                                    <Button variant="ghost" size="sm" className="h-7 text-xs gap-1">
                                      View Details
                                      <ChevronRight className="h-3 w-3" />
                                    </Button>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                </motion.div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Goals Tab */}
          <TabsContent value="goals">
            <Card className="border-0 shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Target className="h-5 w-5 text-sky-500" />
                  Goal Pacing
                </CardTitle>
                <CardDescription>
                  Track progress toward your quarterly objectives
                </CardDescription>
              </CardHeader>
              <CardContent>
                <GoalPacing goals={goals} />
              </CardContent>
            </Card>
          </TabsContent>

          {/* Coaching Tab */}
          <TabsContent value="coaching">
            <Card className="border-0 shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Lightbulb className="h-5 w-5 text-amber-500" />
                  Coaching Tips
                </CardTitle>
                <CardDescription>
                  Personalized recommendations to improve your performance
                </CardDescription>
              </CardHeader>
              <CardContent>
                <CoachingCard tips={coachingTips} onComplete={handleCoachingComplete} />
              </CardContent>
            </Card>
          </TabsContent>

          {/* Recommendations Tab */}
          <TabsContent value="recommendations">
            <Card className="border-0 shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-emerald-500" />
                  AI Recommendations
                </CardTitle>
                <CardDescription>
                  Insights and suggested actions based on your data
                </CardDescription>
              </CardHeader>
              <CardContent>
                <motion.div
                  variants={containerVariants}
                  initial="hidden"
                  animate="visible"
                  className="space-y-4"
                >
                  {recommendations.map((rec, index) => (
                    <motion.div
                      key={rec.id}
                      variants={itemVariants}
                      custom={index}
                      whileHover={{ scale: 1.01 }}
                      className="p-4 rounded-lg border border-slate-200 hover:border-slate-300 transition-colors dark:border-slate-700 dark:hover:border-slate-600"
                    >
                      <div className="flex items-start gap-3">
                        <div className="p-2 bg-slate-100 rounded-lg dark:bg-slate-800">
                          <rec.icon className="h-5 w-5 text-slate-600 dark:text-slate-400" />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-start justify-between">
                            <h4 className="font-medium text-slate-900 dark:text-slate-50">
                              {rec.title}
                            </h4>
                            <Badge
                              variant="secondary"
                              className={
                                rec.impact === "High"
                                  ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                                  : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                              }
                            >
                              {rec.impact} Impact
                            </Badge>
                          </div>
                          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                            {rec.description}
                          </p>
                          <div className="flex items-center justify-between mt-3">
                            <Badge variant="outline" className="text-xs">
                              {rec.category}
                            </Badge>
                            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1">
                              Take Action
                              <ArrowRight className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </motion.div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </motion.div>
  );
}
