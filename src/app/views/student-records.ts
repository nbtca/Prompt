import type { AcademicTerm, AuthenticatedTransport } from '@nbtca/nbtcal/timetable';
import { JWXT_ORIGIN } from '../../config/campus.js';
import { loadingLines } from '../../core/components/spinner.js';
import { wrapAnsiWithIndent } from '../../core/text.js';
import {
  isSessionExpired,
  safeMessage,
  displaySemesterLabel,
} from '../../features/student-timetable.js';
import {
  createStudentRecordsClient,
  type StudentRecords,
  type StudentRecordsKind,
} from '../../features/student-records-client.js';
import { renderStudentRecords } from '../../features/student-records-render.js';
import { t } from '../../i18n/index.js';
import { ListField, computeMaxVisible, renderListFieldWithContext } from '../fields/list-field.js';
import type { AppContext } from '../view.js';

export class StudentRecordsPanel {
  private data: StudentRecords | undefined;
  private error: string | undefined;
  private termsField: ListField | undefined;
  private controller: AbortController | undefined;
  private pending = false;

  constructor(
    readonly kind: StudentRecordsKind,
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
    this.termsField = undefined;
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
    this.termsField = undefined;
  }

  isBusy(): boolean {
    return this.pending;
  }

  capturesPageKeys(): boolean {
    return this.termsField !== undefined;
  }

  handleBack(): boolean {
    if (!this.termsField) return false;
    this.termsField = undefined;
    return true;
  }

  shortcuts(): readonly { key: string; label: string }[] {
    return this.pending || this.termsField
      ? []
      : [
          { key: 's', label: t().records.switchTerm },
          { key: 'r', label: t().records.refresh },
          { key: 'x', label: t().timetable.hubLogout },
        ];
  }

  render(ctx: AppContext): string[] {
    if (this.termsField) {
      this.termsField.setMaxVisible(computeMaxVisible(ctx.bodyRows));
      return renderListFieldWithContext([], this.termsField, ctx.bodyRows, ctx.size.cols);
    }
    if (this.pending) return loadingLines(t().common.loading, ctx.size.cols);
    const lines = this.data
      ? renderStudentRecords(this.data, this.term, ctx.size.cols)
      : wrapAnsiWithIndent(this.error ?? t().timetable.genericError, ctx.size.cols, '  ');
    return [
      ...lines,
      '',
      ...wrapAnsiWithIndent(
        `[s] ${t().records.switchTerm} · [r] ${t().records.refresh} · [x] ${t().timetable.hubLogout}`,
        ctx.size.cols,
        '  ',
      ),
    ];
  }

  handleKey(key: string, ctx: AppContext): void {
    if (this.termsField) {
      const result = this.termsField.handleKey(key);
      if (result.cancelled || result.selected === '__back__') {
        this.termsField = undefined;
      } else if (result.selected) {
        const term = this.catalog.find(
          (candidate) => `${candidate.academicYear}:${candidate.semester}` === result.selected,
        );
        if (term) {
          this.term = term;
          void this.load(ctx);
        }
      }
      return;
    }
    if (this.pending) return;
    if (key === 'r') void this.load(ctx);
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
    }
  }
}
