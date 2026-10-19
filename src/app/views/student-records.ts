import type { AcademicTerm, AuthenticatedTransport } from '@nbtca/nbtcal/timetable';
import type { StudentRecordsKind, StudentRecords } from '@nbtca/nbtcal/academic';
import { JWXT_ORIGIN } from '../../config/campus.js';
import { wrapAnsiWithIndent } from '../../core/text.js';
import { space, type, glyph } from '../../core/theme.js';
import { setVimKeysActive } from '../../core/vim-keys.js';
import {
  isSessionExpired,
  safeMessage,
  displaySemesterLabel,
} from '../../features/student-timetable.js';
import { createStudentRecordsClient } from '../../features/student-records-client.js';
import { t } from '../../i18n/index.js';
import { ListField, computeMaxVisible, renderListFieldWithContext } from '../fields/list-field.js';
import { TextField } from '../fields/text-field.js';
import { fitFooterHint, passiveFooterHint } from '../chrome.js';
import {
  renderStudentRecordsPanel,
  renderStudentRecordDetail,
  visibleStudentRecords,
} from './student-records-render.js';
import type { AppContext } from '../view.js';

export class StudentRecordsPanel {
  private data: StudentRecords | undefined;
  private error: string | undefined;
  private termsField: ListField | undefined;
  private searchField: TextField | undefined;
  private previousQuery = '';
  private query = '';
  private attention = false;
  private selected = 0;
  private pageSize = 1;
  private detailIndex: number | undefined;
  private controller: AbortController | undefined;
  private pending = false;
  private readonly results = new Map<StudentRecordsKind, StudentRecords>();

  constructor(
    public kind: StudentRecordsKind,
    private term: AcademicTerm,
    private readonly catalog: readonly AcademicTerm[],
    private readonly transport: AuthenticatedTransport,
    private readonly isActive: () => boolean,
    private readonly onSessionExpired: () => void,
  ) {}

  async load(ctx: AppContext): Promise<void> {
    this.controller?.abort();
    const controller = new AbortController();
    this.controller = controller;
    const signal = ctx.signal
      ? AbortSignal.any([ctx.signal, controller.signal])
      : controller.signal;
    this.pending = true;
    this.error = undefined;
    this.data = undefined;
    this.results.delete(this.kind);
    this.termsField = undefined;
    this.detailIndex = undefined;
    ctx.resetScroll();
    ctx.rerender();
    try {
      const data = await createStudentRecordsClient(this.transport, JWXT_ORIGIN).fetchRecords(
        this.kind,
        this.term,
        signal,
      );
      if (signal.aborted || !this.isActive()) return;
      this.data = data;
      this.results.set(data.kind, data);
      const next =
        data.kind === 'exams'
          ? data.items.findIndex((exam) => exam.start && exam.end && exam.end > new Date())
          : -1;
      this.selected = Math.max(0, this.indices().indexOf(next));
    } catch (error) {
      if (signal.aborted || !this.isActive()) return;
      if (isSessionExpired(error)) this.onSessionExpired();
      else this.error = safeMessage(error);
    } finally {
      if (!signal.aborted && this.isActive()) {
        this.pending = false;
        ctx.rerender();
      }
    }
  }

  dispose(): void {
    this.controller?.abort();
    this.data = undefined;
    this.results.clear();
    this.termsField = undefined;
    this.searchField = undefined;
    this.query = '';
    setVimKeysActive(true);
  }

  isBusy(): boolean {
    return this.pending;
  }
  capturesInput(): boolean {
    return this.searchField !== undefined;
  }
  capturesPageKeys(): boolean {
    return this.detailIndex === undefined;
  }
  acceptsActions(): boolean {
    return !this.termsField && !this.searchField;
  }
  contextPath(): readonly string[] {
    return [
      t().records[this.kind],
      `${this.term.academicYearLabel} · ${displaySemesterLabel(this.term)}`,
    ];
  }

  footerHint(tabCount: number, cols: number): string {
    if (this.searchField)
      return fitFooterHint(
        cols,
        `${t().records.searchFooter} · Ctrl+C ${t().menu.hintQuit}`,
        'Enter · Esc · Ctrl+C',
        'Esc Ctrl+C',
      );
    if (this.pending) return passiveFooterHint(tabCount, cols);
    if (this.termsField || this.detailIndex !== undefined) return passiveFooterHint(tabCount, cols);
    const trans = t();
    return fitFooterHint(
      cols,
      `${glyph.updown()} ${trans.records.moveAction} · ${glyph.enter()} ${trans.records.detailAction} · ←→ ${trans.records.switchView} · Esc ${trans.menu.hintBack} · ? ${trans.help.title}`,
      `${glyph.updown()} ${glyph.enter()} ${trans.records.detailAction} · ←→ ${trans.records.switchView} · Esc · ?`,
      `${glyph.updown()} ${glyph.enter()} · ←→ · Esc · ?`,
      'Esc · ?',
    );
  }

  handleBack(): boolean {
    if (this.searchField) {
      this.query = this.previousQuery;
      this.searchField = undefined;
      this.selected = 0;
      setVimKeysActive(true);
      return true;
    }
    if (this.termsField) {
      this.termsField = undefined;
      return true;
    }
    if (this.detailIndex !== undefined) {
      this.detailIndex = undefined;
      return true;
    }
    if (this.query || this.attention) {
      this.query = '';
      this.attention = false;
      this.selected = 0;
      return true;
    }
    return false;
  }

