import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import axios from "axios";
import Layout from "../../layouts/Layout";
import { useCompany } from "../../context/CompanyContext";
import { useNotification } from "../../context/NotificationContext";
import { usePageTitle } from "../../context/PageTitleContext";
import { buildLogText, type AuditLog } from "../../utils/auditLog";

const categories = [
  { value: "all", label: "All" },
  { value: "tickets", label: "Tickets" },
  { value: "orders", label: "Orders" },
  { value: "team", label: "Team" },
  { value: "settings", label: "Settings" },
  { value: "integrations", label: "Integrations" },
];

const PAGE_SIZE = 50;

export default function AuditLogPage() {
  const { currentCompanyId } = useCompany();
  const { notify } = useNotification();
  const { setTitle } = usePageTitle();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [category, setCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);

  useEffect(() => {
    setTitle("Audit Log");
  }, [setTitle]);

  const fetchLogs = async (reset = true) => {
    if (!currentCompanyId) return;

    setLoading(true);
    try {
      const skip = reset ? 0 : logs.length;
      const response = await axios.get(
        `${import.meta.env.VITE_API_URL || ""}/company/${currentCompanyId}/audit-logs`,
        {
          params: {
            limit: PAGE_SIZE,
            skip,
            category,
            search,
          },
          headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
        }
      );
      const nextLogs = response.data?.logs || [];
      setLogs(reset ? nextLogs : [...logs, ...nextLogs]);
      setHasMore(Boolean(response.data?.has_more));
    } catch (error) {
      console.error("Failed to load audit logs:", error);
      notify("error", "Failed to load audit logs");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs(true);
  }, [currentCompanyId, category]);

  const handleSearch = (event: FormEvent) => {
    event.preventDefault();
    fetchLogs(true);
  };

  return (
    <Layout>
      <div className="p-4">
        <div className="border border-gray-300 bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-lg font-semibold text-gray-800">Audit Log</h3>
            <form onSubmit={handleSearch} className="flex gap-2">
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search logs"
                className="w-64 border border-gray-300 px-3 py-2 text-sm"
              />
              <button className="bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
                Search
              </button>
            </form>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {categories.map((item) => (
              <button
                key={item.value}
                onClick={() => setCategory(item.value)}
                className={`border px-3 py-1.5 text-sm ${
                  category === item.value
                    ? "border-blue-600 bg-blue-50 text-blue-700"
                    : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="mt-4 border border-gray-300 divide-y divide-gray-200">
            {logs.length === 0 && !loading ? (
              <div className="p-4 text-sm text-gray-500">No audit log entries found.</div>
            ) : (
              logs.map((log) => (
                <div key={log._id} className="p-4 text-sm text-gray-700">
                  {buildLogText(log)}
                </div>
              ))
            )}
          </div>

          <div className="mt-4 flex justify-center">
            {hasMore && (
              <button
                onClick={() => fetchLogs(false)}
                disabled={loading}
                className="border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
              >
                {loading ? "Loading..." : "Load more"}
              </button>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
