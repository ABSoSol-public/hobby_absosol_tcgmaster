import { FormEvent, useState } from 'react';
import { api } from '../api';
import { useLanguage } from '../i18n';
import { AuthUser } from '../types';

interface Props {
  onLoggedIn: (user: AuthUser) => void;
}

export default function LoginPage({ onLoggedIn }: Props) {
  const { t } = useLanguage();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api.login(username, password);
      onLoggedIn(res.data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-screen">
      <form className="modal login-panel" onSubmit={onSubmit}>
        <span className="logo">⬢ TCG Collection</span>
        <h3>{t('auth_login_title')}</h3>
        {error && <div className="error-banner">{error}</div>}
        <label>
          {t('auth_username')}
          <input
            type="text"
            autoFocus
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </label>
        <label>
          {t('auth_password')}
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <div className="actions">
          <button type="submit" className="btn primary" disabled={busy || !username || !password}>
            {busy ? t('auth_logging_in') : t('auth_login_button')}
          </button>
        </div>
      </form>
    </div>
  );
}
