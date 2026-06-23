import { useEffect, useState, useRef } from "react";
import { Link, useLocation } from "react-router-dom";
import axios from "axios";
import Layout from "../../layouts/Layout";
import { useNotification } from "../../context/NotificationContext";
import { usePageTitle } from "../../context/PageTitleContext";
import { useCompany } from "../../context/CompanyContext";
import { fetchOrderDetailCached, preloadOrderPage } from "../../utils/orderPreload";

interface Customer {
  id?: string;
  email?: string;
  name?: string;
}

interface LineItem {
  product_id?: string;
  name?: string;
  quantity?: number;
  price?: string;
}

interface Order {
  order_id: string;
  name: string;
  shop: string;
  created_at?: string;
  customer?: Customer;
  total_price?: string;
  payment_status?: string;
  fulfillment_status?: string;
  line_items?: LineItem[];
}

interface ShopifyShop {
  _id: string;
  shop: string;
}

type SortField = "order" | "date" | "payment_status" | "fulfillment_status";
type SortOrder = "asc" | "desc";

const ORDER_PREFERENCES_KEY = "attentify.orderListPreferences";
const ORDER_LIST_CACHE_TTL_MS = 5 * 60 * 1000;

const defaultOrderPreferences = {
  pageSize: 10,
  selectedShop: "",
  sortBy: "date" as SortField,
  sortOrder: "desc" as SortOrder,
};

type OrderListRequestParams = {
  company_id: string;
  search: string;
  page: number;
  size: number;
  shop: string;
  sort_by: SortField;
  sort_order: SortOrder;
};

type OrderListCache = {
  params: OrderListRequestParams;
  orders: Order[];
  totalPages: number;
  scrollY: number;
  storedAt: number;
};

let orderListCache: OrderListCache | null = null;

function loadOrderPreferences() {
  try {
    const stored = localStorage.getItem(ORDER_PREFERENCES_KEY);
    if (!stored) return defaultOrderPreferences;

    return {
      ...defaultOrderPreferences,
      ...JSON.parse(stored),
    };
  } catch {
    return defaultOrderPreferences;
  }
}

