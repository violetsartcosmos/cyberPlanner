ALTER TABLE "book_data" ADD COLUMN "progress" TEXT, ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "book_aliases" (
  "library" TEXT NOT NULL,
  "path" TEXT NOT NULL,
  "alias" TEXT NOT NULL,
  CONSTRAINT "book_aliases_pkey" PRIMARY KEY ("library", "path", "alias"),
  CONSTRAINT "book_aliases_library_path_fkey" FOREIGN KEY ("library", "path")
    REFERENCES "book_data"("library", "path") ON DELETE CASCADE ON UPDATE CASCADE
);
