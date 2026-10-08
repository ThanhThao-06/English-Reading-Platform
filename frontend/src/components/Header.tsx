import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import './Header.css';

export const Header: React.FC = () => {
  const location = useLocation();

  // A genre page is part of browsing the Library, so "Library" stays active there.
  const isLibraryActive =
    location.pathname === '/' ||
    location.pathname.startsWith('/genre/') ||
    location.pathname.startsWith('/article/') ||
    location.pathname.startsWith('/reader/');
  const isVocabActive = location.pathname === '/vocabulary';

  return (
    <header className="app-header">
      <div className="header-container">
        <Link to="/" className="header-brand" aria-label="English Reading Platform Home">
          <div className="brand-icon">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
              <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
            </svg>
          </div>
          <div className="brand-text">
            <span className="brand-title">English Reading Platform</span>
            <span className="brand-subtitle">Reading Library</span>
          </div>
        </Link>

        <nav className="header-nav" aria-label="Main Navigation">
          <Link
            to="/"
            className={`nav-link ${isLibraryActive && !isVocabActive ? 'active' : ''}`}
          >
            Library
          </Link>
          <Link
            to="/vocabulary"
            className={`nav-link ${isVocabActive ? 'active' : ''}`}
          >
            Vocabulary
          </Link>
        </nav>
      </div>
    </header>
  );
};
