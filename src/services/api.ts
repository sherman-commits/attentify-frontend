/** Centralized API service layer for the Attentify frontend. */

import axios from "axios";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000/api/v1";

const api = axios.create({
  baseURL: API_URL,
  withCredentials: true,
});

// Request interceptor: attach Bearer token from localStorage (fallback)
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ---- Auth ----
export const authApi = {
  login: (email: string, password: string) =>
    api.post("/auth/login", new URLSearchParams({ username: email, password }), {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    }),

  register: (data: {
    email: string;
    password: string;
    first_name: string;
    last_name: string;
    invitation_token?: string | null;
  }) => api.post("/auth/register", data),

  me: () => api.get("/auth/me"),

  forgotPassword: (email: string) =>
    api.post("/auth/forgot-password", { email }),

  resetPassword: (token: string, new_password: string) =>
    api.post("/auth/reset-password", { token, new_password }),
};

// ---- Messages / Tickets ----
export const messagesApi = {
  list: (companyId: string, params?: Record<string, string | number>) =>
    api.get("/message/company_messages", { params: { company_id: companyId, ...params } }),

  get: (id: string) => api.get(`/message/${id}`),

  update: (id: string, payload: Record<string, unknown>) =>
    api.put(`/message/${id}`, payload),

  patch: (id: string, field: string, value: unknown) =>
    api.patch(`/message/${id}`, { field, value }),

  delete: (id: string) => api.delete(`/message/${id}`),

  addComment: (messageId: string, content: string, status?: string) =>
    api.post(`/message/add_comment/${messageId}`, { content, status }),

  editComment: (messageId: string, commentId: string, content: string) =>
    api.put(`/message/edit_comment/${messageId}/${commentId}`, content, {
      headers: { "Content-Type": "text/plain" },
    }),

  deleteComment: (messageId: string, commentId: string) =>
    api.delete(`/message/delete_comment/${messageId}/${commentId}`),
};

// ---- Users ----
export const usersApi = {
  list: () => api.get("/users/"),
  create: (data: Record<string, unknown>) => api.post("/users/", data),
  update: (id: string, data: Record<string, unknown>) =>
    api.put(`/users/${id}`, data),
  delete: (id: string) => api.delete(`/users/${id}`),
};

export default api;
