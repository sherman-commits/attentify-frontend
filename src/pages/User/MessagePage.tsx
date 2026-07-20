import React, { useEffect, useLayoutEffect, useRef, useState, type ChangeEvent } from "react";
import { Link, useLocation } from "react-router-dom";
import Layout from "../../layouts/Layout";
import {
  MagnifyingGlassIcon,
  ArchiveBoxArrowDownIcon,
  InboxIcon,
  TrashIcon,
  XMarkIcon,
  ArrowPathIcon,
  ArrowUturnLeftIcon,
  ChevronDownIcon,
  PaperClipIcon,
} from "@heroicons/react/24/outline";
import axios from "axios";
import { useNotification } from "../../context/NotificationContext";
import { usePageTitle } from "../../context/PageTitleContext";
import { useCompany } from "../../context/CompanyContext";
import { useUser } from "../../context/UserContext";
import { useConfirmDialog } from "../../context/ConfirmDialogContext";
import { initSocket } from "../../services/socket";
import { fetchMessageDetailCached, preloadMessagePage } from "../../utils/messagePreload";
import type { OrderInfo } from "../../types";

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
  order_match_status?: "matched" | "possible" | "unmatched" | "not_order" | "unknown";
  order_info?: OrderInfo;
  default_store_id?: string;
  default_store_shop?: string;
  order_matching_store_ids?: string[];
  order_matching_store_shops?: string[];
  has_attachments?: boolean;
  first_attachment?: MessageAttachment;
}

interface MessageAttachment {
  filename?: string;
  mime_type?: string;
  size?: number;
  gmail_message_id?: string;
  attachment_id?: string;
}

interface Store {
  id: string;
  shop: string;
}

type ViewMode = "inbox" | "archived" | "trashed";
type AssignedFilter = "all" | "assigned" | "unassigned";
type OrderFilter = "all" | "order" | "other" | "needs_review";
type SortBy = "title" | "ticket" | "started_at" | "last_updated";
type SortOrder = "asc" | "desc";
type MessageOptionalColumn = "store" | "order" | "assigned" | "status" | "ticketDate" | "lastUpdated";

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
  "In Progress",
  "Pending",
  "Resolved",
  "Escalated",
  "Awaiting Approval",
  "Canceled",
];

const inboxStatusList = [
  "Open",
  "In Progress",
  "Pending",
  "Escalated",
  "Awaiting Approval",
];

const archivedStatusList = [
  "Resolved",
  "Canceled",
];

const getStatusFilterOptions = (mode: ViewMode) => {
  if (mode === "inbox") return inboxStatusList;
  if (mode === "archived") return archivedStatusList;
  return statusList;
};

const MESSAGE_PREFERENCES_KEY = "attentify.messageListPreferences";
const MESSAGE_LIST_CACHE_TTL_MS = 5 * 60 * 1000;
const MESSAGE_LIST_PATCHES_KEY = "attentify.messageListPatches";
const MESSAGE_LIST_REFRESH_KEY = "attentify.messageListNeedsRefresh";

const defaultMessagePreferences = {
  viewMode: "inbox" as ViewMode,
  currentPage: 1,
  pageSize: 10,
  assignedFilter: "all" as AssignedFilter,
  orderFilter: "all" as OrderFilter,
  storeFilter: "all",
  statusFilter: "all",
  sortBy: "started_at" as SortBy,
  sortOrder: "desc" as SortOrder,
  visibleColumns: {
    store: true,
    order: true,
    assigned: true,
    status: true,
    ticketDate: true,
    lastUpdated: true,
  } as Record<MessageOptionalColumn, boolean>,
};

const messageColumnOptions: { key: MessageOptionalColumn; label: string }[] = [
  { key: "store", label: "Store" },
  { key: "order", label: "Order" },
  { key: "assigned", label: "Assigned" },
  { key: "status", label: "Status" },
  { key: "ticketDate", label: "Ticket Date" },
  { key: "lastUpdated", label: "Last Updated" },
];

type MessageListRequestParams = {
  company_id: string;
  search: string;
  page: number;
  size: number;
  view_mode: ViewMode;
  assigned_filter: AssignedFilter;
  order_filter: OrderFilter;
  store_id: string;
  status_filter: string;
  sort_by: SortBy;
  sort_order: SortOrder;
};

type MessageListCache = {
  params: MessageListRequestParams;
  messages: Message[];
  totalPages: number;
  storedAt: number;
};

let messageListCache: MessageListCache | null = null;

