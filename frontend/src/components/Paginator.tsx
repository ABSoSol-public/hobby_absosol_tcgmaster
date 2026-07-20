import { useLanguage } from '../i18n';
import { Pagination } from '../types';

export default function Paginator({ p, onPage }: { p: Pagination; onPage: (page: number) => void }) {
  const { t, locale } = useLanguage();
  if (p.totalPages <= 1) return null;
  return (
    <div className="pagination">
      <button className="btn small" disabled={p.page <= 1} onClick={() => onPage(p.page - 1)}>{t('paginator_back')}</button>
      <span>{t('paginator_page')} {p.page} {t('paginator_of')} {p.totalPages} · {p.total.toLocaleString(locale)} {t('paginator_entries')}</span>
      <button className="btn small" disabled={p.page >= p.totalPages} onClick={() => onPage(p.page + 1)}>{t('paginator_next')}</button>
    </div>
  );
}
