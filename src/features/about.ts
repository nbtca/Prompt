import chalk from 'chalk';
import { APP_INFO, URLS } from '../config/data.js';
import { note } from '../core/components/note.js';
import { pickIcon } from '../core/icons.js';
import { padEndV } from '../core/text.js';
import { t } from '../i18n/index.js';

export function showAbout(): void {
  const trans = t();
  const row = (label: string, value: string) => `${chalk.dim(padEndV(label, 12))}${value}`;
  const link = (label: string, url: string) => row(label, chalk.cyan(url));
  const content = [
    row(trans.about.project, APP_INFO.name),
    row(trans.about.version, `v${APP_INFO.version}`),
    row(trans.about.description, trans.about.descriptionText),
    '',
    link(trans.about.github, APP_INFO.repository),
    link(trans.about.website, URLS.homepage),
    link(trans.about.email, URLS.email),
    '',
    row(trans.about.license, `MIT  ${pickIcon('·', '|')}  ${trans.about.author}: m1ngsama`),
  ].join('\n');

  note(content, trans.about.title);
}