export default function OrderPage() {
  const savedPreferences = loadOrderPreferences();
  const cachedParams = orderListCache?.params;
  const [orders, setOrders] = useState<Order[]>(() => orderListCache?.orders || []);
  const [loading, setLoading] = useState(false);
  const [hasLoadedOrders, setHasLoadedOrders] = useState(Boolean(orderListCache?.orders.length));
  const [search, setSearch] = useState(cachedParams?.search || "");
  const [debouncedSearch, setDebouncedSearch] = useState(cachedParams?.search || "");
  const [selectedShop, setSelectedShop] = useState(cachedParams?.shop || savedPreferences.selectedShop);
  const [shops, setShops] = useState<ShopifyShop[]>([]);
  const [currentPage, setCurrentPage] = useState(cachedParams?.page || 1);
  const [pageSize, setPageSize] = useState(cachedParams?.size || savedPreferences.pageSize);
  const [totalPages, setTotalPages] = useState(orderListCache?.totalPages || 1);
  const [sortBy, setSortBy] = useState<SortField>(cachedParams?.sort_by || savedPreferences.sortBy);
  const [sortOrder, setSortOrder] = useState<SortOrder>(cachedParams?.sort_order || savedPreferences.sortOrder);

  const { notify } = useNotification();
  const { setTitle } = usePageTitle();
  const location = useLocation();
  const { currentCompanyId } = useCompany();

  useEffect(() => {
    setTitle("Orders");
  }, [setTitle]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
    }, 350);

    return () => window.clearTimeout(timeout);
  }, [search]);

  useEffect(() => {
    fetchOrders();
  }, [currentPage, pageSize, debouncedSearch, selectedShop, sortBy, sortOrder, currentCompanyId]);

  useEffect(() => {
    fetchShops();
  }, [currentCompanyId]);

  useEffect(() => {
    localStorage.setItem(
      ORDER_PREFERENCES_KEY,
      JSON.stringify({
        pageSize,
        selectedShop,
        sortBy,
        sortOrder,
      })
    );
  }, [pageSize, selectedShop, sortBy, sortOrder]);

  // Re-fetch when navigating back from detail
  useEffect(() => {
    if (location.pathname === "/order") {
      fetchOrders({ force: true });
    }
  }, [location.pathname]);

  // Restore scroll after orders load (runs once, multiple retries)
  const hasRestoredOrderRef = useRef(false);
  const scrollTargetOrderRef = useRef(0);
  useEffect(() => {
    const savedY = sessionStorage.getItem("orderListScrollY");
    if (savedY) scrollTargetOrderRef.current = parseInt(savedY, 10);
  }, []);

  useEffect(() => {
    if (!hasRestoredOrderRef.current && !loading && orders.length > 0 && scrollTargetOrderRef.current > 0) {
      hasRestoredOrderRef.current = true;
      requestAnimationFrame(() => {
        window.scroll(0, scrollTargetOrderRef.current);
      });
    }
  }, [loading, orders]);

  const fetchOrders = async (options: { force?: boolean } = {}) => {
    if (!currentCompanyId) return;

    const requestParams: OrderListRequestParams = {
      search: debouncedSearch,
      page: currentPage,
      size: pageSize,
      shop: selectedShop,
      sort_by: sortBy,
      sort_order: sortOrder,
      company_id: currentCompanyId,
    };

    const cachedList = orderListCache;
    const cacheMatches =
      cachedList &&
      Date.now() - cachedList.storedAt < ORDER_LIST_CACHE_TTL_MS &&
      JSON.stringify(cachedList.params) === JSON.stringify(requestParams);

    if (!options.force && cacheMatches && cachedList) {
      setOrders(cachedList.orders);
      setTotalPages(cachedList.totalPages);
      setHasLoadedOrders(true);
      return;
    }

    setLoading(true);
    try {
      const res = await axios.get(`${import.meta.env.VITE_API_URL || ""}/shopify/orders`, {
        params: requestParams,
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });

      const nextOrders = res.data.orders || [];
      const nextTotalPages = res.data.totalPages || 1;

      setOrders(nextOrders);
      setTotalPages(nextTotalPages);
      preloadOrderPage(currentCompanyId, nextOrders);
      orderListCache = {
        params: requestParams,
        orders: nextOrders,
        totalPages: nextTotalPages,
        scrollY: orderListCache?.scrollY || 0,
        storedAt: Date.now(),
      };
    } catch (err) {
      console.error("Failed to fetch orders", err);
      notify("error", "Failed to fetch orders");
    } finally {
      setHasLoadedOrders(true);
      setLoading(false);
    }
  };

  const fetchShops = async () => {
    if (!currentCompanyId) return;

    try {
      // Build base URL
      const baseUrl = import.meta.env.VITE_API_URL || "";
      
      // Add company_id as query param if provided
      const url = `${baseUrl}/shopify/company?company_id=${encodeURIComponent(currentCompanyId)}`;

      const res = await axios.get(url, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });

      setShops(res.data);
    } catch (err) {
      console.error("Failed to fetch Shopify shops", err);
      notify("error", "Failed to fetch Shopify shops");
    }
  };

  const handleSyncOrders = async () => {
    if (!currentCompanyId) return;
    setLoading(true);
    try {
      await axios.post(
        `${import.meta.env.VITE_API_URL || ""}/shopify/orders/sync`,
        { company_id: currentCompanyId },
        {
          headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
        }
      );
      await fetchOrders({ force: true });
    } catch (err) {
      console.error("Failed to sync orders", err);
      notify("error", "Failed to sync orders");
    } finally {
      setLoading(false);
    }
  };

  const handleSort = (field: SortField) => {
    if (sortBy === field) {
      setSortOrder((current) => (current === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(field);
      setSortOrder(field === "date" ? "desc" : "asc");
    }
    setCurrentPage(1);
  };

  const prefetchOrder = (order: Order) => {
    if (!currentCompanyId) return;
    const orderId = String(order.name || order.order_id || "");
    if (!orderId) return;
    fetchOrderDetailCached(currentCompanyId, orderId).catch(() => {
      // Best-effort preload; the detail page handles any real error.
    });
  };

  const sortIndicator = (field: SortField) => {
    if (sortBy !== field) return "";
    return sortOrder === "asc" ? " ^" : " v";
  };

  const SortHeader = ({
    field,
    children,
  }: {
    field: SortField;
    children: string;
  }) => (
    <th className="py-4 px-3 text-left font-semibold text-gray-600">
      <button
        type="button"
        onClick={() => handleSort(field)}
        className="font-semibold text-gray-600 hover:text-gray-900"
        title={`Sort by ${children}`}
      >
        {children}
        {sortIndicator(field)}
      </button>
    </th>
  );

  return (
    <Layout>
      <div className="p-4">
        <div className="bg-white">
          {/* Filters & Sync */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 gap-2">
            <div className="flex flex-col md:flex-row gap-2 w-full md:w-auto">
              <input
                type="text"
                placeholder="Search by order or customer email"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setCurrentPage(1);
                }}
                className="border border-gray-300 px-3 py-2 w-full md:w-64 text-sm"
              />
              <select
                value={selectedShop}
                onChange={(e) => {
                  setSelectedShop(e.target.value);
                  setCurrentPage(1);
                }}
                className="border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="">All Shops</option>
                {shops.map((shop) => (
                  <option key={shop._id} value={shop.shop}>
                    {shop.shop}
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={handleSyncOrders}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 text-sm font-medium"
            >
              + Sync Orders
            </button>
          </div>

          {/* Table */}
          {loading && hasLoadedOrders && (
            <div className="fixed right-6 top-20 z-40 border border-gray-300 bg-white px-4 py-2 text-sm text-gray-600 shadow">
              Loading orders...
            </div>
          )}

          {loading && !hasLoadedOrders ? (
            <p className="text-gray-500">Loading Orders...</p>
          ) : orders.length === 0 ? (
            <p className="text-gray-500">No Orders.</p>
          ) : (
            <div className="overflow-x-auto border border-gray-300">
              <table className="min-w-full text-sm divide-y divide-gray-200">
                <thead>
                  <tr className="bg-gray-50">
                    <SortHeader field="order">Order</SortHeader>
                    <th className="py-4 px-3 text-left font-semibold text-gray-600">Shop</th>
                    <SortHeader field="date">Date</SortHeader>
                    <th className="py-4 px-3 text-left font-semibold text-gray-600">Customer</th>
                    <th className="py-4 px-3 text-left font-semibold text-gray-600">Total</th>
                    <SortHeader field="payment_status">Payment Status</SortHeader>
                    <SortHeader field="fulfillment_status">Fulfillment Status</SortHeader>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100">
                  {orders.map((order) => (
                    <tr key={order.order_id}>
                      <td className="py-2 px-3">
                        <Link
                          to={`/order/${encodeURIComponent(String(order.name || order.order_id))}`}
                          className="font-medium text-blue-600 hover:text-blue-700"
                          onMouseEnter={() => prefetchOrder(order)}
                          onFocus={() => prefetchOrder(order)}
                          onClick={() => sessionStorage.setItem("orderListScrollY", String(window.scrollY))}
                        >
                          {order.name}
                        </Link>
                      </td>
                      <td className="py-2 px-3">{order.shop}</td>
                      <td className="py-2 px-3">
                        {order.created_at ? new Date(order.created_at).toLocaleString() : "-"}
                      </td>
                      <td className="py-2 px-3">
                        {order.customer?.name || "-"}
                        <br />
                        <span className="text-xs text-gray-500">{order.customer?.email}</span>
                      </td>
                      <td className="py-2 px-3">{order.total_price || "-"}</td>
                      <td className="py-2 px-3">
                        {order.payment_status ? (
                          <span
                            className={
                              order.payment_status === "paid"
                                ? "text-green-600 font-semibold"
                                : order.payment_status === "pending"
                                ? "text-yellow-600 font-semibold"
                                : "text-gray-600"
                            }
                          >
                            {order.payment_status}
                          </span>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="py-2 px-3">
                        {order.fulfillment_status ? (
                          <span
                            className={
                              order.fulfillment_status === "fulfilled"
                                ? "text-green-600 font-semibold"
                                : order.fulfillment_status === "partial"
                                ? "text-yellow-600 font-semibold"
                                : "text-gray-600"
                            }
                          >
                            {order.fulfillment_status}
                          </span>
                        ) : (
                          "-"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

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
      </div>
    </Layout>
  );
}
