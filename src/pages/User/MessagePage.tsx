import React, { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Link } from "react-router-dom";
import Layout from "../../layouts/Layout";
import {
  MagnifyingGlassIcon,
  ArchiveBoxArrowDownIcon,
  InboxIcon,
  TrashIcon,
  XMarkIcon,
  ArrowPathIcon,
} from "@heroicons/react/24/outline";
import axios from "axios";
import { useNotification } from "../../context/NotificationContext";
import { usePageTitle } from "../../context/PageTitleContext";
import { useCompany } from "../../context/CompanyContext";
import { useUser } from "../../context/UserContext";
import { initSocket } from "../../services/socket";

interface ChatEntry {
  sender: string;
  content: string;
  title?: string;
  timestamp: string;
  channel?: string;
  message_type?: string;
  metadata?: any;
}

interface Message {
  _id: string;
  client: string;
  title?: string;
  ticket?: string;
  channel: string;
  status: string;
  archived: boolean;
  trashed: boolean;
  started_at?: string;
  last_updated: string;
  messages: ChatEntry[];
  assigned_to?: Member | null;
}

type ViewMode = "inbox" | "archived" | "trashed";
type AssignedFilter = "all" | "assigned" | "unassigned";
type SortBy = "started_at" | "last_updated";
type SortOrder = "asc" | "desc";

const modes: [ViewMode, React.ReactNode][] = [
  ["inbox", <InboxIcon className="w-5 h-5" key="inbox" />],
  ["archived", <ArchiveBoxArrowDownIcon className="w-5 h-5" key="archived" />],
  ["trashed", <TrashIcon className="w-5 h-5" key="trashed" />],
];

interface Member {
  id: string;
  name: string;
  email: string;
}

const statusList = [
  "Open",
  "Pending",
  "Resolved",
  "Escalated",
  "Awaiting Approval",
  "Cancelled",
];

const inboxStatusList = [
  "Open",
  "Pending",
  "Escalated",
  "Awaiting Approval",
];

const archivedStatusList = [
  "Resolved",
  "Cancelled",
];

const getStatusFilterOptions = (mode: ViewMode) => {
  if (mode === "inbox") return inboxStatusList;
  if (mode === "archived") return archivedStatusList;
  return statusList;
};

const MESSAGE_PREFERENCES_KEY = "attentify.messageListPreferences";

const defaultMessagePreferences = {
  viewMode: "inbox" as ViewMode,
  currentPage: 1,
  pageSize: 10,
  assignedFilter: "all" as AssignedFilter,
  statusFilter: "all",
  sortBy: "last_updated" as SortBy,
  sortOrder: "desc" as SortOrder,
};

function loadMessagePreferences() {
  try {
    const stored = localStorage.getItem(MESSAGE_PREFERENCES_KEY);
    if (!stored) return defaultMessagePreferences;

    return {
      ...defaultMessagePreferences,
      ...JSON.parse(stored),
    };
  } catch {
    return defaultMessagePreferences;
  }
}

