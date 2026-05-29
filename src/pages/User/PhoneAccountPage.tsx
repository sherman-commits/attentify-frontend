import { useEffect, useState } from "react";
import axios from "axios";
import Layout from "../../layouts/Layout";
import { useNotification } from "../../context/NotificationContext";
import { usePageTitle } from "../../context/PageTitleContext";
import { useUser } from "../../context/UserContext";
import { useCompany } from "../../context/CompanyContext";
import RoleWrapper from "../../components/RoleWrapper";

interface PhoneAccount {
  id: string;
  phone_number: string;
  label?: string;
  status: string;
  account_sid: string;
}

const emptyForm = {
  label: "",
  phone_number: "",
  account_sid: "",
  auth_token: "",
};

export default function PhoneAccountPage() {
  const [accounts, setAccounts] = useState<PhoneAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const { notify } = useNotification();
  const { setTitle } = usePageTitle();
  const { user } = useUser();
  const { currentCompanyId } = useCompany();

  useEffect(() => {
    setTitle("Accounts / Phone");
  }, [setTitle]);

  useEffect(() => {
    fetchAccounts();
  }, [currentCompanyId]);

  const fetchAccounts = async () => {
    if (!currentCompanyId) return;

    setLoading(true);
    try {
      const res = await axios.get(
        `${import.meta.env.VITE_API_URL || ""}/twilio/accounts`,
        {
          params: { company_id: currentCompanyId },
          headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
        }
      );
      setAccounts(res.data?.accounts || []);
    } catch (err) {
      console.error("Failed to fetch phone accounts", err);
      notify("error", "Failed to fetch phone accounts");
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = async () => {
    if (!currentCompanyId) {
      notify("error", "Please select a company first.");
      return;
    }

    setSaving(true);
    try {
      await axios.post(
        `${import.meta.env.VITE_API_URL || ""}/twilio/accounts`,
        {
          ...form,
          company_id: currentCompanyId,
        },
        {
          headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
        }
      );
      notify("success", "Twilio phone connected.");
      setForm(emptyForm);
      setShowForm(false);
      fetchAccounts();
    } catch (err: any) {
      console.error("Failed to connect phone account", err);
      notify("error", err?.response?.data?.detail || "Failed to connect phone account");
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (id: string) => {
    try {
      await axios.delete(`${import.meta.env.VITE_API_URL || ""}/twilio/accounts/${id}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      setAccounts((prev) => prev.filter((account) => account.id !== id));
      notify("success", "Phone account removed.");
    } catch (err: any) {
      console.error("Failed to remove phone account", err);
      notify("error", err?.response?.data?.detail || "Failed to remove phone account");
    }
  };

  const canSave =
    form.phone_number.trim() &&
    form.account_sid.trim() &&
    form.auth_token.trim() &&
    !saving;

  return (
    <Layout>
      <div className="p-3">
        <div className="border border-gray-300 p-4">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-medium text-gray-700">Phone Accounts</h3>
            <RoleWrapper allowedRoles={["company_owner", "store_owner"]} userRole={user?.role || "agent"}>
              <button
                onClick={() => setShowForm((prev) => !prev)}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 text-sm font-medium"
                type="button"
              >
                + Connect Phone
              </button>
            </RoleWrapper>
          </div>

          {showForm && (
            <div className="mb-5 border border-gray-200 p-4">
              <div className="grid gap-3 md:grid-cols-2">
                <input
                  value={form.label}
                  onChange={(e) => setForm((prev) => ({ ...prev, label: e.target.value }))}
                  className="border border-gray-300 px-3 py-2 text-sm"
                  placeholder="Label"
                />
                <input
                  value={form.phone_number}
                  onChange={(e) => setForm((prev) => ({ ...prev, phone_number: e.target.value }))}
                  className="border border-gray-300 px-3 py-2 text-sm"
                  placeholder="+15551234567"
                />
                <input
                  value={form.account_sid}
                  onChange={(e) => setForm((prev) => ({ ...prev, account_sid: e.target.value }))}
                  className="border border-gray-300 px-3 py-2 text-sm"
                  placeholder="Twilio Account SID"
                />
                <input
                  value={form.auth_token}
                  onChange={(e) => setForm((prev) => ({ ...prev, auth_token: e.target.value }))}
                  className="border border-gray-300 px-3 py-2 text-sm"
                  placeholder="Twilio Auth Token"
                  type="password"
                />
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={handleConnect}
                  disabled={!canSave}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 text-sm font-medium disabled:opacity-50"
                  type="button"
                >
                  {saving ? "Connecting..." : "Connect"}
                </button>
                <button
                  onClick={() => {
                    setForm(emptyForm);
                    setShowForm(false);
                  }}
                  className="border border-gray-300 px-4 py-2 text-sm text-gray-700"
                  type="button"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {loading ? (
            <p className="text-gray-500">Loading accounts...</p>
          ) : accounts.length === 0 ? (
            <p className="text-gray-500">No phone accounts connected yet.</p>
          ) : (
            <ul className="divide-y divide-gray-200">
              {accounts.map((account) => (
                <li key={account.id} className="py-3 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-gray-800 font-medium">{account.phone_number}</p>
                    <p className="text-sm text-gray-500">
                      {account.label || "Twilio"} - {account.account_sid} - {account.status}
                    </p>
                  </div>
                  <RoleWrapper allowedRoles={["company_owner", "store_owner"]} userRole={user?.role || "agent"}>
                    <button
                      onClick={() => handleRemove(account.id)}
                      className="text-sm text-red-500 hover:underline"
                      type="button"
                    >
                      Remove
                    </button>
                  </RoleWrapper>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Layout>
  );
}
