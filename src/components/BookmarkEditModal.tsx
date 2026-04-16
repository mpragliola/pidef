/**
 * BookmarkEditModal.tsx — modal dialog for editing a bookmark.
 *
 * Triggered by: double-tapping a BookmarkPill → BookmarkBar calls
 * `openBookmarkEdit(bm)` on AppContext → AppProvider sets `editingBookmark`.
 *
 * The modal renders only when `editingBookmark` is non-null (null render
 * pattern keeps it fully unmounted at rest, so no animation cleanup is
 * needed). It lets the user:
 *   - Rename the bookmark label
 *   - Toggle the "segue" flag (shows a ▶ indicator on the pill)
 *   - Delete the bookmark (with a native confirm() dialog)
 *   - Cancel without changes
 *
 * Closing the modal calls `closeBookmarkEdit()` which sets `editingBookmark`
 * back to null, unmounting this component.
 */

import React, { useState, useEffect, useRef } from 'react';
import { useAppContext } from '../AppContext';

/**
 * BookmarkEditModal displays an inline modal overlay for editing or deleting
 * the bookmark identified by `editingBookmark` in AppContext.
 *
 * It manages its own ephemeral local state (`label`, `segue`) that is
 * initialised from the bookmark being edited and discarded on close.
 */
export function BookmarkEditModal() {
  const { editingBookmark, closeBookmarkEdit, updateBookmark, removeBookmark } = useAppContext();
  const [label, setLabel] = useState('');
  const [segue, setSegue] = useState(false);
  const labelRef = useRef<HTMLInputElement>(null);

  /**
   * Sync local label/segue state whenever a different bookmark is opened for
   * editing. This also handles the initial open (editingBookmark goes from
   * null → non-null).
   *
   * The `setTimeout(0)` defers the focus call to the next macrotask so the
   * browser has had time to paint the input element into the DOM. Calling
   * `.focus()` synchronously inside useEffect sometimes finds the element
   * before it is visible and the focus has no effect.
   */
  useEffect(() => {
    if (editingBookmark) {
      setLabel(editingBookmark.label);
      setSegue(editingBookmark.segue ?? false);
      setTimeout(() => { labelRef.current?.focus(); labelRef.current?.select(); }, 0);
    }
  }, [editingBookmark]);

  /**
   * Escape-key handler to close the modal.
   *
   * This lives in its own useEffect (separate from the state-sync effect
   * above) for a clear separation of concerns: the state-sync effect is about
   * data initialisation, while this one is about imperative DOM event
   * registration. Keeping them separate also means each effect has a precise,
   * minimal dependency array and is easier to reason about independently.
   */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && editingBookmark) closeBookmarkEdit();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [editingBookmark, closeBookmarkEdit]);

  // Null render: keep the modal completely unmounted when there is nothing to
  // edit. This is cheaper than hiding it with CSS and avoids any risk of stale
  // local state leaking between editing sessions.
  if (!editingBookmark) return null;

  const handleDone = () => {
    const trimmed = label.trim();
    if (!trimmed) return;
    updateBookmark(editingBookmark.page, trimmed, segue);
    closeBookmarkEdit();
  };

  const handleDelete = () => {
    // `confirm()` is the native browser dialog — synchronous, no custom
    // styling, but reliable and accessible. Sufficient for a destructive
    // action that is infrequent.
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
