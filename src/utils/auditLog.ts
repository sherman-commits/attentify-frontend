export interface AuditLog {
  _id: string;
  actor_name?: string;
  actor_role?: string;
  action: string;
  ticket?: string;
  customer?: string;
  details?: Record<string, unknown>;
  created_at: string;
}

export const roleLabel = (role?: string) => {
  switch (role) {
    case "company_owner":
      return "Owner";
    case "store_owner":
      return "Store Owner";
    case "agent":
      return "Agent";
    case "readonly":
      return "Read-only";
    case "admin":
      return "Admin";
    default:
      return role || "Unknown";
  }
};

export const formatUtcDate = (value: string) => {
  const date = new Date(value);
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const hh = String(date.getUTCHours()).padStart(2, "0");
  const min = String(date.getUTCMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${min} UTC`;
};

const detailValue = (details: Record<string, unknown> | undefined, key: string) => {
  const value = details?.[key];
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
};

export const buildLogText = (log: AuditLog) => {
  const parts = [
    `${formatUtcDate(log.created_at)} - User: ${log.actor_name || "Unknown user"} (${roleLabel(log.actor_role)})`,
    `Action: ${log.action}`,
  ];

  if (log.ticket) parts.push(`Ticket: #${log.ticket}`);
  if (log.customer) parts.push(`Customer: ${log.customer}`);

  const target = detailValue(log.details, "target_email");
  const orderId = detailValue(log.details, "order_id");
  const shop = detailValue(log.details, "shop");
  const email = detailValue(log.details, "email");
  const phoneNumber = detailValue(log.details, "phone_number");

  if (target) parts.push(`Target: ${target}`);
  if (orderId) parts.push(`Order: ${orderId}`);
  if (shop) parts.push(`Shop: ${shop}`);
  if (email) parts.push(`Email: ${email}`);
  if (phoneNumber) parts.push(`Phone: ${phoneNumber}`);

  return parts.join(" - ");
};
