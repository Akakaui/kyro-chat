export interface Skill {
  id: string;
  name: string;
  description: string;
  content: string;
  triggers?: string[];
  variables?: SkillVariable[];
  userId?: string;
  createdAt: number;
  updatedAt: number;
}

export interface SkillVariable {
  name: string;
  description?: string;
  required?: boolean;
  default?: string;
}

export interface SkillMatch {
  skill: Skill;
  confidence: number;
  matchedTriggers: string[];
}

/**
 * Parse skill markdown with YAML frontmatter
 * Format:
 * ---
 * name: My Skill
 * description: Does something useful
 * triggers:
 *   - trigger word 1
 *   - trigger word 2
 * variables:
 *   - name: var1
 *     description: A variable
 *     required: true
 * ---
 * # Skill Content
 * Here is the skill content...
 */
export function parseSkillMarkdown(markdown: string): Omit<Skill, 'id' | 'userId' | 'createdAt' | 'updatedAt'> {
  const frontmatterRegex = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;
  const match = markdown.match(frontmatterRegex);

  if (!match) {
    // No frontmatter, treat entire content as skill body
    return {
      name: 'Untitled Skill',
      description: '',
      content: markdown.trim(),
    };
  }

  const [, yamlContent, body] = match;

  // Simple YAML parser for frontmatter
  const lines = yamlContent.split('\n');
  let name = '';
  let description = '';
  let triggers: string[] = [];
  let variables: SkillVariable[] = [];

  let currentArray: string[] | null = null;
  let currentObject: Record<string, any> | null = null;
  let currentObjectKey = '';

  for (const line of lines) {
    const trimmed = line.trim();

    // Key-value pairs
    const kvMatch = trimmed.match(/^(\w+):\s*(.*)$/);
    if (kvMatch) {
      const [, key, value] = kvMatch;

      // Handle array items (indented with -)
      if (currentArray && trimmed.startsWith('- ')) {
        currentArray.push(trimmed.slice(2).trim());
        continue;
      }

      // Handle object items (indented with -)
      if (currentObject && trimmed.startsWith('- ')) {
        const objItemMatch = trimmed.match(/^-\s+(\w+):\s*(.*)$/);
        if (objItemMatch && currentObject) {
          currentObject[objItemMatch[1]] = objItemMatch[2].trim();
        }
        continue;
      }

      // Reset current array/object context
      currentArray = null;
      currentObject = null;

      switch (key) {
        case 'name':
          name = value;
          break;
        case 'description':
          description = value;
          break;
        case 'triggers':
          currentArray = triggers;
          if (!value) triggers = currentArray;
          break;
        case 'variables':
          currentObject = {};
          currentObjectKey = '';
          break;
      }
    }

    // Array/object items
    if (trimmed.startsWith('- ')) {
      if (currentArray) {
        currentArray.push(trimmed.slice(2).trim());
      } else if (currentObject) {
        const objMatch = trimmed.match(/^-\s+(\w+):\s*(.*)$/);
        if (objMatch) {
          if (objMatch[1] === 'name') {
            variables.push({ name: objMatch[2].trim() });
          } else if (variables.length > 0) {
            const lastVar = variables[variables.length - 1];
            (lastVar as any)[objMatch[1]] = objMatch[2].trim();
          }
        }
      }
    }
  }

  return {
    name: name || 'Untitled Skill',
    description,
    content: body.trim(),
    triggers: triggers.length > 0 ? triggers : undefined,
    variables: variables.length > 0 ? variables : undefined,
  };
}

/**
 * Convert skill to frontmatter markdown for storage
 */
export function skillToMarkdown(skill: Skill): string {
  const frontmatter: string[] = ['---'];

  if (skill.name) frontmatter.push(`name: ${skill.name}`);
  if (skill.description) frontmatter.push(`description: ${skill.description}`);

  if (skill.triggers && skill.triggers.length > 0) {
    frontmatter.push('triggers:');
    skill.triggers.forEach(t => frontmatter.push(`  - ${t}`));
  }

  if (skill.variables && skill.variables.length > 0) {
    frontmatter.push('variables:');
    skill.variables.forEach(v => {
      frontmatter.push(`  - name: ${v.name}`);
      if (v.description) frontmatter.push(`    description: ${v.description}`);
      if (v.required) frontmatter.push(`    required: true`);
      if (v.default) frontmatter.push(`    default: ${v.default}`);
    });
  }

  frontmatter.push('---');
  frontmatter.push('');
  frontmatter.push(skill.content);

  return frontmatter.join('\n');
}

/**
 * Match a user message against skill triggers
 */
export function matchSkills(message: string, skills: Skill[]): SkillMatch[] {
  const lowerMessage = message.toLowerCase();
  const matches: SkillMatch[] = [];

  for (const skill of skills) {
    if (!skill.triggers || skill.triggers.length === 0) continue;

    const matchedTriggers: string[] = [];
    let totalScore = 0;

    for (const trigger of skill.triggers) {
      const lowerTrigger = trigger.toLowerCase();
      if (lowerMessage.includes(lowerTrigger)) {
        matchedTriggers.push(trigger);
        // Score based on trigger length relative to message
        totalScore += lowerTrigger.length / lowerMessage.length;
      }
    }

    if (matchedTriggers.length > 0) {
      matches.push({
        skill,
        confidence: Math.min(totalScore, 1),
        matchedTriggers,
      });
    }
  }

  return matches.sort((a, b) => b.confidence - a.confidence);
}

/**
 * Fill skill variables from message
 */
export function fillSkillVariables(skill: Skill, message: string): Record<string, string> {
  const vars: Record<string, string> = {};

  if (!skill.variables) return vars;

  for (const variable of skill.variables) {
    // Try to extract from message patterns like {{variable}} or variable:
    const patterns = [
      new RegExp(`${variable.name}[:\\s]+([^,\\n]+)`, 'i'),
      new RegExp(`\\{\\{${variable.name}\\}\\}`, 'g'),
    ];

    for (const pattern of patterns) {
      const match = message.match(pattern);
      if (match) {
        vars[variable.name] = match[1]?.trim() || match[0];
        break;
      }
    }

    // Use default if not found
    if (!vars[variable.name] && variable.default) {
      vars[variable.name] = variable.default;
    }
  }

  return vars;
}
