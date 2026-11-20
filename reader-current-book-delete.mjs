export async function deletePersonalBookSafely({
  uid,
  bookId,
  runTransaction,
  ref,
  set,
}) {
  const selectedBookPath = `users/${uid}/readerProfile/currentlyReadingBookId`;
  const personalBookPath = `users/${uid}/library/${bookId}`;
  await runTransaction(
    ref(selectedBookPath),
    currentBookId => currentBookId === bookId ? "" : undefined,
    { applyLocally: false },
  );
  await set(ref(personalBookPath), null);
}
