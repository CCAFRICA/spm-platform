"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Search,
  Filter,
  Users,
  Building2,
  MapPin,
  Shield,
  AlertTriangle,
} from "lucide-react";

// Mock personnel data
const personnel = [
  { id: "U001", name: "Sarah Chen", email: "sarah.chen@vialuce.com", role: "Rep", region: "West", team: "West-Enterprise", manager: "Catherine Morris", status: "active", tier: "top" },
  { id: "U002", name: "Marcus Johnson", email: "marcus.johnson@vialuce.com", role: "Rep", region: "East", team: "East-Enterprise", manager: "William Rogers", status: "active", tier: "top" },
  { id: "U003", name: "Emily Rodriguez", email: "emily.rodriguez@vialuce.com", role: "Rep", region: "North", team: "North-SMB", manager: "Rebecca Reed", status: "active", tier: "top" },
  { id: "U004", name: "David Kim", email: "david.kim@vialuce.com", role: "Rep", region: "South", team: "South-Enterprise", manager: "Thomas Cook", status: "active", tier: "top" },
  { id: "U005", name: "Lisa Thompson", email: "lisa.thompson@vialuce.com", role: "Rep", region: "West", team: "West-Mid-Market", manager: "Maria Morgan", status: "active", tier: "top" },
  { id: "U006", name: "James Wilson", email: "james.wilson@vialuce.com", role: "Rep", region: "East", team: "East-SMB", manager: "Charles Bell", status: "active", tier: "top" },
  { id: "U007", name: "Amanda Foster", email: "amanda.foster@vialuce.com", role: "Rep", region: "North", team: "North-Enterprise", manager: "Patricia Murphy", status: "active", tier: "top" },
  { id: "U008", name: "Michael Brown", email: "michael.brown@vialuce.com", role: "Rep", region: "South", team: "South-Mid-Market", manager: "Steven Bailey", status: "active", tier: "top" },
  { id: "U011", name: "Jennifer Davis", email: "jennifer.davis@vialuce.com", role: "Rep", region: "North", team: "North-Mid-Market", manager: "Rebecca Reed", status: "active", tier: "high" },
  { id: "U012", name: "Robert Taylor", email: "robert.taylor@vialuce.com", role: "Rep", region: "South", team: "South-SMB", manager: "Thomas Cook", status: "active", tier: "high" },
  { id: "U041", name: "Catherine Morris", email: "catherine.morris@vialuce.com", role: "Manager", region: "West", team: "West-Enterprise", manager: "Sandra Richardson", status: "active", tier: "high" },
  { id: "U042", name: "William Rogers", email: "william.rogers@vialuce.com", role: "Manager", region: "East", team: "East-Enterprise", manager: "Paul Cox", status: "active", tier: "high" },
  { id: "U051", name: "Sandra Richardson", email: "sandra.richardson@vialuce.com", role: "VP", region: "West", team: "West-Region", manager: "Margaret Torres", status: "active", tier: "top" },
  { id: "U052", name: "Paul Cox", email: "paul.cox@vialuce.com", role: "VP", region: "East", team: "East-Region", manager: "Margaret Torres", status: "active", tier: "top" },
  { id: "U055", name: "Margaret Torres", email: "margaret.torres@vialuce.com", role: "Director", region: "West", team: "Executive", manager: "-", status: "active", tier: "top" },
];

function getTierColor(tier: string): string {
  switch (tier) {
    case "top": return "bg-emerald-100 text-emerald-700";
    case "high": return "bg-blue-100 text-blue-700";
    case "medium": return "bg-amber-100 text-amber-700";
    case "low": return "bg-red-100 text-red-700";
    default: return "bg-slate-100 text-slate-700";
  }
}

function getRoleColor(role: string): string {
  switch (role) {
    case "Director": return "bg-purple-100 text-purple-700";
    case "VP": return "bg-indigo-100 text-indigo-700";
    case "Manager": return "bg-sky-100 text-sky-700";
    default: return "bg-slate-100 text-slate-700";
  }
}

