import React from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { ArticleDetail } from './pages/ArticleDetail';
import { GenreBrowse } from './pages/GenreBrowse';
import { Reader } from './pages/Reader';
import { ReadingLibrary } from './pages/ReadingLibrary';
import { Vocabulary } from './pages/Vocabulary';
import { VocabularyReview } from './pages/VocabularyReview';
import './App.css';

const App: React.FC = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<ReadingLibrary />} />
        {/* Every article of one genre, listed in full from "Explore by Genre". */}
        <Route path="/genre/:genre" element={<GenreBrowse />} />
        <Route path="/article/:id" element={<ArticleDetail />} />
        <Route path="/reader/:id" element={<Reader />} />
        {/* Single-chapter reader: renders only that chapter's paragraphs. */}
        <Route path="/reader/:id/chapter/:chapterId" element={<Reader />} />
        <Route path="/vocabulary" element={<Vocabulary />} />
        {/* Flashcard review session (Phase 2.4), reached from Personal Vocabulary. */}
        <Route path="/vocabulary/review" element={<VocabularyReview />} />
      </Routes>
    </BrowserRouter>
  );
};

export default App;