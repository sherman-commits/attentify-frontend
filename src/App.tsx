import { BrowserRouter, Route, Routes } from "react-router-dom";
import { lazy, Suspense } from "react";
import Home from "./pages/Home";

// Lazy-loaded page components for code splitting
const Login = lazy(() => import("./pages/Auth/Login"));
const Signup = lazy(() => import("./pages/Auth/Signup"));
const OAuthCallbackLogin = lazy(() => import("./pages/Auth/OAuthCallbackLogin"));
const OAuthCallbackRegister = lazy(() => import("./pages/Auth/OAuthCallbackRegister"));
const ForgetPassword = lazy(() => import("./pages/Auth/ForgetPassword"));
const ResetPassword = lazy(() => import("./pages/Auth/ResetPassword"));

const Dashboard = lazy(() => import("./pages/User/Dashboard"));
const MessagePage = lazy(() => import("./pages/User/MessagePage"));
const MessageDetailPage = lazy(() => import("./pages/User/MessageDetailPage"));
const Settings = lazy(() => import("./pages/User/Settings"));
const AuditLogPage = lazy(() => import("./pages/User/AuditLogPage"));
const GmailAccountPage = lazy(() => import("./pages/User/GmailAccountPage"));
const PhoneAccountPage = lazy(() => import("./pages/User/PhoneAccountPage"));
const ShopifyPage = lazy(() => import("./pages/User/ShopifyPage"));
const ShopifySuccess = lazy(() => import("./pages/User/ShopifySuccess"));
const OrderPage = lazy(() => import("./pages/User/OrderPage"));
const OrderDetailPage = lazy(() => import("./pages/User/OrderDetailPage"));
const RegisterCompany = lazy(() => import("./pages/User/RegisterCompany"));
const InvitationPage = lazy(() => import("./pages/User/InvitationPage"));
const AcceptInvite = lazy(() => import("./pages/User/AcceptInvite"));
const AskAcceptInvitation = lazy(() => import("./pages/User/AskAcceptInvitation"));

const AdminDashboard = lazy(() => import("./pages/Admin/Dashboard"));
const UserManagement = lazy(() => import("./pages/Admin/UserManagement"));
const Governance = lazy(() => import("./pages/Admin/Governance"));

import ProtectedRoute from './routes/ProtectedRoute';

import { UserProvider } from "./context/UserContext";
import { NotificationProvider } from "./context/NotificationContext";
import { CompanyProvider } from "./context/CompanyContext";
import { PageTitleProvider } from "./context/PageTitleContext";
import { ConfirmDialogProvider } from "./context/ConfirmDialogContext";

import "./App.css";

const PageLoader = () => (
  <div className="flex items-center justify-center min-h-[200px]">
    <p className="text-gray-500">Loading...</p>
  </div>
);

function App() {  
  return (
    <NotificationProvider>
      <ConfirmDialogProvider>
        <UserProvider>
          <CompanyProvider>
            <PageTitleProvider>
              <BrowserRouter>
                <Suspense fallback={<PageLoader />}>
                <Routes>
                  <Route path="/" element={<Home />} />

                  <Route path="/login" element={<Login />} />
                  <Route path="/signup" element={<Signup />} />
                  <Route path="/oauth/callback/login" element={<OAuthCallbackLogin />} />
                  <Route path="/oauth/callback/register" element={<OAuthCallbackRegister />} />
                  <Route path="/forget-password" element={<ForgetPassword />} />
                  <Route path="/reset-password" element={<ResetPassword />} />
                  
                  <Route
                    path="/admin/dashboard"
                    element={
                      <ProtectedRoute allowedRoles={['admin']}>
                        <AdminDashboard />
                      </ProtectedRoute>
                    }
                  />

                  <Route
                    path="/admin/user"
                    element={
                      <ProtectedRoute allowedRoles={['admin']}>
                        <UserManagement />
                      </ProtectedRoute>
                    }
                  />

                  <Route
                    path="/admin/governance"
                    element={
                      <ProtectedRoute allowedRoles={['admin']}>
                        <Governance />
                      </ProtectedRoute>
                    }
                  />

                  <Route
                    path="/dashboard"
                    element={
                      <ProtectedRoute allowedRoles={['company_owner', 'store_owner', 'agent', 'readonly']}>
                        <Dashboard />
                      </ProtectedRoute>
                    }
                  />

                  <Route
                    path="/message"
                    element={
                      <ProtectedRoute allowedRoles={['company_owner', 'store_owner', 'agent', 'readonly']}>
                        <MessagePage />
                      </ProtectedRoute>
                    }
                  />
                  
                  <Route
                    path="/message/:threadId"
                    element={
                      <ProtectedRoute allowedRoles={['company_owner', 'store_owner', 'agent', 'readonly']}>
                        <MessageDetailPage  />
                      </ProtectedRoute>
                    }
                  />

                  <Route
                    path="/order"
                    element={
                      <ProtectedRoute allowedRoles={['company_owner', 'store_owner', 'agent', 'readonly']}>
                        <OrderPage />
                      </ProtectedRoute>
                    }
                  />

                  <Route
                    path="/order/:orderId"
                    element={
                      <ProtectedRoute allowedRoles={['company_owner', 'store_owner', 'agent', 'readonly']}>
                        <OrderDetailPage />
                      </ProtectedRoute>
                    }
                  />

                  <Route
                    path="/accounts/gmail"
                    element={
                      <ProtectedRoute allowedRoles={['company_owner', 'store_owner', 'agent', 'readonly']}>
                        <GmailAccountPage />
                      </ProtectedRoute>
                    }
                  />

                  <Route
                    path="/accounts/phone"
                    element={
                      <ProtectedRoute allowedRoles={['company_owner', 'store_owner', 'agent', 'readonly']}>
                        <PhoneAccountPage />
                      </ProtectedRoute>
                    }
                  />

                  <Route
                    path="/shopify"
                    element={
                      <ProtectedRoute allowedRoles={['company_owner', 'store_owner', 'agent', 'readonly']}>
                        <ShopifyPage />
                      </ProtectedRoute>
                    }
                  />

                  <Route
                    path="/shopify/success"
                    element={
                      <ProtectedRoute allowedRoles={['company_owner', 'store_owner', 'agent', 'readonly']}>
                        <ShopifySuccess />
                      </ProtectedRoute>
                    }
                  />

                  <Route
                    path="/settings"
                    element={
                      <ProtectedRoute allowedRoles={['company_owner', 'store_owner', 'agent', 'readonly']}>
                        <Settings />
                      </ProtectedRoute>
                    }
                  />

                  <Route
                    path="/settings/audit-log"
                    element={
                      <ProtectedRoute allowedRoles={['company_owner', 'store_owner', 'agent', 'readonly']}>
                        <AuditLogPage />
                      </ProtectedRoute>
                    }
                  />

                  <Route
                    path="/invite"
                    element={
                      <ProtectedRoute allowedRoles={['company_owner', 'store_owner', 'agent', 'readonly']}>
                        <InvitationPage />
                      </ProtectedRoute>
                    }
                  />

                  <Route
                    path="/accept-invite"
                    element={
                      <AcceptInvite />
                    }
                  />

                  <Route
                    path="/ask-accept-invitation"
                    element={
                      <AskAcceptInvitation />
                    }
                  />

                  <Route
                    path="/register-company"
                    element={
                      <RegisterCompany />
                    }
                  />
                </Routes>
                </Suspense>
              </BrowserRouter>
            </PageTitleProvider>
          </CompanyProvider>
        </UserProvider>
      </ConfirmDialogProvider>
    </NotificationProvider>
  );
}

export default App