export default function ConfigurationPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [regionFilter, setRegionFilter] = useState("all");

  const filteredPersonnel = personnel.filter((person) => {
    const matchesSearch =
      person.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      person.email.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRole = roleFilter === "all" || person.role === roleFilter;
    const matchesRegion = regionFilter === "all" || person.region === regionFilter;
    return matchesSearch && matchesRole && matchesRegion;
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
      <div className="container mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
            Configuration
          </h1>
          <p className="mt-2 text-slate-600 dark:text-slate-400">
            Entity management and system settings
          </p>
        </div>

        {/* Admin Notice */}
        <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5" />
          <div>
            <p className="font-medium text-amber-800">View Only Mode</p>
            <p className="text-sm text-amber-700">
              Editing entity records requires administrator permissions. Contact your system admin for changes.
            </p>
          </div>
        </div>

        {/* Summary Stats */}
        <div className="grid gap-4 md:grid-cols-4 mb-6">
          <Card className="border-0 shadow-md">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-500">Total Personnel</p>
                  <p className="text-2xl font-bold">55</p>
                </div>
                <Users className="h-8 w-8 text-slate-300" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-md">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-500">Entities</p>
                  <p className="text-2xl font-bold">40</p>
                </div>
                <Building2 className="h-8 w-8 text-slate-300" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-md">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-500">Regions</p>
                  <p className="text-2xl font-bold">4</p>
                </div>
                <MapPin className="h-8 w-8 text-slate-300" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-md">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-500">Active</p>
                  <p className="text-2xl font-bold text-emerald-600">100%</p>
                </div>
                <Shield className="h-8 w-8 text-emerald-300" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Personnel Table */}
        <Card className="border-0 shadow-lg">
          <CardHeader>
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <CardTitle>Entity Directory</CardTitle>
                <CardDescription>All entities in the outcome system</CardDescription>
              </div>
            </div>

            {/* Filters */}
            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  placeholder="Search by name or email..."
                  className="pl-9"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <Select value={roleFilter} onValueChange={setRoleFilter}>
                <SelectTrigger className="w-full sm:w-[150px]">
                  <Filter className="mr-2 h-4 w-4" />
                  <SelectValue placeholder="Role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Roles</SelectItem>
                  <SelectItem value="Rep">Rep</SelectItem>
                  <SelectItem value="Manager">Manager</SelectItem>
                  <SelectItem value="VP">VP</SelectItem>
                  <SelectItem value="Director">Director</SelectItem>
                </SelectContent>
              </Select>
              <Select value={regionFilter} onValueChange={setRegionFilter}>
                <SelectTrigger className="w-full sm:w-[150px]">
                  <SelectValue placeholder="Region" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Regions</SelectItem>
                  <SelectItem value="North">North</SelectItem>
                  <SelectItem value="South">South</SelectItem>
                  <SelectItem value="East">East</SelectItem>
                  <SelectItem value="West">West</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>

          <CardContent>
            <div className="rounded-lg border border-slate-200 dark:border-slate-800">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50 dark:bg-slate-800/50">
                    <TableHead className="font-semibold">Entity</TableHead>
                    <TableHead className="font-semibold">Role</TableHead>
                    <TableHead className="font-semibold">Region</TableHead>
                    <TableHead className="font-semibold">Team</TableHead>
                    <TableHead className="font-semibold">Manager</TableHead>
                    <TableHead className="font-semibold">Tier</TableHead>
                    <TableHead className="font-semibold">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPersonnel.map((person) => (
                    <TableRow key={person.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8">
                            <AvatarImage src={`/avatars/${person.id}.jpg`} />
                            <AvatarFallback className="text-xs bg-slate-200">
                              {person.name.split(" ").map((n) => n[0]).join("")}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium text-slate-900 dark:text-slate-50">
                              {person.name}
                            </p>
                            <p className="text-xs text-slate-500">{person.email}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={getRoleColor(person.role)}>
                          {person.role}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-slate-600">{person.region}</TableCell>
                      <TableCell className="text-slate-600">{person.team}</TableCell>
                      <TableCell className="text-slate-600">{person.manager}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={getTierColor(person.tier)}>
                          {person.tier.charAt(0).toUpperCase() + person.tier.slice(1)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="bg-emerald-100 text-emerald-700">
                          Active
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="mt-4 flex items-center justify-between text-sm text-slate-500">
              <p>Showing {filteredPersonnel.length} of {personnel.length} entities</p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled>Previous</Button>
                <Button variant="outline" size="sm">Next</Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
