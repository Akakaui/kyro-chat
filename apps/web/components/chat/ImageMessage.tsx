"use client"

import React, { useState } from "react"
import { Download, ExternalLink, ZoomIn, ZoomOut, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

interface ImageMessageProps {
  url: string
  alt?: string
  prompt?: string
  className?: string
}

export function ImageMessage({ url, alt, prompt, className }: ImageMessageProps) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [zoomed, setZoomed] = useState(false)

  const handleLoad = () => setLoading(false)
  const handleError = () => {
    setLoading(false)
    setError(true)
  }

  const handleDownload = async () => {
    try {
      const res = await fetch(url)
      const blob = await res.blob()
      const a = document.createElement("a")
      a.href = URL.createObjectURL(blob)
      a.download = `generated-image-${Date.now()}.png`
      a.click()
      URL.revokeObjectURL(a.href)
    } catch {
      // Fallback: open in new tab
      window.open(url, "_blank")
    }
  }

  if (error) {
    return (
      <div className={cn("rounded-xl border border-border bg-bg-secondary p-4", className)}>
        <p className="text-sm text-text-muted">Failed to load image</p>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-accent hover:underline mt-1 inline-block"
        >
          Open in new tab
        </a>
      </div>
    )
  }

  return (
    <div className={cn("rounded-xl border border-border overflow-hidden bg-bg-secondary", className)}>
      {/* Image */}
      <div className="relative">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-bg-tertiary">
            <Loader2 size={20} className="text-accent animate-spin" />
          </div>
        )}
        <img
          src={url}
          alt={alt || prompt || "Generated image"}
          onLoad={handleLoad}
          onError={handleError}
          className={cn(
            "w-full h-auto cursor-pointer transition-all duration-200",
            loading ? "opacity-0" : "opacity-100",
            zoomed && "scale-150 origin-center"
          )}
          onClick={() => setZoomed(!zoomed)}
        />
      </div>

      {/* Prompt & Actions */}
      <div className="flex items-center justify-between px-3 py-2 border-t border-border">
        <p className="text-[11px] text-text-muted truncate max-w-[70%]">
          {prompt || "Generated image"}
        </p>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setZoomed(!zoomed)}
            className="p-1.5 text-text-muted hover:text-text-primary transition-colors"
            title={zoomed ? "Zoom out" : "Zoom in"}
          >
            {zoomed ? <ZoomOut size={12} /> : <ZoomIn size={12} />}
          </button>
          <button
            onClick={handleDownload}
            className="p-1.5 text-text-muted hover:text-text-primary transition-colors"
            title="Download"
          >
            <Download size={12} />
          </button>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1.5 text-text-muted hover:text-text-primary transition-colors"
            title="Open full size"
          >
            <ExternalLink size={12} />
          </a>
        </div>
      </div>
    </div>
  )
}
