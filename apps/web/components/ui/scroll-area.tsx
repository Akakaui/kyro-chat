"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

const ScrollArea = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    orientation?: "vertical" | "horizontal"
  }
>(({ className, children, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("relative overflow-auto", className)}
    {...props}
  >
    {children}
  </div>
))
ScrollArea.displayName = "ScrollArea"

export { ScrollArea }
