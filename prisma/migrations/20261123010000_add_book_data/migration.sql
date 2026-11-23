CREATE TABLE "book_data" (
    "library" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "storage_path" TEXT NOT NULL,
    "wikipedia" JSONB,
    "cover" BYTEA,
    "cover_type" TEXT,
    CONSTRAINT "book_data_pkey" PRIMARY KEY ("library", "path")
);

CREATE TABLE "book_bookmarks" (
    "id" TEXT NOT NULL,
    "library" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "position" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "book_bookmarks_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "book_bookmarks_library_path_idx" ON "book_bookmarks"("library", "path");
ALTER TABLE "book_bookmarks" ADD CONSTRAINT "book_bookmarks_library_path_fkey"
  FOREIGN KEY ("library", "path") REFERENCES "book_data"("library", "path")
  ON DELETE CASCADE ON UPDATE CASCADE;
