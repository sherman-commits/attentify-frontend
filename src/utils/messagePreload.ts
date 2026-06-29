import axios from "axios";
import type { Message, OrderInfo } from "../types";

const API_URL = import.meta.env.VITE_API_URL || "";
const DETAIL_TTL_MS = 5 * 60 * 1000;
const ORDER_INFO_TTL_MS = 5 * 60 * 1000;
const MAX_DETAIL_PRELOADS = 20;

type Cached<T> = {
  value: T;
  storedAt: number;
};

const messageDetailCache = new Map<string, Cached<Message>>();
const orderInfoCache = new Map<string, Cached<OrderInfo>>();
const messageDetailInflight = new Map<string, Promise<Message>>();
const orderInfoInflight = new Map<string, Promise<OrderInfo>>();

function authHeaders() {
  return { Authorization: `Bearer ${localStorage.getItem("token")}` };
}

function getFresh<T>(cache: Map<string, Cached<T>>, key: string, ttl: number): T | null {
  const entry = cache.get(key);
  if (!entry || Date.now() - entry.storedAt >= ttl) {
    cache.delete(key);
    return null;
  }
  return entry.value;
}

export function getCachedMessageDetail(messageId?: string): Message | null {
  if (!messageId) return null;
  return getFresh(messageDetailCache, messageId, DETAIL_TTL_MS);
}

export function setCachedMessageDetail(message: Message) {
  messageDetailCache.set(message._id, {
    value: message,
    storedAt: Date.now(),
  });
  if (message.order_info) {
    setCachedOrderInfo(message._id, message.order_info);
  }
}

export function getCachedOrderInfo(messageId?: string): OrderInfo | null {
  if (!messageId) return null;
  return getFresh(orderInfoCache, messageId, ORDER_INFO_TTL_MS);
}

export function setCachedOrderInfo(messageId: string, orderInfo: OrderInfo) {
  orderInfoCache.set(messageId, {
    value: orderInfo,
    storedAt: Date.now(),
  });
}

export function clearCachedOrderInfo(messageId: string) {
  orderInfoCache.delete(messageId);
  orderInfoInflight.delete(messageId);
}

export async function fetchMessageDetailCached(messageId: string, options: { force?: boolean } = {}): Promise<Message> {
  const cached = getCachedMessageDetail(messageId);
  if (!options.force && cached) return cached;

  const inflight = messageDetailInflight.get(messageId);
  if (inflight) return inflight;

  const request = axios
    .get(`${API_URL}/message/${messageId}`, { headers: authHeaders() })
    .then((response) => {
      setCachedMessageDetail(response.data);
      return response.data as Message;
    })
    .finally(() => {
      messageDetailInflight.delete(messageId);
    });

  messageDetailInflight.set(messageId, request);
  return request;
}

export function seedMessageSummaryCache(message: Partial<Message> & { _id: string }) {
  if (message.order_info) {
    setCachedOrderInfo(message._id, message.order_info);
  }
  if (!message.messages) return;
  setCachedMessageDetail(message as Message);
}

export async function fetchOrderInfoCached(
  messageId: string,
  options: { force?: boolean } = {}
): Promise<OrderInfo> {
  const cached = getCachedOrderInfo(messageId);
  if (!options.force && cached && (cached.no_orders || (cached.order_id && cached.shopify_order))) return cached;

  const inflight = orderInfoInflight.get(messageId);
  if (inflight) return inflight;

  const request = axios
    .post(`${API_URL}/message/analyze`, { message_id: messageId }, { headers: authHeaders() })
    .then((response) => {
      const data = response.data as OrderInfo;
      if (data.order_id || data.no_orders || data.confirmed) {
        setCachedOrderInfo(messageId, data);
      }
      return data;
    })
    .finally(() => {
      orderInfoInflight.delete(messageId);
    });

  orderInfoInflight.set(messageId, request);
  return request;
}

export function preloadMessagePage(messages: Array<Partial<Message> & { _id: string }>) {
  const candidates = messages.slice(0, MAX_DETAIL_PRELOADS);

  window.setTimeout(async () => {
    for (const message of candidates) {
      try {
        seedMessageSummaryCache(message);
        const detail = await fetchMessageDetailCached(message._id);
        if (detail.order_info) {
          setCachedOrderInfo(detail._id, detail.order_info);
        }
      } catch {
        // Preload is opportunistic; normal page loading still handles errors.
      }
    }
  }, 250);
}
