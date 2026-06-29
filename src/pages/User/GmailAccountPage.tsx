import { useEffect, useState } from "react";
import axios from "axios";
import Layout from "../../layouts/Layout";
import { useUser } from "../../context/UserContext";
import { useNotification } from "../../context/NotificationContext";
import { usePageTitle } from "../../context/PageTitleContext";
import { useCompany } from "../../context/CompanyContext";
import ConfirmDialog from "../../components/ConfirmDialog";
import RoleWrapper from "../../components/RoleWrapper";
import { TrashIcon } from "@heroicons/react/24/outline";

interface Store {
  id: string;
  shop: string;
}

interface GmailAccount {
  id: string;
  email: string;
  status: "connected" | "disconnected";
  owner_name: string;
  store: Store | null;
}

export default function GmailAccountPage() {
  const { currentCompanyId } = useCompany();
  const [accounts, setAccounts] = useState<GmailAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const { user } = useUser();
  const { notify } = useNotification();
  const { setTitle } = usePageTitle();
  const [isOpen, setIsOpen] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<GmailAccount | null>(null);

  const [stores, setStores] = useState<Store[]>([]);

  // Track unsaved changes
  const [pendingChanges, setPendingChanges] = useState<Record<string, string>>({});

  useEffect(() => {
    setTitle("Accounts / Gmail");
  }, [setTitle]);

  useEffect(() => {
    fetchAccounts();
  }, [currentCompanyId]);

  const fetchAccounts = async () => {
    if (!currentCompanyId) return;
    setLoading(true);
    try {
      const res = await axios.get(
        `${import.meta.env.VITE_API_URL || ""}/gmail/company_accounts/${currentCompanyId}`,
        { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } }
      );
      console.log(res.data)
      setAccounts(res.data.accounts || []);
      setStores(res.data.stores || []);
    } catch (err) {
      console.error("Failed to fetch Gmail accounts", err);
      notify("error", "Failed to fetch Gmail accounts");
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = () => {
    if (!user) {
      console.error("User not logged in");
      return;
    }
    const oauthUrl = `${import.meta.env.VITE_API_URL || ""}/gmail/oauth/login?user_id=${user.id}&company_id=${currentCompanyId}`;
    window.location.href = oauthUrl;
  };

  const onDelete = (id: string) => {
    setSelectedAccount(accounts.find((a) => a.id === id) || null);
    setIsOpen(true);
  };

  const handleDeleteAccount = async (id: string) => {
    try {
      await axios.delete(`${import.meta.env.VITE_API_URL || ""}/gmail/${id}`);
      setAccounts((prev) => prev.filter((account) => account.id !== id));
      notify("success", "Gmail account removed successfully");
    } catch (err) {
      console.error("Failed to remove Gmail account", err);
      notify("error", "Failed to remove Gmail account");
    }
  };

  // When user changes store in dropdown, keep it in pendingChanges
  const handleStoreSelect = (id: string, storeId: string) => {
    setPendingChanges((prev) => ({ ...prev, [id]: storeId }));
  };

  const handleSaveChanges = async () => {
    try {
      await Promise.all(
        Object.entries(pendingChanges).map(async ([id, store_id]) => {
          await axios.put(
            `${import.meta.env.VITE_API_URL || ""}/gmail/${id}/store`,
            { field: "store_id", value: store_id },
            { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } }
          );

          const store = stores.find((s) => s.id === store_id);
          setAccounts((prev) =>
            prev.map((acc) =>
              acc.id === id ? { ...acc, store: store ? { id: store_id, shop: store.shop } : null } : acc
            )
          );
        })
      );

      setPendingChanges({});
      notify("success", "Order matching scope saved successfully");
    } catch (err) {
      console.error("Failed to save changes", err);
      notify("error", "Failed to save store changes");
    }
  };

  const handleCancelChanges = () => {
    setPendingChanges({});
  };

  return (
    <Layout>
      <div className="p-3">
        <div className="border border-gray-300 p-4">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-medium text-gray-700">Gmail Accounts</h3>
            <RoleWrapper allowedRoles={["company_owner", "store_owner"]} userRole={user?.role || "agent"}>
              <button
                onClick={handleConnect}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 text-sm font-medium"
              >
                + Connect Gmail
              </button>
            </RoleWrapper>
          </div>

          {loading ? (
            <p className="text-gray-500">Loading accounts...</p>
          ) : accounts.length === 0 ? (
            <p className="text-gray-500">No Gmail accounts connected yet.</p>
          ) : (
            <div className="overflow-x-auto relative">
              <table className="w-full border border-gray-300 border-collapse text-sm">
                <thead>
                  <tr className="bg-gray-100 border-b border-gray-300 text-left text-gray-700">
                    <th className="w-2/12 px-3 py-2">Email</th>
                    <th className="w-2/12 px-3 py-2">Status</th>
                    <th className="w-2/12 px-3 py-2">Added By</th>
                    <th className="w-4/12 px-3 py-2">Order Matching Scope</th>
                    <th className="w-2/12 px-3 py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.map((account) => (
                    <tr key={account.id} className="hover:bg-gray-50 border-b border-gray-300">
                      <td className="px-3 py-2 font-medium">{account.email}</td>
                      <td
                        className={`px-3 py-2 ${
                          account.status === "connected" ? "text-green-600" : "text-red-500"
                        }`}
                      >
                        {account.status === "connected" ? "Connected" : "Disconnected"}
                      </td>
                      <td className="px-3 py-2">{account.owner_name}</td>
                      <td className="px-3 py-2">
                        {user?.role === "company_owner" || user?.role === "store_owner" ? (
                          <select
                            value={
                              pendingChanges[account.id] !== undefined
                                ? pendingChanges[account.id]
                                : account.store?.id || ""
                            }
                            onChange={(e) => handleStoreSelect(account.id, e.target.value)}
                            className="border border-gray-300 rounded px-2 py-1 text-sm"
                          >
                            <option value="">No store restriction</option>
                            {stores.map((store) => (
                              <option key={store.id} value={store.id}>
                                {store.shop}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-gray-700">
                            {account.store?.shop || "No store restriction"}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <RoleWrapper allowedRoles={["company_owner", "store_owner"]} userRole={user?.role || "agent"}>
                          <button
                            onClick={() => onDelete(account.id)}
                            className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 transition"
                          >
                            <TrashIcon className="w-5 h-5" />
                          </button>
                        </RoleWrapper>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Save / Cancel buttons when changes exist */}
              {Object.keys(pendingChanges).length > 0 && (
                <div className="flex justify-end gap-3 mt-4">
                  <button
                    onClick={handleSaveChanges}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm"
                  >
                    Save
                  </button>
                  <button
                    onClick={handleCancelChanges}
                    className="px-4 py-2 border border-gray-400 text-sm text-gray-700"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        isOpen={isOpen}
        title="Delete Account"
        message="Are you sure you want to delete this account? This action cannot be undone."
        onConfirm={() => {
          if (selectedAccount) {
            handleDeleteAccount(selectedAccount.id);
          }
          setIsOpen(false);
        }}
        onCancel={() => setIsOpen(false)}
      />
    </Layout>
  );
}
