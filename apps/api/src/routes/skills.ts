import { Hono } from 'hono';
import { getDb } from '../db/init.js';
import { parseSkillMarkdown, skillToMarkdown, matchSkills, fillSkillVariables } from '../agent/skills.js';
import type { Skill } from '../agent/skills.js';

export const skillRoutes = new Hono();

// Create skill from markdown with frontmatter
skillRoutes.post('/', async (c) => {
  const user = c.get('user');
  const { markdown, name, description, content, triggers, variables } = await c.req.json();
  const id = crypto.randomUUID();

  let skillData: Omit<Skill, 'id' | 'userId' | 'createdAt' | 'updatedAt'>;

  if (markdown) {
    // Parse from markdown with frontmatter
    skillData = parseSkillMarkdown(markdown);
  } else {
    // Direct creation
    skillData = {
      name: name || 'Untitled Skill',
      description: description || '',
      content: content || '',
      triggers,
      variables,
    };
  }

  const db = getDb();
  await db.prepare(`
    INSERT INTO skills (id, user_id, name, description, content, triggers, variables, is_builtin)
    VALUES (?, ?, ?, ?, ?, ?, ?, 0)
  `).run(
    id,
    user.id,
    skillData.name,
    skillData.description,
    skillData.content,
    JSON.stringify(skillData.triggers || []),
    JSON.stringify(skillData.variables || [])
  );

  return c.json({ id, name: skillData.name });
});

// List skills
skillRoutes.get('/', async (c) => {
  const user = c.get('user');
  const db = getDb();

  const skills = await db.prepare(`
    SELECT id, name, description, is_builtin, triggers, created_at
    FROM skills WHERE user_id = ?
    ORDER BY created_at DESC
  `).all(user.id);

  return c.json({ skills });
});

// Get skill content (with parsed frontmatter)
skillRoutes.get('/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const db = getDb();

  const skill = await db.prepare(`
    SELECT * FROM skills WHERE id = ? AND user_id = ?
  `).get(id, user.id) as any;

  if (!skill) return c.json({ error: 'Not found' }, 404);

  // Parse triggers and variables from JSON
  let triggers: string[] = [];
  let variables: any[] = [];

  try {
    triggers = JSON.parse(skill.triggers || '[]');
  } catch {}
  try {
    variables = JSON.parse(skill.variables || '[]');
  } catch {}

  return c.json({
    skill: {
      ...skill,
      triggers,
      variables,
      markdown: skillToMarkdown({
        id: skill.id,
        name: skill.name,
        description: skill.description,
        content: skill.content,
        triggers,
        variables,
        userId: skill.user_id,
        createdAt: skill.created_at,
        updatedAt: skill.updated_at,
      }),
    },
  });
});

// Update skill
skillRoutes.put('/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const { markdown, name, description, content, triggers, variables } = await c.req.json();

  let skillData: Omit<Skill, 'id' | 'userId' | 'createdAt' | 'updatedAt'>;

  if (markdown) {
    skillData = parseSkillMarkdown(markdown);
  } else {
    skillData = {
      name: name || 'Untitled Skill',
      description: description || '',
      content: content || '',
      triggers,
      variables,
    };
  }

  const db = getDb();
  await db.prepare(`
    UPDATE skills
    SET name = ?, description = ?, content = ?, triggers = ?, variables = ?, updated_at = unixepoch()
    WHERE id = ? AND user_id = ? AND is_builtin = 0
  `).run(
    skillData.name,
    skillData.description,
    skillData.content,
    JSON.stringify(skillData.triggers || []),
    JSON.stringify(skillData.variables || []),
    id,
    user.id
  );

  return c.json({ success: true });
});

// Delete skill
skillRoutes.delete('/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const db = getDb();

  await db.prepare(`
    DELETE FROM skills WHERE id = ? AND user_id = ? AND is_builtin = 0
  `).run(id, user.id);
  return c.json({ success: true });
});

// Match skills against a message (for agent context injection)
skillRoutes.post('/match', async (c) => {
  const user = c.get('user');
  const { message } = await c.req.json();
  const db = getDb();

  const skills = await db.prepare(`
    SELECT * FROM skills WHERE user_id = ?
  `).all(user.id) as Skill[];

  // Parse triggers from JSON strings
  const parsedSkills = skills.map(s => ({
    ...s,
    triggers: JSON.parse((s as any).triggers || '[]'),
    variables: JSON.parse((s as any).variables || '[]'),
  }));

  const matches = matchSkills(message, parsedSkills);

  // Fill variables for top matches
  const results = matches.map(match => ({
    skill: {
      id: match.skill.id,
      name: match.skill.name,
      description: match.skill.description,
      content: match.skill.content,
    },
    confidence: match.confidence,
    matchedTriggers: match.matchedTriggers,
    variables: fillSkillVariables(match.skill, message),
  }));

  return c.json({ matches: results });
});

// Export skill as .md file
skillRoutes.get('/:id/export', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const db = getDb();

  const skill = await db.prepare(`
    SELECT * FROM skills WHERE id = ? AND user_id = ?
  `).get(id, user.id) as any;

  if (!skill) return c.json({ error: 'Not found' }, 404);

  const triggers = JSON.parse(skill.triggers || '[]');
  const variables = JSON.parse(skill.variables || '[]');

  const markdown = skillToMarkdown({
    id: skill.id,
    name: skill.name,
    description: skill.description,
    content: skill.content,
    triggers,
    variables,
    userId: skill.user_id,
    createdAt: skill.created_at,
    updatedAt: skill.updated_at,
  });

  return c.json({ markdown, filename: `${skill.name.toLowerCase().replace(/\s+/g, '-')}.md` });
});
