import { useEffect } from "react";
import { useFetcher } from "react-router";
import type { LibraryBook } from "../../../../shared/planner/books";
import type { BookActionResult, BookReadResult } from "../services/book-actions";

/**
 * Reads and changes bookmarks through book-owned resource routes.
 * @param book - The library book whose bookmarks are displayed.
 * @returns Bookmarks, write callbacks and request feedback.
 */
export function useBookmarks(book: LibraryBook) {
  const url = `/books/${book.library ?? "ebooks"}/${encodeURIComponent(book.path)}/bookmarks`;
  const reader = useFetcher<BookReadResult>();
  const writer = useFetcher<BookActionResult>();
  const { load } = reader;

  useEffect(function loadBookmarks() {
    void load(url);
  }, [url, load]);

  /**
   * Creates a bookmark at the current reader position.
   * @param position - The EPUB location to save.
   * @param label - The name displayed in the bookmark list.
   * @returns Nothing; resource revalidation refreshes the list.
   */
  function add(position: string, label: string) {
    writer.submit({ position, label }, { method: "post", action: url });
  }

  /**
   * Deletes a bookmark from its item URL.
   * @param id - The bookmark ID selected for removal.
   * @returns Nothing; resource revalidation refreshes the list.
   */
  function remove(id: string) {
    writer.submit(null, { method: "delete", action: `${url}/${encodeURIComponent(id)}` });
  }

  return {
    bookmarks: reader.data?.bookmarks ?? [],
    add, remove,
    error: writer.data?.error ?? reader.data?.error ?? "",
    busy: reader.state !== "idle" || writer.state !== "idle" || !reader.data,
  };
}
