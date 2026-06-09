import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { useCompany } from "../context/CompanyContext";
import { useNotification } from "../context/NotificationContext";
import { buildLogText, type AuditLog } from "../utils/auditLog";

export default function AuditLogSection() {
  const { currentCompanyId } = useCompany();
  const { notify } = useNotification();
  const [logs, setLogs] = useState<AuditLog[]>([]);

  useEffect(() => {
    if (!currentCompanyId) return;

    const fetchAuditLogs = async () => {
      try {
        const response = await axios.get(
          `${import.meta.env.VITE_API_URL || ""}/company/${currentCompanyId}/audit-logs`,
          {
            params: { limit: 5 },
            headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
          }
        );
        setLogs(response.data?.logs || []);
      } catch (error) {
        console.error("Failed to load audit logs:", error);
        notify("error", "Failed to load audit logs");
      }
    };

    fetchAuditLogs();
  }, [currentCompanyId, notify]);

  return (
    <section>
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-semibold text-gray-800">Audit Log</h3>
        <Link to="/settings/audit-log" className="text-sm font-medium text-blue-600 hover:underline">
          View all
        </Link>
      </div>
      <div className="mt-4 border border-gray-300 divide-y divide-gray-200">
        {logs.length === 0 ? (
          <div className="p-4 text-sm text-gray-500">No audit log entries yet.</div>
        ) : (
          logs.map((log) => (
            <div key={log._id} className="p-4 text-sm text-gray-700">
              {buildLogText(log)}
            </div>
          ))
        )}
      </div>
    </section>
  );
}
