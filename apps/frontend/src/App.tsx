import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Layout, ProtectedRoute } from "./components/Layout";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

import LoginPage from "./pages/Login";
import RegisterPage from "./pages/Register";
import NotFoundPage from "./pages/NotFound";

import CampaignListPage from "./pages/CampaignList";
import CampaignNewPage from "./pages/CampaignNew";
import CampaignEditPage from "./pages/CampaignEdit";
import CampaignDetailPage from "./pages/CampaignDetail";

function App() {
  return (
    <BrowserRouter>
      <TooltipProvider delayDuration={150}>
        <Toaster />
        <Routes>
          <Route element={<Layout />}>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />

            <Route
              path="/campaigns"
              element={
                <ProtectedRoute>
                  <CampaignListPage />
                </ProtectedRoute>
              }
            />

            <Route
              path="/campaigns/new"
              element={
                <ProtectedRoute>
                  <CampaignNewPage />
                </ProtectedRoute>
              }
            />

            <Route
              path="/campaigns/:id/edit"
              element={
                <ProtectedRoute>
                  <CampaignEditPage />
                </ProtectedRoute>
              }
            />

            <Route
              path="/campaigns/:id"
              element={
                <ProtectedRoute>
                  <CampaignDetailPage />
                </ProtectedRoute>
              }
            />

            <Route path="/not-found" element={<NotFoundPage />} />
            <Route path="/" element={<Navigate to="/campaigns" replace />} />
            <Route path="*" element={<Navigate to="/not-found" replace />} />
          </Route>
        </Routes>
      </TooltipProvider>
    </BrowserRouter>
  );
}

export default App;
