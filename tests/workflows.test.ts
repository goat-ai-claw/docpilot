import fs from 'fs';
import path from 'path';

describe('workflow definitions', () => {
  function collectIfBlocks(content: string) {
    const lines = content.split(/\r?\n/);
    const blocks: string[] = [];

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const match = line.match(/^(\s*)if:\s*(.*)$/);

      if (!match) {
        continue;
      }

      const [, indent, initialBody] = match;
      const blockLines = [initialBody];

      for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
        const nextLine = lines[cursor];
        const nextIndent = nextLine.match(/^(\s*)/)?.[1] ?? '';

        if (nextLine.trim() === '') {
          blockLines.push(nextLine.trim());
          continue;
        }

        if (nextIndent.length <= indent.length) {
          break;
        }

        blockLines.push(nextLine.trim());
      }

      blocks.push(blockLines.join('\n'));
    }

    return blocks;
  }

  it('does not reference secrets directly in if expressions', () => {
    const workflowsDir = path.join(__dirname, '..', '.github', 'workflows');
    const workflowFiles = fs.readdirSync(workflowsDir).filter((file) => file.endsWith('.yml'));

    const invalidReferences = workflowFiles.flatMap((file) => {
      const content = fs.readFileSync(path.join(workflowsDir, file), 'utf8');
      const ifBlocks = collectIfBlocks(content);

      return ifBlocks
        .filter((block) => block.includes('secrets.'))
        .map((block) => `${file}: ${block}`);
    });

    expect(invalidReferences).toEqual([]);
  });

  it('checks for OpenAI key availability via a dedicated step output', () => {
    const workflowsDir = path.join(__dirname, '..', '.github', 'workflows');

    for (const file of ['docpilot.yml', 'test.yml']) {
      const content = fs.readFileSync(path.join(workflowsDir, file), 'utf8');
      expect(content).toContain('id: openai-key');
      expect(content).toContain("steps.openai-key.outputs.present == 'true'");
    }
  });
});
