"use client"

import { useState } from "react"
import { Send } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"

interface QuestionOption {
  label: string
  value: string
}

interface QuestionFormProps {
  questionId: string
  question: string
  type: "single_choice" | "multiple_choice" | "free_text" | "confirm"
  options?: QuestionOption[]
  required?: boolean
  onAnswer: (questionId: string, answer: string | string[]) => void
  disabled?: boolean
}

export function QuestionForm({
  questionId,
  question,
  type,
  options = [],
  required = true,
  onAnswer,
  disabled = false,
}: QuestionFormProps) {
  const [selectedSingle, setSelectedSingle] = useState<string>("")
  const [selectedMultiple, setSelectedMultiple] = useState<string[]>([])
  const [freeText, setFreeText] = useState("")

  const handleSubmit = () => {
    if (disabled) return

    switch (type) {
      case "single_choice":
        if (selectedSingle) {
          onAnswer(questionId, selectedSingle)
        }
        break
      case "multiple_choice":
        onAnswer(questionId, selectedMultiple)
        break
      case "free_text":
        if (freeText.trim() || !required) {
          onAnswer(questionId, freeText)
        }
        break
    }
  }

  const canSubmit = () => {
    if (disabled) return false
    switch (type) {
      case "single_choice":
        return !!selectedSingle
      case "multiple_choice":
        return !required || selectedMultiple.length > 0
      case "free_text":
        return !required || freeText.trim().length > 0
      case "confirm":
        return true
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey && canSubmit()) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const toggleMultiple = (value: string) => {
    setSelectedMultiple((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]
    )
  }

  return (
    <div className="mt-2 w-full max-w-sm overflow-hidden rounded-xl border border-border bg-bg-secondary/80">
      {/* Question */}
      <div className="px-3 pt-3 pb-2">
        <p className="text-sm font-medium text-text-primary">{question}</p>
      </div>

      {/* Single choice */}
      {type === "single_choice" && (
        <div className="space-y-1 px-3 pb-3">
          {options.map((option) => (
            <label
              key={option.value}
              className={cn(
                "flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                selectedSingle === option.value
                  ? "bg-accent/10 text-accent"
                  : "text-text-secondary hover:bg-bg-tertiary"
              )}
            >
              <input
                type="radio"
                name={`question-${questionId}`}
                value={option.value}
                checked={selectedSingle === option.value}
                onChange={() => setSelectedSingle(option.value)}
                disabled={disabled}
                className="sr-only"
              />
              <div
                className={cn(
                  "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
                  selectedSingle === option.value
                    ? "border-accent"
                    : "border-text-muted"
                )}
              >
                {selectedSingle === option.value && (
                  <div className="h-2 w-2 rounded-full bg-accent" />
                )}
              </div>
              <span>{option.label}</span>
            </label>
          ))}
        </div>
      )}

      {/* Multiple choice */}
      {type === "multiple_choice" && (
        <div className="space-y-1 px-3 pb-3">
          {options.map((option) => {
            const isSelected = selectedMultiple.includes(option.value)
            return (
              <label
                key={option.value}
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                  isSelected ? "bg-accent/10 text-accent" : "text-text-secondary hover:bg-bg-tertiary"
                )}
              >
                <input
                  type="checkbox"
                  value={option.value}
                  checked={isSelected}
                  onChange={() => toggleMultiple(option.value)}
                  disabled={disabled}
                  className="sr-only"
                />
                <div
                  className={cn(
                    "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                    isSelected ? "border-accent bg-accent" : "border-text-muted"
                  )}
                >
                  {isSelected && (
                    <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                <span>{option.label}</span>
              </label>
            )
          })}
        </div>
      )}

      {/* Free text */}
      {type === "free_text" && (
        <div className="px-3 pb-3">
          <Textarea
            value={freeText}
            onChange={(e) => setFreeText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type your answer..."
            rows={3}
            disabled={disabled}
            className="resize-none text-sm"
          />
        </div>
      )}

      {/* Confirm (yes/no) */}
      {type === "confirm" && (
        <div className="flex gap-2 px-3 pb-3">
          <Button
            size="sm"
            variant="outline"
            onClick={() => onAnswer(questionId, "yes")}
            disabled={disabled}
            className="flex-1"
          >
            Yes
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onAnswer(questionId, "no")}
            disabled={disabled}
            className="flex-1"
          >
            No
          </Button>
        </div>
      )}

      {/* Submit button */}
      {type !== "free_text" && type !== "confirm" && (
        <div className="border-t border-border/60 px-3 py-2">
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={!canSubmit()}
            className="w-full gap-1.5"
          >
            <Send size={12} />
            Submit
          </Button>
        </div>
      )}
    </div>
  )
}
