// Retries a read once when the connection drops before a response arrives
// (e.g. Node reusing a keep-alive socket the server already closed).
// Writes are never retried, so a bill can't be saved twice.
export const fetchWithRetry: typeof fetch = async (input, init) => {
  try {
    return await fetch(input, init);
  } catch (error) {
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    if (method !== "GET" && method !== "HEAD") throw error;
    return fetch(input, init);
  }
};
