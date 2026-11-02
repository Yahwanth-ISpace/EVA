export function aiServiceAuthHeaders(): Record<string, string> {
  const token = process.env.AI_SERVICE_TOKEN?.trim();
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}
