import { createFileRoute, ClientOnly } from "@tanstack/react-router";
import App from "@/App";

export const Route = createFileRoute("/$")({
  ssr: false,
  component: () => (
    <ClientOnly fallback={null}>
      <App />
    </ClientOnly>
  ),
});
