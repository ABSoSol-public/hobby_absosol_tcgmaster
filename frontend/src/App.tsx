import { useState } from 'react';
import { NavLink, Route, Routes } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import CardsPage from './pages/CardsPage';
import CardDetailPage from './pages/CardDetailPage';
import SetsPage from './pages/SetsPage';
import SetDetailPage from './pages/SetDetailPage';
import CollectionPage from './pages/CollectionPage';
import DecksPage from './pages/DecksPage';
import DeckBuilderPage from './pages/DeckBuilderPage';
import GlossaryPage from './pages/GlossaryPage';
import { useAuth } from './auth';
import { useGame } from './game';
import { useLanguage } from './i18n';

export default function App() {
  const { lang, setLang, t } = useLanguage();
  const { game, setGame, games } = useGame();
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  // Umschaltbar sind Spiele mit importiertem Katalog; das aktive ist immer dabei.
  const selectable = games.filter((g) => g.active || g.cardCount > 0 || g.code === game);

  return (
    <>
      <header className="topbar">
        <span className="logo">⬢ TCG Collection</span>
        <button className="hamburger" aria-label="Menu" onClick={() => setMenuOpen((v) => !v)}>☰</button>
        <div className={menuOpen ? 'topbar-collapse open' : 'topbar-collapse'}>
          <nav onClick={() => setMenuOpen(false)}>
            <NavLink to="/" end>{t('nav_dashboard')}</NavLink>
            <NavLink to="/cards">{t('nav_cards')}</NavLink>
            <NavLink to="/sets">{t('nav_sets')}</NavLink>
            <NavLink to="/decks">{t('nav_decks')}</NavLink>
            <NavLink to="/collection">{t('nav_collection')}</NavLink>
            <NavLink to="/glossary">{t('nav_glossary')}</NavLink>
          </nav>
          <div className="topbar-right">
            <select className="game-select" value={game} onChange={(e) => setGame(e.target.value)}>
              {selectable.length === 0 && <option value={game}>{game}</option>}
              {selectable.map((g) => (
                <option key={g.code} value={g.code}>{g.name}</option>
              ))}
            </select>
            <div className="lang-switch">
              <button className={lang === 'de' ? 'active' : ''} onClick={() => setLang('de')}>DE</button>
              <button className={lang === 'en' ? 'active' : ''} onClick={() => setLang('en')}>EN</button>
            </div>
            <span className="muted user-chip">
              {user.username}
              {user.role === 'viewer' && <span className="badge-viewer">{t('auth_role_viewer')}</span>}
            </span>
            <button className="btn small" onClick={logout}>{t('auth_logout')}</button>
          </div>
        </div>
      </header>
      <main className="page">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/cards" element={<CardsPage />} />
          <Route path="/cards/:id" element={<CardDetailPage />} />
          <Route path="/sets" element={<SetsPage />} />
          <Route path="/sets/:id" element={<SetDetailPage />} />
          <Route path="/decks" element={<DecksPage />} />
          <Route path="/decks/:id" element={<DeckBuilderPage />} />
          <Route path="/collection" element={<CollectionPage />} />
          <Route path="/glossary" element={<GlossaryPage />} />
        </Routes>
      </main>
    </>
  );
}
