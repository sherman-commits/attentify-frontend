import { useEffect, useState, useRef } from "react";
import { Link, useParams } from "react-router-dom";
import axios from "axios";
import { ArrowLeftIcon } from "@heroicons/react/24/outline";
import type { Message } from "../../types";
import Layout from "../../layouts/Layout";
import EmailViewer from "../../components/EmailViewer";
import SMSViewer from "../../components/SMSViewer";
import OrderInfoCard from "../../components/OrderInfoCard";
import type { OrderInfo } from "../../types";
import EmailReplySection from "../../components/EmailReplySection";
import SMSReplySection from "../../components/SMSReplySection";
import { usePageTitle } from "../../context/PageTitleContext";
import { useNotification } from "../../context/NotificationContext";
import Comments from "../../components/Comments";
import { useCompany } from "../../context/CompanyContext";
import { initSocket } from "../../services/socket";
import {
  fetchMessageDetailCached,
  fetchOrderInfoCached,
  clearCachedOrderInfo,
  getCachedMessageDetail,
  getCachedOrderInfo,
  queueMessageListPatch,
  setCachedMessageDetail,
  setCachedOrderInfo,
} from "../../utils/messagePreload";

const ticketStatusList = [
  "Open",
  "In Progress",
  "Pending",
  "Escalated",
  "Awaiting Approval",
  "Resolved",
  "Canceled",
];

const buildOrderOptions = (orders: any[], mentionedOrderName?: string) => {
  const normalizedMentioned = mentionedOrderName?.trim();
  const mentionedOrders: any[] = [];
  const otherOrders: any[] = [];

  orders.forEach((item) => {
    const option = {
      value: item.name,
      label: item.name,
    };

    if (normalizedMentioned && item.name === normalizedMentioned) {
      mentionedOrders.push(option);
    } else {
      otherOrders.push(option);
    }
  });

  if (!normalizedMentioned) {
    return otherOrders;
  }

  return [
    ...(mentionedOrders.length
      ? [{ label: "Mentioned in message", options: mentionedOrders }]
      : []),
    ...(otherOrders.length
      ? [{ label: "Other orders from this customer", options: otherOrders }]
      : []),
  ];
};

const hasSavedOrderResult = (order?: OrderInfo | null) =>
  Boolean(order?.no_orders || (order?.confirmed && order?.shopify_order));

