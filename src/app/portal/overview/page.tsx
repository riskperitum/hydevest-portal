"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import {
  TrendingUp,
  ShoppingCart,
  Package,
  DollarSign,
  Users,
  Receipt,
  Plus,
  ArrowUpRight,
  ArrowDownRight,
  Plane,
  CreditCard,
  BarChart3,
} from "lucide-react";

const trendData = [
  { month: "Nov", revenue: 0, recovered: 0 },
  { month: "Dec", revenue: 12000000, recovered: 4000000 },
  { month: "Jan", revenue: 45000000, recovered: 18000000 },
  { month: "Feb", revenue: 98000000, recovered: 52000000 },
  { month: "Mar", revenue: 180000000, recovered: 89000000 },
  { month: "Apr", revenue: 221000000, recovered: 92000000 },
];

const pieData = [
  { name: "Direct", value: 55, color: "#55249e" },
  { name: "Presale", value: 30, color: "#8554d1" },
  { name: "Partner", value: 15, color: "#c4aaec" },
];

const recentTrips = [
  {
    title: "Tinuolabo",
    desc: "1st set of wet salted container",
    location: "Colombia",
    supplier: "Miguel M",
    status: "active",
    end: "2026-04-22",
  },
  {
    title: "Deniyi",
    desc: "4th self ordered trip from Colombia",
    location: "Colombia",
    supplier: "Miguel M",
    status: "active",
    end: "2026-05-01",
  },
  {
    title: "Bosipo",
    desc: "3rd self order trip from Colombia",
    location: "Colombia",
    supplier: "Miguel M",
    status: "transit",
    end: "2026-04-16",
  },
];

const quickActions = [
  {
    label: "New trip",
    icon: <Plane size={16} />,
    href: "/portal/purchase/trips",
    variant: "outline" as const,
  },
  {
    label: "New presale",
    icon: <ShoppingCart size={16} />,
    href: "/portal/sales/presale",
    variant: "outline" as const,
  },
  {
    label: "New sale",
    icon: <TrendingUp size={16} />,
    href: "/portal/sales/orders",
    variant: "solid" as const,
  },
  {
    label: "Record payment",
    icon: <CreditCard size={16} />,
    href: "/portal/finance",
    variant: "outline" as const,
  },
];

const statusColors: Record<string, string> = {
  active: "bg-green-50 text-green-700",
  transit: "bg-amber-50 text-amber-700",
  completed: "bg-gray-100 text-gray-600",
};

