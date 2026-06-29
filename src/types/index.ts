export type ChatEntry = {
  sender: string; // email, phone number, agent id, "system", etc.
  recipient?: string; // for email/SMS, who received the message
  content: string;
  title?: string;
  timestamp: string;
  channel?: "chat" | "sms" | "email" | "voice";
  message_type?: "text" | "html" | "file" | "voice" | "system";
  metadata?: Record<string, any>;
};

export type Message = {
  _id: string;

  // Conversation/thread grouping key (Gmail threadId, SMS conversationId, etc.)
  thread_id?: string;

  // All unique senders/recipients in the conversation
  participants?: string[];

  // For compatibility with chat/SMS legacy logic
  client?: string;
  agent?: string;
  session_id?: string;

  started_at: string;
  last_updated: string;
  status:
    | "Open"
    | "In Progress"
    | "Pending"
    | "Resolved"
    | "Escalated"
    | "Awaiting Approval"
    | "Canceled";
  archived?: boolean;
  channel: "chat" | "sms" | "email" | "voice";
  title?: string;
  ticket?: string;
  messages: ChatEntry[];
  ai_summary?: string;
  tags?: string[];
  resolved_by_ai?: boolean;
  comments?: Comment[];
  order_info?: OrderInfo;
  default_store_id?: string;
  default_store_shop?: string;
  order_matching_store_ids?: string[];
  order_matching_store_shops?: string[];
};

export interface OrderInfo {
  order_id: string;
  type: string;
  status: number;
  msg: string;
  shopify_order?: ShopifyOrder;
  confirmed?: boolean;
  no_orders?: boolean;
};

export interface ShopifyAddress {
  address1?: string;
  address2?: string;
  city?: string;
  province?: string;
  country?: string;
  zip?: string;
  [key: string]: any; // For any additional fields
}

export interface ShopifyCustomer {
  id?: number | string;
  email?: string;
  name?: string;
  phone?: string;
  default_address?: ShopifyAddress;
  [key: string]: any; // For any additional fields
}

export interface ShopifyLineItem {
  product_id?: number | string;
  name?: string;
  quantity?: number;
  price?: string | number;
  [key: string]: any; // For extra line item properties
}

export interface ShopifyOrder {
  order_id: number | string;
  order_number?: number | string;
  name?: string;
  shop?: string;
  created_at?: string;
  customer?: ShopifyCustomer;
  shipping_address?: ShopifyAddress;
  billing_address?: ShopifyAddress;
  total_price?: string | number;
  payment_status?: string;
  fulfillment_status?: string;
  line_items?: ShopifyLineItem[];
  order_actions?: OrderAction[];
  updated_at?: string;
  [key: string]: any; // For any additional properties
}

export interface OrderAction {
  type: "refund" | "cancellation" | string;
  amount?: number | string;
  actor_name?: string;
  actor_role?: string;
  note?: string;
  created_at?: string;
  details?: Record<string, any>;
}

export interface Comment {
  id: string;
  user: string;
  user_id?: string;
  content: string;
  created_at: string;
  updated_at: string;
  status: string;
  edited?: boolean;
};
