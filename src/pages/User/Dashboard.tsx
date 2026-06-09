import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import {
  ArrowPathIcon,
  CheckCircleIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  InboxIcon,
  LinkIcon,
  ShieldCheckIcon,
  ShoppingBagIcon,
} from "@heroicons/react/24/outline";
import Layout from "../../layouts/Layout";
import { usePageTitle } from "../../context/PageTitleContext";
import { useCompany } from "../../context/CompanyContext";
import { useNotification } from "../../context/NotificationContext";
import { buildLogText, formatUtcDate, type AuditLog } from "../../utils/auditLog";

interface DashboardMessage {
  _id: string;
  title: string;
  client?: string;
  status?: string;
  ticket?: string;
  order_match_status?: string;
  matched_order_name?: string;
  last_updated?: string;
}

interface DashboardApproval {
  _id: string;
  type: string;
  requester_name?: string;
  requester_email?: string;
  created_at?: string;
  payload?: Record<string, unknown>;
}

interface DashboardData {
  summary: {
    open_tickets: number;
    pending_tickets: number;
    resolved_tickets: number;
    awaiting_approval: number;
    order_messages: number;
    needs_review: number;
    unmatched_orders: number;
  };
  connections: {
    gmail_connected: number;
    shopify_connected: number;
  };
  recent_messages: DashboardMessage[];
  review_messages: DashboardMessage[];
  pending_approvals: DashboardApproval[];
  recent_activity: AuditLog[];
}

const emptyDashboard: DashboardData = {
  summary: {
    open_tickets: 0,
    pending_tickets: 0,
    resolved_tickets: 0,
    awaiting_approval: 0,
    order_messages: 0,
    needs_review: 0,
    unmatched_orders: 0,
  },
  connections: {
    gmail_connected: 0,
    shopify_connected: 0,
  },
  recent_messages: [],
  review_messages: [],
  pending_approvals: [],
  recent_activity: [],
};

const statusClasses = (status?: string) => {
  switch (status) {
    case "Resolved":
      return "bg-green-50 text-green-700";
    case "Awaiting Approval":
    case "Pending":
      return "bg-yellow-50 text-yellow-700";
    case "Escalated":
      return "bg-red-50 text-red-700";
    default:
      return "bg-gray-100 text-gray-700";
  }
};

const formatLocalDate = (value?: string) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

const approvalLabel = (type: string) => {
  switch (type) {
    case "refund":
      return "Refund approval";
    case "cancellation":
      return "Cancellation approval";
    case "resolve":
      return "Resolve approval";
    default:
      return `${type || "Action"} approval`;
  }
};

const Metric = ({
  label,
  value,
  icon: Icon,
  to,
}: {
  label: string;
  value: number;
  icon: typeof InboxIcon;
  to?: string;
}) => {
  const content = (
    <div className="border border-gray-200 bg-white p-4 hover:border-gray-300">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm text-gray-500">{label}</div>
          <div className="mt-2 text-2xl font-semibold text-gray-900">{value}</div>
        </div>
        <Icon className="h-6 w-6 text-gray-500" />
      </div>
    </div>
  );

  return to ? <Link to={to}>{content}</Link> : content;
};