function applyPendingMessageListPatches() {
  try {
    const rawPatches = sessionStorage.getItem(MESSAGE_LIST_PATCHES_KEY);
    if (!rawPatches || !messageListCache) return;
    const patches = JSON.parse(rawPatches);
    if (!Array.isArray(patches) || patches.length === 0) return;
    const patchMap = new Map<string, Partial<Message>>();
    patches.forEach((patch) => {
      if (patch?._id) patchMap.set(patch._id, patch);
    });
    messageListCache = {
      ...messageListCache,
      messages: messageListCache.messages.map((message) => ({
        ...message,
        ...(patchMap.get(message._id) || {}),
      })),
      storedAt: Date.now(),
    };
    sessionStorage.removeItem(MESSAGE_LIST_PATCHES_KEY);
  } catch {
    sessionStorage.removeItem(MESSAGE_LIST_PATCHES_KEY);
  }
}

const ownerRoles = ["company_owner", "store_owner"];
const permanentDeletePermission = "permanent_delete_ticket";

const orderStatusLabel = (status?: string) => {
  switch (status) {
    case "matched":
      return "Order";
    case "possible":
      return "Review";
    case "unmatched":
      return "No match";
    case "not_order":
      return "Other";
    default:
      return "Unreviewed";
  }
};

const orderStatusClass = (status?: string) => {
  switch (status) {
    case "matched":
      return "bg-green-100 text-green-700";
    case "possible":
      return "bg-orange-100 text-orange-700";
    case "unmatched":
    case "not_order":
      return "bg-gray-100 text-gray-600";
    default:
      return "bg-blue-50 text-blue-700";
  }
};

function loadMessagePreferences() {
  try {
    const stored = localStorage.getItem(MESSAGE_PREFERENCES_KEY);
    if (!stored) return defaultMessagePreferences;
    const parsed = JSON.parse(stored);
    const storedColumns = parsed.visibleColumns || {};

    return {
      ...defaultMessagePreferences,
      ...parsed,
      assignedFilter: "all",
      orderFilter: "all",
      storeFilter: "all",
      statusFilter: "all",
      sortBy: parsed.sortBy === "created_at" ? "started_at" : (parsed.sortBy || defaultMessagePreferences.sortBy),
      visibleColumns: {
        ...defaultMessagePreferences.visibleColumns,
        ...storedColumns,
        ticketDate: storedColumns.ticketDate ?? storedColumns.createdAt ?? defaultMessagePreferences.visibleColumns.ticketDate,
        lastUpdated: storedColumns.lastUpdated ?? defaultMessagePreferences.visibleColumns.lastUpdated,
      },
    };
  } catch {
    return defaultMessagePreferences;
  }
}