const MessageDetailPage = () => {
  const { threadId } = useParams<{ threadId: string }>();
  const cachedMessage = getCachedMessageDetail(threadId);
  const cachedOrderInfo = getCachedOrderInfo(threadId);
  const initialOrderInfo = hasSavedOrderResult(cachedOrderInfo) ? cachedOrderInfo : null;
  const [message, setMessage] = useState<Message | null>(cachedMessage);
  const [loading, setLoading] = useState(!cachedMessage);
  const [reply, setReply] = useState("");

  const [orderInfo, setOrderInfo] = useState<OrderInfo | null>(initialOrderInfo);
  const [loadingOrder, setLoadingOrder] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [orderOptions, setOrderOptions] = useState<any>([]);
  const [mentionedOrderName, setMentionedOrderName] = useState<string>("");
  const [updatingStatus, setUpdatingStatus] = useState(false);

  const hasFetchedMessage = useRef(false);
  const hasFetchedOrder = useRef(false);
  const { setTitle } = usePageTitle();
  const { currentCompanyId } = useCompany();

  const { notify } = useNotification();

  useEffect(() => {
    setTitle("Message Detail");
  }, [setTitle]);

  const reloadMessage = async () => {
    if (!threadId) return;
    try {
      const nextMessage = await fetchMessageDetailCached(threadId, { force: true });
      hasFetchedOrder.current = false;
      setMessage(nextMessage);
    } catch (error) {
      console.error("Error refreshing message:", error);
    }
  };

  // Fetch message thread
  useEffect(() => {
    hasFetchedMessage.current = false;
    hasFetchedOrder.current = false;
    const nextCachedMessage = getCachedMessageDetail(threadId);
    const nextRawOrderInfo = getCachedOrderInfo(threadId) || nextCachedMessage?.order_info || null;
    const nextCachedOrderInfo = hasSavedOrderResult(nextRawOrderInfo) ? nextRawOrderInfo : null;
    setLoading(!nextCachedMessage);
    setMessage(nextCachedMessage);
    setOrderInfo(nextCachedOrderInfo);
    setLoadingOrder(false);
    setMentionedOrderName("");

    const fetchMessage = async () => {
      if (hasFetchedMessage.current) return;
      hasFetchedMessage.current = true;
      try {
        if (!threadId) return;
        const nextMessage = await fetchMessageDetailCached(threadId);
        setMessage(nextMessage);
        if (nextMessage.order_info) {
          setOrderInfo(nextMessage.order_info);
          setLoadingOrder(false);
        }

      } catch (error) {
        console.error("Error fetching message:", error);
      } finally {
        setLoading(false);
      }
    };

    if (threadId) {
      fetchMessage();
    }
  }, [threadId]);

  useEffect(() => {
    if (!currentCompanyId || !threadId) return;
    const socket = initSocket();
    const handleGmailUpdate = (data: { company_id?: string }) => {
      if (data.company_id && data.company_id !== currentCompanyId) return;
      reloadMessage();
    };

    socket.on("gmail_update", handleGmailUpdate);
    return () => {
      socket.off("gmail_update", handleGmailUpdate);
    };
  }, [currentCompanyId, threadId]);

  // Analyze email to get order info
  useEffect(() => {
    const fetchOrderInfo = async () => {
      if (!message || !message.messages?.length) {
        console.log("[OrderInfo] Skip: no message content for", message?._id);
        return null;
      }
      if (hasSavedOrderResult(message.order_info)) {
        const savedOrderInfo = message.order_info || null;
        setOrderInfo(savedOrderInfo);
        setLoadingOrder(false);
        if (savedOrderInfo?.order_id) {
          setMentionedOrderName(savedOrderInfo.order_id);
        }
        if (savedOrderInfo?.msg === 'Email not matched') {
          setReply("Please send inquiry via email from the order.");
        } else {
          setReply(savedOrderInfo?.msg || "");
        }
        if (savedOrderInfo?.confirmed && savedOrderInfo?.shopify_order) {
          fetchOrderInfoCached(message._id, { force: true })
            .then((freshOrderInfo) => {
              setOrderInfo(freshOrderInfo);
              setCachedOrderInfo(message._id, freshOrderInfo);
              if (freshOrderInfo?.msg === "Email not matched") {
                setReply("Please send inquiry via email from the order.");
              } else {
                setReply(freshOrderInfo?.msg || "");
              }
            })
            .catch((err) => {
              console.error("Failed to refresh confirmed order info", err);
            });
        }
        return savedOrderInfo;
      }
      if (hasFetchedOrder.current) return;
      hasFetchedOrder.current = true;
      console.log("[OrderInfo] Analyzing:", message._id);

      try {
        setError(null);
        const precheck = await axios.get(
          `${import.meta.env.VITE_API_URL || ""}/message/${message._id}/order-precheck`,
          {
            headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
          }
        );
        if (precheck.data?.no_orders) {
          const noOrdersInfo = precheck.data.order_info as OrderInfo;
          setOrderInfo(noOrdersInfo);
          setCachedOrderInfo(message._id, noOrdersInfo);
          setReply(noOrdersInfo?.msg || "");
          return noOrdersInfo;
        }
        setLoadingOrder(true);
        const nextOrderInfo = await fetchOrderInfoCached(message._id);
        console.log("[OrderInfo] Result:", message._id, nextOrderInfo?.order_id || "(no order_id)");
        setOrderInfo(nextOrderInfo);
        if (nextOrderInfo?.order_id) {
          setMentionedOrderName(nextOrderInfo.order_id);
        }
        if (nextOrderInfo?.msg === 'Email not matched') {
          setReply("Please send inquiry via email from the order.");
        } else {
          setReply(nextOrderInfo?.msg || "");
        }
        return nextOrderInfo;
      } catch (err: any) {
        setError(err.message || "Failed to fetch order info");
        setOrderInfo(null);
        return null;
      } finally {
        setLoadingOrder(false);
      }
    };

    const fetchOrderOptions = async (mentionedOrderName?: string) => {
      const matches = message?.client?.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g);
      const email = matches?.[0];

      if (!email || !currentCompanyId) {
        setOrderOptions([]);
        return;
      }
      if (message?.order_info?.no_orders) {
        setOrderOptions([]);
        return;
      }

      try {
        const res = await axios.get(`${import.meta.env.VITE_API_URL || ""}/shopify/orders`, {
          params: {
            search: "",
            page: 1,
            size: 50,
            shop: message?.default_store_shop || "",
            company_id: currentCompanyId,
            email,
          },
          headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
        });
        setOrderOptions(buildOrderOptions(res.data.orders, mentionedOrderName));
      } catch (err) {
        console.error("Failed to fetch orders", err);
        notify("error", "Failed to fetch orders");
      }
    };

    if (message) {
      (async () => {
        const analyzedOrder = await fetchOrderInfo();
        const mentionedName = analyzedOrder?.order_id || message.order_info?.order_id || "";
        setMentionedOrderName(mentionedName);
        if (!analyzedOrder?.no_orders) {
          await fetchOrderOptions(mentionedName);
        }
      })();
    }
  }, [message, currentCompanyId]);

  const reloadOrderInfo = async () => {
    if (!message?._id) return;

    try {
      setLoadingOrder(true);
      const response = await axios.post(
        (import.meta.env.VITE_API_URL || "") + "/message/analyze",
        { message_id: message._id },
        {
          headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
        }
      );
      setOrderInfo(response.data);
      setCachedOrderInfo(message._id, response.data);
    } catch (err) {
      console.error("Failed to refresh order info", err);
      notify("error", "Failed to refresh order info");
    } finally {
      setLoadingOrder(false);
    }
  };

  const updateTicketStatus = async (status: string) => {
    if (!message?._id || status === message.status) return;

    try {
      setUpdatingStatus(true);
      const response = await axios.patch(
        `${import.meta.env.VITE_API_URL || ""}/message/${message._id}`,
        {
          field: "status",
          value: status,
        },
        {
          headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
        }
      );
      const nextStatus = response.data?.value || status;
      const nextMessage = { ...message, status: nextStatus };
      setMessage(nextMessage);
      setCachedMessageDetail(nextMessage);
      queueMessageListPatch({
        _id: message._id,
        status: nextStatus,
        last_updated: new Date().toISOString(),
      });
      notify("success", "Ticket status updated");
    } catch (err) {
      console.error("Failed to update ticket status", err);
      notify("error", "Failed to update ticket status");
    } finally {
      setUpdatingStatus(false);
    }
  };

  const updateMessageStore = async (storeId: string) => {
    if (!message?._id || storeId === (message.default_store_id || "")) return;

    try {
      const response = await axios.patch(
        `${import.meta.env.VITE_API_URL || ""}/message/${message._id}`,
        {
          field: "default_store_id",
          value: storeId,
        },
        {
          headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
        }
      );
      const selectedIndex = message.order_matching_store_ids?.indexOf(storeId) ?? -1;
      const nextMessage = {
        ...message,
        default_store_id: response.data?.value || storeId,
        default_store_shop: selectedIndex >= 0 ? message.order_matching_store_shops?.[selectedIndex] : "",
        order_info: undefined,
      };
      setMessage(nextMessage);
      setOrderInfo(null);
      setCachedMessageDetail(nextMessage);
      queueMessageListPatch({
        _id: message._id,
        default_store_id: nextMessage.default_store_id,
        default_store_shop: nextMessage.default_store_shop,
        order_info: undefined,
        order_match_status: "unknown" as any,
        last_updated: new Date().toISOString(),
      });
      if (message._id) {
        clearCachedOrderInfo(message._id);
      }
      hasFetchedOrder.current = false;
      notify("success", "Message store updated");
    } catch (err) {
      console.error("Failed to update message store", err);
      notify("error", "Failed to update message store");
    }
  };

  return (
    <Layout>
      {loading && <div className="p-4">Loading...</div>}
      {!loading && (
        <div className="flex h-[calc(100vh-5rem)] flex-col overflow-hidden p-4">
          <div className="mb-4 shrink-0">
            <Link
              to="/message"
              className="inline-flex items-center gap-2 border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <ArrowLeftIcon className="h-4 w-4" />
              Back
            </Link>
          </div>

          <div className="flex min-h-0 w-full flex-1 gap-6 overflow-hidden">
            <div className="min-w-0 flex-1 overflow-y-auto pr-2">
              <div className="flex flex-col gap-6">
                <div className="grid gap-6 lg:grid-cols-2">
                  {message && (
                    <div className="border border-gray-300 bg-white p-4">
                      <div className="mb-3 text-lg font-semibold text-gray-900">Ticket</div>
                      <div className="flex flex-col gap-4">
                        <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
                          Status
                          <select
                            value={message.status || "Open"}
                            onChange={(event) => updateTicketStatus(event.target.value)}
                            disabled={updatingStatus}
                            className="border border-gray-300 px-3 py-2 text-sm font-normal text-gray-700 disabled:bg-gray-50 disabled:text-gray-400"
                          >
                            {ticketStatusList.map((status) => (
                              <option key={status} value={status}>
                                {status}
                              </option>
                            ))}
                          </select>
                        </label>
                        {(message.order_matching_store_ids?.length || 0) > 1 && (
                          <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
                            Store
                            <select
                              value={message.default_store_id || ""}
                              onChange={(event) => updateMessageStore(event.target.value)}
                              className="border border-gray-300 px-3 py-2 text-sm font-normal text-gray-700"
                            >
                              <option value="">Auto / Review</option>
                              {(message.order_matching_store_ids || []).map((storeId, index) => (
                                <option key={storeId} value={storeId}>
                                  {message.order_matching_store_shops?.[index] || storeId}
                                </option>
                              ))}
                            </select>
                          </label>
                        )}
                      </div>
                    </div>
                  )}

                  <OrderInfoCard
                    order={orderInfo}
                    loading={loadingOrder}
                    error={error}
                    messageId={message?._id}
                    orderOptions={orderOptions}
                    mentionedOrderName={mentionedOrderName}
                    section="customer"
                    layout="detail"
                    onOrderNameChanged={() => {}}
                    showConfirmButton={false}
                    isOrderConfirmed={false}
                    onActionCompleted={reloadOrderInfo}
                    onConfirm={() => {}}
                  />
                </div>

                <div>
                {message ? (
                  <div className="space-y-2">
                    {message.messages.map((entry, index) => {
                      const isLast = index === message.messages.length - 1;

                      return (
                        <div
                          key={index}
                          className={`flex ${
                            entry.sender === "client" ? "justify-start" : "justify-end"
                          }`}
                        >
                          <div className="w-full">
                            <div className="mb-2">
                              {entry.message_type === "html" && (
                                <EmailViewer
                                  subject={entry.title || "No Subject"}
                                  from={entry.metadata?.from || "Unknown"}
                                  to={entry.metadata?.to || "Unknown"}
                                  date={entry.timestamp}
                                  htmlBody={entry.content}
                                  threadId={threadId}
                                  containerClassName="w-full border border-gray-300 bg-white p-4 mb-4"
                                  //expended={isLast} // <-- only last element expanded
                                  replyFromParent={reply}
                                  OnHandleReply={() => {}}
                                />
                              )}

                              {entry.message_type === "text" && (
                                <SMSViewer
                                  from={entry.metadata?.from || "Unknown"}
                                  to={entry.metadata?.to || "Unknown"}
                                  date={entry.timestamp}
                                  body={entry.content}
                                  isExpanded={isLast} // <-- only last element expanded
                                  containerClassName="w-full border border-gray-300 bg-white p-6 mb-4"
                                />
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    {message.channel === "email" && (
                      <EmailReplySection
                        threadId={threadId}
                        replyFromParent={reply}
                      />
                    )}

                    {message.channel === "sms" && (
                      <SMSReplySection
                        threadId={threadId}
                        replyFromParent={reply}
                      />
                    )}
                  </div>
                ) : (
                  <div className="p-6 text-red-600">Message not found</div>
                )}

                <Comments messageId={message?._id} pComments={message?.comments} />
                </div>
              </div>
            </div>

            <div className="w-[404px] shrink-0 overflow-y-auto pr-1">
              <OrderInfoCard
                order={orderInfo}
                loading={loadingOrder}
                error={error}
                messageId={message?._id}
                orderOptions={orderOptions}
                mentionedOrderName={mentionedOrderName}
                section="order"
                onOrderNameChanged={(orderNumber) => {
                  (async () => {
                    setLoadingOrder(true);
                    try {
                      const res = await axios.get(`${import.meta.env.VITE_API_URL || ""}/shopify/orders`, {
                        params: {
                          search: orderNumber,
                          page: 1,
                          size: 1,
                          shop: message?.default_store_shop || "",
                          company_id: currentCompanyId,
                          include_actions: true,
                        },
                        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
                      });
                      setOrderInfo((prevState) => {
                        if (!prevState) {
                          return prevState;
                        } else {
                          return {
                            ...prevState,
                            order_id: orderNumber,
                            shopify_order: res.data.orders[0],
                          };
                        }
                      });
                    } catch (err) {
                      console.error("Failed to fetch orders", err);
                      notify("error", "Failed to fetch orders");
                    } finally {
                      setLoadingOrder(false);
                    }
                  })();
                }}
                showConfirmButton={!message?.order_info?.confirmed || message.order_info.order_id !== orderInfo?.order_id}
                isOrderConfirmed={Boolean(message?.order_info?.confirmed && message.order_info.order_id === orderInfo?.order_id)}
                onActionCompleted={reloadOrderInfo}
                onConfirm={async () => {
                  try {
                    const response = await axios.put(`${import.meta.env.VITE_API_URL || ""}/message/${message?._id}`, {
                      "order_info.order_id": orderInfo?.order_id,
                      "order_info.confirmed": true,
                    }, {
                      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
                    });
                    const confirmedOrderInfo = response.data?.order_info || {
                      ...orderInfo,
                      confirmed: true,
                    };
                    setOrderInfo(confirmedOrderInfo);
                    if (message?._id) {
                      setCachedOrderInfo(message._id, confirmedOrderInfo);
                    }
                    setMessage((prevState) => {
                      if (!prevState || !orderInfo) {
                        return prevState;
                      } else {
                        return {
                          ...prevState,
                          order_info: confirmedOrderInfo,
                        };
                      }
                    });
                    if (message && orderInfo) {
                      setCachedMessageDetail({
                        ...message,
                        order_info: confirmedOrderInfo,
                      });
                    }
                    notify("success", "Order confirmed");
                  } catch (err) {
                    console.error("Failed to update message", err);
                    notify("error", "Failed to update message");
                  }
                }}
              />
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
};

export default MessageDetailPage;