const Section = ({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) => (
  <section className="border border-gray-200 bg-white">
    <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
      <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
      {action}
    </div>
    <div className="p-4">{children}</div>
  </section>
);

export default function Dashboard() {
  const { setTitle } = usePageTitle();
  const { currentCompanyId } = useCompany();
  const { notify } = useNotification();
  const [dashboard, setDashboard] = useState<DashboardData>(emptyDashboard);
  const [loading, setLoading] = useState(false);

  const fetchDashboard = async () => {
    if (!currentCompanyId) return;

    setLoading(true);
    try {
      const response = await axios.get(
        `${import.meta.env.VITE_API_URL || ""}/company/${currentCompanyId}/dashboard`,
        {
          headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
        }
      );
      setDashboard(response.data);
    } catch (error) {
      console.error("Failed to fetch dashboard", error);
      notify("error", "Failed to fetch dashboard");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setTitle("Dashboard");
  }, [setTitle]);

  useEffect(() => {
    fetchDashboard();
  }, [currentCompanyId]);

  const needsAttention = [
    {
      label: "Messages needing order review",
      value: dashboard.summary.needs_review,
      to: "/message",
    },
    {
      label: "Unmatched order messages",
      value: dashboard.summary.unmatched_orders,
      to: "/message",
    },
    {
      label: "Approvals waiting",
      value: dashboard.summary.awaiting_approval,
      to: "/settings",
    },
  ];

  return (
    <Layout>
      <div className="space-y-5 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Dashboard</h1>
            <p className="mt-1 text-sm text-gray-500">Work queue, order support, approvals, and connection health.</p>
          </div>
          <button
            type="button"
            onClick={fetchDashboard}
            disabled={loading || !currentCompanyId}
            className="inline-flex items-center gap-2 border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
          >
            <ArrowPathIcon className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        {!currentCompanyId ? (
          <div className="border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800">
            Select or create a company to see dashboard data.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
              <Metric label="Open Tickets" value={dashboard.summary.open_tickets} icon={InboxIcon} to="/message" />
              <Metric label="Awaiting Approval" value={dashboard.summary.awaiting_approval} icon={ShieldCheckIcon} to="/settings" />
              <Metric label="Order Messages" value={dashboard.summary.order_messages} icon={ShoppingBagIcon} to="/message" />
              <Metric label="Needs Review" value={dashboard.summary.needs_review} icon={ExclamationTriangleIcon} to="/message" />
            </div>

            <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.2fr_0.8fr]">
              <Section
                title="Needs Attention"
                action={<Link to="/message" className="text-sm text-blue-600 hover:text-blue-700">View messages</Link>}
              >
                <div className="space-y-3">
                  {needsAttention.map((item) => (
                    <Link
                      key={item.label}
                      to={item.to}
                      className="flex items-center justify-between border border-gray-200 px-3 py-2 hover:bg-gray-50"
                    >
                      <span className="text-sm text-gray-700">{item.label}</span>
                      <span className="text-sm font-semibold text-gray-900">{item.value}</span>
                    </Link>
                  ))}
                </div>

                <div className="mt-4 border-t border-gray-200 pt-4">
                  <div className="mb-2 text-sm font-semibold text-gray-900">Review Queue</div>
                  {dashboard.review_messages.length === 0 ? (
                    <div className="text-sm text-gray-500">No messages need review.</div>
                  ) : (
                    <div className="space-y-2">
                      {dashboard.review_messages.map((message) => (
                        <Link
                          key={message._id}
                          to={`/message/${message._id}`}
                          className="block border border-gray-200 px-3 py-2 hover:bg-gray-50"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <span className="truncate text-sm font-medium text-gray-900">{message.title}</span>
                            <span className="text-xs text-gray-500">{formatLocalDate(message.last_updated)}</span>
                          </div>
                          <div className="mt-1 truncate text-xs text-gray-500">{message.client || "Unknown customer"}</div>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              </Section>

              <Section title="Connection Health">
                <div className="space-y-3">
                  <div className="flex items-center justify-between border border-gray-200 px-3 py-3">
                    <div className="flex items-center gap-2">
                      <LinkIcon className="h-5 w-5 text-gray-500" />
                      <span className="text-sm font-medium text-gray-900">Gmail</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={dashboard.connections.gmail_connected ? "text-sm font-semibold text-green-700" : "text-sm font-semibold text-red-700"}>
                        {dashboard.connections.gmail_connected ? `${dashboard.connections.gmail_connected} connected` : "Disconnected"}
                      </span>
                      <Link to="/accounts/gmail" className="text-sm text-blue-600 hover:text-blue-700">Manage</Link>
                    </div>
                  </div>
                  <div className="flex items-center justify-between border border-gray-200 px-3 py-3">
                    <div className="flex items-center gap-2">
                      <ShoppingBagIcon className="h-5 w-5 text-gray-500" />
                      <span className="text-sm font-medium text-gray-900">Shopify</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={dashboard.connections.shopify_connected ? "text-sm font-semibold text-green-700" : "text-sm font-semibold text-red-700"}>
                        {dashboard.connections.shopify_connected ? `${dashboard.connections.shopify_connected} connected` : "Disconnected"}
                      </span>
                      <Link to="/shopify" className="text-sm text-blue-600 hover:text-blue-700">Manage</Link>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <div className="border border-gray-200 px-3 py-3">
                      <div className="text-xs text-gray-500">Resolved Tickets</div>
                      <div className="mt-1 text-lg font-semibold text-gray-900">{dashboard.summary.resolved_tickets}</div>
                    </div>
                    <div className="border border-gray-200 px-3 py-3">
                      <div className="text-xs text-gray-500">Pending Tickets</div>
                      <div className="mt-1 text-lg font-semibold text-gray-900">{dashboard.summary.pending_tickets}</div>
                    </div>
                  </div>
                </div>
              </Section>
            </div>

            <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
              <Section
                title="Pending Approvals"
                action={<Link to="/settings" className="text-sm text-blue-600 hover:text-blue-700">Review</Link>}
              >
                {dashboard.pending_approvals.length === 0 ? (
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <CheckCircleIcon className="h-5 w-5 text-green-600" />
                    No pending approvals.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {dashboard.pending_approvals.map((approval) => (
                      <div key={approval._id} className="border border-gray-200 px-3 py-2">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-sm font-medium text-gray-900">{approvalLabel(approval.type)}</span>
                          <span className="text-xs text-gray-500">{formatLocalDate(approval.created_at)}</span>
                        </div>
                        <div className="mt-1 text-xs text-gray-500">
                          {approval.requester_name || approval.requester_email || "Unknown requester"}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Section>

              <Section
                title="Recent Messages"
                action={<Link to="/message" className="text-sm text-blue-600 hover:text-blue-700">Open inbox</Link>}
              >
                {dashboard.recent_messages.length === 0 ? (
                  <div className="text-sm text-gray-500">No recent messages.</div>
                ) : (
                  <div className="space-y-2">
                    {dashboard.recent_messages.map((message) => (
                      <Link key={message._id} to={`/message/${message._id}`} className="block border border-gray-200 px-3 py-2 hover:bg-gray-50">
                        <div className="flex items-center justify-between gap-3">
                          <span className="truncate text-sm font-medium text-gray-900">{message.title}</span>
                          <span className={`shrink-0 px-2 py-0.5 text-xs font-medium ${statusClasses(message.status)}`}>
                            {message.status || "Open"}
                          </span>
                        </div>
                        <div className="mt-1 flex items-center justify-between gap-3 text-xs text-gray-500">
                          <span className="truncate">{message.client || "Unknown customer"}</span>
                          <span className="shrink-0">{formatLocalDate(message.last_updated)}</span>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </Section>
            </div>

            <Section
              title="Recent Activity"
              action={<Link to="/settings/audit-log" className="text-sm text-blue-600 hover:text-blue-700">View audit log</Link>}
            >
              {dashboard.recent_activity.length === 0 ? (
                <div className="text-sm text-gray-500">No activity yet.</div>
              ) : (
                <div className="space-y-2">
                  {dashboard.recent_activity.map((log) => (
                    <div key={log._id} className="flex gap-3 border border-gray-200 px-3 py-2">
                      <ClockIcon className="mt-0.5 h-4 w-4 shrink-0 text-gray-500" />
                      <div className="min-w-0">
                        <div className="truncate text-sm text-gray-800">{buildLogText(log)}</div>
                        <div className="mt-1 text-xs text-gray-500">{formatUtcDate(log.created_at)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Section>
          </>
        )}
      </div>
    </Layout>
  );
}