export default function MessagePage() {
  const savedPreferences = loadMessagePreferences();
  applyPendingMessageListPatches();
  const cachedParams = messageListCache?.params;
  const [selected, setSelected] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>(cachedParams?.view_mode || savedPreferences.viewMode);
  const [messages, setMessages] = useState<Message[]>(() => messageListCache?.messages || []);
  const [, setLoading] = useState<boolean>(false);

  // Track menu state for assign and status per message
  const [assignMenuId, setAssignMenuId] = useState<string | null>(null);
  const [statusMenuId, setStatusMenuId] = useState<string | null>(null);
  const [memberSearch, setMemberSearch] = useState<string>("");
  const [members, setMembers] = useState<Member[]>([]);
  const { currentCompanyId } = useCompany();
  const { notify } = useNotification();
  const { confirm } = useConfirmDialog();
  const { setTitle } = usePageTitle();
  const { user } = useUser();
  const location = useLocation();
  const menuRef = useRef<HTMLDivElement>(null);
  const listScrollRef = useRef<HTMLDivElement>(null);

  const [search, setSearch] = useState<string>(cachedParams?.search || "");
  const [currentPage, setCurrentPage] = useState<number>(cachedParams?.page || savedPreferences.currentPage);
  const [pageSize, setPageSize] = useState(cachedParams?.size || savedPreferences.pageSize);
  const [assignedFilter, setAssignedFilter] = useState<AssignedFilter>(cachedParams?.assigned_filter || savedPreferences.assignedFilter);
  const [orderFilter, setOrderFilter] = useState<OrderFilter>(cachedParams?.order_filter || savedPreferences.orderFilter);
  const [storeFilter, setStoreFilter] = useState<string>(cachedParams?.store_id || savedPreferences.storeFilter);
  const [statusFilter, setStatusFilter] = useState<string>(cachedParams?.status_filter || savedPreferences.statusFilter);
  const [sortBy, setSortBy] = useState<SortBy>(cachedParams?.sort_by || savedPreferences.sortBy);
  const [sortOrder, setSortOrder] = useState<SortOrder>(cachedParams?.sort_order || savedPreferences.sortOrder);
  const [visibleColumns, setVisibleColumns] = useState<Record<MessageOptionalColumn, boolean>>(
    savedPreferences.visibleColumns
  );
  const [stores, setStores] = useState<Store[]>([]);
  const [totalPages, setTotalPages] = useState(messageListCache?.totalPages || 1);
  const [syncingGmail, setSyncingGmail] = useState(false);
  const [customPermissions, setCustomPermissions] = useState<string[]>([]);
  const statusFilterOptions = getStatusFilterOptions(viewMode);
  const userRole = user?.role || "agent";
  const canMoveMessages = ownerRoles.includes(userRole);
  const canUpdateStatus = userRole !== "readonly";
  const canPermanentlyDeleteMessages = customPermissions.includes(permanentDeletePermission);
  const canTrashMessages = canMoveMessages || canPermanentlyDeleteMessages;
  const effectiveStatusFilter =
    statusFilter === "all" || statusFilterOptions.includes(statusFilter)
      ? statusFilter
      : "all";

  useEffect(() => {
    const socket = initSocket();

    const handleConnect = () => {
      console.log("Socket connected:", socket.id);
    };

    const handleGmailUpdate = (data: { company_id?: string }) => {
      console.log("Gmail update:", data);
      if (currentCompanyId && data.company_id && data.company_id !== currentCompanyId) return;
      setSortBy("last_updated");
      setSortOrder("desc");
      setCurrentPage(1);
      fetchMessages({ force: true, sortBy: "last_updated", sortOrder: "desc", page: 1 });
    };

    socket.on("connect", handleConnect);
    socket.on("gmail_update", handleGmailUpdate);

    return () => {
      socket.off("connect", handleConnect);
      socket.off("gmail_update", handleGmailUpdate);
    };
  }, [currentCompanyId]);
  
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
    if (!currentCompanyId) return;

    const fetchCompanySettings = async () => {
      try {
        const response = await axios.get(
          `${import.meta.env.VITE_API_URL || ""}/company/${currentCompanyId}`,
          {
            headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
          }
        );
        setCustomPermissions(response.data?.current_user_custom_permissions || []);
      } catch (error) {
        console.error("Failed to load company delete policy:", error);
        setCustomPermissions([]);
      }
    };

    fetchCompanySettings();
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
        orderFilter,
        storeFilter,
        statusFilter,
        sortBy,
        sortOrder,
        visibleColumns,
      })
    );
  }, [viewMode, currentPage, pageSize, assignedFilter, orderFilter, storeFilter, statusFilter, sortBy, sortOrder, visibleColumns]);

  const toggleVisibleColumn = (column: MessageOptionalColumn) => {
    setVisibleColumns((current) => ({
      ...current,
      [column]: !current[column],
    }));
  };

  const handleSortHeaderClick = (field: SortBy) => {
    if (sortBy === field) {
      setSortOrder((current) => (current === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(field);
      setSortOrder(field === "title" || field === "ticket" ? "asc" : "desc");
    }
    setCurrentPage(1);
  };

  const sortIndicator = (field: SortBy) => {
    if (sortBy !== field) return "";
    return sortOrder === "asc" ? " ^" : " v";
  };

  const hasRestoredRef = useRef(false);
  const forceRefreshRef = useRef(false);

  const fetchMessages = async (
    options: { force?: boolean; sortBy?: SortBy; sortOrder?: SortOrder; page?: number } = {}
  ) => {
    if (!currentCompanyId) return;

    const requestParams: MessageListRequestParams = {
      company_id: currentCompanyId,
      search,
      page: options.page ?? currentPage,
      size: pageSize,
      view_mode: viewMode,
      assigned_filter: assignedFilter,
      order_filter: orderFilter,
      store_id: storeFilter === "all" ? "" : storeFilter,
      status_filter: effectiveStatusFilter,
      sort_by: options.sortBy ?? sortBy,
      sort_order: options.sortOrder ?? sortOrder,
    };

    const needsRefresh = sessionStorage.getItem(MESSAGE_LIST_REFRESH_KEY) === "1";
    if (needsRefresh) {
      sessionStorage.removeItem(MESSAGE_LIST_REFRESH_KEY);
    }
    const forceRefresh = options.force || forceRefreshRef.current || needsRefresh;
    forceRefreshRef.current = false;

    const cachedList = messageListCache;
    const cacheMatches =
      !forceRefresh &&
      cachedList &&
      Date.now() - cachedList.storedAt < MESSAGE_LIST_CACHE_TTL_MS &&
      JSON.stringify(cachedList.params) === JSON.stringify(requestParams);

    if (!options.force && cacheMatches && cachedList) {
      setMessages(cachedList.messages);
      setTotalPages(cachedList.totalPages);
      return;
    }

    setLoading(true);
    try {
      const response = await axios.get(
        `${import.meta.env.VITE_API_URL || ""}/message/company_messages`,
        {
          params: requestParams,
          headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
        }
      );

      const nextMessages = response.data?.messages || [];
      const nextTotalPages = response.data?.totalPages || 1;

      setMessages(nextMessages);
      setTotalPages(nextTotalPages);
      preloadMessagePage(nextMessages);
      messageListCache = {
        params: requestParams,
        messages: nextMessages,
        totalPages: nextTotalPages,
        storedAt: Date.now(),
      };
    } catch (error) {
      console.error("Failed to load messages:", error);
      notify("error", "Failed to load messages");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMessages();
  }, [currentCompanyId, currentPage, pageSize, search, viewMode, assignedFilter, orderFilter, storeFilter, effectiveStatusFilter, sortBy, sortOrder]);

  useEffect(() => {
    if (!currentCompanyId) return;

    const fetchStores = async () => {
      try {
        const response = await axios.get(
          `${import.meta.env.VITE_API_URL || ""}/gmail/company_accounts/${currentCompanyId}`,
          {
            headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
          }
        );
        setStores(response.data?.stores || []);
      } catch (error) {
        console.error("Failed to load message store filters:", error);
        setStores([]);
      }
    };

    fetchStores();
  }, [currentCompanyId]);

  // Reset restore flag on mount, restore scroll before paint
  useLayoutEffect(() => {
    hasRestoredRef.current = false;
    const y = (location.state as any)?.scrollY || Number(sessionStorage.getItem("messageListScrollY"));
    if (y) {
      hasRestoredRef.current = true;
      forceRefreshRef.current = true;
      requestAnimationFrame(() => {
        if (listScrollRef.current) {
          listScrollRef.current.scrollTop = y;
        }
      });
    }
  }, []);

  useEffect(() => {
    setSelected([]);
  }, [viewMode, search, assignedFilter, orderFilter, storeFilter, statusFilter, sortBy, sortOrder]);

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
        return (msg.archived || archivedStatusList.includes(msg.status)) && !msg.trashed;
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

  const handleAttachmentDownload = async (
    event: React.MouseEvent<HTMLButtonElement>,
    msg: Message
  ) => {
    event.preventDefault();
    event.stopPropagation();

    const attachment = msg.first_attachment;
    if (!attachment?.gmail_message_id || !attachment?.attachment_id) return;

    try {
      const response = await axios.get(
        `${import.meta.env.VITE_API_URL || ""}/message/${msg._id}/attachments/${attachment.gmail_message_id}/${attachment.attachment_id}`,
        {
          headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
          responseType: "blob",
        }
      );
      const url = window.URL.createObjectURL(response.data);
      const link = document.createElement("a");
      link.href = url;
      link.download = attachment.filename || "attachment";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      notify("error", "Failed to download attachment.");
    }
  };

  const handleSyncGmail = async () => {
    if (!currentCompanyId) return;

    setSyncingGmail(true);
    try {
      const response = await axios.post(
        `${import.meta.env.VITE_API_URL || ""}/message/fetch-all`,
        { company_id: currentCompanyId },
        {
          headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
        }
      );
      const syncedCount = response.data?.result?.reduce(
        (total: number, item: { stored_count?: number }) => total + (item.stored_count || 0),
        0
      );
      notify("success", syncedCount ? `Gmail synced. ${syncedCount} new messages added.` : "Gmail synced. No new messages found.");
      fetchMessages({ force: true });
    } catch (error: any) {
      console.error("Failed to sync Gmail:", error);
      const detail = error?.response?.data?.detail;
      const message = Array.isArray(detail)
        ? detail.map((item) => item.message || item.reason).filter(Boolean).join(" ")
        : "Failed to sync Gmail.";
      notify("error", message || "Failed to sync Gmail.");
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
      fetchMessages({ force: true });
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
      fetchMessages({ force: true });
    } catch (error) {
      notify("error", "Failed to update status. Please try again.");
    }
  };

  const handleMessageStoreSelect = async (storeId: string, msg: Message) => {
    try {
      await axios.patch(
        `${import.meta.env.VITE_API_URL}/message/${msg._id}`,
        {
          field: "default_store_id",
          value: storeId,
        },
        {
          headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
        }
      );
      notify("success", "Message store updated.");
      fetchMessages({ force: true });
    } catch (error) {
      notify("error", "Failed to update message store.");
    }
  };

  const handleDelete = async (id: string) => {
    if (viewMode === "trashed" && !canPermanentlyDeleteMessages) {
      notify("error", "Permanent delete is not enabled for your account.");
      return;
    }
    if (viewMode !== "trashed" && !canTrashMessages) {
      notify("error", "Delete is not enabled for your account.");
      return;
    }

    const confirmed = await confirm({
      title: viewMode === "trashed" ? "Permanently Delete Message" : "Move Message to Trash",
      message:
        viewMode === "trashed"
          ? "Are you sure you want to permanently delete this message? This action cannot be undone."
          : "Are you sure you want to move this message to trash?",
      confirmText: viewMode === "trashed" ? "Delete Permanently" : "Move to Trash",
      cancelText: "Cancel",
    });
    if (!confirmed) return;

    try {
      if (viewMode === "trashed") {
        await axios.delete(
          `${import.meta.env.VITE_API_URL}/message/${id}`,
          {
            headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
          }
        );
        notify("success", "Message permanently deleted.");
      } else {
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
      }
      fetchMessages({ force: true });
    } catch (error) {
      notify("error", "Failed to delete message. Please try again.");
    }
  };

  const patchMessageField = async (id: string, field: string, value: unknown) => {
    await axios.patch(
      `${import.meta.env.VITE_API_URL}/message/${id}`,
      { field, value },
      {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      }
    );
  };

  const handleRestoreFromTrash = async (id: string) => {
    if (!canTrashMessages) {
      notify("error", "Restore is not enabled for your account.");
      return;
    }

    try {
      await patchMessageField(id, "trashed", false);
      notify("success", "Message restored to inbox.");
      fetchMessages({ force: true });
    } catch (error) {
      notify("error", "Failed to restore message. Please try again.");
    }
  };

  const handleBulkAction = async (
    action: "archive" | "unarchive" | "trash" | "restore" | "delete"
  ) => {
    if (selected.length === 0) return;

    if ((action === "archive" || action === "unarchive") && !canMoveMessages) {
      notify("error", "Archive is not enabled for your account.");
      return;
    }
    if ((action === "trash" || action === "restore") && !canTrashMessages) {
      notify("error", "This action is not enabled for your account.");
      return;
    }
    if (action === "delete" && !canPermanentlyDeleteMessages) {
      notify("error", "Permanent delete is not enabled for your account.");
      return;
    }

    const labelByAction = {
      archive: "archive",
      unarchive: "restore to inbox",
      trash: "move to trash",
      restore: "restore from trash",
      delete: "permanently delete",
    };
    const confirmed = await confirm({
      title: "Apply Bulk Action",
      message: `Are you sure you want to ${labelByAction[action]} ${selected.length} selected message${selected.length === 1 ? "" : "s"}?`,
      confirmText: action === "delete" ? "Delete Permanently" : "Apply",
      cancelText: "Cancel",
    });
    if (!confirmed) return;

    try {
      if (action === "delete") {
        await Promise.all(
          selected.map((id) =>
            axios.delete(`${import.meta.env.VITE_API_URL}/message/${id}`, {
              headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
            })
          )
        );
      } else {
        const payloadByAction = {
          archive: { field: "archived", value: true },
          unarchive: { field: "archived", value: false },
          trash: { field: "trashed", value: true },
          restore: { field: "trashed", value: false },
        }[action];

        await Promise.all(
          selected.map((id) =>
            patchMessageField(id, payloadByAction.field, payloadByAction.value)
          )
        );
      }

      notify("success", `Updated ${selected.length} message${selected.length === 1 ? "" : "s"}.`);
      setSelected([]);
      fetchMessages({ force: true });
    } catch (error) {
      notify("error", "Bulk action failed. Please try again.");
    }
  };

  const handleArchive = async (id: string, archived: boolean) => {
    try {
      await axios.patch(
        `${import.meta.env.VITE_API_URL}/message/${id}`,
        {
          field: "archived",
          value: archived,
        },
        {
          headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
        }
      );
      notify("success", archived ? "Message archived." : "Message restored to inbox.");
      fetchMessages({ force: true });
    } catch (error) {
      notify("error", "Failed to update archive status. Please try again.");
    }
  };

  const prefetchMessage = (id: string) => {
    fetchMessageDetailCached(id).catch(() => {
      // Best-effort preload; the detail page handles any real error.
    });
  };

  const filteredMembers = members.filter(
    (member) =>
      member.name.toLowerCase().includes(memberSearch.toLowerCase()) ||
      member.email.toLowerCase().includes(memberSearch.toLowerCase())
  );
  const visibleOptionalColumnCount = Object.values(visibleColumns).filter(Boolean).length;
  const messageEmptyColSpan = 5 + visibleOptionalColumnCount;

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
      <div className="flex h-[calc(100vh-4rem)] flex-col overflow-hidden p-3">
        <div className="mb-2 flex shrink-0 flex-wrap items-center justify-between gap-3">
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
          <div className="flex flex-wrap items-center gap-3 text-sm text-gray-700">
            {messageColumnOptions.map((column) => (
              <label key={column.key} className="inline-flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={visibleColumns[column.key]}
                  onChange={() => toggleVisibleColumn(column.key)}
                  className="h-4 w-4 border-gray-300 text-blue-600"
                />
                {column.label}
              </label>
            ))}
          </div>
        </div>

        <div className="mb-3 flex shrink-0 flex-wrap items-center gap-2">
          <label className="flex min-w-[260px] flex-col gap-1 text-xs font-medium text-gray-600">
            Search
            <div className="relative">
              <input
                type="text"
                placeholder="Search messages"
                value={search}
                onChange={onSearchChange}
                className="w-full border border-gray-300 px-3 py-1.5 pl-9 text-sm font-normal text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <MagnifyingGlassIcon className="absolute left-3 top-2 h-4 w-4 text-gray-500" />
            </div>
          </label>

          <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
            Assignment
            <select
              value={assignedFilter}
              onChange={(e) => {
                setAssignedFilter(e.target.value as AssignedFilter);
                setCurrentPage(1);
              }}
              className="border border-gray-300 px-3 py-1.5 text-sm font-normal text-gray-700"
            >
              <option value="all">All tickets</option>
              <option value="assigned">Assigned</option>
              <option value="unassigned">Unassigned</option>
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
            Order match
            <select
              value={orderFilter}
              onChange={(e) => {
                setOrderFilter(e.target.value as OrderFilter);
                setCurrentPage(1);
              }}
              className="border border-gray-300 px-3 py-1.5 text-sm font-normal text-gray-700"
            >
              <option value="all">Any order status</option>
              <option value="order">Order-related</option>
              <option value="other">Other</option>
              <option value="needs_review">Needs review</option>
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
            Store
            <select
              value={storeFilter}
              onChange={(e) => {
                setStoreFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="border border-gray-300 px-3 py-1.5 text-sm font-normal text-gray-700"
            >
              <option value="all">Any store</option>
              <option value="unassigned">No store set</option>
              {stores.map((store) => (
                <option key={store.id} value={store.id}>
                  {store.shop}
                </option>
              ))}
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
              className="border border-gray-300 px-3 py-1.5 text-sm font-normal text-gray-700"
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

        <div className="mb-3 flex min-h-[42px] shrink-0 flex-wrap items-center justify-between gap-2 border border-gray-200 bg-gray-50 px-3 py-2 text-sm">
          <span className="font-medium text-gray-700">
            {selected.length > 0
              ? `${selected.length} selected`
              : "No messages selected"}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            {viewMode === "inbox" && canMoveMessages && (
              <button
                type="button"
                onClick={() => handleBulkAction("archive")}
                disabled={selected.length === 0}
                className="border border-blue-300 bg-white px-3 py-1 text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:border-gray-200 disabled:text-gray-400 disabled:hover:bg-white"
              >
                Archive
              </button>
            )}
            {viewMode === "archived" && canMoveMessages && (
              <button
                type="button"
                onClick={() => handleBulkAction("unarchive")}
                disabled={selected.length === 0}
                className="border border-blue-300 bg-white px-3 py-1 text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:border-gray-200 disabled:text-gray-400 disabled:hover:bg-white"
              >
                Restore to Inbox
              </button>
            )}
            {viewMode === "trashed" && canTrashMessages && (
              <button
                type="button"
                onClick={() => handleBulkAction("restore")}
                disabled={selected.length === 0}
                className="border border-blue-300 bg-white px-3 py-1 text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:border-gray-200 disabled:text-gray-400 disabled:hover:bg-white"
              >
                Restore
              </button>
            )}
            {viewMode !== "trashed" && canTrashMessages && (
              <button
                type="button"
                onClick={() => handleBulkAction("trash")}
                disabled={selected.length === 0}
                className="border border-red-200 bg-white px-3 py-1 text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:border-gray-200 disabled:text-gray-400 disabled:hover:bg-white"
              >
                Move to Trash
              </button>
            )}
            {viewMode === "trashed" && canPermanentlyDeleteMessages && (
              <button
                type="button"
                onClick={() => handleBulkAction("delete")}
                disabled={selected.length === 0}
                className="border border-red-300 bg-white px-3 py-1 text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:border-gray-200 disabled:text-gray-400 disabled:hover:bg-white"
              >
                Delete Permanently
              </button>
            )}
            <button
              type="button"
              onClick={() => setSelected([])}
              disabled={selected.length === 0}
              className="px-3 py-1.5 text-gray-600 hover:text-gray-900 disabled:cursor-not-allowed disabled:text-gray-400"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={handleSyncGmail}
              disabled={syncingGmail || !currentCompanyId}
              className="inline-flex items-center gap-2 bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:bg-blue-300"
            >
              <ArrowPathIcon className={`h-4 w-4 ${syncingGmail ? "animate-spin" : ""}`} />
              {syncingGmail ? "Syncing" : "Sync Gmail"}
            </button>
          </div>
        </div>

        <div
          ref={listScrollRef}
          className="min-h-0 flex-1 overflow-auto border border-gray-300 bg-white"
        >
          <table className="min-w-full divide-y divide-gray-200 text-md">
            <thead className="sticky top-0 z-20 bg-gray-50 shadow-sm">
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
                <th className="w-16 px-3 py-3 text-right text-gray-500">#</th>
                <th className="px-4 py-3 min-w-[150px] text-left">Client</th>
                {visibleColumns.store && <th className="px-4 py-3 min-w-[170px] text-left">Store</th>}
                <th className="px-4 py-3 min-w-[240px] text-left">
                  <button
                    type="button"
                    onClick={() => handleSortHeaderClick("title")}
                    className="font-semibold text-gray-700 hover:text-blue-700"
                  >
                    Title{sortIndicator("title")}
                  </button>
                </th>
                <th className="px-4 py-3 min-w-[120px] text-left">
                  <button
                    type="button"
                    onClick={() => handleSortHeaderClick("ticket")}
                    className="font-semibold text-gray-700 hover:text-blue-700"
                  >
                    Ticket{sortIndicator("ticket")}
                  </button>
                </th>
                {visibleColumns.order && <th className="px-4 py-3 min-w-[110px] text-left">Order</th>}
                {visibleColumns.assigned && <th className="px-4 py-3 min-w-[130px] text-left">Assigned</th>}
                {visibleColumns.status && <th className="px-4 py-3 min-w-[130px] text-left">Status</th>}
                {visibleColumns.ticketDate && (
                  <th className="px-4 py-3 min-w-[170px] text-center">
                    <button
                      type="button"
                      onClick={() => handleSortHeaderClick("started_at")}
                      className="font-semibold text-gray-700 hover:text-blue-700"
                    >
                      Ticket Date{sortIndicator("started_at")}
                    </button>
                  </th>
                )}
                {visibleColumns.lastUpdated && (
                  <th className="px-4 py-3 min-w-[170px] text-center">
                    <button
                      type="button"
                      onClick={() => handleSortHeaderClick("last_updated")}
                      className="font-semibold text-gray-700 hover:text-blue-700"
                    >
                      Last Updated{sortIndicator("last_updated")}
                    </button>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {filteredMessages.length === 0 ? (
                <tr>
                  <td className="p-8 text-gray-400 text-center" colSpan={messageEmptyColSpan}>
                    No {viewLabel.toLowerCase()} emails found.
                  </td>
                </tr>
              ) : (
                filteredMessages.map((msg, index) => (
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
                        aria-label={`Select message ${msg.title || msg._id}`}
                      />
                    </td>
                    <td className="px-3 py-4 text-sm font-medium text-gray-400">
                      <div className="flex items-center justify-end gap-1.5">
                        {msg.has_attachments && msg.first_attachment ? (
                          <button
                            type="button"
                            onClick={(event) => handleAttachmentDownload(event, msg)}
                            className="text-gray-500 hover:text-blue-700"
                            title={`Download ${msg.first_attachment.filename || "attachment"}`}
                            aria-label={`Download attachment for ${msg.title || msg.ticket || "message"}`}
                          >
                            <PaperClipIcon className="h-4 w-4" />
                          </button>
                        ) : (
                          <span className="h-4 w-4" aria-hidden="true" />
                        )}
                        <span>{(currentPage - 1) * pageSize + index + 1}</span>
                      </div>
                    </td>
                    <td className="px-4 py-4 font-medium text-gray-700">
                      {msg.client}
                    </td>
                    {visibleColumns.store && <td className="px-4 py-4 text-sm text-gray-600">
                      {(msg.order_matching_store_ids?.length || 0) > 1 ? (
                        <select
                          value={msg.default_store_id || ""}
                          onChange={(event) => handleMessageStoreSelect(event.target.value, msg)}
                          className="border border-gray-300 bg-white px-2 py-1 text-sm text-gray-700"
                        >
                          <option value="">Auto / Review</option>
                          {(msg.order_matching_store_ids || []).map((storeId, index) => (
                            <option key={storeId} value={storeId}>
                              {msg.order_matching_store_shops?.[index] || storeId}
                            </option>
                          ))}
                        </select>
                      ) : (
                        msg.default_store_shop || msg.order_matching_store_shops?.[0] || "No store set"
                      )}
                    </td>}
                    <td className="px-4 py-4 text-blue-700 hover:underline">
                      <Link
                        to={`/message/${msg._id}`}
                        state={{ scrollY: listScrollRef.current?.scrollTop || 0 }}
                        onMouseEnter={() => prefetchMessage(msg._id)}
                        onFocus={() => prefetchMessage(msg._id)}
                        onMouseDown={() => sessionStorage.setItem("messageListScrollY", String(listScrollRef.current?.scrollTop || 0))}
                        onClick={() => sessionStorage.setItem("messageListScrollY", String(listScrollRef.current?.scrollTop || 0))}
                      >
                        {msg.title || "(no subject)"}
                      </Link>
                    </td>
                    <td className="px-4 py-4 text-blue-700 hover:underline">
                      {msg.ticket?? ""}
                    </td>
                    {visibleColumns.order && <td className="px-4 py-4">
                      <span className={`inline-block px-2 py-1 text-xs font-semibold rounded ${orderStatusClass(msg.order_match_status)}`}>
                        {orderStatusLabel(msg.order_match_status)}
                      </span>
                    </td>}
                    {/* Assigned */}
                    {visibleColumns.assigned && <td className="px-4 py-4">
                      {ownerRoles.includes(userRole) ? (
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
                    </td>}
                    {/* Status */}
                    {visibleColumns.status && <td className="px-4 py-4">
                      {canUpdateStatus ? (
                        // Clickable status button for allowed roles
                        <button
                          className={`inline-flex w-[146px] items-center justify-between gap-2 border px-3 py-2 text-xs font-semibold shadow-sm transition hover:-translate-y-px hover:shadow focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 ${
                            msg.status === "Resolved"
                              ? "border-green-300 bg-green-50 text-green-700 hover:bg-green-100"
                              : "border-yellow-300 bg-yellow-50 text-yellow-800 hover:bg-yellow-100"
                          }`}
                          onClick={() => handleStatusMenuOpen(msg._id)}
                          type="button"
                          title="Change status"
                          aria-haspopup="menu"
                          aria-expanded={statusMenuId === msg._id}
                        >
                          <span className="truncate">{msg.status}</span>
                          <span className="inline-flex shrink-0 items-center border-l border-current/20 pl-2 opacity-80">
                            <ChevronDownIcon className="h-3.5 w-3.5" />
                          </span>
                        </button>
                      ) : (
                        // Read-only status display for other roles
                        <span
                          className={`inline-block w-[146px] px-3 py-1 text-xs font-semibold rounded ${
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
                            <span className="text-sm font-semibold text-gray-700">Status</span>
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
                                className={`block w-full px-4 py-2 text-left text-sm hover:bg-blue-50 ${
                                  status === msg.status ? "bg-blue-50 font-semibold text-blue-700" : "text-gray-700"
                                }`}
                                onClick={() => handleStatusSelect(status, msg)}
                              >
                                {status}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </td>}
                    {visibleColumns.ticketDate && (
                      <td className="px-4 py-4 text-sm text-gray-500 text-center">
                        {msg.started_at ? new Date(msg.started_at).toLocaleString() : "-"}
                      </td>
                    )}
                    {visibleColumns.lastUpdated && (
                      <td className="px-4 py-4 text-sm text-gray-500 text-center">
                        {msg.last_updated ? new Date(msg.last_updated).toLocaleString() : "-"}

                        <div className="hidden group-hover:flex absolute right-3 top-1/2 -translate-y-1/2 items-center gap-1">
                          {viewMode === "trashed" && canTrashMessages && (
                            <button
                              onClick={() => handleRestoreFromTrash(msg._id)}
                              className="flex items-center justify-center p-2 rounded-full text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition"
                              aria-label="Restore message"
                            >
                              <ArrowUturnLeftIcon className="w-6 h-6" />
                            </button>
                          )}
                          {viewMode !== "trashed" && canMoveMessages && (
                            <button
                              onClick={() => handleArchive(msg._id, viewMode !== "archived")}
                              className="flex items-center justify-center p-2 rounded-full text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition"
                              aria-label={viewMode === "archived" ? "Unarchive message" : "Archive message"}
                            >
                              <ArchiveBoxArrowDownIcon className="w-6 h-6" />
                            </button>
                          )}
                          {(viewMode !== "trashed" ? canTrashMessages : canPermanentlyDeleteMessages) && (
                            <button
                              onClick={() => handleDelete(msg._id)}
                              className="flex items-center justify-center p-2 rounded-full text-gray-400 hover:text-red-600 hover:bg-red-50 transition"
                              aria-label={viewMode === "trashed" ? "Permanently delete message" : "Delete message"}
                            >
                              <TrashIcon className="w-6 h-6" />
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
            <div className="mt-4 flex shrink-0 items-center justify-between">
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
