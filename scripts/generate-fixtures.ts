/**
 * Renders the demo product mockups into `public/fixtures/`.
 *
 * Run with `pnpm tsx scripts/generate-fixtures.ts`. The output is committed so
 * a fresh clone has the marketing and demo imagery without a build step.
 */
import 'dotenv/config';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { DEMO_ITEM_MOCKUPS, MOCKUP_ANGLES, renderMockupWebp } from '../prisma/fixtures/mockups';

async function main(): Promise<void> {
  const outputDir = path.join(process.cwd(), 'public', 'fixtures');
  await mkdir(outputDir, { recursive: true });

  for (const mockup of DEMO_ITEM_MOCKUPS) {
    for (const angle of MOCKUP_ANGLES) {
      const buffer = await renderMockupWebp({ ...mockup, angle });
      const filename = `${mockup.id}-${angle}.webp`;
      await writeFile(path.join(outputDir, filename), buffer);
      console.log(`wrote public/fixtures/${filename}`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
