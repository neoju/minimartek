import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { SWRConfig } from "swr";
import { store } from "@/app/store";
import { swrFetcher } from "@/lib/api-client";
import App from "@/App";
import "@/index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Provider store={store}>
      <SWRConfig value={{ fetcher: swrFetcher, revalidateOnFocus: false }}>
        <App />
      </SWRConfig>
    </Provider>
  </StrictMode>,
);
