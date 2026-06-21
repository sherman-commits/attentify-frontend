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

const MessageDetailPage = () => {
  const { threadId } = useParams<{ threadId: string }>();
  const [message, setMessage] = useState<Message | null>(null);
  const [loading, setLoading] = useState(true);
  const [reply, setReply] = useState("");

  const [orderInfo, setOrderInfo] = useState<OrderInfo | null>(null);
  const [loadingOrder, setLoadingOrder] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [orderOptions, setOrderOptions] = useState<any>([]);
  const [mentionedOrderName, setMentionedOrderName] = useState<string>("");

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
      const response = await axios.get(
        `${import.meta.env.VITE_API_URL || ""}/message/${threadId}`,
        {
          headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
        }
      );
      hasFetchedOrder.current = false;
      setMessage(response.data);
    } catch (error) {
      console.error("Error refreshing message:", error);
    }
  };

  // Fetch message thread
  useEffect(() => {
    hasFetchedMessage.current = false;
    hasFetchedOrder.current = false;
    setLoading(true);
    setMessage(null);
    setOrderInfo(null);
    setMentionedOrderName("");

    const fetchMessage = async () => {
      if (hasFetchedMessage.current) return;
      hasFetchedMessage.current = true;
      try {
        const response = await axios.get(
          `${import.meta.env.VITE_API_URL || ""}/message/${threadId}`,
          {
            headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
          }
        );
        setMessage(response.data);

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
    //hasFetchedOrder.current = false;

    const fetchOrderInfo = async () => {
      if (hasFetchedOrder.current) return;
      hasFetchedOrder.current = true;
      if (!message || !message.messages?.length) {
        return null;
      }

      try {
        setOrderInfo(null);
        setLoadingOrder(true);
        setError(null);
        const response = await axios.post(
          (import.meta.env.VITE_API_URL || "") + "/message/analyze",
          { message_id: message._id },
          {
            headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
          }
        );
        setOrderInfo(response.data);
        if (response.data?.order_id) {
          setMentionedOrderName(response.data.order_id);
        }
        if (response.data?.msg === 'Email not matched') {
          setReply("Please send inquiry via email from the order.");
        } else {
          setReply(response.data?.msg || "");
        }
        return response.data;
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

      try {
        const res = await axios.get(`${import.meta.env.VITE_API_URL || ""}/shopify/orders`, {
          params: {
            search: "",
            page: 1,
            size: 50,
            shop: "",
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
        await fetchOrderOptions(mentionedName);
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
    } catch (err) {
      console.error("Failed to refresh order info", err);
      notify("error", "Failed to refresh order info");
    } finally {
      setLoadingOrder(false);
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
          {/* Main Email Thread */}
          <div className="min-w-0 flex-1 overflow-y-auto pr-2">
            
            {message ? (
              <div className="mx-auto max-w-5xl space-y-2">
                {message.messages.map((entry, index) => {
                  const isLast = index === message.messages.length - 1;

                  return (
                    <div
                      key={index}
                      className={`flex ${
                        entry.sender === "client" ? "justify-start" : "justify-end"
                      }`}
                    >
                      <div className="w-full max-w-5xl">
                        <div className="mb-2">
                          {entry.message_type === "html" && (
                            <EmailViewer
                              subject={entry.title || "No Subject"}
                              from={entry.metadata?.from || "Unknown"}
                              to={entry.metadata?.to || "Unknown"}
                              date={entry.timestamp}
                              htmlBody={entry.content}
                              threadId={threadId}
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

          {/* Sidebar */}
          <div className="w-[404px] shrink-0 overflow-y-auto pr-1">
            <div className="flex flex-col space-y-6">
              <OrderInfoCard
                order={orderInfo}
                loading={loadingOrder}
                error={error}
                messageId={message?._id}
                orderOptions={orderOptions}
                mentionedOrderName={mentionedOrderName}
                onOrderNameChanged={(orderNumber) => {
                  (async () => {
                    setLoadingOrder(true);
                    try {
                      const res = await axios.get(`${import.meta.env.VITE_API_URL || ""}/shopify/orders`, {
                        params: {
                          search: orderNumber,
                          page: 1,
                          size: 1,
                          shop: "",
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
                    await axios.put(`${import.meta.env.VITE_API_URL || ""}/message/${message?._id}`, {
                      "order_info.order_id": orderInfo?.order_id,
                      "order_info.confirmed": true,
                    }, {
                      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
                    });
                    setMessage((prevState) => {
                      if (!prevState || !prevState.order_info || !orderInfo) {
                        return prevState;
                      } else {
                        return {
                          ...prevState,
                          order_info: {
                            ...prevState?.order_info,
                            order_id: orderInfo?.order_id,
                            confirmed: true,
                          }
                        };
                      }
                    });
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
        </div>
      )}
    </Layout>
  );
};

export default MessageDetailPage;