  shortcuts(): readonly { key: string; label: string }[] {
    if (this.searchField || this.termsField) return [];
    if (this.pending)
      return [
        { key: '← →', label: t().records.switchView },
        { key: 'x', label: t().timetable.hubLogout },
      ];
    const trans = t();
    return [
      ...(this.detailIndex === undefined
        ? [
            { key: glyph.updown(), label: trans.records.moveAction },
            { key: glyph.enter(), label: trans.records.detailAction },
          ]
        : []),
      { key: '← →', label: trans.records.switchView },
      ...(this.detailIndex === undefined
        ? [
            { key: '/', label: trans.records.searchAction },
            {
              key: 'f',
              label:
                this.kind === 'exams'
                  ? trans.records.upcomingFilter
                  : trans.records.attentionFilter,
            },
          ]
        : []),
      { key: 's', label: trans.records.switchTerm },
      { key: 'r', label: trans.records.refresh },
      { key: 'x', label: trans.timetable.hubLogout },
    ];
  }

  render(ctx: AppContext): string[] {
    if (this.termsField) {
      this.termsField.setMaxVisible(computeMaxVisible(ctx.bodyRows));
      return renderListFieldWithContext([], this.termsField, ctx.bodyRows, ctx.size.cols);
    }
    if (this.detailIndex !== undefined && this.data) {
      const index = this.detailIndex;
      return [
        ...wrapAnsiWithIndent(type.hint(t().records.detailHint), ctx.size.cols, space.indent),
        '',
        ...renderStudentRecordDetail(
          this.data,
          index,
          Math.max(1, ctx.size.cols - 6),
          new Date(),
        ).map((line) => space.indent + line),
      ];
    }
    const rendered = renderStudentRecordsPanel(
      {
        kind: this.kind,
        term: this.term,
        data: this.data,
        pending: this.pending,
        error: this.error,
        selected: this.selected,
        query: this.query,
        attention: this.attention,
        searching: this.searchField !== undefined,
      },
      ctx.bodyRows,
      ctx.size.cols,
      new Date(),
    );
    this.pageSize = rendered.pageSize;
    return rendered.lines;
  }

  private indices(): number[] {
    return visibleStudentRecords(this.data, this.query, this.attention, new Date());
  }

  handleKey(key: string, ctx: AppContext): void {
    if (this.searchField) {
      const result = this.searchField.handleKey(key);
      this.query = this.searchField.currentValue;
      this.selected = 0;
      if (result.cancelled) this.handleBack();
      else if (result.submitted !== undefined) {
        this.searchField = undefined;
        setVimKeysActive(true);
      }
      return;
    }
    if (this.termsField) {
      const result = this.termsField.handleKey(key);
      if (result.cancelled || result.selected === '__back__') this.termsField = undefined;
      else if (result.selected) {
        const term = this.catalog.find(
          (candidate) => `${candidate.academicYear}:${candidate.semester}` === result.selected,
        );
        if (term) {
          this.term = term;
          this.results.clear();
          this.query = '';
          this.attention = false;
          this.selected = 0;
          void this.load(ctx);
        }
      }
      return;
    }
    if (key === '\x1b[C' || key === '\x1b[D') {
      this.controller?.abort();
      this.kind = this.kind === 'exams' ? 'grades' : 'exams';
      this.detailIndex = undefined;
      this.query = '';
      this.attention = false;
      this.selected = 0;
      this.error = undefined;
      ctx.resetScroll();
      const cached = this.results.get(this.kind);
      if (cached) {
        this.data = cached;
        this.pending = false;
      } else void this.load(ctx);
      return;
    }
    if (this.pending) return;
    if (key === 'r') {
      void this.load(ctx);
      return;
    }
    if (key === 's') {
      this.termsField = new ListField({
        title: t().records.switchTerm,
        options: [
          ...this.catalog.map((term) => ({
            value: `${term.academicYear}:${term.semester}`,
            label: `${term.academicYearLabel} · ${displaySemesterLabel(term)}`,
          })),
          { value: '__back__', label: t().common.back },
        ],
        initialIndex: Math.max(
          0,
          this.catalog.findIndex(
            (term) =>
              term.academicYear === this.term.academicYear && term.semester === this.term.semester,
          ),
        ),
      });
      ctx.resetScroll();
      return;
    }
    if (this.detailIndex !== undefined) return;
    if (key === '/') {
      this.previousQuery = this.query;
      this.searchField = new TextField({ message: t().records.searchPrompt, allowEmpty: true });
      this.query = '';
      this.selected = 0;
      setVimKeysActive(false);
      return;
    }
    if (key === 'f') {
      this.attention = !this.attention;
      this.selected = 0;
      return;
    }
    const count = this.indices().length;
    const last = Math.max(0, count - 1);
    this.selected = Math.min(last, this.selected);
    if (key === '\x1b[A') this.selected = Math.max(0, this.selected - 1);
    if (key === '\x1b[B') this.selected = Math.min(last, this.selected + 1);
    if (key === '\x1b[5~') this.selected = Math.max(0, this.selected - this.pageSize);
    if (key === '\x1b[6~' || key === ' ')
      this.selected = Math.min(last, this.selected + this.pageSize);
    if (key === '\x1b[H') this.selected = 0;
    if (key === '\x1b[F') this.selected = last;
    if ((key === '\r' || key === '\n') && count > 0) {
      this.detailIndex = this.indices()[this.selected];
      ctx.resetScroll();
    }
  }
}
