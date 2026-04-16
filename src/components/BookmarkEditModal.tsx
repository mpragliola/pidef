import React, { useState, useEffect, useRef } from 'react';
import { useAppContext } from '../AppContext';

export function BookmarkEditModal() {
  const { editingBookmark, closeBookmarkEdit, updateBookmark, removeBookmark } = useAppContext();
  const [label, setLabel] = useState('');
  const [segue, setSegue] = useState(false);
  const labelRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingBookmark) {
      setLabel(editingBookmark.label);
      setSegue(editingBookmark.segue ?? false);
      setTimeout(() => { labelRef.current?.focus(); labelRef.current?.select(); }, 0);
    }
  }, [editingBookmark]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && editingBookmark) closeBookmarkEdit();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [editingBookmark, closeBookmarkEdit]);

  if (!editingBookmark) return null;

  const handleDone = () => {
    const trimmed = label.trim();
    if (!trimmed) return;
    updateBookmark(editingBookmark.page, trimmed, segue);
    closeBookmarkEdit();
  };

  const handleDelete = () => {
    if (confirm(`Delete bookmark "${editingBookmark.label}"?`)) {
      removeBookmark(editingBookmark.page);
      closeBookmarkEdit();
    }
  };

  return (
    <div id="bookmark-edit-modal">
      <div id="bookmark-modal-backdrop" onClick={closeBookmarkEdit} />
      <div id="bookmark-modal-content">
        <h2>Edit Bookmark</h2>
        <input
          ref={labelRef}
          type="text"
          id="bookmark-modal-label"
          placeholder="Bookmark label"
          value={label}
          onChange={e => setLabel(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleDone(); } }}
        />
        <label id="bookmark-segue-label">
          <input
            type="checkbox"
            id="bookmark-modal-segue"
            checked={segue}
            onChange={e => setSegue(e.target.checked)}
          />
          Mark as segue
        </label>
        <button id="bookmark-modal-delete" className="destructive" onClick={handleDelete}>
          Delete
        </button>
        <div id="bookmark-modal-buttons">
          <button id="bookmark-modal-cancel" onClick={closeBookmarkEdit}>Cancel</button>
          <button id="bookmark-modal-done" onClick={handleDone}>Done</button>
        </div>
      </div>
    </div>
  );
}
