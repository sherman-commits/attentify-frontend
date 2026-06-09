import { BrowserRouter, Route, Routes } from "react-router-dom";
import Home from "./pages/Home";

// auth
import Login from "./pages/Auth/Login";
import Signup from "./pages/Auth/Signup";
import OAuthCallbackLogin from "./pages/Auth/OAuthCallbackLogin";
import OAuthCallbackRegister from "./pages/Auth/OAuthCallbackRegister";
import ForgetPassword from "./pages/Auth/ForgetPassword";
import ResetPassword from "./pages/Auth/ResetPassword";

import Dashboard from "./pages/User/Dashboard";
import MessagePage from "./pages/User/MessagePage";
import MessageDetailPage from "./pages/User/MessageDetailPage";
import Settings from "./pages/User/Settings";
import AuditLogPage from "./pages/User/AuditLogPage";
import ProtectedRoute from './routes/ProtectedRoute';
import GmailAccountPage from "./pages/User/GmailAccountPage";
import PhoneAccountPage from "./pages/User/PhoneAccountPage";
import ShopifyPage from "./pages/User/ShopifyPage";
import ShopifySuccess from "./pages/User/ShopifySuccess";
import OrderPage from "./pages/User/OrderPage";
import RegisterCompany from "./pages/User/RegisterCompany";
import InvitationPage from "./pages/User/InvitationPage";
import AcceptInvite from "./pages/User/AcceptInvite";
import AskAcceptInvitation from "./pages/User/AskAcceptInvitation";

import { UserProvider } from "./context/UserContext";
import { NotificationProvider } from "./context/NotificationContext";
import { CompanyProvider } from "./context/CompanyContext";
import { PageTitleProvider } from "./context/PageTitleContext";
import { ConfirmDialogProvider } from "./context/ConfirmDialogContext";

// admin pages
import AdminDashboard from "./pages/Admin/Dashboard";
import UserManagement from "./pages/Admin/UserManagement";
import Governance from "./pages/Admin/Governance";
import "./App.css";

function App() {  
  return (
    <NotificationProvider>
      <ConfirmDialogProvider>
        <UserProvider>
          <CompanyProvider>
            <PageTitleProvider>
              <BrowserRouter>
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
              </BrowserRouter>
            </PageTitleProvider>
          </CompanyProvider>
        </UserProvider>
      </ConfirmDialogProvider>
    </NotificationProvider>
  );
}

export default App
