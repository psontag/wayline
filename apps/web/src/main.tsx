import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { ThemeProvider, TooltipProvider } from "@wayline/ui";
import "@wayline/ui/fonts.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ServicesProvider } from "./data/ServicesProvider";
import "./i18n";
import { router } from "./router";
import "./styles.css";

const queryClient = new QueryClient();

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");

createRoot(root).render(
  <StrictMode>
    <ThemeProvider>
      <TooltipProvider delayDuration={400}>
        <ServicesProvider>
          <QueryClientProvider client={queryClient}>
            <RouterProvider router={router} />
          </QueryClientProvider>
        </ServicesProvider>
      </TooltipProvider>
    </ThemeProvider>
  </StrictMode>,
);