export default function MessagePage() {
  const savedPreferences = loadMessagePreferences();
  const [selected, setSelected] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>(savedPreferences.viewMode);
  const [messages, setMessages] = useState<Message[]>([]);
  const [_, setLoading] = useState<boolean>(false);

  // Track menu state for assign and status per message
  const [assignMenuId, setAssignMenuId] = useState<string | null>(null);
  const [statusMenuId, setStatusMenuId] = useState<string | null>(null);
  const [memberSearch, setMemberSearch] = useState<string>("");
  const [members, setMembers] = useState<Member[]>([]);
  const { currentCompanyId } = useCompany();
  const { notify } = useNotification();
  const { setTitle } = usePageTitle();
  const { user } = useUser();
  const menuRef = useRef<HTMLDivElement>(null);

  const [search, setSearch] = useState<string>("");
  const [currentPage, setCurrentPage] = useState<number>(savedPreferences.currentPage);
  const [pageSize, setPageSize] = useState(savedPreferences.pageSize);
  const [assignedFilter, setAssignedFilter] = useState<AssignedFilter>(savedPreferences.assignedFilter);
  const [statusFilter, setStatusFilter] = useState<string>(savedPreferences.statusFilter);
  const [sortBy, setSortBy] = useState<SortBy>(savedPreferences.sortBy);
  const [sortOrder, setSortOrder] = useState<SortOrder>(savedPreferences.sortOrder);
  const [totalPages, setTotalPages] = useState(1);
  const [syncingGmail, setSyncingGmail] = useState(false);
  const statusFilterOptions = getStatusFilterOptions(viewMode);
  const effectiveStatusFilter =
    statusFilter === "all" || statusFilterOptions.includes(statusFilter)
      ? statusFilter
      : "all";

  useEffect(() => {
    const socket = initSocket();

    socket.on("connect", () => {
      console.log("Socket connected:", socket.id);
    });

    socket.on("gmail_update", (data) => {
      console.log("Gmail update:", data);
      fetchMessages();
    });

    return () => {
      socket.off("gmail_update");
    };
  }, []);
  
  useEffect(() => {
    if (!currentCompanyId) return;

    const fetchMembers = async () => {
      try {
        const response = await axios.get(
          `${import.meta.env.VITE_API_URL || ""}/company/${currentCompanyId}/active_members`,
          {
            headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
          }
        );
        setMembers(response.data || []);
      } catch (error) {
        console.error("Failed to load active members:", error);
        setMembers([]);
      }
    };

    fetchMembers();
  }, [currentCompanyId]);

  useEffect(() => {
    setTitle("Messages");
  }, [setTitle]);

  useEffect(() => {
    localStorage.setItem(
      MESSAGE_PREFERENCES_KEY,
      JSON.stringify({
        viewMode,
        currentPage,
        pageSize,
        assignedFilter,
        statusFilter,
        sortBy,
        sortOrder,
      })
    );
  }, [viewMode, currentPage, pageSize, assignedFilter, statusFilter, sortBy, sortOrder]);

  const fetchMessages = async () => {
    if (!currentCompanyId) return;

    setLoading(true);
    try {
      const response = await axios.get(
        `${import.meta.env.VITE_API_URL || ""}/message/company_messages`,
        {
          params: { 
            company_id: currentCompanyId,
            search,
            page: currentPage,
            size: pageSize,
            view_mode: viewMode,
            assigned_filter: assignedFilter,
            status_filter: effectiveStatusFilter,
            sort_by: sortBy,
            sort_order: sortOrder,
          },
          headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
        }
      );

      setMessages(response.data?.messages);
      setTotalPages(response.data?.totalPages);
    } catch (error) {
      console.error("Failed to load messages:", error);
      notify("error", "Failed to load messages");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMessages();
  }, [currentCompanyId, currentPage, pageSize, search, viewMode, assignedFilter, effectiveStatusFilter, sortBy, sortOrder]);

  useEffect(() => {
    if (statusFilter !== "all" && !statusFilterOptions.includes(statusFilter)) {
      setStatusFilter("all");
      setCurrentPage(1);
    }
  }, [viewMode, statusFilter, statusFilterOptions]);

  useEffect(() => {
    setSelected([]);
  }, [viewMode, search, assignedFilter, statusFilter, sortBy, sortOrder]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target as Node)
      ) {
        setAssignMenuId(null);
        setStatusMenuId(null);
      }
    }
    if (assignMenuId || statusMenuId) {
      document.addEventListener("mousedown", handleClickOutside);
    } else {
      document.removeEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [assignMenuId, statusMenuId]);

  const filteredMessages = messages
    .filter((msg) => {
      if (viewMode === "inbox") {
        return inboxStatusList.includes(msg.status) && !msg.trashed;
      }
      if (viewMode === "archived") {
        return archivedStatusList.includes(msg.status) && !msg.trashed;
      }
      if (viewMode === "trashed") {
        return msg.trashed;
      }
      return false;
    });

  const toggleSelectAll = (): void => {
    if (selected.length === filteredMessages.length && filteredMessages.length > 0) {
      setSelected([]);
    } else {
      setSelected(filteredMessages.map((msg) => msg._id));
    }
  };

  const toggleSelect = (id: string): void => {
    setSelected((prevSelected) =>
      prevSelected.includes(id)
        ? prevSelected.filter((sid) => sid !== id)
        : [...prevSelected, id]
    );
  };

  const onSearchChange = (e: ChangeEvent<HTMLInputElement>): void => {
    setSearch(e.target.value);
    setCurrentPage(1);
  };

  const handleSyncGmail = async () => {
    if (!currentCompanyId) return;

    setSyncingGmail(true);
    try {
      await axios.post(
        `${import.meta.env.VITE_API_URL || ""}/message/fetch-all`,
        { company_id: currentCompanyId },
        {
          headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
        }
      );
      notify("success", "Gmail inbox synced.");
      fetchMessages();
    } catch (error) {
      console.error("Failed to sync Gmail:", error);
      notify("error", "Failed to sync Gmail.");
    } finally {
      setSyncingGmail(false);
    }
  };

  const handleAssignMenuOpen = (id: string) => {
    setAssignMenuId(id === assignMenuId ? null : id);
    setStatusMenuId(null);
    setMemberSearch("");
  };

  const handleStatusMenuOpen = (id: string) => {
    setStatusMenuId(id === statusMenuId ? null : id);
    setAssignMenuId(null);
  };

  const handleUserSelect = async (member: Member, msg: Message) => {
    setAssignMenuId(null);
    try {
      await axios.patch(
        `${import.meta.env.VITE_API_URL}/message/${msg._id}`,
        { 
          field: "assigned_member_id",
          value: member.id 
        },
        {
          headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
        }
      );
      notify("success", `Message assigned to ${member.name}.`);
      fetchMessages();
    } catch (error) {
      notify("error", "Failed to assign. Please try again.");
    }
  };

  const handleStatusSelect = async (status: string, msg: Message) => {
    setStatusMenuId(null);

    try {
      await axios.patch(
        `${import.meta.env.VITE_API_URL}/message/${msg._id}`,
        { 
          field: "status",
          value: status 
        },
        {
          headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
        }
      );
      notify("success", "Message status updated successfully.");
      fetchMessages();
    } catch (error) {
      notify("error", "Failed to update status. Please try again.");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await axios.patch(
        `${import.meta.env.VITE_API_URL}/message/${id}`,
        {
          field: "trashed",
          value: true
        },
        {
          headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
        }
      );
      notify("success", "Message moved to trash.");
      fetchMessages();
    } catch (error) {
      notify("error", "Failed to delete message. Please try again.");
    }
  };

  const filteredMembers = members.filter(
    (member) =>
      member.name.toLowerCase().includes(memberSearch.toLowerCase()) ||
      member.email.toLowerCase().includes(memberSearch.toLowerCase())
  );

  const viewLabel: string =
    viewMode === "archived"
      ? "Archived"
      : viewMode === "trashed"
        ? "Trash"
        : "Inbox";

  // Utility to get member circle
  const AssignedCircle = ({ user }: { user: Member }) => (
    <span
      title={user.name}
      className="inline-flex items-center justify-center h-8 w-8 rounded-full bg-blue-200 text-blue-700 font-bold text-base"
    >
      {user.name.charAt(0).toUpperCase()}
    </span>
  );

  return (
    <Layout>
      <div className="p-4">
        <div className="relative mb-6">
          <input
            type="text"
            placeholder="Search"
            value={search}
            onChange={onSearchChange}
            className="w-full px-5 py-3 pl-12 border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 text-md"
          />
          <MagnifyingGlassIcon className="h-6 w-6 text-gray-500 absolute top-3 left-4" />
        </div>

        <div className="flex justify-between items-center mb-4">
          <div className="flex gap-6">
            {modes.map(([mode, icon]) => (
              <button
                key={mode}
                onClick={() => {
                  setViewMode(mode);
                  setCurrentPage(1);
                }}
                className={`flex items-center gap-2 text-base ${viewMode === mode
                  ? "text-blue-600 font-semibold"
                  : "text-gray-500 hover:text-gray-700"
                  }`}
                type="button"
              >
                {icon} {mode.charAt(0).toUpperCase() + mode.slice(1)}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={handleSyncGmail}
            disabled={syncingGmail || !currentCompanyId}
            className="inline-flex items-center gap-2 border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
          >
            <ArrowPathIcon className={`h-4 w-4 ${syncingGmail ? "animate-spin" : ""}`} />
            {syncingGmail ? "Syncing" : "Sync Gmail"}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-3 mb-4">
          <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
            Sort by
            <select
              value={sortBy}
              onChange={(e) => {
                setSortBy(e.target.value as SortBy);
                setCurrentPage(1);
              }}
              className="border border-gray-300 px-3 py-2 text-sm font-normal text-gray-700"
            >
              <option value="started_at">Ticket date</option>
              <option value="last_updated">Last updated</option>
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
            Direction
            <select
              value={sortOrder}
              onChange={(e) => {
                setSortOrder(e.target.value as SortOrder);
                setCurrentPage(1);
              }}
              className="border border-gray-300 px-3 py-2 text-sm font-normal text-gray-700"
            >
              <option value="desc">Newest first</option>
              <option value="asc">Oldest first</option>
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
            Assignment
            <select
              value={assignedFilter}
              onChange={(e) => {
                setAssignedFilter(e.target.value as AssignedFilter);
                setCurrentPage(1);
              }}
              className="border border-gray-300 px-3 py-2 text-sm font-normal text-gray-700"
            >
              <option value="all">All tickets</option>
              <option value="assigned">Assigned</option>
              <option value="unassigned">Unassigned</option>
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
            Status
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="border border-gray-300 px-3 py-2 text-sm font-normal text-gray-700"
            >
              <option value="all">All statuses</option>
              {statusFilterOptions.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="bg-white min-h-150 border border-gray-300 overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-md">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 w-14">
                  <input
                    type="checkbox"
                    checked={
                      selected.length === filteredMessages.length &&
                      filteredMessages.length > 0
                    }
                    onChange={toggleSelectAll}
                    className="h-5 w-5 text-blue-600 border-gray-300 cursor-pointer"
                    aria-label="Select all messages"
                  />
                </th>
                <th className="px-6 py-3 w-2/10 text-left">Client</th>
                <th className="px-6 py-3 w-4/10 text-left">Title</th>
                <th className="px-6 py-3 w-2/10 text-left">Ticket</th>
                <th className="px-6 py-3 w-1/10 text-left">Assigned</th>
                <th className="px-6 py-3 w-1/10 text-left">Status</th>
                <th className="px-6 py-3 w-2/10 text-center">
                  Last Updated
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredMessages.length === 0 ? (
                <tr>
                  <td className="p-8 text-gray-400 text-center" colSpan={7}>
                    No {viewLabel.toLowerCase()} emails found.
                  </td>
                </tr>
              ) : (
                filteredMessages.map((msg) => (
                  <tr
                    key={msg._id}
                    className="group hover:bg-gray-50 transition-all border-b border-gray-100 relative"
                  >
                    <td className="px-6 py-4 w-14">
                      <input
                        type="checkbox"
                        checked={selected.includes(msg._id)}
                        onChange={() => toggleSelect(msg._id)}
                        className="h-5 w-5 text-blue-600 border-gray-300 cursor-pointer"
                        aria-label={`Select message ${msg.title ?? msg._id}`}
                      />
                    </td>
                    <td className="px-6 py-4 w-2/10 font-medium text-gray-700">
                      {msg.client}
                    </td>
                    <td className="px-6 py-4 w-4/10 text-blue-700 hover:underline">
                      <Link to={`/message/${msg._id}`}>
                        {msg.title ?? "(no subject)"}
                      </Link>
                    </td>
                    <td className="px-6 py-4 w-2/10 text-blue-700 hover:underline">
                      {msg.ticket?? ""}
                    </td>
                    {/* Assigned */}
                    <td className="px-6 py-4 w-1/10">
                      {["company_owner", "store_owner"].includes(user?.role || "agent") ? (
                        <button
                          className="flex items-center gap-2 px-2 py-1 bg-gray-100 hover:bg-blue-50 rounded cursor-pointer"
                          onClick={() => handleAssignMenuOpen(msg._id)}
                          type="button"
                        >
                          {msg.assigned_to ? (
                            <>
                              <AssignedCircle user={msg.assigned_to} />
                              <span className="text-gray-700">{msg.assigned_to.name.split(" ")[0]}</span>
                            </>
                          ) : (
                            <span className="text-gray-400">Unassigned</span>
                          )}
                        </button>
                      ) : msg.assigned_to ? (
                        <>
                          <AssignedCircle user={msg.assigned_to} />
                          <span className="text-gray-700 ms-1">{msg.assigned_to.name.split(" ")[0]}</span>
                        </>
                      ) : (
                        <span className="text-gray-400">Unassigned</span>
                      )}
                      
                      {/* Assign User Menu */}
                      {assignMenuId === msg._id && (
                        <div
                          ref={menuRef}
                          className="absolute z-30 mt-2 w-64 bg-white rounded-md border border-gray-200 shadow-lg"
                        >
                          <div className="flex items-center px-3 py-2 border-b border-gray-200">
                            <MagnifyingGlassIcon className="h-4 w-4 text-gray-400 mr-2" />
                            <input
                              autoFocus
                              type="text"
                              placeholder="Search users..."
                              value={memberSearch}
                              onChange={e => setMemberSearch(e.target.value)}
                              className="w-full text-sm px-1 py-1 outline-none"
                            />
                            <button
                              className="ml-2 text-gray-400 hover:text-gray-600"
                              onClick={() => setAssignMenuId(null)}
                              aria-label="Close"
                            >
                              <XMarkIcon className="h-5 w-5" />
                            </button>
                          </div>
                          <div className="max-h-56 overflow-y-auto">
                            {filteredMembers.length === 0 ? (
                              <div className="p-4 text-sm text-gray-400 text-center">
                                No users found.
                              </div>
                            ) : (
                              filteredMembers.map(member => (
                                <button
                                  key={member.id}
                                  className="flex items-center gap-3 w-full px-4 py-2 text-left hover:bg-blue-50"
                                  onClick={() => handleUserSelect(member, msg)}
                                >
                                  <AssignedCircle user={member} />
                                  <div>
                                    <div className="font-medium text-gray-700">{member.name}</div>
                                    <div className="text-xs text-gray-400">{member.email}</div>
                                  </div>
                                </button>
                              ))
                            )}
                          </div>
                        </div>
                      )}
                    </td>
                    {/* Status */}
                    <td className="px-6 py-4 w-1/10">
                      {["company_owner", "store_owner"].includes(user?.role || "agent") ? (
                        // Clickable status button for allowed roles
                        <button
                          className={`px-3 py-1 text-xs font-semibold rounded ${
                            msg.status === "Resolved" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"
                          }`}
                          onClick={() => handleStatusMenuOpen(msg._id)}
                          type="button"
                        >
                          {msg.status}
                        </button>
                      ) : (
                        // Read-only status display for other roles
                        <span
                          className={`px-3 py-1 text-xs font-semibold rounded inline-block ${
                            msg.status === "Resolved" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"
                          }`}
                        >
                          {msg.status}
                        </span>
                      )}

                      {/* Status Menu */}
                      {statusMenuId === msg._id && (
                        <div
                          ref={menuRef}
                          className="absolute z-30 mt-2 w-56 bg-white rounded-md border border-gray-200 shadow-lg"
                        >
                          <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200">
                            <span className="text-sm font-semibold text-gray-700">Change Status</span>
                            <button
                              className="ml-2 text-gray-400 hover:text-gray-600"
                              onClick={() => setStatusMenuId(null)}
                              aria-label="Close"
                            >
                              <XMarkIcon className="h-5 w-5" />
                            </button>
                          </div>
                          <div>
                            {statusList.map((status) => (
                              <button
                                key={status}
                                className="block w-full px-4 py-2 text-left hover:bg-blue-50"
                                onClick={() => handleStatusSelect(status, msg)}
                              >
                                {status}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 w-2/10 text-sm text-gray-500 text-center">
                      {new Date(msg.last_updated).toLocaleDateString()}

                      {/* Trash button (hidden until hover) */}
                      <button
                        onClick={() => handleDelete(msg._id)}
                        className="hidden group-hover:flex items-center justify-center absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-full text-gray-400 hover:text-red-600 hover:bg-red-50 transition"
                        aria-label="Delete message"
                      >
                        <TrashIcon className="w-6 h-6" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
            <div className="flex justify-between items-center mt-4">
              <div>
                <button
                  onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-1 border border-gray-300 mr-2 disabled:opacity-50"
                >
                  Previous
                </button>
                <button
                  onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                  disabled={currentPage === totalPages}
                  className="px-3 py-1 border border-gray-300 disabled:opacity-50"
                >
                  Next
                </button>
              </div>
              <div>
                Page {currentPage} of {totalPages}
              </div>
              <div>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="border border-gray-300 px-2 py-1"
                >
                  {[5, 10, 20, 50].map((size) => (
                    <option key={size} value={size}>
                      {size} / page
                    </option>
                  ))}
                </select>
              </div>
            </div>
      </div>
    </Layout>
  );
}
