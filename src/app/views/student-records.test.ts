import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AcademicTerm, AuthenticatedTransport } from '@nbtca/nbtcal/timetable';
import { StudentRecordsPanel } from './student-records.js';
import { renderStudentRecords } from '../../features/student-records-render.js';
import { stripAnsi, visualWidth } from '../../core/text.js';
import { setLanguage, t } from '../../i18n/index.js';
import type { AppContext } from '../view.js';

const terms: [AcademicTerm, AcademicTerm] = [
  {
    academicYear: '2026',
    semester: '3',
    academicYearLabel: '2026-2027',
    semesterLabel: '1',
    current: true,
  },
  {
    academicYear: '2025',
    semester: '12',
    academicYearLabel: '2025-2026',
    semesterLabel: '2',
    current: false,
  },
];
const term = terms[0];

function ctx() {
  return {
    size: { rows: 24, cols: 80 },
    bodyRows: 19,
    resetScroll: vi.fn(),
    rerender: vi.fn(),
    quit: vi.fn(),
    runClassic: vi.fn(),
  } satisfies AppContext;
}

afterEach(() => {
  setLanguage('en');
});

describe('student records panel', () => {
  it('queries another term without a timetable or first-week date', async () => {
    const transport = vi.fn<AuthenticatedTransport>((_url, init) => {
      const body = new URLSearchParams(init.body as string);
      return Promise.resolve(
        new Response(
          JSON.stringify({
            items: [{ xnm: body.get('xnm'), xqm: body.get('xqm'), kcmc: 'Algorithms', cj: '良好' }],
            currentPage: 1,
            totalPage: 1,
            totalResult: 1,
          }),
        ),
      );
    });
    const panel = new StudentRecordsPanel('grades', term, terms, transport, () => true, vi.fn());
    const context = ctx();
    await panel.load(context);
    expect(panel.render(context).join('\n')).toContain('Algorithms');
    panel.handleKey('s', context);
    expect(panel.capturesPageKeys()).toBe(true);
    panel.handleKey('\x1b[B', context);
    panel.handleKey('\r', context);
    await vi.waitFor(() => {
      expect(panel.isBusy()).toBe(false);
    });
    expect(new URLSearchParams(transport.mock.calls[1]?.[1].body as string).get('xnm')).toBe(
      '2025',
    );
    expect(panel.render(context).join('\n')).toContain('2025-2026');
    expect(panel.capturesPageKeys()).toBe(true);
  });

  it('keeps course selection, live search and detail navigation in the page', async () => {
    const transport: AuthenticatedTransport = () =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            items: Array.from({ length: 20 }, (_, i) => ({
              xnm: '2026',
              xqm: '3',
              kcmc: `Course ${i}`,
              kch: `CS${i}`,
              cj: i === 0 ? null : String(i),
            })),
            currentPage: 1,
            totalPage: 1,
            totalResult: 20,
          }),
        ),
      );
    const panel = new StudentRecordsPanel('grades', term, terms, transport, () => true, vi.fn());
    const context = ctx();
    await panel.load(context);
    panel.render(context);
    panel.handleKey('\x1b[6~', context);
    expect(panel.render(context).join('\n')).not.toContain('Course 0');
    panel.handleKey('\x1b[F', context);
    panel.handleKey('\r', context);
    expect(panel.capturesPageKeys()).toBe(false);
    expect(panel.render(context).join('\n')).toContain('CS19');
    expect(panel.shortcuts().some((item) => item.key === '/')).toBe(false);
    expect(panel.handleBack()).toBe(true);
    expect(panel.capturesPageKeys()).toBe(true);
    panel.handleKey('/', context);
    expect(panel.capturesInput()).toBe(true);
    expect(panel.acceptsActions()).toBe(false);
    panel.handleKey('CS19', context);
    expect(panel.render(context).join('\n')).toContain('1/1');
    panel.handleKey('\r', context);
    expect(panel.capturesInput()).toBe(false);
    panel.handleKey('/', context);
    panel.handleKey('gq123', context);
    expect(panel.render(context).join('\n')).toContain('gq123');
    expect(panel.handleBack()).toBe(true);
    expect(panel.render(context).join('\n')).toContain('/ CS19');
    expect(panel.handleBack()).toBe(true);
    panel.handleKey('f', context);
    expect(panel.render(context).join('\n')).toContain('1/1');
    expect(panel.render(context).join('\n')).toContain('Course 0');
    expect(panel.handleBack()).toBe(true);
    expect(panel.handleBack()).toBe(false);
    panel.dispose();
  });

  it('reuses the other view in memory and invalidates it when changing terms', async () => {
    const transport = vi.fn<AuthenticatedTransport>((url, init) => {
      const body = new URLSearchParams(init.body as string);
      return Promise.resolve(
        new Response(
          JSON.stringify({
            items: [
              {
                xnm: body.get('xnm'),
                xqm: body.get('xqm'),
                kcmc: url.pathname.includes('cjcx') ? 'Grade course' : 'Exam course',
                cj: '90',
              },
            ],
            currentPage: 1,
            totalPage: 1,
            totalResult: 1,
          }),
        ),
      );
    });
    const panel = new StudentRecordsPanel('grades', term, terms, transport, () => true, vi.fn());
    const context = ctx();
    await panel.load(context);
    panel.handleKey('\x1b[C', context);
    await vi.waitFor(() => {
      expect(panel.isBusy()).toBe(false);
    });
    expect(panel.kind).toBe('exams');
    panel.handleKey('\x1b[D', context);
    expect(panel.kind).toBe('grades');
    expect(transport).toHaveBeenCalledTimes(2);
    expect(panel.render(context).join('\n')).toContain('Grade course');
    panel.handleKey('s', context);
    panel.handleKey('\x1b[B', context);
    panel.handleKey('\r', context);
    await vi.waitFor(() => {
      expect(panel.isBusy()).toBe(false);
    });
    panel.handleKey('\x1b[C', context);
    await vi.waitFor(() => {
      expect(panel.isBusy()).toBe(false);
    });
    expect(transport).toHaveBeenCalledTimes(4);
    expect(new URLSearchParams(transport.mock.calls[3]?.[1].body as string).get('xnm')).toBe(
      '2025',
    );
    panel.dispose();
  });

  it('clears the previous term before a failed refresh', async () => {
    const transport = vi
      .fn<AuthenticatedTransport>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            items: [{ xnm: '2026', xqm: '3', kcmc: 'Algorithms', cj: '90' }],
            currentPage: 1,
            totalPage: 1,
            totalResult: 1,
          }),
        ),
      )
      .mockResolvedValueOnce(new Response('private marker', { status: 500 }));
    const panel = new StudentRecordsPanel('grades', term, terms, transport, () => true, vi.fn());
    const context = ctx();
    await panel.load(context);
    expect(panel.render(context).join('\n')).toContain('Algorithms');
    await panel.load(context);
    const out = panel.render(context).join('\n');
    expect(out).not.toMatch(/Algorithms|private marker/);
    expect(out).toContain(t().timetable.httpError);
  });

  it('aborts private queries when the panel is disposed', async () => {
    let signal: AbortSignal | null | undefined;
    const transport: AuthenticatedTransport = (_url, init) => {
      signal = init.signal;
      return new Promise((_resolve, reject) => {
        signal?.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'));
        });
      });
    };
    const panel = new StudentRecordsPanel('exams', term, terms, transport, () => true, vi.fn());
    const context = ctx();
    const request = panel.load(context);
    panel.dispose();
    await request;
    expect(signal?.aborted).toBe(true);
    expect(context.rerender).toHaveBeenCalledOnce();
  });

  it('requests login again after the session expires', async () => {
    const expired = vi.fn();
    const panel = new StudentRecordsPanel(
      'exams',
      term,
      terms,
      () => Promise.resolve(new Response(null, { status: 401 })),
      () => true,
      expired,
    );
    await panel.load(ctx());
    expect(expired).toHaveBeenCalledOnce();
  });

  it('returns from the term picker before leaving the results', () => {
    const panel = new StudentRecordsPanel(
      'exams',
      term,
      terms,
      () => Promise.resolve(new Response()),
      () => true,
      vi.fn(),
    );
    panel.handleKey('s', ctx());
    expect(panel.handleBack()).toBe(true);
    expect(panel.handleBack()).toBe(false);
  });
});

describe('student records rendering', () => {
  it.each(['en', 'zh'] as const)('keeps %s records readable at twenty columns', (language) => {
    setLanguage(language);
    const lines = renderStudentRecords(
      {
        kind: 'grades',
        term,
        fetchedAt: new Date(),
        items: [
          {
            courseCode: 'COURSE-A',
            courseName: 'Algorithms and data structures',
            grade: '0',
            credits: 2.5,
            gradePoint: 0,
            courseNature: null,
            examNature: null,
            remark: null,
            voided: true,
          },
        ],
      },
      term,
      20,
    );
    expect(lines.every((line) => visualWidth(line) <= 20)).toBe(true);
    const text = lines.map(stripAnsi).join('').replace(/\s/g, '');
    expect(text).toContain('Algorithmsanddatastructures');
    expect(text).not.toContain(t().records.notPublished.replace(/\s/g, ''));
  });

  it.each(['exams', 'grades'] as const)(
    'distinguishes unpublished %s from a failed request',
    (kind) => {
      const lines = renderStudentRecords({ kind, term, fetchedAt: new Date(), items: [] }, term);
      expect(lines.join('\n')).toContain(
        kind === 'exams' ? t().records.noExams : t().records.noGrades,
      );
    },
  );
});
