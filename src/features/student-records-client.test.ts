import { describe, expect, it } from 'vitest';
import { createStudentRecordsClient } from './student-records-client.js';
import { JWXT_ORIGIN } from '../config/campus.js';

describe('student records terminal boundary', () => {
  it.each(['exams', 'grades'] as const)(
    'sanitizes %s strings before JSON or interactive display',
    async (kind) => {
      const client = createStudentRecordsClient(
        () =>
          Promise.resolve(
            new Response(
              JSON.stringify({
                items: [
                  {
                    xnm: '2026',
                    xqm: '3',
                    kcmc: 'Algorithms\u001b[2J\nforged',
                    cj: '\u001b]52;c;secret\u0007Pass',
                    kssj: '2026-12-10(09:00-11:00)',
                    cdmc: '\u001b]52;c;secret\u0007A101',
                    xm: 'Synthetic Student',
                    xh: 'SYNTHETIC-ID',
                  },
                ],
                currentPage: 1,
                totalPage: 1,
                totalResult: 1,
              }),
            ),
          ),
        JWXT_ORIGIN,
      );
      const data = await client.fetchRecords(kind, { academicYear: '2026', semester: '3' });
      expect(data.items[0]?.courseName).toBe('Algorithms forged');
      expect(JSON.stringify(data)).not.toMatch(/secret|\\u001b|SYNTHETIC-ID|Synthetic Student/);
      if (data.kind === 'exams')
        expect(data.items[0]?.start).toEqual(new Date('2026-12-10T01:00:00Z'));
      else expect(data.items[0]?.grade).toBe('Pass');
    },
  );
});
