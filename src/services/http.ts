import axios from "axios";
import { clearAuthStorage } from "../utils/authStorage";

const authRoutes = [
  "/login",
  "/signup",
  "/forget-password",
  "/reset-password",
  "/oauth/callback/login",
  "/oauth/callback/register",
  "/accept-invite",
];

// Always send httpOnly cookies with requests (for cross-subdomain cookie auth)
axios.defaults.withCredentials = true;

export function setupHttpInterceptors() {
  axios.interceptors.response.use(
    (response) => response,
    (error) => {
      if (error?.response?.status === 401) {
        clearAuthStorage();

        const currentPath = window.location.pathname;
        const isAuthRoute = authRoutes.some((route) => currentPath.startsWith(route));

        if (!isAuthRoute) {
          window.location.href = "/login";
        }
      }

      return Promise.reject(error);
    }
  );
}
