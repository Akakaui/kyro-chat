"use client"

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { TooltipProvider } from "@/components/ui/tooltip"
import { useState } from "react"
import { ChatView } from "@/components/chat/ChatView"
import { SlidePanel } from "@/components/panels/SlidePanel"
import { SettingsPanel } from "@/components/panels/SettingsPanel"
import { ModelSelector } from "@/components/chat/ModelSelector"
import { AddToChatOverlay } from "@/components/chat/AddToChatOverlay"
import { ArtifactQueue } from "@/components/chat/ArtifactQueue"
import { ArtifactViewer } from "@/components/chat/ArtifactViewer"
import { useChatStore } from "@/stores/chat"
import { cn } from "@/lib/utils"

export default function Home() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      })
  )

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={300}>
        <div className="flex h-dvh overflow-hidden">
          {/* Slide panel (sidebar) */}
          <SlidePanel />

          {/* Main chat area */}
          <main className="flex flex-1 flex-col overflow-hidden">
            <ChatView />
          </main>
        </div>

        {/* Overlays */}
        <ModelSelector />
        <AddToChatOverlay />
        <SettingsPanel />
        <ArtifactQueue />
        <ArtifactViewer />
      </TooltipProvider>
    </QueryClientProvider>
  )
}