function fmt(n: number) {
  if (n >= 1000000) return `₦${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `₦${(n / 1000).toFixed(0)}K`;
  return `₦${n}`;
}

export default function OverviewPage() {
  const [hoveredKpi, setHoveredKpi] = useState<string | null>(null);

  const todayLabel = useMemo(
    () =>
      new Date().toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      }),
    [],
  );

  const kpis = [
    {
      label: "Total revenue",
      value: "₦221.6M",
      change: "+18%",
      up: true,
      icon: <DollarSign size={18} />,
      color: "brand",
    },
    {
      label: "Recovered",
      value: "₦92.4M",
      change: "+12%",
      up: true,
      icon: <TrendingUp size={18} />,
      color: "green",
    },
    {
      label: "Outstanding",
      value: "₦129.2M",
      change: "-5%",
      up: false,
      icon: <BarChart3 size={18} />,
      color: "amber",
    },
    {
      label: "Active trips",
      value: "5",
      change: "+2",
      up: true,
      icon: <Plane size={18} />,
      color: "blue",
    },
    {
      label: "Partners",
      value: "8",
      change: "+1",
      up: true,
      icon: <Users size={18} />,
      color: "brand",
    },
    {
      label: "Pending expenses",
      value: "3",
      change: "-2",
      up: true,
      icon: <Receipt size={18} />,
      color: "red",
    },
  ];

  const colorMap: Record<string, { bg: string; icon: string; badge: string }> =
    {
      brand: {
        bg: "bg-brand-50",
        icon: "text-brand-600",
        badge: "bg-brand-100 text-brand-700",
      },
      green: {
        bg: "bg-green-50",
        icon: "text-green-600",
        badge: "bg-green-100 text-green-700",
      },
      amber: {
        bg: "bg-amber-50",
        icon: "text-amber-600",
        badge: "bg-amber-100 text-amber-700",
      },
      blue: {
        bg: "bg-blue-50",
        icon: "text-blue-600",
        badge: "bg-blue-100 text-blue-700",
      },
      red: {
        bg: "bg-red-50",
        icon: "text-red-500",
        badge: "bg-red-100 text-red-600",
      },
    };

  return (
    <div className="space-y-6 max-w-[1400px]">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Overview</h1>
          <p className="text-sm text-gray-400 mt-0.5">{todayLabel}</p>
        </div>
        <Link
          href="/portal/purchase/trips/new"
          className="inline-flex items-center gap-2 px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 transition-colors"
        >
          <Plus size={16} /> New trip
        </Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {kpis.map((kpi) => {
          const c = colorMap[kpi.color];
          return (
            <div
              key={kpi.label}
              onMouseEnter={() => setHoveredKpi(kpi.label)}
              onMouseLeave={() => setHoveredKpi(null)}
              className={`bg-white rounded-xl border transition-all duration-200 p-4 cursor-default
                ${
                  hoveredKpi === kpi.label
                    ? "border-brand-200 shadow-md -translate-y-0.5"
                    : "border-gray-100 shadow-sm"
                }`}
            >
              <div
                className={`inline-flex p-2 rounded-lg ${c.bg} ${c.icon} mb-3`}
              >
                {kpi.icon}
              </div>
              <p className="text-xl font-semibold text-gray-900 leading-none">
                {kpi.value}
              </p>
              <p className="text-xs text-gray-500 mt-1 mb-2">{kpi.label}</p>
              <span
                className={`inline-flex items-center gap-0.5 text-xs font-medium px-1.5 py-0.5 rounded-full ${c.badge}`}
              >
                {kpi.up ? (
                  <ArrowUpRight size={11} />
                ) : (
                  <ArrowDownRight size={11} />
                )}
                {kpi.change}
              </span>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="xl:col-span-2 bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">
                Debt vs recovery trend
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">
                Revenue collected vs outstanding
              </p>
            </div>
            <div className="flex items-center gap-4 text-xs text-gray-500">
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-0.5 bg-brand-500 inline-block rounded" />{" "}
                Revenue
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-0.5 bg-green-400 inline-block rounded" />{" "}
                Recovered
              </span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart
              data={trendData}
              margin={{ top: 0, right: 0, left: -20, bottom: 0 }}
            >
              <defs>
                <linearGradient id="gRev" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#55249e" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#55249e" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gRec" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#22c55e" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis
                dataKey="month"
                tick={{ fontSize: 11, fill: "#9ca3af" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "#9ca3af" }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => fmt(Number(v))}
              />
              <Tooltip
                contentStyle={{
                  border: "1px solid #e5e7eb",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                formatter={(value) => [fmt(Number(value)), ""]}
              />
              <Area
                type="monotone"
                dataKey="revenue"
                stroke="#55249e"
                strokeWidth={2}
                fill="url(#gRev)"
              />
              <Area
                type="monotone"
                dataKey="recovered"
                stroke="#22c55e"
                strokeWidth={2}
                fill="url(#gRec)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="flex flex-col gap-5">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <h2 className="text-sm font-semibold text-gray-900 mb-3">
              Quick actions
            </h2>
            <div className="space-y-2">
              {quickActions.map((a) => (
                <Link
                  key={a.label}
                  href={a.href}
                  className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium transition-colors
                    ${
                      a.variant === "solid"
                        ? "bg-brand-600 text-white hover:bg-brand-700"
                        : "border border-gray-200 text-gray-700 hover:bg-gray-50"
                    }`}
                >
                  {a.icon} {a.label}
                </Link>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 flex-1">
            <h2 className="text-sm font-semibold text-gray-900 mb-3">
              Sale method ratio
            </h2>
            <div className="flex items-center gap-4">
              <PieChart width={80} height={80}>
                <Pie
                  data={pieData}
                  cx={35}
                  cy={35}
                  innerRadius={22}
                  outerRadius={38}
                  dataKey="value"
                  strokeWidth={0}
                >
                  {pieData.map((entry, i) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
              </PieChart>
              <div className="space-y-1.5 flex-1 min-w-0">
                {pieData.map((p) => (
                  <div key={p.name} className="flex items-center gap-2 text-xs">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ background: p.color }}
                    />
                    <span className="text-gray-600">{p.name}</span>
                    <span className="font-medium text-gray-900 ml-auto">
                      {p.value}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="xl:col-span-2 bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-900">Recent trips</h2>
            <Link
              href="/portal/purchase/trips"
              className="text-xs text-brand-600 hover:underline flex items-center gap-1"
            >
              View all <ArrowUpRight size={12} />
            </Link>
          </div>
          <div className="space-y-0">
            {recentTrips.map((trip, i) => (
              <div
                key={`${trip.title}-${i}`}
                className={`flex items-center gap-4 py-3 ${
                  i < recentTrips.length - 1 ? "border-b border-gray-50" : ""
                }`}
              >
                <div className="w-8 h-8 rounded-lg bg-brand-50 flex items-center justify-center shrink-0">
                  <Plane size={14} className="text-brand-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">
                    {trip.title}
                  </p>
                  <p className="text-xs text-gray-400 truncate">{trip.desc}</p>
                </div>
                <div className="text-right shrink-0">
                  <span
                    className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusColors[trip.status]}`}
                  >
                    {trip.status}
                  </span>
                  <p className="text-xs text-gray-400 mt-1">{trip.end}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">
            Container summary
          </h2>
          <div className="space-y-4">
            {[
              {
                label: "Containers in transit",
                value: "9",
                icon: <Package size={16} className="text-brand-600" />,
              },
              {
                label: "Total containers",
                value: "12",
                icon: <Package size={16} className="text-blue-500" />,
              },
              {
                label: "Total sales",
                value: "30",
                icon: <TrendingUp size={16} className="text-green-600" />,
              },
              {
                label: "Active partners",
                value: "8",
                icon: <Users size={16} className="text-amber-600" />,
              },
            ].map((s) => (
              <div key={s.label} className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center shrink-0">
                  {s.icon}
                </div>
                <div className="flex-1">
                  <p className="text-xs text-gray-500">{s.label}</p>
                </div>
                <p className="text-lg font-semibold text-gray-900">{s.value}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
