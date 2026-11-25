const READER_STATUSES = ["In Progress", "Completed"];

export function filterLibraryBooks(books, status = "All", query = "") {
  const normalizedQuery = String(query).trim().toLowerCase();
  const normalizedStatus = READER_STATUSES.includes(status) ? status : "All";

  return books.filter((book) => {
    const bookStatus = book.status || "Want to Read";
    const matchesStatus = normalizedStatus === "All" || bookStatus === normalizedStatus;
    const searchableText = `${book.title || ""} ${book.author || ""}`.toLowerCase();
    const matchesQuery = !normalizedQuery || searchableText.includes(normalizedQuery);
    return matchesStatus && matchesQuery;
  });
}

export function countLibraryBookStatuses(books) {
  return {
    All: books.length,
    "In Progress": books.filter((book) => (book.status || "Want to Read") === "In Progress").length,
    Completed: books.filter((book) => (book.status || "Want to Read") === "Completed").length,
  };
}
