BEGIN;

ALTER TABLE "bookmarks"
  RENAME CONSTRAINT "book_bookmarks_pkey" TO "bookmarks_pkey";

COMMIT;
