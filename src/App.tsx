import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Index from "./pages/Index.tsx";
import NotFound from "./pages/NotFound.tsx";
import Auth from "./pages/Auth.tsx";
import Pro from "./pages/Pro.tsx";
import TikTok from "./pages/TikTok.tsx";
import Instagram from "./pages/Instagram.tsx";
import Facebook from "./pages/Facebook.tsx";
import YouTube from "./pages/YouTube.tsx";

import Twitter from "./pages/Twitter.tsx";
import LinkedIn from "./pages/LinkedIn.tsx";
import TinyUrl from "./pages/TinyUrl.tsx";
import BackgroundRemover from "./pages/BackgroundRemover.tsx";
import MediaFire from "./pages/MediaFire.tsx";
import Spotify from "./pages/Spotify.tsx";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/tiktok" element={<TikTok />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/pro" element={<Pro />} />
          <Route path="/instagram" element={<Instagram />} />
          <Route path="/facebook" element={<Facebook />} />
          <Route path="/youtube" element={<YouTube />} />

          <Route path="/twitter" element={<Twitter />} />
          <Route path="/linkedin" element={<LinkedIn />} />
          <Route path="/tinyurl" element={<TinyUrl />} />
          <Route path="/background-remover" element={<BackgroundRemover />} />
          <Route path="/mediafire" element={<MediaFire />} />
          <Route path="/spotify" element={<Spotify />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
