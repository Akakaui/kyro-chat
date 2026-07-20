import { z } from 'zod';
import { registerTool } from './registry.js';

/**
 * Question option for single/multiple choice questions
 */
interface QuestionOption {
  label: string;
  value: string;
}

/**
 * Registered question pending responses
 */
const pendingQuestions = new Map<string, {
  resolve: (answer: string | string[]) => void;
  reject: (error: Error) => void;
  question: string;
  type: string;
}>();

/**
 * Resolve a pending question with user answer
 */
export function resolveQuestion(questionId: string, answer: string | string[]): boolean {
  const pending = pendingQuestions.get(questionId);
  if (!pending) return false;
  pending.resolve(answer);
  pendingQuestions.delete(questionId);
  return true;
}

/**
 * Cancel a pending question
 */
export function cancelQuestion(questionId: string): boolean {
  const pending = pendingQuestions.get(questionId);
  if (!pending) return false;
  pending.reject(new Error('Question cancelled'));
  pendingQuestions.delete(questionId);
  return true;
}

/**
 * Register the ask_question tool for agents
 */
export function registerQuestionTool(): void {
  registerTool({
    name: 'ask_question',
    description: 'Ask the user a structured question to gather input. Supports single choice, multiple choice, or free text input.',
    category: 'agent',
    parameters: z.object({
      question: z.string().describe('The question to ask the user'),
      type: z.enum(['single_choice', 'multiple_choice', 'free_text'])
        .describe('Type of question: single_choice (radio), multiple_choice (checkbox), or free_text (textarea)'),
      options: z.array(z.object({
        label: z.string().describe('Display label for the option'),
        value: z.string().describe('Value returned when selected'),
      })).optional()
        .describe('Options for single_choice or multiple_choice types'),
      required: z.boolean().optional()
        .describe('Whether an answer is required (default: true)'),
    }),
    execute: async (args, ctx) => {
      const question = args.question as string;
      const type = args.type as 'single_choice' | 'multiple_choice' | 'free_text';
      const options = args.options as QuestionOption[] | undefined;
      const required = args.required !== false;

      // Validate options for choice types
      if ((type === 'single_choice' || type === 'multiple_choice') && (!options || options.length === 0)) {
        return { error: 'Options are required for choice-type questions' };
      }

      // Generate unique question ID
      const questionId = `q-${crypto.randomUUID()}`;

      // Create promise for answer
      const answer = await new Promise<string | string[]>((resolve, reject) => {
        pendingQuestions.set(questionId, {
          resolve,
          reject,
          question,
          type,
        });

        // Timeout after 5 minutes
        setTimeout(() => {
          if (pendingQuestions.has(questionId)) {
            pendingQuestions.delete(questionId);
            if (required) {
              reject(new Error('Question timed out'));
            } else {
              resolve(type === 'multiple_choice' ? [] : '');
            }
          }
        }, 5 * 60 * 1000);
      });

      return {
        questionId,
        question,
        type,
        options,
        answer,
        required,
      };
    },
  });
}

// Initialize on import
registerQuestionTool();
